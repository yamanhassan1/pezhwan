#!/usr/bin/env bash
# PEZHWAN — restore wrapper for DR responses.
#
# Thin shell wrapper around the verified `scripts/restore-drill.mjs`: restores a
# backup archive into an isolated environment and verifies data/index integrity
# plus a post-restore login-refresh round-trip (RTO measurement) when requested.
# Defaults match the DR runbook (docs/operations/runbooks/database-failover.md).
#
# Usage:
#   infrastructure/scripts/restore.sh
#     --archive <archive.pzbu>   backup archive (default: backups/latest.pzbu)
#     --target <database>        database to restore into (default: pezhwan)
#     --strategy <logical|binary> restore method (default: logical)
#     --verify-auth              run a login-refresh round-trip against restored data
#
# Environment:
#   PEZHWAN_BACKUP_KEY           base64 32-byte AES-256 key (must match backup key)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ARCHIVE="backups/latest.pzbu"
TARGET="pezhwan"
ARGS=()

usage() {
  echo "Usage: $(basename "$0") [--archive <archive>] [--target <db>] [--strategy <logical|binary>] [--verify-auth]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive) ARCHIVE="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --strategy) ARGS+=(--strategy "$2"); shift 2 ;;
    --verify-auth) ARGS+=(--verify-auth); shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[restore] ERROR: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

echo "[restore] Archive: ${ARCHIVE}"
echo "[restore] Target db: ${TARGET}"

cd "${ROOT_DIR}"
node scripts/restore-drill.mjs --in "${ARCHIVE}" --db "${TARGET}" "${ARGS[@]}"