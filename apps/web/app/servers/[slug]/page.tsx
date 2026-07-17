import { getServerBySlug, getIndexableServerSlugs } from "@/lib/queries";
import { generateServerMetadata, generateServerJsonLd } from "@/lib/metadata";
import { getQualityStatus } from "@/lib/quality-status";
import { isIndexable } from "@/lib/indexable";
import { safeJsonLd } from "@/lib/json-ld";
import { generateConfig, CLIENT_CONFIGS, CATEGORY_LABELS } from "@mcpfind/shared";
import type { ClientType } from "@mcpfind/shared";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CategoryBadge } from "@/components/ui/category-badge";
import { LanguageBadge } from "@/components/ui/language-badge";

// Lazy-load CodeBlock: code-splits the copy-button JS while keeping install
// snippets in SSR HTML for SEO and direct readability.
const CodeBlock = dynamic(
  () => import("@/components/ui/code-block").then((m) => ({ default: m.CodeBlock })),
  {
    ssr: true,
    loading: () => (
      <pre className="rounded-xl bg-neutral-950 border border-neutral-800 p-4 text-sm font-mono text-neutral-200 overflow-x-auto min-h-[3rem]" />
    ),
  }
);

// Lazy-load ReadmeSection: defers react-markdown + remark-gfm bundle (~40 kB)
// until after FCP so the font-swap LCP repaint isn't blocked by parser work.
// ssr:true keeps readme content in the initial HTML for SEO crawlers.
const ReadmeSection = dynamic(
  () => import("@/components/ui/readme-section").then((m) => ({ default: m.ReadmeSection })),
  {
    ssr: true,
    loading: () => (
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-48 bg-neutral-800 rounded" />
        <div className="h-4 w-full bg-neutral-900 rounded" />
        <div className="h-4 w-5/6 bg-neutral-900 rounded" />
        <div className="h-4 w-4/6 bg-neutral-900 rounded" />
      </div>
    ),
  }
);
import { ServerCard } from "@/components/ui/server-card";
import { formatNumber } from "@/components/ui/stat-badge";
import { RelatedArticles } from "@/components/related-articles";
import { RelatedServersForCategory } from "@/components/RelatedServersForCategory";
import { StaleServerBadge } from "@/components/StaleServerBadge";
import { VerifiedServerBadge } from "@/components/VerifiedServerBadge";
import { Navbar } from "@/components/ui/navbar";
import {
  IconArrowLeft,
  IconStar,
  IconDownload,
  IconBrandGithub,
  IconShieldCheck,
  IconSparkles,
  IconTag,
  IconCalendar,
  IconExternalLink,
  IconCode,
  IconTerminal,
  IconSettings,
  IconGitFork,
  IconUsers,
  IconPackage,
  IconDeviceDesktop,
  IconInfoCircle,
  IconLink,
  IconAlertCircle,
} from "@tabler/icons-react";
import { ServerOutboundLink } from "@/components/ServerOutboundLink";

export const revalidate = 86400;

// Hoisted to module scope — derived only from compile-time CLIENT_CONFIGS,
// so there's no need to rebuild this array on every render.
const CLIENT_DISPLAY_NAMES: Record<ClientType, string> = {
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  vscode: "VS Code",
  windsurf: "Windsurf",
  "claude-code": "Claude Code",
};

const compatibilityClients = (Object.keys(CLIENT_CONFIGS) as ClientType[]).map(
  (key) => ({
    key,
    displayName: CLIENT_DISPLAY_NAMES[key],
    configPath: CLIENT_CONFIGS[key].filePath.macos,
    postInstall: CLIENT_CONFIGS[key].postInstall,
  })
);

// Pre-render cap for the isIndexable() core. If the gated core is at or below
// this size, every indexable server is pre-rendered at build time; if it's
// larger, we pre-render the top INDEXABLE_PRERENDER_CAP by github_stars and
// let the remainder serve via ISR (revalidate = 86400 above) on first request.
const INDEXABLE_PRERENDER_CAP = 1200;

