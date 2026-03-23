import { getServerBySlug, getTopServers } from '@/lib/queries';
import { generateServerMetadata, generateServerJsonLd } from '@/lib/metadata';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export const revalidate = 86400; // ISR: 24 hours

export async function generateStaticParams() {
  // Skip pre-building if Supabase credentials are not available (e.g., CI without secrets).
  // All slugs will be rendered on-demand with ISR.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return [];
  }
  const topServers = await getTopServers(200);
  return topServers.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const server = await getServerBySlug(slug);
  if (!server) return { title: 'Server Not Found' };
  return generateServerMetadata(server);
}

export default async function ServerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const server = await getServerBySlug(slug);
  if (!server) notFound();

  return (
    <main className="min-h-screen p-8">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateServerJsonLd(server)),
        }}
      />

      {/* TODO: Adam — Server header with name, description, trust signals */}
      <h1 className="text-3xl font-bold">{server.name}</h1>
      <p className="text-gray-600 mt-2">{server.description}</p>

      {/* TODO: Adam — TrustSignals component */}
      <div className="flex gap-4 mt-4 text-sm text-gray-500">
        <span>&#9733; {server.github_stars}</span>
        <span>{server.github_license || 'No license'}</span>
        <span>{server.category}</span>
        {server.is_official && <span className="text-green-600 font-semibold">Official</span>}
      </div>

      {/* TODO: Adam — ConfigSnippet component (client component, tabbed) */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Install</h2>
        <p className="text-gray-500">Config snippet generator goes here (5 client tabs)</p>
      </section>

      {/* TODO: Adam — ToolSchema component */}
      {server.tools.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Tools ({server.tools.length})</h2>
          {server.tools.map((tool) => (
            <div key={tool.id} className="border p-3 rounded mb-2">
              <h3 className="font-mono font-semibold">{tool.tool_name}</h3>
              <p className="text-sm text-gray-600">{tool.tool_description}</p>
            </div>
          ))}
        </section>
      )}

      {/* TODO: Adam — README rendering (markdown to HTML) */}
      {server.readme_content && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-4">README</h2>
          <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded overflow-auto max-h-96">
            {server.readme_content.slice(0, 5000)}
          </pre>
        </section>
      )}

      {/* TODO: Adam — Sidebar with GitHub stats, package info */}
    </main>
  );
}
