# The community submission pipeline has no ingestion step

_Written 2026-09-07. Read-only investigation; nothing in this document has been implemented._

## The short version

Merging a community submission PR does not put the server in the directory. It
edits a YAML file that nothing reads.

Every one of the 28,554 rows in the `servers` table has `source = 'registry'`.
There is no code anywhere in this repository that reads `community-servers.yml`
or `submissions/` and writes a row to Supabase. The submission path is a
front door with validation, a review workflow, and a merge button, that opens
onto a wall.

## What actually reads community-servers.yml

Every reference in the repository, as of `0c1b376`:

| Reference | What it does |
|---|---|
| `README.md` | Describes the file to contributors |
| `CONTRIBUTING.md` | Describes the file to contributors |
| `.github/workflows/validate-pr.yml` | Structurally validates a PR's entries |
| `.github/workflows/verify-submission.yml` | Checks repo/package liveness for a PR's entries |
| `scripts/validate-submissions.mjs` | The validator the first workflow runs |
| `scripts/verify-submission-liveness.mjs` | The liveness checker the second workflow runs |

Two documents and four CI checks. Nothing else. In particular:

- `packages/sync` never reads it. `runSyncPipeline` does exactly three things:
  `syncFromRegistry` (pulls from the upstream MCP registry API), `enrichWithGitHub`,
  and `categorizeServers`. `registry-sync.ts` hardcodes `source: 'registry' as const`
  on every row it writes.
- `apps/web` never reads it. The only `readFileSync` calls in the web app are in
  `lib/blog.ts`, for MDX posts.
- No migration, no seed script, no scheduled job touches it.

## Evidence from the database

Read-only queries against the production project:

```
SELECT source, count(*) FROM servers GROUP BY source;
-- registry | 28554
```

One value. No `community` rows have ever existed.

The two entries that have been sitting in `community-servers.yml` since it was
created — BuyWhere and Xquik — do have rows in the `servers` table, which looks
at first glance like the pipeline works. It does not. Those rows are
`source = 'registry'`, with registry-shaped slugs (`io-github-buywhere-buywhere-mcp`,
`com-xquik-mcp`) and registry-shaped names (`io.github.kriptoburak/xquik`). Both
projects independently published themselves to the upstream MCP registry, and
the nightly sync picked them up from there. The YAML file had nothing to do with
it. If a submitted server does not also self-publish upstream, merging its PR
puts it nowhere.

## What merging a PR does and does not do today

**Does:**

- Add an entry to a YAML file in the repository
- Give the contributor a merged PR and a green check

**Does not:**

- Create a row in the `servers` table
- Make the server appear at mcpfind.org, in search, in a category page, in the
  sitemap, or in the MCP server package
- Trigger any revalidation, since nothing changed that the site renders

This is why zero community submissions have ever been merged and the file still
holds its original two entries. The merge would have been a no-op, so the
absence of merges has cost nothing so far. It will start costing something the
moment ~37 open PRs get merged and 37 contributors go looking for their server.

## The schema was designed for this and then never wired up

`packages/shared/src/types.ts` already declares:

```ts
source: 'registry' | 'community';
```

and `apps/web/lib/queries.ts` has a comment about falling back to the mutable
slug column for "community servers". The data model anticipated community
ingestion. Only the writer is missing.

That is good news for whoever builds it: the column exists, it is `NOT NULL`
with registry rows already populated, and the site's queries do not filter on
`source`, so a correctly-shaped community row would render without any frontend
change.

## Constraints a future ingester has to respect

- `servers.id` is `text NOT NULL` and is the upsert conflict key
  (`upsert(deduped, { onConflict: 'id' })`). Community rows need an id scheme
  that cannot collide with registry ids. The registry uses reverse-DNS style
  (`io.github.owner/repo`).
- The sync pipeline **never deletes**. It only upserts. So a community row will
  not be wiped by the next nightly run.
- `enrichWithGitHub` and `categorizeServers` do not filter by `source`, so they
  would pick up community rows and enrich them for free — which also means a
  malformed community row would flow into those stages.
- `canonical_slug` is deliberately left out of the registry upsert payload and
  backfilled separately. A community writer has to decide the same question.
- The site's cache is refreshed by `POST /api/revalidate` at the end of a sync.
  A merge-time ingester would need its own revalidation call, or the server
  would not appear until the next nightly sync anyway.

## Options

Listed with what each one costs, not ranked. This is a design decision.

**1. Ingest at merge time.** A `push`-to-`main` workflow, filtered to the
submission paths, that parses the changed files and upserts rows with
`source = 'community'`, then calls `/api/revalidate`. Fastest path to "merging
means something". Needs the service-role key in a workflow that runs on `main`
only — never on `pull_request` — and needs the id/slug scheme decided.

**2. Ingest during the nightly sync.** Add a fourth stage to `runSyncPipeline`
that reads the YAML from the checked-out repo and upserts community rows. Reuses
the existing secret handling, revalidation, and `sync_log` bookkeeping, at the
cost of up to 24 hours of latency between merge and appearance. Probably the
smallest amount of new surface area.

**3. Do not ingest — redirect submissions upstream.** Close the loop by telling
contributors to publish to the upstream MCP registry, which the sync already
pulls from. Costs nothing to build. Costs the whole submission funnel and the
`/submit` page, and hands the relationship with contributors to someone else.

**4. Keep the file as a curation queue.** Treat `community-servers.yml` as an
explicit "maintainer wants this" list and have the sync use it to set `featured`
or to force-include a server the registry does not carry. Narrower than option 1
or 2, and honest about what the file is for.

## Whatever gets chosen

The ~37 open PRs are a decision that has already been deferred once. Options 1,
2 and 4 all make merging meaningful; option 3 means the open PRs should be
closed with an explanation rather than merged. What should not happen is merging
them under the current wiring, which would produce 37 contributors whose servers
silently never appear.

Worth noting the counter-case for building ingestion at all: the directory has
28,554 servers from a registry that self-maintains, and community submissions
have contributed zero of them. The submission funnel may simply not be worth its
maintenance cost, and option 3 is not obviously the wrong answer. The argument
against option 3 is that it gives up the only channel where a server author
talks to mcpfind directly, and that channel is worth more than the two rows it
has produced so far.
