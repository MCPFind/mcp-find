import { SITEMAP_CACHE_CONTROL } from '@/lib/sitemap-lastmod';

// Dynamic execution avoids build-time DB reads; explicit shared caching keeps
// successful XML cheap. The underlying indexable query remains unstable_cache'd.
export function sitemapResponse(xml: string): Response {
  return new Response(xml, { headers: {
    'Content-Type': 'application/xml',
    'Cache-Control': SITEMAP_CACHE_CONTROL,
    'CDN-Cache-Control': SITEMAP_CACHE_CONTROL,
    'Vercel-CDN-Cache-Control': SITEMAP_CACHE_CONTROL,
  } });
}

export async function serveSitemap(render: () => Promise<Response>): Promise<Response> {
  try {
    return await render();
  } catch (error) {
    const missing = error instanceof Error && 'digest' in error && error.digest === 'NEXT_NOT_FOUND';
    if (!missing) console.warn('[sitemap] Generation unavailable; not publishing partial XML.');
    return new Response(missing ? 'Sitemap not found' : 'Sitemap temporarily unavailable', {
      status: missing ? 404 : 503,
      headers: {
        'Cache-Control': 'no-store',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        ...(missing ? {} : { 'Retry-After': '60' }),
      },
    });
  }
}
