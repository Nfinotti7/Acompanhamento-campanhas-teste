# Reservas pelo WhatsApp — design

Data: 2026-10-21. Primeiro cliente: **Malibu Sushibar** (`clients.id = 9`, WhatsApp via Baileys). Depois vale pros outros clientes de tráfego (Alma, Giulí, Recreio).

## Por que

O Malibu vai rodar anúncios de engajamento que abrem o WhatsApp (CTWA). No anúncio, a pessoa escolhe entre perguntas prontas: tirar dúvida, ver cardápio, ou **"Quero fazer uma reserva (cód. RESERVA)"**. Hoje essa conversa cai no Caixa e a equipe responde à mão. Queremos que um robô faça a reserva sozinho: pergunte pessoas, dia, horário e nome, veja se há mesa livre e grave na agenda.

O ganho principal não é só o atendimento automático. Como a conversa vem de anúncio e passa pelo CRM, **cada reserva fica ligada à campanha que a trouxe** e dispara o evento de agendamento pra Meta. Isso permite medir reservas e custo por reserva por campanha.

Por isso a reserva mora no **Caixa** (clientes com `dashboard_enabled`), não no Na Mesa. O motor de mesas fica num serviço separado da tela, pra poder ser ligado no Na Mesa depois.

## Metas

- Robô no WhatsApp que faz a reserva de ponta a ponta, só pra quem pediu (código RESERVA).
- Disponibilidade calculada a partir de mesas por tamanho, horários de funcionamento e reservas já feitas. Nunca aceitar mais reservas do que mesas.
- Tela **Reservas** no Caixa: ver o dia, lançar reserva manual (telefone/balcão), marcar chegou / não veio / cancelar, configurar tudo.
- Reserva confirmada move o card pra etapa "Agendado" e preenche a Agenda existente, reaproveitando o evento Meta que já existe.

## Fora do escopo (agora)

- Juntar mesas pra grupo grande.
- Sinal/pagamento (PIX).
- Página pública de reserva fora do WhatsApp.
- Reserva no Na Mesa.
- Mapa de mesas numeradas (o controle é por quantidade de cada tamanho, não por mesa específica).

## Anti-metas (seria fracasso mesmo funcionando)

- Robô atropelando quem veio tirar dúvida ou falar com a equipe.
- Overbooking: duas pessoas levando a última mesa ao mesmo tempo.
- Robô mandando mensagem demais e arriscando o número no Baileys. Ele só responde quem escreveu, e a única mensagem que ele manda sem a pessoa ter escrito é a de cancelamento pela equipe (e, na fase 2, um lembrete).
- Quebrar o CRM, a atribuição ou o Na Mesa que já estão no ar.

## Decisões do usuário

- **Mesas por tamanho, editáveis**, com um padrão do restaurante e a possibilidade de mudar por data (datas com menos disponibilidade). O sistema desconta o que já está reservado. Malibu começa com **2 mesas de 2, 2 de 4 e 2 de 6**.
- **Horários do Malibu:**
  - segunda a quinta: 17:00 às 23:30;
  - sexta, sábado e domingo: 12:00 às 15:30 e 18:00 às 23:30.
- Gatilho pelo **código RESERVA** na mensagem pronta do anúncio. A origem do lead continua vindo do cartão do anúncio (`externalAdReply`), não do código.
- Valores padrão propostos e não recusados (todos editáveis):
  - robô **confirma na hora**, sem aprovação da equipe;
  - mesa ocupada por **2h**;
  - tolerância de **15 min**;
  - reserva até **30 dias** pra frente e no mínimo **2h** antes do horário;
  - grupo acima da maior mesa (6) passa pra equipe.
- Plano B "toda conversa nova vinda de anúncio aciona o robô": existe como opção, **desligado** no Malibu.

## Decisões minhas (o usuário pode mudar)

- **Último horário de reserva = fechamento − 1h.** O Malibu fica com reservas de 30 em 30 min:
  - seg a qui: 17:00 a 22:30;
  - sex a dom: 12:00 a 14:30 e 18:00 a 22:30.

  Editável como "último horário" por turno.
- Intervalo entre horários: 30 min.
- Fuso: Brasília, tratado como UTC-3 fixo, igual ao relatório do Na Mesa. Horários gravados em `TIMESTAMPTZ`.
- Quem edita a configuração: admin e equipe no Caixa (mesmo critério das etapas do funil).

## Modelo de disponibilidade

Configuração por restaurante:

- `tables`: lista `{ seats, count }`, ex. `[{2,2},{4,2},{6,2}]`. Só as mesas liberadas pra reserva.
- `hours`: por dia da semana, lista de turnos `{ start, lastBooking }`, ex. sexta = `[{12:00,14:30},{18:00,22:30}]`. Dia sem turno = sem reserva.
- `exceptions`: por data, `{ date, tables? , closed? }`. Com `tables`, substitui o padrão só naquele dia. Com `closed`, não aceita reserva no dia.
- `duration_minutes` (120), `slot_minutes` (30), `hold_minutes` (15), `min_advance_minutes` (120), `max_advance_days` (30), `max_party` (padrão = maior mesa).

