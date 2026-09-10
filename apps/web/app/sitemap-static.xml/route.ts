import { serveSitemap, sitemapResponse } from '@/lib/sitemap-response';
import { getStaticSitemapEntries } from '@/lib/sitemap-static-pages';
import { renderSitemapUrl } from '@/lib/sitemap-lastmod';

// Never scan Supabase during build; successful XML is explicitly CDN-cached.
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

async function renderSitemap() {
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

  return sitemapResponse(xml);
}

export async function GET() {
  return serveSitemap(renderSitemap);
}
