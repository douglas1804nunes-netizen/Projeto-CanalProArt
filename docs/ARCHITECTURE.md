# Arquitetura

## Estrutura do monorepo

```
frontend/    React + Vite + TS + Tailwind — SPA consumida pelo usuário
backend/     Node + TS + Fastify — API HTTP, OAuth do YouTube, orquestra IA/uploads
prisma/      schema.prisma (fonte única do schema do banco, compartilhado)
services/    Lógica de domínio reutilizável por backend/ e workers/
             (YouTubeService, AIProvider, TrendScoreService, ...)
workers/     Jobs assíncronos (BullMQ) — vazio até a Fase 21+
tests/       Testes de integração cross-workspace
docs/        Documentação do projeto
scripts/     Scripts utilitários (seed, manutenção)
```

Gerenciado como **npm workspaces** — um único `npm install` na raiz resolve as
dependências de todos os pacotes.

### Por que essa divisão

- `services/` existe separado de `backend/` para que os mesmos serviços
  (ex.: `YouTubeService`, `AIProvider`) possam ser chamados tanto pelas rotas
  HTTP do Fastify quanto pelos workers do BullMQ (Fase 21+) sem duplicar código
  nem criar uma dependência circular `backend → workers`.
  **Importante:** `backend/` importa `@canalproart/services` pelo pacote
  publicado (`services/dist`, via `package.json#main`), não pelo código-fonte
  — então `services/` precisa estar **buildado** antes de `backend/` rodar,
  seja em dev, teste ou build. Os scripts `predev:backend`/`pretest`/
  `pretypecheck` da raiz já cuidam disso automaticamente (hooks do npm); só é
  preciso rodar `npm run dev:services` manualmente (`tsc --watch`) se for
  editar `services/src` com o backend já rodando.
- `prisma/` fica na raiz (não dentro de `backend/`) porque o schema é uma fonte
  única de verdade que poderá ser consumida por `backend/` e futuramente por
  `workers/` sem duplicar o client. Os scripts `prisma:*` da raiz apontam para
  ele explicitamente (`--schema=prisma/schema.prisma`).

## Backend

- **Fastify** (preferido no briefing por não haver backend pré-existente).
- `src/env.ts` carrega e valida (`zod`) o `.env` da raiz do monorepo — falha
  rápido e de forma explícita se uma variável obrigatória estiver ausente, em
  vez de deixar a aplicação subir com configuração inválida.
- `src/app.ts` monta a instância do Fastify (plugins + rotas) separada de
  `src/server.ts` (que só chama `listen`), para permitir testar rotas via
  `app.inject()` sem abrir uma porta de rede.
- `src/prisma.ts` expõe um `PrismaClient` singleton.
- CORS restrito a `FRONTEND_URL` (nunca `origin: true` em produção; registrado
  com `credentials: true` por causa do cookie de sessão da Fase 3).

### Autenticação (Fase 3)

- Sessão via **cookie httpOnly** (`@fastify/jwt` + `@fastify/cookie`), não
  `localStorage` — imune a roubo de token por XSS. Funciona sem CORS de
  verdade porque a arquitetura já é mesma-origem (dev: proxy do Vite; prod:
  Fastify serve o frontend — ver "Deploy" acima).
- Senha: `node:crypto` `scrypt` (salt aleatório de 16 bytes, comparação com
  `timingSafeEqual`) — sem dependência nova/binário nativo (evita complicar o
  build do Docker, ao contrário de libs como `bcrypt`/`argon2`).
- Login roda o `scrypt` mesmo quando o e-mail não existe (contra um hash
  "de mentira" do mesmo formato) — sem isso, responder mais rápido para
  e-mail inexistente do que para senha errada permite descobrir por timing
  quais e-mails estão cadastrados.
- `@fastify/rate-limit`: 100 req/min globais; `/api/auth/register` e
  `/api/auth/login` com limite próprio (20/min) contra força bruta.
- `@fastify/helmet` com a config padrão (CSP `default-src 'self'`, etc.) —
  compatível com o build do frontend (mesma origem, sem CDN externo, sem
  script inline) sem precisar relaxar nada; validado com `curl` contra o
  build de produção antes de assumir que funcionava.
- Frontend: rotas fora de `/login` e `/register` ficam atrás de
  `RequireAuth` (redireciona pra `/login` se `GET /api/auth/me` não
  autenticar) — ver `src/auth/`.

### YouTube OAuth (Fase 4)

- Fluxo padrão de authorization code: `GET /api/youtube/connect` (autenticado)
  gera um `state` aleatório, guarda num cookie httpOnly de 10 min e redireciona
  pro Google; `GET /api/youtube/callback` confere o `state` contra o cookie
  (proteção CSRF) antes de trocar o `code` pelos tokens — ver `src/youtube/`.
- `access_type=offline` + `prompt=consent` na URL de autorização: sem isso o
  Google só manda `refresh_token` na primeira autorização, não em
  re-consentimentos — se não vier, a Fase 20 (deploy) quebraria em produção
  de forma difícil de depurar.
- Tokens sempre criptografados (AES-256-GCM, `TOKEN_ENCRYPTION_KEY` — ver
  `src/youtube/crypto.ts`) antes de gravar no banco, como já estava definido
  desde a Fase 2.
- Um canal do YouTube só pode estar conectado a um usuário CanalProArt por
  vez (`channelId` é `@unique`); o callback rejeita com 409 se outro usuário
  já tiver conectado aquele canal, em vez de reatribuir silenciosamente.
- `src/youtube/tokens.ts` (`getValidAccessToken`) renova o `access_token`
  via `refresh_token` quando está perto de expirar — ainda sem consumidor
  (nenhuma rota chama a API do YouTube _em nome do usuário_ ainda; o
  `YouTubeService` da Fase 5 usa a `YOUTUBE_API_KEY`, não OAuth).
- Logger: `code`/`state`/`access_token`/`refresh_token` são removidos da
  query string antes de logar `req.url` (serializer customizado em
  `app.ts`) — o `redact` do pino só apaga campos inteiros de um objeto, não
  alcança substrings dentro de uma URL.
- **Testado sem credenciais reais do Google**: guarda de autenticação,
  validação de `state` (CSRF), isolamento por usuário (não dá pra desconectar
  conta de outro usuário) e o round-trip de criptografia — ver
  `src/routes/youtube.test.ts` e `src/youtube/crypto.test.ts`. A troca de
  `code` por tokens contra a API real do Google **não** foi validada (exige
  Client ID/Secret reais do Google Cloud Console — ver docs/YOUTUBE.md);
  validado manualmente que o redirect para `accounts.google.com` é bem
  formado (Google responde `invalid_client` com credenciais placeholder, como
  esperado).

