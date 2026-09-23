# Deploy (Fase 20)

Status: **banco de produção pronto no Supabase** (schema + migrations
aplicados, RLS habilitado). O deploy do app em si no Render precisa de uma
ação sua no painel deles — não existe uma ferramenta de automação pra isso
aqui, ao contrário do Supabase.

## 1. Banco de dados (já feito)

Projeto Supabase `CanalProArt` (região `sa-east-1`), com as 16 tabelas do
schema já criadas e as 4 migrations existentes registradas como aplicadas
(pra `prisma migrate deploy` não tentar recriá-las). RLS habilitado em toda
tabela — sem policies, de propósito: o backend usa Prisma com a role
`postgres` (que ignora RLS), não a API REST do Supabase, então RLS aqui só
serve pra bloquear a API REST não usada caso a `anon key` vaze algum dia.

**Se uma nova migration for adicionada depois deste deploy**, ela precisa
ser aplicada manualmente nesse banco (via Supabase MCP ou
`prisma migrate deploy` local apontando pra `DATABASE_URL` de produção) —
o Dockerfile atual não roda migrations automaticamente no boot (decisão
deliberada: `prisma` CLI é devDependency e não sobrevive ao
`npm prune --omit=dev` do estágio de runtime; rodar migration como parte do
boot do processo web é arriscado sem um mecanismo de lock, então por
enquanto é manual).

## 2. Pegar a connection string do Supabase

Acesse **Project Settings → Database** no [painel do
projeto](https://supabase.com/dashboard/project/fmyhkyanxlvvgjwjjggp/settings/database).

Em "Connection string", use o modo **Session pooler** (não o "Direct
connection") — o Render não tem saída IPv6, e a conexão direta do Supabase
exige IPv6 a menos que você pague o add-on de IPv4. O pooler funciona em
IPv4 e é compatível com o Prisma sem flags extras.

Copie a URI e troque `[YOUR-PASSWORD]` pela senha do banco (definida na
criação do projeto; se não souber mais, tem um botão "Reset database
password" na mesma página — só lembre de usar a senha nova depois).

## 3. Criar o Web Service no Render

1. [render.com](https://dashboard.render.com) → **New** → **Blueprint**.
2. Conecte sua conta do GitHub (se ainda não conectada) e selecione o
   repositório `Projeto-CanalProArt`.
3. O Render detecta o `render.yaml` da raiz automaticamente e propõe criar
   um Web Service chamado `canalproart` (Docker, usando
   `backend/Dockerfile`).
4. Preencha as variáveis marcadas como obrigatórias (ver tabela abaixo) e
   confirme.

## 4. Variáveis de ambiente

| Variável                | Valor                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | A connection string do passo 2 (Session pooler, com a senha já substituída).                                                                                     |
| `JWT_SECRET`            | Gere com `openssl rand -hex 32`.                                                                                                                                 |
| `TOKEN_ENCRYPTION_KEY`  | Gere com `openssl rand -hex 32` — **precisa ser diferente** do `JWT_SECRET`.                                                                                     |
| `YOUTUBE_CLIENT_ID`     | Do Google Cloud Console (ver [docs/YOUTUBE.md](YOUTUBE.md)). Sem uma credencial real, OAuth não funciona de verdade — mesma limitação já existente em dev.       |
| `YOUTUBE_CLIENT_SECRET` | Idem.                                                                                                                                                            |
| `YOUTUBE_API_KEY`       | Idem — sem ela, a busca de tendências (`/trends`) não funciona de verdade.                                                                                       |
| `YOUTUBE_REDIRECT_URI`  | `https://<nome-do-serviço>.onrender.com/api/youtube/callback` — só dá pra saber o domínio exato depois do primeiro deploy (passo 5).                             |
| `ANTHROPIC_API_KEY`     | Chave real da Anthropic ([console.anthropic.com](https://console.anthropic.com)). Sem ela, a geração por IA responde 502 de forma limpa (mesma situação de dev). |
| `FRONTEND_URL`          | Mesma URL do serviço (`https://<nome-do-serviço>.onrender.com`) — é deploy same-origin, backend serve o frontend.                                                |
| `BACKEND_URL`           | Mesma URL do serviço, de novo.                                                                                                                                   |

`NODE_ENV=production` e `AI_PROVIDER=anthropic` já vêm fixos no
`render.yaml`, não precisa preencher.

## 5. Depois do primeiro deploy

O Render atribui a URL só depois que o serviço existe (`https://
canalproart.onrender.com`, ou com um sufixo se o nome já estiver em uso).
Depois de confirmar a URL real:

1. Atualize `FRONTEND_URL`, `BACKEND_URL` e `YOUTUBE_REDIRECT_URI` no
   painel do Render com a URL exata (isso dispara um redeploy automático).
2. Se for usar OAuth do YouTube de verdade: adicione essa mesma
   `YOUTUBE_REDIRECT_URI` na lista de "Authorized redirect URIs" do OAuth
   Client no Google Cloud Console — sem isso o Google recusa o callback.

## O que funciona sem credenciais reais do Google/Anthropic

Cadastro, login, dashboard, e toda a navegação funcionam normalmente com
placeholders. As chamadas de rede reais (busca de tendências, geração por
IA, upload pro YouTube) respondem um erro limpo (502) até você configurar
credenciais de verdade — mesmo comportamento já validado em dev ao longo
das Fases 4, 5, 11 e 16.
