import { NextRequest, NextResponse } from 'next/server';
import { getServerBySlug } from '@/lib/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const server = await getServerBySlug(slug);
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }
  return NextResponse.json(server);
}
