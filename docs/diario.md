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
  - Cada app é instalável como PWA, com ícone próprio. Ver Registro 2026-10-16. O Further mora em `/painel` (a raiz redireciona) desde 2026-10-17, pra o escopo dele não engolir o Caixa e o Na Mesa.
- Falta: cadastrar a Mercearia de verdade, testar a fila com celular real e instalar os PWAs num Android e num iPhone de verdade.
- **Relatório do dia do Na Mesa** (desde 2026-10-18, commit `f9d3507`): aba Relatório no `/namesa`, últimos 7 dias, planilha e impressão. Entradas com mais de 7 dias são apagadas sozinhas. Ver Registro 2026-10-18.

**Data de início dos dados (19/10, commit `761919f`, não enviado):** Alma, Giulí e Malibu só a partir de 05/10/2026. Falta o deploy e salvar a data nos 3 clientes. O Google do Alma está bloqueado: o refresh token do Google venceu (o sync do Recreio também para) e falta o customer ID do Alma. Ver Registro 2026-10-19.

**Reservas pelo WhatsApp: no ar desde 21/10 15:36** (push `7c5f1a4`, que levou junto os commits pendentes de 19/10: data de início e login de grupo). Malibu ligado (`reservations_enabled`, mesas 2×2/2×4/2×6, turnos do spec, robô ligado, plano B desligado). Falta do usuário: conectar o número novo dos anúncios no Caixa do Malibu (WhatsApp → trocar número), deixar sem saudação/ausência automática, e o teste real. Ver Registro 2026-10-21.

**Dois processos do Node no Hostinger (22/10):** corrigido na branch `fix/baileys-multiprocesso` (commit `9413d7c`, **não enviado**): ponte pelo banco, qualquer processo envia. Falta o deploy fora do horário de serviço e conferir no log. Provavelmente era também a causa do **standby depois de deploy**. Ver Registro 2026-10-22. Já aconteceu 3 vezes (14/10, 16/10, 18/10): o processo antigo continua dono da sessão e o novo fica em `standby` até alguém reiniciar o app no hPanel. Ver Registro 2026-10-18 (continuação).

**Mercearia trocando de número (18/10):** sessão resetada, status `qr`. Falta o usuário escanear com o número novo, trocar o "WhatsApp do restaurante" no Configurar e reimprimir o QR da porta. **Baixa prioridade** (usuário, 19/10): a Mercearia ainda está testando com números diferentes (primeiro o do gerente, depois o da atendente) e pode trocar de novo. Trocar de número é rotina, não um problema a resolver.

**Scripts de token** (`backend/scripts/`: `get-meta-long-lived-token.js`, `update-google-token-db.js`, `update-meta-token-db.js`, `validate-google-token.js`, opção `OUTPUT_FILE` no `get-google-refresh-token.js`) e o `AGENTS.md` (cópia do CLAUDE.md pro Codex) foram commitados em 21/10 a pedido do usuário. Nenhum tem segredo: leem tudo de variável de ambiente ou arquivo local.

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

### 2026-10-16 — Na Mesa: voltar pra fila e desfazer saída (branch `feat/namesa-voltar-fila`)

Pedido do usuário (escolheu a opção C):
- quem foi **chamado** pode voltar pra fila **no mesmo lugar** ou **no fim**;
- dá pra **desfazer "Sentou" / "Não veio" / "Remover"** marcados por engano.

**Como ficou:**
- **Transições novas em `waitlistQueue.js`:**
  - `requeue`: chamado → esperando, mantém o `joined_at` (mesmo lugar). Mensagem `requeued`: "Sua mesa ainda não ficou pronta, mas você continua na fila. Posição: X."
  - `requeueEnd`: chamado → esperando com `joined_at = agora` (fim da fila) e `notified_near = false`. Mensagem `requeuedEnd` com posição e espera.
  - `restore`: sentou/não veio/saiu/removido → esperando no mesmo lugar, **sem mensagem**.
- As duas mensagens novas aparecem no Configurar e podem ser editadas.
- Depois de `requeue`/`requeueEnd`, se a pessoa já cai perto da vez, o "quase lá" fica marcado como enviado (não manda logo em seguida).
- **Pessoa que já entrou de novo pelo WhatsApp:** o `restore` esbarra no índice único (um registro ativo por telefone) e devolve 409 "Essa pessoa já está na fila de novo".
- **API:** `GET /api/waitlist` devolve `recent` (quem saiu nas últimas 2h). Rotas novas: `POST /api/waitlist/:id/requeue|requeue-end|restore`.
- **Tela:**
  - card chamado com "Voltar pra fila" e "Fim da fila" (no celular, dentro do ⋯);
  - seção "Saíram há pouco" com "Voltar pra fila".

**Testado:**
- Backend: 240 testes (5 novos). Frontend: 52.
- Ponta a ponta local por webhook:
  - chamar → voltar pro mesmo lugar: posição 1;
  - chamar → fim da fila: posição 3;
  - sentou → desfazer: voltou pra posição 1;
  - desfazer de novo: 409, sem duplicar.
- Tela conferida no celular e no PC.

**No ar (2026-10-16):** push `b30ebaa`; o bundle de produção já tem "Saíram há pouco" e "Voltar pra fila".

### 2026-10-17 — Caixa abria dentro do app do Further (escopo do PWA)

