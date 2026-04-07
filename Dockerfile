# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — deps
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json bun.lockb* ./

RUN if [ -f bun.lockb ]; then \
      bun install --frozen-lockfile; \
    else \
      bun install; \
    fi

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — builder
# Generate Prisma client for Alpine (linux-musl-openssl-3.0.x).
# prisma generate only reads schema.prisma — does NOT connect to DB.
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY prisma      ./prisma
COPY src         ./src
COPY package.json ./

RUN bunx prisma generate

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runner
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 appgroup && \
    adduser  --system --uid 1001 --ingroup appgroup appuser

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/src         ./src
COPY --from=builder --chown=appuser:appgroup /app/prisma      ./prisma
COPY --chown=appuser:appgroup package.json  ./
COPY --chown=appuser:appgroup entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8000/health || exit 1

ENTRYPOINT ["sh", "./entrypoint.sh"]
