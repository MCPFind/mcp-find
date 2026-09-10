import { CATEGORIES } from "@mcpfind/shared";
import type { Category, PackageType, SortOption, ServerListParams } from "@mcpfind/shared";

const SORT_ALLOWLIST = ["stars", "updated", "name", "downloads"] as const;
const PACKAGE_TYPE_ALLOWLIST = ["npm", "pypi", "docker", "other"] as const;

export interface ParsedFilters {
  q: string;
  category: Category | "";
  packageTypes: PackageType[];
  languages: string[];
  hasTools: boolean;
  hasResources: boolean;
  hasPrompts: boolean;
  isOfficial: boolean;
  featured: boolean;
  sort: SortOption;
  page: number;
}

export function parseFilterParams(
  searchParams: Record<string, string | undefined>
): ParsedFilters {
  const rawCategory = searchParams.category;
  const validCategory: Category | "" =
    rawCategory && (CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as Category)
      : "";

  const rawSort = searchParams.sort;
  const validSort: SortOption =
    rawSort && (SORT_ALLOWLIST as readonly string[]).includes(rawSort)
      ? (rawSort as SortOption)
      : "stars";

  const packageTypes = (searchParams.pkg?.split(",").filter(Boolean) ?? []).filter(
    (v): v is PackageType =>
      (PACKAGE_TYPE_ALLOWLIST as readonly string[]).includes(v)
  );

  const languages = [...new Set(searchParams.lang?.split(",").filter(
    value => (KNOWN_LANGUAGES as readonly string[]).includes(value)
  ) ?? [])].sort();

  return {
    q: (searchParams.q ?? "").trim().replace(/\s+/g, " ").slice(0, 120),
    category: validCategory,
    packageTypes: [...new Set(packageTypes)].sort(),
    languages,
    hasTools: searchParams.tools === "1",
    hasResources: searchParams.resources === "1",
    hasPrompts: searchParams.prompts === "1",
    isOfficial: searchParams.official === "1",
    featured: searchParams.featured === "1",
    sort: validSort,
    page: Math.min(100, Math.max(1, Number(searchParams.page) || 1)) | 0,
  };
}

export function buildFilterUrl(filters: Partial<ParsedFilters>): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.packageTypes?.length)
    params.set("pkg", filters.packageTypes.join(","));
  if (filters.languages?.length)
    params.set("lang", filters.languages.join(","));
  if (filters.hasTools) params.set("tools", "1");
  if (filters.hasResources) params.set("resources", "1");
  if (filters.hasPrompts) params.set("prompts", "1");
  if (filters.isOfficial) params.set("official", "1");
  if (filters.featured) params.set("featured", "1");
  if (filters.sort && filters.sort !== "stars")
    params.set("sort", filters.sort);
  // page intentionally omitted — resets to 1 on filter change
  return `/servers${params.toString() ? `?${params.toString()}` : ""}`;
}

// Known languages ordered by popularity in the MCP ecosystem
export const KNOWN_LANGUAGES = [
  "TypeScript",
  "Python",
  "JavaScript",
  "Go",
  "Rust",
  "Java",
  "C#",
  "Ruby",
  "Kotlin",
  "Swift",
  "PHP",
  "C++",
  "Dart",
  "Elixir",
  "Scala",
] as const;

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  npm: "npm",
  pypi: "PyPI",
  docker: "Docker",
  other: "Other",
};

export function getActiveFilterCount(filters: ParsedFilters): number {
  let count = 0;
  if (filters.category) count++;
  count += filters.packageTypes.length;
  count += filters.languages.length;
  if (filters.hasTools) count++;
  if (filters.hasResources) count++;
  if (filters.hasPrompts) count++;
  if (filters.isOfficial) count++;
  if (filters.featured) count++;
  return count;
}

/** One canonical cache key shape for every caller, including the public API. */
export function normalizeListParams(params: ServerListParams): ServerListParams {
  const filters = parseFilterParams({
    q: params.q, category: params.category, sort: params.sort,
    page: String(params.page ?? 1), pkg: params.packageTypes?.join(','),
    lang: params.languages?.join(','), tools: params.hasTools ? '1' : undefined,
    resources: params.hasResources ? '1' : undefined,
    prompts: params.hasPrompts ? '1' : undefined,
    official: params.isOfficial ? '1' : undefined, featured: params.featured ? '1' : undefined,
  });
  return {
    ...filters, category: filters.category || undefined,
    limit: Math.min(100, Math.max(1, Math.floor(params.limit || 24))),
    status: params.status === 'deprecated' ? 'deprecated' : 'active',
  };
}
