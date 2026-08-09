-- Migration: Performance indexes to stop disk-IO budget depletion (2026-08-08)
--
-- Symptom: the Supabase project was burning through its disk IO budget. Diagnosis
-- traced ~7.0 GiB of cumulative temp-file writes (pg_stat_database.temp_bytes) to
-- two hot query shapes against `servers`:
--
--   1. The directory listing / pagination query:
--        WHERE registry_status = $1 ORDER BY github_last_push DESC NULLS LAST
--      With no matching index the planner did a Parallel Seq Scan feeding a Sort.
--      Because PostgREST selects the full row (width ~792 bytes), the sort did not
--      fit in work_mem and fell back to "external merge Disk: ~11.7 MB" on EVERY
--      call. The existing idx_servers_registry_status could filter but supplied no
--      ordering, so the sort ran regardless.
--
--   2. The single-server page lookup:
--        WHERE canonical_slug = $1
--      canonical_slug was added in 005 without an index, so every lookup was a
--      Seq Scan over all ~20.7k rows (~1942 shared buffers per call). At the
--      observed call volume this dominated buffer traffic.
--
-- Fix: a composite index whose sort order exactly matches the ORDER BY (so the
-- planner reads pre-sorted and skips the Sort node entirely), plus a plain btree
-- on canonical_slug.
--
-- Measured on prod before/after:
--   listing (SELECT *):     external merge Disk 11768kB, 98.2 ms  ->  Index Scan, no temp, 9.5 ms
--   canonical_slug lookup:  Seq Scan, 1942 buffers, 9.6 ms        ->  Index Scan, 3 buffers, 2.4 ms
--
-- Applied to prod 2026-08-08 using CREATE INDEX CONCURRENTLY (both indexes came
-- back indisvalid=true). This file uses the plain non-concurrent form so it can
-- run inside a normal migration transaction; the servers heap is ~15 MB, so the
-- ACCESS EXCLUSIVE lock is sub-second. Both statements are IF NOT EXISTS, so
-- re-running against prod is a no-op.

-- The DESC NULLS LAST on the second column is load-bearing: it must match the
-- query's ORDER BY exactly, otherwise the planner cannot use the index to satisfy
-- the ordering and the disk-spilling Sort node comes back.
CREATE INDEX IF NOT EXISTS idx_servers_status_last_push
  ON public.servers (registry_status, github_last_push DESC NULLS LAST);

-- Not UNIQUE: canonical_slug is nullable until backfill_canonical_slug() runs for
-- newly-inserted rows (see 005), so uniqueness is not guaranteed at write time.
CREATE INDEX IF NOT EXISTS idx_servers_canonical_slug
  ON public.servers (canonical_slug);
