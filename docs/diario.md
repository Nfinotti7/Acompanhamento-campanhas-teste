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
- CRM de WhatsApp completo: Funil estilo Kommo (etapas personalizadas por cliente, arrastar card, valor do negócio, tags, responsável; ver Fase 3) + Agenda + Conversas, anotações por contato, histórico unificado (mensagens + vendas + agendamento), editar/apagar venda lançada, apagar contato/lead.
- `/caixa`: shell estilo WhatsApp Web (rail de ícones à esquerda: Conversas/Funil/Agenda), login persistente (localStorage, não desloga no F5), atualização em tempo real via Server-Sent Events (mensagem nova aparece sozinha, sem precisar recarregar).
- Toda mensagem real (texto, foto, áudio, figurinha, documento, localização) cria/atualiza o contato — só reação (emoji a outra mensagem) é ignorada.

**Em produção desde 2026-10-16 (push `c40a53d`; confirmado no ar: `/namesa`, manifestos, `sw.js`, `/api/staff/restaurants?product=waitlist`):**
- **Na Mesa**: fila de espera de restaurante pelo WhatsApp, produto separado da dashboard (tela `/namesa` pra recepcionista, robô no WhatsApp). Primeiro cliente: **Mercearia** (cliente novo, só fila). Ver Registro 2026-10-15.
- **Os 3 apps (Further Ads `/`, Caixa `/caixa`, Na Mesa `/namesa`)**:
  - Layout próprio pra celular, tablet e PC.
  - Tema claro/escuro nas cores da Further (marinho `#000D30` + turquesa `#0097B2`), com as logos da Further.
  - Cada app é instalável como PWA, com ícone próprio. Ver Registro 2026-10-16.
- Falta: cadastrar a Mercearia de verdade, testar a fila com celular real e instalar os PWAs num Android e num iPhone de verdade.

**Pendente / bloqueado (não é trabalho meu, é ação do usuário):**
- Vincular Google Ads de Alma, Giulí e Malibu à MCC da agência — precisa ser feito manualmente pelo usuário na interface do Google Ads.
- WhatsApp oficial (Cloud API) do Malibu está bloqueado por verificação de negócio + cartão de pagamento recusado na Meta. Baileys é o caminho interino enquanto isso não resolve — usuário pretendia migrar pra oficial "essa semana" (dito em 2026-10-12).

**Em aberto / observar:** (RESOLVIDO: a sessão agora fica em `~/.further_baileys_sessions` e sobreviveu ao deploy d214a9e sem pedir QR.) Histórico: a conexão Baileys do Malibu já caiu uma vez (precisou escanear QR de novo) durante os testes em 2026-10-13. Adicionado reconexão automática na subida do servidor (ver Registro), mas ainda não está confirmado se a causa era só "processo reiniciou" (resolvido agora) ou "sessão em disco se perde a cada deploy" (não resolvido, precisaria investigar se `.baileys_sessions/` sobrevive aos deploys do Hostinger). Se a conexão cair de novo logo após um deploy, é esse segundo caso.

Também corrigido nesse mesmo dia: `wa_id` gravado errado quando o WhatsApp usa LID (ver Registro) — se o usuário relatar mais contatos com número "estranho"/muito longo que não recebem resposta, é esse bug (já corrigido, mas contatos criados *antes* da correção continuam quebrados até serem apagados e recriados).

**Em teste agora:** usuário está testando o `/caixa` do Malibu em uso real.

**Roadmap combinado com o usuário (2026-10-13), em ordem — referência: prints do Tintim + `BLUEPRINT_atribuicao_furtherads.md` que o usuário mandou:**
1. ✅ **Conversa de verdade** — som de mensagem nova, foto do lead, abrir imagem, ouvir áudio, vídeo/documento (ver Registro).
2. ✅ **Atribuição estilo Tintim** (ver Registro 2026-10-13, Fase 2) — validar assinatura do webhook (`X-Hub-Signature-256`, hoje qualquer um consegue mandar mensagem falsa), resolver `ad_id` → conta/campanha/conjunto/anúncio via Marketing API (credenciais Meta por cliente já existem), painel "Informações da conversa" com método de rastreamento, origens Meta/Google/Outras/Não rastreada, dashboard de conversas (total, % rastreadas, gráfico por dia por origem, funil, vendas/faturamento).
3. ✅ **CRM estilo Kommo** (ver Registro 2026-10-13, Fase 3) — o usuário escolheu: etapas personalizadas por cliente + arrastar cards; valor do negócio no card (soma por coluna); tags e responsável. (Tarefas/lembretes ficaram de fora por enquanto.) Substitui as 6 etapas fixas calculadas; cada etapa já preparada pra mapear um evento de conversão (Contact/Schedule/Purchase).
4. ✅ **Link Rastreável + CAPI** (ver Registro 2026-10-13, Fase 4; falta validar com pixel real) — link próprio que captura UTM/fbclid e redireciona pro `wa.me` com token; disparo dos eventos por etapa pra Meta/Google com log.
- O blueprint propunha criar tabelas novas (`contatos`, `mensagens`...) — **não fazer isso**: as equivalentes já existem (`whatsapp_contacts`, `whatsapp_messages`, `real_conversions`). Estender, não duplicar.
- ~~Baileys nunca recebe `referral`~~ **ERRADO, corrigido em 2026-10-13**: pelo QR code a primeira mensagem de quem clicou em anúncio CTWA traz `contextInfo.externalAdReply` (`sourceId` = ad id, `ctwaClid`), e agora é lido (ver Registro). O que o Baileys não pega é origem fora de anúncio Meta (Google, orgânico); isso é o Link Rastreável (Fase 4).

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
- **Terceiro bug ao vivo, mesmo incidente**: depois do fix de reconexão automática, o usuário mandou mensagens de teste que simplesmente não apareciam em lugar nenhum — nem contato novo, nem mensagem, nada no banco. Status da conexão ficou preso em `"connecting"` por mais de 20s.
  - **Causa raiz — eu mesmo introduzi**: `connectClient` tinha um guard `if (state.sock) return state` ANTES de dois `await` (import dinâmico da lib + leitura da sessão em disco) que só depois seta `state.sock`. Isso deixa uma janela onde duas chamadas concorrentes pro mesmo `clientId` passam as duas pelo guard e cada uma abre o PRÓPRIO socket Baileys, autenticando duas vezes com a MESMA sessão ao mesmo tempo — exatamente o cenário que o comentário original do arquivo já alertava que quebra a conexão (só que entre duas *instâncias* do backend; aqui foi entre duas *chamadas* dentro do mesmo processo). A reconexão automática na subida do servidor (chamada recém-adicionada) colidiu com minhas próprias chamadas de diagnóstico (`getBaileysStatus` via curl) rodando quase ao mesmo tempo.
  - **Correção**: `connectClient` agora guarda uma `connectPromise` em andamento no estado do cliente — uma segunda chamada concorrente espera a MESMA tentativa em vez de abrir outra. Teste de regressão em `baileysClient.test.js` (`Promise.all` com duas chamadas simultâneas, confirma que `makeWASocket` só é chamado uma vez).
  - Pra desempacar o estado já travado em produção, bastou o próprio deploy dessa correção reiniciar o processo (zera o Map em memória). Se isso acontecer de novo (status preso em "connecting" por muito tempo), o jeito mais rápido de destravar é reiniciar o processo pelo hPanel do Hostinger (botão "Restart" do Node.js App) — não tem endpoint pra forçar reset de uma conexão travada ainda.
