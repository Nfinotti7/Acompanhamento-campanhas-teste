# Na Mesa — fila de espera de restaurante pelo WhatsApp (design)

Data: 2026-10-15
Status: aprovado em conversa (funcionamento e mensagens); parte técnica aguardando revisão.

## Objetivo

Um produto separado da dashboard, chamado **Na Mesa**, para organizar a fila de espera na porta de um restaurante. O primeiro cliente não é cliente de tráfego, então não deve ver dashboard nem CRM. O cliente final entra na fila lendo um QR code que abre o WhatsApp do restaurante. Um robô responde a posição e a espera e avisa nos momentos certos. A recepcionista controla tudo por uma tela no tablet.

O critério de sucesso é rodar numa noite real com o mínimo de peças: entrar pelo QR, ver a posição, receber "mesa pronta" e a recepcionista dar baixa sem travar.

## Fora do escopo (v1)

- Reserva com data e hora (fica para uma fase 2, se o restaurante pedir).
- Fila "de casa" (entrar antes de chegar).
- Página ou app público mostrando a fila.
- Integração com PDV ou mapa de mesas.
- Botões interativos do WhatsApp (o Baileys não suporta de forma confiável; tudo é texto).

## Decisões já tomadas com o usuário

- Só fila de espera na v1.
- Qualquer mensagem de quem está na fila recebe a posição e a espera na hora. Não precisa digitar 1, 2 ou 3.
- O robô avisa só em **marcos**, não a cada baixa, para não gerar centenas de mensagens por noite e não arriscar o número no Baileys. Os marcos são: entrou, faltam N grupos, mesa chamada e não compareceu.
- A tela é usada pela recepcionista. Ela pode chamar fora de ordem (ex.: mesa de 2 libera e ela pula para o grupo de 2).
- Referência de produto: Yelp Waitlist (espera estimada a partir de dado real).

## Como funciona

### Separação dos produtos

- `clients` ganha duas colunas: `dashboard_enabled BOOLEAN DEFAULT true` e `waitlist_enabled BOOLEAN DEFAULT false`. O restaurante novo fica com `dashboard_enabled=false, waitlist_enabled=true`. Um cliente da dashboard (ex.: Malibu) pode ligar a fila depois sem migrar nada.
- Clientes com `dashboard_enabled=false` não aparecem no seletor de clientes da dashboard nem na lista de restaurantes do `/caixa`. Eles continuam aparecendo na página de Clientes do admin, com um selo "Na Mesa" e as duas chaves editáveis.
- A conexão do WhatsApp (QR do Baileys) e o PIN continuam na página "Chaves e APIs" do admin, como hoje.
- A tela de login principal ganha um link "Acessar o Na Mesa", que leva para `/namesa`.

### Entrada na fila

1. O QR code da porta abre `https://wa.me/<número>?text=Quero entrar na fila (cód. FILA)`.
2. O robô reconhece a palavra `FILA` (sozinha ou como código, sem diferenciar maiúscula, minúscula ou acento) de quem **não** está numa fila ativa. Ele cria a entrada com status `awaiting_size` e pergunta: "Oi, {nome}! Pra quantas pessoas?". O nome vem do perfil do WhatsApp.
3. A resposta passa por `parsePartySize`. São aceitos "4", "somos 4", "4 pessoas", "quatro", "eu e mais 3" (= 4). Com um número válido de 1 a 30, a entrada vira `waiting` e o robô confirma com a posição e a espera. Sem número válido, ele pergunta de novo (no máximo 2 vezes; depois disso deixa a pessoa em `waiting` com tamanho 2 e avisa a recepcionista com uma marca de "conferir pessoas").

### Enquanto espera

- Qualquer mensagem de quem está em `waiting` responde com a posição e a espera.
- Quem está em `called` recebe a lembrança: "Sua mesa está pronta, é só ir até a recepção".
- "SAIR", "cancelar" ou "desistir" levam ao status `left` e o robô confirma.
- Quem não tem entrada ativa e não mandou `FILA` não recebe resposta nenhuma do robô. A conversa segue normal para atendimento humano.

### Marcos (mensagens automáticas)

| Marco | Gatilho | Texto padrão |
|---|---|---|
| Entrou | tamanho do grupo válido | "Pronto, {nome}! Você está na fila. Posição: {posicao}. Espera estimada: ~{espera} min. Mande qualquer mensagem pra ver sua posição, ou SAIR pra sair da fila." |
| Quase lá | a posição da pessoa chega a `near_threshold + 1` (padrão: faltam 2 grupos), uma vez por entrada | "Faltam {faltam} grupos na sua frente. Fique por perto!" |
| Chamado | recepcionista aperta "Chamar" | "{nome}, sua mesa está pronta! Dirija-se à recepção. Seguramos por {tolerancia} minutos." |
| Não veio | recepcionista aperta "Não veio" (a mensagem pode ser desligada) | "Como não te encontramos, liberamos a vaga. Se ainda quiser, mande FILA." |