### YouTube Data API — `YouTubeService` (Fase 5)

- Vive em `services/src/youtube/` (não em `backend/`) — reutilizável por
  workers a partir da Fase 21+, como já estava planejado desde a Fase 1. Usa
  `YOUTUBE_API_KEY` (chamadas públicas), não OAuth — diferente da Fase 4.
- Três camadas separadas, cada uma só faz uma coisa: `client.ts` (chamada
  HTTP crua ao Google), `mapper.ts` (funções puras: resposta da API →
  formato das tabelas `videos`/`video_metrics`) e `persist.ts` (upsert no
  Postgres via Prisma injetado). Só `client.ts` depende de rede — os outros
  dois são testáveis sem nenhuma credencial.
- `getPopularVideos` chama `videos.list?chart=mostPopular` (1 unidade de
  cota) em vez de `search.list` (100 unidades) — prioridade já documentada
  em docs/YOUTUBE.md. Resultado é cacheado no banco (`fetchedAt`) via
  `persistVideos`, que faz upsert por `youtubeVideoId` (não duplica o vídeo)
  e sempre cria uma nova linha em `video_metrics` (série temporal).
- Config (API key, `PrismaClient`) é **injetada** em `createYoutubeService()`
  — o serviço não lê `process.env` nem instancia seu próprio `PrismaClient`,
  pra não abrir um segundo pool de conexões e pra funcionar igual quando um
  worker (Fase 21+) o chamar com a config dele.
- Rota fina em `backend/src/routes/videos.ts`
  (`GET /api/videos/popular?regionCode=BR`, autenticada) só existe pra
  expor/testar o serviço — a tela de busca de tendências é a Fase 6.
- **Dois bugs reais encontrados testando a imagem Docker** (não só os testes
  automatizados): (1) `backend/` importa `@canalproart/services` pelo
  pacote publicado, então `services/` precisa estar _buildado_ antes —
  scripts `predev:backend`/`pretest`/`pretypecheck` (hooks do npm) resolvem
  isso agora; (2) o estágio de runtime do Dockerfile copiava
  `services/dist` mas não `services/package.json` — o symlink do workspace
  em `node_modules/@canalproart/services` ficava quebrado e o container
  crashava no boot (`ERR_MODULE_NOT_FOUND`). Corrigido e revalidado com
  `docker build` + `docker run` reais antes de dar como pronto.
- **Testado sem credenciais reais do Google**: `mapper.test.ts` (parsing de
  duração ISO 8601, mapeamento de campos, bigint de estatísticas) e
  `persist.test.ts` (upsert idempotente, nova métrica a cada chamada,
  múltiplos vídeos de uma vez) contra o Postgres real, com dados fabricados
  como se já tivessem vindo da API. A chamada de verdade a `videos.list`
  não foi validada (exige `YOUTUBE_API_KEY` real); validado manualmente via
  curl que a rota autentica, valida `regionCode` e responde 502 de forma
  limpa quando a API key é inválida (em vez de derrubar o processo).

### Pesquisa de tendências — `/trends` (Fase 6)

- Schema ganhou `SearchVideo` (`search_videos`), no mesmo padrão de
  `TrendVideo`: liga um `Search` aos vídeos que ele retornou, preservando a
  ordem (`rank`). Sem essa tabela não dava pra saber quais vídeos pertencem
  a qual busca — gap que passou batido na Fase 2 (só pensei nisso pra
  `Trend`, não pra `Search`). Migration `20260923040818_add_search_videos`.
- `POST /api/trends/search` cacheia por `(userId, query, regionCode)`: uma
  busca repetida nas últimas 6h é servida do banco (`SearchVideo` + join em
  `Video`), sem gastar cota de novo — o TTL de 6h é um meio-termo (não tão
  curto que gaste cota a cada refresh, não tão longo que a lista fique
  visivelmente velha num dia de uso). Sem `query`, busca populares
  (`getPopularVideos`, 1 unidade); com `query`, usa `searchTrendingVideos`
  (Fase 5: `search.list` 100 unidades + `videos.list` 1 unidade).
- `GET /api/trends/searches` devolve o histórico do próprio usuário (só
  isso — filtro por `userId`), usado pelo frontend pra mostrar buscas
  recentes como atalho.
- Limite de rate mais apertado nessa rota (10/min) que o das rotas de auth
  (20/min) — cada busca com palavra-chave pode custar até 101 unidades de
  cota (10.000/dia no total), bem mais caro que um POST de login.
- `viewCount`/`likeCount`/`commentCount` (`BigInt` no Prisma) viram string
  antes de `reply.send()` — `JSON.stringify` nativo não serializa `BigInt`
  (lança `TypeError`), e nenhuma rota aqui define `schema.response`
  (fast-json-stringify, que trataria isso sozinho).
- **Testado sem credenciais reais do Google**: cache-hit com dados
  fabricados (preserva `rank`/ordem), isolamento do histórico por usuário,
  validação de `regionCode` — ver `src/routes/trends.test.ts`. Validado ao
  vivo no navegador com dados semeados diretamente no banco (sem tocar a
  API do Google): login → clicar numa busca recente → resultados renderizam
  com formatação de views (`4.2M`) e duração (`10:12`) corretas; uma busca
  nova (sem cache) tenta a API de verdade e mostra o erro 502 de forma
  limpa na UI, como esperado sem `YOUTUBE_API_KEY` real.

### Métricas — velocidade/engajamento/recência/volume (Fase 7)

- Quatro funções puras em `services/src/youtube/metrics.ts`, sem tocar
  banco nem rede — 100% testáveis com dado fabricado:
  - `calculateVelocity`: views/hora entre o snapshot mais antigo e o mais
    novo em `VideoMetric`. Precisa de **2+ snapshots**; com só 1 (comum
    logo após a Fase 6 buscar um vídeo pela 1ª vez) devolve `null` em vez
    de um número enganoso — o frontend trata isso omitindo o dado.
  - `calculateEngagementRate`: `(likes + comentários) / views`, 0 se não
    houver views.
  - `calculateRecencyScore`: decaimento exponencial (1 = agora, 0.5 depois
    de 7 dias) — a meia-vida de 7 dias é uma estimativa inicial, não um
    número validado com dado real de uso; candidato a ajuste.
  - `calculateVolumeScore`: normaliza a contagem de vídeos de um trend em
    0-1 com teto em 25 — usada pela Fase 8, não por esta.
- `GET /api/trends/search` (cache-hit ou busca nova) passa a devolver
  `velocity`/`engagementRate`/`recencyScore` por vídeo — `attachMetrics`
  busca **todos** os snapshots de cada vídeo (não só o mais recente) pra
  alimentar `calculateVelocity`.
