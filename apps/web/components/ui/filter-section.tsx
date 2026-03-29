"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { IconChevronDown } from "@tabler/icons-react";

interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  activeCount?: number;
  children: React.ReactNode;
}

export function FilterSection({
  title,
  defaultOpen = true,
  activeCount = 0,
  children,
}: FilterSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider group-hover:text-neutral-300 transition-colors">
            {title}
          </h3>
          {activeCount > 0 && (
            <span className="bg-blue-500 text-white text-[10px] font-medium rounded-full w-4 h-4 flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </div>
        <IconChevronDown
          size={14}
          className={cn(
            "text-neutral-600 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  );
}
