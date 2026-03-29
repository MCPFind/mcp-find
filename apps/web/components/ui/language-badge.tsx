import { cn } from "@/lib/utils";

export const languageColors: Record<string, string> = {
  TypeScript: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  Python: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  Go: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  Rust: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  JavaScript: "text-yellow-300 bg-yellow-300/10 border-yellow-300/20",
};

interface LanguageBadgeProps {
  language: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function LanguageBadge({
  language,
  selected,
  onClick,
  className,
}: LanguageBadgeProps) {
  const colorClass =
    languageColors[language] ||
    "text-neutral-400 bg-neutral-800 border-neutral-700";

  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      onClick={onClick}
      className={cn(
        "text-xs px-2 py-0.5 rounded-md border font-mono",
        colorClass,
        selected && "ring-1 ring-blue-500 ring-offset-1 ring-offset-neutral-900",
        onClick && "cursor-pointer transition-all duration-200 hover:opacity-80",
        className
      )}
    >
      {language}
    </Tag>
  );
}
