import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export const CDN_SITEMAP_ROUTES = [
  'sitemap.xml', 'sitemap-static.xml',
  ...Array.from({ length: 10 }, (_, i) => `sitemap-servers-${i}.xml`),
].map(route => `apps/web/app/${route}/route.ts`);

// Narrow transport classification, not an enlarged force-dynamic debt baseline.
// Behavioral tests additionally exercise HTTP status, headers and shared data.
export function sitemapCacheViolations(root) {
  const errors = [];
  const read = path => readFileSync(join(root, path), 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
  for (const route of CDN_SITEMAP_ROUTES) {
    const source = read(route);
    if (!/export const dynamic = ['"]force-dynamic['"]/.test(source) || !source.includes('return serveSitemap(')) {
      errors.push({ file: route, message: 'Sitemap must defer build work and use the shared cached/error response wrapper.' });
    }
  }
  const helper = read('apps/web/lib/sitemap-response.ts');
  for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) {
    if (!helper.includes(`'${header}': SITEMAP_CACHE_CONTROL`) || !helper.includes(`'${header}': 'no-store'`)) {
      errors.push({ file: 'apps/web/lib/sitemap-response.ts', message: `Missing successful/error ${header} contract.` });
    }
  }
  const queries = read('apps/web/lib/queries.ts');
  if (!queries.includes("['indexable-sitemap-rows-v2']") || !queries.includes("{ tags: ['servers'], revalidate: 3600 }")) {
    errors.push({ file: 'apps/web/lib/queries.ts', message: 'Shared sitemap query cache requires review.' });
  }
  return errors;
}

export const CDN_DIRECTORY_TEXT_ROUTES = ['llms.txt', 'llms-full.txt'].map(route => `apps/web/app/${route}/route.ts`);
export function directoryTextCacheViolations(root) {
  const errors = [];
  for (const file of CDN_DIRECTORY_TEXT_ROUTES) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const fragment of ["export const dynamic = 'force-dynamic'", 'return directoryUnavailable()', "'CDN-Cache-Control': 'public, s-maxage=21600", "'Vercel-CDN-Cache-Control': 'public, s-maxage=21600"]) {
      if (!source.includes(fragment)) errors.push({ file, message: `Missing runtime text cache/error contract: ${fragment}` });
    }
  }
  return errors;
}
