# CanalProArt — YouTube Trend Hunter + Content Factory

Plataforma para descobrir tendências no YouTube (dados públicos via YouTube Data
API v3), calcular um Trend Score, gerar ideias/roteiros/títulos/descrições
originais com IA, e publicar vídeos próprios/autorizados no canal do usuário
através da API oficial do YouTube.

> O sistema **não** baixa, copia ou republica vídeos protegidos de terceiros.
> Vídeos de terceiros são usados apenas como referência de tendência/métricas
> públicas. Toda publicação exige um vídeo enviado pelo próprio usuário com
> direitos declarados (ORIGINAL, AUTHORIZED, LICENSED ou PUBLIC_DOMAIN).

**Status atual: Fase 1 — Arquitetura.** Veja o roadmap completo em
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS v4 + React Router + Recharts
- **Backend:** Node.js + TypeScript + Fastify
- **Banco:** PostgreSQL + Prisma
- **IA:** Anthropic (Claude), atrás de uma interface `AIProvider` desacoplada
- **Deploy:** Render (Web Service + PostgreSQL)

## Requisitos

- Node.js ≥ 20
- Docker (para rodar o PostgreSQL localmente)

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

4. Gere o Prisma Client:

   ```bash
   npm run prisma:generate
   ```

5. Em dois terminais separados, rode o backend e o frontend:

   ```bash
   npm run dev:backend   # http://localhost:3000
   npm run dev:frontend  # http://localhost:5173
   ```

6. Abra `http://localhost:5173`. O Dashboard deve mostrar "Backend online ·
   banco de dados connected".

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
