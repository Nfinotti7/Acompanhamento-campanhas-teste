# Atribuição de Campanhas em Contas de Anúncio Compartilhadas — Design

**Data:** 2026-10-05
**Status:** Aprovado, pronto para plano de implementação

## Contexto

Hoje cada cliente cadastrado tem uma credencial Meta própria (`credentials.config_json`,
platform `meta`) com um `ad_account_id`. A sincronização (`syncClient`) busca, para um
cliente por vez, **todas** as campanhas daquela conta e grava tudo sob o `client_id` dele,
sem nenhuma checagem.

Isso funciona bem quando cada cliente tem sua própria conta de anúncios — e é a maioria
dos casos hoje. O problema: a agência ainda não conseguiu criar Business Managers
separados para todos os clientes, então **Recreio Bar e Malibu Sushi Bar dividem a mesma
conta de anúncios**, e **Alma Boutique Bar e Giulí Osteria dividem outra**. Do jeito que o
sistema funciona hoje, se dois clientes cadastrarem o mesmo `ad_account_id`, cada um veria
as campanhas do outro — um vazamento real de dado entre clientes diferentes.

Este documento cobre a correção disso: separar campanhas de uma conta compartilhada pelo
cliente dono de cada campanha, com uma validação de segurança contra erro humano, **sem
alterar em nada o comportamento para clientes que já têm conta própria** (a maioria).

Fonte: briefing `briefing-dashboard-por-cliente.md`, fornecido pelo cliente em 2026-10-05.

## Objetivo

1. Um cliente nunca vê campanha de outro cliente, mesmo quando os dois compartilham a
   mesma conta de anúncios Meta.
2. A separação acontece pelo **prefixo do nome da campanha** (ex.: `"RECREIO - ..."`,
   `"MALIBU - ..."`), que a agência já define manualmente ao criar cada campanha.
3. Uma checagem de segurança adicional (opcional, por cliente): se o cliente tiver a
   **Page ID** do Facebook cadastrada, a campanha também precisa usar essa página no
   criativo — senão é tratada como inconsistente e fica de fora de qualquer dashboard.
4. Campanhas sem prefixo reconhecido, ou com página que não bate, **não aparecem pra
   ninguém** (nem pro cliente errado, nem pro certo) — ficam só registradas no banco pra
   consulta manual, sem tela dedicada de revisão por enquanto.
5. Clientes com conta de anúncios própria (não compartilhada) continuam funcionando
   **exatamente como hoje**, sem nenhuma checagem nova e sem risco de regressão.

## Fora de escopo (fica para a próxima frente, "dados orgânicos")

- Sincronização de métricas de Página do Facebook e Instagram (`page_id`/`ig_user_id`
  usados só para a validação de consistência aqui, não para puxar dado orgânico ainda).
- Alcance/frequência "não somáveis" (item 2.3 do briefing) — hoje o sistema já soma
  alcance entre campanhas de forma tecnicamente imprecisa (conta pessoas repetidas que
  viram mais de uma campanha); isso é um problema pré-existente, não causado por esta
  mudança, e será resolvido junto da frente de dados orgânicos, quando as consultas à
  Meta já vão estar sendo mexidas de novo.
- Tela de revisão de campanhas inconsistentes/não classificadas para o admin — por
  decisão do cliente, por enquanto essas campanhas só ficam marcadas no banco.
- Sincronização do Google Ads não muda — cada cliente já tem conta própria lá.

## Decisões já validadas

- **Onde fica o prefixo e a Page ID**: campos novos na tabela `clients` (`campaign_prefix`,
  `page_id`), não dentro de `credentials` — são identidade do cliente, não segredo.
- **Lacuna encontrada e incluída no escopo**: hoje não existe edição de cliente (só criar
  e excluir) — sem isso, não dá pra configurar prefixo/Page ID em clientes que já existem
  (como o Recreio). Este trabalho inclui adicionar `PUT /api/clients/:id` e a edição na
  tela de Clientes.
- **Validação de página**: checar só **1 anúncio por campanha** (não todos) — mais barato
  em chamadas à API, e as campanhas da agência não misturam páginas diferentes dentro de
  uma mesma campanha.
- **Campanhas escondidas (inconsistente/não classificada)**: continuam gravadas no banco
  (pra permitir consulta manual se precisar investigar), só que sem `client_id` e com uma
  coluna `classification` dizendo o motivo. Como toda consulta de dashboard já filtra por
  `client_id`, elas somem automaticamente de qualquer tela — nenhuma consulta existente
  precisa mudar para isso funcionar.

## Pendências que bloqueiam o teste real (não bloqueiam o código)

Do briefing: `ad_account_id` do Recreio ainda não confirmado, e `page_id`/Instagram do
Malibu ainda não confirmados. O mecanismo abaixo é construído e testável de ponta a ponta
com **Alma + Giulí** (dados já confirmados); Recreio/Malibu só fecham quando esses valores
chegarem — não é um bloqueio de desenho, só de dado de entrada.