**Relato do usuário (Android):** instalou o Further e depois tentou instalar o Caixa. O Chrome disse que o app "já está instalado", e a partir daí abrir o app do Further levava direto pro Caixa.

**Causa:** o manifesto do Further tinha `scope: "/"`, que **engloba** `/caixa` e `/namesa`. No Android, o app instalado registra todo endereço dentro do escopo como dele. Então `/caixa` virou "parte do Further": o Chrome não oferece instalar de novo, abre o Caixa dentro da janela do Further, e o app do Further reabre na última página aberta (o Caixa). Os `id` dos manifestos já eram diferentes; o problema era só o escopo sobreposto.

**Correção (commit `040296e`):**
- `further.webmanifest`: `start_url` e `scope` passam a ser `/painel`. O `id` continua `/`, pra o Chrome tratar como o mesmo app e poder atualizar o já instalado.
- `main.jsx`: a raiz `/` troca o endereço pra `/painel` (`history.replaceState`, mantém query e hash) antes de escolher o app. Regra em `canonicalPath` (`pwa/apps.js`). O dashboard não usa rotas por caminho, então nada mais muda.
- Teste novo em `manifests.test.js`: falha se o escopo de um app englobar o `start_url` de outro, ou se dois `id` se repetirem.
- Testes do frontend: 54 passando. Build ok. Conferido no `vite preview`: `/` vai pra `/painel` com o manifesto do Further, e `/caixa` fica com o dele.

**Pro usuário, depois do deploy:** no Android, desinstalar o app do Further (e o do Caixa, se tiver), abrir `furtherads.online` no Chrome e instalar de novo; depois abrir `/caixa` e instalar o Caixa. O Chrome até atualiza o app antigo sozinho, mas pode demorar dias.

**No ar (2026-10-17):** push `3b49faf`; em produção o `further.webmanifest` já tem escopo `/painel`, `/painel` responde 200 e o bundle tem o redirecionamento. Falta o usuário reinstalar os apps no Android.

### 2026-10-17 — Na Mesa mudo: conexão Baileys zumbi (sábado, em pleno serviço)

**Relato do usuário (~18h):** o Na Mesa parou. Quem lia o QR e mandava mensagem não recebia resposta, e a tela mostrava "tentando conexão". O usuário achou que era o deploy do escopo do PWA, mas não era: os deploys foram às 12:47 e 13:50, e a fila funcionou a tarde toda depois disso.

**Diagnóstico (pelo banco de produção):**
- A última mensagem recebida da Mercearia foi às **17:48:38**. Esse número recebe algo quase todo minuto (status, grupos, clientes), então o silêncio era anormal.
- As mensagens pro Fabiano às 17:59 (entrada manual) saíram com id, mas **nunca** foram confirmadas (ficaram `sent`). Antes disso, tudo virava `read`/`delivered`.
- Ou seja, uma **conexão zumbi**: `connected` no servidor, sem chegar nada nos dois sentidos, e sem nunca disparar `close`.
- O keepalive do Baileys 7.0.0-rc14 derruba o socket se não chegar **nenhum frame** em ~35s. Então o servidor do WhatsApp seguia respondendo o ping, mas parou de entregar mensagens e recibos (ou o buffer de eventos do Baileys travou; não dá pra saber sem log). Um ping a mais não pegaria isso.

**Resolvido na hora:** o usuário reiniciou o app Node.js no hPanel. Às 18:05:12 a mensagem voltou a entrar, e às 18:05:14 o robô respondeu "FILA" (mensagem lida).

**Correção (commit `7356aa8`, ainda não enviada):** vigia em `baileysClient.js`, que roda a cada 60s só no processo dono. A conexão aberta é descartada e reaberta com a sessão salva (sem QR, mesmo padrão do reset: `state.sock = null`, `end`, `connectClient` depois de 5s) quando:
- uma mensagem enviada por `sendViaBaileys` passa **90s sem `messages.update`** e **nenhum outro evento chegou desde o envio**;
- **nenhum evento** (`messages.upsert`, `messages.update`) chega por **20 min**.

Detalhes:
- **Por que não só "sem confirmação":** no histórico, 23 de ~250 mensagens da fila nunca foram confirmadas, mesmo com a conexão boa (número digitado errado, sem WhatsApp). Isso daria reconexão falsa toda noite.
- **O Baileys não emite `messages.update` no ack do servidor**, só nos recibos (`sender`/entrega/leitura).
- A regra pura `connectionHealth` está exportada e testada, assim como `checkConnections(deps)`. `applyMessageStatus` é injetável no teste.
- O motivo aparece como última queda em Chaves e APIs, com código `vigia`.
- Backend: 248 testes passando.

**Observar depois do deploy:**
- Se o Malibu (número mais quieto) ficar reconectando a cada 20 min, aparece nos logs como `vigia -- nenhum evento...`. Se isso incomodar, aumentar `SILENT_RECYCLE_MS`.
- **Malibu sem nenhuma mensagem recebida desde 12:35 de 17/10**, nem depois do restart. Pedi pro usuário conferir em Chaves e APIs se está conectado.

**Deploy:** não subir durante o serviço do restaurante. O deploy reinicia o servidor e já deixou a conexão em `standby` duas vezes (ver 2026-10-14 e 2026-10-16).

