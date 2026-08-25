#!/usr/bin/env bash
# check-cache-invalidation.sh — D-2 regression guard entrypoint (task T9).
#
# Thin wrapper around check-cache-invalidation.mjs so the gate has a
# single named command (per T9 AC3) usable from both
# scripts/pre_push_gates.sh and .github/workflows/ci.yml without either
# caller needing to know it's a Node script.
#
# See check-cache-invalidation.mjs for the full check design and
# decision-register.md D-2 for the ruling this enforces.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/check-cache-invalidation.mjs" "$@"
