// Vídeos podem ser grandes — 500MB é um teto razoável pra upload local de
// dev sem travar o processo com arquivos absurdos (ver docs/ARCHITECTURE.md,
// Fase 13). Vale tanto pro upload multipart quanto pra importação por URL.
export const MAX_MEDIA_UPLOAD_BYTES = 500 * 1024 * 1024;
