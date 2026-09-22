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
# Remove devDependencies (typescript, vite, eslint, ...) mantendo o Prisma
# Client já gerado — só o necessário para rodar (não para buildar) segue
# para o runtime.
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/services/dist ./services/dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/frontend/dist ./frontend/dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "backend/dist/server.js"]
