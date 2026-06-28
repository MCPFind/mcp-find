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
import { isSafeHttpUrl } from "@/lib/url";
import type { ReactNode } from "react";

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
  const parsedUrl = isSafeHttpUrl(href);
  if (!parsedUrl) {
    return <>{children}</>;
  }

  function handleClick() {
    // Use the already-parsed URL object — no second parse needed.
    // parsedUrl is non-null here: the early-return guard above ensures it.
    trackServerOutboundClick({ server_slug: serverSlug, destination_host: parsedUrl!.hostname });
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
