// Funções puras (sem rede) que montam { system, prompt } pra cada
// capacidade do AIProvider — testáveis isoladamente e fáceis de revisar sem
// precisar ler o parsing/chamada HTTP junto.

const IDEAS_JSON_INSTRUCTION =
  'Responda APENAS com um array JSON de strings, sem markdown, sem explicação. Exemplo: ["ideia 1", "ideia 2"]';

export function buildIdeasPrompt(topic: string, count: number) {
  return {
    system:
      "Você é um estrategista de conteúdo para YouTube. Gera ideias de vídeo originais " +
      "(não cópias de vídeos existentes) a partir de um tópico em alta, pensando em ângulos " +
      "que ainda não foram muito explorados. " +
      IDEAS_JSON_INSTRUCTION,
    prompt: `Tópico em alta: "${topic}". Gere ${count} ideias de vídeo originais sobre esse tópico.`,
  };
}

export function buildScriptPrompt(idea: string, durationSeconds?: number) {
  const durationHint = durationSeconds
    ? ` com duração aproximada de ${Math.round(durationSeconds / 60)} minutos`
    : "";

  return {
    system:
      "Você é um roteirista de vídeos para YouTube. Escreve roteiros originais, claros e " +
      "prontos para gravação (com indicações de fala, não apenas tópicos soltos). Nunca " +
      "reproduz roteiros ou falas de vídeos de terceiros — o roteiro precisa ser conteúdo " +
      "novo, mesmo quando inspirado por uma tendência.",
    prompt: `Escreva um roteiro original${durationHint} para um vídeo do YouTube com a seguinte ideia: "${idea}".`,
  };
}

export function buildTitlesPrompt(topic: string, script: string | undefined, count: number) {
  const scriptContext = script
    ? ` Aqui está o roteiro do vídeo, para os títulos refletirem o conteúdo real:\n\n${script}`
    : "";

  return {
    system:
      "Você é um especialista em SEO e CTR para títulos de YouTube. Gera títulos originais, " +
      "chamativos mas não clickbait enganoso, e que reflitam o conteúdo real do vídeo. " +
      IDEAS_JSON_INSTRUCTION,
    prompt: `Tópico: "${topic}". Gere ${count} opções de título para esse vídeo.${scriptContext}`,
  };
}

export function buildDescriptionPrompt(title: string, script: string) {
  return {
    system:
      "Você é um especialista em SEO para descrições de vídeos do YouTube. Escreve descrições " +
      "originais, informativas, com palavras-chave relevantes, sem prometer nada que o vídeo " +
      "não entrega.",
    prompt: `Título do vídeo: "${title}".\n\nRoteiro do vídeo:\n\n${script}\n\nEscreva a descrição para publicar esse vídeo no YouTube.`,
  };
}