- **Quarto bug ao vivo, mesmo incidente**: depois do fix da corrida, o status ficou preso em `"connecting"` de novo (não era só a corrida — a corrida explicava uma ocorrência, essa foi outra, numa reconexão limpa sem concorrência nenhuma). Ficou mais de 40s parado, nunca virando `'open'` nem `'qr'` nem `'close'` — provavelmente o handshake com o WhatsApp travou silenciosamente (possível throttling do lado do WhatsApp por causa dos vários reconnects seguidos de hoje — ainda sem certeza).
  - **Correção**: `connectClient` agora detecta quando o socket atual está preso em `'connecting'` há mais de 30s (`STALE_CONNECTING_MS`) e descarta sozinho (`sock.end(...)`) pra tentar de novo do zero, em vez de ficar preso pra sempre — antes disso o guard `if (state.sock) return state` fazia qualquer chamada nova só devolver o mesmo estado travado. Testado com relógio fake injetado via `deps.now` (`baileysClient.test.js`).
  - Isso é autocura de verdade: não precisa mais de restart manual pelo hPanel quando a conexão emperra no meio do handshake (só continua precisando de restart manual se o processo inteiro travar/cair, o que é outra coisa).
- **Quinto bug ao vivo, mesmo incidente — a causa raiz de verdade**: usando o debug temporário (revertido logo abaixo), o erro real era `"Conexão WhatsApp (Baileys) não está ativa para este cliente."`, mesmo com `GET /api/whatsapp/baileys/status` reportando `"connected"` segundos antes. Causa: **o mesmo bug de tipo já corrigido no `sseHub.js` (SSE) existia também no `connections` Map de `baileysClient.js`**, e eu não tinha generalizado a correção pra lá. `client_id` chega como `number` quando vem do Postgres (reconexão automática na subida, lê direto de `whatsapp_settings`) e como `string` quando vem de query string/corpo de requisição (`getBaileysStatus`, `replyToConversation`) — `"9"` e `9` viravam DUAS entradas diferentes no Map. A reconexão automática abria um socket "fantasma" numa chave numérica (nunca escaneado, por isso nunca conectado de verdade), enquanto o QR que o usuário escaneava ficava registrado na chave string — e enviar mensagem, que lia pelo tipo numérico (vindo do corpo JSON), batia na conexão fantasma errada.
  - **Correção**: `normalizeClientId` (`String(clientId)`) aplicado em todo acesso ao Map (`getOrInitState`, `getConnectionState`, `sendViaBaileys`) — igual já tinha sido feito em `sseHub.js`. Teste de regressão novo confirma que abrir a conexão com `clientId` number e consultar/enviar com `clientId` string batem na mesma entrada.
  - **Licão pra próxima sessão**: sempre que alguém usar `client_id` como chave de `Map`/objeto em memória neste projeto, normalizar o tipo (`String(...)`) de cara — esse bug já apareceu duas vezes (SSE e Baileys) por causa da mesma causa estrutural (`client_id` do Postgres é number, mas de query string/JSON pode chegar como string dependendo de onde foi lido).
  - Debug temporário (`detail`/`stack` do erro na resposta de `POST /api/whatsapp/conversations/:id/reply`) **já revertido** no mesmo commit — não ficou exposto em produção além do necessário pra diagnosticar.
- **Sexto bug ao vivo, mesmo incidente — depois do fix do bug de tipo**: mesmo sem nenhum deploy novo, a conexão passou a abrir e cair sozinha repetidamente (~5s conectado, volta pra "connecting", de novo e de novo). Causa, confirmada via log temporário (`lastDisconnectReason` exposto em `getConnectionState`): `statusCode: 440, message: "Stream Errored (conflict)"` — o WhatsApp detectando duas tentativas de conexão usando a mesma sessão quase ao mesmo tempo. O código reconectava **imediatamente** depois de qualquer queda (`if (!loggedOut) connectClient(...)`, sem atraso nenhum) — rápido demais pro servidor do WhatsApp processar que a conexão anterior já caiu, criando um ciclo: cai → reconecta na hora → WhatsApp ainda vê a sessão "em uso" → conflito 440 → cai → reconecta na hora de novo → ...
  - **Correção**: reconexão automática depois de queda (não-logout) agora espera `RECONNECT_DELAY_MS` (5s) antes de tentar de novo, em vez de imediatamente. Testado com `setTimeout` fake injetado via `deps.setTimeout` (`baileysClient.test.js`) — confirma que não reconecta na hora, só quando o atraso "passa".
  - O log de diagnóstico (`lastDisconnectReason` no `getConnectionState`, mais um `console.error` no log do servidor a cada queda) **ficou no código** (não é debug temporário de verdade, é visibilidade operacional útil) — se a conexão cair nesse ou em outro `statusCode` de novo, dá pra ver o motivo direto pela rota de status sem precisar de outro deploy.
  - **Resumo de todo o incidente de hoje** (pra quem ler depois): 1 causa real de queda (processo reiniciava e ninguém reconectava — resolvido com reconexão automática), que ao ser corrigida expôs 2 bugs novos que eu mesmo introduzi nela (corrida entre chamadas concorrentes; `clientId` number vs string como chave de Map — a mesma classe de bug 2 vezes, SSE e Baileys), mais 1 bug pré-existente nunca visto antes (LID do WhatsApp sendo gravado como wa_id), mais 1 comportamento do próprio WhatsApp (conflito 440 por reconectar rápido demais) que só apareceu por causa de tantos reconnects seguidos tentando corrigir os outros bugs. Lição maior: cada correção de um bug de conexão ao vivo força um restart, e cada restart é uma nova chance de expor o próximo bug — vale testar mais synthetically (unit test) antes de depender só de reproduzir em produção quando der pra evitar.

### 2026-10-13 (continuação) — Fase 1 do roadmap: mídia, foto do lead e som

- Depois das correções do Baileys, o Malibu ficou estável (só quedas normais que reconectam sozinhas, sem QR).
- **Mídia**: tabela nova `whatsapp_media` (BYTEA no Postgres, **não** no disco do Hostinger, que pode sumir em deploy; toda mídia pertence a um contato e cai junto em cascata se ele for apagado). `whatsapp_messages` ganhou `media_id`, `media_type` (`image|video|audio|document|sticker`) e `media_filename`. O download acontece em `ingestWhatsAppEvent` só quando a mensagem é **nova** (reenvio do webhook não baixa de novo), com limite de 15 MB (`MAX_MEDIA_BYTES`). Se o download falhar, a mensagem é gravada mesmo assim e a tela mostra "Mídia indisponível".
  - Baileys: `downloadMediaMessage` no handler `messages.upsert`. Cloud API: `downloadCloudMedia` (Graph `/{media_id}` → URL temporária → arquivo, as duas chamadas com o token), ligado no webhook controller.
  - Servida em `GET /api/whatsapp/media/:id`, autenticada por `?token=` (o `<img>`/`<audio>` não mandam header) e escopada por `client_id`.
