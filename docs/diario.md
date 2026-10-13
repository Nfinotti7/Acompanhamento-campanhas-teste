# Diário do projeto — Acompanhamento de Campanhas (Further Ads)

> **Para a próxima sessão do Claude:** leia este arquivo inteiro antes de começar qualquer trabalho novo neste repositório. Ele existe porque o contexto de uma conversa se esgota, mas o trabalho continua — isso aqui é a continuidade entre uma sessão e outra.

## Como manter este diário

- Sempre que uma sessão estiver perto do limite de contexto, ou ao fechar um pedaço de trabalho significativo (uma feature, uma correção, uma decisão importante), adicione uma entrada nova no final da seção **Registro**, com data e: o que foi feito, o que ficou pendente, e qualquer decisão/trade-off que a próxima sessão precise saber pra não repetir perguntas já respondidas.
- Atualize a seção **Estado atual** pra refletir a realidade de agora — ela deve sempre responder rápido "o que está rodando em produção, o que falta, o que está bloqueado".
- Não apague nem reescreva entradas antigas do Registro — é um log cronológico, não um resumo vivo. Quem muda é o "Estado atual".
- Depois de atualizar o diário, faça commit (mensagem tipo `docs(diario): atualiza registro de progresso`). Não precisa perguntar antes de commitar só o diário.

## Convenções do projeto (pra não redescobrir toda vez)