Todos os textos ficam editáveis por restaurante, e `{nome}`, `{posicao}`, `{espera}`, `{faltam}` e `{tolerancia}` são substituídos na hora.

Um mesmo marco nunca é mandado duas vezes para a mesma entrada. "Sentou" e "Remover" não mandam mensagem.

### Posição e espera estimada

- **Posição:** 1 + o número de entradas `waiting` do mesmo restaurante com `joined_at` anterior. Entradas `called` não contam como "na frente". Se a recepcionista chamar alguém fora de ordem, a posição dos outros se recalcula sozinha.
- **Espera estimada:** `grupos_na_frente_incluindo_a_pessoa × intervalo`. O `intervalo` é a média de tempo entre as últimas baixas "sentou" das últimas 2 horas (pelo menos 3 baixas). Sem isso, usa `default_minutes_per_party` (padrão 8). O resultado é arredondado para múltiplos de 5 minutos, com mínimo de 5.

### Fila do dia

Só contam entradas criadas nas últimas 12 horas. Uma entrada `waiting` mais antiga que isso deixa de estar ativa (o robô passa a ignorá-la e ela não aparece na tela), e não precisa de rotina de limpeza.

### Tela da recepcionista (`/namesa`)

- Login: escolhe o restaurante (lista só quem tem `waitlist_enabled`) e digita o PIN. Usa o mesmo token de `staff` do `/caixa`, e a sessão fica no `localStorage` (`namesa_token`).
- **Aba Fila:**
  - Primeiro aparecem os chamados (com o tempo desde a chamada, em vermelho depois da tolerância) e depois os que estão esperando, na ordem.
  - Cada linha mostra nome, nº de pessoas, tempo esperando, origem (WhatsApp ou manual) e a marca "conferir pessoas" quando houver.
  - Botões por linha: **Chamar** (só em `waiting`), **Sentou**, **Não veio** e **Remover**. Nome e nº de pessoas são editáveis.
  - O botão **+ Adicionar** abre um formulário com nome, telefone e pessoas. Com telefone, o robô manda a mensagem "Entrou"; sem telefone, a entrada fica só na tela.
  - Topo com o resumo de hoje: entraram, sentaram, desistiram/não vieram e espera média.
  - Atualiza sozinha por SSE (`kind: 'waitlist'`). Toca um som quando alguém entra pelo WhatsApp.
- **Aba Configurar:**
  - Número do WhatsApp do restaurante (para o QR).
  - Minutos por grupo padrão, tolerância e quando avisar "faltam N".
  - Liga e desliga a mensagem de "Não veio".
  - Edição dos 4 textos.
  - Botão "Imprimir QR da porta", que abre uma página pronta para imprimir com o QR e o texto "Entre na fila pelo WhatsApp".

## Parte técnica

### Banco (bloco aditivo do `initDb()`)

```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dashboard_enabled BOOLEAN DEFAULT true;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS waitlist_settings (
  client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  whatsapp_number TEXT,
  default_minutes_per_party INTEGER DEFAULT 8,
  hold_minutes INTEGER DEFAULT 10,
  near_threshold INTEGER DEFAULT 2,
  notify_no_show BOOLEAN DEFAULT true,
  messages JSONB DEFAULT '{}'::jsonb,   -- sobrescreve os textos padrão por chave
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT,                -- wa_id; nulo para manual sem telefone
  party_size INTEGER,
  status TEXT NOT NULL CHECK (status IN ('awaiting_size','waiting','called','seated','no_show','left','removed')),
  source TEXT NOT NULL CHECK (source IN ('whatsapp','manual')),
  size_attempts INTEGER DEFAULT 0,
  needs_check BOOLEAN DEFAULT false,
  notified_near BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  called_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_waitlist_active ON waitlist_entries (client_id, status, joined_at);
```

### Backend

- **`services/waitlistText.js`** (puro, testado): `parsePartySize(text)`, `isJoinCommand(text)`, `isLeaveCommand(text)`, `renderMessage(template, vars)` e os textos padrão.
- **`services/waitlistQueue.js`** (testado com fake-db):
  - `getActiveEntries(db, clientId, now)`, `positionOf`, `estimateWait`.
  - Mudanças de status: `callEntry`, `seatEntry`, `noShowEntry`, `removeEntry`, `addManualEntry` e `updateEntry`.
  - Toda mudança termina em `afterQueueChange`, que confere quem cruzou o marco "quase lá" e manda o aviso uma única vez (`UPDATE ... SET notified_near = true WHERE notified_near = false RETURNING`, para nunca duplicar). Em seguida faz o `broadcast(clientId, 'waitlist', ...)`.
