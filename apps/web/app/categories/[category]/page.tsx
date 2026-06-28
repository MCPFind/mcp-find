import { getServersByCategory, getCategoryCount } from '@/lib/queries';
import { generateCategoryMetadata, generateCategoryJsonLd } from '@/lib/metadata';
import { getQualityStatus } from '@/lib/quality-status';
import { safeJsonLd } from '@/lib/json-ld';
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, CATEGORY_FAQS } from '@mcpfind/shared';
import type { Category } from '@mcpfind/shared';
import { CategoryFaq } from '@/components/ui/category-faq';
import { ServerCard } from '@/components/ui/server-card';
import { Navbar } from '@/components/ui/navbar';
import { RelatedServersForCategory } from '@/components/RelatedServersForCategory';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export const revalidate = 3600;

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
  const [count, label] = await Promise.all([
    getCategoryCount(category),
    Promise.resolve(CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category),
  ]);
  return generateCategoryMetadata(category, label, count);
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!(CATEGORIES as readonly string[]).includes(category)) notFound();

  const label = CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category;
  // Fetch servers (up to 200 for display) and the true total count in parallel.
  // The true count feeds JSON-LD numberOfItems; servers feeds the card grid.
  const [servers, categoryCount] = await Promise.all([
    getServersByCategory(category),
    getCategoryCount(category),
  ]);

  // Most recent server update date — used for the visible freshness line and JSON-LD dateModified.
  const mostRecentDate = servers.reduce<string | null>((best, s) => {
    const d = s.github_last_push ?? s.registry_updated_at ?? s.updated_at;
    if (!d) return best;
    if (!best || new Date(d) > new Date(best)) return d;
    return best;
  }, null);
  const dateModified = mostRecentDate ?? new Date().toISOString().slice(0, 10);
  // Normalize to the date part first so a full ISO timestamp (e.g. "2025-03-15T18:22:00.000Z")
  // doesn't produce "...ZT12:00:00Z" → Invalid Date.  Then pin to noon UTC so a bare
  // YYYY-MM-DD string never rolls back a day under negative UTC offsets (e.g. US/Pacific).
  const dateModifiedDisplay = new Date(dateModified.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar variant="sticky" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(generateCategoryJsonLd(category, label, servers, categoryCount, dateModified)),
          }}
        />

        <div className="mb-10">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400 mb-2">
            {label} MCP Servers
          </h1>
          <p className="text-neutral-400 text-base max-w-2xl mb-2">
            {CATEGORY_DESCRIPTIONS[category as Category]}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-neutral-500 text-lg">
              {categoryCount} servers in this category
            </p>
            <time
              dateTime={dateModified}
              className="text-neutral-600 text-sm"
              title="Most recent server update in this category"
            >
              Updated {dateModifiedDisplay}
            </time>
          </div>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 list-none p-0 m-0">
          {servers.map((server) => (
            // explicit role: display:contents can strip implicit listitem in some ATs
            <li key={server.id} className="contents" role="listitem">
              <ServerCard server={server} qualityStatus={getQualityStatus(server.slug)} />
            </li>
          ))}
        </ul>

        <CategoryFaq
          categoryLabel={label}
          faqs={CATEGORY_FAQS[category as Category] || []}
        />

        {/* Related servers block — all statuses, degraded cards visually muted */}
        <RelatedServersForCategory
          category={category}
          includeDegraded={true}
          limit={8}
        />
      </main>
    </div>
  );
}
