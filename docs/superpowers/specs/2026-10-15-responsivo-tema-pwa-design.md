# Responsivo, tema claro/escuro e PWA nos 3 apps (design)

Data: 2026-10-15
Status: decisões tomadas em conversa; aguardando revisão desta spec.

## Objetivo

Antes do deploy do Na Mesa, deixar **todo o frontend** bonito e fácil de usar em celular, tablet e PC, com **tema claro e escuro** e **instalável como app** (PWA) no Android e no iOS. Os três "apps" que o mesmo frontend já serve são:

| App | Endereço | Quem usa |
|---|---|---|
| **Further Ads** | `/` | Agência (admin) e cliente da dashboard |
| **Caixa** | `/caixa` | Equipe do restaurante (PIN): conversas, funil, agenda |
| **Na Mesa** | `/namesa` | Recepcionista (PIN): fila de espera |

## Decisões tomadas com o usuário

- **Escopo:** os três apps (opção C). Deploy único no fim, com tudo junto (o Na Mesa também espera).
- **Três apps instaláveis separados,** cada um com nome, ícone e tela inicial próprios.
- **Cores da Further nos três apps:** azul-marinho `#000D30` e turquesa `#0097B2`. Verde, amarelo e vermelho ficam só para status.
- **Logos:** o usuário mandou as 6 variações. As **claras vão no tema escuro** e as **escuras no tema claro**.
- **Implementação:** caminho 1, com cores em variáveis CSS por tema, faixas de tela no CSS e um hook `useBreakpoint` para mudanças de estrutura. O usuário delegou os detalhes ("faz o que achar melhor").

## Fora do escopo

- Funcionar offline de verdade (fila ou conversas sem internet). Sem conexão, o app abre e mostra "Sem conexão".
- Notificação push do PWA.
- Mudar fluxos ou regras de negócio. Só visual, layout e instalação.
- As pendências pequenas do Na Mesa anotadas no diário (fica para depois).

## 1. Cores e tema

### Variáveis

O `index.css` já usa variáveis (`--bg-dark`, `--bg-card`, `--text-primary`, `--accent-primary`...). **Os nomes atuais ficam**, para mexer o mínimo nos componentes que já os usam, e passam a ter um valor para cada tema. Entram nomes novos para o que hoje está fixo nos componentes:

| Variável | Escuro | Claro | Uso |
|---|---|---|---|
| `--bg-dark` (fundo da página) | `#000A26` | `#F3F6FA` | body |
| `--bg-sidebar` | `#00081F` | `#FFFFFF` | barra lateral, rail, cabeçalho |
| `--bg-card` | `#071A3F` | `#FFFFFF` | cartões, painéis |
| `--bg-card-hover` | `#0C2350` | `#EEF3F8` | hover |
| `--bg-input` *(nova)* | `#000A26` | `#F7F9FC` | campos |
| `--bg-elevated` *(nova)* | `#0C2350` | `#FFFFFF` | modal, menu, popover |
| `--border-color` | `rgba(255,255,255,0.09)` | `rgba(0,13,48,0.12)` | bordas |
| `--text-primary` | `#F1F5F9` | `#000D30` | texto |
| `--text-secondary` | `#9AAAC4` | `#3A4A6B` | texto de apoio |
| `--text-muted` | `#6B7C99` | `#5F6E8C` | legendas |
| `--accent-primary` | `#0097B2` | `#00809A` | botão principal, destaque |
| `--accent-primary-hover` | `#00B0CF` | `#006A80` | hover |
| `--on-accent` *(nova)* | `#FFFFFF` | `#FFFFFF` | texto sobre o destaque |
| `--accent-link` *(nova)* | `#3CC6E0` | `#007189` | link e texto turquesa sobre o fundo |
| `--accent-success` / `--accent-warning` / `--accent-danger` | tons atuais | tons um pouco mais escuros para contraste no branco | status |
| `--*-soft` *(nova, uma por status)* | status com 15% de opacidade | status com 12% de opacidade | fundo de selo e alerta |
| `--overlay` *(nova)* | `rgba(0,0,0,0.6)` | `rgba(0,13,48,0.35)` | atrás de modal e menu |
| `--shadow-card`, `--glass-*`, `--border-glow`, `--shadow-glow` | atuais com o marinho | sombra suave em marinho | profundidade |
| `--chart-1..6` *(nova)* | paleta de gráficos derivada da marca | idem, com contraste no branco | recharts |