- **Foto de perfil**: `profilePicture.js` verifica no máximo 1x por dia por contato (`profile_pic_checked_at`), troca a antiga e apaga a anterior. **Só funciona no Baileys**: a Cloud API oficial não expõe foto de contato, e aí o avatar fica com as iniciais.
- **Frontend**: `components/whatsappMedia.jsx` (`mediaUrl`, `Avatar`, `MessageMedia`, `ImageLightbox`). Avatar na lista do `/caixa` e no cabeçalho do painel. Imagem abre ampliada, áudio/vídeo com player, documento com link de download. A conversa rola sozinha pra mensagem mais nova.
- **Som**: `components/notificationSound.js` (Web Audio, sem arquivo). Toca em todo evento SSE `inbound` no `/caixa`. Navegador só libera áudio depois do 1º clique na página: se a sessão voltou sozinha do localStorage, o som só toca depois de um clique.
- **2 bugs do login persistente (feito antes) achados testando**: (1) token salvo já expirado deixava a tela vazia em vez de voltar pro PIN, porque o interceptor de 401/403 era registrado num `useEffect` do pai, e os filhos fazem a 1ª requisição antes; (2) PIN errado (o backend responde 401) era tratado como sessão expirada e jogava de volta pra lista de restaurantes. Corrigido: interceptor no nível do módulo e só age se já existe sessão (header `Authorization` setado).
- **Convenção nova pra testar local**: `BAILEYS_AUTOCONNECT=false node src/server.js` desliga a reconexão automática do Baileys, pra rodar o backend local contra o banco de produção sem abrir uma sessão de WhatsApp paralela à do servidor.
- Não testado com mídia real do WhatsApp (só com mídia inserida direto no banco, já que local não tem sessão): confirmar com o usuário mandando foto/áudio de verdade pro Malibu depois do deploy.
- **Causa de verdade do "QR a cada deploy" (resolvida)**: o Hostinger sobe cada deploy numa pasta nova (`/home/u927520009/domains/furtherads.online/hbuilds/versions/<id>/nodejs/`, visível no stack trace de um erro). A sessão do Baileys ficava em `process.cwd()/.baileys_sessions`, ou seja, dentro dessa pasta versionada, e sumia a cada deploy. Agora fica em `~/.further_baileys_sessions` (home da conta, persiste entre deploys; dá pra sobrescrever com `BAILEYS_SESSIONS_DIR`). Depois desse deploy ainda precisa de 1 QR (a sessão atual estava na pasta antiga); daí em diante deploy não deve mais pedir QR. Se voltar a pedir depois de um deploy, a home não está persistindo e o próximo passo é guardar a sessão no Postgres.

### 2026-10-13 (continuação) — Fase 2 do roadmap: atribuição e Dashboard WhatsApp

- **Assinatura do webhook**: `utils/metaSignature.js` confere `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com `META_APP_SECRET`). O `express.json` guarda o corpo cru em `req.rawBody`. Sem a variável configurada, o webhook recusa tudo (503, fail closed). **Depende do usuário configurar `META_APP_SECRET` no ambiente do Hostinger** (App Secret do app do WhatsApp em developers.facebook.com → app → Configurações → Básico) antes de qualquer cliente usar a API oficial. Hoje nenhum cliente usa (Malibu é Baileys e o Recreio só tem dados de teste com `PHONE_123`).
- **Anúncio → campanha**: `services/metaAdResolver.js` resolve `ad_id` (vindo do `referral`) em conta/campanha/conjunto/anúncio pela Marketing API, com o token Meta do próprio cliente (`credentials`). Cache em `meta_ad_cache` (7 dias). Roda em segundo plano depois do webhook, na subida do servidor (`resolveMissingAds`) e na hora de abrir a aba Origem, se ainda faltar. Testado com um anúncio real da conta do Recreio.
- `whatsapp_contacts` ganhou `ad_source_url`, `ad_referral_json` (JSONB, payload cru) e `tracking_method` (`ctwa`; `link` vem na fase 4). Tudo primeiro toque (COALESCE).
- Origem centralizada em `services/whatsappOrigin.js` (`classifyOrigin` + `ORIGIN_SQL`): `meta_ads` / `google_ads` / `outras` / `nao_rastreada`. Hoje `source='ad'` vira meta_ads e o resto vira não rastreada. Google/Outras dependem do Link Rastreável.
- **Aba "Origem"** no `ContactDetailPanel` (`components/AttributionView.jsx`).
- **Dashboard WhatsApp** (nova página no admin, `GET /api/whatsapp/dashboard`): conversas novas, % rastreadas, origem por dia, funil (contato → respondido → agendou → comprou), vendas/faturamento por dia, e **resultado por campanha** (conversas, vendas e faturamento dos leads daquela campanha × investimento de `daily_metrics`, com custo/conversa e ROAS). Dias agrupados em horário de Brasília (o banco grava UTC sem fuso).
  - Definição de "Conversão": % das conversas novas do período que têm pelo menos uma venda. "Vendas lançadas" conta toda venda do período, incluindo as sem contato (lançadas pelo "não achei"), então podem aparecer vendas com conversão 0%.
  - Investimento só aparece pra campanha que já foi sincronizada (`campaigns`/`daily_metrics`). Campanha nova fica com R$ 0 até a próxima sincronização.
- **Modal** agora usa portal (`createPortal` no body). Antes ficava atrás da barra lateral do admin.
- **Pendência de segurança pro usuário verificar**: o código tem `JWT_SECRET` com valor padrão fixo (`authMiddleware.js`), e o `.env` local não define nenhum. Se o Hostinger também não tiver `JWT_SECRET` configurado, qualquer um que leia o código consegue forjar login de admin. Não consegui confirmar em produção (o teste com token forjado foi bloqueado pela política da sessão). Pedi pro usuário conferir no hPanel.

### 2026-10-13 (continuação) — Chat estilo WhatsApp: não lidas, horário e tiques

Pedido do usuário depois da Fase 2 (ele disse que ainda falta muita coisa pra ficar como imagina, e que vamos organizando aos poucos):
- **Não lidas**: `whatsapp_contacts.last_read_at`. Não lidas = mensagens recebidas com `created_at` depois disso. Zerado por `POST /api/whatsapp/conversations/:id/read`, que o `ContactDetailPanel` chama sempre que carrega as mensagens (abriu a conversa, ou chegou mensagem com ela aberta). Responder pelo painel e responder pelo celular (outbound via Baileys) também marcam como lida. É **caixa compartilhada**: a leitura vale pra equipe toda, não por atendente.
- **Lista do `/caixa`**: bolinha verde com a contagem, nome em negrito e horário em verde quando há não lidas, prévia da última mensagem (com tique se foi nossa) e horário no formato do WhatsApp (hora / "Ontem" / data). Total de não lidas no título da aba. Responder sobe a conversa pro topo (`last_message_at`).
- **Mensagens**: horário em cada balão, separador de dia (Hoje/Ontem/data). Balão enviado ficou mais escuro (`#3730a3`) pra dar contraste com o tique azul.
- **Tiques** (`whatsapp_messages.status`: pending/sent/delivered/read/failed): `services/messageStatus.js`. O status só avança, nunca volta (aviso atrasado é ignorado). "failed" só substitui quem ainda não foi entregue.
  - Baileys: evento `messages.update` (códigos 0-5 → nome). `sendViaBaileys` agora devolve o id da mensagem enviada, sem o qual o aviso não teria como ser ligado à nossa mensagem. O INSERT da resposta usa `ON CONFLICT (wa_message_id)`, porque o próprio Baileys pode registrar a mensagem enviada antes.
  - Cloud API: `parseWhatsAppStatuses` lê `value.statuses` do webhook.
  - Atualização ao vivo via SSE (evento com `kind: 'status'`, sem `direction`, então não toca o som).