**Regra de vaga.** Uma reserva ocupa uma mesa de tamanho `table_seats` no intervalo `[início, início + duração)`. Pra um pedido de `n` pessoas às `t`:

1. Tamanhos candidatos: todos com `seats ≥ n`, do menor pro maior.
2. Pra cada tamanho, ocupadas = reservas ativas (confirmadas) desse tamanho cujo intervalo se sobrepõe a `[t, t + duração)`. Livres = mesas do dia − ocupadas.
3. Usa o primeiro tamanho com livre > 0. Se nenhum, o horário não tem vaga.

Um grupo de 3 ocupa uma mesa de 4. Se as de 4 acabaram, pode ir pra uma de 6.

**Concorrência.** A checagem e a gravação acontecem na mesma transação, com `pg_advisory_xact_lock` por cliente, pra duas reservas simultâneas nunca levarem a mesma última mesa. A segunda recebe "esse horário acabou de ser reservado" e a lista atualizada.

**Diminuir mesas com reserva já feita** não cancela ninguém. O dia fica sem vaga até sobrar mesa, e a tela avisa "acima do limite".

A lógica pura (horários do dia, vaga por horário, escolha do tamanho) fica num serviço sem banco, testado com `node --test`, no padrão de `waitlistQueue.js`/`waitlistReport.js`.

## Conversa do robô

**Gatilho:** só mensagem recebida, nova, de telefone (mesmos filtros do robô da fila em `whatsappIngest.js`), de cliente com reservas ligadas. Aciona quando:

- o texto tem `cód. RESERVA` (aceitar `cod`, `cód.`, maiúsculas/minúsculas, igual ao `FILA`), ou o texto é só "reserva"/"reservar";
- ou, se o plano B estiver ligado, é a primeira mensagem de um contato novo vindo de anúncio sem código. Nesse caso o robô pergunta antes: "Quer fazer uma reserva? Responda 1 pra reservar ou 2 pra falar com a equipe."

Fora disso o robô não fala. Quem já tem conversa de reserva em andamento continua nela.

**Passos** (cada um editável nos textos, com variáveis tipo `{nome}`):

1. **Pessoas:** "Olá, {nome}! Quer fazer uma reserva no {restaurante}? Pra quantas pessoas?". A leitura do número reaproveita `parsePartySize` de `waitlistText.js`. Acima de `max_party` → passa pra equipe.
2. **Dia:** "Pra qual dia? (ex: hoje, amanhã, sábado, 25/10)". Aceita hoje, amanhã, dia da semana (próxima ocorrência, contando hoje), "dia 25", 25/10 e 25/10/2026. Fora da janela de antecedência, ou dia fechado: explica e pergunta de novo.
3. **Horário:** lista numerada só dos horários **com vaga** pra esse tamanho de grupo, ex. "1) 19h 2) 19h30 3) 21h". Aceita o número da lista ou o horário escrito (19h, 19:30, 19h30). Sem nenhum horário no dia: oferece o próximo dia com vaga dentro de 7 dias.
4. **Nome:** "A reserva fica em nome de {nome}? Responda SIM ou mande outro nome." Sem nome de perfil: pede o nome.
5. **Confirmação:** resumo + "Responda SIM pra confirmar". No SIM, revalida a vaga dentro da transação e grava. Se a vaga acabou nesse meio-tempo, volta pro passo 3 com a lista nova.
6. **Confirmada:** "✅ Reserva confirmada: sábado 25/10, 19h30, 4 pessoas, em nome de Ana. A mesa fica guardada até 15 min depois do horário. Pra cancelar, responda CANCELAR."

Comportamentos gerais:

- **Não entendeu** a mesma etapa 2 vezes → texto neutro e pausa (ver "Pausa do robô" abaixo).
- **Atendente respondeu** o contato → robô pausa (ver "Pausa do robô" abaixo).
- **Sem resposta por 60 min** → a conversa de reserva expira em silêncio.
- **"cancelar"** durante a conversa → encerra sem reservar. Depois de confirmada, "cancelar" → "Quer cancelar a reserva de sábado 25/10, 19h30? Responda SIM." → cancela e libera a mesa. Com mais de uma reserva futura: lista numerada.
- **Depois de confirmada**, outras mensagens não acionam o robô (vão pra equipe), exceto CANCELAR e um novo código RESERVA (que começa outra reserva).
- O robô envia por `sendToContact` (`whatsappSender.js`), então as mensagens entram no histórico normal. Falha de envio só vai pro log, sem desfazer o que foi gravado (mesma regra do Na Mesa).

