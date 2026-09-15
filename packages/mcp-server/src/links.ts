const DIRECTORY_ORIGIN = 'https://mcpfind.org';

const REFERRAL_PARAMS = {
  utm_source: 'mcp_server',
  utm_medium: 'referral',
  utm_campaign: 'mcpfind_server',
} as const;

export type ReferralContent = 'search_servers' | 'get_server_details';

/** Build public directory links without coupling navigation to an API override. */
export function serverPageUrls(slug: string, content: ReferralContent) {
  const canonicalUrl = new URL(`/servers/${encodeURIComponent(slug)}`, DIRECTORY_ORIGIN);
  const trackedUrl = new URL(canonicalUrl);
  for (const [key, value] of Object.entries({ ...REFERRAL_PARAMS, utm_content: content })) {
    trackedUrl.searchParams.set(key, value);
  }

  return {
    canonical_url: canonicalUrl.toString(),
    tracked_url: trackedUrl.toString(),
  };
}
