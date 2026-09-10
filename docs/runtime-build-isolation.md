# Database-independent builds

Production builds must not query Supabase, including when credentials exist.
The full CI build runs with a local database fixture that rejects every read,
then checks the prerender manifest and exercises the built server. Run locally:

```sh
pnpm --filter @mcpfind/shared build
python3 scripts/test-build-isolation.py
```

The fixture is entirely local. It clears the generated `apps/web/.next` artifact,
uses synthetic credentials/data, and terminates its own server processes.

## Route inventory

| Surface | Database work | Build and runtime policy |
|---|---|---|
| `/` | Count in metadata/hero, indexable top servers, recent listing | Rewrite to `/directory-root/home`; empty static params, hourly blocking ISR |
| `/servers` | Cached listing and aggregate count | Rewrite to `/directory-root/servers`; hourly blocking ISR |
| `/categories` | Indexable category scans for counts | Rewrite to `/directory-root/categories`; hourly blocking ISR |
| `/categories/[category]` | Category count, complete indexable rows, related servers | Empty static params; hourly blocking ISR |
| `/servers?page=N` | Listing/count | Existing rewrite to `/directory-page/N`; empty static params, hourly ISR |
| Filtered `/servers` | Filtered listing/count | Existing request-time search route, noindex/no-store |
| `/servers/[slug]` | Single server and tool data, live indexability | Existing empty static params; seven-day ISR |
| `/blog/[slug]` | Optional related-server component, including MDX embeds | Empty static params; daily ISR. Article files/metadata remain authoritative |
| `/blog`, feed, about/contact/legal/submit and root layout | Files or static data only | Existing rendering policies; no Supabase reads |
| `/llms.txt`, `/llms-full.txt` | Count and indexable top servers | Runtime handlers; six-hour explicit CDN cache plus shared query caches |
| Sitemap index/static/all ten server shards | Shared indexable scan and category dates | Existing runtime handlers; hourly CDN cache/shared data |
| `/api/health` | Count and last sync | Runtime only; errors 503/no-store |
| Server list/detail/config APIs | Listing or single-server cached queries | Existing request-time execution and CDN success caches; errors 503/no-store |
| Revalidate/CSP APIs | Request-driven cache invalidation/reporting | No build-time execution |

Public URLs and canonical links do not change. Direct requests to the internal
`/directory-root/*` entry points return 404. Next's rewrite preserves RSC requests;
the integration test checks both HTML and RSC transport. Existing data-cache TTLs
and revalidation tags remain unchanged. Successful page HTML stays in ISR rather
than making every bot request execute database reads. Homepage HTML now shares
the hourly root route TTL; its underlying six-hour query cache is unchanged.

## Failure semantics

A cold-cache database outage produces uncached 503 responses for controllable
API/text/XML handlers. HTML pages propagate required-data failures honestly;
Next.js 14 determines the HTTP response (the cold-cache tests observe 500 and
no-store). Errors after streaming begins may retain an already-sent 200 status.
Do not add fabricated zero counts, empty directory pages or fake sitemap success
responses to make builds pass. A separate HTML status transport design would be
needed to guarantee 503 for every streamed page failure.

The optional related-server block on a blog article retains its existing graceful
omission on database failure; the substantive article remains available from its
local MDX file. Cached successful responses can remain available through upstream
outages according to existing ISR/data/CDN stale policies.

The missing `readme_length` migration still makes cold runtime indexability scans
more expensive. Build isolation removes deployment dependence on those scans; it
does not replace the migration or alter which servers qualify for indexing.
