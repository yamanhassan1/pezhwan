#!/usr/bin/env bash
# PEZHWAN — signing-key rotation wrapper for scheduled rotation.
#
# Thin shell wrapper around the verified `scripts/rotate-keys.mjs`: retires the
# current ACTIVE signing key to VERIFY-ONLY, generates a fresh RSA-2048 ACTIVE
# key, persists both via FileKeyStoreAdapter, and (with --url) verifies the new
# kid is published at /.well-known/jwks.json.
#
# Usage:
#   infrastructure/scripts/rotate-keys.sh
#     --dir <path>   signing-key directory (default: PEZHWAN_SIGNING_KEYS_PATH
#                    or apps/identity-server/keys)
#     --url <base>   verify the new kid appears in /.well-known/jwks.json
#     --dry-run      print the plan and exit without writing anything
#
# Environment:
#   PEZHWAN_SIGNING_KEY_DIR / PEZHWAN_SIGNING_KEYS_PATH   default key directory

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

usage() {
  echo "Usage: $(basename "$0") [--dir <path>] [--url <base>] [--dry-run]"
}

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir|--url) ARGS+=("$1" "$2"); shift 2 ;;
    --dry-run) ARGS+=(--dry-run); shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[rotate-keys] ERROR: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

cd "${ROOT_DIR}"
node scripts/rotate-keys.mjs "${ARGS[@]}"