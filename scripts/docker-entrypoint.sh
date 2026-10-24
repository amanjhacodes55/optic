#!/bin/sh
set -e
if [ "$OPTIC_SEED_DEMO" = "1" ]; then
  # Idempotent: the seeder skips the demo site if it already has data.
  OPTIC_URL="${OPTIC_PUBLIC_URL:-http://localhost:$PORT}" node seed.mjs || echo "demo seed failed; continuing"
fi
exec node server.js