- Frontend mostra engajamento (%) e velocidade (`views/h`, omitida quando
  `null`) em cada card — ver `TrendsPage.tsx`.

### Trend Score + classificação (Fase 8)

- `services/src/youtube/trendScore.ts`: `calculateVideoScore` combina
  velocity/engagementRate/recencyScore normalizados (0-1) com pesos
  (velocidade 0.5, engajamento 0.3, recência 0.2 — velocidade pesa mais
  porque é o que diferencia "em alta" de "só popular"); `calculateTrendScore`
  tira a média dos scores dos vídeos de um trend, com um bônus pequeno de
  volume, e escala pra 0-100 (mais legível que 0-1); `classifyTrend` decide
  RISING/HOT/STABLE/DECLINING. Pesos/tetos/thresholds são estimativas
  iniciais documentadas no código, não números validados com dado real de
  uso — candidatos a ajuste.
- Classificação: score ≥ 70 já é **HOT** independente de histórico. Sem
  trend anterior do mesmo tópico/região pra comparar (1ª busca), cai em
  **STABLE** por padrão — não dá pra inferir trajetória sem um ponto de
  comparação. Com histórico, RISING/DECLINING dependem da variação passar
  de 5 pontos.
- `POST /api/trends/search` só cria um `Trend`/`TrendVideo` novo numa busca
  **nova de verdade** (cache-miss) — cache-hit só lê o Trend já calculado
  pro mesmo `(userId, topic, regionCode)`, sem recalcular nem duplicar a
  cada reload de página. `Trend.topic` é obrigatório no schema (diferente
  de `Search.query`, que pode ser `null`) — buscas sem palavra-chave usam
  o topic `"populares"`.
- `GET /api/trends` lista os trends já calculados do usuário (mais recente
  primeiro) — visão geral do que foi classificado até agora.
- Frontend mostra um badge de classificação (🔥/📈/➡️/📉 + score) no
  cabeçalho dos resultados — ver `TrendsPage.tsx`.
- **Testado sem credenciais reais do Google**: cache-hit com Trend
  pré-calculado (dados fabricados), isolamento de `GET /api/trends` por
  usuário — ver `trends.test.ts`. Validado ao vivo no navegador com dados
  semeados direto no banco: badge "🔥 Em alta · 82" renderiza com a cor
  certa, engajamento calculado bate com os números semeados (420k/5M =
  8.4%).

### Dashboard + Oportunidades (Fase 9)

- Toda `Trend` HOT/RISING vira uma `Opportunity` automaticamente
  (`maybeCreateOpportunity` em `trends.ts`, chamada dentro de `createTrend`
  logo após persistir o Trend) — `score = trendScore`, `status = NEW`.
  STABLE/DECLINING não geram oportunidade; cada `Trend` só gera **uma**
  (checa se já existe uma `Opportunity` para aquele `trendId` antes de
  criar) — evita duplicar se, no futuro, `createTrend` rodar mais de uma
  vez para o mesmo trend.
- `GET /api/dashboard`: agrega em paralelo (`Promise.all`) as contagens
  (vídeos analisados, tendências, oportunidades, conteúdos, publicações),
  o top 5 de trends por score e o top 5 de oportunidades `NEW` por score.
  "Vídeos analisados" conta vídeos **distintos** que já apareceram em
  alguma busca do usuário — `Video` é uma tabela de cache global (sem
  `userId`), então a contagem por usuário passa por `SearchVideo`
  (`distinct: ["videoId"]`). `contentProjects`/`publishedVideos` sempre
  devolvem 0 até as fases 12/17 existirem — a query já é a certa, só não
  tem registro que bata com o filtro ainda.
- `GET /api/opportunities` / `POST /api/opportunities/:id/dismiss`: lista
  as oportunidades do usuário (mais relevante primeiro) e permite marcar
  uma como `DISMISSED`. Não modela `IN_PROGRESS`/`CONVERTED` ainda — só
  fazem sentido quando existir um `ContentProject` de verdade pra ligar
  (Fase 12); dismiss é a única ação 100% independente de fases futuras.
  404 (não 403) quando a oportunidade não existe ou é de outro usuário —
  não revela se o ID existe.
- Frontend: `Dashboard.tsx` mostra 5 cards, um gráfico de barras
  (Recharts `BarChart` horizontal) com o top de trends por score e a
  lista de top oportunidades; `OpportunitiesPage.tsx` lista todas as
  oportunidades com um botão "Dispensar" (só aparece quando
  `status === "NEW"`) que chama o dismiss e remove o item da lista
  localmente após sucesso.
- **Testado sem credenciais reais do Google**: `maybeCreateOpportunity`
  testada diretamente (não passa pelo caminho de busca nova, que depende
  de rede) cobrindo HOT/RISING/STABLE/DECLINING e não-duplicação; rotas
  de dashboard/oportunidades cobertas com dados fabricados via Prisma
  (contagens, ordenação, isolamento por usuário, 404 de dismiss). Validado
  ao vivo no navegador com dados semeados direto no banco: cards batendo
  com as contagens reais, gráfico ordenado por score, top oportunidades
  só com HOT/RISING, e o dismiss persistindo `DISMISSED` no Postgres (não
  só otimista no client).

### Página de análise de tendência (Fase 10)

- `GET /api/trends/:id`: devolve um `Trend` com o **score individual de
  cada vídeo** (velocity/engagementRate/recencyScore/videoScore) e o
  **histórico** de scores do mesmo `(userId, topic, regionCode)` em ordem
  cronológica, incluindo o trend atual — dá pra ver a trajetória, não só
  o número final. 404 se o trend não existir ou for de outro usuário.
- As métricas por vídeo são **recalculadas com dados atuais** (mesma
  lógica de `attachMetrics` usada na busca) em vez de persistidas no
  momento da criação do `Trend` — evita ter duas fontes de verdade pro
  cálculo, e `recencyScore` depende de "agora" (não faria sentido
  congelar o valor de quando o trend foi criado).
- `POST /api/trends/search` (Fase 6) passou a incluir o `id` do `Trend`
  na resposta (cache-hit e busca nova); `GET /api/dashboard` e
  `GET /api/opportunities` (Fase 9) passaram a incluir `trendId` em cada
  oportunidade — os três pontos onde uma tendência já aparecia na UI
  (badge da busca, gráfico do dashboard, lista de oportunidades) agora
  linkam pra análise em vez de só mostrar o score isolado.