**Continuação (17/10, ~19h):** o usuário relatou que "desconectou de novo e não está respondendo", e pediu deploy urgente sem perder a fila. A fila fica no Postgres, então deploy não apaga.
- O vigia (`7356aa8`) foi enviado, junto com o diário (push `877c515`).
- **Achado o problema que ele estava vendo:** toda entrada **manual** com celular de Goiás (55 62/64 + 9 + 8 dígitos) **nunca recebeu nada**, nem em 16/10 nem em 17/10 (status `sent` pra sempre).
  - Essas contas estão no WhatsApp **sem o 9**: os `wa_id` que chegam pelo QR têm 12 dígitos, ex. `556296952514`.
  - Números de SP (11) com o 9 chegavam normalmente.
  - Era o risco 3 da revisão de 15/10 ("o envio pra entrada manual vai pro número como foi digitado").
- **Correção `c68b043`:** `sendViaBaileys` → `resolveJid`. Pra número com variante (`phoneVariants`), chama `sock.onWhatsApp(com e sem o 9)` com timeout de 8s, usa o `jid` que existe e guarda em cache (`clientId:waId`, em memória). Se falhar, manda como está. Backend: 250 testes passando.
- Deploy `c68b043`: o servidor ficou fora das 19:21:46 às 19:27:01 e voltou recebendo **sem standby e sem QR**. Fila conferida, 8 ativos.
- **Falta confirmar:** a primeira mensagem pra uma entrada manual de Goiás chegando `delivered` depois do deploy.
- Pra recepcionista nada muda: ela continua digitando com o 9.

### 2026-10-18 — Na Mesa: relatório do dia (commit `f9d3507`)

**Pedido do usuário:** a tela só mostrava as contagens do topo e não quem passou pela fila. Ele quer gerar um relatório do fim do dia com as pessoas e quantas foram, de pelo menos os 5 dias anteriores. Depois disso o sistema pode apagar ("precisa ter essa rotatividade"). Pediu pra fazer e subir; estava saindo e não podia responder perguntas, então as decisões abaixo foram minhas.

**Decisões (minhas, dá pra mudar):**
- **Retenção de 7 dias de serviço** (hoje + 6 anteriores), acima dos 5 pedidos. `RETENTION_DAYS` em `services/waitlistReport.js`.
- **O dia de serviço vai das 05:00 às 05:00 de Brasília**, pra o jantar que passa da meia-noite não ser cortado em dois relatórios. Brasília tratado como UTC-3 fixo.
- **A limpeza apaga só `waitlist_entries`.** O contato e as mensagens do WhatsApp (`whatsapp_contacts`/`whatsapp_messages`) continuam.
- Quem nunca respondeu quantas pessoas eram aparece como "Não respondeu" e não conta nos grupos.

**Como ficou:**
- `services/waitlistReport.js` (testado, 6 testes): `serviceDayOf`, `serviceDayRange`, `recentServiceDays`, `buildReport` (grupos, pessoas, sentaram, pessoas sentadas, não vieram, saíram, removidos, não responderam, espera média e máxima) e `loadReport`. A espera é `finished_at - joined_at` de quem sentou; o `joined_at` é renovado no `requeueEnd`. `purgeOldEntries` apaga o que é anterior ao dia mais antigo da retenção, pra todos os restaurantes.
- Rota `GET /api/waitlist/report?day=YYYY-MM-DD` (staff e admin). Dia fora da janela cai pra hoje.
- `server.js`: a limpeza roda na subida e a cada 6h.
- **Frontend:** aba **Relatório** no `/namesa` (`components/namesa/WaitlistReport.jsx`):
  - botões com os 7 dias e o número de grupos de cada um;
  - cartões com o resumo e a lista (tabela no PC, cartões no celular);
  - **Baixar planilha** gera um CSV com `;` e BOM, que abre direto no Excel em português;
  - **Imprimir / PDF** abre uma janela de papel sempre clara.
  - A formatação e a exportação ficam em `reportExport.js`, que é testado.

**Conferido:**
- Backend 256 testes, frontend 57, build ok.
- `loadReport` rodado contra o banco de produção (só leitura) pra Mercearia: 17/10 deu 41 grupos, 164 pessoas, 26 sentaram (113 pessoas), 13 não vieram e espera média de 29 min.
- A entrada mais antiga no banco era de 16/10, então a primeira limpeza não apaga nada.

**Não conferido:** a tela no navegador (não tenho o PIN da Mercearia) e o download do CSV no app instalado do iPhone. Se o iPhone não baixar, o "Imprimir / PDF" serve de alternativa.

**Deploy:** subido no domingo 18/10 por volta de 12h, com a fila vazia (0 ativos).


**Depois do deploy (18/10, ~12h):**
- Bundle novo confirmado no ar (`Relatório da fila` presente).
- **Observar:** a Mercearia não recebia nenhuma mensagem desde 02:45 BRT (e o Malibu desde 15:35 de 17/10). Nos 15 min depois do deploy também não chegou nada.
- Pode ser só domingo de manhã parado, mas também pode ser desconexão ou standby. Não consegui ver o status, porque a rota precisa de login e eu não tinha token.
- Pedi pro usuário abrir Na Mesa → Configurar e, se não estiver "Conectado", reiniciar o app no hPanel ou gerar QR novo.
- Este registro **não foi enviado** ao GitHub, pra não disparar outro deploy à toa.

