# syntax=docker/dockerfile:1

# ============================================================
#  Build stage: install all dependencies and compile TypeScript
# ============================================================
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Prisma's query engine needs OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# Dependencies first, so Docker caches this layer until package files change.
# The schema is needed here because `npm ci` runs `prisma generate` (postinstall).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# ============================================================
#  Runtime stage: only what is needed to run
# ============================================================
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# node_modules is kept complete (not pruned) because the startup seed runs
# through ts-node. tsconfig.json is needed by ts-node for the same reason.
COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Never run as root inside the container.
USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# 1. apply pending migrations  2. seed roles/plans/admin (idempotent)  3. start
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