- Testado localmente com webhook assinado (mensagens chegando, entregue → lida, aviso atrasado ignorado). Não testado com Baileys real (não há sessão local); confirmar com o usuário depois do deploy.
- Limitação de qualquer WhatsApp: se o cliente desliga a confirmação de leitura na privacidade, fica em ✓✓ cinza pra sempre.
- Depois do deploy (d214a9e), o Malibu reconectou sozinho, **sem pedir QR**. Isso confirma que mover a sessão Baileys pra `~/.further_baileys_sessions` resolveu a perda de sessão a cada deploy.

### 2026-10-13 (continuação) — Conversa não rolava

O usuário relatou que a janela da conversa no `/caixa` não tinha rolagem nem descia sozinha. A causa era a falta de `min-height: 0` na cadeia grid/flex: a lista de mensagens crescia do tamanho do conteúdo, e o `overflow: hidden` do pai cortava as mensagens mais novas. A correção:
- `CaixaChatView`: `gridTemplateRows: 'minmax(0, 1fr)'` e `minHeight: 0` nas colunas.
- `ContactDetailPanel`: `minHeight: 0` na raiz e nas áreas com rolagem.
- A rolagem automática agora usa `scrollTop = scrollHeight` no próprio container, em vez de `scrollIntoView`, que rolava a página inteira. Ela é "grudenta": só puxa pro fim se a pessoa já estava perto do fim (menos de 80px). Quem subiu pra ler o histórico não é puxado de volta. Trocar de contato, voltar pra aba Conversa e enviar resposta forçam a ida pro fim. Imagem ou vídeo que termina de carregar (`onLoad` no `MessageMedia`) também re-rola, porque muda a altura da lista.
- Testado localmente com 40 mensagens: abre no fim e rola manualmente.

### 2026-10-13 (continuação) — Atribuição de anúncio também pelo Baileys (QR code)

O usuário viu que o Tintim rastreia anúncio mesmo conectado por QR code e sugeriu montar um fluxo n8n/VPS que lesse o webhook do Baileys, extraísse o id do anúncio e consultasse a Graph API. Expliquei que não precisa de nada disso, porque o nosso servidor já roda o Baileys e já tem o `resolveAd`. Vercel nem serviria, já que o Baileys precisa de conexão aberta 24h. Faltava só ler o campo certo:
- `baileysMapper.js`: `extractAdReferral` procura `contextInfo.externalAdReply` em qualquer tipo de mensagem. Só conta se `sourceType === 'ad'` ou se tem `ctwaClid`, porque preview de link comum também usa `externalAdReply`. Só vale pra mensagem recebida. Monta o objeto no **mesmo formato do `referral` da Cloud API** (`source_id`, `source_url`, `headline`, `body`, `ctwa_clid`...) e não guarda os bytes da miniatura.
- `whatsappIngest.js`: "veio de anúncio" agora é `ctwaClid || adId`, porque o cartão pelo Baileys pode vir sem `ctwaClid`.
- `baileysClient.js`: quando há `adId`, chama `resolveAd` em segundo plano e loga `Baileys [client X]: conversa de anúncio (ad ..., clid sim/não)`. Isso serve pra conferir nos logs do Hostinger.
- **Ainda não validado com mensagem real.** Falta alguém clicar num anúncio ativo do Malibu e mandar mensagem, e conferir a aba Origem e o log. Se o lead apagar a prévia do anúncio antes de enviar, o cartão não vem e a conversa fica "não rastreada" (limitação do WhatsApp).
- Risco de banimento discutido com o usuário: só receber e responder quem chamou, no ritmo de um atendente, é o uso de menor risco. Disparo em massa e remarketing só pela API oficial. O usuário concorda.

### 2026-10-13 (continuação) — Fase 3: CRM estilo Kommo

Decisões do usuário (AskUserQuestion):
- **Arrastar:** o card fica onde foi colocado. Só três eventos movem sozinho: lead novo entra na etapa marcada "Lead novo entra aqui", agendamento e venda movem pra etapa ligada a cada um. Mensagem comum não move mais. Isso **substitui** a regra antiga "evento real sempre vence" (`manual_stage`).
- **Responsável:** lista de nomes por cliente (`crm_team_members`). Não mexe no login; o PIN do /caixa continua um só.
- **Valor:** campo manual (`deal_value`). Quando existe venda lançada, o card mostra o total das vendas (`cardValue`).
- **Quem edita etapas e tags:** todos, inclusive o /caixa.

Implementação:
- Tabelas novas: `crm_stages` (nome, cor, posição, `auto_event` ∈ novo_lead/agendado/venda, no máximo uma etapa por evento), `crm_team_members`, `crm_tags`, `whatsapp_contact_tags`. Colunas novas em `whatsapp_contacts`: `stage_id`, `deal_value`, `responsible_id`. `clients.crm_seeded_at` marca o cliente já migrado.
- `services/crmStages.js` (testado):
  - `ensureStages` cria as 6 etapas antigas como padrão, uma vez por cliente, e posiciona os contatos existentes pela etapa calculada antiga (`computeStage`/`manual_stage`).
  - Usa claim atômico no `UPDATE clients ... WHERE crm_seeded_at IS NULL`.
  - Se o cliente apagar todas as etapas depois, não recria.
- `moveToAutoStage` é chamado em `ingestWhatsAppEvent` (só se `stage_id IS NULL`), em `setAppointment` (só se marcou data) e em `createConversion`. `replyToConversation` não move mais.
- Rotas:
  - `GET /api/crm/config`.
  - CRUD `/api/crm/stages`, mais `PUT /api/crm/stages/order`. Apagar uma etapa move os cards pra primeira que sobrar. Não deixa apagar a última etapa.
  - CRUD `/api/crm/tags` e `/api/crm/team`.
  - `GET` e `PATCH /api/whatsapp/contacts/:id/crm` (stageId, dealValue, responsibleId, tagIds).
  - **Removido** `PATCH /contacts/:id/stage`. `whatsappStage.js`/`computeStage` só servem agora pra migração inicial. `manual_stage` e `remarketing_days` ficaram sem uso, mas não foram apagados (schema aditivo).