## Ligação com o CRM e a atribuição

Reserva confirmada (pelo robô ou manual com contato):

- `whatsapp_contacts.appointment_at` = início da próxima reserva ativa do contato. A Agenda atual, o Funil e o Dashboard continuam funcionando sem mudança. Cancelar recalcula (próxima ativa ou `NULL`).
- `moveToAutoStage(..., event: 'agendado')` move o card pra "Agendado" e dispara o evento Meta da etapa, se configurado.

Reserva manual sem WhatsApp (pessoa ligou) cria/acha o contato pelo telefone, igual à entrada manual do Na Mesa. A origem fica "não rastreada".

**Decisões minhas tomadas na revisão (o usuário pode mudar):**

- **A reserva é dona do agendamento quando `reservations_enabled`.** Nesses clientes, o "marcar agendamento" do painel do contato e da Agenda vira **"Nova reserva"** e abre o formulário de reserva. Assim não existe agendamento sem mesa descontada, e o recálculo de `appointment_at` não apaga nada. Pra clientes sem reservas, a Agenda continua igual.
- **Funil e evento Meta seguem as regras que já estão no ar:**
  - `moveToAutoStage('agendado')` a cada reserva confirmada;
  - o evento da etapa sai uma vez por contato, então a segunda reserva da mesma pessoa não manda outro Schedule;
  - reserva manual por telefone também move o card e dispara o evento, como já acontece hoje com o agendamento manual.
- **Cancelar, "não veio" e "chegou" não mexem no card nem mandam evento.** A equipe move se quiser. A venda lançada continua movendo pra "Compareceu", como hoje.
- **"Atendente respondeu"** = qualquer mensagem `outbound` pro contato que não foi enviada pelo robô, inclusive resposta pelo próprio celular. As mensagens do robô ganham uma marca (ex.: `whatsapp_messages.sent_by = 'bot_reserva'`), gravada pelo `sendToContact`. Assim o eco do Baileys não para o próprio robô. Um novo `cód. RESERVA` do mesmo contato reabre o robô, mas só depois que a pausa acabar.
- **Pausa do robô (pedido do usuário: o cliente não precisa saber que fala com um robô; quando o atendente responde, o robô pausa):**
  - Os textos nunca dizem que é robô ou assistente virtual. Antes de cada resposta, o robô mostra "digitando..." por 2 a 4 s (`sendPresenceUpdate('composing')` no Baileys). Isso deixa o ritmo humano e também reduz o risco pro número.
  - **Como reconhece o atendente:** toda mensagem enviada é gravada com `sent_by` (`bot_reserva` | `staff`). O robô gera o id da mensagem antes de enviar (opção `messageId` do `sendMessage` do Baileys) e já grava esse id como dele. Assim, o eco que o Baileys devolve como `outbound` é reconhecido como do robô. Se o Baileys não aceitar o id próprio, a alternativa é uma lista em memória de "envios do robô em andamento" por contato, consultada no ingest. **Toda `outbound` sem marca do robô é atendente**: resposta pelo Caixa (`replyToConversation`, `sent_by = 'staff'`) ou pelo celular/WhatsApp Web (eco do Baileys).
  - **O que a pausa faz:** grava `whatsapp_contacts.bot_paused_until = agora + 12h` e encerra a reserva em rascunho do contato (status `handed_off`). Durante a pausa o robô não responde nada a esse contato, nem CANCELAR (a equipe está conversando e resolve). A pausa é renovada a cada nova mensagem do atendente. Um `cód. RESERVA` novo **durante** a pausa também não religa o robô, porque a pessoa está com a equipe. Depois da pausa, sim.
  - **Corrida:** o robô confere a pausa logo antes de enviar, depois do "digitando...". Se o atendente respondeu nesse meio-tempo, o robô não envia.
  - **Na tela do Caixa:** a conversa mostra o selo "Robô atendendo" enquanto há reserva em rascunho, com o botão **Pausar robô** (pausa na hora, pra quem quer assumir antes de digitar). Durante a pausa, mostra **Retomar robô**, que zera a pausa mas não recria o rascunho: a próxima mensagem com código começa de novo.
  - **Quando o robô não entende** (2 tentativas na mesma etapa) ou o grupo é grande demais, ele manda um texto neutro ("Só um instante, já te respondo 🙂"), pausa a si mesmo e a conversa fica destacada no Caixa como **"Precisa de atendimento"**, com som. Sem mencionar robô nem "vou chamar a equipe".
- **CANCELAR depois de confirmada:** vale enquanto houver reserva confirmada que ainda não começou. Só aciona se a mensagem inteira for "cancelar", "cancela" ou "cancelar reserva" (com pontuação). Frases comuns com a palavra no meio vão pra equipe.