**Continuação (18/10, ~13:40) — Mercearia trocando de número:**
- O usuário relatou que o Na Mesa ficava "tentando reconectar" e pediu pra desconectar a Mercearia, porque ela vai usar outro número.
- O status era **`standby`**: o processo antigo continuou dono da sessão depois do deploy. **É a terceira vez** (14/10, 16/10 e 18/10). Isso explica também o silêncio desde cedo.
- O usuário reiniciou o app no hPanel. Às 13:43 saiu do standby, e eu chamei `POST /api/whatsapp/baileys/reset` com o token de staff da Mercearia (PIN passado pelo usuário). O status virou `qr`, esperando o número novo ser escaneado.
- **Pendente pro usuário:**
  - escanear com o número novo;
  - trocar o "WhatsApp do restaurante" no Configurar;
  - reimprimir o QR da porta (o atual aponta pro número antigo).
- **Prioridade:** resolver o standby depois de deploy. O processo novo precisa assumir sozinho a sessão (ex.: o antigo ceder no SIGTERM, ou o novo forçar a posse na subida). Hoje todo deploy pode exigir restart manual.

### 2026-10-19 — Data de início dos dados por cliente + Google do Alma (commit `761919f`, não enviado)

**Pedido do usuário:** Alma, Giulí e Malibu só contam a partir de **05/10/2026**. O que vem antes era de outro gestor e não deve aparecer. Incorporar o Google do Alma. O Google da Giulí e do Malibu ainda não está vinculado à MCC da Further: o usuário vai vincular e avisar, e aí é só colocar pra sincronizar.

**Feito:**
- Coluna `clients.data_start_date` (DATE, aditiva). Campo "Mostrar dados de anúncio a partir de" no cadastro do cliente, e a data aparece no cartão.
- `syncService.js`: `dropRowsBeforeStart` filtra antes de gravar, no Google (`syncPlatformForClient`) e no Meta (`syncMetaAccountGroup`, por `resolvedClientId`; `getMetaAccountMembers` agora traz `dataStartDate`).
- `purgeMetricsBeforeStart`: apaga `daily_metrics` anteriores à data e as campanhas que ficaram sem métrica. Roda no `updateClient` quando a data é definida ou muda. Os dados podem voltar com um sync se a data for removida, mas só dentro da janela de 30 dias.
- Testes: backend 258, frontend 57, build ok.

**Medido no banco (só leitura):** antes de 05/10 há 69 linhas do Alma (R$ 2.504,29, 5 campanhas) e 87 da Giulí (R$ 1.412,78, 6 campanhas). O Malibu não tem nada antes de 06/10.

**Bloqueado:**
- **O refresh token do Google está vencido** (`invalid_grant: Token has been expired or revoked`, conferido com `scripts/validate-google-token.js 5`). O Recreio sincronizou o Google pela última vez em 19/10. O usuário precisa gerar um novo (`get-google-refresh-token.js`) e gravar com `update-google-token-db.js`.
- **Alma não tem credencial Google no banco** e eu não sei o customer ID. Com o token novo dá pra listar as contas da MCC (`customer_client`) e achar o do Alma. A credencial é a mesma do Recreio (client_id/secret/refresh/developer token, `login_customer_id` = MCC 6729846360), mudando só o `customer_id`.

**Pendente:** o usuário confirmar o deploy e o apagamento. Depois do deploy, editar Alma, Giulí e Malibu, colocar 05/10/2026 e salvar (isso apaga o que vem antes).

**Continuação (19/10):** o refresh token Google do Recreio foi renovado com o perfil Trabalho do Chrome e gravado no banco, e foi validado: lista as campanhas. A MCC da Further (6729846360) hoje só enxerga o Recreio (9270706247). **O Alma ainda não está vinculado à MCC**, então ainda não dá pra cadastrar o Google dele. O push dos commits `761919f`/`490eff4` foi bloqueado pela permissão do Claude Code; o usuário vai fazer o push ou liberar.

### 2026-10-19 (continuação) — Login de grupo "grupojf" (commit `d91a5d9`)

**Pedido do usuário:** Recreio, Alma, Giulí e Malibu são do mesmo dono, que precisa de um único login com a visão de cliente e um seletor pra trocar de restaurante. O usuário (`grupojf`) e a senha foram passados por ele. A senha não fica registrada aqui.

**Como ficou:**
- Tabela `user_clients(user_id, client_id)`. O usuário continua `role = 'client'`, com `client_id` = Recreio (5) como padrão.
- O token traz `clientIds`. `scopeGroupClient` (`authMiddleware.js`, testado) troca `req.user.clientId` pelo `clientId` da query, do corpo ou do cabeçalho `X-Client-Id`, mas **só se estiver na lista**. O resto do backend não mudou, porque continua lendo `req.user.clientId`.
- `/api/auth/login` e `/me` devolvem `user.clients`. `GET /api/clients` devolve os restaurantes do grupo.
- Frontend: o `AuthContext` manda o `X-Client-Id` em toda requisição. A Navbar mostra o seletor sem "Todos". O campo do login virou "E-mail ou usuário" (`type="text"`).
- **Usuário criado no banco de produção:** id 10, "Grupo JF", ligado aos clientes 5, 7, 8 e 9.
- **Testado local contra produção:** o login devolve os 4 restaurantes, `clientId=7` traz o Alma, e `clientId=13` (Mercearia, fora do grupo) cai no Recreio.
- Não dá pra dar acesso de grupo pela tela ainda. Hoje é só pelo banco (`INSERT INTO user_clients`).

