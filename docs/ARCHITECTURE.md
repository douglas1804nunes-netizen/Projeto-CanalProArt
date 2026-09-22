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
- `prisma/` fica na raiz (não dentro de `backend/`) porque o schema é uma fonte
  única de verdade que poderá ser consumida por `backend/` e futuramente por
  `workers/` sem duplicar o client. O backend aponta para ele explicitamente
  (`--schema=../prisma/schema.prisma` nos scripts `prisma:*` da raiz).

## Backend

- **Fastify** (preferido no briefing por não haver backend pré-existente).
- `src/env.ts` carrega e valida (`zod`) o `.env` da raiz do monorepo — falha
  rápido e de forma explícita se uma variável obrigatória estiver ausente, em
  vez de deixar a aplicação subir com configuração inválida.
- `src/app.ts` monta a instância do Fastify (plugins + rotas) separada de
  `src/server.ts` (que só chama `listen`), para permitir testar rotas via
  `app.inject()` sem abrir uma porta de rede.
- `src/prisma.ts` expõe um `PrismaClient` singleton.
- CORS restrito a `FRONTEND_URL` (nunca `origin: true` em produção).

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
- Prisma como ORM. **Fase 1 tem só `datasource` + `generator`** — nenhum
  modelo ainda. O schema completo (13 tabelas do briefing: `users`,
  `youtube_accounts`, `searches`, `videos`, `video_metrics`, `trends`,
  `trend_videos`, `opportunities`, `content_projects`, `scripts`,
  `generated_titles`, `generated_descriptions`, `published_videos`,
  `audit_logs`) entra na **Fase 2**.

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

| Fase | Escopo |
|------|--------|
| 1 | **Arquitetura** (monorepo, Docker, env, health check) ✅ |
| 2 | PostgreSQL + Prisma (schema completo) |
| 3 | Autenticação (cadastro/login/JWT) |
| 4 | YouTube OAuth (connect/callback/refresh/disconnect) |
| 5 | YouTube Data API (`YouTubeService`) |
| 6 | Pesquisa de tendências (`/trends`) |
| 7 | Métricas (velocidade/engajamento/recência/volume) |
| 8 | Trend Score (cálculo server-side) + classificação |
| 9 | Dashboard (cards, gráfico, top oportunidades) |
| 10 | Página de análise de tendência |
| 11 | IA (`AIProvider`: ideias/roteiro/títulos/descrição) |
| 12 | Content Projects |
| 13 | Upload de mídia (vídeo próprio/autorizado) |
| 14 | Validação de direitos |
| 15 | Preview |
| 16 | Upload para o YouTube |
| 17 | Histórico de publicações |
| 18 | Testes |
| 19 | Segurança (CORS, rate limit, auditoria, quota manager) |
| 20 | Deploy no Render |
| 21+ | Redis, BullMQ, FFmpeg, automação, escala (só após o MVP validado) |

Cada fase é implementada, testada e validada antes de avançar para a próxima.
