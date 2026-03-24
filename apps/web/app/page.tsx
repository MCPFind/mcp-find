import { safeJsonLd } from '@/lib/json-ld';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">MCP Find</h1>
      <p className="mt-4 text-lg text-gray-600">
        The open-source way to find MCP servers.
      </p>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'MCP Find',
            url: 'https://mcpfind.org',
            description: 'Open-source directory of MCP servers. AI-agent optimized. Get instant install configs for Claude Desktop, Cursor, VS Code, Windsurf, and Claude Code.',
            publisher: {
              '@type': 'Organization',
              name: 'MCP Find',
              url: 'https://mcpfind.org',
            },
          }),
        }}
      />
    </main>
  );
}
