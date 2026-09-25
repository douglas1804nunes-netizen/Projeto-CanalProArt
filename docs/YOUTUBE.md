# YouTube Data API v3 + OAuth — guia de configuração

Este projeto usa dois tipos de credencial do Google, ambas do mesmo projeto no
Google Cloud Console:

1. **API Key** — para chamadas públicas (busca de vídeos, estatísticas).
2. **OAuth 2.0 Client ID/Secret** — para o fluxo "Conectar YouTube", que
   autoriza o backend a publicar vídeos no canal do usuário em nome dele.

## 1. Criar o projeto no Google Cloud Console

1. Acesse https://console.cloud.google.com/.
2. No seletor de projetos (topo da página), clique em **New Project**.
3. Dê um nome (ex.: `canalproart`) e crie.
4. Com o projeto selecionado, vá em **APIs & Services → Library**.
5. Busque por **YouTube Data API v3** e clique em **Enable**.

## 2. Criar a API Key (busca/estatísticas públicas)

1. **APIs & Services → Credentials → Create Credentials → API key**.
2. Copie a key gerada → cole em `YOUTUBE_API_KEY` no `.env`.
3. Clique em **Restrict key** e restrinja:
   - **API restrictions:** apenas _YouTube Data API v3_.
   - **Application restrictions:** em produção, restrinja por IP (servidor do
     Render); em desenvolvimento local pode deixar sem restrição de aplicação.

## 3. Configurar a tela de consentimento OAuth

1. **APIs & Services → OAuth consent screen**.
2. **User Type:** `External` (a menos que você tenha Google Workspace e queira
   restringir ao seu domínio).
3. Preencha nome do app, e-mail de suporte e e-mail de contato do
   desenvolvedor.
4. Em **Scopes**, adicione:
   - `https://www.googleapis.com/auth/youtube.readonly` (ler dados do canal)
   - `https://www.googleapis.com/auth/youtube.upload` (publicar vídeos)
5. Em **Test users**, adicione o(s) e-mail(s) do(s) canal(is) que vão
   conectar durante o desenvolvimento (o app começa em modo **Testing**, com
   limite de 100 usuários de teste — suficiente para o MVP).
6. Publicar para produção (**Publishing status: In production**) só é
   necessário se o app for usado por usuários fora da lista de teste. Como
   `youtube.upload` é um _scope restrito_, publicar em produção exige uma
   **verificação do Google** (revisão de segurança, pode levar dias/semanas).
   **Não é necessário para uso pessoal/MVP em modo Testing.**

## 4. Criar o OAuth 2.0 Client ID

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. **Application type:** `Web application`.
3. **Authorized redirect URIs:** adicione exatamente o valor de
   `YOUTUBE_REDIRECT_URI` do `.env`:
   - Dev: `http://localhost:3000/api/youtube/callback`
   - Produção: `https://<seu-dominio-no-render>/api/youtube/callback`
4. Crie e copie **Client ID** e **Client Secret** →
   `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` no `.env`.

## 5. Quotas

- A YouTube Data API v3 tem uma cota padrão de **10.000 unidades/dia** por
  projeto. Operações têm custos diferentes (ex.: `search.list` custa 100
  unidades — dá só ~100 buscas/dia na cota padrão —, `videos.list` custa 1
  unidade, `videos.insert`/upload custa 1.600).
- **Priorizar `videos.list` sobre `search.list`**: para descobrir vídeos em
  alta, `videos.list` com `chart=mostPopular` e `regionCode` custa 1 unidade
  (vs. 100 de um `search.list` equivalente) e cobre boa parte do caso de uso
  de "tendências". `search.list` fica reservado para o que `videos.list` não
  cobre (ex.: busca por palavra-chave livre).
- Resultados devem ser **cacheados no banco** (ver `fetchedAt` na seção 6) em
  vez de buscados de novo a cada requisição do frontend — evita gastar cota
  repetindo a mesma consulta.
- O `QuotaManager` do backend (Fase 19 do roadmap — ver docs/ARCHITECTURE.md)
  registra o custo estimado de cada chamada e bloqueia novas consultas ao
  atingir o limite configurado — isso é para o app se proteger de ficar sem
  cota, **não** um mecanismo para contornar a cota do Google.
- Se precisar de mais cota em produção, solicite aumento pelo próprio Console
  (**APIs & Services → YouTube Data API v3 → Quotas**).

## 6. Retenção e atualização de dados

As políticas da YouTube Data API não permitem manter dados obtidos pela API
armazenados indefinidamente sem atualização. Isso já é um requisito de
**schema** a partir da Fase 2 (não algo para resolver só quando a automação
de manutenção existir):

- Toda tabela que guarda dados vindos da API (`videos`, `video_metrics`,
  `trends`, ...) precisa de um campo `fetchedAt` marcando quando aquele dado
  foi obtido/atualizado pela última vez.
- Rotina de atualização/expurgo: registros com `fetchedAt` mais velho que
  **~30 dias** devem ser re-buscados (se ainda relevantes para o usuário) ou
  removidos. O job de manutenção em si (BullMQ) só entra na Fase 21+, mas o
  campo `fetchedAt` precisa existir desde a Fase 2 para não exigir uma
  migration retroativa depois.

## 7. Upload — declaração de conteúdo sintético (Fase 16)

Ao publicar um vídeo pela API (`videos.insert`), sempre que o conteúdo
enviado tiver sido gerado ou alterado de forma realista por IA, a chamada
precisa incluir `status.containsSyntheticMedia: true` — é a declaração oficial
do YouTube para conteúdo sintético/alterado, exigida pelas políticas da
plataforma independente do status de direitos (ORIGINAL/AUTHORIZED/etc.).

## 8. O que este projeto nunca faz

- Não baixa vídeos do YouTube (nem de terceiros sem autorização). A
  importação por link (ver docs/ARCHITECTURE.md) só aceita link direto de
  arquivo, recusa `youtube.com`/`youtu.be`/`googlevideo.com` e exige a mesma
  declaração de direitos do upload.
- Não contorna DRM, autenticação ou restrições de conteúdo.
- Não tenta burlar a cota (ex.: rotacionar múltiplas API keys para escapar do
  limite).
- Só publica vídeos que o próprio usuário enviou com um status de direitos
  válido (ORIGINAL/AUTHORIZED/LICENSED/PUBLIC_DOMAIN).

## Checklist rápido

```
[ ] Projeto criado no Google Cloud Console
[ ] YouTube Data API v3 habilitada
[ ] API key criada e restrita → YOUTUBE_API_KEY
[ ] Tela de consentimento OAuth configurada (scopes readonly + upload)
[ ] Seu e-mail/canal adicionado como test user
[ ] OAuth Client ID (Web application) criado
[ ] Redirect URI cadastrado == YOUTUBE_REDIRECT_URI do .env
[ ] YOUTUBE_CLIENT_ID e YOUTUBE_CLIENT_SECRET no .env
```

Esta etapa é necessária a partir da **Fase 4 (YouTube OAuth)** — não bloqueia
a Fase 1 (Arquitetura).
