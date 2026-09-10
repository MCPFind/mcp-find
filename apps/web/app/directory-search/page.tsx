import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@mcpfind/shared';
import { renderServers } from '@/components/servers-directory';

export const maxDuration = 15;
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: `Search MCP Servers | ${SITE_NAME}`,
  alternates: { canonical: `${SITE_URL}/servers` },
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: {
  searchParams: Record<string, string | undefined>;
}) {
  return renderServers(searchParams);
}
