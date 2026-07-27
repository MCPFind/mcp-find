#!/usr/bin/env python3
"""Nightly backfill: generate `ai_summary` for gated (isIndexable) servers.

Part of Slice 3 (Enrichment backfill) of the mcpfind indexing-recovery plan
(specs/stage-6-slices/00-recovery-plan.md). Migration 006
(supabase/migrations/006_ai_summary.sql) added five provenance columns to
`servers`: ai_summary, ai_summary_generated_at, ai_summary_model,
ai_summary_prompt_version, ai_summary_source_hash.

GUARDRAIL (recovery-plan "Guardrails: anti scaled-content-abuse"): ai_summary
is a labeled supplement ONLY. It is rendered in a clearly-labeled "AI Summary"
block on the server detail page (apps/web/app/servers/[slug]/page.tsx) and is
NEVER substituted for `description` in the JSON-LD SoftwareApplication.description
(apps/web/lib/metadata.ts#generateServerJsonLd) or used as primary on-page body
copy. This script only ever writes to the ai_summary_* columns — it never
touches `description`.

What this script does
----------------------
1. Selects candidate rows from `servers` and re-applies, in Python, the same
   gating predicate as the TypeScript `isIndexable()` (apps/web/lib/indexable.ts)
   so only servers that clear mcpfind's real-data quality bar (>= 3 of 5
   source-data signals; see `is_indexable()` below) are ever summarized. Signal
   count and thresholds are kept in lockstep with indexable.ts by hand — if you
   change one, change the other.
2. For each gated server, computes a source hash over the same fields
   documented on migration 006's `ai_summary_source_hash` column comment:
   name|description|readme_content[:8000]|category|package_name|package_type|registry_tags
   (registry_tags, being an array, is joined with "," before hashing — this is
   this script's own serialization choice; it is not separately specified by
   the migration comment).
3. Skips rows whose stored `ai_summary_source_hash` already matches the freshly
   computed hash — idempotent, no wasted regeneration on an unchanged server
   (recovery-plan guardrail: "Skip-if-unchanged via source hash").
4. For rows needing (re)generation, builds a factual-summary prompt and posts
   it to the local Mac Mini Claude Code queue (never a raw Anthropic API key —
   see this org's convention: all AI generation runs through
   http://127.0.0.1:7600, not a direct Anthropic API call).
5. Writes back ai_summary, ai_summary_generated_at (UTC now),
   ai_summary_model ("claude-code-local-queue"), ai_summary_prompt_version
   ("v1" by default, override with --prompt-version), and the new
   ai_summary_source_hash.

Local Claude Code queue contract (assumed — no prior client existed in this
repo to match; grepped for "7600" and "claude-code-local-queue" across the
repo and found none other than the migration 006 column comments):
    POST {LOCAL_QUEUE_URL}/generate
    Body: {"prompt": "<prompt text>", "max_tokens": 500}
    Response (200): JSON object containing the generated text under one of
        "completion", "text", "response", "result", or "output" (checked in
        that order — defensive against minor key-naming variance).
If your actual queue endpoint uses a different contract, update
`call_local_queue()` only — every other function in this script is
queue-contract-agnostic.

Environment variables (same names as packages/sync/src/index.ts and
apps/web/lib/supabase.ts — the existing Supabase client conventions in this
repo):
    SUPABASE_URL              - required. Supabase project REST URL.
    SUPABASE_SERVICE_ROLE_KEY - required. Service-role key (write access;
                                the anon key used by the web app is read-only
                                under RLS and cannot UPDATE ai_summary_*).
    CLAUDE_CODE_LOCAL_QUEUE_URL - optional. Overrides the default
                                http://127.0.0.1:7600 local queue base URL.

Usage:
    python3 scripts/mcpfind/ai_summary_generate.py [--dry-run] [--limit N]
        [--prompt-version v1] [--page-size 500] [--sleep-seconds 0.5] [-v]

Exit codes:
    0 - completed with zero per-row failures (including the trivial case of
        zero gated servers).
    1 - configuration error (missing env vars) — nothing was attempted.
    2 - completed, but one or more rows failed to generate/update; see the
        logged per-row errors. Safe to re-run — failed rows retry from scratch
        next run, since their source hash was never updated.

Nightly cron: schedule via launchd (Mac Mini convention — no remote triggers,
see wiki/rules/no-remote-triggers.md). This script has no side effects beyond
Supabase writes and local-queue calls, so re-running after a partial failure
is always safe.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

import requests

# ---------------------------------------------------------------------------
# Constants — keep README_MIN_LENGTH / MIN_SIGNALS in lockstep with
# apps/web/lib/indexable.ts. Do not drift these independently.
# ---------------------------------------------------------------------------
README_MIN_LENGTH = 400
MIN_SIGNALS = 3

SOURCE_HASH_README_TRUNCATE = 8000
DEFAULT_PROMPT_VERSION = "v1"
AI_SUMMARY_MODEL_LABEL = "claude-code-local-queue"
DEFAULT_LOCAL_QUEUE_URL = "http://127.0.0.1:7600"
DEFAULT_PAGE_SIZE = 500
SUMMARY_WORD_MIN = 150
SUMMARY_WORD_MAX = 200

# Columns pulled from `servers` — the union of what is_indexable() needs plus
# the fields the source hash and prompt are built from. Mirrors
# SERVER_DETAIL_COLUMNS in apps/web/lib/queries.ts, minus fields this script
# doesn't use (e.g. github_stars/tool_count are in isIndexable's signal set
# and included below; UI-only fields like npm_weekly_downloads are not).
CANDIDATE_COLUMNS = (
    "id,name,description,readme_content,category,package_name,package_type,"
    "registry_tags,registry_status,github_archived,has_tools,tool_count,"
    "github_stars,ai_summary_source_hash"
)

logger = logging.getLogger("ai_summary_generate")


@dataclass
class RunStats:
    scanned: int = 0
    gated: int = 0
    skipped_unchanged: int = 0
    generated: int = 0
    failed: int = 0


class LocalQueueError(RuntimeError):
    """Raised when the local Claude Code queue call fails or returns something unusable."""


class SupabaseError(RuntimeError):
    """Raised on a non-2xx response from the Supabase REST API."""


# ---------------------------------------------------------------------------
# Gating — Python port of apps/web/lib/indexable.ts#isIndexable.
# ---------------------------------------------------------------------------
def is_indexable(row: dict[str, Any]) -> bool:
    """Re-implements isIndexable() from apps/web/lib/indexable.ts.

    Hard exclusions first (deprecated / archived are never indexable
    regardless of signal count), then a >= MIN_SIGNALS-of-5 count over the
    same five source-data signals used on the TypeScript side.
    """
    if row.get("registry_status") == "deprecated":
        return False
    if row.get("github_archived"):
        return False

    signals = 0

    readme_content = row.get("readme_content") or ""
    if len(readme_content.strip()) >= README_MIN_LENGTH:
        signals += 1

    if row.get("has_tools") or (row.get("tool_count") or 0) > 0:
        signals += 1

    if row.get("package_name") and row.get("package_type"):
        signals += 1

    if (row.get("github_stars") or 0) > 0:
        signals += 1

    if row.get("category"):
        signals += 1

    return signals >= MIN_SIGNALS


# ---------------------------------------------------------------------------
# Source hash — matches migration 006's ai_summary_source_hash column comment.
# ---------------------------------------------------------------------------
def compute_source_hash(row: dict[str, Any]) -> str:
    """SHA-256 over name|description|readme_content[:8000]|category|package_name|package_type|registry_tags.

    Field order and truncation match the column comment on
    servers.ai_summary_source_hash in supabase/migrations/006_ai_summary.sql.
    registry_tags is an array; this script serializes it by joining with ","
    (not separately specified upstream — documented here as this script's
    own convention so any other future writer of this column can match it).
    """
    name = row.get("name") or ""
    description = row.get("description") or ""
    readme = (row.get("readme_content") or "")[:SOURCE_HASH_README_TRUNCATE]
    category = row.get("category") or ""
    package_name = row.get("package_name") or ""
    package_type = row.get("package_type") or ""
    registry_tags = ",".join(row.get("registry_tags") or [])

    source = "|".join(
        [name, description, readme, category, package_name, package_type, registry_tags]
    )
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------
def build_prompt(row: dict[str, Any]) -> str:
    name = row.get("name") or "this MCP server"
    description = row.get("description") or "(no description provided)"
    category = row.get("category") or "uncategorized"
    package_name = row.get("package_name") or "(no package)"
    package_type = row.get("package_type") or "unknown"
    readme_excerpt = (row.get("readme_content") or "")[:SOURCE_HASH_README_TRUNCATE]

    return (
        "You are writing a factual, neutral 150-200 word summary of an MCP "
        "(Model Context Protocol) server for a directory listing page. This "
        "summary is a labeled supplement displayed alongside — never in place "
        "of — the server's existing description and README. Do not write "
        "marketing copy, do not invent capabilities not evidenced below, and "
        "do not exceed 200 words or fall under 150 words.\n\n"
        f"Server name: {name}\n"
        f"Category: {category}\n"
        f"Package: {package_name} ({package_type})\n"
        f"Existing short description: {description}\n"
        f"README excerpt:\n{readme_excerpt}\n\n"
        "Write the 150-200 word factual summary now. Output only the summary "
        "text, no headings, no preamble."
    )


# ---------------------------------------------------------------------------
# Local Claude Code queue client
# ---------------------------------------------------------------------------
def call_local_queue(
    prompt: str,
    base_url: str,
    timeout_seconds: float = 120.0,
    max_attempts: int = 3,
) -> str:
    """POST `prompt` to the local Mac Mini Claude Code queue and return generated text.

    See the module docstring for the assumed request/response contract. Retries
    on network errors and 5xx responses with linear backoff; does not retry on
    4xx (a bad request will not fix itself on retry).
    """
    url = f"{base_url.rstrip('/')}/generate"
    last_error: Optional[Exception] = None

    for attempt in range(1, max_attempts + 1):
        try:
            resp = requests.post(
                url,
                json={"prompt": prompt, "max_tokens": 500},
                timeout=timeout_seconds,
            )
        except requests.RequestException as exc:
            last_error = exc
            logger.warning(
                "Local queue request failed (attempt %d/%d): %s", attempt, max_attempts, exc
            )
            time.sleep(2 * attempt)
            continue

        if resp.status_code >= 500:
            last_error = LocalQueueError(f"Local queue HTTP {resp.status_code}: {resp.text[:500]}")
            logger.warning(
                "Local queue returned %d (attempt %d/%d)", resp.status_code, attempt, max_attempts
            )
            time.sleep(2 * attempt)
            continue

        if resp.status_code >= 400:
            raise LocalQueueError(
                f"Local queue rejected request with HTTP {resp.status_code}: {resp.text[:500]}"
            )

        try:
            data = resp.json()
        except ValueError as exc:
            raise LocalQueueError(f"Local queue returned non-JSON response: {exc}") from exc

        for key in ("completion", "text", "response", "result", "output"):
            value = data.get(key) if isinstance(data, dict) else None
            if isinstance(value, str) and value.strip():
                return value.strip()

        raise LocalQueueError(
            f"Local queue response had no usable text field (checked completion/text/"
            f"response/result/output): {data!r}"
        )

    raise LocalQueueError(
        f"Local queue call failed after {max_attempts} attempts: {last_error}"
    )


def generate_summary(row: dict[str, Any], base_url: str) -> str:
    prompt = build_prompt(row)
    summary = call_local_queue(prompt, base_url=base_url)

    word_count = len(summary.split())
    if not (SUMMARY_WORD_MIN <= word_count <= SUMMARY_WORD_MAX):
        # Non-fatal: the model doesn't always hit the target window exactly.
        # Log so drift is visible without failing the whole backfill run.
        logger.warning(
            "Generated summary for %r is %d words (target %d-%d) — storing anyway",
            row.get("name"),
            word_count,
            SUMMARY_WORD_MIN,
            SUMMARY_WORD_MAX,
        )

    return summary


# ---------------------------------------------------------------------------
# Supabase REST client (PostgREST) — no supabase-py dependency, just requests.
# Mirrors the SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY convention used by
# packages/sync/src/index.ts and packages/sync/src/recategorize-other.ts.
# ---------------------------------------------------------------------------
def _rest_headers(service_role_key: str, prefer: Optional[str] = None) -> dict[str, str]:
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def fetch_candidate_servers(
    supabase_url: str,
    service_role_key: str,
    page_size: int,
) -> list[dict[str, Any]]:
    """Paginate through non-deprecated, non-archived servers.

    Pushes down the two hard exclusions from isIndexable() (registry_status
    and github_archived) as query filters — those two never depend on signal
    count, so filtering server-side is safe and cuts payload size. The
    remaining 5-signal scoring (README length, tools, install command, GitHub
    stars, category) is computed client-side in is_indexable(), since it's a
    threshold over multiple independent fields rather than a single filter.
    """
    rest_url = f"{supabase_url.rstrip('/')}/rest/v1/servers"
    headers = _rest_headers(service_role_key)
    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        params = {
            "select": CANDIDATE_COLUMNS,
            "registry_status": "eq.active",
            "github_archived": "eq.false",
            "order": "id.asc",
            "limit": str(page_size),
            "offset": str(offset),
        }
        resp = requests.get(rest_url, headers=headers, params=params, timeout=30)
        if not resp.ok:
            raise SupabaseError(
                f"Fetching candidate servers failed: HTTP {resp.status_code}: {resp.text[:500]}"
            )
        page = resp.json()
        if not isinstance(page, list):
            raise SupabaseError(f"Unexpected non-list response from Supabase: {page!r}")

        rows.extend(page)
        logger.debug("Fetched page at offset %d: %d rows", offset, len(page))

        if len(page) < page_size:
            break
        offset += page_size

    return rows


def update_server_summary(
    supabase_url: str,
    service_role_key: str,
    server_id: str,
    ai_summary: str,
    ai_summary_source_hash: str,
    prompt_version: str,
) -> None:
    rest_url = f"{supabase_url.rstrip('/')}/rest/v1/servers"
    headers = _rest_headers(service_role_key, prefer="return=minimal")
    body = {
        "ai_summary": ai_summary,
        "ai_summary_generated_at": datetime.now(timezone.utc).isoformat(),
        "ai_summary_model": AI_SUMMARY_MODEL_LABEL,
        "ai_summary_prompt_version": prompt_version,
        "ai_summary_source_hash": ai_summary_source_hash,
    }
    resp = requests.patch(
        rest_url,
        headers=headers,
        params={"id": f"eq.{server_id}"},
        json=body,
        timeout=30,
    )
    if not resp.ok:
        raise SupabaseError(
            f"Updating server {server_id} failed: HTTP {resp.status_code}: {resp.text[:500]}"
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else "")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute gating + hashes and log what would change, without calling the "
        "local queue or writing to Supabase.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap the number of servers processed this run (after gating). Useful for "
        "testing or throttling a single nightly window.",
    )
    parser.add_argument(
        "--prompt-version",
        default=DEFAULT_PROMPT_VERSION,
        help=f"Value stored in ai_summary_prompt_version (default: {DEFAULT_PROMPT_VERSION}). "
        "Bump this to force full regeneration on the next run for all gated servers "
        "(they'll have a stale prompt version but the source hash alone won't change — "
        "see migration 006's column comment on ai_summary_prompt_version).",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=DEFAULT_PAGE_SIZE,
        help=f"Supabase REST pagination page size (default: {DEFAULT_PAGE_SIZE}).",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.5,
        help="Delay between local-queue calls, to avoid hammering the queue (default: 0.5s).",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Debug-level logging.")
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    supabase_url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    local_queue_url = os.environ.get("CLAUDE_CODE_LOCAL_QUEUE_URL", DEFAULT_LOCAL_QUEUE_URL)

    if not supabase_url or not service_role_key:
        logger.error(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. "
            "Aborting — nothing was attempted."
        )
        return 1

    stats = RunStats()

    logger.info("Fetching candidate servers from Supabase...")
    try:
        candidates = fetch_candidate_servers(supabase_url, service_role_key, args.page_size)
    except SupabaseError as exc:
        logger.error("Failed to fetch candidate servers: %s", exc)
        return 1

    stats.scanned = len(candidates)
    logger.info("Fetched %d non-deprecated, non-archived candidate servers.", stats.scanned)

    gated = [row for row in candidates if is_indexable(row)]
    stats.gated = len(gated)
    logger.info(
        "%d of %d candidates clear the isIndexable() quality bar (>= %d of 5 signals).",
        stats.gated,
        stats.scanned,
        MIN_SIGNALS,
    )

    if args.limit is not None:
        gated = gated[: args.limit]
        logger.info("--limit %d applied — processing %d servers this run.", args.limit, len(gated))

    for row in gated:
        server_id = row.get("id")
        name = row.get("name") or server_id
        new_hash = compute_source_hash(row)
        existing_hash = row.get("ai_summary_source_hash")

        if existing_hash and existing_hash == new_hash:
            stats.skipped_unchanged += 1
            logger.debug("Skipping %r — source hash unchanged.", name)
            continue

        if args.dry_run:
            logger.info(
                "[dry-run] Would (re)generate ai_summary for %r (id=%s, hash %s -> %s).",
                name,
                server_id,
                existing_hash,
                new_hash,
            )
            stats.generated += 1
            continue

        try:
            summary = generate_summary(row, base_url=local_queue_url)
            update_server_summary(
                supabase_url,
                service_role_key,
                server_id=server_id,
                ai_summary=summary,
                ai_summary_source_hash=new_hash,
                prompt_version=args.prompt_version,
            )
            stats.generated += 1
            logger.info("Generated + stored ai_summary for %r (id=%s).", name, server_id)
        except (LocalQueueError, SupabaseError) as exc:
            stats.failed += 1
            logger.error("Failed to (re)generate ai_summary for %r (id=%s): %s", name, server_id, exc)

        time.sleep(args.sleep_seconds)

    logger.info(
        "Done. scanned=%d gated=%d skipped_unchanged=%d generated=%d failed=%d",
        stats.scanned,
        stats.gated,
        stats.skipped_unchanged,
        stats.generated,
        stats.failed,
    )

    return 2 if stats.failed > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
