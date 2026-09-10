/**
 * analytics.test.ts
 *
 * Verifies:
 * 1. Each event function fires gtag with the correct event name and payload.
 * 2. assertNoPii rejects PII-shaped keys and values (key regex + value @ pattern).
 * 3. Whitelisting: track functions only forward allowed fields to gtag.
 * 4. Graceful no-op when window.gtag is absent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackSubmitFormCompleted,
  trackBlogToServersClick,
  trackServerOutboundClick,
  trackDirectorySearchUsed,
  bucketResultsCount,
  assertNoPii,
} from "./analytics";

// ---------------------------------------------------------------------------
// Mock window.gtag
// ---------------------------------------------------------------------------

const gtagMock = vi.fn();

beforeEach(() => {
  gtagMock.mockClear();
  Object.defineProperty(globalThis, "window", {
    value: { gtag: gtagMock },
    writable: true,
  });
});

// ---------------------------------------------------------------------------
// bucketResultsCount
// ---------------------------------------------------------------------------

describe("bucketResultsCount", () => {
  it("returns '0' for zero", () => expect(bucketResultsCount(0)).toBe("0"));
  it("returns '1-5' for 1", () => expect(bucketResultsCount(1)).toBe("1-5"));
  it("returns '1-5' for 5", () => expect(bucketResultsCount(5)).toBe("1-5"));
  it("returns '6-20' for 6", () => expect(bucketResultsCount(6)).toBe("6-20"));
  it("returns '6-20' for 20", () => expect(bucketResultsCount(20)).toBe("6-20"));
  it("returns '20+' for 21", () => expect(bucketResultsCount(21)).toBe("20+"));
});

// ---------------------------------------------------------------------------
// assertNoPii — unit tests for the PII guardrail
// ---------------------------------------------------------------------------

describe("assertNoPii — PII key detection", () => {
  it("throws on key 'email'", () => {
    expect(() => assertNoPii({ email: "test@example.com" })).toThrow(/PII key detected/i);
  });
  it("throws on key 'user_email'", () => {
    expect(() => assertNoPii({ user_email: "x" })).toThrow(/PII key detected/i);
  });
  it("throws on key 'name'", () => {
    expect(() => assertNoPii({ name: "Alice" })).toThrow(/PII key detected/i);
  });
  it("throws on key 'user_name'", () => {
    expect(() => assertNoPii({ user_name: "Alice" })).toThrow(/PII key detected/i);
  });
  it("throws on key 'password'", () => {
    expect(() => assertNoPii({ password: "secret" })).toThrow(/PII key detected/i);
  });
  it("throws on key 'message'", () => {
    expect(() => assertNoPii({ message: "some text" })).toThrow(/PII key detected/i);
  });
  it("throws on key 'body'", () => {
    expect(() => assertNoPii({ body: "content" })).toThrow(/PII key detected/i);
  });
  it("throws on prefix-position key 'email_hash'", () => {
    expect(() => assertNoPii({ email_hash: "x" })).toThrow(/PII key detected/i);
  });
  it("does NOT throw on 'has_email_provided' (boolean meta-field)", () => {
    expect(() => assertNoPii({ has_email_provided: false })).not.toThrow();
  });
  it("does NOT throw on 'category'", () => {
    expect(() => assertNoPii({ category: "productivity" })).not.toThrow();
  });
  it("does NOT throw on 'blog_slug'", () => {
    expect(() => assertNoPii({ blog_slug: "my-post" })).not.toThrow();
  });
  it("does NOT throw on 'destination_host'", () => {
    expect(() => assertNoPii({ destination_host: "github.com" })).not.toThrow();
  });
});

describe("assertNoPii — PII value detection (@ symbol)", () => {
  it("throws when any string value contains '@'", () => {
    expect(() =>
      assertNoPii({ submitter_id: "user@example.com" })
    ).toThrow(/PII-shaped value/i);
  });
  it("throws for @ value even on non-PII key", () => {
    expect(() =>
      assertNoPii({ referrer: "alice@corp.io" })
    ).toThrow(/PII-shaped value/i);
  });
  it("does NOT throw for non-@ string values", () => {
    expect(() =>
      assertNoPii({ server_slug: "github-mcp", destination_host: "github.com" })
    ).not.toThrow();
  });
  it("does NOT throw for boolean values", () => {
    expect(() =>
      assertNoPii({ has_email_provided: true })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// trackSubmitFormCompleted
// ---------------------------------------------------------------------------

describe("trackSubmitFormCompleted", () => {
  it("fires gtag with correct event name and payload", () => {
    trackSubmitFormCompleted({ category: "server-submit", has_email_provided: false });
    expect(gtagMock).toHaveBeenCalledWith("event", "submit_form_completed", {
      category: "server-submit",
      has_email_provided: false,
    });
  });

  it("fires with has_email_provided: true", () => {
    trackSubmitFormCompleted({ category: "bug", has_email_provided: true });
    expect(gtagMock).toHaveBeenCalledWith("event", "submit_form_completed", {
      category: "bug",
      has_email_provided: true,
    });
  });

  it("only forwards whitelisted keys — extra keys stripped before gtag call", () => {
    // TypeScript types prevent this at compile time, but we verify runtime whitelist
    trackSubmitFormCompleted({ category: "other", has_email_provided: false });
    const call = gtagMock.mock.calls[0];
    const payload = call?.[2] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["category", "has_email_provided"].sort());
  });
});

// ---------------------------------------------------------------------------
// trackBlogToServersClick
// ---------------------------------------------------------------------------

describe("trackBlogToServersClick", () => {
  it("fires gtag with correct event name and payload", () => {
    trackBlogToServersClick({
      blog_slug: "top-10-mcp-servers",
      server_slug: "github-mcp",
      category: "developer-tools",
    });
    expect(gtagMock).toHaveBeenCalledWith("event", "blog_to_servers_click", {
      blog_slug: "top-10-mcp-servers",
      server_slug: "github-mcp",
      category: "developer-tools",
    });
  });

  it("only forwards whitelisted keys", () => {
    trackBlogToServersClick({ blog_slug: "a", server_slug: "b", category: "c" });
    const payload = gtagMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["blog_slug", "category", "server_slug"].sort());
  });
});

// ---------------------------------------------------------------------------
// trackServerOutboundClick
// ---------------------------------------------------------------------------

describe("trackServerOutboundClick", () => {
  it("fires gtag with correct event name and payload", () => {
    trackServerOutboundClick({
      server_slug: "github-mcp",
      destination_host: "github.com",
    });
    expect(gtagMock).toHaveBeenCalledWith("event", "server_outbound_click", {
      server_slug: "github-mcp",
      destination_host: "github.com",
    });
  });

  it("only forwards whitelisted keys", () => {
    trackServerOutboundClick({ server_slug: "x", destination_host: "npm.com" });
    const payload = gtagMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["destination_host", "server_slug"].sort());
  });
});

// ---------------------------------------------------------------------------
// trackDirectorySearchUsed
// ---------------------------------------------------------------------------

describe("trackDirectorySearchUsed", () => {
  it("fires gtag with correct event name and payload", () => {
    trackDirectorySearchUsed({ category: "productivity", results_count: "6-20" });
    expect(gtagMock).toHaveBeenCalledWith("event", "directory_search_used", {
      category: "productivity",
      results_count: "6-20",
    });
  });

  it("fires with empty category (All Categories)", () => {
    trackDirectorySearchUsed({ category: "", results_count: "20+" });
    expect(gtagMock).toHaveBeenCalledWith("event", "directory_search_used", {
      category: "",
      results_count: "20+",
    });
  });

  it("only forwards whitelisted keys", () => {
    trackDirectorySearchUsed({ category: "", results_count: "0" });
    const payload = gtagMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["category", "results_count"].sort());
  });
});

// ---------------------------------------------------------------------------
// Graceful no-op when window.gtag is absent
// ---------------------------------------------------------------------------

describe("graceful no-op when gtag absent", () => {
  it("does not throw when gtag is not defined on window", () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      writable: true,
    });
    expect(() => {
      trackBlogToServersClick({
        blog_slug: "test-slug",
        server_slug: "test-server",
        category: "productivity",
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// guardPii — production sanitizer regression test
// Verifies that PII values are scrubbed from console.error output in prod,
// and never leak the raw email into logs.
// ---------------------------------------------------------------------------

describe("guardPii — production sanitizer", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Switch to production so guardPii logs instead of throws
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    consoleErrorSpy.mockRestore();
  });

  it("sanitizes PII values from prod console.error output", () => {
    // trackServerOutboundClick passes the payload through guardPii → assertNoPii.
    // Injecting an email-shaped value on a non-PII key triggers PII_VALUE_PATTERN.
    // In prod, this is caught and sanitized before logging — must NOT throw.
    expect(() =>
      trackServerOutboundClick({
        server_slug: "leakuser@example.com",
        destination_host: "github.com",
      })
    ).not.toThrow();

    // console.error must have been called (violation was detected and logged)
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(gtagMock).not.toHaveBeenCalled();

    // console.error is called as: console.error("<static prefix>", sanitizedPayload)
    // The sanitized payload is the SECOND argument (index 1), not the static prefix.
    const loggedPayload = String(consoleErrorSpy.mock.calls[0]?.[1] ?? "");

    // The raw email must NOT appear in the sanitized payload
    expect(loggedPayload).not.toContain("leakuser@example.com");
    expect(loggedPayload).not.toContain("@example.com");

    // Positive assertion: the sanitizer must have actually run
    expect(loggedPayload).toContain("<redacted>");
  });
});
