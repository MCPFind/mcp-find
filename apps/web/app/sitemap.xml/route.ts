import { getIndexableServerCount, getSitemapShardLastmod } from '@/lib/queries';
import { SITE_URL } from '@mcpfind/shared';
import { BATCH_SIZE, MAX_BATCHES } from '@/lib/sitemap-servers';
import { getStaticSitemapLastmod } from '@/lib/sitemap-static-pages';
import { renderSitemapIndexEntry, SITEMAP_CACHE_CONTROL } from '@/lib/sitemap-lastmod';

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

  // Every lastmod here is the max REAL lastmod of the URLs inside the shard
  // it points at — never `now()`.
  //
  // This route used to stamp `today` on the index and on every shard entry
  // unconditionally, while the shard bodies reported 2026-03-25. Google
  // resolved that contradiction the way it resolves any unreliable freshness
  // claim: it kept re-reading the cheap index and stopped downloading the
  // shard, for 19 days. Deriving both ends from the same rows makes the
  // contradiction unrepresentable.
  //
  // A shard with no real timestamp anywhere in it gets no <lastmod> element.
  const [staticLastmod, ...shardLastmods] = await Promise.all([
    getStaticSitemapLastmod(),
    ...Array.from({ length: totalServerBatches }, (_, i) =>
      getSitemapShardLastmod(i * BATCH_SIZE, BATCH_SIZE),
    ),
  ]);

  const sitemaps: { loc: string; lastmod: string | null }[] = [
    { loc: `${SITE_URL}/sitemap-static.xml`, lastmod: staticLastmod },
    ...Array.from({ length: totalServerBatches }, (_, i) => ({
      loc: `${SITE_URL}/sitemap-servers-${i}.xml`,
      lastmod: shardLastmods[i] ?? null,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(s => renderSitemapIndexEntry(s.loc, s.lastmod)).join('\n')}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': SITEMAP_CACHE_CONTROL,
    },
  });
}