- `GET /api/whatsapp/kanban` agora devolve `{ stages, contacts }`. Cada contato traz `stage_id` efetivo, `value`, `tag_ids` e `responsible_name`.
- Frontend:
  - `components/crm/CrmBoard.jsx`: o mesmo quadro no admin (`WhatsAppKanbanPage`) e no /caixa (`CaixaFunilView`). Arrastar usa drag-and-drop nativo do HTML5 (não funciona no touch; no celular, troca a etapa pelo painel do contato). Tem filtros por busca, tag e responsável, e soma em R$ por coluna.
  - `crm/CrmSettings.jsx`: modal "Configurar funil".
  - `crm/DealBar.jsx`: etapa, valor, responsável e tags no topo do `ContactDetailPanel`, inclusive na aba Conversas.
- **Perdido de propósito:** as etapas por tempo ("Não compareceu" quando o agendamento passa, "Remarketing" depois de N dias) não andam mais sozinhas, porque o usuário escolheu que só venda e agendamento movem. Se ele sentir falta, dá pra adicionar `auto_event` por tempo.
- Testado localmente contra o banco de produção com o Recreio: arrastar, abrir card, criar tag e responsável, valor estimado vs. venda real. **Atenção:** isso já migrou o Recreio (etapas criadas no banco de produção); os outros clientes migram na primeira abertura do funil.
- Próximo: Fase 4 (Link Rastreável + CAPI). As etapas já têm `auto_event`; o disparo de conversão por etapa vai precisar de um campo novo (ex: `conversion_event` em `crm_stages`).

### 2026-10-13 (continuação) — Fase 4: Link Rastreável + Meta Conversions API

Decisões do usuário:
- O código vai **visível** na mensagem pronta, no formato `(cód. XXXXX)`.
- **Só Meta** por enquanto. O Google (upload de conversão offline) fica pra uma etapa seguinte, porque exige criar uma ação de conversão em cada conta Google Ads.
- Evento de etapa é enviado **uma vez por contato**. Purchase é enviada a cada venda lançada, com o valor.

**Link Rastreável:**
- `services/trackingLink.js` (testado): gera o código (5 caracteres sem 0/O/1/I/L), monta a mensagem, extrai o código (aceita "cod", "cód." etc.), classifica a origem (`gclid`/utm google → `google_ads`; `fbclid`/utm facebook/instagram → `ad` = Meta; senão `outras`) e detecta robôs de prévia.
- Rota pública `GET /r/:slug` (`trackingController.redirectTrackingLink`), registrada antes do `/api` e do fallback da SPA. Grava o clique com as UTMs (as da URL têm prioridade sobre os padrões do link), mais `fbclid`/`gclid`, e redireciona pro `wa.me`. Robô de prévia (WhatsApp/Facebook montando o cartão) é redirecionado sem gravar clique.
- `ingestWhatsAppEvent` → `matchTrackingClick`: mensagem recebida com código liga o clique ao contato. Se o contato não tem `tracking_method` (primeiro toque), grava `source`, `tracking_method='link'` e `tracking_click_id`. Isso roda **antes** de entrar no funil, então o evento Lead já sai com o `fbclid`.
- Tabelas `tracking_links` (o slug é global) e `tracking_clicks` (o código é UNIQUE). A aba Origem mostra o nome do link, as UTMs e os IDs de clique.

**Meta Conversions API:**
- `services/metaCapi.js` (testado): `buildCapiEvent`.
  - Com `ctwa_clid` **e** WABA real (não 'baileys'): `action_source=business_messaging`, `messaging_channel=whatsapp`, `user_data.ctwa_clid` e `whatsapp_business_account_id`.
  - Senão: `action_source=chat`, com telefone em hash (`ph`), mais `fbc` montado do `fbclid` do Link Rastreável.
  - Sempre vão `country` e `external_id`. O valor vai em BRL.
- `services/conversionEvents.js` (testado):
  - Só envia se `capi_settings.enabled`, pixel preenchido e token Meta em `credentials`.
  - Reserva o `event_id` em `conversion_events` (UNIQUE) antes de enviar. Stage = `c<contato>-<evento>`, venda = `sale-<id>`.
  - Evento que **falhou** é retentado no próximo gatilho.
- Gatilhos:
  - `moveToAutoStage` (agora devolve se mudou e dispara quando muda).
  - `PATCH /contacts/:id/crm` com `stageId`.
  - `createConversion` (Purchase).
  - Tudo em segundo plano (`inBackground`).
- `crm_stages.meta_event`: Lead/Contact/Schedule/CompleteRegistration/SubmitApplication, escolhido em "Configurar funil". **Purchase não pode ser ligada a etapa**, pra não contar a venda duas vezes.
- Rotas `/api/tracking/*` (links, capi, capi/test, events) bloqueadas pro token de staff (`denyStaff`).
- Nova aba no admin, **"Links e Conversões"** (`pages/TrackingLinksPage.jsx`): criar e copiar links com contagem de cliques e conversas, Pixel + código de teste + ativo, botão "Enviar evento de teste" e tabela de disparos.

**Testado** localmente contra o banco de produção, com o Recreio:
- link → clique com `gclid` → webhook assinado com o código → contato `google_ads`/`link`, aba Origem certa;
- staff recebe 403 em `/api/tracking`;
- Lead enviado uma vez, e mover o card de volta não reenvia;
- Purchase da venda com valor;
- com pixel falso, a Meta recusou e o erro ficou registrado.

Dados de teste apagados.

**Não testado:**
- A tela "Links e Conversões" no navegador (sem senha de admin na sessão de teste). O build passa.
- Envio com pixel real. O formato `business_messaging` precisa ser confirmado pelo usuário com código de teste no Gerenciador de Eventos.
- O código passando pelo Baileys real. O texto chega igual, mas confirmar.

### 2026-10-14 — Baileys "conectando/conectado" a cada poucos segundos

O usuário relatou que o sistema funcionava, mas o status ficava alternando entre conectando e conectado a cada uns 3 segundos. A página de credenciais consulta o status a cada 4s. Não havia nenhum backend meu rodando localmente.

**Hipótese principal (não confirmada):** dois processos no Hostinger com a mesma sessão. O processo de um deploy anterior continuaria vivo junto com o novo. Desde que a sessão foi pra home (`~/.further_baileys_sessions`), os dois leem a mesma sessão e se derrubam (conflito 440). Antes, cada deploy tinha a própria pasta. Houve 3 deploys seguidos no dia 13.

**Correção:**
- `baileysClient.js` ganhou um dono único da sessão, `owner.json` na pasta de sessões.
- O processo que sobe por último (`reconnectAllBaileysClients`) vira o dono e dá heartbeat a cada 10s.
- Um processo que vê outro dono vivo fecha as conexões e não reconecta. `connectClient` nele devolve o status `standby`.
- Se o heartbeat do dono passar de 60s, outro processo assume. A regra pura `decideOwnership` está testada.
- **Limitação:** um processo antigo que ainda roda código anterior a essa correção não sabe ceder. Depois do deploy pode precisar de um Restart no hPanel.
- A página "Chaves e APIs" agora mostra a **última queda**, com horário, código e mensagem (e explica o 440), e os status `standby` e `disconnected`. Assim fica possível confirmar a causa.
- Se o código mostrado não for 440, a hipótese estava errada e é preciso olhar a mensagem.

### 2026-10-15 — Na Mesa: fila de espera pelo WhatsApp (branch `feat/namesa`)

