// Workspace compartilhado entre backend/ e workers/. A partir da Fase 11
// este pacote também passa a exportar o AIProvider — ainda não existe.

export const SERVICES_PACKAGE_VERSION = "0.1.0";

export * from "./youtube/client.js";
export * from "./youtube/mapper.js";
export * from "./youtube/persist.js";
export * from "./youtube/service.js";
export * from "./youtube/metrics.js";
export * from "./youtube/trendScore.js";
