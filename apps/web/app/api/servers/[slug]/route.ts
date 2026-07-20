import { NextRequest, NextResponse } from 'next/server';
import { getServerBySlug } from '@/lib/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
  }

  const server = await getServerBySlug(slug);
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }
  // CDN cache: matches getServerBySlug's own 7-day unstable_cache window
  // (see lib/queries.ts) so repeat requests for the same slug are served
  // from Vercel's edge without invoking this function or touching Supabase.
  return NextResponse.json(server, {
    headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400' },
  });
}
