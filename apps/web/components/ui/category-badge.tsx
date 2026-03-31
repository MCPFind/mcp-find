import { cn } from "@/lib/utils";
import { CATEGORY_LABELS } from "@mcpfind/shared";
import type { Category } from "@mcpfind/shared";

const categoryColors: Record<string, string> = {
  databases: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  devtools: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  filesystems: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  search: "bg-green-500/10 text-green-400 border-green-500/20",
  communication: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  "ai-ml": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  cloud: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  finance: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  crm: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  productivity: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  monitoring: "bg-red-500/10 text-red-400 border-red-500/20",
  security: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  testing: "bg-lime-500/10 text-lime-400 border-lime-500/20",
  analytics: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  automation: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  media: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
  documentation: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  social: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  ecommerce: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  maps: "bg-stone-500/10 text-stone-400 border-stone-500/20",
  other: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
};

interface CategoryBadgeProps {
  category: string | null;
  className?: string;
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  if (!category) return null;

  const colorClass =
    categoryColors[category] ||
    "bg-neutral-500/10 text-neutral-400 border-neutral-500/20";

  const label =
    CATEGORY_LABELS[category as Category] ||
    category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}
