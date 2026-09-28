# WhatsApp Conversion Tracking & ROI Real — Design

**Data:** 2026-09-28
**Status:** Aprovado, pronto para plano de implementação

## Contexto

O sistema Further Ads já rastreia gasto e conversões *reportadas pela plataforma*
(Google/Meta) para cada cliente (restaurantes cadastrados como `clients`). O que falta
é ligar o clique no anúncio a uma **conversão real e verificável**: alguém clica num
anúncio Meta pra falar no WhatsApp, e depois vai fisicamente ao restaurante e gasta
dinheiro. Hoje não existe nenhuma ponte entre "clicou no anúncio" e "gastou X reais na
mesa" — o ROI mostrado no dashboard é sempre o estimado pela plataforma de anúncios,
nunca o valor real que entrou no caixa.

Este documento cobre a primeira fatia desse problema, decidida em conversa com o
cliente (dono da agência): **Click-to-WhatsApp do Meta + conversão offline lançada
pelo caixa do restaurante**. Duas outras frentes foram mencionadas mas ficam para depois
e não fazem parte deste design: rastreio de conversão vinda direto do card do Google
(call/message assets) e envio de eventos de volta pra Meta via Conversions API.

## Objetivo

1. Saber, por cliente (restaurante), quais conversas de WhatsApp começaram a partir de
   um clique em anúncio Meta (Click-to-WhatsApp Ads).
2. Medir o tempo de resposta da equipe (tipo Tintim): quanto tempo entre a primeira
   mensagem do cliente e a primeira resposta da equipe.
3. Permitir que o caixa do restaurante, ao fechar a conta, lance nome + valor gasto e
   vincule isso à conversa de WhatsApp correspondente (quando existir).
4. Calcular ROI real: gasto em anúncio (já coletado hoje) vs. soma do que essas pessoas
   de fato gastaram no salão — não o número estimado pela Meta.

## Restrição inegociável

**Nada do que já está em produção pode quebrar.** Clientes reais já usam o dashboard
hoje. Este projeto é tratado como um módulo novo e isolado: tabelas novas (nenhuma
tabela existente tem sua estrutura alterada), rotas novas, telas novas. O único ponto
de contato com o código existente é reaproveitar o padrão de multi-tenant (`client_id`)
e a mesma tela de dashboard para navegação — nada além disso é tocado.

## Decisões já validadas com o cliente

- **WhatsApp Business Cloud API oficial** (não o app comum) — é a única forma de
  capturar o `ctwa_clid` (o identificador que liga o clique no anúncio à conversa) e o
  tempo de resposta automaticamente.
- **Número novo e dedicado** para os anúncios — o cliente vai comprar um chip novo. O
  número atual do restaurante continua livre no app comum, sem qualquer mudança.
  (Restrição técnica da própria Meta: um número não pode estar ao mesmo tempo na Cloud
  API e no app/WhatsApp Web/desktop — por isso a decisão de usar um número novo em vez
  de migrar o existente.)
- **Custo Meta**: mensagens de atendimento normal (reativas) são gratuitas desde
  nov/2024; conversas iniciadas por Click-to-WhatsApp Ads têm uma janela de 72h
  totalmente gratuita. Cobrança só existe se o restaurante disparar *templates* de
  marketing/utilidade fora dessa janela — não é o caso do fluxo desenhado aqui. Ir
  direto na Cloud API (sem um BSP como Twilio/360dialog) evita qualquer mensalidade de
  terceiro.
- **Construído dentro do próprio sistema** (não uma ferramenta de inbox de terceiro
  tipo Chatwoot) — v1 enxuta: só texto, sem mídia/templates automáticos. Justificativa:
  o valor principal é o dado unificado de ROI num lugar só; o volume de conversa de
  restaurante não justifica uma ferramenta de atendimento robusta agora.
- **Multi-tenant desde o início** — 4 restaurantes entram esta semana. O módulo segue o
  mesmo isolamento por `client_id` que já existe em todo o sistema.
