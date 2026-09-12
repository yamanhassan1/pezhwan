#!/usr/bin/env bash
# PEZHWAN — backup wrapper for cron/CI scheduling.
#
# Thin shell wrapper around the verified `scripts/backup-drill.mjs`: produces a
# timestamped, AES-256-GCM encrypted, compressed archive of the identity store
# together with an evidence manifest (checksum, RPO). See the script header for
# the safety model.
#
# Usage:
#   infrastructure/scripts/backup.sh
#     --source <mongodb://uri>   source DB (default: PEZHWAN_MONGODB_URI)
#     --db <database>            database name
#     --out <archive.pzbu>       archive path (default: backups/pezhwan-<ts>.pzbu)
#     --strategy <logical|binary> dump method (default: logical)
#
# Environment:
#   PEZHWAN_BACKUP_KEY           base64 32-byte AES-256 key (required)
#   PEZHWAN_MONGODB_URI          default Mongo connection string

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

usage() {
  echo "Usage: $(basename "$0") [--source <uri>] [--db <name>] [--out <archive>] [--strategy <logical|binary>]"
}

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source|--db|--out|--strategy) ARGS+=("$1" "$2"); shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[backup] ERROR: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

cd "${ROOT_DIR}"
node scripts/backup-drill.mjs "${ARGS[@]}"