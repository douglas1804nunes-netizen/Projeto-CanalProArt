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
- Prisma como ORM. Schema completo (14 tabelas do briefing: `users`,
  `youtube_accounts`, `searches`, `videos`, `video_metrics`, `trends`,
  `trend_videos`, `opportunities`, `content_projects`, `scripts`,
  `generated_titles`, `generated_descriptions`, `published_videos`,
  `audit_logs`) implementado na **Fase 2** (`prisma/schema.prisma` +
  migration `prisma/migrations/20260923020625_init_schema`). `User` em uso
  desde a Fase 3 (auth) e `YoutubeAccount` desde a Fase 4 (OAuth) — os
  demais modelos ainda não têm rota.

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
| 6    | Pesquisa de tendências (`/trends`)                                                                            |
| 7    | Métricas (velocidade/engajamento/recência/volume)                                                             |
| 8    | Trend Score (cálculo server-side) + classificação                                                             |
| 9    | Dashboard (cards, gráfico, top oportunidades)                                                                 |
| 10   | Página de análise de tendência                                                                                |
| 11   | IA (`AIProvider`: ideias/roteiro/títulos/descrição)                                                           |
| 12   | Content Projects                                                                                              |
| 13   | Upload de mídia (vídeo próprio/autorizado)                                                                    |
| 14   | Validação de direitos                                                                                         |
| 15   | Preview                                                                                                       |
| 16   | Upload para o YouTube                                                                                         |
| 17   | Histórico de publicações                                                                                      |
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