## Arquitetura

### Dados (duas tabelas existentes ganham colunas novas — aditivo, nenhuma tabela recriada)

```
clients
  + campaign_prefix TEXT   -- nullable. Ex: "RECREIO -". Só obrigatório pra quem
                           --   compartilha conta de anúncios com outro cliente.
  + page_id TEXT           -- nullable. Page ID do Facebook do cliente. Opcional mesmo
                           --   pra quem compartilha conta — ativa a checagem extra só
                           --   se preenchido.

campaigns
  client_id INTEGER        -- deixa de ser NOT NULL. NULL = campanha sem dono confirmado
                           --   (inconsistente ou não classificada).
  + classification TEXT    -- default 'ok'. Valores: 'ok' | 'inconsistent' | 'unclassified'.
```

Migração feita como `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` e
`ALTER TABLE campaigns ALTER COLUMN client_id DROP NOT NULL` dentro do mesmo `initDb()`
que já roda esse tipo de migração aditiva hoje (mesmo padrão do `reach` em
`daily_metrics`) — seguro de rodar contra o banco de produção, não toca linha existente.

**Nota técnica para quem for implementar:** o índice único hoje é
`UNIQUE(client_id, platform, campaign_id)`. Com `client_id` virando `NULL` pras campanhas
escondidas, esse índice não detecta duplicata nesses casos (Postgres trata `NULL` como
sempre diferente de `NULL`). Por isso, ao gravar uma campanha com `classification != 'ok'`,
a gravação deve ser feita por **apagar e inserir de novo** (`DELETE ... WHERE platform = ?
AND campaign_id = ? AND client_id IS NULL` seguido de `INSERT`), em vez do
`ON CONFLICT DO UPDATE` usado hoje — que continua valendo normalmente pras campanhas
`classification = 'ok'` (com `client_id` preenchido).

### Sincronização (só o fluxo Meta muda)

Hoje `syncClient(clientId)` roda sozinho por cliente. O novo fluxo, quando
`syncCampaigns` reúne a lista de clientes a sincronizar (um específico ou todos ativos):

1. **Agrupar por conta de anúncios.** Ler a credencial Meta de cada cliente-alvo e
   agrupar os que têm o mesmo `ad_account_id` (normalizado, com ou sem prefixo `act_`).
   Dentro de um grupo, usa-se o `access_token` do cliente com o menor `client_id` (o
   cadastrado há mais tempo) para fazer a chamada única à API — na prática deve ser o
   mesmo token em todos do grupo, já que é a mesma conta.
2. **Grupo com 1 cliente só** (caso comum hoje): sincroniza exatamente como já funciona —
   busca a conta, grava tudo pro cliente, sem checagem nenhuma. **Nenhuma mudança de
   comportamento aqui.**
3. **Grupo com mais de 1 cliente** (Recreio+Malibu, Alma+Giulí): busca a conta **uma vez
   só** (evita bater a API em dobro), e para cada campanha retornada:
   - Compara o nome da campanha contra o `campaign_prefix` de cada cliente do grupo
     (comparação exata, com o `" -"` incluso, ex.: `"RECREIO -"`).
   - **Nenhum prefixo bateu** → `classification = 'unclassified'`, sem dono.
   - **Um prefixo bateu, cliente sem `page_id` cadastrada** → `classification = 'ok'`,
     vai pro cliente do prefixo. (Sem checagem extra se o cliente não configurou isso.)
   - **Um prefixo bateu, cliente com `page_id` cadastrada** → busca 1 anúncio da campanha
     na API (`/{campaign_id}/ads?fields=creative{effective_object_story_id}&limit=1`),
     extrai o Page ID do `effective_object_story_id` (formato `"{page_id}_{story_id}"`) e
     compara. Bateu → `ok`. Não bateu → `classification = 'inconsistent'`, sem dono.
4. Grava como já descrito na seção de Dados: `ok` pelo caminho de upsert normal,
   `inconsistent`/`unclassified` pelo caminho de apagar-e-inserir.

### Gestão de clientes (nova edição)

- `PUT /api/clients/:id` (admin) — atualiza `name`, `company`, `logo_url`,
  `campaign_prefix`, `page_id`.
- Tela de Clientes ganha um botão de editar nos cards já existentes, abrindo o mesmo
  formulário de cadastro pré-preenchido, com os dois campos novos adicionados.

## Checagem de consistência interna

Releitura rápida: nenhuma seção contradiz outra, não há "TBD" dentro do controle deste
trabalho (as pendências listadas são de dado externo, já marcadas como tal), e o escopo
está fechado o suficiente para um único plano de implementação — a frente de dados
orgânicos fica para uma spec própria, como já combinado.
