// Workspace compartilhado entre backend/ e workers/. A partir da Fase 8 este
// pacote também passa a exportar TrendScoreService, e a partir da Fase 11 o
// AIProvider — nada disso existe ainda.

export const SERVICES_PACKAGE_VERSION = "0.1.0";

export * from "./youtube/client.js";
export * from "./youtube/mapper.js";
export * from "./youtube/persist.js";
export * from "./youtube/service.js";
