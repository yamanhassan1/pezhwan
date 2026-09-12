#!/usr/bin/env bash
# PEZHWAN — MongoDB restore script (mongorestore wrapper).
#
# Restores from a mongodump directory. If no argument is given, the most
# recent backup in BACKUP_DIR is used.
#
# Usage:
#   docker exec pezhwan-mongo1 bash /scripts/restore.sh [dump-dir]
#   docker exec pezhwan-mongo1 bash /scripts/restore.sh /backups/2025-01-15_030000
#
# Environment variables:
#   MONGODB_URI  — connection string (default: mongodb://localhost:27017)
#   BACKUP_DIR   — root directory for dumps (default: /backups)
#   DROP         — set to "true" to drop collections before restoring (default: false)

set -euo pipefail

MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DROP="${DROP:-false}"

# Determine the dump directory to restore.
if [ -n "${1:-}" ]; then
  DUMP_DIR="$1"
else
  # Pick the most recent directory (lexicographic sort on ISO date prefix).
  DUMP_DIR="$(ls -1d "${BACKUP_DIR}"/*/ 2>/dev/null | sort -r | head -1)"
  if [ -z "${DUMP_DIR}" ]; then
    echo "[restore] ERROR: No backups found in ${BACKUP_DIR}" >&2
    exit 1
  fi
fi

echo "[restore] Restoring from ${DUMP_DIR}"
echo "[restore] URI: ${MONGODB_URI}"
echo "[restore] Drop existing collections: ${DROP}"

RESTORE_ARGS=(
  --uri="${MONGODB_URI}"
  --gzip
  --dir="${DUMP_DIR}"
  --numInsertionWorkersPerCollection=4
)

if [ "${DROP}" = "true" ]; then
  RESTORE_ARGS+=(--drop)
fi

mongorestore "${RESTORE_ARGS[@]}"

if [ $? -ne 0 ]; then
  echo "[restore] ERROR: mongorestore failed" >&2
  exit 1
fi

echo "[restore] Restore completed successfully"
