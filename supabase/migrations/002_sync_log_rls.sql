ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
-- Allow public read of sync status (non-sensitive metadata)
CREATE POLICY "Public read sync status" ON sync_log FOR SELECT USING (true);
