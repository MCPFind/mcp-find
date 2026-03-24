-- Backfill search_vector for any rows inserted before the trigger existed
UPDATE servers SET updated_at = updated_at WHERE search_vector IS NULL;
