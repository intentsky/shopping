# Intentsky Shopping — Medusa v2 engine, built for Railway (any Docker host works).
#
# Build:  `medusa build` writes a standalone server to .medusa/server (its own
#         package.json, no node_modules); its dependencies are installed there.
# Run:    start.sh → migrations, admin user, bootstrap, `medusa start`.
#
# Railway reads this file automatically ("Using detected Dockerfile!") and
# injects the service variables at runtime. Nothing is read at build time on
# purpose: the admin bundle uses same-origin URLs (medusa-config.ts
# admin.backendUrl ""), so one image serves any domain.

FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json ./
COPY tsconfig.json ./
COPY medusa-config.ts ./
COPY src ./src

RUN npm install --legacy-peer-deps --no-audit --no-fund

RUN npx medusa build

RUN cd /app/.medusa/server \
    && npm install --legacy-peer-deps --omit=dev --no-audit --no-fund \
    && npm cache clean --force


FROM node:22-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache tini libc6-compat curl

COPY --from=builder /app/.medusa/server /app/.medusa/server
COPY start.sh /app/start.sh

# `static` is where the local file provider writes uploads (medusa-config.ts).
# Mount a Railway Volume at /app/.medusa/server/static to keep them across
# deploys, or set the S3_* variables and skip the volume.
RUN chmod +x /app/start.sh \
    && mkdir -p /app/.medusa/server/static

ENV NODE_ENV=production
ENV PORT=9000

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-9000}/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