- Frontend: `TrendAnalysisPage.tsx` (rota `/trends/:id`) mostra o
  cabeçalho (tópico, classificação, score, data), um `LineChart`
  (Recharts) com o histórico — só renderiza com 2+ pontos, senão mostra
  uma mensagem explicando que o histórico se constrói com novas buscas
  — e a lista de vídeos com o score/velocity/engagement/recency de cada
  um. As barras do gráfico do Dashboard e os itens de "Top oportunidades"
  ficaram clicáveis (`onClick` do `Bar` do Recharts / `Link` ao redor do
  item da lista) pra chegar direto na análise.
- **Testado sem credenciais reais do Google**: 404 (inexistente e de
  outro usuário), preservação de rank/score por vídeo e ordem
  cronológica do histórico com dados fabricados via Prisma. Validado ao
  vivo no navegador com um histórico de 3 trends fabricado (scores
  40→55→88): gráfico de linha renderiza a trajetória correta, os 3
  vídeos aparecem com score/engajamento/velocidade recalculados
  corretamente, e os três pontos de entrada (clique na barra do
  dashboard, link na lista de oportunidades, link "Ver análise completa"
  após uma busca em cache) navegam pro mesmo trend.

### IA — `AIProvider` (Fase 11)

- Vive em `services/src/ai/` (mesmo motivo do `YouTubeService`: reutilizável
  por workers a partir da Fase 21+). `provider.ts` define a interface
  `AIProvider` (`generateIdeas`/`generateScript`/`generateTitles`/
  `generateDescription`) — todo o resto do código depende só dela, nunca de
  um provider concreto. `createAIProvider({ provider, apiKey })` em
  `ai/index.ts` é o único lugar que decide qual implementação instanciar a
  partir de `AI_PROVIDER`; hoje só `"anthropic"` existe
  (`anthropicProvider.ts`), mas trocar de provider no futuro não deveria
  exigir mudar `backend/src/routes/ai.ts`.
- Mesma separação em camadas do `YouTubeService`: `client.ts` (chamada crua
  à Messages API da Anthropic, sem noção de domínio), `prompts.ts` (funções
  puras que montam `{ system, prompt }` pra cada capacidade — testáveis sem
  rede) e `parser.ts` (extrai um array de strings da resposta de
  ideias/títulos, removendo cercas de código markdown que o modelo às vezes
  inclui mesmo quando instruído a não usar — mais robusto que confiar 100%
  que o modelo sempre obedece o formato pedido).
- Modelo fixado em `ANTHROPIC_MODEL` (`client.ts`) em vez de configurável
  via env var — não há necessidade real de trocar de modelo por ambiente
  ainda (YAGNI, mesma lógica do resto do `services/`).
- `backend/src/routes/ai.ts`: quatro rotas finas (`POST /api/ai/ideas`,
  `/script`, `/titles`, `/description`), autenticadas e com rate limit mais
  apertado (10/min) que rotas de leitura — cada geração custa tokens de
  verdade. Só existem pra expor/testar o `AIProvider`; nada é persistido
  ainda (`Script`/`GeneratedTitle`/`GeneratedDescription` — já existentes
  no schema desde a Fase 2 — só passam a ser gravados quando existir um
  `ContentProject` de verdade pra ligar, na Fase 12), então essas rotas
  simplesmente devolvem o texto/array gerado.
- **Testado sem credenciais reais da Anthropic**: `prompts.ts` e
  `parser.ts` são puros e cobertos com dado fabricado (inclusão correta de
  tópico/quantidade/roteiro no prompt; parsing de JSON limpo, com cerca de
  código com/sem a tag `json`, e os erros esperados para JSON inválido ou
  que não é array de strings). As rotas têm sua guarda de autenticação e
  validação de parâmetros testadas; a chamada de verdade à Anthropic API
  não foi validada (exige `ANTHROPIC_API_KEY` real — mesma situação do
  `YOUTUBE_API_KEY` na Fase 5). Validado manualmente via curl com a chave
  placeholder do `.env`: a rota responde 502 de forma limpa (sem derrubar o
  processo) quando a Anthropic API rejeita a chave.

### Content Projects (Fase 12)

- `backend/src/routes/contentProjects.ts` fecha o ciclo desenhado desde a
  Fase 2: `ContentProject` (opcionalmente ligado a uma `Opportunity`) reúne
  `Script`/`GeneratedTitle`/`GeneratedDescription`, todos gerados pelo
  `AIProvider` da Fase 11 e agora persistidos de verdade.
  `POST /api/content-projects` aceita um `opportunityId` opcional; quando
  informado e a `Opportunity` ainda está `NEW`, ela passa pra
  `IN_PROGRESS` — sinaliza "isso já virou trabalho" sem seria cedo demais
  marcar `CONVERTED` (isso fica pra quando existir um `PublishedVideo` de
  verdade, Fase 17).
- `POST .../generate-script` usa o `title` do projeto como "ideia" por
  padrão (ou um `idea` explícito no body) e grava uma nova versão
  (`version` incremental, nunca sobrescreve a anterior — histórico de
  tentativas fica no banco). `POST .../generate-titles` e
  `.../generate-description` usam o roteiro mais recente como contexto pra
  gerar algo coerente com o que já foi escrito, não genérico demais;
  `generate-description` responde 400 (não 502) se ainda não existe
  nenhum roteiro — não é erro da IA, é um pré-requisito do fluxo que a UI
  já impede (botão desabilitado).
- Seleção de título/descrição (`POST .../titles/:id/select`,
  `.../descriptions/:id/select`) é "rádio": marca o escolhido e desmarca
  os outros do mesmo projeto numa transação — nunca dois `selected: true`
  ao mesmo tempo.
- Frontend: `ContentProjectsPage.tsx` (lista + criação por título) e
  `ContentProjectDetailPage.tsx` (roteiro/títulos/descrição, cada um com
  botão de gerar e — pra título/descrição — clique pra selecionar, com
  destaque visual do selecionado). `OpportunitiesPage.tsx` ganhou um botão
  "Criar conteúdo" por oportunidade (esconde só quando `DISMISSED`) que
  cria o projeto já vinculado e navega direto pra ele — fecha o caminho
  Dashboard → Oportunidade → Conteúdo sem precisar copiar/colar nada
  manualmente.
- **Testado sem credenciais reais da Anthropic**: CRUD do projeto,
  transição da `Opportunity` pra `IN_PROGRESS`, seleção exclusiva de
  título/descrição, 400 de `generate-description` sem roteiro, guarda de
  autenticação/isolamento por usuário em todas as rotas — tudo com dado
  fabricado via Prisma, sem precisar da chamada de rede de verdade.
  Validado ao vivo no navegador com um projeto semeado direto no banco:
  troca de título selecionado persiste no Postgres (não só otimista no
  client), `POST .../generate-script` com a chave placeholder mostra
  "Falha ao gerar roteiro com IA" na UI sem corromper o estado (roteiro
  anterior continua visível), e o botão "Criar conteúdo" da
  `OpportunitiesPage` cria o projeto, vincula a `opportunityId` e marca a
  oportunidade como `IN_PROGRESS` — confirmado por query direta no banco,
  não só pela resposta da API.
