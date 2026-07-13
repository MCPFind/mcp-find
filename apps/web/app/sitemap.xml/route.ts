import { getIndexableServerCount } from '@/lib/queries';
import { SITE_URL } from '@mcpfind/shared';
import { BATCH_SIZE, MAX_BATCHES } from '@/lib/sitemap-servers';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Shard count is derived from the INDEXABLE count, not the raw server
  // count — otherwise the index advertises shards that the isIndexable()
  // gate empties out downstream, and those shards 404 (see
  // getServersSitemapPage / getServersSitemapBatch for the matching fix).
  const indexableServerCount = await getIndexableServerCount();
  const totalServerBatches = indexableServerCount === 0 ? 0 : Math.min(
    Math.ceil(indexableServerCount / BATCH_SIZE),
    MAX_BATCHES,
  );

  const today = new Date().toISOString().split('T')[0];

  const sitemaps = [
    { loc: `${SITE_URL}/sitemap-static.xml`, lastmod: today },
    ...Array.from({ length: totalServerBatches }, (_, i) => ({
      loc: `${SITE_URL}/sitemap-servers-${i}.xml`,
      lastmod: today,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(s => `  <sitemap>\n    <loc>${s.loc}</loc>\n    <lastmod>${s.lastmod}</lastmod>\n  </sitemap>`).join('\n')}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
