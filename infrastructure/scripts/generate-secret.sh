#!/usr/bin/env bash
# PEZHWAN — generate a secure random secret (for .env provisioning).
#
# Thin shell wrapper around `scripts/generate-secret.mjs`. The output is a
# SECRET — never commit it, post it, or share it; put it in a gitignored .env
# or a secret manager.
#
# Usage:
#   infrastructure/scripts/generate-secret.sh [bytes]
#
# Defaults to 32 bytes (256 bits). Use 64 bytes for extra margin.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ $# -gt 1 || ("$1" = "-h" || "$1" = "--help") ]]; then
  echo "Usage: $(basename "$0") [bytes]" >&2
  echo "Generates a random base64url secret. Default 32 bytes, min 16." >&2
  exit 1
fi

BYTES="${1:-32}"

cd "${ROOT_DIR}"
node scripts/generate-secret.mjs "${BYTES}"