- **Acesso da equipe do salão**: garçom anota nome + valor da mesa e passa pro caixa
  verbalmente. **Só o caixa acessa o sistema** — não existe tela separada pro garçom.
  O caixa usa uma rota própria, protegida por **PIN por restaurante** (não login
  individual por funcionário), busca pelo **nome OU telefone** (a API do WhatsApp
  sempre entrega os dois, mesmo pra contato não salvo) e lança o valor.
- **Quem responde a conversa no WhatsApp** (antes do cliente chegar ao restaurante)
  varia por restaurante — por isso a caixa de entrada fica acessível tanto pelo login
  normal (`admin`/`client`) quanto pela sessão de PIN. Cada restaurante decide
  internamente quem usa.
- **Acesso do dono do restaurante e do admin da agência**: reaproveita o login que já
  existe, sem nada novo. A aba de Caixa de Entrada entra no menu principal do mesmo
  jeito que Remarketing e Tracking hoje — visível pra `admin` e `client`. O admin
  continua trocando de cliente pelo seletor que já existe no Navbar (mesmo padrão
  usado no dashboard) e vê o inbox do restaurante selecionado; o `client` só vê o
  próprio, porque já é limitado ao seu `client_id`.

## Arquitetura

### Dados (tabelas novas — nenhuma tabela existente muda de estrutura)

```
whatsapp_settings
  id SERIAL PRIMARY KEY
  client_id INTEGER NOT NULL, UNIQUE
  phone_number_id TEXT NOT NULL       -- ID do número na Cloud API (Meta)
  waba_id TEXT NOT NULL               -- WhatsApp Business Account ID
  access_token TEXT NOT NULL          -- token da Cloud API (armazenado como as outras credenciais)
  verify_token TEXT NOT NULL          -- usado no handshake do webhook
  staff_pin_hash TEXT NOT NULL        -- PIN do caixa, hasheado (bcrypt, mesmo padrão de senha de usuário)
  display_phone_number TEXT           -- número formatado, só pra exibição na UI
  created_at, updated_at
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

whatsapp_contacts
  id SERIAL PRIMARY KEY
  client_id INTEGER NOT NULL
  wa_id TEXT NOT NULL                 -- telefone completo (formato WhatsApp)
  profile_name TEXT                   -- nome de exibição do WhatsApp (vem automático, mesmo sem estar salvo)
  ctwa_clid TEXT                      -- presente só quando a conversa nasceu de um anúncio
  ad_id TEXT
  ad_headline TEXT
  ad_body TEXT
  source TEXT DEFAULT 'organic'       -- 'ad' | 'organic'
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  last_message_at TIMESTAMP
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  UNIQUE(client_id, wa_id)

whatsapp_messages
  id SERIAL PRIMARY KEY
  client_id INTEGER NOT NULL
  contact_id INTEGER NOT NULL
  direction TEXT CHECK(direction IN ('inbound', 'outbound')) NOT NULL
  body TEXT
  wa_message_id TEXT                  -- id da mensagem na Meta (evita duplicidade em reentrega de webhook)
  sent_at TIMESTAMP NOT NULL
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id) ON DELETE CASCADE
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE

real_conversions
  id SERIAL PRIMARY KEY
  client_id INTEGER NOT NULL
  contact_id INTEGER                  -- nullable: pode não achar conversa correspondente
  customer_name TEXT NOT NULL
  phone TEXT
  amount_spent REAL NOT NULL
  matched_by TEXT CHECK(matched_by IN ('phone', 'name', 'manual')) NOT NULL
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id) ON DELETE SET NULL
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
```

Todas criadas via `CREATE TABLE IF NOT EXISTS`, no mesmo bloco de `initDb()`, seguindo
exatamente o padrão já usado pelas tabelas existentes — mesma convenção de
`SERIAL PRIMARY KEY`, `FOREIGN KEY ... ON DELETE CASCADE`, etc. Nenhum `ALTER TABLE`
em tabela existente é necessário.

### Backend

Um controller novo, `whatsappController.js`, e rotas novas em `server.js` (só adições,
nenhuma rota existente muda):

