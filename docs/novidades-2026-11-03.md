# O que mudou em 03/11/2026 e onde encontrar cada coisa

Tudo isto já está no ar em furtherads.online (deploys de 03/11: `59c7211` e `d414af8`).
**Nada que envia mensagem sozinho está ligado**: cada recurso automático nasce desligado e você liga por restaurante.

Dois lugares do sistema aparecem neste guia:

- **Painel** = furtherads.online/painel (a tela de campanhas, com o menu à esquerda).
- **Balcão** = furtherads.online/balcao (o app da equipe do restaurante: Conversas, Funil, Agenda, Reservas).

---

## 1. Para ver resultado (Painel)

### Criativos que melhor performaram
**Painel → menu "Dashboard WhatsApp" → bloco "Anúncios que geram reserva"** (logo no topo da página, depois dos alertas).
Escolha o cliente e o período no topo da tela.

- **Por campanha:** conversas, reservas, investimento, custo por reserva e % de quem não veio.
- **Por anúncio:** qual criativo gera mais conversas e reservas, conversão e % de quem não veio.
- Selo **Escalar**: converte pelo menos 1,5× a média. Selo **Pausar?**: 10 ou mais conversas e nenhuma reserva. Só aparece com volume, é um sinal para olhar, não uma ordem.
- Só funciona com anúncios do Meta cuja origem foi identificada na conversa.

### Outras coisas na mesma página (Dashboard WhatsApp, de cima para baixo)
| Bloco | O que mostra |
|---|---|
| **Atenção nas campanhas** | Campanha que parou de gastar, gastou sem trazer conversa, ou ficou com custo por conversa 50% maior. Só aparece quando há alerta. |
| **Datas para planejar campanha** | Black Friday, Natal, Réveillon etc., com o dia ideal para começar a campanha e uma dica. |
| **Tempo de resposta** | Tempo típico da primeira resposta, % respondido em até 5 minutos e conversas sem resposta. |
| **Anúncios que geram reserva** | O ranking descrito acima. |

### Resumo do dono (novo)
**Painel → menu "Resumo do dono"**.
Números grandes (conversas, reservas, comparecimento, investimento, custo por reserva, vendas lançadas), com a variação contra o período anterior e frases em linguagem simples.
Abas: **Última semana**, **Este mês**, **Mês passado**. O botão **Imprimir / PDF** gera o relatório mensal (escolha "Salvar como PDF" na janela de impressão).

### Unidades (novo, só admin)
**Painel → menu "Unidades"**. Compara os restaurantes lado a lado.
Para agrupar: **Clientes → editar o cliente → campo "Grupo / rede"** (use o mesmo nome nos restaurantes do mesmo grupo).

### Implantação (novo, só admin)
**Painel → menu "Implantação"** (com o cliente selecionado no topo). Checklist do que já está pronto e do que falta, com botão **Abrir** para a tela certa.

### Conversão offline do Google (novo, só admin)
**Painel → "Links e Conversões" → bloco "Conversão offline do Google Ads"**.
Manda a venda real para o Google. Precisa criar no Google Ads uma ação de conversão do tipo *Importação de cliques*, colar o número dela aqui e ligar a chave. Não foi testada com o Google de verdade ainda.
Os envios aparecem no bloco **Disparos**, na mesma página.

---

## 2. Para a equipe do restaurante (Balcão)

### Reservas
**Balcão → Reservas.** Cada cartão de reserva agora pode mostrar:

- **Lembrete enviado** / **Confirmou presença**: o cliente respondeu SIM ao lembrete.
- **Nota N**: a nota que o cliente deu depois da visita.
- **★ n pts**: pontos do clube de fidelidade (só aparece quando o clube está ligado).
- **Comanda R$**: depois de marcar **Chegou**, aparece o campo para digitar o valor da comanda. Salvar vira uma venda, entra no retorno do investimento por campanha e, se configurado, vai para a Meta e para o Google. Editar o valor depois só atualiza a mesma venda.

### Conversas
**Balcão → Conversas.**

- **Ícone de pasta** ao lado do clipe: **arquivos salvos** (cardápio, mapa, tabela). Clique no arquivo para mandar para a conversa. Em "Salvar um arquivo novo" você guarda mais (até 30 por restaurante).
- Selo **Fora do horário** na lista: o cliente chamou fora do horário e ainda não foi respondido por uma pessoa.