### 2026-10-19 (continuação) — Google do Alma na dash (sem MCC)

- O login Google da agência (o mesmo OAuth do Recreio) **já tem acesso direto** à conta do Alma: **Alma Boutique Bar, 117-570-8507**. `customers:listAccessibleCustomers` também mostra Dr. Diego Rosado, Egen, Garage Kustom, Dr Alexandre Peleja e a 9574463331 (sem permissão).
- Cadastrada a credencial `google` do Alma (client 7): é a cópia da do Recreio com `customer_id` 117-570-8507 e **sem** `login_customer_id`, porque o acesso é direto e não pela MCC. O sync deu ok: 1 campanha ("ALMA - PMax GMN - Restaurante - Goiania"), 7 dias.
- **Atenção:** o refresh token agora está copiado em 2 linhas de `credentials` (clientes 5 e 7). Ao renovar o token, atualizar as duas.
- **Convite da MCC pela API** (`customerClientLinks:mutate` + aceite em `customerManagerLinks`): bloqueado pelo modo auto ("Permission Grant"). Script pronto no scratchpad da sessão (`link-mcc.mjs <customerId>`). O usuário manda o convite pela interface da MCC.
- **Data de início 05/10:** o apagamento pelo script foi bloqueado pelo modo auto. O usuário vai salvar a data pela tela de Clientes em Alma, Giulí e Malibu.

### 2026-10-21 — Reservas pelo WhatsApp (branch `feat/reservas`, não enviado)

**Pedido do usuário:** o Malibu vai rodar anúncios de engajamento que abrem o WhatsApp, com perguntas prontas. Uma delas é "Quero fazer uma reserva (cód. RESERVA)". Ele quer um robô que faça a reserva sozinho: pessoas, dia, horário e nome, conferindo vaga pelas mesas de cada restaurante e caindo na agenda. Depois vale pros outros clientes.

**Decisões do usuário:**
- A reserva mora no **Caixa**, não no Na Mesa, porque é onde estão o funil e a origem do anúncio.
- **Mesas por tamanho**, editáveis, com exceção por data. O sistema desconta o que já está reservado. O Malibu começa com 2 de 2, 2 de 4 e 2 de 6.
- **Horários do Malibu:**
  - seg a qui das 17:00 às 23:30;
  - sex a dom das 12:00 às 15:30 e das 18:00 às 23:30.
- **O cliente não precisa saber que fala com um robô.** Nenhum texto diz "robô", e aparece "digitando..." antes de cada resposta.
- **Quando o atendente responde, o robô pausa.**
- A origem do lead continua vindo do cartão do anúncio (`externalAdReply`), não do código. O `RESERVA` só diz o que a pessoa quer. Em Link Rastreável, o código do link já basta.
- Valores padrão aceitos:
  - confirma na hora;
  - mesa ocupada por 2h;
  - tolerância de 15 min;
  - reserva de 2h a 30 dias de antecedência;
  - grupo acima da maior mesa vai pra equipe;
  - plano B "toda conversa de anúncio pergunta se quer reservar" **desligado**.

**Decisões minhas:**
- Último horário de reserva = fechamento − 1h, de 30 em 30 min.
- Com reservas ligadas, "Agendar" vira "Nova reserva" (a reserva é dona do `appointment_at`).
- Cancelar, "não veio" e "chegou" não mexem no card.

Spec: `docs/superpowers/specs/2026-10-21-reservas-design.md`. Plano: `docs/superpowers/plans/2026-10-21-reservas.md`.

**Como ficou:**
- **Serviços puros (testados):**
  - `reservationSlots.js`: horários, vaga por tamanho e ocupação. Uma reserva das 22:30 ocupa até 00:30.
  - `reservationText.js`: "sábado", "dia 5", "25/10", "19h30", número da lista, SIM, CANCELAR estrito. "12"/"13" valem como hora quando estão na lista.
- **`reservationStore.js`:** gravação em transação com `pg_advisory_xact_lock(900000 + client_id)`. Sincroniza `appointment_at` e chama `moveToAutoStage('agendado')`, que dispara o evento Meta da etapa.
- **`reservationBot.js`:** a conversa (estado em `reservation_conversations`, que expira em 60 min).
  - Trata uma mensagem por vez por contato, com uma fila em memória.
  - Se não entende 2 vezes, ou o grupo é grande demais, manda "Só um instante, já te respondo 🙂", pausa e avisa o Caixa ("Precisa de atendimento", com som).
- **Pausa (`botPause.js`, `whatsapp_contacts.bot_paused_until`, 12h):**
  - As mensagens do robô são gravadas **antes** de enviar, com id próprio (`sendMessage(..., { messageId })` do Baileys). Assim o eco cai no `ON CONFLICT`.
  - Qualquer outra mensagem de saída nova pausa o robô, inclusive a resposta pelo celular. O robô da fila também passou a marcar `sent_by = 'bot_fila'`.
  - Saída até 10s depois da última recebida **não** pausa: é resposta automática do WhatsApp Business.
