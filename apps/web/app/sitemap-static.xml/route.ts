import { getStaticSitemapEntries } from '@/lib/sitemap-static-pages';
import { renderSitemapUrl, SITEMAP_CACHE_CONTROL } from '@/lib/sitemap-lastmod';

export const revalidate = 3600;
export const maxDuration = 15;

export async function GET() {
  // The URL list — and every lastmod on it — is built in lib/sitemap-static-pages.ts
  // so that sitemap.xml can advertise this shard's real max lastmod from the
  // same source. No page here gets a `today` fallback any more: `/`, `/servers`
  // and `/submit` all used to carry a rolling date that moved on every request
  // regardless of whether anything had changed.
  const entries = await getStaticSitemapEntries();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(entry => renderSitemapUrl(entry)).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': SITEMAP_CACHE_CONTROL,
    },
  });
}
