import { createClient } from '@supabase/supabase-js';
import { ensureSyncLogTerminal } from './terminal-ledger';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const syncStart = process.env.SYNC_START;
if (!url || !key || !syncStart) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SYNC_START are required');
}

const result = await ensureSyncLogTerminal(createClient(url, key), syncStart);
console.log(
  `[Sync Ledger] id=${result.id} status=${result.status} repaired=${result.repaired}`
);
