-- 011_sync_log_community_count.sql
--
-- Record how many community submissions a sync run ingested.
--
-- Before the community ingest stage existed, `servers_synced` described the
-- whole run because the registry was the only writer. It no longer is: stage 1b
-- reads community-servers.yml and submissions/*.yml and writes rows with
-- source = 'community'. Folding those into servers_synced would make a run that
-- ingested a submission indistinguishable from one that ingested none, which is
-- the same shape of lie as the five months of enrichment 401s that every
-- dashboard read as healthy.
--
-- NOT YET APPLIED. packages/sync/src/pipeline.ts writes this column
-- opportunistically: it attempts the UPDATE with servers_community and, if
-- PostgREST refuses because the column is absent, retries without it and warns
-- naming this file. That ordering is deliberate — losing one counter is
-- survivable, losing the terminal sync_log row is not, because a run stuck at
-- status 'running' is invisible to every watchdog that reads status.
--
-- After applying, the fallback path stops firing and the warning stops
-- appearing in the sync logs.

ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS servers_community INTEGER DEFAULT 0;

COMMENT ON COLUMN sync_log.servers_community IS
  'Rows written with source = ''community'' by the submission ingest stage. Counted separately from servers_synced, which remains the registry count.';