O usuário recebeu uma demanda de um restaurante que **não é cliente de tráfego** (a **Mercearia**) e quer só um sistema de fila de espera. A decisão foi construir isso dentro deste mesmo app, reaproveitando o Baileys, como um produto separado chamado **Na Mesa**.

Decisões do usuário:
- V1 é **só fila de espera presencial**. Reserva com data e hora fica pra depois, se o cliente pedir. Também ficam fora a fila "de casa", a página pública da fila e a integração com PDV ou mapa de mesas.
- Qualquer mensagem de quem está na fila recebe a posição e a espera na hora. Não tem menu numérico, e o Baileys não suporta botões.
- O robô avisa **só nos marcos** (entrou, "quase lá" uma vez, mesa chamada, não veio) e **não a cada baixa**, pra não queimar o número no Baileys. Isso foi uma proposta minha, aceita pelo usuário.
- Referência de produto: Yelp Waitlist (espera estimada com dado real).

Spec: `docs/superpowers/specs/2026-10-15-namesa-fila-design.md`. Plano: `docs/superpowers/plans/2026-10-15-namesa-fila.md`.

Como ficou:
- **Cliente com dois "produtos":** `clients.dashboard_enabled` e `clients.waitlist_enabled`. A Mercearia vai ter `false`/`true`.
  - Cliente sem dashboard não passa pelo CRM (`ingestWhatsAppEvent` pula `matchTrackingClick`/`moveToAutoStage`) e não aparece no `/caixa`.
  - Ele **continua no seletor do admin** (marcado "· Na Mesa"), porque é por ali que se abre "Chaves e APIs" pra conectar o QR do Baileys e definir o PIN.
- **Tabelas:** `waitlist_settings` (número do WhatsApp, minutos por grupo, tolerância, quando avisar "quase lá", textos editáveis em JSONB) e `waitlist_entries` (status `awaiting_size|waiting|called|seated|no_show|left|removed`).
- **Serviços:**
  - `waitlistText.js`: lê "FILA", "sair", "somos 4", "eu e mais 3" e "duas", e monta os textos.
  - `waitlistQueue.js`: posição, espera estimada, transições e marcos.
  - `waitlistBot.js`: a conversa.
  - `whatsappSender.js`: `sendToContact`, extraído do `replyToConversation`, que agora usa ele também. As mensagens do robô entram no histórico normal.
- **Robô:** só acorda com `FILA` sozinho ou com `(cód. FILA)` (o texto que o QR da porta põe), ou com quem já está na fila. "tem fila hoje?" é ignorado. O robô roda só em mensagem recebida **e nova**, então reenvio do WhatsApp não duplica resposta.
- **Espera estimada:** é a média dos intervalos entre as últimas baixas "sentou" das últimas 2h (pelo menos 3 baixas, cada intervalo limitado a 30 min), vezes a posição, arredondada pra múltiplos de 5. Antes disso usa o padrão de 8 min por grupo.
- **Fila ativa = últimas 12h.** Não precisa de rotina de limpeza.
- **Tela `/namesa`** (`NaMesaApp.jsx` + `components/namesa/`):
  - Login com restaurante + PIN (mesmo token de staff do `/caixa`; `GET /api/staff/restaurants?product=waitlist`).
  - Fila com Chamar/Sentou/Não veio/Editar/Remover, "+ Adicionar" manual, resumo do dia e aviso de WhatsApp desconectado.
  - Atualiza ao vivo pelo SSE (evento nomeado `waitlist`) e toca som quando alguém entra.
  - Aba Configurar com textos editáveis e "Imprimir QR da porta".
- **Rotas:** `/api/waitlist*` (admin e staff).
- Link "Acessar o Na Mesa" na tela de login. Chaves "Dashboard e CRM" / "Na Mesa" no cadastro de cliente.

**Bug achado no teste ponta a ponta (já corrigido):** quando o envio falhava (WhatsApp caído), a resposta direta do robô ("Pra quantas pessoas?") lançava exceção e pulava o aviso SSE. A entrada ficava gravada, mas a tela só via no refresh de 30s. Agora a falha de envio só vai pro log.

Testado:
- `node --test` com 225 testes passando.
- Local contra o banco de produção, com cliente de teste "Mercearia (teste)" em `cloud_api` falso e webhook assinado (`META_APP_SECRET=namesa_local_test` só no processo local). O fluxo inteiro passou: QR → nº de pessoas → posições, "Chamar" duplo (409, uma mensagem só), sentou/não veio, "quase lá" uma vez, sair, entrada manual, telefone inválido, tela atualizando ao vivo, salvar número e gerar o QR.
- Os envios falharam (token falso) e só foram pro log, como desenhado. Dados de teste apagados.

**Não testado:** envio real pelo Baileys (não há sessão local). O texto chega igual ao do webhook, mas falta confirmar com celular de verdade.

**Atenção:** o `initDb()` local já criou as colunas e tabelas novas **no banco de produção** (aditivo, inofensivo pro código atual em produção).

Pra colocar a Mercearia no ar (depois do merge/deploy):
1. Admin → Clientes → novo cliente "Mercearia", marcar só "Na Mesa".
2. Selecionar a Mercearia no seletor → Chaves e APIs → tipo Baileys, PIN, escanear o QR com o WhatsApp do restaurante.
3. `/namesa` → Mercearia → PIN → Configurar → número do WhatsApp → Imprimir QR da porta.
4. Teste real: ler o QR com outro celular.

Dica de teste: o botão "Imprimir QR" abre a janela de impressão do navegador. No Playwright isso trava a automação (ninguém fecha o diálogo), então teste o QR pela API (`GET /api/waitlist/qr`).

**Revisão final (revisor novo, depois do teste ponta a ponta).** Não houve nada crítico. Os 4 importantes já estão corrigidos (commit `5cbdde5`):
1. **Duas mensagens "FILA" quase juntas criavam duas entradas.** Agora há um índice único parcial `uq_waitlist_active_phone` (um registro ativo por telefone). Entrada ativa de mais de 12h é marcada `removed` antes de criar a nova. Telefone repetido na entrada manual devolve 400 "Esse telefone já está na fila."
2. **Mensagem de grupo podia acordar o robô.** Agora o robô só roda quando o `wa_id` é telefone (8 a 15 dígitos).
3. **9º dígito.** `phoneVariants` faz a busca da entrada achar o número com e sem o 9. **O envio** pra uma entrada manual ainda vai pro número como foi digitado: confirmar com celular real se chega pra contas sem o 9.
4. **"Imprimir QR" no tablet.** A janela agora é aberta dentro do clique, e o tablet não bloqueia mais.

Pendências pequenas (anotadas, não feitas):
- O pedido de "quantas pessoas" que fica sem resposta segura a conversa por 12h. Vale expirar em 30 a 60 min.
- As rotas `/api/waitlist` não conferem `waitlist_enabled`.
- Texto personalizado com nome vazio pode sair como "Olá , tudo bem?".
- O som toca também na entrada manual.
- A tela Configurar fica presa em "Carregando..." se a busca falhar.
- "Entraram hoje" conta quem desistiu antes de responder.
- Corrida rara: o "quase lá" pode chegar antes do "entrou".

