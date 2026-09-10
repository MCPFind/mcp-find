/**
 * analytics.ts — GA4 conversion event helpers for MCP Find
 *
 * Strict PII payload contract:
 * - No email, name, password, message, or body fields — ever.
 * - Internal validator asserts this at runtime; throws in dev, no-ops in prod.
 * - All calls are guarded by window.gtag existence check.
 */

/** Enum for submit form categories */
export type SubmitFormCategory =
  | "bug"
  | "feature"
  | "server-submit"
  | "other";

/** Bucket raw counts to avoid fingerprinting via exact numbers */
export type ResultsCountBucket = "0" | "1-5" | "6-20" | "20+";

export function bucketResultsCount(count: number): ResultsCountBucket {
  if (count === 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  return "20+";
}

// ---------------------------------------------------------------------------
// Internal PII guardrail
// ---------------------------------------------------------------------------

// Matches keys that ARE, START WITH, or END WITH a PII term (with underscore separator).
// "email" → match, "user_email" → match, "email_hash" → match, "has_email_provided" → no match (email is in the middle).
// "name" → match, "user_name" → match, "name_initial" → match.
const PII_KEY_PATTERN = /^(email|name|password|message|body)$|_(email|name|password|message|body)$|^(email|name|password|message|body)_/i;
const PII_VALUE_PATTERN = /@/;

/** @internal — exported for unit testing only */
export function assertNoPii(payload: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(payload)) {
    if (PII_KEY_PATTERN.test(key)) {
      throw new Error(
        `[analytics] PII key detected in GA4 payload: "${key}". Remove it before firing.`
      );
    }
    if (typeof value === "string" && PII_VALUE_PATTERN.test(value)) {
      throw new Error(
        `[analytics] PII-shaped value detected in GA4 payload for key "${key}": "${value}". Remove it before firing.`
      );
    }
  }
}

function guardPii(payload: Record<string, unknown>): boolean {
  if (process.env.NODE_ENV !== "production") {
    // Throw in dev and test environments so violations surface immediately
    assertNoPii(payload);
    return true;
  } else {
    try {
      assertNoPii(payload);
      return true;
    } catch (err) {
      // Log violation (event name + key) but never the offending value — strip anything
      // that looks like an email or literal value from the message before logging.
      const raw = err instanceof Error ? err.message : String(err);
      const sanitized = raw.replace(/"[^"]*@[^"]*"/g, '"<redacted>"').replace(/: "[^"]+"\./g, ': "<redacted>".');
      console.error("[analytics] PII violation suppressed in prod:", sanitized);
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// gtag shim
// ---------------------------------------------------------------------------

function fireEvent(eventName: string, payload: Record<string, unknown>): void {
  if (!guardPii(payload)) return;
  if (typeof window === "undefined") return;
  if (typeof (window as typeof window & { gtag?: unknown }).gtag !== "function") return;
  (window as typeof window & { gtag: (...args: unknown[]) => void }).gtag(
    "event",
    eventName,
    payload
  );
}

// ---------------------------------------------------------------------------
// Event: submit_form_completed
// ---------------------------------------------------------------------------

export interface SubmitFormCompletedPayload {
  category: SubmitFormCategory;
  has_email_provided: boolean;
}

/**
 * Fire when the submit form opens the GitHub editor successfully.
 * FORBIDDEN: email value, name, message body, any free-text.
 */
export function trackSubmitFormCompleted(
  payload: SubmitFormCompletedPayload
): void {
  fireEvent("submit_form_completed", {
    category: payload.category,
    has_email_provided: payload.has_email_provided,
  });
}

// ---------------------------------------------------------------------------
// Event: blog_to_servers_click
// ---------------------------------------------------------------------------

export interface BlogToServersClickPayload {
  blog_slug: string;
  server_slug: string;
  category: string;
}

/**
 * Fire when a user clicks a server card inside RelatedServersForCategory.
 * FORBIDDEN: user identifiers, query strings beyond category.
 */
export function trackBlogToServersClick(
  payload: BlogToServersClickPayload
): void {
  fireEvent("blog_to_servers_click", {
    blog_slug: payload.blog_slug,
    server_slug: payload.server_slug,
    category: payload.category,
  });
}

// ---------------------------------------------------------------------------
// Event: server_outbound_click
// ---------------------------------------------------------------------------

export interface ServerOutboundClickPayload {
  server_slug: string;
  /** e.g. "github.com" — never the full URL with query strings */
  destination_host: string;
}

/**
 * Fire when a user clicks an outbound link on the server detail page.
 * FORBIDDEN: full destination URL with query string, referrer chain.
 */
export function trackServerOutboundClick(
  payload: ServerOutboundClickPayload
): void {
  fireEvent("server_outbound_click", {
    server_slug: payload.server_slug,
    destination_host: payload.destination_host,
  });
}

// ---------------------------------------------------------------------------
// Event: directory_search_used
// ---------------------------------------------------------------------------

export interface DirectorySearchUsedPayload {
  /** Category enum value or empty string for "All Categories" */
  category: string;
  /** Bucketed count — never exact number */
  results_count: ResultsCountBucket;
}

/**
 * Fire when a user interacts with the directory search bar or category filter.
 * FORBIDDEN: exact query string.
 */
export function trackDirectorySearchUsed(
  payload: DirectorySearchUsedPayload
): void {
  fireEvent("directory_search_used", {
    category: payload.category,
    results_count: payload.results_count,
  });
}

/** Successful copy only. Never transmit the copied configuration or credentials. */
export function trackConfigCopied(payload: { server_slug: string; client: string; format: "config" | "command" }): void {
  fireEvent("config_copied", {
    server_slug: payload.server_slug,
    client: payload.client,
    format: payload.format,
  });
}