export async function generateStaticParams() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return [];
  }
  // Pre-render the gated core (isIndexable() servers, capped and ordered by
  // github_stars) instead of a flat top-200 — see lib/indexable.ts and
  // lib/queries.ts#getIndexableServerSlugs. getIndexableServerSlugs already
  // resolves canonical_slug ?? slug per row.
  const slugs = await getIndexableServerSlugs(INDEXABLE_PRERENDER_CAP);
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const server = await getServerBySlug(slug);
  if (!server) return { title: "Server Not Found" };

  // Deprecated servers get noindex — the page will also return 404 via notFound() at render time.
  if (server.registry_status === "deprecated") {
    return {
      title: "Server No Longer Available",
      robots: { index: false, follow: false },
    };
  }

  const qualityStatus = getQualityStatus(slug);
  const base = generateServerMetadata(server);

  // Noindex BROKEN entries: archived/non-functional servers should not appear
  // in search results. Safety gate: this is driven by a closed-enum manifest
  // with build-time delta check (scripts/check-broken-delta.mjs).
  if (qualityStatus === "BROKEN") {
    return {
      ...base,
      // noindex to hide from search results; follow:true preserves link equity flow (standard SEO)
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  // Noindex thin pages: source-data quality gate (lib/indexable.ts), independent
  // of the manifest-driven BROKEN check above. This is the same predicate used
  // by the sitemap and generateStaticParams — a server must clear this bar in
  // all three places or none (single source of truth, see lib/indexable.ts).
  if (!isIndexable(server)) {
    return {
      ...base,
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  return base;
}


export default async function ServerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const server = await getServerBySlug(slug);
  if (!server) notFound();

  // Deprecated servers are gone — return a clean 404 via notFound().
  // Throwing a Response from a Server Component does not set HTTP status in
  // Next.js 14 App Router (there is no gone() helper and it errors/500s).
  // notFound() renders the existing not-found UI; Google treats 404≈410
  // long-term, and these pages are also dropped from the sitemap, so
  // deindexing still happens with zero extra infrastructure.
  if (server.registry_status === "deprecated") {
    notFound();
  }

  const qualityStatus = getQualityStatus(slug);

  // Build install config for Claude Desktop (primary)
  let claudeConfig: string | null = null;
  let installCommand: string | null = null;

  if (server.package_name && server.package_type) {
    try {
      const config = generateConfig(
        {
          slug: server.slug,
          packageName: server.package_name,
          packageType: server.package_type,
        },
        "claude-desktop"
      );
      claudeConfig = JSON.stringify(config.config, null, 2);

      // Build a simple install command
      const cmd = server.package_type === "npm"
        ? `npx -y ${server.package_name}`
        : server.package_type === "pypi"
        ? `uvx ${server.package_name}`
        : server.package_type === "docker"
        ? `docker run -i --rm ${server.package_name}`
        : null;
      installCommand = cmd;
    } catch {
      // Config generation failed — skip
    }
  }

  const categoryLabel = server.category
    ? (CATEGORY_LABELS[server.category] ?? server.category)
    : null;

  const publishedDate = server.registry_published_at ?? server.created_at;

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(generateServerJsonLd(server)),
        }}
      />

      <Navbar variant="sticky" />

      {/* Hero */}
      <div className="border-b border-neutral-900 bg-neutral-950/50 pt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-neutral-500 mb-8">
            <Link
              href="/servers"
              className="hover:text-white flex items-center gap-1.5 transition-colors duration-200"
            >
              <IconArrowLeft size={14} />
              Back to Directory
            </Link>
            <span>/</span>
            <CategoryBadge category={server.category} />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h1 className="text-4xl font-extrabold tracking-tight text-white">
                  {server.name}
                </h1>
                {server.is_official && (
                  <span className="flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                    <IconShieldCheck size={14} />
                    Official
                  </span>
                )}
                {server.featured && (
                  <span className="flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                    <IconSparkles size={14} />
                    Featured
                  </span>
                )}
              </div>
              {/* Quality badges — mutually exclusive: only one renders */}
              <StaleServerBadge qualityStatus={qualityStatus} className="mb-3" />
              <VerifiedServerBadge qualityStatus={qualityStatus} className="mb-3" />
              <p className="text-neutral-400 text-lg max-w-2xl leading-relaxed mb-4">
                {server.description}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <CategoryBadge category={server.category} />
                {server.github_language && (
                  <LanguageBadge language={server.github_language} />
                )}
                {server.version && (
                  <span className="text-sm text-neutral-500 font-mono">
                    v{server.version}
                  </span>
                )}
              </div>
            </div>

            {/* Quick action */}
            {server.github_url && (
              <div className="flex flex-row sm:flex-col gap-3 shrink-0">
                <ServerOutboundLink
                  href={server.github_url}
                  serverSlug={slug}
                  className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors duration-200 text-sm"
                >
                  <IconBrandGithub size={16} />
                  View on GitHub
                  <IconExternalLink size={13} className="text-neutral-500" />
                </ServerOutboundLink>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Left: Main content */}
          <div className="lg:col-span-2 space-y-10">
            {/* Overview / README */}
            <ReadmeSection
              readmeContent={server.readme_content}
              githubUrl={server.github_url}
            />

            {/* Tools */}
            {server.tools.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <IconCode size={20} className="text-purple-400" />
                  Exposed Tools
                  <span className="text-sm font-normal text-neutral-500 ml-1">
                    ({server.tools.length})
                  </span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {server.tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex flex-col gap-1 p-3 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-green-800/50 hover:bg-neutral-800/50 transition-all duration-200 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        <code className="text-sm font-mono text-neutral-200 group-hover:text-white transition-colors duration-200">
                          {tool.tool_name}
                        </code>
                      </div>
                      {tool.tool_description && (
                        <p className="text-xs text-neutral-500 ml-5 leading-relaxed">
                          {tool.tool_description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Capabilities — intentionally excludes tool-only servers (covered by Exposed Tools above) */}
            {(server.has_resources || server.has_prompts) && (
              <section aria-labelledby="capabilities-heading">
                <h2
                  id="capabilities-heading"
                  className="text-xl font-bold text-white mb-4 flex items-center gap-2"
                >
                  <IconInfoCircle size={20} className="text-teal-400" />
                  Server Capabilities
                </h2>
                <p className="text-neutral-400 text-sm mb-4">
                  {server.name} exposes the following MCP primitives:
                </p>
                <ul className="space-y-2" role="list">
                  {server.has_tools && (
                    <li className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800">
                      <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <div>
                        <span className="text-white text-sm font-medium">
                          Tools
                        </span>
                        {server.tool_count > 0 && (
                          <span className="ml-2 text-xs text-neutral-500">
                            ({server.tool_count} registered)
                          </span>
                        )}
                        <p className="text-xs text-neutral-500 mt-0.5">
                          Callable functions the AI agent can invoke directly.
                        </p>
                      </div>
                    </li>
                  )}
                  {server.has_resources && (
                    <li className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800">
                      <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      <div>
                        <span className="text-white text-sm font-medium">
                          Resources
                        </span>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          Data sources the agent can read — files, URLs, or
                          structured records.
                        </p>
                      </div>
                    </li>
                  )}
                  {server.has_prompts && (
                    <li className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800">
                      <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                      <div>
                        <span className="text-white text-sm font-medium">
                          Prompts
                        </span>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          Reusable prompt templates the agent can expand and
                          chain.
                        </p>
                      </div>
                    </li>
                  )}
                </ul>
              </section>
            )}

            {/* Installation */}
            {installCommand && (
              <section>
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <IconTerminal size={20} className="text-green-400" />
                  Installation
                </h2>
                <p className="text-neutral-500 text-sm mb-4">
                  Run this command to install the server:
                </p>
                <CodeBlock code={installCommand} language="bash" />
              </section>
            )}

            {/* Configuration */}
            {claudeConfig && (
              <section>
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <IconSettings size={20} className="text-orange-400" />
                  Configuration
                </h2>
                <p className="text-neutral-500 text-sm mb-4">
                  Add this to your Claude Desktop{" "}
                  <code className="text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded font-mono text-xs">
                    claude_desktop_config.json
                  </code>{" "}
                  or MCP client configuration:
                </p>
                <CodeBlock
                  code={claudeConfig}
                  language="json"
                  showLineNumbers
                />
              </section>
            )}

            {/* Package info */}
            {server.package_name && (
              <section>
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <IconPackage size={20} className="text-cyan-400" />
                  Package
                </h2>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                  <code className="text-sm font-mono text-neutral-200">
                    {server.package_name}
                  </code>
                  {server.package_type && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700 font-mono ml-auto">
                      {server.package_type}
                    </span>
                  )}
                  {server.package_url && (
                    <ServerOutboundLink
                      href={server.package_url}
                      serverSlug={slug}
                      className="text-blue-400 hover:text-blue-300 transition-colors duration-200"
                    >
                      <IconExternalLink size={14} />
                    </ServerOutboundLink>
                  )}
                </div>
              </section>
            )}
            {/* Compatibility */}
            {server.package_name && server.package_type && (
              <section aria-labelledby="compatibility-heading">
                <h2
                  id="compatibility-heading"
                  className="text-xl font-bold text-white mb-4 flex items-center gap-2"
                >
                  <IconDeviceDesktop size={20} className="text-blue-400" />
                  Compatible MCP Clients
                </h2>
                <p className="text-neutral-400 text-sm mb-4">
                  {server.name} works with any MCP-compatible client. Copy the
                  config snippet from the Configuration section above and add it
                  to the file shown for your client, then restart the
                  application.
                </p>
                <ul className="space-y-2" role="list">
                  {compatibilityClients.map(
                    ({ key, displayName, configPath, postInstall }) => (
                      <li
                        key={key}
                        className="flex flex-col gap-1 p-3 rounded-lg bg-neutral-900 border border-neutral-800"
                      >
                        <span className="text-white text-sm font-medium">
                          {displayName}
                        </span>
                        <code className="text-xs text-neutral-500 font-mono break-all">
                          {configPath}
                        </code>
                        <span className="text-xs text-neutral-600">
                          {postInstall}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </section>
            )}

            {/* Related Articles */}
            <RelatedArticles serverCategory={server.category} />
          </div>

          {/* Right: Sidebar */}
          <aside className="space-y-6">
            {/* Stats */}
            <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
                Stats
              </h2>
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-neutral-500 text-sm">
                    <IconStar size={15} className="text-amber-400" />
                    Stars
                  </dt>
                  <dd className="text-white font-semibold text-sm">
                    {server.github_stars.toLocaleString()}
                  </dd>
                </div>
                {server.npm_weekly_downloads > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconDownload size={15} className="text-green-400" />
                      Weekly Downloads
                    </dt>
                    <dd className="text-white font-semibold text-sm">
                      {formatNumber(server.npm_weekly_downloads)}
                    </dd>
                  </div>
                )}
                {server.github_forks > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconGitFork size={15} className="text-blue-400" />
                      Forks
                    </dt>
                    <dd className="text-white font-semibold text-sm">
                      {server.github_forks.toLocaleString()}
                    </dd>
                  </div>
                )}
                {server.github_contributors > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconUsers size={15} className="text-purple-400" />
                      Contributors
                    </dt>
                    <dd className="text-white font-semibold text-sm">
                      {server.github_contributors}
                    </dd>
                  </div>
                )}
                {server.github_last_push && (
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconCalendar size={15} className="text-purple-400" />
                      Last Push
                    </dt>
                    <dd className="text-white font-semibold text-sm">
                      {new Date(server.github_last_push).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      )}
                    </dd>
                  </div>
                )}
                {server.github_license && (
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconCode size={15} className="text-indigo-400" />
                      License
                    </dt>
                    <dd className="text-white font-semibold text-sm">
                      {server.github_license}
                    </dd>
                  </div>
                )}
                {server.github_open_issues > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconAlertCircle size={15} className="text-yellow-400" />
                      Open Issues
                    </dt>
                    <dd className="text-white font-semibold text-sm">
                      {server.github_open_issues.toLocaleString()}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Author */}
            {server.github_url && (() => {
              const authorPath = server.github_url.replace("https://github.com/", "");
              const authorOrg = authorPath.split("/")[0] ?? "";
              const firstLetter = authorOrg.charAt(0)?.toUpperCase() ?? "";
              return (
                <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
                    Author
                  </h2>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-white font-semibold text-base shrink-0">
                      {firstLetter}
                    </div>
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">
                        {authorOrg}
                      </div>
                    </div>
                  </div>
                  <ServerOutboundLink
                    href={server.github_url}
                    serverSlug={slug}
                    className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm transition-colors duration-200"
                  >
                    <IconBrandGithub size={15} />
                    <span className="truncate">{authorPath}</span>
                    <IconExternalLink
                      size={12}
                      className="text-neutral-600 ml-auto shrink-0"
                    />
                  </ServerOutboundLink>
                </div>
              );
            })()}

            {/* Details */}
            {(categoryLabel || publishedDate || server.source || server.github_language) && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5 space-y-3">
                <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <IconInfoCircle size={14} />
                  Details
                </h2>
                <dl className="space-y-2">
                  {categoryLabel && (
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-neutral-500 text-xs shrink-0">Category</dt>
                      <dd className="text-white text-xs font-medium text-right">{categoryLabel}</dd>
                    </div>
                  )}
                  {server.github_language && (
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-neutral-500 text-xs shrink-0">Language</dt>
                      <dd className="text-white text-xs font-medium text-right">{server.github_language}</dd>
                    </div>
                  )}
                  {server.source && (
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-neutral-500 text-xs shrink-0">Source</dt>
                      <dd className="text-white text-xs font-medium text-right capitalize">{server.source}</dd>
                    </div>
                  )}
                  {publishedDate && (
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-neutral-500 text-xs shrink-0">Published</dt>
                      <dd className="text-white text-xs font-medium text-right">
                        {new Date(publishedDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Links */}
            {(server.github_url || server.package_url) && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5 space-y-3">
                <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <IconLink size={14} />
                  Links
                </h2>
                <ul className="space-y-2" role="list">
                  {server.github_url && (
                    <li>
                      <ServerOutboundLink
                        href={server.github_url}
                        serverSlug={slug}
                        className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm transition-colors duration-200"
                      >
                        <IconBrandGithub size={15} className="shrink-0" />
                        <span className="truncate">GitHub Repository</span>
                        <IconExternalLink size={12} className="text-neutral-600 ml-auto shrink-0" />
                      </ServerOutboundLink>
                    </li>
                  )}
                  {server.package_url && (
                    <li>
                      <ServerOutboundLink
                        href={server.package_url}
                        serverSlug={slug}
                        className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm transition-colors duration-200"
                      >
                        <IconPackage size={15} className="shrink-0" />
                        <span className="truncate">
                          {server.package_type === "npm"
                            ? "npm Registry"
                            : server.package_type === "pypi"
                            ? "PyPI Package"
                            : server.package_type === "docker"
                            ? "Docker Hub"
                            : "Package Registry"}
                        </span>
                        <IconExternalLink size={12} className="text-neutral-600 ml-auto shrink-0" />
                      </ServerOutboundLink>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Tags */}
            {server.registry_tags && server.registry_tags.length > 0 && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5 space-y-3">
                <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <IconTag size={14} />
                  Tags
                </h2>
                <ul className="flex flex-wrap gap-2" role="list">
                  {server.registry_tags.map((tag) => (
                    <li key={tag}>
                      <Link
                        href={`/servers?q=${encodeURIComponent(tag)}`}
                        className="text-xs px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-600 transition-all duration-200"
                      >
                        #{tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>

        {/* Related servers — gated (isIndexable()) servers in the same
            category only; self-excluded via currentSlug. Indexing-recovery
            Slice 4: this is a required internal-linking surface on every
            server detail page so gated servers stay reachable in <=3 clicks
            from the homepage. */}
        <RelatedServersForCategory
          category={server.category ?? ""}
          currentSlug={server.slug}
          includeDegraded={false}
          limit={6}
        />
      </div>
    </div>
  );
}
