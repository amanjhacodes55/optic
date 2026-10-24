#!/usr/bin/env bash
# Fresh demo data for a take: a throwaway database seeded with four months of Northwind Coffee
# traffic. Run with the server stopped, then start it (see demo.mjs) and run the bots for replays.
set -euo pipefail
cd "$(dirname "$0")/../.."
export OPTIC_DB=${OPTIC_DB:-$PWD/docs/video/build/optic.db}
mkdir -p "$(dirname "$OPTIC_DB")"
rm -f "$OPTIC_DB" "$OPTIC_DB-wal" "$OPTIC_DB-shm"
OPTIC_URL=${BASE:-http://localhost:3012} npm run --silent seed
echo "reset $OPTIC_DB: Northwind Coffee demo ready"
