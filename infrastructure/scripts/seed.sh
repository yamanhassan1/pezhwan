#!/usr/bin/env bash
# PEZHWAN — database seed wrapper for setup/CI.
#
# Thin shell wrapper around the verified `scripts/seed-database.mjs` (idempotent
# bootstrap provisioning via the identity-server ensureBootstrap path).
#
# Usage:
#   infrastructure/scripts/seed.sh
#
# Environment:
#   PEZHWAN_MONGODB_URI      Mongo connection string
#   PEZHWAN_TENANT_ID        bootstrap tenant id (default: tenant_local)
#   PEZHWAN_APPLICATION_ID   bootstrap application id (default: app_pezhwan)
#   PEZHWAN_ADMIN_EMAIL      create the first admin when set
#   PEZHWAN_ADMIN_PASSWORD   admin password (required with ADMIN_EMAIL)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ $# -gt 0 && ("$1" = "-h" || "$1" = "--help") ]]; then
  echo "Usage: $(basename "$0")"
  echo "Reads PEZHWAN_* environment variables (see script header)."
  exit 0
fi

cd "${ROOT_DIR}"
node scripts/seed-database.mjs