As cores de marca do Google (`--accent-google`) e da Meta (`--accent-meta`) continuam iguais nos dois temas.

**Contraste:** todo par texto/fundo da tabela tem que passar no WCAG AA (4,5:1 para texto normal, 3:1 para texto grande e componentes). Os valores acima são o ponto de partida. Um teste automatizado (ver Testes) confere os pares e, se algum falhar, o valor é ajustado.

### Troca de tema

- O atributo `data-theme="dark|light"` no `<html>` define o tema. Sem escolha salva, ele segue o tema do aparelho (`prefers-color-scheme`) e acompanha se o aparelho mudar.
- **Botão sol/lua** em cada app. Fica no cabeçalho (Further Ads e Na Mesa), no rail ou na barra de baixo (Caixa) e nas telas de login. A escolha é salva em `localStorage` (`theme`), e vale **por aparelho** e para os três apps.
- **Sem piscar:** um script inline pequeno no `<head>` do `index.html` aplica o `data-theme` antes do React carregar.
- `<meta name="theme-color">` acompanha o tema, para a barra do navegador e do app instalado ter a cor certa.
- **Gráficos (recharts):** não leem CSS direto. O hook `useTheme()` devolve as cores do tema atual (lidas das variáveis com `getComputedStyle`) e os componentes de gráfico passam essas cores ao recharts.
- **Impressão e PDF do relatório:** sempre em **tema claro**, qualquer que seja o tema da tela. Hoje imprime escuro. Claro fica mais profissional para cliente e economiza tinta. Isso é uma decisão minha e pode ser revista.

### Logos e ícones

- As 6 logos vão para `frontend/public/brand/`: `further-horizontal-dark.png`, `further-horizontal-light.png`, `further-vertical-dark.png`, `further-vertical-light.png`, `further-arrow-dark.png` e `further-arrow-light.png`.
- **Further Ads:**
  - A barra lateral mostra a logo horizontal (a escura no tema claro, a clara no escuro).
  - O login mostra a vertical.
  - Ícone do app: a seta.
- **Caixa e Na Mesa:** ícones desenhados por mim nas cores da marca, um **balão de conversa** (Caixa) e uma **mesa posta com prato e talheres** (Na Mesa), em SVG.
  - O login de cada um mostra o ícone + o nome do app ("Caixa", "Na Mesa").
  - O rodapé discreto traz "por Further", com a logo horizontal pequena no tom do tema.
- **Ícones dos apps** (gerados a partir das logos e SVGs e commitados):
  - Tamanhos 192 e 512.
  - Versão `maskable` 512, com margem de segurança para o recorte redondo do Android.
  - `apple-touch-icon` 180, com fundo marinho sólido, porque o iOS não aceita transparência.
  - Favicon.
  - Todos em `frontend/public/icons/<app>-*.png`.
- O `index.html` hoje aponta para um `/favicon.svg` que não existe. Isso passa a ser definido por app.

## 2. Tamanhos de tela

### Faixas

| Faixa | Largura | Alvo |
|---|---|---|
| Celular | até 640px | celular em pé |
| Tablet | 641–1024px | tablet em pé/deitado, celular deitado |
| PC | a partir de 1025px | notebook e monitor |

- Os `@media` atuais (900px e 560px) passam para essas faixas.
- O hook `useBreakpoint()` devolve `'phone' | 'tablet' | 'desktop'` com `matchMedia` e se atualiza ao girar ou redimensionar.
- **Regra de uso:** o CSS cuida do que só muda de tamanho ou espaçamento. O hook é usado só quando a **estrutura** muda (ex.: tabela vira cartões, lista e conversa viram duas telas).

### Regras gerais

- **Toque:** alvo mínimo de 44×44px em celular e tablet. Fonte base de 16px nos campos, para o iOS não dar zoom ao focar.
- **Bordas do aparelho:** o viewport usa `viewport-fit=cover`, e o padding respeita `env(safe-area-inset-*)` (notch e barra do iPhone).
- **Altura no celular:** `100dvh` em vez de `100vh`, para a barra do navegador não cortar a tela.
- **Modais:** no celular ocupam a tela inteira, com cabeçalho fixo e botão fechar. No tablet e no PC continuam centralizados.
- **Rolagem lateral:** nunca na página inteira. Só dentro de componentes que precisam dela (quadro do funil, tabela no tablet).

