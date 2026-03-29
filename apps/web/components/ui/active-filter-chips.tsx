"use client";

import { IconX } from "@tabler/icons-react";
import { CATEGORY_LABELS } from "@mcpfind/shared";
import type { Category } from "@mcpfind/shared";
import type { ParsedFilters } from "@/lib/filter-utils";
import { PACKAGE_TYPE_LABELS } from "@/lib/filter-utils";

interface ActiveFilterChipsProps {
  filters: ParsedFilters;
  onRemove: (key: string, value?: string) => void;
  onClearAll: () => void;
}

interface Chip {
  key: string;
  value?: string;
  label: string;
}

export function ActiveFilterChips({
  filters,
  onRemove,
  onClearAll,
}: ActiveFilterChipsProps) {
  const chips: Chip[] = [];

  if (filters.category) {
    chips.push({
      key: "category",
      label: CATEGORY_LABELS[filters.category as Category],
    });
  }
  for (const pkg of filters.packageTypes) {
    chips.push({
      key: "packageTypes",
      value: pkg,
      label: PACKAGE_TYPE_LABELS[pkg as keyof typeof PACKAGE_TYPE_LABELS] ?? pkg,
    });
  }
  for (const lang of filters.languages) {
    chips.push({ key: "languages", value: lang, label: lang });
  }
  if (filters.hasTools)
    chips.push({ key: "hasTools", label: "Has Tools" });
  if (filters.hasResources)
    chips.push({ key: "hasResources", label: "Has Resources" });
  if (filters.hasPrompts)
    chips.push({ key: "hasPrompts", label: "Has Prompts" });
  if (filters.isOfficial)
    chips.push({ key: "isOfficial", label: "Official" });
  if (filters.featured)
    chips.push({ key: "featured", label: "Featured" });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {chips.map((chip) => (
        <button
          key={`${chip.key}-${chip.value ?? ""}`}
          onClick={() => onRemove(chip.key, chip.value)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 hover:border-neutral-600 hover:text-white transition-colors duration-200 group"
        >
          {chip.label}
          <IconX
            size={12}
            className="text-neutral-500 group-hover:text-neutral-300 transition-colors"
          />
        </button>
      ))}
      {chips.length >= 2 && (
        <button
          onClick={onClearAll}
          className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 transition-colors duration-200"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
