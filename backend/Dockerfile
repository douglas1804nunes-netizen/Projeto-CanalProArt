# Imagem de produção do backend (usada a partir da Fase 20 / deploy no Render).
# Build multi-stage: instala deps do monorepo, gera o Prisma Client, compila TS,
# builda o frontend e roda a partir de um runtime enxuto. O Fastify serve o
# build do frontend (mesma origem — ver docs/ARCHITECTURE.md, "Deploy").

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY services/package.json services/package.json
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run prisma:generate
RUN npm run build --workspace=services
RUN npm run build --workspace=backend
RUN npm run build --workspace=frontend

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/services/dist ./services/dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/frontend/dist ./frontend/dist

EXPOSE 3000
CMD ["node", "backend/dist/server.js"]
