import { getServersSitemapBatch } from '@/lib/sitemap-servers';

export const revalidate = 3600;
export const maxDuration = 15;

export async function GET() {
  return getServersSitemapBatch(7);
}
