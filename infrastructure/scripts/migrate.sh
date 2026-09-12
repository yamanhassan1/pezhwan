#!/usr/bin/env bash
# PEZHWAN — database migration wrapper for deployments.
#
# Compiles the migrations/ directory to dist/migrations and applies pending
# schema migrations in numeric order via migration-runner. Mirrors the
# documented commands (migrations/README.md):
#
#   node dist/migrations/migration-runner.js up        # apply pending
#   node dist/migrations/migration-runner.js status    # show applied/pending
#
# Usage:
#   infrastructure/scripts/migrate.sh [up|status]
#
# Environment:
#   PEZHWAN_MONGODB_URI      Mongo connection string (default: mongodb://127.0.0.1:27017/pezhwan)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

COMMAND="${1:-up}"
case "${COMMAND}" in
  up|status) ;;
  -h|--help) echo "Usage: $(basename "$0") [up|status]"; exit 0 ;;
  *) echo "[migrate] ERROR: unknown command: ${COMMAND} (use up or status)" >&2; exit 1 ;;
esac

cd "${ROOT_DIR}"

echo "[migrate] Compiling migrations to dist/migrations ..."
npx tsc \
  --target ES2022 \
  --module Node16 \
  --moduleResolution Node16 \
  --esModuleInterop \
  --skipLibCheck \
  --allowImportingTsExtensions \
  --rewriteRelativeImportExtensions \
  --outDir dist \
  --rootDir . \
  migrations/*.ts

echo "[migrate] Running migration-runner ${COMMAND} ..."
node dist/migrations/migration-runner.js "${COMMAND}"