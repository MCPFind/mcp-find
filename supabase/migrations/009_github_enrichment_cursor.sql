-- 009_github_enrichment_cursor.sql
--
-- Adds the GitHub enrichment rotation cursor.
--
-- Why this column has to exist separately from updated_at:
--
--   updated_at answers "when did this server's content last CHANGE?"
--   github_checked_at answers "when did we last LOOK at it?"
--
-- The enrichment job conflated the two. It wrote updated_at = now() on every
-- pass whether or not the fetched payload differed, which made updated_at
-- useless as a change signal (every sitemap lastmod would move in lockstep
-- with the job schedule rather than with reality). Once updated_at is
-- correctly gated on a content hash, it can no longer serve as the rotation
-- cursor either — an unchanged row keeps its old timestamp and would be
-- re-claimed by every subsequent run, so the job would never advance past
-- the oldest N candidates.
--
-- Two facts, two columns.
--
-- Safe to apply online: nullable, no default backfill, no rewrite. Existing
-- rows get NULL, which the job's `nullsFirst: true` ordering treats as
-- "never visited" — so the first run after this migration starts with the
-- rows that have never been enriched.
--
-- packages/sync/src/github-enrichment.ts probes for this column and degrades
-- to updated_at ordering when it is absent, so the code is safe to deploy
-- before or after this migration runs.

ALTER TABLE servers ADD COLUMN IF NOT EXISTS github_checked_at TIMESTAMPTZ;

-- Supports the enrichment candidate query's ORDER BY github_checked_at ASC
-- NULLS FIRST, id ASC over rows that have a github_url.
CREATE INDEX IF NOT EXISTS idx_servers_github_checked_at
  ON servers (github_checked_at ASC NULLS FIRST, id ASC)
  WHERE github_url IS NOT NULL;

COMMENT ON COLUMN servers.github_checked_at IS
  'When the GitHub enrichment job last fetched this repo, regardless of whether anything changed. Rotation cursor only — never a content-freshness signal. Use updated_at for that.';
