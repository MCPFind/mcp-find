import { sitemapResponse } from '@/lib/sitemap-response';
import { getServersSitemapPage } from '@/lib/queries';
import { SITE_URL } from '@mcpfind/shared';
import { notFound } from 'next/navigation';
import { renderSitemapUrl } from '@/lib/sitemap-lastmod';

export const BATCH_SIZE = 5000;
export const MAX_BATCHES = 10; // Safety cap — supports up to 50,000 servers

export async function getServersSitemapBatch(batchIndex: number): Promise<Response> {
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex >= MAX_BATCHES) {
    notFound();
  }

  const offset = batchIndex * BATCH_SIZE;
  const servers = await getServersSitemapPage(offset, BATCH_SIZE);

  if (servers.length === 0) {
    notFound();
  }

  // changefreq is derived per-URL from the age of that URL's real lastmod.
  // It used to be a hardcoded `daily` on all 452 indexable URLs — none of
  // which changed daily, and most of which had not changed since 2026-03-25.
  // A sitemap that claims daily churn on a five-month-old page teaches the
  // crawler that its claims are worthless.
  const renderUrl = (slug: string, canonicalSlug: string | null, lastmod: string | null) =>
    // Use canonical_slug if available (stable); fall back to slug (pre-migration path).
    renderSitemapUrl({
      loc: `${SITE_URL}/servers/${canonicalSlug ?? slug}`,
      lastmod,
      priority: '0.7',
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${servers.map(s => renderUrl(s.slug, s.canonical_slug, s.lastmod)).join('\n')}
</urlset>`;

  return sitemapResponse(xml);
}