### Onde se liga e se configura tudo: **Balcão → Reservas → botão "Configurar"**
De cima para baixo, os blocos novos são:

| Bloco | O que faz | Estado agora |
|---|---|---|
| **Respostas automáticas** | Cardápio, preços, horário, localização (já existia) | ligado no Malibu |
| **Perguntas frequentes do restaurante** | Palavras-chave → resposta (vegano, estacionamento, criança...). Até 20. | vazio |
| **Fora do horário de atendimento** | Responde 1 vez a cada 12h e marca a conversa. Janela configurável (padrão 23h às 10h). | desligado |
| **Clube de fidelidade** | +1 ponto por visita, meta e prêmio configuráveis, "pontos" devolve o saldo. | **desligado**, ligar só depois de combinar com o restaurante |
| **Lembrete, avaliação e resumo do dono** | Veja abaixo. | desligado |
| **Textos do robô** | Todos os textos editáveis (inclui os novos). | padrão |

O bloco **Lembrete, avaliação e resumo do dono** tem:

- **Lembrete antes da reserva**: manda uma mensagem N horas antes (padrão 3h, nunca antes das 8h) pedindo SIM para confirmar.
- **Pedir nota depois da visita**: nota 4 ou 5 recebe o link de avaliação do Google; nota 1 a 3 pede desculpa e chama a equipe. Vai para quem foi marcado como **Chegou** ou confirmou presença.
- **Link para avaliar no Google**: cole o link do restaurante.
- **Resumo da semana no WhatsApp do dono**: toda segunda, às 9h. Botão **"Enviar o resumo agora"** para testar (salve antes).
- **Lista de espera de vaga**: dia lotado, o cliente responde AVISAR e é chamado se abrir mesa (cancelamento ou mudança).
- **Alertas de campanha no WhatsApp da agência**: aviso diário, depois das 9h, para o número da agência.

---

## 3. Para ativar no Malibu (sugestão de ordem)

1. **Balcão → Reservas → Configurar.**
2. Preencher o **link de avaliação do Google** e o **WhatsApp do dono**.
3. Ligar **Resumo da semana** e clicar em **Enviar o resumo agora** para conferir o texto.
4. Ligar **Lembrete antes da reserva** e fazer um teste real com outro número.
5. Ligar **Pedir nota depois da visita**.
6. Preencher as **Perguntas frequentes** que o Malibu mais recebe e, se quiser, ligar **Fora do horário**.
7. Ligar **Lista de espera de vaga** e **Alertas** (com o WhatsApp da agência).
8. Pedir à equipe para marcar **Chegou / Não veio** e digitar a **comanda**: sem isso, comparecimento, avaliação e retorno do investimento ficam fracos. Na semana de 26/10 as duas reservas ficaram sem marcação.

Como esses recursos mandam mensagem sozinhos pelo WhatsApp conectado por QR code, vale observar de perto os primeiros dias.

---

## 4. O que ficou para depois

- Google Meu Negócio (posts, respostas a avaliações, ligações e rotas).
- Pedido de delivery pelo WhatsApp.
- Reativação de clientes, aniversário e disparos: só com a API oficial do WhatsApp.

---

## 5. Onde estão as alterações no código

| Commit | O que contém |
|---|---|
| `825f062` | Lembrete, avaliação pós-visita e resumo semanal do dono |
| `5219942` | Ranking de criativos, tempo de resposta, alertas, lista de espera de vaga, arquivos salvos |
| `d414af8` | Resumo do dono, comanda e retorno do investimento, Google offline, fora do horário, perguntas frequentes, implantação, unidades, datas sazonais, fidelidade |

O registro técnico completo, com decisões e pendências, está em `docs/diario.md` (entradas de 2026-11-03).

Para ver o que mudou em cada commit: `git show <commit> --stat`.

---

## 6. O que ainda não foi testado de verdade

- Envio real pelo WhatsApp de todos os recursos novos (os testes automáticos e a verificação no banco passaram).
- A conversão offline do Google contra o Google de verdade.
- A impressão em PDF do Resumo do dono e as telas novas em celular.
- Depois do deploy, confira no Balcão e em Chaves e APIs se o WhatsApp do Malibu e da Mercearia voltou como "Conectado". Se aparecer `standby`, reinicie o app no hPanel.
