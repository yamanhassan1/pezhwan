#!/usr/bin/env bash
# PEZHWAN — identity-server health probe for cron/CI/monitoring hooks.
#
# Thin shell wrapper around the verified `scripts/health-check.mjs`: probes
# /health/live, /health/ready (503 => not ready) and /.well-known/jwks.json,
# retrying until healthy or the wait budget is exhausted. Exits 0 when healthy,
# 1 otherwise.
#
# Usage:
#   infrastructure/scripts/health-check.sh
#     --url <base>       base URL (default: PEZHWAN_URL or http://localhost:4011)
#     --wait <seconds>   retry for up to N seconds until healthy (default 0)
#     --interval <secs>  retry interval in seconds (default 2)
#     --verbose          print each probe's HTTP status

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

usage() {
  echo "Usage: $(basename "$0") [--url <base>] [--wait <secs>] [--interval <secs>] [--verbose]"
}

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url|--wait|--interval) ARGS+=("$1" "$2"); shift 2 ;;
    --verbose) ARGS+=(--verbose); shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[health-check] ERROR: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

cd "${ROOT_DIR}"
node scripts/health-check.mjs "${ARGS[@]}"