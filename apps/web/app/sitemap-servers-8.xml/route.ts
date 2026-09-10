import { serveSitemap } from '@/lib/sitemap-response';
import { getServersSitemapBatch } from '@/lib/sitemap-servers';

// Never scan Supabase during build, including unadvertised future shards.
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET() {
  return serveSitemap(() => getServersSitemapBatch(8));
}