- **Nota de teste**: o arquivo `contentProjects.test.ts` reaproveita um
  único usuário (`mainUser`) pra todo teste que não é especificamente
  sobre isolamento entre dois usuários — o rate limit de
  `POST /api/auth/register` (20/min, Fase 3) estourava com ~20 registros
  novos num arquivo desse tamanho, e a falha aparecia de um jeito confuso
  (erro de validação do Prisma por causa de um `id` `undefined`, não um
  429 óbvio) até eu rastrear a causa raiz.

### Upload de mídia (Fase 13)

- **Decisão de armazenamento**: disco local (`backend/uploads/`, gitignored)
  em vez de object storage na nuvem — escolha deliberada com o usuário pra
  não depender de uma conta/bucket que ele ainda não tem (mesma situação do
  YouTube OAuth na Fase 4 e do Anthropic na Fase 11). **Isso não sobrevive a
  um redeploy no Render** (filesystem efêmero) — pendência explícita pra
  revisitar antes da Fase 20 (deploy), quando provavelmente vira um
  requisito real migrar pra S3/R2/similar.
- `MediaUpload` é **1:1 com `ContentProject`** (`contentProjectId @unique`)
  — diferente de `Script` (que versiona cada tentativa), um projeto só
  precisa do upload mais recente; reenviar um vídeo apaga o arquivo antigo
  do disco e substitui a linha no banco (`upsert`) em vez de acumular
  histórico. `rightsStatus`/`containsSyntheticMedia` ficam de fora do
  modelo por enquanto — entram na Fase 14 (Validação de direitos), que é a
  fase seguinte de propósito; declarar isso antes de existir um arquivo de
  verdade não faria sentido.
- `backend/src/routes/media.ts`: `POST .../media` (upload, via
  `@fastify/multipart`, limite de 500MB configurado globalmente em
  `app.ts`), `DELETE .../media` e `GET .../media/file` (streaming
  autenticado — não é uma URL pública/assinada; o `<video>` do frontend
  manda o cookie httpOnly normalmente por ser uma requisição de mesma
  origem). Só aceita `mimetype` começando com `video/`; nome do arquivo no
  disco é gerado (`randomUUID() + nome sanitizado`), nunca usa o filename
  enviado pelo cliente diretamente no path (proteção contra path
  traversal).
- Frontend: nova seção "Vídeo" no topo de `ContentProjectDetailPage.tsx`
  — `<video controls>` apontando pra `/api/content-projects/:id/media/file`
  quando existe upload, input de arquivo + botão "Enviar vídeo"/"Substituir
  vídeo" (via `FormData`, sem `Content-Type` manual — o browser define o
  boundary do multipart sozinho), botão "Remover".
- **Testado com upload real** (não só rede simulada): `media.test.ts`
  monta o corpo multipart manualmente (boundary + `Content-Disposition`) e
  testa upload/substituição/download/remoção fim a fim contra o Postgres e
  o disco de verdade — sem precisar de nenhuma credencial externa,
  diferente das Fases 5/11 (aqui não tem API de terceiro envolvida).
  Validado também via curl com um arquivo real fora dos testes (confirma
  que o multipart funciona pela rede de verdade, não só via
  `app.inject()`) e ao vivo no navegador: player renderiza, "Remover" some
  com o vídeo da tela e apaga o arquivo do disco — confirmado via
  `ls` no diretório de uploads, não só pela resposta da API.

### Validação de direitos (Fase 14)

