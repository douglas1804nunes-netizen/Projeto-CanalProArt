// Workspace compartilhado entre backend/ e workers/ (a partir da Fase 21+).

export const SERVICES_PACKAGE_VERSION = "0.1.0";

export * from "./youtube/client.js";
export * from "./youtube/mapper.js";
export * from "./youtube/persist.js";
export * from "./youtube/service.js";
export * from "./youtube/metrics.js";
export * from "./youtube/trendScore.js";
export * from "./ai/index.js";
