"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { IconCheck } from "@tabler/icons-react";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterCheckboxGroupProps {
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  showMoreThreshold?: number;
}

export function FilterCheckboxGroup({
  options,
  selected,
  onChange,
  showMoreThreshold = 8,
}: FilterCheckboxGroupProps) {
  const [showAll, setShowAll] = useState(false);
  const visibleOptions =
    showAll || options.length <= showMoreThreshold
      ? options
      : options.slice(0, showMoreThreshold);
  const hiddenCount = options.length - showMoreThreshold;

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="space-y-0.5">
      {visibleOptions.map((option) => {
        const isSelected = selected.includes(option.value);
        return (
          <button
            key={option.value}
            onClick={() => toggle(option.value)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors duration-200",
              isSelected
                ? "text-blue-300"
                : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            )}
          >
            <span
              className={cn(
                "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors duration-200",
                isSelected
                  ? "bg-blue-600 border-blue-500"
                  : "border-neutral-600"
              )}
            >
              {isSelected && <IconCheck size={10} className="text-white" />}
            </span>
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full text-left px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors duration-200"
        >
          {showAll ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
