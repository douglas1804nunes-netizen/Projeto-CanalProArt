import { prisma } from "../prisma.js";
import { decryptToken, encryptToken } from "./crypto.js";
import { refreshAccessToken } from "./oauth.js";

// Renova um pouco antes de expirar de verdade, pra não arriscar usar um
// token que expira no meio de uma chamada à API do YouTube.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

// Devolve um access_token válido para a conta, renovando via refresh_token
// (e persistindo o resultado) se estiver perto de expirar. Usado pelas
// chamadas à YouTube Data API a partir da Fase 5.
export async function getValidAccessToken(youtubeAccountId: string): Promise<string> {
  const account = await prisma.youtubeAccount.findUniqueOrThrow({
    where: { id: youtubeAccountId },
  });

  if (account.expiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return decryptToken(account.accessToken);
  }

  const refreshToken = decryptToken(account.refreshToken);
  const tokens = await refreshAccessToken(refreshToken);

  const updated = await prisma.youtubeAccount.update({
    where: { id: account.id },
    data: {
      accessToken: encryptToken(tokens.access_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      // O Google nem sempre devolve um novo refresh_token no refresh —
      // só sobrescreve se vier um novo.
      ...(tokens.refresh_token ? { refreshToken: encryptToken(tokens.refresh_token) } : {}),
    },
  });

  return decryptToken(updated.accessToken);
}
