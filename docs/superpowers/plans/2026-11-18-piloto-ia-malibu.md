# Piloto da atendente com IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a Maria atenda só leads de anúncio, esconder dados pessoais antes de falar com o Gemini e gerar um relatório do piloto.

**Architecture:** Um filtro novo em `isAiActiveFor` (parâmetro `source`), um módulo puro de redação aplicado ao histórico em `runAiTurn`, e um script de relatório somente leitura sobre `ai_replies`. Sem mudança de schema.

**Tech Stack:** Node ESM, `node --test`, Postgres (`?` placeholders), React/Vite.

**Spec:** `docs/superpowers/specs/2026-11-18-piloto-ia-malibu-design.md`

## Global Constraints

- Branch nova a partir de `main`: `feat/ia-piloto`. Eu não dou push em `main`; o usuário faz o merge.
- Nada pode enviar mensagem a ninguém durante os testes: testes usam fakes (`deps`); scripts só leem.
- Texto de interface e mensagens em português do Brasil.
- `only_ad_leads` padrão `false`; configs antigas sem o campo continuam valendo como `false`.
- Com `only_ad_leads` ligado e `source` ausente/diferente de `'ad'`, a IA fica DESLIGADA (falha segura).
- Redação nunca altera datas (`25/11`), horários (`19:30`, `19h30`) nem contagens ("somos 8").
- Testes: backend `cd backend && node --test <arquivo>`; frontend como já usado no projeto (73 testes existentes devem continuar passando).

## Review Focus

- Número de telefone escrito com espaços/hífens/parênteses/+55 ("(62) 98147-9128", "+55 62 981479128"): some inteiro.
- CPF com e sem pontuação (`123.456.789-09`, `12345678909`): some.
- Horário "19:30", data "25/11/2026", "somos 12 pessoas", valor "R$ 129,00": ficam intactos.
- E-mail no meio da frase com pontuação grudada ("é joao@x.com."): some sem comer o ponto final.
- Contato `source` nulo (ou lido sem a coluna) com `only_ad_leads` ligado: IA não atende.
- Mensagem do cliente com número de 8 dígitos que NÃO é telefone? (ex.: "pedido 12345678"): aceitável redigir; o contrário (vazar telefone) não.

---

### Task 1: Redação de dados pessoais

**Files:**
- Create: `backend/src/services/aiRedact.js`
- Test: `backend/src/services/aiRedact.test.js`

**Interfaces:**
- Produces: `redactPii(text: string): string`; `redactContents(contents: Array<{role, parts: Array<{text?: string}>}>): same` (devolve cópia, só reescreve `parts[].text`; partes sem `text`, como `functionCall`/`functionResponse`, passam intactas).

- [ ] **Step 1: Testes que falham** (`aiRedact.test.js`), um `test` por linha:
  - `redactPii('meu cel é (62) 98147-9128')` → `'meu cel é [telefone]'`
  - `redactPii('+55 62 981479128 e 62981479128')` → `'[telefone] e [telefone]'`
  - `redactPii('CPF 123.456.789-09 ou 12345678909')` → `'CPF [CPF] ou [CPF]'`
  - `redactPii('CNPJ 12.345.678/0001-95')` → `'CNPJ [CNPJ]'`
  - `redactPii('manda pra joao.silva@gmail.com.')` → `'manda pra [e-mail].'`
  - intactos: `'dia 25/11/2026 às 19:30, somos 12 pessoas, R$ 129,00, às 19h30'`
  - `redactContents` mantém `role`, não muta o argumento e deixa `{functionCall: ...}` como está.
