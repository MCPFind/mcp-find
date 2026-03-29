"use client";

import { cn } from "@/lib/utils";

interface FilterToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function FilterToggle({ label, checked, onChange }: FilterToggleProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors duration-200",
        checked
          ? "text-blue-300"
          : "text-neutral-400 hover:text-white hover:bg-neutral-900"
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative w-8 h-[18px] rounded-full transition-colors duration-200 shrink-0",
          checked ? "bg-blue-600" : "bg-neutral-700"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200",
            checked ? "translate-x-[14px]" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
}
