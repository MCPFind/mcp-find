import { getServersByCategory } from '@/lib/queries';
import { generateCategoryMetadata, generateCategoryJsonLd } from '@/lib/metadata';
import { safeJsonLd } from '@/lib/json-ld';
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, CATEGORY_FAQS } from '@mcpfind/shared';
import type { Category } from '@mcpfind/shared';
import { CategoryFaq } from '@/components/ui/category-faq';
import { ServerCard } from '@/components/ui/server-card';
import { Navbar } from '@/components/ui/navbar';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

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
    <div className="min-h-screen bg-black text-white">
      <Navbar variant="sticky" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(generateCategoryJsonLd(category, label, servers)),
          }}
        />

        <div className="mb-10">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400 mb-2">
            {label} MCP Servers
          </h1>
          <p className="text-neutral-400 text-base max-w-2xl mb-2">
            {CATEGORY_DESCRIPTIONS[category as Category]}
          </p>
          <p className="text-neutral-500 text-lg">
            {servers.length} servers in this category
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>

        <CategoryFaq
          categoryLabel={label}
          faqs={CATEGORY_FAQS[category as Category] || []}
        />
      </main>
    </div>
  );
}
