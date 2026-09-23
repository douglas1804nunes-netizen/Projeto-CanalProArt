import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

const backendDir = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(backendDir, "..", "..");

loadDotenv({ path: path.join(rootDir, ".env") });

// dotenv/o ambiente pode entregar "" para variáveis opcionais ainda não
// preenchidas (ex.: .env copiado direto de .env.example) — trata como
// "não definida" em vez de deixar cair na validação de formato.
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const HEX_32_BYTES = /^[0-9a-fA-F]{64}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

// AES-256-GCM exige uma chave de exatamente 32 bytes, em hex (64 chars) ou base64.
function isValidAes256GcmKey(value: string): boolean {
  if (HEX_32_BYTES.test(value)) {
    return true;
  }
  if (BASE64_PATTERN.test(value) && value.length % 4 === 0) {
    return Buffer.from(value, "base64").length === 32;
  }
  return false;
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
    FRONTEND_URL: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .url("FRONTEND_URL deve ser uma URL válida (ex.: http://localhost:5173)")
        .optional(),
    ),
    BACKEND_URL: z.preprocess(
      emptyToUndefined,
      z.string().url("BACKEND_URL deve ser uma URL válida (ex.: http://localhost:3000)").optional(),
    ),
    JWT_SECRET: z.string().min(32, "JWT_SECRET precisa ter pelo menos 32 caracteres"),
    // Criptografa os tokens OAuth do YouTube (Fase 4) — precisa ser distinta
    // do JWT_SECRET (checado no superRefine abaixo).
    TOKEN_ENCRYPTION_KEY: z.string().refine(isValidAes256GcmKey, {
      message:
        "TOKEN_ENCRYPTION_KEY deve ser uma chave de 32 bytes em hex (64 caracteres) ou base64 (AES-256-GCM)",
    }),
    YOUTUBE_CLIENT_ID: z.string().min(1, "YOUTUBE_CLIENT_ID é obrigatório (ver docs/YOUTUBE.md)"),
    YOUTUBE_CLIENT_SECRET: z
      .string()
      .min(1, "YOUTUBE_CLIENT_SECRET é obrigatório (ver docs/YOUTUBE.md)"),
    YOUTUBE_REDIRECT_URI: z
      .string()
      .url(
        "YOUTUBE_REDIRECT_URI deve ser uma URL válida (ex.: http://localhost:3000/api/youtube/callback)",
      ),
    YOUTUBE_API_KEY: z.string().min(1, "YOUTUBE_API_KEY é obrigatório (ver docs/YOUTUBE.md)"),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.FRONTEND_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FRONTEND_URL"],
        message: "FRONTEND_URL é obrigatório em produção (não há valor padrão de localhost)",
      });
    }
    if (value.TOKEN_ENCRYPTION_KEY === value.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TOKEN_ENCRYPTION_KEY"],
        message: "TOKEN_ENCRYPTION_KEY precisa ser diferente de JWT_SECRET",
      });
    }
  })
  .transform((value) => ({
    ...value,
    FRONTEND_URL: value.FRONTEND_URL ?? "http://localhost:5173",
    BACKEND_URL: value.BACKEND_URL ?? "http://localhost:3000",
  }));

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
  throw new Error(
    "Configuração de ambiente inválida. Verifique o arquivo .env (veja .env.example).",
  );
}

export const env = parsed.data;
