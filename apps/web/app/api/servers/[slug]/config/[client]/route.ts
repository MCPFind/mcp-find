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

  if (!VALID_CLIENTS.includes(client as ClientType)) {
    return NextResponse.json({ error: 'Invalid client' }, { status: 400 });
  }

  const server = await getServerBySlug(slug);
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  if (!server.package_name) {
    return NextResponse.json({ error: 'Server has no package information' }, { status: 400 });
  }

  const config = generateConfig(
    {
      slug: server.slug,
      packageName: server.package_name,
      packageType: (server.package_type || 'npm') as PackageType,
    },
    client as ClientType
  );

  return NextResponse.json(config);
}
