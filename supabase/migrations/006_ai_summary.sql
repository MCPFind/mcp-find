-- Migration 006: AI-generated server summaries
-- Adds five provenance columns to the servers table for the AI summary pipeline.
-- See specs/mcpfind/mcpfind-server-ai-summary-pipeline.md for the full design.
--
-- Notes:
--   • search_vector trigger deliberately NOT updated — generated prose is for AI
--     passage extraction, not for re-weighting on-site full-text search.
--   • RLS already allows public SELECT on servers; the new columns inherit it.
--     No new policy is needed.
--   • These columns will be NULL for all existing rows until the Mac Mini nightly
--     ai_summary_generate.py orchestrator backfills them.
--   • Migration numbering: 001/002/003/005 → 006 (004 was intentionally skipped).

ALTER TABLE servers ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS ai_summary_generated_at TIMESTAMPTZ;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS ai_summary_model TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS ai_summary_prompt_version TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS ai_summary_source_hash TEXT;

-- Index for incremental orchestrator: quickly find servers that need a new summary.
-- Covers: (a) never summarized, (b) source changed, (c) prompt version bumped.
CREATE INDEX IF NOT EXISTS idx_servers_ai_summary_null
  ON servers (id)
  WHERE ai_summary IS NULL;

-- Comment block to document intent alongside the schema.
COMMENT ON COLUMN servers.ai_summary IS
  'AI-generated 150-200 word factual summary generated via local Mac Mini queue. '
  'NULL until backfilled. Labeled supplement ONLY — must render as a clearly labeled '
  '"AI Summary" block, never substituted into structured-data SoftwareApplication.description '
  'or used as primary on-page body copy (see specs/stage-6-slices/00-recovery-plan.md, '
  'Guardrails: anti scaled-content-abuse).';

COMMENT ON COLUMN servers.ai_summary_generated_at IS
  'Timestamp when ai_summary was last generated or regenerated.';

COMMENT ON COLUMN servers.ai_summary_model IS
  'Identifies the generation path, e.g. "claude-code-local-queue". '
  'Not a raw Anthropic model ID — generation runs through 127.0.0.1:7600.';

COMMENT ON COLUMN servers.ai_summary_prompt_version IS
  'Prompt template version string (e.g. "v1"). '
  'Bump to trigger full regeneration for all servers on the next nightly run.';

COMMENT ON COLUMN servers.ai_summary_source_hash IS
  'SHA-256 of the source fields used for generation: '
  'name|description|readme_content[:8000]|category|package_name|package_type|registry_tags. '
  'Enables skip-if-unchanged idempotency without querying ai_summary content.';