### Further Ads (dashboard)

- **Barra lateral:** fixa no PC. No tablet e no celular vira menu deslizante (já existe, só muda o ponto de corte para 1024px).
- **Barra do topo:** os filtros (cliente, plataforma, período) quebram em linhas no tablet. No celular ficam num botão "Filtros" que abre uma folha de baixo.
- **Cartões de KPI:** 4 colunas no PC, 2 no tablet, 1 ou 2 no celular (`auto-fit`).
- **Gráficos:** largura total e altura menor no celular. Legenda embaixo.
- **Tabelas** (campanhas, remarketing, links rastreáveis, resultado por campanha do Dashboard WhatsApp): tabela no PC, tabela com rolagem lateral e primeira coluna fixa no tablet, **lista de cartões** no celular (cada linha vira um cartão com os 3–4 números principais e "ver mais").
- **Funil (kanban):** colunas com rolagem lateral e "snap", cada coluna com 85% da largura da tela no celular. Arrastar continua no PC. No toque, a etapa muda pelo painel do contato (como já é hoje).
- **Painel do contato** (`ContactDetailPanel`): no celular ocupa a tela inteira, com abas no topo.
- **Formulários** (Clientes, Chaves e APIs, Links): uma coluna no celular.
- **Relatório e apresentação:** no celular rolam na vertical, com os blocos empilhados. A apresentação em tela cheia continua no PC.

### Caixa (`/caixa`)

- **PC:** como hoje, com rail de ícones à esquerda, lista e conversa lado a lado.
- **Tablet:** lista mais estreita (cerca de 320px) e conversa ao lado.
- **Celular (padrão do WhatsApp):**
  - O rail vira **barra de abas embaixo** (Conversas / Funil / Agenda / Sair).
  - A lista ocupa a tela, e tocar num contato abre a conversa em tela cheia com botão **voltar**.
  - O campo de mensagem fica fixo embaixo, acima do teclado.
- O funil e a agenda seguem as mesmas regras da dashboard.

### Na Mesa (`/namesa`)

- **PC e tablet:** como hoje, com linha da fila em uma faixa e botões à direita.
- **Celular:**
  - Cada pessoa vira um **cartão**: posição grande, nome e pessoas em cima, tempos embaixo, e uma fileira com os 3 botões grandes (Chamar / Sentou / Não veio) ocupando a largura.
  - Editar e remover ficam num menu "⋯".
- **Resumo do dia:** faixa com rolagem lateral no celular.
- **Cabeçalho:** no celular as abas viram só ícones.
- **"+ Adicionar":** no celular vira botão flutuante no canto, e o formulário abre como folha de baixo.

## 3. PWA

- **Manifestos** em `frontend/public/`, um por app:

  | Manifesto | `id` / `start_url` / `scope` | `name` | `short_name` |
  |---|---|---|---|
  | `further.webmanifest` | `/` | "Further Ads" | "Further" |
  | `caixa.webmanifest` | `/caixa` | "Caixa" | — |
  | `namesa.webmanifest` | `/namesa` | "Na Mesa" | — |

  Todos com `display: standalone`, `background_color`/`theme_color` marinho e os ícones (incluindo `maskable`).
- **Qual manifesto:**
  - Uma função pura `appForPath(pathname)` devolve a configuração do app (título, manifesto, ícones, favicon).
  - O `main.jsx` aplica essa configuração antes de renderizar (`<link rel="manifest">`, `apple-touch-icon`, `apple-mobile-web-app-title`, favicon, `document.title`).
  - O `index.html` fica com valores neutros.
- **Service worker** `frontend/public/sw.js`, registrado só em produção, com escopo `/` e um só para os três apps:
  - Navegação (abrir a página): **rede primeiro**. Se não houver rede, cai no `index.html` guardado, e o app abre e mostra "Sem conexão".
  - Arquivos com hash em `/assets/`: **cache primeiro**, porque nunca mudam.
  - **Nunca guarda** `/api/*`, `/r/*` nem o webhook.
  - Cache com versão no nome. Na ativação apaga as versões antigas (`skipWaiting` + `clients.claim`).
