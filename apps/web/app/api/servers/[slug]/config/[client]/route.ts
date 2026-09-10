import { NextRequest, NextResponse } from 'next/server';
import { getServerBySlug } from '@/lib/queries';
import { generateConfig } from '@mcpfind/shared';
import type { ClientType, PackageType } from '@mcpfind/shared';

const VALID_CLIENTS: ClientType[] = ['claude-desktop', 'cursor', 'vscode', 'windsurf', 'claude-code'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; client: string }> }
) {
  const { slug, client } = await params;

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
  }

  if (!VALID_CLIENTS.includes(client as ClientType)) {
    return NextResponse.json({ error: 'Invalid client' }, { status: 400 });
  }

  let server;
  try {
    server = await getServerBySlug(slug);
  } catch {
    return NextResponse.json(
      { error: 'Server data temporarily unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } }
    );
  }
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  if (!server.package_name?.trim() || !server.package_type || !['npm', 'pypi', 'docker'].includes(server.package_type)) {
    return NextResponse.json({ error: 'No supported local configuration; use the maintainer documentation' }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
  }

  const config = generateConfig(
    {
      slug: server.slug,
      packageName: server.package_name.trim(),
      packageType: server.package_type as PackageType,
    },
    client as ClientType
  );

  // CDN cache: same rationale as /api/servers/[slug] — this is derived
  // entirely from the same 7-day-cached server row, so it's safe to cache
  // at the same window.
  return NextResponse.json(config, {
    headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400' },
  });
}
