ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
-- No public read policy — sync_log is service-role only
