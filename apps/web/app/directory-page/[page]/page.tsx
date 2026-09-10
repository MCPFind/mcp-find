import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SITE_NAME, SITE_URL } from '@mcpfind/shared';
import { renderServers } from '@/components/servers-directory';

export const revalidate = 3600;
export const maxDuration = 15;
export const metadata: Metadata = {
  title: `Browse MCP Servers | ${SITE_NAME}`,
  alternates: { canonical: `${SITE_URL}/servers` },
};
export const dynamicParams = true;
export function generateStaticParams() { return []; }
export default async function DirectoryPage({ params }: { params: { page: string } }) {
  if (!/^\d+$/.test(params.page) || Number(params.page) < 2 || Number(params.page) > 100) notFound();
  return renderServers({ page: params.page });
}