**Atenção pra quem usar a Cloud API (não é o caso da Mercearia, que é Baileys):** entrada manual de quem nunca escreveu fica fora da janela de 24h. Texto livre é recusado pela Meta, e a falha só aparece no log.

### 2026-10-16 — Responsivo, tema claro/escuro e PWA nos 3 apps

Pedido do usuário antes do deploy: telas boas em qualquer aparelho, instalável no celular, e tema claro/escuro.

Decisões:
- **Escopo:** os 3 apps.
- **Deploy:** único no fim.
- **Instalação:** 3 apps instaláveis separados.
- **Cores:** as da Further em tudo.
- **Logos:** as claras no tema escuro e as escuras no claro.
- O usuário delegou os detalhes técnicos.

Spec: `docs/superpowers/specs/2026-10-15-responsivo-tema-pwa-design.md`. Plano: `docs/superpowers/plans/2026-10-15-responsivo-tema-pwa.md`.

**Tema:**
- Variáveis em `frontend/src/index.css`, com um bloco por `[data-theme="dark"|"light"]`. Os nomes antigos (`--bg-card`, `--text-primary`...) foram mantidos, e entraram novos (`--on-accent`, `--accent-link`, `--surface-subtle`, `--border-strong`, `--overlay`, `--bg-input`, `--bg-elevated`, `--chart-1..6`).
- O seletor é de atributo, então dá pra forçar uma parte da tela no claro.
- Um script inline no `index.html` aplica o tema antes do React (sem piscar).
- Botão sol/lua: `theme/ThemeToggle`. Escolha salva em `localStorage.theme`; sem escolha, segue o aparelho.
- **Testes do frontend:** o frontend agora tem `npm test` (`node --test`), com 51 testes.
  - Contraste WCAG AA nos dois temas (`theme/contrast.test.js`).
  - **Trava de cor fixa:** `theme/noHardcodedColors.test.js` falha se aparecer `#hex`/`rgba(` em qualquer `.jsx`. A exceção é marcar a linha com `cor-fixa-ok` (ex.: cor de etapa/tag que vai pro banco, que o backend exige em hex).
- **Armadilhas encontradas** (pra não repetir):
  - `var()` em atributo de SVG (`stroke=`, `fill=` do recharts) não é confiável no Safari. Os gráficos recebem cor resolvida (`resolveCssColor` / `resolveCssColorFor(valor, tema)` em `theme/useTheme.js`).
  - O **html2canvas 1.4** (PDF do relatório e da apresentação) quebra com `color(srgb ...)`, que é como o navegador entrega um `color-mix()` calculado. `theme/legacyColors.js` converte pra `rgba` na cópia (`onclone`).
  - **Relatório impresso/PDF sai sempre claro:** a área recebe `data-theme="light"` ao exportar. Conferido gerando o PDF de verdade.

**Tamanhos de tela:**
- Faixas: celular ≤640, tablet ≤1024 (`responsive/useBreakpoint`).
- Componentes novos: `components/ui/Sheet` (folha que sobe de baixo), `ResponsiveTable` (cartões no celular) e `Modal` em tela cheia no celular.
- **Na Mesa:** cartões com botões grandes, "+ Adicionar" flutuante e menu ⋯.
- **Caixa:** no celular funciona como o WhatsApp (abas embaixo, lista → conversa, o voltar do aparelho volta pra lista).
- **Dashboard:**
  - Logo da Further na barra lateral e no login.
  - No celular, os filtros ficam no botão "Filtros".
  - As tabelas viram cartões **só no celular** (no tablet/PC fica a tabela com ordenação).

**PWA:**
- `public/further|caixa|namesa.webmanifest` + `public/sw.js`, um único service worker.
- **Cache:** a navegação é rede-primeiro com fallback pro shell, os arquivos com hash vão pelo cache, e `/api` e `/r/` nunca passam por ele.
- **Manifesto e ícones:** `pwa/apps.js` escolhe o app pelo endereço.
- **Ícones:** em `public/icons/`, gerados por `frontend/scripts/generate_icons.py` (Pillow) a partir das logos em `public/brand/`.
- **Avisos na tela:**
  - Android: botão "Instalar".
  - iPhone: dica "Compartilhar → Adicionar à Tela de Início".
  - Sem internet: faixa "Sem conexão".
- **Conferido no build de produção servido pelo backend:** manifesto e ícone por app, service worker ativo, `/api` fora do cache.

**Conferência visual (Playwright):** os 3 apps em 375, 768 e 1280px nos dois temas. Achou e corrigiu:
- rótulos do topo vazando pro lado no celular;
- ícone do Na Mesa sumindo no fundo escuro;
- balão de mensagem invisível no claro;
- tiques de lida sumindo no balão;
- abas e botões cortados.

**Não testado:** instalação em Android/iPhone reais, nem o Safari de verdade (o Playwright usa Chromium).

**Ferramentas úteis que ficaram no scratchpad da sessão** (não commitadas): `colormod.cjs` (converte cor fixa pela tabela do plano) e o roteiro de screenshots via `browser_run_code_unsafe`.

**Revisão final (2026-10-16, revisor novo):** "pronto com correções". Os 9 itens abaixo foram corrigidos (commit `b45e0c2`), mais um teste que garante que `public/sw.js` e `src/pwa/swStrategy.js` têm a mesma regra (`swParity.test.js`). O service worker passou pra `further-shell-v2`:
1. ✅ Inbox do Further (WhatsApp & Conversões): mensagem recebida branca no branco no tema claro.
2. ✅ Caixa no celular: "Configurar funil" abre modal tela cheia sem botão fechar.
3. ✅ Caixa no celular: fechar a conversa por outros caminhos deixa entradas sobrando no histórico (voltar do Android "não faz nada").
4. ✅ Caixa no celular: formulário de venda manual sem voltar.
5. ✅ iPhone instalado no tema claro: relógio/bateria da barra de status invisíveis; `theme-color` não acompanha o tema ao abrir.
6. ✅ Inbox do Further rola pro lado no celular.
7. ✅ Link de documento / "Mídia indisponível" ilegíveis no balão enviado.
8. ✅ Chaves e APIs: abas selecionadas com texto marinho sobre cor (tema claro).
9. ✅ Service worker: não guardar resposta com erro como shell; não guardar index.html no lugar de JS que sumiu num deploy.
Menores anotados (não feitos): ícones lucide com var() no atributo podem sumir no Safari (testar no iPhone), tema não acompanha o sistema no Caixa celular sem toggle montado, safe-area duplicada embaixo no app iOS, 16px nos campos só até 640px, 44px mínimo em todos os botões até 1024px, rotação no Caixa perde a conversa aberta, sobras de cor na apresentação, Ctrl+P imprime no tema da tela, aviso de instalar aparece no PC e cobre a barra de abas, gráficos apertados no Dashboard WhatsApp no celular, chartColors recalculado a cada render.

O 5 virou `apple-mobile-web-app-status-bar-style: black` (barra preta com texto branco, legível nos dois temas). **Atenção:** o iOS só lê esse valor na hora de "Adicionar à Tela de Início".