## Dados

Aditivo em `initDb()`, como o resto do projeto:

- `clients.reservations_enabled BOOLEAN DEFAULT false`.
- `reservation_settings` (1 por cliente): tabelas padrão (JSONB), horários (JSONB), exceções (JSONB ou tabela própria, à escolha de quem implementa), os números da seção de disponibilidade, `ad_fallback BOOLEAN DEFAULT false`, `messages JSONB`.
- `reservations`:
  - `client_id`, `contact_id` (`ON DELETE SET NULL`), `name`, `phone`;
  - `party_size`, `table_seats`, `starts_at TIMESTAMPTZ`, `ends_at TIMESTAMPTZ`;
  - `status`: `draft` | `confirmed` | `cancelled` | `arrived` | `no_show` | `expired`;
  - `step` (passo do robô quando draft), `attempts`, rascunhos de dia/horário/nome;
  - `source`: `whatsapp` | `manual`;
  - `created_at`, `updated_at`, `cancelled_by` (`client` | `staff`).
  - Índice único parcial: no máximo um `draft` por contato.
  - Ocupação conta `confirmed` e `arrived`.

Sem rotina de limpeza: reserva é histórico (diferente da fila).

## API

Rotas `/api/reservations*`, abertas pra staff e admin com `resolveClientId`, conferindo `reservations_enabled`:

- `GET /api/reservations?day=YYYY-MM-DD`: reservas do dia + ocupação por horário e tamanho.
- `GET /api/reservations/availability?day=&party=`: horários com vaga (usado no formulário manual).
- `POST /api/reservations`: reserva manual. Permite forçar acima do limite com `force: true` e aviso na tela.
- `PATCH /api/reservations/:id`: editar pessoas, horário, nome.
- `POST /api/reservations/:id/arrived|no-show|cancel`. Cancelar pela equipe manda a mensagem de cancelamento (texto editável; dá pra desmarcar o envio).
- `GET`/`PUT /api/reservations/settings`.
- Evento SSE nomeado `reservation` pra tela atualizar ao vivo.

## Tela no Caixa

Item novo **Reservas** no rail (PC/tablet) e nas abas (celular), ao lado da Agenda. A Agenda continua como está.

- **Dia:** seletor de data (hoje em destaque). Lista por horário com nome, pessoas, tamanho da mesa, origem (selo "Anúncio · nome da campanha" quando houver) e status.
- **Ações:** Chegou / Não veio / Cancelar / Editar. Tocar abre o `ContactDetailPanel` do contato.
- **Ocupação:** por turno, quantas mesas de cada tamanho estão livres em cada horário. Barra simples, não um mapa.
- **+ Reserva** manual: nome, telefone, pessoas, dia, horário (só os com vaga, mais "outro horário" com aviso).
- **Configurar:** mesas padrão, exceções por data, horários por dia da semana, os números, textos do robô, robô ligado/desligado e plano B.
- Segue o padrão visual atual: tema claro/escuro por variáveis, sem cor fixa (trava `noHardcodedColors.test.js`), `ResponsiveTable`/`Sheet` no celular.

## Fases

**Fase 1, pra rodar no Malibu:**

- dados e configuração;
- motor de vaga testado;
- robô;
- tela Reservas com reserva manual e configurar;
- ligação com Agenda, Funil e evento Meta;
- ligar o Malibu com 2/2/2 e os horários acima.

**Fase 2:**

- lembrete único ~3h antes, com "responda CANCELAR";
- "não veio" automático depois da tolerância, como sugestão na tela;
- reservas e custo por reserva por campanha no Dashboard WhatsApp;
- relatório por dia.

## Operação e riscos

- **Deploy fora do horário de serviço do Malibu.** O deploy reinicia o Baileys e já deixou a conexão em `standby` 3 vezes. Se aparecer standby, reiniciar o app no hPanel. Resolver isso de vez segue como prioridade no diário.
- Atribuição pelo cartão do anúncio via Baileys ainda não foi validada com clique real. Os anúncios do Malibu entram no ar hoje (21/10) à noite: conferir a aba Origem das primeiras conversas.
- Até o robô estar no ar, as mensagens com código RESERVA caem no Caixa e a equipe responde à mão.
- Na Cloud API (outros clientes no futuro), o robô só responde dentro da janela de 24h, e o cancelamento pela equipe fora dela falha. O Malibu é Baileys.

## Deixado pra quem implementa

- Formato exato das tabelas de configuração (JSONB × tabelas próprias).
- Textos finais das mensagens (seguindo o tom do Na Mesa).
- Layout da barra de ocupação.
- Como reaproveitar `parsePartySize`, `firstName` e `renderMessage` de `waitlistText.js` sem acoplar reserva ao Na Mesa (mover pra um módulo comum é aceitável).
