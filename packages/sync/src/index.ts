/**
 * Sync pipeline entry point. Invoked by .github/workflows/sync.yml via
 * "pnpm --filter @mcpfind/sync run start" (tsx src/index.ts).
 *
 * Deliberately thin: the pipeline lives in pipeline.ts so it can be imported
 * and tested without running, and this file is the single place that converts
 * its exit code into a process exit.
 */
import { runSyncPipeline } from './pipeline';

runSyncPipeline().then(code => {
  if (code !== 0) process.exit(code);
});
