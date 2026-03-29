import { CATEGORIES } from "@mcpfind/shared";
import type { Category, PackageType, SortOption } from "@mcpfind/shared";

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

  const languages = searchParams.lang?.split(",").filter(Boolean) ?? [];

  return {
    q: searchParams.q ?? "",
    category: validCategory,
    packageTypes,
    languages,
    hasTools: searchParams.tools === "1",
    hasResources: searchParams.resources === "1",
    hasPrompts: searchParams.prompts === "1",
    isOfficial: searchParams.official === "1",
    featured: searchParams.featured === "1",
    sort: validSort,
    page: searchParams.page ? parseInt(searchParams.page, 10) : 1,
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