- **Instalar:**
  - **Android/Chrome:** o evento `beforeinstallprompt` é guardado, e aparece um aviso discreto "Instalar o app" com botão.
  - **iPhone/iPad (Safari, fora do modo app):** aparece o aviso "Para instalar: toque em Compartilhar e depois em Adicionar à Tela de Início".
  - O aviso some se o app já está instalado (`display-mode: standalone`). Quem fecha o aviso não vê de novo naquele aparelho (`localStorage`).
- **Sem conexão:** com `navigator.onLine` falso, aparece uma faixa "Sem conexão: tentando reconectar…".
- **Servidor:** o Express já serve `frontend-dist` com `express.static`. Conferir que o `sw.js` vai com `Cache-Control: no-cache` e que o `.webmanifest` sai com o content-type certo. A rota de fallback da SPA não pode responder no lugar desses arquivos.

## 4. Organização do código (frontend)

- `src/theme/`:
  - `useTheme.js`: estado do tema, troca, leitura das cores para gráficos.
  - `ThemeToggle.jsx`: botão sol/lua.
  - `themeScript` inline no `index.html`.
- `src/responsive/useBreakpoint.js`.
- `src/pwa/`:
  - `apps.js`: `appForPath`, configuração dos 3 apps, função pura.
  - `registerSW.js`.
  - `InstallPrompt.jsx`.
  - `OfflineBanner.jsx`.
- `src/components/ui/`, componentes pequenos que se repetem e hoje são estilo inline copiado:
  - `ResponsiveTable` (tabela ↔ cartões).
  - `Sheet` (folha de baixo / modal em tela cheia no celular).
  - `BrandLogo` (escolhe a logo pelo tema).
  - `AppIcon`.
- **Conversão das cores fixas:** cada `#hex`/`rgba` fixo nos componentes vira `var(--...)`. Exceções:
  - Cores de marca Google/Meta.
  - Cor escolhida pelo usuário (cor das etapas e tags do CRM, que vem do banco).
  - Os 3 status do Na Mesa (já mapeados para `--accent-*`).

## Testes e verificação

- **Automatizados** (`node --test`, funções puras, rodando no frontend sem browser):
  - `appForPath`: cada endereço leva ao app certo (`/caixa/qualquer`, `/namesa`, `/`, `/admin` → Further).
  - `resolveTheme(salvo, sistemaEscuro)`: escolha salva vence; sem escolha segue o sistema.
  - **Contraste:** lê as variáveis dos dois temas no `index.css` e confere WCAG AA nos pares texto/fundo da tabela da seção 1.
  - **Manifestos:** os 3 `.webmanifest` são JSON válido, com os campos obrigatórios, e os ícones citados existem em `public/`.
  - **Sobra de cor fixa:** varre `src/**/*.jsx` e falha se aparecer `#hex`/`rgba(` fora de uma lista de exceções explícita.
- **Visual** (Playwright, local, contra os dois servidores):
  - Screenshots das telas principais dos 3 apps em **375px, 768px e 1280px**, nos **dois temas**.
  - Checagens: nada vazando para o lado, botões tocáveis, texto legível.
  - As telas: login, dashboard, campanhas, funil, painel do contato, caixa (lista e conversa), fila do Na Mesa, configurar e relatório.
- **PWA:**
  - No Chrome (Playwright), o manifesto de cada app carrega e o service worker fica ativo.
  - `/api` nunca é servido do cache.
- **Manual pelo usuário depois do deploy:** instalar os apps num Android e num iPhone de verdade.

## Riscos

- **Volume:** são cerca de 550 cores fixas em 30+ arquivos. O teste de "sobra de cor fixa" é o que garante que nada ficou para trás. Relatório e apresentação concentram a maior parte (mais de 170).
- **Service worker velho preso no navegador:** mitigado com rede primeiro na navegação e com versão no nome do cache.
- **iOS:** não tem botão de instalar automático (só a dica) e fecha o app em segundo plano mais cedo. A atualização ao vivo (SSE) reconecta ao voltar, o que já acontece hoje.
