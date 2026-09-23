# CanalProArt — YouTube Trend Hunter + Content Factory

Plataforma para descobrir tendências no YouTube (dados públicos via YouTube Data
API v3), calcular um Trend Score, gerar ideias/roteiros/títulos/descrições
originais com IA, e publicar vídeos próprios/autorizados no canal do usuário
através da API oficial do YouTube.

> O sistema **não** baixa, copia ou republica vídeos protegidos de terceiros.
> Vídeos de terceiros são usados apenas como referência de tendência/métricas
> públicas. Toda publicação exige um vídeo enviado pelo próprio usuário com
> direitos declarados (ORIGINAL, AUTHORIZED, LICENSED ou PUBLIC_DOMAIN).

**Status atual: Fase 3 — Autenticação (cadastro/login/JWT).** Veja o
roadmap completo em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS v4 + React Router + Recharts
- **Backend:** Node.js + TypeScript + Fastify
- **Banco:** PostgreSQL + Prisma
- **IA:** Anthropic (Claude), atrás de uma interface `AIProvider` desacoplada
- **Deploy:** Render (Web Service + PostgreSQL)

## Requisitos

- Node.js 22 (ver [.nvmrc](.nvmrc) — `nvm use`, se você usa `nvm`)
- Docker (para rodar o PostgreSQL localmente e para o build de produção)

## Como rodar localmente

1. Copie o arquivo de ambiente e ajuste se necessário (os valores padrão já
   funcionam com o `docker-compose.yml`):

   ```bash
   cp .env.example .env
   ```

2. Instale as dependências de todos os workspaces (raiz, `backend`, `frontend`,
   `services`, `workers`):

   ```bash
   npm install
   ```

3. Suba o PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

4. Aplique as migrations (isso já gera o Prisma Client também):

   ```bash
   npm run prisma:migrate
   ```

5. Em dois terminais separados, rode o backend e o frontend:

   ```bash
   npm run dev:backend   # http://localhost:3000
   npm run dev:frontend  # http://localhost:5173
   ```

6. Abra `http://localhost:5173`. O Dashboard deve mostrar "Backend online ·
   banco de dados connected".

## Scripts disponíveis

Rodados na raiz, cobrem os workspaces relevantes (`backend`, `frontend`,
`services`, `workers`):

| Script                    | O que faz                                               |
| ------------------------- | ------------------------------------------------------- |
| `npm run dev:backend`     | Backend em modo watch (`tsx`) — `http://localhost:3000` |
| `npm run dev:frontend`    | Frontend em modo dev (Vite) — `http://localhost:5173`   |
| `npm run lint`            | ESLint em todos os workspaces                           |
| `npm run typecheck`       | `tsc --noEmit` em todos os workspaces                   |
| `npm run format`          | Formata o repo com Prettier                             |
| `npm run format:check`    | Só verifica a formatação (usado no CI)                  |
| `npm test`                | Testes (backend precisa do Postgres rodando — passo 3)  |
| `npm run build`           | Build de produção (`services` → `backend` → `frontend`) |
| `npm run prisma:generate` | Gera o Prisma Client a partir de `prisma/schema.prisma` |
| `npm run prisma:migrate`  | Roda migrations do Prisma em dev                        |

## Docker (build de produção)

O `backend/Dockerfile` builda os três workspaces necessários e sobe uma
imagem única: o Fastify serve tanto a API (`/api/*`) quanto o build estático
do frontend (mesma origem — ver [ARCHITECTURE.md](docs/ARCHITECTURE.md) →
"Deploy").

```bash
docker build -f backend/Dockerfile -t canalproart-backend .

docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://canalproart:canalproart@host.docker.internal:5432/canalproart?schema=public" \
  -e FRONTEND_URL="http://localhost:3000" \
  canalproart-backend
```

Roda como usuário não-root (`node`) e expõe um `HEALTHCHECK` em `/api/health`.

## CI

Todo push/PR para `main` roda `.github/workflows/ci.yml`: install → lint →
format check → typecheck → test (com Postgres como service container) →
build.

## Testes

```bash
npm test
```

(Os testes do backend fazem uma consulta real ao Postgres — suba o
`docker compose up -d postgres` antes de rodar.)

## Documentação

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitetura, estrutura de pastas e roadmap por fases
- [ENVIRONMENT.md](docs/ENVIRONMENT.md) — variáveis de ambiente
- [YOUTUBE.md](docs/YOUTUBE.md) — como criar as credenciais da YouTube Data API v3 / OAuth

## Regras do projeto

- Nenhum segredo (chaves, tokens, senhas) é commitado — `.env` está no
  `.gitignore`; use `.env.example` como referência.
- Nenhum mecanismo para burlar DRM, autenticação, limitações ou quotas do
  YouTube é implementado.
- Conteúdo de terceiros é usado apenas como referência analítica, nunca
  baixado/republicado automaticamente.
