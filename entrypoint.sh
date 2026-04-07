#!/bin/sh
# entrypoint.sh
# Boot sequence: schema sync → start server

set -e

echo "[entrypoint] Starting order-service..."
echo "[entrypoint] Syncing database schema..."

MAX_RETRIES=5
RETRY_DELAY=3
attempt=1

until bunx prisma db push --accept-data-loss; do
  if [ $attempt -ge $MAX_RETRIES ]; then
    echo "[entrypoint] ERROR: Schema push failed after $MAX_RETRIES attempts."
    exit 1
  fi
  echo "[entrypoint] Attempt $attempt failed. Retrying in ${RETRY_DELAY}s..."
  attempt=$((attempt + 1))
  sleep $RETRY_DELAY
done

echo "[entrypoint] Schema synced. Starting server..."
exec bun src/server.ts
