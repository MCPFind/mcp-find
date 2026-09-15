import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Daily Sync enrichment budget', () => {
  it('keeps the scheduled candidate batch below the stage deadline', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/sync.yml', import.meta.url),
      'utf8'
    );
    const limit = Number(workflow.match(/GH_ENRICHMENT_LIMIT:\s*(\d+)/)?.[1]);
    const deadlineMs = Number(
      workflow.match(/GH_ENRICHMENT_STAGE_TIMEOUT_MS:\s*(\d+)/)?.[1]
    );

    expect(limit).toBe(300);
    expect(deadlineMs).toBe(900_000);
    // The Sep 14 production run needed roughly 1.7s per normalized repository
    // for its three GitHub reads. Budget 1.8s for every claimed row (the worst
    // case is one row per repository) and retain six minutes for tail latency
    // and bounded retries inside the 15-minute stage.
    expect(deadlineMs - limit * 1_800).toBeGreaterThanOrEqual(360_000);
  });
});
