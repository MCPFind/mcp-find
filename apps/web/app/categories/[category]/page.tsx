import { getServersByCategory } from '@/lib/queries';
import { generateCategoryMetadata, generateCategoryJsonLd } from '@/lib/metadata';
import { safeJsonLd } from '@/lib/json-ld';
import { CATEGORIES, CATEGORY_LABELS } from '@mcpfind/shared';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';

export function generateStaticParams() {
  // Skip pre-building static category pages when Supabase credentials are absent (e.g., CI).
  // Pages will be rendered on-demand at runtime.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return [];
  }
  return CATEGORIES.map((cat) => ({ category: cat }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  if (!(CATEGORIES as readonly string[]).includes(category)) return { title: 'Category Not Found' };
  const servers = await getServersByCategory(category);
  const label = CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category;
  return generateCategoryMetadata(category, label, servers.length);
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!(CATEGORIES as readonly string[]).includes(category)) notFound();

  const label = CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category;
  const servers = await getServersByCategory(category);

  return (
    <main className="min-h-screen p-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(generateCategoryJsonLd(category, label, servers)),
        }}
      />

      <h1 className="text-3xl font-bold">{label} MCP Servers</h1>
      <p className="text-gray-600 mt-2">{servers.length} servers in this category</p>

      {/* TODO: Adam — Reuse ServerCard grid from /servers page */}
      <div className="grid gap-4 mt-8">
        {servers.map((server) => (
          <div key={server.id} className="border p-4 rounded">
            <Link href={`/servers/${server.slug}`} className="text-lg font-semibold hover:underline">
              {server.name}
            </Link>
            <p className="text-gray-600 text-sm mt-1">{server.description}</p>
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <span>&#9733; {server.github_stars}</span>
              <span>{server.github_license}</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
