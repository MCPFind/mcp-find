import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@mcpfind/shared';
import { renderServers } from '@/components/servers-directory';

export const maxDuration = 15;
export const revalidate = 3600;
export const metadata: Metadata = {
  title: `Browse MCP Servers | ${SITE_NAME}`,
  description: 'Search and filter MCP servers and find setup instructions for your AI client.',
  alternates: { canonical: `${SITE_URL}/servers` },
};

// Never read searchParams here: the canonical directory must remain ISR.
export default async function ServersPage() {
  return renderServers({});
}
