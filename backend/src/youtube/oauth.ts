import { env } from "../env.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

// readonly: ler dados do canal. upload: publicar vídeos (Fase 16). Ver docs/YOUTUBE.md.
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
];

export function buildAuthorizationUrl(state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", env.YOUTUBE_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.YOUTUBE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  // access_type=offline + prompt=consent: sem isso o Google só manda
  // refresh_token na primeira autorização (não em re-consentimentos).
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      code,
      redirect_uri: env.YOUTUBE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao trocar o código por tokens (HTTP ${response.status})`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao renovar o access_token (HTTP ${response.status})`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

export type YoutubeChannel = { channelId: string; channelTitle: string };

export async function fetchOwnChannel(accessToken: string): Promise<YoutubeChannel> {
  const url = new URL(CHANNELS_URL);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar o canal do YouTube (HTTP ${response.status})`);
  }

  const body = (await response.json()) as {
    items?: Array<{ id: string; snippet: { title: string } }>;
  };
  const channel = body.items?.[0];
  if (!channel) {
    throw new Error("Nenhum canal do YouTube encontrado para esta conta Google");
  }

  return { channelId: channel.id, channelTitle: channel.snippet.title };
}