- Backend Express (ESM) em `backend/src`, frontend React (Vite) em `frontend/src`. Monorepo servido junto pelo backend em produção.
- Banco: Postgres (Supabase), acesso via `backend/src/config/db.js` — placeholders `?` convertidos pra `$1,$2...` automaticamente. Schema evolui por `ALTER TABLE ADD COLUMN IF NOT EXISTS` no bloco aditivo de `initDb()`, nunca migração separada.
- Deploy: push pra `main` no GitHub (`Nfinotti7/Acompanhamento-campanhas-teste`) dispara auto-deploy no Hostinger pra `https://furtherads.online`. O pipeline roda `npm install`/build só na raiz usando o `package.json` da raiz (não o de `backend/`) — qualquer dependência nova do backend precisa ser adicionada também lá.
- 3 papéis de auth: `admin` (painel completo), `client` (painel só do próprio cliente), `staff` (PIN, usado só em `/caixa`). Padrão repetido em quase todo controller: `resolveClientId(req)` — admin pode passar `clientId` via query/body, client/staff ficam travados no próprio.
- `/caixa` é o app separado (`frontend/src/CaixaApp.jsx`, roteado por `window.location.pathname.startsWith('/caixa')` em `main.jsx`) usado pela equipe do restaurante/cliente via PIN — virou um mini-CRM estilo WhatsApp Web nesta sessão (ver Registro).
- Testes: `node --test` pra lógica pura/serviços (com fake-db por injeção de dependência quando toca banco mas é mockável). Não tem framework de teste de frontend — verificação manual via curl + queries diretas no Postgres de produção, e via Playwright contra os dois dev servers (`npm run dev:backend` na porta 5000, `npx vite` na porta 3000) apontando pro `.env` de produção.
- Convenção de commit: mensagens em português, 1 commit por pedaço logicamente coeso de trabalho, sempre terminando com `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Nunca faz push sem o usuário pedir explicitamente ("sobe", "da o deploy", etc.) — mas depois de pedir uma vez num pedaço de trabalho, costuma ser ok perguntar de novo a cada commit novo em vez de assumir autorização permanente.
- Specs/planos de features maiores ficam em `docs/superpowers/specs/YYYY-MM-DD-topico-design.md` e `docs/superpowers/plans/YYYY-MM-DD-topico.md` (convenção do skill `superpowers`).

## Estado atual

**Em produção (main, já deployado e confirmado no ar):**
- Tracking de campanhas Google Ads + Meta Ads, multi-cliente (Recreio, Alma Boutique Bar, Giulí Osteria, Malibu Sushibar), com suporte a cliente com múltiplas contas de anúncio / múltiplas Páginas do Facebook.
- WhatsApp: recebimento de mensagens via API oficial (Cloud API, webhook) **ou** via Baileys (WhatsApp Web não-oficial, conexão por QR code) — escolhido por cliente em `whatsapp_settings.connection_type`.
- CRM de WhatsApp completo: Funil (kanban) + Agenda + Conversas, com etapa manual (override que some sozinho quando chega evento real novo), anotações por contato, histórico unificado (mensagens + vendas + agendamento), editar/apagar venda lançada, apagar contato/lead.
- `/caixa`: shell estilo WhatsApp Web (rail de ícones à esquerda: Conversas/Funil/Agenda), login persistente (localStorage, não desloga no F5), atualização em tempo real via Server-Sent Events (mensagem nova aparece sozinha, sem precisar recarregar).
- Toda mensagem real (texto, foto, áudio, figurinha, documento, localização) cria/atualiza o contato — só reação (emoji a outra mensagem) é ignorada.

**Pendente / bloqueado (não é trabalho meu, é ação do usuário):**
- Vincular Google Ads de Alma, Giulí e Malibu à MCC da agência — precisa ser feito manualmente pelo usuário na interface do Google Ads.
- WhatsApp oficial (Cloud API) do Malibu está bloqueado por verificação de negócio + cartão de pagamento recusado na Meta. Baileys é o caminho interino enquanto isso não resolve — usuário pretendia migrar pra oficial "essa semana" (dito em 2026-10-12).

**Em aberto / observar:** a conexão Baileys do Malibu já caiu uma vez (precisou escanear QR de novo) durante os testes em 2026-10-13. Adicionado reconexão automática na subida do servidor (ver Registro), mas ainda não está confirmado se a causa era só "processo reiniciou" (resolvido agora) ou "sessão em disco se perde a cada deploy" (não resolvido, precisaria investigar se `.baileys_sessions/` sobrevive aos deploys do Hostinger). Se a conexão cair de novo logo após um deploy, é esse segundo caso.

Também corrigido nesse mesmo dia: `wa_id` gravado errado quando o WhatsApp usa LID (ver Registro) — se o usuário relatar mais contatos com número "estranho"/muito longo que não recebem resposta, é esse bug (já corrigido, mas contatos criados *antes* da correção continuam quebrados até serem apagados e recriados).

**Em teste agora:** usuário está testando o `/caixa` do Malibu em uso real.

## Registro

### 2026-10-13 — Sessão longa: CRM de WhatsApp completo, redesign do /caixa, tempo real

Resumo do que essa sessão cobriu, do início ao fim (sessão muito longa, compactada uma vez no meio):

1. **Renovação de credenciais Google/Meta** (Recreio) — tokens regerados e guardados corretamente, incluindo setup da Meta Ads CLI via WSL/Ubuntu.
2. **Funil WhatsApp + Agenda** (feature original, antes do CRM) — 6 etapas calculadas automaticamente (`computeStage` em `backend/src/services/whatsappStage.js`), view de agenda, integração com `/caixa` pra lançar venda/agendamento.
3. **Correção de credenciais multi-cliente** — Alma, Giulí e Malibu não apareciam ("sem credenciais"); corrigido bug de `page_id` placeholder causando classificação errada de campanha em conta de anúncio compartilhada, e implementado suporte a múltiplas contas de anúncio / múltiplas Páginas por cliente (valores separados por vírgula).
4. **Setup do WhatsApp do Malibu** — guiado passo a passo pela Cloud API oficial, bloqueado em "WABA inelegível pra mensagens pagas" (precisa verificação de negócio + cartão, que foi recusado repetidamente). Usuário pediu alternativa não-oficial.
5. **Baileys como alternativa** — implementado `connection_type` por cliente (`cloud_api` | `baileys`), com QR code, testado ponta a ponta com conexão real.
6. **Correções de deploy** — 503 causado pelo pipeline só rodando `npm install` na raiz (faltavam `baileys`/`qrcode` lá); 3 vulnerabilidades de `npm audit` corrigidas.
7. **Bug real de PIN** — `INSERT ... ON CONFLICT DO UPDATE` com `access_token = null` na lista de VALUES violava NOT NULL mesmo o COALESCE nunca usando esse null; corrigido separando INSERT-se-novo de UPDATE-se-existente.
8. **CRM de verdade** — o usuário pediu pra `/caixa` deixar de ser só um funil read-only e virar um CRM real (referência: Kommo/amoCRM). Spec e plano escritos (`docs/superpowers/specs/2026-10-12-whatsapp-crm-design.md`, `docs/superpowers/plans/2026-10-12-whatsapp-crm.md`), implementados em 7 tarefas:
   - 3 colunas novas em `whatsapp_contacts`: `notes`, `manual_stage`, `manual_stage_set_at`.
   - Etapa manual com override: `PATCH /api/whatsapp/contacts/:id/stage`, limpo automaticamente em 4 pontos de gravação (mensagem nova via Baileys/webhook, resposta enviada, agendamento marcado, venda lançada) — regra "evento real sempre vence".
   - Anotações: `PATCH /api/whatsapp/contacts/:id/notes`.
   - Histórico unificado: `GET /api/whatsapp/contacts/:id/timeline` (mensagens + vendas + agendamento, ordenado por data).
   - `ContactDetailPanel.jsx` — componente reaproveitável (conversa + histórico + anotações + mover etapa + lançar venda/agendamento), usado tanto no `/caixa` quanto em modal nas páginas admin de Funil/Agenda.
   - **Bug real pego na implementação**: `ContactDetailPanel` não passava `clientId` nas chamadas — funcionava no `/caixa` (token de staff já tem clientId fixo) mas quebrava no admin (token não tem clientId fixo, precisa vir explícito). Corrigido threading `clientId` como prop opcional.
9. **Redesign do `/caixa`** — usuário mostrou prints do WhatsApp Web pedindo que o layout parecesse de verdade com ele: rail de ícones fixo à esquerda (Conversas/Funil/Agenda) em vez de 3 botões em cima, e o Funil virou kanban horizontal de verdade (colunas lado a lado, como o admin já fazia) em vez de lista empilhada.
10. **Pedidos de produção real** (usuário testando no Malibu):
    - Mensagem nova não aparecia sozinha na tela → implementado **Server-Sent Events**: `backend/src/services/sseHub.js` (pub/sub em memória, puro/testável), rota `GET /api/whatsapp/events` (autenticada via query param `token`, já que `EventSource` não manda headers customizados), broadcast disparado em `ingestWhatsAppEvent` (cobre Baileys + webhook oficial) e em `replyToConversation`. Frontend abre uma conexão só em `CaixaApp.jsx` e repassa pros componentes via prop `lastEvent`.
      - **Bug real pego aqui**: `clientId` chegava como `string` da query string (SSE) mas como `number` do banco (ingest) — como `sseHub` usava `Map` puro, "5" e 5 eram chaves diferentes e o broadcast nunca chegava. Corrigido normalizando a chave pra `String(clientId)` dentro do `sseHub`.
    - F5 derrubava a sessão do `/caixa` → login agora persiste em `localStorage` (`caixa_token`, `caixa_restaurant`), com botão "Sair" explícito no rail e interceptor que desloga sozinho se o token expirar (401/403).
    - Nem toda mensagem virava contato → `isUsableMessage` (Baileys) e `parseWhatsAppWebhook` (Cloud API) descartavam mensagens sem texto reconhecido (foto sem legenda, áudio, figurinha, documento, localização). Corrigido: qualquer mensagem de conteúdo real cria/atualiza o contato, com rótulo legível quando não há texto (`📷 Imagem`, `🎤 Mensagem de voz`, etc.) — só reação (emoji) continua sendo ignorada.
11. **Editar/apagar venda, apagar contato** — não existia nada disso. Adicionado `PATCH`/`DELETE /api/whatsapp/conversions/:id` (editar valor inline na aba Histórico, com ícone de lápis/lixeira) e `DELETE /api/whatsapp/contacts/:id` (apaga contato inteiro, com confirmação — mensagens cascateiam via FK, vendas já lançadas ficam preservadas pro histórico financeiro só perdendo o vínculo com o contato, que é o comportamento que o schema já tinha via `ON DELETE SET NULL`).

**Todos os commits dessa sessão (do mais antigo pro mais recente, todos já no `main` e deployados):**
`9957668` (spec CRM) → `3de4033` (plano CRM) → 7 commits de implementação do CRM → `9b85284` (redesign /caixa) → `52a6864` (SSE + persistência + cobertura de tipo de mensagem) → `2bed533` (editar/apagar venda e contato).

**O que eu não cheguei a fazer / vale considerar depois:**
- Não existe lista de vendas por cliente no painel admin (só total agregado em "WhatsApp & Conversões") — se o usuário pedir, cada venda hoje só aparece no Histórico por contato.
- `CaixaFunilView` (usado no `/caixa`) e `WhatsAppKanbanPage`/`WhatsAppAgendaPage` (admin) são componentes separados que duplicam estrutura parecida — nenhum problema por enquanto, mas se crescerem mais pode valer unificar.

### 2026-10-13 (continuação) — Diário criado + bug real: conexão Baileys caindo

- Usuário pediu esse diário (este arquivo) e um `CLAUDE.md` na raiz apontando pra ele, pra qualquer sessão futura carregar automaticamente.
- **Durante o teste real no Malibu, surgiu um bug ao vivo**: mensagens chegavam, mas responder pelo `/caixa` não funcionava. Diagnosticado direto em produção via `GET /api/whatsapp/baileys/status?clientId=9` → retornou `status: "qr"`, ou seja, a conexão Baileys do Malibu tinha caído e estava esperando escanear o QR de novo (`sendViaBaileys` recusa enviar quando `status !== 'connected'`).
  - **Causa raiz**: `connectClient(clientId)` só era chamado a partir de `getBaileysStatus` (disparado quando alguém abre a página "Chaves e APIs" com aquele cliente selecionado). Depois de qualquer restart do processo (deploy, crash), a conexão Baileys simplesmente não existia em memória até alguém abrir aquela página manualmente — enquanto isso, nenhuma mensagem nova entrava e nenhuma resposta saía, sem nenhum aviso na tela.
  - **Correção**: nova função `reconnectAllBaileysClients()` em `backend/src/services/baileysClient.js` (testada com `node --test`, injeção de `db`/`connect` fake) — consulta todo `client_id` com `connection_type = 'baileys'` em `whatsapp_settings` e chama `connectClient` pra cada um. Chamada automaticamente na subida do servidor (`server.js`, depois do `app.listen`), sem bloquear o boot nem derrubar o servidor se algum cliente falhar ao reconectar.
  - Isso resolve o caso "processo reiniciou mas a sessão salva em disco ainda era válida" (reconecta sozinho, sem precisar de QR). **Não resolve** o caso em que a sessão foi de fato invalidada pelo WhatsApp (ex: pasta `.baileys_sessions/<id>` apagada pelo deploy, ou desvinculado pelo celular) — nesse caso ainda precisa escanear o QR manualmente de novo na página "Chaves e APIs".
  - Ainda não confirmado: se a pasta `.baileys_sessions` sobrevive aos deploys do Hostinger ou não. Se o problema voltar a acontecer logo depois de um deploy (não só depois de um tempo parado), isso aponta pra pasta sendo apagada — nesse caso a solução seria outra (persistir a sessão em outro lugar que não seja o disco local do app, ou confirmar com o suporte do Hostinger se dá pra marcar esse diretório como persistente entre deploys).
- **Segundo bug ao vivo, mesmo incidente**: depois de reconectar o Baileys, o usuário ainda via "Erro ao enviar mensagem" ao tentar responder um contato específico. Causa: o `wa_id` desse contato era um **LID** do WhatsApp (`145517938012378`, 15 dígitos — não é um número de telefone real). O WhatsApp às vezes expõe a identidade de quem manda mensagem como um LID (id interno opaco, usado por privacidade/nos testes mais recentes do protocolo) em vez do número, e o Baileys separadamente expõe o número real em `key.remoteJidAlt` quando isso acontece — nosso código só lia `key.remoteJid`, então gravava o LID como se fosse o número, e enviar resposta pra um LID falha.
  - **Correção**: `extractWaId` em `backend/src/services/baileysMapper.js` agora prefere `remoteJidAlt` quando `remoteJid` termina em `@lid` (testado: `baileysMapper.test.js`, 15 testes). Vale pra mensagem recebida nova daqui pra frente — **não corrige contatos já gravados errados antes dessa correção**.
  - 2 contatos de teste do próprio usuário ("Nicolas Finotti", "Ana Carolina Finotti", client_id 9/Malibu) já tinham sido gravados com LID — apagados em produção (confirmado com o usuário antes, incluía 2 vendas de teste vinculadas ao "Nicolas Finotti"). Se aparecer de novo um contato com número esquisito/muito longo (bem mais que os ~13 dígitos normais de um wa_id) que não recebe resposta, é o mesmo bug numa mensagem que chegou antes dessa correção — a solução é apagar o contato (botão já existe no Histórico) e deixar a próxima mensagem dele recriar certo.
