"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { SearchBar } from "./search-bar";
import { FilterSection } from "./filter-section";
import { FilterCheckboxGroup } from "./filter-checkbox-group";
import { ActiveFilterChips } from "./active-filter-chips";
import { MobileFilterDrawer } from "./mobile-filter-drawer";
import { cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_LABELS } from "@mcpfind/shared";
import type { Category, SortOption } from "@mcpfind/shared";
import { IconChevronDown, IconFilter } from "@tabler/icons-react";
import {
  buildFilterUrl,
  getActiveFilterCount,
  KNOWN_LANGUAGES,
  type ParsedFilters,
} from "@/lib/filter-utils";

interface ServersFiltersProps {
  initialFilters: ParsedFilters;
  totalCount: number;
  children: React.ReactNode;
}

const LANGUAGE_OPTIONS = KNOWN_LANGUAGES.map((v) => ({
  value: v,
  label: v,
}));

export function ServersFilters({
  initialFilters,
  totalCount,
  children,
}: ServersFiltersProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<ParsedFilters>(initialFilters);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  // Mobile drawer uses local state that only applies on "Show results"
  const [mobileFilters, setMobileFilters] = useState<ParsedFilters>(initialFilters);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const navigate = useCallback(
    (newFilters: ParsedFilters) => {
      router.push(buildFilterUrl(newFilters));
    },
    [router]
  );

  // Debounced navigation on desktop filter changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate(filters);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters, navigate]);

  // Sync mobile filters when drawer opens
  const openMobileDrawer = () => {
    setMobileFilters(filters);
    setShowMobileDrawer(true);
  };

  const applyMobileFilters = () => {
    setFilters(mobileFilters);
    setShowMobileDrawer(false);
  };

  const clearAllFilters = () => {
    const cleared: ParsedFilters = {
      q: filters.q, // preserve search
      category: "",
      packageTypes: [],
      languages: [],
      hasTools: false,
      hasResources: false,
      hasPrompts: false,
      isOfficial: false,
      featured: false,
      sort: filters.sort, // preserve sort
      page: 1,
    };
    setFilters(cleared);
  };

  const clearAllMobileFilters = () => {
    setMobileFilters({
      ...mobileFilters,
      category: "",
      packageTypes: [],
      languages: [],
      hasTools: false,
      hasResources: false,
      hasPrompts: false,
      isOfficial: false,
      featured: false,
      page: 1,
    });
  };

  const removeFilter = (key: string, value?: string) => {
    setFilters((prev) => {
      const next = { ...prev, page: 1 };
      switch (key) {
        case "category":
          next.category = "";
          break;
        case "packageTypes":
          next.packageTypes = prev.packageTypes.filter((v) => v !== value);
          break;
        case "languages":
          next.languages = prev.languages.filter((v) => v !== value);
          break;
        case "hasTools":
          next.hasTools = false;
          break;
        case "hasResources":
          next.hasResources = false;
          break;
        case "hasPrompts":
          next.hasPrompts = false;
          break;
        case "isOfficial":
          next.isOfficial = false;
          break;
        case "featured":
          next.featured = false;
          break;
      }
      return next;
    });
  };

  const updateFilter = <K extends keyof ParsedFilters>(
    key: K,
    value: ParsedFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const updateMobileFilter = <K extends keyof ParsedFilters>(
    key: K,
    value: ParsedFilters[K]
  ) => {
    setMobileFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const activeFilterCount = getActiveFilterCount(filters);
  const mobileActiveCount = getActiveFilterCount(mobileFilters);

  // Shared filter group renderer (used by both desktop sidebar and mobile drawer)
  const renderFilterGroups = (
    currentFilters: ParsedFilters,
    update: <K extends keyof ParsedFilters>(key: K, value: ParsedFilters[K]) => void
  ) => (
    <>
      {/* Category — single-select */}
      <FilterSection
        title="Category"
        activeCount={currentFilters.category ? 1 : 0}
      >
        <div className="space-y-0.5">
          <button
            onClick={() => update("category", "")}
            className={cn(
              "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors duration-200",
              !currentFilters.category
                ? "bg-blue-600/20 text-blue-300"
                : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            )}
          >
            All Categories
          </button>
          {CATEGORIES.map((cat: string) => (
            <button
              key={cat}
              onClick={() =>
                update(
                  "category",
                  currentFilters.category === cat ? "" : (cat as Category)
                )
              }
              className={cn(
                "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors duration-200",
                currentFilters.category === cat
                  ? "bg-blue-600/20 text-blue-300"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-900"
              )}
            >
              {CATEGORY_LABELS[cat as Category]}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Language — multi-select with "Show more" */}
      <FilterSection
        title="Language"
        activeCount={currentFilters.languages.length}
      >
        <FilterCheckboxGroup
          options={LANGUAGE_OPTIONS}
          selected={currentFilters.languages}
          onChange={(v) => update("languages", v)}
          showMoreThreshold={8}
        />
      </FilterSection>
    </>
  );

  return (
    <>
      {/* Search + Sort row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <SearchBar
            value={filters.q}
            onChange={(q) => updateFilter("q", q)}
            placeholder="Search servers, descriptions, or tags..."
          />
        </div>

        <div className="relative">
          <select
            value={filters.sort}
            onChange={(e) =>
              updateFilter("sort", e.target.value as SortOption)
            }
            className="appearance-none bg-neutral-900 border border-neutral-800 text-white text-sm rounded-xl px-4 py-3 pr-10 outline-none hover:border-neutral-700 focus:border-blue-500/50 transition-colors duration-200 cursor-pointer"
          >
            <option value="stars">Sort: Most Stars</option>
            <option value="downloads">Sort: Most Downloads</option>
            <option value="updated">Sort: Recently Updated</option>
            <option value="name">Sort: Name A-Z</option>
          </select>
          <IconChevronDown
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
          />
        </div>

        {/* Mobile filter button */}
        <button
          onClick={openMobileDrawer}
          className={cn(
            "flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors duration-200 sm:hidden",
            activeFilterCount > 0
              ? "bg-blue-600 border-blue-500 text-white"
              : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700"
          )}
        >
          <IconFilter size={16} />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 bg-white/20 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Active filter chips */}
      <ActiveFilterChips
        filters={filters}
        onRemove={removeFilter}
        onClearAll={clearAllFilters}
      />

      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <aside className="shrink-0 w-52 space-y-6 hidden sm:block">
          {renderFilterGroups(filters, updateFilter)}
        </aside>

        {/* Server grid — server-rendered */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* Mobile filter drawer */}
      <MobileFilterDrawer
        isOpen={showMobileDrawer}
        onClose={() => setShowMobileDrawer(false)}
        onApply={applyMobileFilters}
        onClear={clearAllMobileFilters}
        activeCount={mobileActiveCount}
      >
        {renderFilterGroups(mobileFilters, updateMobileFilter)}
      </MobileFilterDrawer>
    </>
  );
}