- `rightsStatus` (nullable) e `containsSyntheticMedia` (default `false`)
  entraram no `MediaUpload` como campos separados do upload em si — a
  declaração é um passo distinto de enviar o arquivo, e `null` marca
  "ainda não declarado". A regra que isso serve pra cumprir já estava
  documentada no README desde a Fase 1 ("Toda publicação exige um vídeo
  enviado pelo próprio usuário com direitos declarados"); a Fase 14
  simplesmente a torna **reforçada em código**, não só documentada: o
  `PATCH /api/content-projects/:id` recusa (400) marcar o projeto como
  `READY` se não existir `MediaUpload`, ou se existir mas
  `rightsStatus` ainda for `null`.
- **Reenviar o vídeo reseta a declaração** (`rightsStatus: null,
containsSyntheticMedia: false` no `update` do upsert em `media.ts`) —
  um arquivo novo é conteúdo diferente do que foi declarado antes; manter
  a declaração antiga colada a um arquivo novo seria uma declaração falsa
  por omissão.
- `PATCH /api/content-projects/:id/media/rights`: 404 se ainda não existe
  upload (não faz sentido declarar direitos de um vídeo que não existe),
  valida `rightsStatus` contra o enum `RightsStatus` já existente desde a
  Fase 2 (`ORIGINAL`/`AUTHORIZED`/`LICENSED`/`PUBLIC_DOMAIN`) e
  `containsSyntheticMedia` como booleano obrigatório (a pergunta é
  sempre feita, mesmo que a resposta mais comum seja `false`).
- Frontend: seção "Direitos do vídeo" dentro do card "Vídeo" de
  `ContentProjectDetailPage.tsx` (só existe quando já há um upload) — um
  `<select>` + checkbox controlados via `ref` (não `useState`, mesmo
  padrão do input de arquivo), com `key` no wrapper baseada em
  `fileName+sizeBytes` pra forçar o formulário a resetar quando o vídeo é
  substituído (senão os campos "não controlados" ficariam mostrando a
  seleção antiga do usuário mesmo depois do backend zerar a declaração).
- **Testado sem depender de rede externa**: 404 sem upload, validação de
  `rightsStatus` inválido, reset da declaração num re-upload, e o guard
  de `READY` nos dois sentidos (bloqueia sem declaração, libera depois
  dela) — tudo contra o Postgres real. Validado ao vivo no navegador:
  tentar marcar como "Pronto" sem declarar mostra o erro certo na tela,
  declarar e tentar de novo funciona — confirmado por query direta no
  banco (`status = 'READY'`), não só pela resposta da UI.

### Preview (Fase 15)

- Fase puramente de composição — nenhuma rota nova no backend. `GET
/api/content-projects/:id` (Fase 12) já devolve tudo que a prévia
  precisa (`mediaUpload`, `generatedTitles`/`generatedDescriptions` com
  `selected`, `scripts`); `ContentProjectPreviewPage.tsx` (rota
  `/content/:id/preview`) só lê e recombina esses dados num formato
  somente-leitura — vídeo, título e descrição **selecionados** (não a
  lista inteira de opções, ao contrário da página de detalhe) + um
  checklist (`buildChecklist`, função pura) do que falta pra ficar
  pronto: vídeo enviado, direitos declarados, roteiro gerado, título e
  descrição selecionados.
- Deliberadamente **sem botão de publicar** — a página existe pra dar
  confiança antes da publicação de verdade, que só existe a partir da
  Fase 16 (upload real pro YouTube); um botão "Publicar" aqui não faria
  nada além de enganar quem estivesse testando.
- Link "Ver prévia" adicionado no cabeçalho de
  `ContentProjectDetailPage.tsx`, ao lado do seletor de status.
- **Testado sem rede**: checklist com tudo pendente vs. tudo feito,
  título/descrição errados (não selecionados) não aparecem na prévia,
  404 pro projeto inexistente. Validado ao vivo no navegador com um
  projeto semeado já com vídeo/roteiro/título/descrição — checklist
  totalmente verde, título e descrição corretos exibidos.

### Upload para o YouTube (Fase 16)

- `backend/src/youtube/publish.ts`: upload **multipart simples** (metadata
  JSON + bytes do vídeo numa única requisição) pra `videos.insert`, não
  upload resumível — mais simples de implementar corretamente e suficiente
  pro teto de 500MB já imposto na Fase 13; resumível (com retomada em
  falha de rede) fica pra quando a escala justificar (Fase 21+). O arquivo
  inteiro é lido pra memória (`Buffer`) antes do upload — mesma lógica de
  "não otimizar pra escala ainda" das decisões de storage da Fase 13.
- `status.privacyStatus` sempre `"private"` — nunca publica publicamente
  sem uma ação explícita do usuário fora do CanalProArt; o vídeo fica
  acessível só pelo dono, que troca a visibilidade manualmente no YouTube
  Studio quando quiser. `status.containsSyntheticMedia` vem direto do
  `MediaUpload` (declarado na Fase 14), como já estava planejado desde a
  Fase 4 (`docs/YOUTUBE.md`, seção 7).
- `POST /api/content-projects/:id/publish` reforça em código os mesmos
  pré-requisitos do checklist da Fase 15 — `status === "READY"` (não
  `PUBLISHED` ainda, senão 400 "já publicado"), título e descrição
  **selecionados** (não apenas gerados; esses dois não são cobertos pelo
  guard de `READY` da Fase 14, que só olha `MediaUpload`), e a
  `YoutubeAccount` informada existir e pertencer ao usuário.
- **Todo resultado vira um `PublishedVideo`** — sucesso (`status:
"PUBLISHED"`, com `youtubeVideoId`) ou falha (`status: "FAILED"`, sem
  `youtubeVideoId`) — histórico completo de tentativas pra Fase 17, não só
  dos sucessos. Em caso de sucesso, `ContentProject.status` vira
  `PUBLISHED` e, se o projeto tinha uma `Opportunity` vinculada, ela vira
  `CONVERTED` numa única transação — fecha o ciclo desenhado desde a Fase
  9 (`NEW` → `IN_PROGRESS` na Fase 12 → `CONVERTED` aqui).
- Frontend: seção "Publicar" em `ContentProjectPreviewPage.tsx` — busca os
  canais conectados (`GET /api/youtube/accounts`, Fase 4), mostra um
  seletor + botão quando o projeto está `READY` e há pelo menos um canal;
  senão mostra o que falta (marcar como pronto, ou conectar um canal com
  link pra `/youtube`). Depois de publicar, mostra o link pro vídeo no
  YouTube.
- **Testado sem credenciais OAuth reais** (mesma situação das Fases 4/5):
  guarda de autenticação, validação, e cada pré-requisito faltando
  (status errado, sem título/descrição selecionados, conta de outro
  usuário) — nenhum desses caminhos chega perto da chamada de rede.
  Validado com uma chamada de rede **de verdade** via curl e ao vivo no
  navegador: com um `access_token` fake (decriptografa mas não é válido
  pro Google), a chamada a `videos.insert` falha como esperado (401 do
  Google), a rota responde 502 de forma limpa, cria um `PublishedVideo`
  com `status: "FAILED"` e **não** marca o projeto como `PUBLISHED` —
  confirmado por query direta no banco nos dois casos (curl e clique real
  no botão da UI).

### Histórico de publicações (Fase 17)

- Fase leve — nenhuma tabela nova, nenhuma chamada de rede. `POST
.../publish` (Fase 16) já cria um `PublishedVideo` em **todo**
  resultado (sucesso ou falha); `GET /api/published-videos` só lê,
  ordenado por `createdAt desc`. `PublishedVideo` não tem `userId`
  próprio — o filtro passa por `contentProject.userId`, mesmo padrão já
  usado em `dashboard.ts` (Fase 9) pra tabelas sem `userId` direto.
- Frontend: `PublishedVideosPage.tsx` (rota `/videos`, substituindo o
  placeholder que já existia desde a Fase 1) lista título do projeto,
  canal, status (badge) e — só quando `PUBLISHED` — um link pro vídeo no
  YouTube. Falhas aparecem na lista igual sucessos (sem
  `youtubeVideoId`), não só os sucessos — é histórico de tentativas, não
  uma vitrine.
- **Testado sem rede**: agregação (título do projeto + canal juntos na
  mesma linha), isolamento por usuário, inclusão de falhas (não só
  sucesso), lista vazia — tudo com dado fabricado via Prisma. Validado
  ao vivo no navegador com um sucesso e uma falha semeados: os dois
  aparecem, o link "Ver no YouTube" só no sucesso e aponta pro
  `youtubeVideoId` certo.

### Configurações, exclusão de pesquisas e abrir vídeo (pós-Fase 17)

- **Excluir pesquisas**: `DELETE /api/trends/searches/:id` (uma) e `DELETE
/api/trends/searches` (todas do usuário). Só remove o histórico/cache
  (`Search` + `SearchVideo` em cascata); `Trend`/`Opportunity`/
  `ContentProject` já gerados ficam — são o resultado da análise, não o log
  de buscas. Usa `deleteMany` com `userId` no filtro: 404 idêntico para "não
  existe" e "é de outro usuário". Efeito colateral documentado na UI: repetir
  uma busca apagada não vem mais do cache e gasta cota do YouTube. Na
  `TrendsPage`, cada chip ganhou um ✕ e há "Limpar histórico" (com
  confirmação); o mesmo botão existe em Configurações.
- **Abrir o vídeo**: cada card de tendência (`TrendsPage`) e cada vídeo da
  análise (`TrendAnalysisPage`) tem um link "Abrir no YouTube" (nova aba,
  `rel="noopener noreferrer"`), além da thumbnail clicável.
- **Sem download de vídeos de terceiros — de propósito.** Baixar e reenviar
  vídeo alheio ao próprio canal viola direitos autorais e a política de
  "conteúdo reutilizado" do YouTube (o canal perde monetização ou leva
  strike), e contraria a regra do projeto (ver README). O caminho suportado
  para transformar uma tendência em vídeo é: Oportunidade → "Criar
  conteúdo" (roteiro/título/descrição originais via IA) → upload de um
  vídeo **próprio ou autorizado** com direitos declarados (Fases 13–16).
- **Página de Configurações** (`/settings`, `SettingsPage.tsx`, substitui o
  placeholder): conta, canais conectados, a **redirect URI** exata para
  cadastrar no Google Cloud Console (com botão copiar), região padrão das
  tendências (`localStorage`, ver `preferences.ts` — não justifica tabela) e
  limpeza do histórico.
- **Diagnóstico das integrações**: `POST /api/settings/check` faz uma
  chamada barata de verdade a cada serviço — `videos.list` (1 unidade de
  cota) para a `YOUTUBE_API_KEY` e `GET /v1/models` (sem custo de tokens)
  para a `ANTHROPIC_API_KEY` — e devolve, por integração, se a chave é
  válida, foi recusada, ou se a cota acabou. Rate limit de 5/min. As
  variáveis já são obrigatórias no boot (`env.ts`), mas "não vazia" não é
  "válida"; sem esse teste o erro só aparecia na primeira busca.
  `GET /api/settings` nunca devolve segredo (só a redirect URI, o ambiente e
  a contagem de canais) e emite avisos de configuração **só em produção**
  (redirect URI apontando para localhost, ou com origem diferente de
  `FRONTEND_URL`) — em dev, Vite (:5173) e backend (:3000) têm origens
  diferentes por design, então avisar lá seria falso positivo.
- **Testado**: exclusão (uma/todas, 404, isolamento entre usuários,
  preservação de `Trend`/`Video`), rotas de configurações com `fetch`
  substituído (chave ok/recusada/cota/rede caindo) e a garantia de que
  nenhum segredo aparece na resposta; frontend com chips, confirmação,
  erro de exclusão e a página de Configurações. Validado ao vivo no
  navegador contra o Postgres local: excluir um chip persiste no banco, e
  "Testar conexões" com as chaves reais do `.env` confirmou YouTube Data
  API e Anthropic válidas.

### Importar vídeo por link direto (pós-Fase 17)

- `POST /api/content-projects/:id/media/import` (`{ url }`) faz o servidor
  baixar um **arquivo de vídeo** de um link direto (.mp4/.mov/.webm… num
  servidor do próprio usuário, CDN, S3, Dropbox com `?dl=1`) e o coloca no
  mesmo fluxo do upload: mesmo limite de 500MB, mesmo `MediaUpload` (1:1 com
  o projeto), **direitos resetados** e ainda obrigatórios antes de `READY`/
  publicar. O botão fica em "Importar por link", no card Vídeo do projeto.
- **Não funciona com links do YouTube — de propósito.** `youtube.com`,
  `youtu.be`, `youtube-nocookie.com` e `googlevideo.com` (o CDN dos streams)
  são recusados com uma mensagem explicando. O projeto não baixa vídeos do
  YouTube (ver README e docs/YOUTUBE.md); páginas de player de outras redes
  também não servem, porque respondem HTML e não um arquivo de vídeo.
- **Segurança (SSRF)** — `backend/src/media/remoteDownload.ts`. Pedir pro
  servidor buscar uma URL escolhida pelo usuário é o vetor clássico pra
  alcançar `localhost`, a rede interna do Render ou o endpoint de metadados
  da nuvem (169.254.169.254). Travas: só http/https nas portas 80/443, sem
  usuário/senha na URL; o IP de **cada conexão** é validado no momento de
  conectar (`lookup` customizado — cobre DNS rebinding), e IP literal
  (inclusive disfarçado em decimal/hexa/octal ou IPv6 mapeado) é checado à
  parte, porque não passa pelo DNS; cada redirecionamento (máx. 3) passa pela
  mesma validação; erros de rede viram uma mensagem genérica (nada de
  IP/host interno vazando pra tela).
- **Limites e integridade**: aceita `video/*`, ou tipo binário genérico
  (`application/octet-stream`, comum em Dropbox/S3) só se a extensão for de
  vídeo conhecida; barra pelo `Content-Length` e, sem ele, contando os bytes
  do stream (413); timeout de 30 s ocioso e 20 min no total; sem compressão
  (`Accept-Encoding: identity`); rate limit de 5/min na rota. O download vai
  pra um `.part` e o vídeo anterior do projeto só é apagado **depois** que o
  novo chegou inteiro — importação que falha não destrói o que já existia.
- **Rastro de origem**: cada importação grava um `AuditLog`
  (`MEDIA_IMPORTED_FROM_URL`) com a URL de origem **sem a query string**
  (links assinados carregam token), tamanho e tipo — pra quando a declaração
  de direitos for questionada. Não exigiu migration.
- **Limitação conhecida**: o download é síncrono (a requisição fica aberta
  até terminar) e vai pro disco local, então herda a pendência de storage
  efêmero no Render (ver "Upload de mídia"). Links de compartilhamento do
  Google Drive não funcionam (devolvem uma página HTML de confirmação).
- **Testado**: unidade do downloader contra um servidor HTTP local de verdade
  (tipos, nome por `Content-Disposition`, 404, vazio, limite com/sem
  `Content-Length`, redirecionamento, redirecionamento pro YouTube, laço) e
  64 casos das travas (faixas de IP, disfarces, YouTube e domínios
  parecidos que **não** podem ser bloqueados); rotas com o download
  substituído (grava, troca o vídeo, reseta direitos, auditoria sem query,
  limpeza do `.part`, falha preserva o vídeo anterior). Validado ao vivo
  contra DNS/TLS reais: `example.com` recusado por ser HTML, e YouTube,
  `localhost` e `169.254.169.254` barrados — nada gravado em disco.

## Frontend

- **Vite + React + TypeScript**, Tailwind CSS v4 via `@tailwindcss/vite`
  (sem `tailwind.config.js` — Tailwind v4 configura via CSS/`@import`).
- Em desenvolvimento, o Vite faz proxy de `/api/*` para `http://localhost:3000`
  (`vite.config.ts`), então o frontend nunca precisa conhecer a URL do backend
  via variável de ambiente — evita duplicar `BACKEND_URL` em dois lugares.
- Toda chamada assíncrona segue os estados `loading / success / error` (e
  `empty` quando a resposta é uma lista) — ver `src/pages/Dashboard.tsx` para
  o padrão de referência.

## Banco de dados

- PostgreSQL 16 via `docker-compose.yml` (uso local/dev). Em produção, Postgres
  gerenciado pelo Render (Fase 20).
- Prisma como ORM. Schema base (14 tabelas do briefing: `users`,
  `youtube_accounts`, `searches`, `videos`, `video_metrics`, `trends`,
  `trend_videos`, `opportunities`, `content_projects`, `scripts`,
  `generated_titles`, `generated_descriptions`, `published_videos`,
  `audit_logs`) implementado na **Fase 2** (`prisma/schema.prisma` +
  migration `prisma/migrations/20260923020625_init_schema`); `search_videos`
  (join `Search` ↔ `Video`) somado na Fase 6; `media_uploads` somado na
  Fase 13 (não fazia parte das 14 tabelas originais do briefing — igual
  `search_videos`, é um gap que só apareceu na hora de implementar de
  verdade). `User` em uso desde a Fase 3 (auth), `YoutubeAccount` desde a
  Fase 4 (OAuth), `Opportunity`/`ContentProject`/`Script`/
  `GeneratedTitle`/`GeneratedDescription` desde as Fases 9/12,
  `MediaUpload` desde a Fase 13 — `PublishedVideo`/`AuditLog` ainda não têm
  rota.

### Diretrizes seguidas no schema da Fase 2

- **Enums do Prisma** para campos de domínio fechado em vez de `String` solto
  — ex.: `enum RightsStatus { ORIGINAL AUTHORIZED LICENSED PUBLIC_DOMAIN }`
  no lugar do status de direitos citado em `docs/YOUTUBE.md`.
- **`createdAt`/`updatedAt`** em todas as tabelas (`@default(now())` /
  `@updatedAt`).
- **`fetchedAt`** nas tabelas que guardam dados vindos da YouTube Data API
  (`videos`, `video_metrics`, `trends`, ...) — ver "Retenção e atualização de
  dados" em `docs/YOUTUBE.md`.
- **Índices** em toda foreign key e em colunas usadas para filtro/ordenação
  (ex.: `trend_score`, `fetchedAt`, `userId`).
- **IDs** como `cuid()`/`uuid()` (`@id @default(cuid())`), nunca inteiros
  auto-incrementais expostos em rotas públicas.
- **Tokens OAuth do YouTube sempre criptografados** (AES-256-GCM) com
  `TOKEN_ENCRYPTION_KEY` — que precisa ser uma chave **distinta** de
  `JWT_SECRET` (nunca reaproveitar o mesmo segredo para as duas coisas; já
  reforçado em `docs/ENVIRONMENT.md`).

## Deploy

- **Estratégia escolhida: mesma origem (opção a — backend serve o build do
  frontend).** Em produção, o Fastify registra `@fastify/static` apontando
  para `frontend/dist` e um fallback SPA (`setNotFoundHandler`) que devolve
  `index.html` para qualquer rota `GET` fora de `/api/*` — necessário para o
  React Router funcionar em refresh/deep-link (ex.: `/trends`). Existe uma
  única URL pública (um Web Service no Render), então não há CORS entre
  front e back em produção nem necessidade de uma segunda variável tipo
  `VITE_API_URL` duplicando `BACKEND_URL`/`FRONTEND_URL` (já validados em
  `env.ts`).
- Em desenvolvimento local nada muda: o Vite continua rodando separado
  (`http://localhost:5173`) e fazendo proxy de `/api/*` para o backend
  (`http://localhost:3000` — ver `frontend/vite.config.ts`). O registro do
  `@fastify/static`/fallback só acontece quando `NODE_ENV=production`
  (`backend/src/app.ts`), então dev e testes (`NODE_ENV=test`) não dependem
  de um `frontend/dist` existir.
- `backend/Dockerfile` builda os três workspaces necessários para o runtime
  (`services`, `backend`, `frontend`) e copia `frontend/dist` para a imagem
  final.
- Por que não a opção (b) (Render Static Site + `VITE_API_URL` + rewrite):
  para o estágio atual (MVP, um único serviço) ela só adiciona uma segunda
  origem (CORS) e uma variável de ambiente redundante, sem benefício real —
  fica registrada aqui como alternativa caso o projeto precise, no futuro,
  hospedar o frontend num CDN separado do backend.

## Roadmap por fases

| Fase | Escopo                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| 1    | **Arquitetura** (monorepo, Docker, env, health check) ✅                                                      |
| 2    | PostgreSQL + Prisma (schema completo) ✅                                                                      |
| 3    | Autenticação (cadastro/login/JWT) + `@fastify/helmet` e `@fastify/rate-limit` ✅                              |
| 4    | YouTube OAuth (connect/callback/refresh/disconnect) ✅                                                        |
| 5    | YouTube Data API (`YouTubeService`) ✅                                                                        |
| 6    | Pesquisa de tendências (`/trends`) ✅                                                                         |
| 7    | Métricas (velocidade/engajamento/recência/volume) ✅                                                          |
| 8    | Trend Score (cálculo server-side) + classificação ✅                                                          |
| 9    | Dashboard (cards, gráfico, top oportunidades) ✅                                                              |
| 10   | Página de análise de tendência ✅                                                                             |
| 11   | IA (`AIProvider`: ideias/roteiro/títulos/descrição) ✅                                                        |
| 12   | Content Projects ✅                                                                                           |
| 13   | Upload de mídia (vídeo próprio/autorizado) ✅                                                                 |
| 14   | Validação de direitos ✅                                                                                      |
| 15   | Preview ✅                                                                                                    |
| 16   | Upload para o YouTube ✅                                                                                      |
| 17   | Histórico de publicações ✅                                                                                   |
| 18   | Testes E2E + revisão de cobertura (testes unitários/integração já são escritos a cada fase — ver nota abaixo) |
| 19   | Segurança avançada (auditoria, quota manager, revisão do rate limit/helmet da Fase 3)                         |
| 20   | Deploy no Render                                                                                              |
| 21+  | Redis, BullMQ, FFmpeg, automação, escala (só após o MVP validado)                                             |

Cada fase é implementada, testada e validada antes de avançar para a próxima
— testes (unitários e de rota) são escritos junto do código de cada fase,
nunca depois. A **Fase 18** não é "quando os testes começam": é a fase
dedicada a fechar lacunas, escrever os testes E2E que cruzam várias fases
(ex.: fluxo completo busca → oportunidade → conteúdo → publicação) e revisar
a cobertura acumulada antes do endurecimento de segurança da Fase 19 e do
deploy da Fase 20.
