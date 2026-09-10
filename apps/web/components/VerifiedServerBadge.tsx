"use client";
/**
 * VerifiedServerBadge — renders an informative badge when a server's
 * quality_status is "HEALTHY" (maintained within 12 months, has stars, README).
 *
 * Hard rules:
 * - All text via React children — NEVER dangerouslySetInnerHTML
 * - Accessible: icon + text (not color-only); aria-label on tooltip trigger
 * - Matches mcpfind dark brand palette (green/positive tones)
 * - prefers-reduced-motion: tooltip does not animate when motion is reduced
 * - Mutually exclusive with StaleServerBadge — HEALTHY ≠ STALE by definition
 */

import { useState, useCallback, useId } from "react";
import { IconShieldCheckFilled } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { QualityStatus } from "@mcpfind/shared";

interface VerifiedServerBadgeProps {
  /** The server's quality_status from the audit manifest. */
  qualityStatus: QualityStatus | undefined;
  /** Optional extra className on the wrapper. */
  className?: string;
}

export const TOOLTIP_TEXT =
  "Documentation and repository signals recorded in the May 2026 audit. This is not a live availability, installation, or security check.";

export function VerifiedServerBadge({ qualityStatus, className }: VerifiedServerBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  // Unique id per instance (React 18 useId) — fixes duplicate DOM id WCAG violation
  const tooltipId = useId();

  const showTooltip = useCallback(() => setTooltipVisible(true), []);
  const hideTooltip = useCallback(() => setTooltipVisible(false), []);

  // Only render for HEALTHY entries
  if (qualityStatus !== "HEALTHY") return null;

  return (
    // `relative` so tooltip top/left positions against this wrapper, not a distant ancestor
    <div className={cn("relative inline-flex items-center", className)}>
      {/* Badge trigger — accessible button so keyboard users can access tooltip */}
      <button
        type="button"
        className={cn(
          "relative inline-flex items-center gap-1.5 text-xs font-medium",
          "px-2.5 py-1 rounded-full",
          "bg-green-500/10 text-green-400 border border-green-500/20",
          "hover:bg-green-500/20 hover:border-green-500/30 transition-colors duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          "cursor-default"
        )}
        aria-label={TOOLTIP_TEXT}
        aria-describedby={tooltipId}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        <IconShieldCheckFilled size={12} aria-hidden="true" />
        <span>Documented · May 2026</span>
      </button>

      {/* Tooltip — text-only, no dangerouslySetInnerHTML */}
      {tooltipVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={cn(
            "absolute z-50 max-w-xs",
            "px-3 py-2 rounded-lg text-xs leading-relaxed",
            "bg-neutral-800 text-neutral-200 border border-neutral-700 shadow-lg shadow-black/40",
            // Respect reduced-motion preference via Tailwind (no transform animation)
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-100"
          )}
          style={{ top: "100%", left: 0, marginTop: "6px", position: "absolute" }}
        >
          {/* Plain text content — never dangerouslySetInnerHTML */}
          {TOOLTIP_TEXT}
        </div>
      )}
    </div>
  );
}