**Deploy (2026-10-16):** o branch `feat/namesa` (Na Mesa + responsivo/tema/PWA) foi juntado na `main` e enviado ao GitHub a pedido do usuário ("depois disso pode subir tudo"), o que dispara o auto-deploy no Hostinger. Depois do deploy:
- conferir `https://furtherads.online/namesa`, `/caixa` e `/` no ar;
- seguir os passos de "Pra colocar a Mercearia no ar" (Registro 2026-10-15);
- instalar os PWAs num Android e num iPhone de verdade.

**Confirmado no ar (2026-10-16):** depois do push `c40a53d`, `https://furtherads.online/namesa.webmanifest` respondeu `application/manifest+json`, e `/namesa`, `/sw.js` e `GET /api/staff/restaurants?product=waitlist` responderam (lista vazia, porque a Mercearia ainda não foi cadastrada). Próximo passo é do usuário: cadastrar a Mercearia e testar com celular real.

### 2026-10-16 — Restaurante reconecta o WhatsApp sozinho (branch `feat/whatsapp-autoatendimento`)

**Contexto:** o usuário testou no Android e funcionou. No Na Mesa aparecia "nenhum restaurante". A causa: a Mercearia (`clients.id = 13`, "Mercearia Original") foi cadastrada, mas sem WhatsApp/PIN em Chaves e APIs (nenhuma linha em `whatsapp_settings`). A lista do `/namesa` exige isso, porque o PIN é o login da recepcionista.

**Pedido:** a equipe do restaurante, no Caixa e no Na Mesa, precisa poder escanear o QR sozinha, sem depender da agência.

**Feito:**
- Componente `components/WhatsAppConnect.jsx`: mostra o status, o QR grande com passo a passo e atualiza a cada 4s.
- **Caixa:** ícone "WhatsApp" no rail (PC/tablet) e "Conexão do WhatsApp" no menu "Mais" (celular). Faixa "WhatsApp desconectado: toque aqui pra reconectar", que consulta o status a cada 30s.
- **Na Mesa:** bloco no topo da aba Configurar e botão "Reconectar o WhatsApp" no aviso da fila. A mensagem da lista vazia agora explica o que falta.
- **Backend:** nada novo. `GET /api/whatsapp/baileys/status` já aceitava o token de staff, escopado no restaurante dele. Teste novo confirma que staff não enxerga outro restaurante.
- Conferido com um QR real gerado localmente, no celular e no PC, nos dois temas.

**Decisões:**
- Criar o cliente e definir o PIN (Baileys) continua com a agência, uma vez por restaurante.
- O restaurante **não** pode desconectar nem trocar o número, pra ninguém derrubar o atendimento sem querer.

**Pendente pro usuário:** em Chaves e APIs da Mercearia Original, escolher Baileys + PIN e salvar. Depois disso a recepcionista entra no `/namesa` e escaneia o QR ela mesma.

**No ar (2026-10-16):** push `c0bf49c`; confirmado que o bundle de produção já tem a tela de reconexão.

### 2026-10-16 — "Conectando" sem fim depois de desconectar pelo celular (branch `feat/whatsapp-reset`)

**Relato do usuário:** desconectou o aparelho pelo próprio celular (Aparelhos conectados → sair). No Na Mesa, a tela ficou em "Conectando ao WhatsApp..." pra sempre, sem gerar QR novo.

**Causa:** no logout (`statusCode 401`), o `baileysClient` parava de reconectar, mas deixava a sessão salva (`~/.further_baileys_sessions/<id>`) com credenciais inválidas. A próxima tentativa reusava essas credenciais, e o Baileys só gera QR quando não há sessão. Resultado: nunca saía QR.

**Correção:**
- **Logout:** agora apaga a pasta da sessão e recomeça depois de 5s, o que gera um QR novo. O teste antigo "logout não agenda reconexão" foi trocado por "logout apaga a sessão e recomeça".
- **`resetClient(clientId)`:** faz `sock.logout()` (o aparelho some do celular; se falhar, cai no `end`), apaga a sessão e abre uma conexão nova. Exposto em `POST /api/whatsapp/baileys/reset`, liberado pra staff e admin, sempre no próprio restaurante.
- **Socket descartado:** eventos de um socket que já foi descartado (`state.sock !== sock`) são ignorados, pra o fechamento do socket velho não brigar com o reset.
- **Tela `WhatsAppConnect` (Caixa e Na Mesa):**
  - depois de 45s sem conectar nem mostrar QR, aparece "Não conectou" com o botão **Gerar novo QR**;
  - com QR ou conectado, aparece **Desconectar / trocar número**, com confirmação.
- **Decisão do usuário:** a equipe do restaurante também pode desconectar e trocar o número (antes era só a agência).

**Testado:**
- Backend: 233 testes. Frontend: 52.
- Local: QR gerado → reset → QR novo e diferente, sem erro.
- **Não testado:** o logout feito pelo celular de verdade (precisa de aparelho); o caminho é coberto pelo teste com socket falso.

**No ar (2026-10-16):** push `305ba37`; o bundle de produção já tem "Desconectar / trocar número". Falta o usuário repetir o teste real: tirar o aparelho pelo celular e ver o QR novo aparecer sozinho.

### 2026-10-16 — "Em espera" depois do deploy + conectar com código (branch `feat/whatsapp-codigo`)

**"Gerar novo QR" voltava pra "Conectando..." em produção.** Causa confirmada pelo usuário: o status era **standby**. Depois do deploy `305ba37`, o processo antigo do Node continuou vivo no Hostinger e seguiu como dono da sessão (`owner.json`). O processo novo, que atende as requisições, ficou em espera. O usuário resolveu reiniciando o app Node.js no hPanel.
- **É a segunda vez que acontece** depois de um deploy (a primeira foi em 14/10). **Se aparecer "standby" depois de um deploy, reiniciar o app no hPanel.**
- Vale investigar à parte se dá pra o processo novo assumir sozinho no deploy (ex.: o antigo ceder ao receber SIGTERM, ou o novo forçar a posse na subida).

**Conectar com código:** pra quando o QR aparece no mesmo celular que tem o WhatsApp.
- `requestPairingCode(clientId, telefone)` em `baileysClient.js`. Espera o socket estar pronto (status `qr`, até 15s) e chama `sock.requestPairingCode(numero com DDI)` do Baileys. Devolve o código formatado `ABCD-1234`.
- Recusa: número inválido, WhatsApp já conectado e standby.
- Rota: `POST /api/whatsapp/baileys/pairing-code` (staff e admin, no próprio restaurante).
- Tela `WhatsAppConnect`: botão "Está no mesmo celular? Conectar com código" embaixo do QR, campo do número (o Na Mesa preenche com o número salvo no Configurar), código grande e passo a passo (Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone).
- O status `standby` agora aparece com texto próprio ("o servidor está reiniciando a conexão... avise a agência") em vez de "Conectando...".

**Testado:**
- Backend: 235 testes (2 novos, com socket falso). Frontend: 52.
- Tela no celular. Número inválido recusado.
- **Não testado:** gerar um código de verdade, porque precisa do número do restaurante (o WhatsApp manda notificação pro número informado). Confirmar com o usuário no celular dele.

**No ar (2026-10-16):** push `b50224c`; o bundle de produção já tem "Conectar com código". Falta o usuário testar um código de verdade no celular do restaurante.
