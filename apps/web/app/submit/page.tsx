import type { Metadata } from 'next';
import { SITE_NAME, REPO_URL } from '@mcpfind/shared';

export const metadata: Metadata = {
  title: `Submit a Server | ${SITE_NAME}`,
  description: 'Submit your MCP server to the MCP Find directory.',
};

export default function SubmitPage() {
  return (
    <main className="min-h-screen p-8 flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold">Submit Your Server</h1>
      <p className="text-gray-600 mt-4 max-w-md text-center">
        Community submissions are coming in v2. For now, submit your server by opening a pull
        request that adds an entry to{' '}
        <code className="bg-gray-100 px-1 rounded">community-servers.yml</code>.
      </p>
      <a
        href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
        className="mt-6 text-blue-600 hover:underline"
      >
        Read the contributing guide &rarr;
      </a>
    </main>
  );
}
