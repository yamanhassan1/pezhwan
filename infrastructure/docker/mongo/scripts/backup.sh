#!/usr/bin/env bash
# PEZHWAN — MongoDB backup script (mongodump wrapper).
#
# Creates a timestamped, gzip-compressed dump and prunes backups older than
# N days (default 7). Designed to run as a cron job or one-off via:
#
#   docker exec pezhwan-mongo1 bash /scripts/backup.sh
#
# Environment variables:
#   MONGODB_URI  — connection string (default: mongodb://localhost:27017)
#   BACKUP_DIR   — root directory for dumps (default: /backups)
#   RETAIN_DAYS  — number of days to keep old dumps (default: 7)

set -euo pipefail

MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
TIMESTAMP="$(date +%F_%H%M%S)"
DUMP_DIR="${BACKUP_DIR}/${TIMESTAMP}"

echo "[backup] Starting mongodump to ${DUMP_DIR}"
echo "[backup] URI: ${MONGODB_URI}"

mkdir -p "${BACKUP_DIR}"

mongodump \
  --uri="${MONGODB_URI}" \
  --gzip \
  --out="${DUMP_DIR}" \
  --numInsertionWorkersPerCollection=4

if [ $? -ne 0 ]; then
  echo "[backup] ERROR: mongodump failed" >&2
  exit 1
fi

echo "[backup] Dump completed: ${DUMP_DIR}"

# Prune backups older than RETAIN_DAYS.
echo "[backup] Pruning dumps older than ${RETAIN_DAYS} days..."
find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -mtime "+${RETAIN_DAYS}" -exec rm -rf {} + 2>/dev/null || true

REMAINING=$(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d | wc -l)
echo "[backup] Retained ${REMAINING} backup(s)"
echo "[backup] Done"