- **Banco** (`initDb`, aditivo): `clients.reservations_enabled`, `whatsapp_contacts.bot_paused_until`, `whatsapp_messages.sent_by`, `reservation_settings` (JSONB), `reservations` e `reservation_conversations`.
- **Rotas:** `/api/reservations*` (staff e admin) e `/api/whatsapp/contacts/:id/bot[/pause|/resume]`. Chave "Reservas pelo WhatsApp" no cadastro do cliente.
- **Caixa:**
  - item **Reservas**, só pra restaurante com a chave ligada: dia, ocupação por horário, Chegou / Não veio / Cancelar (com aviso pelo WhatsApp) / Editar, e "+ Reserva" manual com "acima do limite";
  - **Configurar:** mesas, datas especiais, turnos, números e textos;
  - no painel do contato, "Robô atendendo / Pausar robô / Retomar".

**Testado:**
- `node --test`: backend 354, frontend 64. Build ok.
- **Ponta a ponta 27/27**, com backend local na porta 5055 contra o **banco de produção**. Usou o cliente de teste "Reservas (teste)", webhook assinado e Cloud API falsa, e o cliente foi apagado depois. Cobriu:
  - anúncio → reserva → card "Agendado";
  - corrida pela última mesa;
  - pausa e retomada;
  - cancelamento pelo cliente e pela equipe;
  - reserva manual com 409 e com `force`;
  - frase comum ignorada;
  - chave no cadastro.
- Telas no Playwright: PC no tema escuro e celular no claro.
- **Atenção:** o `initDb` local já criou as colunas e tabelas novas **no banco de produção** (aditivo, inofensivo).
- Revisão final por revisor novo: "com correções". Os 4 importantes foram corrigidos, mais 2 menores reclassificados (commit `2ec6051`).

**Não testado:** Baileys real, ou seja, o eco com `messageId` próprio, o "digitando..." e a janela de 10s da saudação. Conferir no teste real.

**Menores anotados (não feitos):**
- O aviso de cancelamento da equipe pode pausar o robô (eco antes da gravação).
- "cancelar" aciona fila e reserva juntos.
- Configuração com tipo errado dá 500.
- A antecedência mínima não é revalidada no SIM.
- "Agendar" aparece por um instante antes de virar "Nova reserva".

**Fase 2 (combinada no spec):** lembrete 3h antes, "não veio" automático, reservas e custo por reserva por campanha no Dashboard WhatsApp, relatório por dia.

**Pra colocar o Malibu no ar (depois do usuário mandar subir):**
1. Juntar `feat/reservas` na `main` e enviar **fora do horário de serviço do Malibu**. Se o WhatsApp ficar em `standby`, reiniciar o app no hPanel.
2. Admin → Clientes → Malibu → marcar "Reservas pelo WhatsApp".
3. Caixa do Malibu → Reservas → Configurar:
   - mesas 2×2, 2×4, 2×6;
   - turnos seg–qui 17:00–22:30 e sex–dom 12:00–14:30 + 18:00–22:30;
   - salvar.
4. **No celular do Malibu, desligar a saudação e a mensagem de ausência automáticas do WhatsApp Business**, se existirem. A janela de 10s cobre o caso comum, mas é melhor não depender dela.
5. Anúncio: mensagem pronta "Quero fazer uma reserva (cód. RESERVA)".
6. Teste real: clicar no anúncio com outro celular, fazer a reserva e conferir a aba Origem e a tela Reservas.

**Incidente meu:** o commit `dbbd3f8` (spec, na `main`, sem push) usou `git commit -a` e levou junto a alteração do usuário em `backend/scripts/get-google-refresh-token.js` (opção `OUTPUT_FILE`, sem segredo). O histórico não foi reescrito. O usuário decide se mantém. Daqui pra frente, nunca usar `commit -a` neste repo, porque há arquivos de propósito fora dos commits.

**Deploy (21/10, ~15:30):** o usuário mandou subir tudo e manter no commit a alteração do script do token. O push `1fbe709..7c5f1a4` foi feito daqui, e o bundle novo confirmou às 15:36. O Malibu foi configurado direto no banco pelo `saveReservationSettings`. O Malibu vai usar um **número novo**, só pros anúncios, ainda sem mensagens e sem saudação. O WhatsApp atual do Malibu não recebia nada desde 17/10. Como a data de início (19/10) foi junto, falta salvar 05/10/2026 em Alma, Giulí e Malibu pela tela de Clientes.

### 2026-10-22 — Caixa sem conseguir enviar: dois processos do Node ao mesmo tempo (diagnóstico)

**Relato do usuário:** à tarde o cliente não conseguia enviar mensagem no Caixa ("desconectado"). O usuário reiniciou o app no hPanel por fora de casa. Mandou o log do Hostinger.

**O que o log mostra:**
- 16:13: o vigia renovou Mercearia (13) e Malibu (9) normalmente.
- **16:29:16.716 e 16:29:16.764: duas linhas "rodando na porta 5000", com 48 ms de diferença**, e três avisos "App did not call listen() within 3 seconds". O Hostinger subiu **dois processos novos ao mesmo tempo** (não é processo velho de deploy: não houve deploy hoje, e os dois são novos).
- 16:30 a 16:43: 10 erros "Conexão WhatsApp (Baileys) não está ativa" no `replyToConversation`.
- 16:40:48: queda normal do Malibu (503), que reconecta sozinha.
- 16:51:56: o restart do usuário subiu **um** processo só, e os erros pararam.

