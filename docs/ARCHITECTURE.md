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
