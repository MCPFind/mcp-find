"use client";

/**
 * ServerOutboundLink — Client Component
 *
 * Wraps any outbound anchor on the server detail page.
 * Fires server_outbound_click with only server_slug and destination_host —
 * never the full URL with query strings.
 *
 * Only renders as an <a> when the URL scheme is http or https.
 * Non-http(s) URLs (e.g. javascript:, data:) silently render children without a link.
 */

import { trackServerOutboundClick } from "@/lib/analytics";
import type { ReactNode } from "react";

/** Guard: only allow http and https URLs as outbound hrefs. */
function isSafeHttpUrl(url: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

interface ServerOutboundLinkProps {
  href: string;
  serverSlug: string;
  className?: string;
  rel?: string;
  target?: string;
  children: ReactNode;
}

export function ServerOutboundLink({
  href,
  serverSlug,
  className,
  rel = "noopener noreferrer",
  target = "_blank",
  children,
}: ServerOutboundLinkProps) {
  // Reject non-http(s) URLs before rendering an anchor to prevent
  // javascript:, data:, or other unsafe scheme injection.
  if (!isSafeHttpUrl(href)) {
    return <>{children}</>;
  }

  function handleClick() {
    try {
      // Extract only the hostname — never log full URL with query strings
      const destinationHost = new URL(href).hostname;
      trackServerOutboundClick({ server_slug: serverSlug, destination_host: destinationHost });
    } catch {
      // Malformed URL — skip tracking, don't block navigation
    }
  }

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