**Causa (hipótese forte, explica tudo):** o Hostinger reparte as requisições entre os processos. Os dois gravam `owner.json` na subida; só um fica dono e conecta o WhatsApp, o outro fica em `standby`. Toda requisição que cai no processo em standby falha no envio (e o status que a tela mostra depende de qual processo respondeu). O SSE também é em memória, então o Caixa ligado ao processo errado não recebe mensagem nova ao vivo. O desenho atual (`baileysClient.js`) supõe um processo só atendendo. Os "standby depois de deploy" de 14/10, 16/10 e 18/10 provavelmente eram isso, e não o processo antigo vivo.

**Achado à parte (segurança):** a libsignal do Baileys imprime "Closing session" no log com as chaves da sessão do WhatsApp (`privKey`, `rootKey`). Silenciar.

**Pendente:** o usuário escolher a correção (processos sem dono repassam o envio pro dono pelo Postgres, e o status e os eventos SSE também passam pelo banco).

**Correção feita (22/10, branch `fix/baileys-multiprocesso`, commit `9413d7c`, não enviada).** O usuário escolheu a ponte pelo banco (discutiu PM2, nodemon, VPS e Evolution API antes; ver abaixo).
- `services/processRelay.js` + tabelas `baileys_relay`, `baileys_status`, `sse_relay` (aditivas, já criadas no banco de produção pelo teste local):
  - **Pedidos ao dono:** `sendViaBaileys`, `resetClient` e `requestPairingCode` num processo que não é dono gravam o pedido; o dono (`startRelayWorker`, a cada 500 ms) executa e grava o resultado. Quem pediu espera até 25 s. Pedido que ninguém pegou em 20 s é cancelado, pra não sair repetido depois.
  - **Status:** o dono publica a cada mudança e no heartbeat de 10 s; `getSharedConnectionState` lê dali (publicação com mais de 60 s não vale). `getBaileysStatus` usa `ensureConnection`.
  - **SSE:** `sseHub.broadcast` entrega local e grava em `sse_relay`; cada processo lê a cada 1 s os eventos dos outros (`deliverLocal`). Limpeza: relay 1 h, eventos 10 min.
  - Não dá LISTEN/NOTIFY: o `DATABASE_URL` é o pooler de transação (6543).
- **Envio durante queda:** o dono espera até 10 s a reconexão (só em `connecting`/`disconnected`; QR e standby falham na hora).
- **`server.js`:** `listen()` antes do `initDb()`; a API responde 503 até o banco ficar pronto. A subida loga o id do processo, e o Baileys loga qual processo assumiu.
- **Log:** `utils/quietLibsignal.js` tira o objeto da sessão das linhas da libsignal.
- `BAILEYS_AUTOCONNECT=false` (backend local) desliga também a troca de eventos entre processos.
- **Testado:** backend 369 testes. Dois processos locais (portas 5101/5102) com a mesma pasta de sessões contra o banco de produção: o não dono mostrou o QR publicado pelo dono, o envio dele voltou com a resposta do dono, e um Caixa ligado nele recebeu os eventos gerados no outro. Linhas de teste apagadas; nenhuma mensagem saiu.
- **Não testado:** envio de verdade pela ponte (os processos locais não têm sessão do WhatsApp). Conferir depois do deploy: no log do Hostinger, se aparecerem dois "rodando na porta 5000", as respostas pelo Caixa devem sair mesmo assim.
- **Deploy:** fora do horário de serviço (Malibu fecha 23:30).

**Discussão com o usuário (pra não repetir):** PM2 e nodemon não resolvem na hospedagem gerenciada (quem sobe os processos é o Hostinger). Uma VPS com 1 processo (PM2) resolveria esse problema, mas não as quedas do lado do WhatsApp; a Evolution API usa o Baileys por baixo e exigiria refazer a integração. Decisão: ponte pelo banco agora; VPS fica pra pensar se o produto crescer.

**"📩 Mensagem" (22/10, commit `e08dc79`, mesma branch, não enviado).** O usuário perguntou o que era o envelope no Caixa do Malibu. É o rótulo genérico de tipo não reconhecido: no banco havia 97 (1 no Malibu, chegou 1 s depois da resposta do Caixa; 96 na Mercearia). O tipo cru não era guardado. `baileysMapper.js` agora:
- abre os embrulhos (conversa temporária, visualização única, documento com legenda, mensagem editada, entre outros);
- dá rótulo a recado de vídeo (baixa como vídeo), enquete, evento, convite de grupo e respostas de botão/lista;
- não deixa virar mensagem os avisos sem conteúdo (álbum, fixar, "manter na conversa", só `messageContextInfo`).

Visualização única não é baixada: o WhatsApp não manda pra aparelho conectado. O que ainda cair em "📩 Mensagem" loga `tipo de mensagem não reconhecido (...)`; olhar o log depois do deploy. As 97 antigas continuam como estão. Backend: 378 testes.

