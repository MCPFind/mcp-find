/**
 * RelatedServersForCategory — Server Component
 *
 * Renders a "Related MCP servers in [category]" aside block. Supports two
 * contexts:
 *   - Blog post embed (default): HEALTHY entries only, aside with border-top.
 *   - Category page block: all statuses, degraded cards visually muted.
 *
 * Props:
 *   category        — slug of the category (e.g. "developer-tools")
 *   currentSlug?    — slug to exclude (self-exclusion on server detail pages)
 *   includeDegraded — when true, STALE and BROKEN servers are included with
 *                     visual muting; default false (blog context)
 *   limit?          — max cards to display (default 6)
 *
 * This is intentionally a Server Component so it renders at build/request
 * time with no client-side JS overhead. All data fetching is SSR-only.
 * Emits data-conversion attributes for GA4 funnel tracking.
 *
 * Indexing-recovery Slice 4: the candidate pool is sourced from
 * getIndexableServersByCategory(), which is pre-filtered to isIndexable()
 * (Slice 2's quality gate) — this block must NEVER link a non-gated/thin
 * server, regardless of includeDegraded. The separate quality_status
 * manifest (STALE/BROKEN/HEALTHY) is layered on top purely for visual
 * muting within the already-gated pool, not as the base filter.
 */

import Link from "next/link";
import { IconServer, IconArrowRight } from "@tabler/icons-react";
import { getIndexableServersByCategory } from "@/lib/queries";
import { getQualityStatus } from "@/lib/quality-status";
import { ServerCard } from "@/components/ui/server-card";
import { CATEGORY_LABELS } from "@mcpfind/shared";
import type { Category } from "@mcpfind/shared";

interface RelatedServersForCategoryProps {
  /** Category slug (e.g. "developer-tools"). */
  category: string;
  /** Slug of the current page's server — excluded from results. */
  currentSlug?: string;
  /**
   * When true, STALE and BROKEN servers are included with visual muting.
   * Use in category page context. Default false (blog post context = HEALTHY only).
   */
  includeDegraded?: boolean;
  /** Maximum number of cards to display. Default 6. */
  limit?: number;
}

/** Sort order for quality_status: HEALTHY first, STALE second, BROKEN last. */
const STATUS_ORDER = { HEALTHY: 0, STALE: 1, BROKEN: 2, "LOW-CREDIBILITY": 3 } as const;

export async function RelatedServersForCategory({
  category,
  currentSlug,
  includeDegraded = false,
  limit = 6,
}: RelatedServersForCategoryProps) {
  // Guard: absent category → render nothing.
  if (!category) return null;

  // Guard: degrade gracefully when Supabase credentials are absent (CI / static builds).
  // getIndexableServersByCategory() is pre-filtered to isIndexable() — every
  // row here has already cleared Slice 2's quality gate.
  let allServers;
  try {
    allServers = await getIndexableServersByCategory(category);
  } catch {
    return null;
  }

  // Build status map — one getQualityStatus call per server (avoids 2N lookups).
  // This is the separate manifest-driven visual-muting gate, layered on top
  // of the already-isIndexable()-gated pool from allServers.
  const statusMap = new Map(allServers.map((s) => [s.slug, getQualityStatus(s.slug)]));

  // Filter candidates: correct category (defensive — query is already
  // category-scoped), not self, and (when includeDegraded is false) the
  // manifest status gate. The isIndexable() gate itself was already applied
  // by getIndexableServersByCategory(), so it is never re-checked here.
  const candidates = allServers.filter((server) => {
    if (server.category !== category) return false;
    if (currentSlug && server.slug === currentSlug) return false;
    const status = statusMap.get(server.slug);
    if (!includeDegraded) {
      return status === "HEALTHY";
    }
    // includeDegraded: include all manifest statuses (undefined treated as available)
    return true;
  });

  // Sort: HEALTHY first, STALE second, BROKEN last; then by stars descending.
  candidates.sort((a, b) => {
    const aStatus = statusMap.get(a.slug) ?? "LOW-CREDIBILITY";
    const bStatus = statusMap.get(b.slug) ?? "LOW-CREDIBILITY";
    const orderDiff =
      (STATUS_ORDER[aStatus] ?? 99) - (STATUS_ORDER[bStatus] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return b.github_stars - a.github_stars;
  });

  const servers = candidates.slice(0, limit);

  // Empty state — do not render a hollow section.
  if (servers.length === 0) return null;

  const categoryLabel = CATEGORY_LABELS[category as Category] ?? category;
  const totalCount = candidates.length;

  return (
    <aside
      aria-labelledby={`related-servers-${category}`}
      className="mt-12 border-t border-neutral-800 pt-10"
    >
      <h2
        id={`related-servers-${category}`}
        className="text-xl font-bold text-white mb-6 flex items-center gap-2"
      >
        <IconServer size={18} className="text-blue-400" aria-hidden="true" />
        Related MCP servers in {categoryLabel}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {servers.map((server) => {
          const status = statusMap.get(server.slug);
          const isStale = status === "STALE";
          const isBroken = status === "BROKEN";

          // Opacity wrapper for degraded cards — applied to wrapper div, not
          // the Link inside ServerCard, so pointer events remain active.
          const wrapperOpacity = isBroken
            ? "opacity-50"
            : isStale
              ? "opacity-70"
              : undefined;

          return (
            <div
              key={server.slug}
              className={wrapperOpacity}
              data-conversion="blog_to_servers_click"
              data-source={currentSlug ?? ""}
              data-target={server.slug}
              data-category={category}
              data-status={status ?? "unknown"}
            >
              <ServerCard server={server} qualityStatus={status} />
            </div>
          );
        })}
      </div>

      {totalCount > limit && (
        <div className="mt-6">
          <Link
            href={`/categories/${category}`}
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Browse all {totalCount} {categoryLabel} servers
            <IconArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
    </aside>
  );
}
