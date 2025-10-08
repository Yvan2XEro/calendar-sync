#!/bin/sh
set -euo pipefail

if [ "${SKIP_DB_MIGRATE:-}" = "" ]; then
  echo "Running database migrations..."
  bun run db:migrate
else
  echo "Skipping database migrations because SKIP_DB_MIGRATE is set."
fi

echo "Starting server..."
exec "$@"
