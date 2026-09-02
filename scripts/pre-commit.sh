#!/usr/bin/env sh
# PEZHWAN — pre-commit hook: secret scan
# Blocks commits that stage obvious secrets.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" || exit 1
node "$REPO_ROOT/scripts/secret-scan.mjs"
status=$?
if [ $status -ne 0 ]; then
  echo ""
  echo "X PEZHWAN: Commit blocked by secret scan."
  echo "   Remove the detected secret, ROTATE it immediately if it leaked,"
  echo "   then re-stage and commit."
  exit 1
fi
exit 0
