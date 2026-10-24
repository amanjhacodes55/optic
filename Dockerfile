# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/copy-assets.mjs scripts/copy-assets.mjs
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN node scripts/copy-assets.mjs && npx next build \
 # Bundle the demo seeder so the runtime image can load demo data without dev dependencies.
 && npx esbuild scripts/seed.ts --bundle --platform=node --format=esm --external:@libsql/client --external:libsql --outfile=dist/seed.mjs \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 OPTIC_DB=/data/optic.db
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist/seed.mjs ./seed.mjs
COPY --chown=node:node scripts/docker-entrypoint.sh ./entrypoint.sh
USER node
VOLUME /data
EXPOSE 3000
CMD ["sh", "./entrypoint.sh"]