**Bolinha no ícone + notificações push (22/10, commit `9ac43ea`, mesma branch, não enviado).** Pedido do usuário: número no ícone dos apps instalados, como o WhatsApp. Aceitou a recomendação de fazer as duas etapas (bolinha com o app aberto e push com ele fechado). O número do Na Mesa é a quantidade de **grupos esperando**; o do Caixa é a de **mensagens não lidas**, a mesma soma do título da aba.
- **Backend:** `services/pushNotify.js` + `controllers/pushController.js`, rotas `/api/push/public-key|subscribe|unsubscribe` (staff e admin).
  - **Chaves VAPID:** geradas sozinhas e gravadas em `push_config` (já criada no banco de produção pelo teste local). Não precisa de variável no Hostinger. Trocar as chaves invalida as inscrições.
  - **Inscrições:** em `push_subscriptions`, com `UNIQUE (endpoint, app)`. O mesmo aparelho pode ter Caixa e Na Mesa, porque é um único service worker.
  - **Gatilhos:** mensagem recebida nova de telefone em cliente com dashboard (`whatsappIngest.js`, não avisa grupo) e entrada pela conversa do WhatsApp na fila (`enterQueue`; a entrada manual não avisa).
  - Com o db falso dos testes não manda push (`dbImpl === db`).
- **Frontend:**
  - `public/sw.js` com `push` (notificação + `setAppBadge`) e `notificationclick`;
  - `pwa/push.js` e a faixa `pwa/PushPrompt.jsx` ("Ativar", ou X pra dispensar, guardado em localStorage);
  - `setBadge` no `CaixaChatView` (não lidas) e no `QueueBoard` (esperando);
  - "Sair" remove a inscrição do aparelho.
- **Onde a bolinha funciona:**
  - PC (Chrome/Edge instalado) e Mac, direto;
  - iPhone com iOS 16.4 ou mais novo, com o app na Tela de Início e notificação permitida;
  - Android pela notificação (o número depende do celular).
- **iPhone no push:** só pede a permissão dentro do app instalado.
- **Testado:** backend 381 testes, frontend 68, build ok. Chaves e assinatura conferidas contra o banco real (`generateRequestDetails`). A faixa foi conferida no PC e no celular (Playwright).
- **Não testado:** entrega num aparelho real (precisa de HTTPS de produção). Depois do deploy, ativar num celular e mandar mensagem pro Malibu.
- **Achado (anterior a esta mudança, não corrigido):** no Caixa no celular, a lista de conversas é cortada à direita (horário e bolinha de não lidas somem).

**Deploy marcado pelo usuário pra 22/10 às 20:30** (branch inteira: dois processos, tipos de mensagem, push).

**Sincronização de campanhas e lista do Caixa (22/10, commit seguinte ao `8a734a1`, mesma branch).**
- **"Erro ao sincronizar campanhas" na dashboard:** rodando a mesma sincronização localmente, todos os clientes deram ok, mas ela levou **92 s** (só o Recreio ~50 s). O Hostinger corta a requisição antes disso, e a tela mostrava o erro genérico, mesmo com o servidor terminando a sincronização.
  - Agora `POST /api/campaigns/sync` cria uma linha em `sync_jobs` (já criada no banco de produção), responde 202 com `jobId` e sincroniza em segundo plano. `GET /api/campaigns/sync/:jobId` devolve o andamento, e a tela consulta a cada 3 s, até 10 min.
  - O andamento fica no banco por causa dos dois processos.
  - Clique duplo devolve a mesma sincronização.
  - Uma sincronização "rodando" há mais de 15 min (processo caiu) aparece como interrompida.
  - Testado local: resposta em 0,5 s, resultado em ~50 s.
- **Lista do Caixa no celular:** a coluna era `1fr`, que alarga até a prévia mais longa (`nowrap`). Agora é `minmax(0, 1fr)`, também no tablet e no PC. Conferido no Playwright em 375px.

**Caixa → Balcão (22/10, commit `2abdf85`, mesma branch).** Pedido do usuário: o app passa a se chamar **Balcão**, com o endereço `furtherads.online/balcao`. O ícone não muda. Ele aceitou manter os dois endereços.
- `/balcao` usa o manifesto `balcao.webmanifest` (id `/balcao`).
- `/balcão` (com til) e `/caixa` **no navegador** vão pro `/balcao` (`canonicalPath`, `main.jsx`).
- **O app do Caixa já instalado** (display-mode standalone) fica no `/caixa`, porque é o endereço que ele guardou, e sair do escopo abriria a barra do navegador.
  - O `caixa.webmanifest` manteve o id `/caixa` e passou a se chamar Balcão. Android e PC atualizam o nome sozinhos; o iPhone continua "Caixa" até reinstalar pelo `/balcao`.
- **A chave interna continua `caixa`:** `caixa_token` (ninguém é deslogado), ícones `caixa-*`, `push_subscriptions.app = 'caixa'`, `CaixaApp.jsx`. Notificações abrem `/balcao`; o service worker também reaproveita uma janela no `/caixa`.
- Textos trocados: login, título da aba, menu do celular e "PIN do Balcão e do Na Mesa" em Chaves e APIs.
- **Testado:** frontend 73 testes, backend 381, build. No Playwright, `/caixa` e `/balcão` caíram no `/balcao` com o manifesto novo, e o login salvo continuou valendo. O caso do app instalado está coberto por teste (não dá pra emular standalone no Playwright).
- **Daqui pra frente, falar "Balcão" com o usuário.** No código o nome continua caixa.
