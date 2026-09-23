# Deploy (Fase 20)

Status: **banco de produção pronto no Supabase** (schema + migrations
aplicados, RLS habilitado) e **blueprint do Render pronto** (`render.yaml`).
O que falta é só você criar o serviço no painel do Render e colar 5 segredos
— não há CLI/automação do Render disponível aqui, e segredos nunca devem
passar por terceiros.

## Deploy em 3 passos

1. Abra o link (o repositório é público, o Render lê o `render.yaml` sozinho):
   <https://render.com/deploy?repo=https://github.com/douglas1804nunes-netizen/Projeto-CanalProArt>
2. Faça login/conecte o GitHub e preencha as **5 variáveis** da tabela abaixo.
3. Clique em **Apply**. O primeiro build leva alguns minutos (é um build
   Docker completo: deps, Prisma, TypeScript, Vite).

Quando o deploy ficar "Live", o Render mostra a URL do serviço
(`https://canalproart.onrender.com`, ou com sufixo se o nome estiver em uso).
Abra `<url>/api/health` — deve responder `{"status":"ok",...}`.

## Variáveis que você preenche

| Variável                | De onde vem                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Connection string do Supabase — ver "Banco de dados" abaixo. **Se estiver errada, o deploy falha no health check.** |
| `YOUTUBE_CLIENT_ID`     | Google Cloud Console → OAuth Client (ver [YOUTUBE.md](YOUTUBE.md)).                                                 |
| `YOUTUBE_CLIENT_SECRET` | Idem.                                                                                                               |
| `YOUTUBE_API_KEY`       | Google Cloud Console → API key com a YouTube Data API v3 habilitada (ver [YOUTUBE.md](YOUTUBE.md)).                 |
| `ANTHROPIC_API_KEY`     | [console.anthropic.com](https://console.anthropic.com) → API Keys.                                                  |

## O que o Render preenche sozinho

- `JWT_SECRET` e `TOKEN_ENCRYPTION_KEY`: `generateValue: true` no
  `render.yaml` (base64 de 256 bits, valores distintos, aceitos pela validação
  de `backend/src/env.ts`). **Não troque `TOKEN_ENCRYPTION_KEY` depois** de
  usuários conectarem o YouTube — os tokens gravados no banco ficariam
  ilegíveis.
- `FRONTEND_URL`, `BACKEND_URL` e `YOUTUBE_REDIRECT_URI`: não são declaradas.
  O backend usa `RENDER_EXTERNAL_URL` (injetada pelo Render) como padrão — a
  redirect URI vira `<url>/api/youtube/callback`. Se você usar um domínio
  próprio, defina essas três explicitamente no painel (o valor explícito
  vence o padrão).
- `NODE_ENV=production` e `AI_PROVIDER=anthropic`: fixos no `render.yaml`.

## Banco de dados (já feito)

Projeto Supabase `CanalProArt` (região `sa-east-1`), com as 16 tabelas do
schema e as 4 migrations existentes registradas como aplicadas. RLS
habilitado em toda tabela — sem policies, de propósito: o backend usa Prisma
com a role `postgres` (que ignora RLS), não a API REST do Supabase, então RLS
aqui só bloqueia a API REST não usada caso a `anon key` vaze.

**Connection string:** [Project Settings → Database](https://supabase.com/dashboard/project/fmyhkyanxlvvgjwjjggp/settings/database)
→ "Connection string" → modo **Session pooler** (não "Direct connection": o
Render não tem saída IPv6 e a conexão direta do Supabase exige IPv6). Troque
`[YOUR-PASSWORD]` pela senha do banco (se não souber mais, "Reset database
password" na mesma página).

**Novas migrations:** o Dockerfile não roda migrations no boot (`prisma` CLI é
devDependency e não sobrevive ao `npm prune --omit=dev`; rodar migration no
boot do processo web é arriscado sem lock). Aplique manualmente (Supabase MCP
ou `prisma migrate deploy` local apontando pro `DATABASE_URL` de produção).

## Depois do deploy: conectar o YouTube de verdade

1. No Google Cloud Console → OAuth Client → **Authorized redirect URIs**,
   adicione `https://<url-do-serviço>/api/youtube/callback` (a URL exata que o
   Render mostrou). Sem isso o Google recusa o callback.
2. Se a tela de consentimento estiver em modo **Testing**, adicione sua conta
   em "Test users" (ver [YOUTUBE.md](YOUTUBE.md)).
3. No app: `/youtube` → conectar canal.

## Limitações do plano `free`

- O serviço **dorme após ~15 min sem tráfego** e a primeira requisição depois
  disso demora ~30–60 s (cold start).
- O disco é **efêmero**: vídeos enviados em `/content/:id` (Fase 13, gravados em
  `backend/uploads/`) somem a cada redeploy/restart. Como o upload pro YouTube
  (Fase 16) lê desse disco, envie e publique na mesma sessão. Para persistir,
  é preciso um plano pago com Persistent Disk (montado em `backend/uploads`) ou
  migrar o armazenamento pra um bucket (S3/Supabase Storage).

## Sem credenciais reais

Sem as credenciais do Google/Anthropic, o serviço sobe e cadastro, login,
dashboard e navegação funcionam; as chamadas de rede reais (busca de
tendências, geração por IA, upload pro YouTube) respondem um erro limpo (502)
— mesmo comportamento validado em dev nas Fases 4, 5, 11 e 16.
