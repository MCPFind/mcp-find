import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@mcpfind/shared';
import { renderServers } from '@/components/servers-directory';

export const metadata: Metadata = {
  title: `Browse MCP Servers | ${SITE_NAME}`,
  description: 'Search and filter MCP servers and find setup instructions for your AI client.',
  alternates: { canonical: `${SITE_URL}/servers` },
};

// The directory-root entry point supplies ISR; query variants route separately.
export default async function ServersPage() {
  return renderServers({});
}
