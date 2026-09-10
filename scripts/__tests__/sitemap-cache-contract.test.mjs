import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CDN_SITEMAP_ROUTES, sitemapCacheViolations } from '../sitemap-cache-contract.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
describe('D-2 sitemap CDN contract', () => {
  it('accepts the explicit dynamic/shared-cache design', () => expect(sitemapCacheViolations(root)).toEqual([]));
  it('fails if CDN cache headers, no-store errors or dynamic opt-out disappear', () => {
    const temp = mkdtempSync(join(tmpdir(), 'sitemap-cache-contract-'));
    const files = [...CDN_SITEMAP_ROUTES, 'apps/web/lib/sitemap-response.ts', 'apps/web/lib/queries.ts'];
    try {
      for (const file of files) { mkdirSync(dirname(join(temp, file)), { recursive: true }); writeFileSync(join(temp, file), readFileSync(join(root, file))); }
      const helper = join(temp, 'apps/web/lib/sitemap-response.ts');
      writeFileSync(helper, readFileSync(helper, 'utf8').replace("'Vercel-CDN-Cache-Control': SITEMAP_CACHE_CONTROL", "'Removed': SITEMAP_CACHE_CONTROL"));
      expect(sitemapCacheViolations(temp).some(x => x.message.includes('Vercel-CDN'))).toBe(true);
      writeFileSync(helper, readFileSync(join(root, 'apps/web/lib/sitemap-response.ts'), 'utf8').replaceAll("'no-store'", "'public'"));
      expect(sitemapCacheViolations(temp)).toHaveLength(3);
      writeFileSync(join(temp, CDN_SITEMAP_ROUTES[0]), 'export const revalidate = 3600;');
      expect(sitemapCacheViolations(temp).some(x => x.file === CDN_SITEMAP_ROUTES[0])).toBe(true);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
});
