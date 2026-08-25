#!/usr/bin/env bash
# pre_push_gates.sh — local CI parity gate for mcp-find
#
# Runs the same checks .github/workflows/ci.yml runs, in the same order,
# plus lint (real script, not run by CI today, included here for hygiene)
# and a lockfile-sync check. Runs every gate even if an earlier one fails
# (so a single run reports the full pass/fail picture, not just the first
# blocker), prints a per-gate summary, and always prints the literal exit
# code on the final line so it can be quoted in a sprint report.
#
# Scope note: this repo has no root-level "test" turbo task and no existing
# pre-push hook — this script exists to give a repair sprint a single named
# gate command to point acceptance criteria at. It is not (yet) wired as a
# git hook; install with:
#   ln -sf ../../scripts/pre_push_gates.sh .git/hooks/pre-push
#
# Ported from the hearth backend's scripts/pre_push_gates.sh pattern
# (2026-08-25) — echo each gate, run it, capture exit codes, exit non-zero
# on any failure, print a clear summary. mcp-find has no ADR-fitness-gate /
# RLS / model-constant checks (that's Hearth-specific product surface), so
# this script only wraps what actually exists in THIS repo's package.json /
# turbo.json — nothing invented.

set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

FAILED_GATES=()

fail_gate() {
    echo -e "${RED}[GATE FAILED]${NC} $1"
    FAILED_GATES+=("$1")
}

ok() {
    echo -e "${GREEN}[OK]${NC} $1"
}

echo "==> mcp-find pre-push gates (mirrors .github/workflows/ci.yml, plus lint)"
echo "    repo root: $REPO_ROOT"
echo ""

# ─── Gate 1: D-2 cache invalidation regression guard (task T9) ─────────────
# Enforces decision-register.md D-2: cache invalidation must be per-slug,
# never a blanket shared tag; and no NEW route may acquire stale
# force-dynamic beyond the known Wave-2 (task T7) debt baseline. Pure
# textual/git checks, no deps needed — runs first because it's the
# cheapest gate and should fail fast. See scripts/check-cache-invalidation.mjs
# for the full check design.
echo "--> Gate 1: D-2 cache invalidation regression guard ..."
if bash scripts/check-cache-invalidation.sh; then
    ok "D-2 cache invalidation regression guard"
else
    fail_gate "Gate 1 (scripts/check-cache-invalidation.sh) — D-2 violation: blanket-tag revalidation and/or a NEW stale force-dynamic route beyond the T7 debt baseline"
fi
echo ""

# ─── Gate 2: lockfile in sync (pnpm install --frozen-lockfile) ─────────────
# Same first step CI runs. A pnpm-lock.yaml that has drifted from
# package.json is the single most common way a green local run diverges
# from what CI will see.
echo "--> Gate 2: pnpm install --frozen-lockfile ..."
if pnpm install --frozen-lockfile; then
    ok "lockfile in sync"
else
    fail_gate "Gate 2 (pnpm install --frozen-lockfile) — lockfile out of sync with package.json, or a dependency install failure"
fi
echo ""

# ─── Gate 3: build @mcpfind/shared ──────────────────────────────────────────
# CI builds this package explicitly and first, because apps/web and the
# other packages consume its emitted types/JS via workspace:*.
echo "--> Gate 3: pnpm --filter @mcpfind/shared build ..."
if pnpm --filter @mcpfind/shared build; then
    ok "@mcpfind/shared build"
else
    fail_gate "Gate 3 (pnpm --filter @mcpfind/shared build)"
fi
echo ""

# ─── Gate 4: lint ────────────────────────────────────────────────────────────
# Real script (root package.json "lint": "turbo lint" -> apps/web
# "lint": "next lint"). Not currently run by ci.yml, but it exists and is
# cheap, so it is included here as a hygiene gate. Reported separately in
# the summary from the CI-parity gates below.
echo "--> Gate 4: pnpm lint ..."
if pnpm lint; then
    ok "lint"
else
    fail_gate "Gate 4 (pnpm lint)"
fi
echo ""

# ─── Gate 5: type-check ─────────────────────────────────────────────────────
# Root package.json "type-check": "turbo type-check", which turbo.json
# marks dependsOn ["^build"] — same as CI's `pnpm type-check` step.
echo "--> Gate 5: pnpm type-check ..."
if pnpm type-check; then
    ok "type-check"
else
    fail_gate "Gate 5 (pnpm type-check)"
fi
echo ""

# ─── Gate 6: test (@mcpfind/web) ────────────────────────────────────────────
# CI runs `pnpm --filter @mcpfind/web test` (vitest run). This is the only
# package with a "test" script; there is no root-level aggregate test task
# in turbo.json, so this is the real equivalent, not an invented one.
echo "--> Gate 6: pnpm --filter @mcpfind/web test ..."
if pnpm --filter @mcpfind/web test; then
    ok "@mcpfind/web test"
else
    fail_gate "Gate 6 (pnpm --filter @mcpfind/web test)"
fi
echo ""

# ─── Gate 7: build ───────────────────────────────────────────────────────────
# Root package.json "build": "turbo build" — same as CI's final `pnpm build`
# step. Runs last because it is the slowest and most downstream gate.
echo "--> Gate 7: pnpm build ..."
if pnpm build; then
    ok "build"
else
    fail_gate "Gate 7 (pnpm build)"
fi
echo ""

echo "==> Summary"
if [ "${#FAILED_GATES[@]}" -eq 0 ]; then
    echo -e "${GREEN}All pre-push gates passed.${NC}"
    EXIT_CODE=0
else
    echo -e "${RED}${#FAILED_GATES[@]} gate(s) FAILED:${NC}"
    for g in "${FAILED_GATES[@]}"; do
        echo -e "${RED}  - ${g}${NC}"
    done
    EXIT_CODE=1
fi

echo ""
echo "EXIT CODE: ${EXIT_CODE}"
exit "$EXIT_CODE"
