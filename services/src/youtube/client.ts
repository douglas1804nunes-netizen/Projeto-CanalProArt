const API_BASE = "https://www.googleapis.com/youtube/v3";

export type YoutubeApiVideoItem = {
  id: string;
  snippet: {
    channelId: string;
    channelTitle: string;
    title: string;
    description: string;
    publishedAt: string;
    thumbnails: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
    tags?: string[];
    categoryId?: string;
  };
  contentDetails: { duration: string };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
};

async function callVideosEndpoint(url: URL): Promise<YoutubeApiVideoItem[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao chamar a YouTube Data API (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { items: YoutubeApiVideoItem[] };
  return body.items;
}

// videos.list com chart=mostPopular custa 1 unidade de cota — priorizar sobre
// search.list (100 unidades) para descoberta de tendências. Ver docs/YOUTUBE.md.
export async function fetchPopularVideos(
  apiKey: string,
  params: { regionCode: string; maxResults?: number },
): Promise<YoutubeApiVideoItem[]> {
  const url = new URL(`${API_BASE}/videos`);
  url.searchParams.set("part", "snippet,contentDetails,statistics");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", params.regionCode);
  url.searchParams.set("maxResults", String(params.maxResults ?? 25));
  url.searchParams.set("key", apiKey);

  return callVideosEndpoint(url);
}

// videos.list por id também custa 1 unidade (independente de quantos ids,
// até o limite de 50 por chamada) — usar para atualizar métricas de vídeos
// já conhecidos em vez de rebuscar.
export async function fetchVideosByIds(
  apiKey: string,
  videoIds: string[],
): Promise<YoutubeApiVideoItem[]> {
  if (videoIds.length === 0) return [];

  const url = new URL(`${API_BASE}/videos`);
  url.searchParams.set("part", "snippet,contentDetails,statistics");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("key", apiKey);

  return callVideosEndpoint(url);
}

export type YoutubeSearchResult = { videoId: string };

// search.list custa 100 unidades — só usar para busca por palavra-chave
// livre, que videos.list não cobre. Ver docs/YOUTUBE.md.
export async function searchVideos(
  apiKey: string,
  params: { query: string; regionCode?: string; maxResults?: number },
): Promise<YoutubeSearchResult[]> {
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("part", "id");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", params.query);
  if (params.regionCode) {
    url.searchParams.set("regionCode", params.regionCode);
  }
  url.searchParams.set("maxResults", String(params.maxResults ?? 25));
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao buscar vídeos do YouTube (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { items: Array<{ id: { videoId: string } }> };
  return body.items.map((item) => ({ videoId: item.id.videoId }));
}
