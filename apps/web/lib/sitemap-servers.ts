import { getServersSitemapPage } from '@/lib/queries';
import { SITE_URL } from '@mcpfind/shared';
import { escapeXml } from '@/lib/escape-xml';
import { notFound } from 'next/navigation';

export const BATCH_SIZE = 5000;
export const MAX_BATCHES = 10; // Safety cap — supports up to 50,000 servers

export async function getServersSitemapBatch(batchIndex: number): Promise<Response> {
  if (isNaN(batchIndex) || batchIndex < 0 || batchIndex >= MAX_BATCHES) {
    notFound();
  }

  const offset = batchIndex * BATCH_SIZE;
  const servers = await getServersSitemapPage(offset, BATCH_SIZE);

  if (servers.length === 0) {
    notFound();
  }

  const renderUrl = (slug: string, canonicalSlug: string | null, updatedAt: string | null) => {
    // Use canonical_slug if available (stable); fall back to slug (pre-migration path).
    const urlSlug = canonicalSlug ?? slug;
    let lastmodStr = '';
    if (updatedAt) {
      try {
        lastmodStr = `\n    <lastmod>${new Date(updatedAt).toISOString().split('T')[0]}</lastmod>`;
      } catch {
        // Skip invalid dates
      }
    }
    return `  <url>
    <loc>${escapeXml(`${SITE_URL}/servers/${urlSlug}`)}</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>${lastmodStr}
  </url>`;
  };

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${servers.map(s => renderUrl(s.slug, s.canonical_slug, s.updated_at)).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}