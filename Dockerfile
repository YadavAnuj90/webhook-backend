# syntax=docker/dockerfile:1.6
# ───────────────────────────── builder stage ─────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install build deps (needed for bcryptjs fallback / optional native modules).
RUN apk add --no-cache python3 make g++ \
  && corepack enable

# Install deps first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy source and build.
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies for the runtime image.
RUN npm prune --omit=dev

# ───────────────────────────── runtime stage ─────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Tini handles PID 1 + signal forwarding for clean shutdowns.
RUN apk add --no-cache tini curl \
  && addgroup -S app \
  && adduser -S app -G app

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS=--enable-source-maps

# Copy just the compiled output + prod deps + package manifest.
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json

# Writable locations for logs & uploads.
RUN mkdir -p /app/logs /app/uploads && chown -R app:app /app/logs /app/uploads

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/health/readiness || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
