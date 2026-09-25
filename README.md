# CanalProArt — YouTube Trend Hunter + Content Factory

Plataforma para descobrir tendências no YouTube (dados públicos via YouTube Data
API v3), calcular um Trend Score, gerar ideias/roteiros/títulos/descrições
originais com IA, e publicar vídeos próprios/autorizados no canal do usuário
através da API oficial do YouTube.

> O sistema **não** baixa, copia ou republica vídeos protegidos de terceiros.
> Vídeos de terceiros são usados apenas como referência de tendência/métricas
> públicas. Toda publicação exige um vídeo enviado pelo próprio usuário com
> direitos declarados (ORIGINAL, AUTHORIZED, LICENSED ou PUBLIC_DOMAIN).

**Status atual: Fase 17 — Histórico de publicações**, mais página de
Configurações (diagnóstico das chaves), capas e exclusão de pesquisas, exclusão
de conteúdos, importação de vídeo por link direto e link "Abrir no YouTube" nas
tendências.
Veja o roadmap completo em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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

1. Copie o arquivo de ambiente (os valores padrão já funcionam com o
   `docker-compose.yml`), e gere `JWT_SECRET`/`TOKEN_ENCRYPTION_KEY` — o
   backend não sobe sem eles:

   ```bash
   cp .env.example .env
   # preencha JWT_SECRET e TOKEN_ENCRYPTION_KEY no .env, cada um com:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`/`YOUTUBE_REDIRECT_URI`/
   `YOUTUBE_API_KEY` também são obrigatórios a partir da Fase 4/5 — qualquer
   valor não vazio deixa o backend subir, mas só com credenciais reais do
   Google Cloud Console (veja [docs/YOUTUBE.md](docs/YOUTUBE.md)) o botão
   "Conectar YouTube" e a busca de vídeos populares funcionam de ponta a
   ponta.

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

| Script                    | O que faz                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev:backend`     | Backend em modo watch (`tsx`) — `http://localhost:3000` (builda `services` antes, se preciso)                              |
| `npm run dev:frontend`    | Frontend em modo dev (Vite) — `http://localhost:5173`                                                                      |
| `npm run dev:services`    | `services/` em modo watch (`tsc --watch`) — rode num terceiro terminal se for editar `services/src` com o backend já no ar |
| `npm run lint`            | ESLint em todos os workspaces                                                                                              |
| `npm run typecheck`       | `tsc --noEmit` em todos os workspaces                                                                                      |
| `npm run format`          | Formata o repo com Prettier                                                                                                |
| `npm run format:check`    | Só verifica a formatação (usado no CI)                                                                                     |
| `npm test`                | Testes (backend precisa do Postgres rodando — passo 3)                                                                     |
| `npm run build`           | Build de produção (`services` → `backend` → `frontend`)                                                                    |
| `npm run prisma:generate` | Gera o Prisma Client a partir de `prisma/schema.prisma`                                                                    |
| `npm run prisma:migrate`  | Roda migrations do Prisma em dev                                                                                           |

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
  -e JWT_SECRET="<32+ caracteres>" \
  -e TOKEN_ENCRYPTION_KEY="<32 bytes hex ou base64, diferente do JWT_SECRET>" \
  -e YOUTUBE_CLIENT_ID="<do Google Cloud Console>" \
  -e YOUTUBE_CLIENT_SECRET="<do Google Cloud Console>" \
  -e YOUTUBE_REDIRECT_URI="http://localhost:3000/api/youtube/callback" \
  -e YOUTUBE_API_KEY="<do Google Cloud Console>" \
  canalproart-backend
```

(As variáveis obrigatórias são as mesmas do `.env` — ver
[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).)

Roda como usuário não-root (`node`) e expõe um `HEALTHCHECK` em `/api/health`.

## CI

Todo push/PR para `main` roda `.github/workflows/ci.yml`: install → lint →
format check → typecheck → migrations → test (com Postgres como service
container) → build.

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
- [DEPLOY.md](docs/DEPLOY.md) — passo a passo de deploy (Supabase + Render)

## Regras do projeto

- Nenhum segredo (chaves, tokens, senhas) é commitado — `.env` está no
  `.gitignore`; use `.env.example` como referência.
- Nenhum mecanismo para burlar DRM, autenticação, limitações ou quotas do
  YouTube é implementado.
- Conteúdo de terceiros é usado apenas como referência analítica, nunca
  baixado/republicado automaticamente. A importação de vídeo por link aceita
  só link direto de arquivo (seu ou autorizado), recusa links do YouTube e
  exige declarar os direitos antes de publicar.