- [ ] **Step 2: Rodar e ver falhar.** `cd backend && node --test src/services/aiRedact.test.js` → falha (módulo inexistente).
- [ ] **Step 3: Implementar `redactPii` e `redactContents`.** Ordem importa: e-mail, CNPJ, CPF, depois telefone (sequência de 10–13 dígitos, aceitando `+`, espaços, `-`, parênteses entre eles; exigir ao menos 10 dígitos pra não pegar datas/valores). Placeholders exatos: `[e-mail]`, `[CNPJ]`, `[CPF]`, `[telefone]`.
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/src/services/aiRedact.js backend/src/services/aiRedact.test.js
git commit -m "feat(ia): esconde telefone, CPF, CNPJ e e-mail antes de falar com o Gemini"
```

### Task 2: Usar a redação em `runAiTurn`

**Files:**
- Modify: `backend/src/services/aiConcierge.js:164` (depois de `toContents(history)`)
- Test: `backend/src/services/aiConcierge.test.js`

**Interfaces:**
- Consumes: `redactContents` (Task 1).

- [ ] **Step 1: Teste que falha** em `aiConcierge.test.js`, seguindo o estilo dos testes existentes de `runAiTurn` (fakes de `db`, `generate`, `send`): histórico com mensagem inbound `'meu telefone é 62981479128, CPF 123.456.789-09'`; asserir que o `contents` recebido pelo `generate` fake contém `[telefone]` e `[CPF]` e NÃO contém os números originais; e que a resposta ainda é enviada (`'answered'`).
- [ ] **Step 2: Rodar e ver falhar.** `node --test src/services/aiConcierge.test.js` → o teste novo falha.
- [ ] **Step 3: Aplicar `redactContents` ao resultado de `toContents`** antes do laço do Gemini. A checagem `contents.at(-1).role !== 'user'` continua valendo.
- [ ] **Step 4: Rodar o arquivo inteiro** → todos passam.
- [ ] **Step 5: Verificar o que mais vai ao Gemini sem passar por aqui.** Ler `aiTools.js` (retornos de `list_my_reservations`, `check_availability`) e `aiPrompt.js`: confirmar que nenhum devolve telefone/CPF/e-mail. Se algum devolver, remover o campo e adicionar teste. Registrar o resultado no commit.
- [ ] **Step 6: Commit** `feat(ia): histórico enviado ao Gemini passa pela redação`

### Task 3: Opção "só leads de anúncio" no backend

**Files:**
- Modify: `backend/src/services/aiConfig.js` (`DEFAULT_AI_SETTINGS`, `isAiActiveFor`, `aiStateFor`, `validateAiSettings`)
- Modify: `backend/src/services/whatsappIngest.js:221-228`
- Modify: `backend/src/services/aiConcierge.js:107-135` (`recoverPendingAiReplies`)
- Modify: `backend/src/controllers/reservationController.js:250`
- Modify: `backend/src/controllers/whatsappConversationsController.js:60` (e o SELECT que alimenta `r`, se ainda não trouxer `source`)
- Test: `aiConfig.test.js`, `whatsappIngest.test.js`, `aiConcierge.test.js`, `reservationController.test.js`

**Interfaces:**
- Produces: `DEFAULT_AI_SETTINGS.only_ad_leads = false`; `isAiActiveFor(settings, waId, source?: string|null): boolean`; `aiStateFor(settings, { wa_id, bot_paused_until, source }, now)`.
- Regra: se `settings.ai.only_ad_leads` e `source !== 'ad'` → `false`. Os outros critérios (enabled, paused, test_phones) continuam valendo juntos.

- [ ] **Step 1: Testes que falham em `aiConfig.test.js`:**
  - `isAiActiveFor({ai:{enabled:true,only_ad_leads:true,test_phones:[]}}, '5562981479128', 'ad')` → `true`
  - mesmo com `'organic'` → `false`; com `undefined` → `false`; com `null` → `false`
  - `only_ad_leads:false` e `source:'organic'` → `true`
  - `validateAiSettings` com `only_ad_leads: 'sim'` → mensagem de erro; config sem o campo (legado) → `null`.
  - `aiStateFor` com `source:'organic'` e `only_ad_leads` → `null`; com `'ad'` → `'on'`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar em `aiConfig.js`.** Validação: `only_ad_leads` ausente é aceito (tratado como `false`); presente tem que ser boolean.
- [ ] **Step 4: Rodar `aiConfig.test.js`** → PASS.
- [ ] **Step 5: Teste que falha em `whatsappIngest.test.js`:** com IA ligada, `only_ad_leads` ligado e contato de origem `organic` (o fake de `db` devolve `source`), `onAi` NÃO é chamado e a cadeia antiga roda; com `source:'ad'`, `onAi` é chamado. Incluir o caso `whatsapp_ads_only` (contato promovido a `'ad'` por `presumedAd`): conta como anúncio.
- [ ] **Step 6: Implementar no ingest.** Quando `only_ad_leads` estiver ligado, ler `SELECT source FROM whatsapp_contacts WHERE id = ?` (depois do bloco `presumedAd`, que já atualiza a origem) e passar a `isAiActiveFor(settings, event.waId, source)`. Sem a opção ligada, não faz a consulta extra.
- [ ] **Step 7: Teste que falha em `aiConcierge.test.js` para `recoverPendingAiReplies`:** com `only_ad_leads`, linha com `source:'organic'` não é enfileirada, `'ad'` é. Implementar: incluir `c.source` no SELECT e passar a `isAiActiveFor`.
- [ ] **Step 8: Mesmo tratamento em `reservationController.js:250` (`contactBot`) e `whatsappConversationsController.js:60`**, com um teste cada, seguindo os testes existentes desses controllers (selo "IA atendendo" não aparece para lead que não é de anúncio).
- [ ] **Step 9: Rodar a suíte do backend inteira.** `cd backend && node --test` → tudo passa (≈648 + novos).
- [ ] **Step 10: Commit** `feat(ia): opção de atender só leads de anúncio (piloto)`

### Task 4: Opção na tela de configuração

**Files:**
- Modify: `frontend/src/components/reservas/ReservationSettings.jsx` (estado em torno das linhas 94-97, salvar em 131-134, card da IA perto de 369)
- Test: teste existente do componente, se houver; senão um teste de renderização no estilo dos outros testes do frontend.

**Interfaces:**
- Consumes: `ai.only_ad_leads` (boolean) do backend (Task 3).

- [ ] **Step 1: Teste que falha:** caixa "Só leads de anúncio (piloto)" aparece no card da IA, reflete `ai.only_ad_leads` e vai no payload de salvar como boolean.
- [ ] **Step 2: Rodar e ver falhar** (comando de teste do frontend usado no projeto).
- [ ] **Step 3: Implementar** o checkbox com texto de ajuda: "A atendente só responde quem chegou por anúncio. Os demais seguem nos robôs de sempre." Valor inicial `s.ai?.only_ad_leads === true`.
- [ ] **Step 4: Suíte do frontend** → 73 + novo passando; `npm run build` do frontend sem erro.
- [ ] **Step 5: Commit** `feat(ia): checkbox "só leads de anúncio" nas configurações`

### Task 5: Relatório do piloto

**Files:**
- Create: `backend/src/services/aiPilotReport.js`
- Create: `backend/scripts/ai-pilot-report.mjs`
- Test: `backend/src/services/aiPilotReport.test.js`

**Interfaces:**
- Produces: `summarizePilot(rows: Array<{contact_id, tokens_in, tokens_out, latency_ms, tools: string[]|null, handoff_reason: string|null, status: string, created_at}>): { period: {from, to}, conversations: number, replies: number, handoffs: number, failed: number, throttled: number, paused: number, reservationsCreated: number, reservationsAltered: number, reservationsCancelled: number, tokensIn: number, tokensOut: number, avgLatencyMs: number, handoffReasons: Array<{reason, count}> }` e `formatPilotReport(summary): string` (texto em português, pronto pra colar).
- `reservationsCreated` conta `create_reservation` sem `!` na lista de ferramentas; `reservationsAltered` conta `update_reservation`; `reservationsCancelled` conta `cancel_reservation` (todos sem `!erro`).
- `conversations` = contact_id distintos com resposta `answered`/`handoff`; `replies` = linhas `answered` + `handoff`.

- [ ] **Step 1: Testes que falham** com linhas de exemplo: contagens acima, `create_reservation!tool_error` não conta como reserva, motivos de repasse agrupados e ordenados por contagem, lista vazia devolve tudo zero sem `NaN`, `formatPilotReport` contém "Reservas criadas pela IA: N".
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar `summarizePilot` e `formatPilotReport`** (puros, sem banco).
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Script `ai-pilot-report.mjs`:** args `--client <id> --from <AAAA-MM-DD> [--to <AAAA-MM-DD>]`; um único SELECT em `ai_replies` (somente leitura, nenhum INSERT/UPDATE/envio), imprime `formatPilotReport`. Seguir o estilo de `backend/scripts/ai-concierge-try.mjs` pra conexão. Rodar contra o banco real com `--client 9 --from 2026-11-17` e conferir que imprime sem erro.
- [ ] **Step 6: Commit** `feat(ia): relatório do piloto (script somente leitura)`

### Task 6: Fechar a sessão

**Files:**
- Modify: `docs/diario.md` (entrada em "Registro" + "Estado atual")

- [ ] **Step 1:** Rodar as duas suítes completas e o build do frontend; só seguir se passarem.
- [ ] **Step 2:** Entrada no diário: o que mudou, como ligar o piloto (marcar "Só leads de anúncio" em Configurar e clicar "Retomar"), como gerar o relatório, pendências do usuário (avisar o Malibu; confirmar com a equipe se o Premium inclui o Especial e quais bebidas; publicar o app OAuth do Google em Produção).
- [ ] **Step 3: Commit** `docs(diario): piloto da atendente com IA` e avisar o usuário pra fazer o merge fast-forward e o push.
