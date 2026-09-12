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

    expect(limit).toBe(600);
    expect(deadlineMs).toBe(900_000);
    // The production client spaces repository groups by 800ms. Preserve at
    // least seven minutes for GitHub response time and bounded retries.
    expect(deadlineMs - limit * 800).toBeGreaterThanOrEqual(420_000);
  });
});