- **`services/waitlistBot.js`** (testado, com o envio injetado): `handleInboundForWaitlist({ clientId, contactId, waId, profileName, body })`. É a máquina de estados da conversa descrita acima. Não faz nada se `waitlist_enabled` for falso.
- **`services/whatsappSender.js`**: extrai de `replyToConversation` o "manda pelo Baileys ou pela Cloud API e grava a mensagem enviada" para uma função `sendToContact({ clientId, contactId, body })`. Ela é usada pelo `replyToConversation` existente (sem mudar o comportamento) e pelo robô. Assim as mensagens do robô aparecem no histórico normal da conversa.
- **Gancho:** `ingestWhatsAppEvent` chama `handleInboundForWaitlist` em segundo plano quando `direction === 'inbound'`, por injeção (`deps.onInbound`), e cobre tanto o Baileys quanto o webhook. Um erro no robô é registrado no log e não derruba o ingest.
- **CRM:** para clientes com `dashboard_enabled=false`, `ingestWhatsAppEvent` pula `moveToAutoStage` e `matchTrackingClick`.
- **Rotas** (`controllers/waitlistController.js`, montadas em `/api/waitlist`, aceitam admin e staff via `resolveClientId`):
  - `GET /` (fila ativa + resumo do dia)
  - `POST /` (adicionar manual)
  - `PATCH /:id` (nome e pessoas)
  - `POST /:id/call`, `/:id/seat`, `/:id/no-show`, `/:id/remove`
  - `GET` e `PUT /settings`
  - `GET /qr` (PNG do QR do `wa.me` gerado com a lib `qrcode`, que já é dependência)
- **Login:** `GET /api/staff/restaurants?product=waitlist` filtra por `waitlist_enabled`. Sem o parâmetro, o comportamento atual continua e passa a esconder quem tem `dashboard_enabled=false`.
- **Clientes:** `clientController` aceita e devolve `dashboard_enabled` e `waitlist_enabled`. Os seletores da dashboard filtram `dashboard_enabled`.

### Frontend

- `main.jsx`: `/namesa` → `NaMesaApp.jsx`.
- `NaMesaApp.jsx`: login (restaurante + PIN), abas Fila e Configurar e conexão SSE. Componentes em `components/namesa/` (`QueueList.jsx`, `AddEntryForm.jsx`, `WaitlistSettings.jsx`, `PrintQr.jsx`).
- Layout pensado para tablet: botões grandes e fonte grande, mas também funciona no celular.
- `LoginPage.jsx`: link "Acessar o Na Mesa".
- `ClientsPage.jsx`: selo e chaves para `dashboard_enabled` e `waitlist_enabled`.

### Tratamento de erro

- Se o WhatsApp está desconectado na hora de mandar um marco, o erro vai para o log e a tela mostra um aviso "WhatsApp desconectado: avisos não estão saindo" (a partir do status do Baileys). A ação da recepcionista (chamar, sentar) **sempre é gravada**, mesmo que a mensagem falhe.
- Duas recepcionistas apertando ao mesmo tempo: as transições usam `UPDATE ... WHERE status IN (...) RETURNING`, então a segunda vira nada em vez de duplicar a mensagem.
- A mesma pessoa manda `FILA` de novo já estando na fila: o robô só responde a posição e não cria uma segunda entrada.

### Testes

- `node --test` para `waitlistText`, `waitlistQueue` (posição, espera, marco sem duplicar, transições concorrentes) e `waitlistBot` (fluxo completo: FILA → tamanho inválido → tamanho válido → consulta → SAIR; quem não está na fila é ignorado).
- Manual: local contra o banco de produção com `BAILEYS_AUTOCONNECT=false`, simulando as mensagens recebidas por webhook assinado num cliente de teste. Depois do deploy, num teste real com o número do restaurante (ou do Malibu como cobaia, se o usuário preferir).

## Riscos conhecidos

- **Banimento no Baileys:** está mitigado pelos marcos e pelo fato de quase sempre o cliente mandar a primeira mensagem. A entrada manual com telefone é a exceção e deve ficar para uso pontual.
- **Número compartilhado:** o robô só age com `FILA` ou com uma entrada ativa. Uma frase como "tem fila hoje?" **não** ativa o robô, porque só conta `FILA` sozinha ou dentro de `(cód. FILA)`. Quem mandar só "fila" sem querer entra na fila. É aceitável na v1, e a recepcionista remove.
- **Espera estimada no começo da noite:** usa o padrão fixo até haver 3 baixas.
