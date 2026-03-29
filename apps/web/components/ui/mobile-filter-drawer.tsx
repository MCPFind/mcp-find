"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { IconX } from "@tabler/icons-react";

interface MobileFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: () => void;
  onClear: () => void;
  activeCount: number;
  children: React.ReactNode;
}

export function MobileFilterDrawer({
  isOpen,
  onClose,
  onApply,
  onClear,
  activeCount,
  children,
}: MobileFilterDrawerProps) {
  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 sm:hidden",
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-neutral-900 rounded-t-2xl transition-transform duration-300 ease-out sm:hidden",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
        style={{ maxHeight: "80vh" }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-neutral-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">Filters</h2>
            {activeCount > 0 && (
              <span className="bg-blue-500 text-white text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Filter content */}
        <div className="overflow-y-auto px-5 py-4 space-y-6" style={{ maxHeight: "calc(80vh - 140px)" }}>
          {children}
        </div>

        {/* Sticky footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-neutral-800 bg-neutral-900">
          <button
            onClick={onClear}
            className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 text-sm font-medium hover:bg-neutral-800 transition-colors"
          >
            Clear all
          </button>
          <button
            onClick={onApply}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
          >
            Show results
          </button>
        </div>
      </div>
    </>
  );
}
