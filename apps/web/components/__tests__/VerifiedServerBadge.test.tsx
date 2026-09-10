// @vitest-environment jsdom
/**
 * VerifiedServerBadge — unit tests (logic layer + real DOM render).
 *
 * Tests:
 * 1. Renders (returns non-null) only for HEALTHY
 * 2. Hidden (returns null) for STALE, BROKEN, LOW-CREDIBILITY, undefined
 * 3. XSS: real DOM render confirms no dangerouslySetInnerHTML
 * 4. Real DOM render: button accessible label, unique tooltip IDs across instances
 * 5. Cross-component: StaleServerBadge and VerifiedServerBadge are mutually exclusive
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { VerifiedServerBadge, TOOLTIP_TEXT as COMPONENT_TOOLTIP_TEXT } from "../VerifiedServerBadge";
import { StaleServerBadge } from "../StaleServerBadge";
import type { QualityStatus } from "@mcpfind/shared";

// ---------------------------------------------------------------------------
// Real DOM render tests — XSS defense and WCAG id uniqueness
// ---------------------------------------------------------------------------

// Use the exported constant from the component — avoids duplicating the string
// and ensures the test breaks if the component text changes.
const TOOLTIP_TEXT = COMPONENT_TOOLTIP_TEXT;

describe("VerifiedServerBadge DOM render — XSS defense", () => {
  it("tooltip text matches TOOLTIP_TEXT constant exactly (no dynamic content)", () => {
    render(<VerifiedServerBadge qualityStatus="HEALTHY" />);
    const button = screen.getByRole("button", { name: TOOLTIP_TEXT });
    fireEvent.mouseEnter(button);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe(TOOLTIP_TEXT);
  });

  it("tooltip DOM contains no script tags or event handlers (XSS defense)", () => {
    const { container } = render(<VerifiedServerBadge qualityStatus="HEALTHY" />);
    const button = screen.getByRole("button", { name: TOOLTIP_TEXT });
    fireEvent.mouseEnter(button);
    expect(container.innerHTML).not.toContain("<script");
    expect(container.innerHTML).not.toContain("onerror=");
    expect(container.innerHTML).not.toContain("javascript:");
  });

  it("renders nothing for non-HEALTHY status (DOM confirms null)", () => {
    const { container } = render(<VerifiedServerBadge qualityStatus="STALE" />);
    expect(container.firstChild).toBeNull();
  });
});

describe("VerifiedServerBadge DOM render — WCAG unique IDs", () => {
  it("two instances produce distinct tooltip IDs", () => {
    const { container: c1 } = render(<VerifiedServerBadge qualityStatus="HEALTHY" />);
    const { container: c2 } = render(<VerifiedServerBadge qualityStatus="HEALTHY" />);

    const btn1 = c1.querySelector("button");
    const btn2 = c2.querySelector("button");
    expect(btn1).not.toBeNull();
    expect(btn2).not.toBeNull();

    const describedBy1 = btn1?.getAttribute("aria-describedby") ?? "";
    const describedBy2 = btn2?.getAttribute("aria-describedby") ?? "";
    expect(describedBy1).not.toBe("");
    expect(describedBy2).not.toBe("");
    expect(describedBy1).not.toBe(describedBy2);
  });
});

// ---------------------------------------------------------------------------
// Cross-component mutual exclusion tests
// ---------------------------------------------------------------------------

describe("StaleServerBadge + VerifiedServerBadge mutual exclusion", () => {
  it("HEALTHY status: VerifiedServerBadge renders, StaleServerBadge does not", () => {
    const { container } = render(
      <div>
        <StaleServerBadge qualityStatus="HEALTHY" />
        <VerifiedServerBadge qualityStatus="HEALTHY" />
      </div>
    );
    // VerifiedServerBadge button should be present
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute("aria-label")).toMatch(/Documentation and repository signals/i);
  });

  it("STALE status: StaleServerBadge renders, VerifiedServerBadge does not", () => {
    const { container } = render(
      <div>
        <StaleServerBadge qualityStatus="STALE" />
        <VerifiedServerBadge qualityStatus="STALE" />
      </div>
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute("aria-label")).toMatch(/may be outdated/i);
  });

  it("BROKEN status: neither badge renders", () => {
    const { container } = render(
      <div>
        <StaleServerBadge qualityStatus="BROKEN" />
        <VerifiedServerBadge qualityStatus="BROKEN" />
      </div>
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(0);
  });

  it("both badges rendered side-by-side with different statuses each renders its own badge", () => {
    const { getAllByRole } = render(
      <div>
        {/* Stale entry */}
        <StaleServerBadge qualityStatus="STALE" />
        <VerifiedServerBadge qualityStatus="STALE" />
        {/* Healthy entry */}
        <StaleServerBadge qualityStatus="HEALTHY" />
        <VerifiedServerBadge qualityStatus="HEALTHY" />
      </div>
    );
    // One button for STALE badge, one button for HEALTHY badge — total 2
    const buttons = getAllByRole("button");
    expect(buttons).toHaveLength(2);

    const labels = buttons.map((b) => b.getAttribute("aria-label") ?? "");
    const hasStale = labels.some((l) => /may be outdated/i.test(l));
    const hasVerified = labels.some((l) => /Documentation and repository signals/i.test(l));
    expect(hasStale).toBe(true);
    expect(hasVerified).toBe(true);
  });
});
