/**
 * Shared URL safety utilities for outbound links.
 *
 * Every outbound href sourced from untrusted data (github_url, package_url, etc.)
 * MUST be passed through isSafeHttpUrl before rendering an <a> element.
 */

/**
 * Returns a parsed URL object if the given string is a valid http or https URL,
 * or null if the scheme is anything else (javascript:, data:, …) or the string
 * is not a valid URL.
 *
 * Callers can use the returned URL's properties (e.g. .hostname) directly
 * without a second parse.
 */
export function isSafeHttpUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}