- `GET/POST /api/v1/whatsapp/webhook` — público (chamado pela Meta). `GET` faz o
  handshake de verificação exigido pela Cloud API; `POST` recebe os eventos de mensagem.
  Identifica o restaurante pelo `phone_number_id` do payload (consulta
  `whatsapp_settings`), grava/atualiza `whatsapp_contacts` (capturando `ctwa_clid` e
  dados do anúncio quando presentes no campo `referral`) e insere a mensagem em
  `whatsapp_messages`.
- `GET /api/staff/restaurants` — público, lista `{id, name}` dos clientes ativos, só
  pra popular o seletor de restaurante em `/caixa` (nenhum dado sensível).
- `POST /api/staff/login` — recebe `client_id` + PIN, valida contra `staff_pin_hash`,
  devolve um token JWT de curta duração com `role: 'staff'` e `client_id` fixo.
- Middleware novo `authenticateStaffOrClient` — aceita token normal (admin/client) OU
  token de staff; token de staff só tem permissão nas rotas deste módulo.
- `GET /api/whatsapp/contacts/search?q=` — busca por nome ou telefone, escopado ao
  `client_id` do token.
- `POST /api/whatsapp/conversions` — cria um `real_conversions`.
- `GET /api/whatsapp/conversations`, `GET /api/whatsapp/conversations/:contactId/messages`,
  `POST /api/whatsapp/conversations/:contactId/reply` (chama a Graph API da Meta pra
  enviar a mensagem de fato).
- `GET /api/whatsapp/roi` — agrega `real_conversions` vs. `daily_metrics` (gasto Meta já
  existente) pro período selecionado.

### Frontend

- **Aba nova no menu principal** ("Caixa de Entrada" ou nome similar), visível pra
  `admin` e `client`, seguindo exatamente o padrão de acesso que Remarketing/Tracking já
  usam hoje. Usa o seletor de cliente que já existe no Navbar — nenhuma mudança nesse
  componente além de mais uma aba na lista do Sidebar.
- **Rota separada `/caixa`**, fora da árvore do painel principal (sem Sidebar, sem
  Navbar, sem nada do layout atual) — pensada pra celular/tablet no balcão. Fluxo:
  seleciona o restaurante (lista simples de nomes, sem expor `client_id` cru) → digita
  o PIN daquele restaurante → busca por nome/telefone → confirma o contato → lança
  nome + valor (nome/telefone vêm pré-preenchidos do contato quando há match; sem
  match, o caixa digita manualmente e o registro fica com `matched_by: 'manual'`).

### Lógica de atribuição e ROI

1. Clique no anúncio Meta → abre WhatsApp com `ctwa_clid` na primeira mensagem →
   webhook grava isso em `whatsapp_contacts.ctwa_clid` / `ad_id`.
2. Toda mensagem trocada vira uma linha em `whatsapp_messages`; tempo de resposta =
   primeira `sent_at` outbound − primeira `sent_at` inbound daquele contato.
3. Cliente chega, caixa busca por nome/telefone em `/caixa`, confirma o contato
   correspondente, lança o valor → grava `real_conversions` com `contact_id` preenchido.
4. ROI real = `SUM(real_conversions.amount_spent)` para contatos com `source = 'ad'`,
   comparado ao gasto de anúncio Meta do mesmo período (já disponível em
   `daily_metrics`) — uma métrica adicional, sem substituir os KPIs que já existem hoje.

## Fora de escopo (v1)

- Enviar eventos de conversão de volta pra Meta via Conversions API (otimização de
  anúncio com dado real) — encaixa depois sem redesenho, já que `real_conversions` já
  guarda tudo que seria necessário.
- Mídia, templates de mensagem, respostas automáticas na caixa de entrada.
- Alerta/notificação automática de demora na resposta — por enquanto só medição e
  relatório.
- Rastreio de conversão vinda direto do card do Google (call/message assets) — frente
  separada, depende da landing page do Google que o cliente ainda vai terminar.
- Login individual por funcionário (garçom/caixa) — PIN único por restaurante é
  suficiente por agora.
- Vínculo com @ da conta Meta/Instagram do contato — encaixa quando a Meta expuser esse
  dado no payload do anúncio.
