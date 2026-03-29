import Link from "next/link";
import { AuroraBackground } from "@/components/aceternity/aurora-background";
import { ServerCard } from "@/components/ui/server-card";
import { Navbar } from "@/components/ui/navbar";
import { HeroSearch } from "@/components/ui/hero-search";
import { safeJsonLd } from "@/lib/json-ld";
import { getTopServers, getServerCount, listServers } from "@/lib/queries";
import { CATEGORIES, CATEGORY_LABELS } from "@mcpfind/shared";
import type { Category, ServerListItem } from "@mcpfind/shared";
import {
  IconDatabase,
  IconCode,
  IconFolder,
  IconWorld,
  IconMessage,
  IconBrain,
  IconCloud,
  IconShield,
  IconCheckbox,
  IconServer,
  IconSearch,
  IconPlug,
  IconRocket,
  IconLock,
  IconArrowRight,
  IconStar,
  IconDownload,
  IconBriefcase,
  IconCurrencyDollar,
  IconUsers,
} from "@tabler/icons-react";

const categoryIconMap: Record<string, React.ReactNode> = {
  databases: <IconDatabase size={20} className="text-blue-400" />,
  devtools: <IconCode size={20} className="text-purple-400" />,
  filesystems: <IconFolder size={20} className="text-yellow-400" />,
  search: <IconWorld size={20} className="text-green-400" />,
  communication: <IconMessage size={20} className="text-pink-400" />,
  "ai-ml": <IconBrain size={20} className="text-orange-400" />,
  cloud: <IconCloud size={20} className="text-cyan-400" />,
  finance: <IconCurrencyDollar size={20} className="text-emerald-400" />,
  crm: <IconUsers size={20} className="text-indigo-400" />,
  productivity: <IconCheckbox size={20} className="text-teal-400" />,
  other: <IconBriefcase size={20} className="text-neutral-400" />,
};

export default async function HomePage() {
  let featuredServers: ServerListItem[] = [];
  let recentServers: ServerListItem[] = [];
  let serverCount = 0;
  let totalDownloads = 0;

  try {
    const [featured, recent, count] = await Promise.all([
      getTopServers(6),
      listServers({ sort: "updated", limit: 8 }),
      getServerCount(),
    ]);
    featuredServers = featured;
    recentServers = recent.servers;
    serverCount = count;
    totalDownloads = featured.reduce(
      (sum, s) => sum + (s.npm_weekly_downloads ?? 0),
      0
    );
  } catch {
    // Supabase not available (e.g., during build without credentials)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar variant="fixed" />

      {/* ── 1. Hero ── */}
      <AuroraBackground className="min-h-screen !h-auto bg-black dark:bg-black pt-24">
        {/* Grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        {/* Bottom fade */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black" />

        <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          {/* Pill */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            Now featuring {serverCount > 0 ? `${serverCount.toLocaleString()}+` : "500+"} MCP servers
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-none">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-neutral-400">
              Discover &amp; Deploy
            </span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-blue-300">
              MCP Servers
            </span>
          </h1>

          <p className="text-neutral-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            The open directory of Model Context Protocol servers — browse,
            search, and integrate tools into your AI workflows.
          </p>

          <HeroSearch />

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/servers"
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors duration-200 text-base"
            >
              Browse Servers
              <IconArrowRight size={18} />
            </Link>
            <Link
              href="/submit"
              className="flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors duration-200 text-base"
            >
              Submit a Server
            </Link>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-4 text-sm">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                {serverCount > 0 ? `${serverCount.toLocaleString()}+` : "500+"}
              </span>
              <span className="text-neutral-500 mt-1">MCP Servers</span>
            </div>
            <div className="w-px h-12 bg-neutral-800 hidden sm:block self-center" />
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                {CATEGORIES.length}
              </span>
              <span className="text-neutral-500 mt-1">Categories</span>
            </div>
            <div className="w-px h-12 bg-neutral-800 hidden sm:block self-center" />
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                {totalDownloads > 0
                  ? `${Math.round(totalDownloads / 1000)}k+`
                  : "1M+"}
              </span>
              <span className="text-neutral-500 mt-1">Weekly Downloads</span>
            </div>
            <div className="w-px h-12 bg-neutral-800 hidden sm:block self-center" />
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                4
              </span>
              <span className="text-neutral-500 mt-1">Languages</span>
            </div>
          </div>
        </div>
      </AuroraBackground>

      {/* ── 2. Features (Bento) ── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
                Everything you need for MCP
              </span>
            </h2>
            <p className="text-neutral-500 text-lg max-w-xl mx-auto">
              The complete platform for discovering, evaluating, and deploying
              MCP servers into production AI workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
                <IconSearch size={20} className="text-blue-400" />
              </div>
              <h3 className="font-bold text-neutral-200 mb-2">Discover 500+ MCP Servers</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Browse a curated directory of official and community-built MCP servers across databases, developer tools, cloud services, and more. Filter by language, transport type, and category.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center mb-4">
                <IconRocket size={20} className="text-green-400" />
              </div>
              <h3 className="font-bold text-neutral-200 mb-2">One-Command Install</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Every server comes with ready-to-use install commands and JSON config examples. Copy and paste directly into your Claude Desktop or AI client config.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center mb-4">
                <IconLock size={20} className="text-red-400" />
              </div>
              <h3 className="font-bold text-neutral-200 mb-2">Security First</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                All servers are reviewed for security best practices. Official servers are maintained by Anthropic and verified partners.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4">
                <IconCode size={20} className="text-purple-400" />
              </div>
              <h3 className="font-bold text-neutral-200 mb-2">Rich Tool Documentation</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Each server entry lists every tool it exposes — from read_file to kubernetes_deploy — so you know exactly what capabilities you're adding to your AI. Complete with transport type, version history, and configuration examples.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Categories ── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-neutral-950/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
              Browse by Category
            </h2>
            <p className="text-neutral-500 text-lg">
              Find the right integration for every part of your stack.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {CATEGORIES.map((cat: string) => (
              <Link
                key={cat}
                href={`/servers?category=${encodeURIComponent(cat)}`}
                className="group flex flex-col items-center gap-3 p-5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/80 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-800 group-hover:bg-neutral-700 flex items-center justify-center transition-colors duration-200">
                  {categoryIconMap[cat] ?? (
                    <IconServer size={20} className="text-neutral-400" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-neutral-200 group-hover:text-white transition-colors duration-200">
                    {CATEGORY_LABELS[cat as Category]}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. Featured Servers ── */}
      {featuredServers.length > 0 && (
        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-12">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
                  Featured Servers
                </h2>
                <p className="text-neutral-500">
                  Hand-picked, production-ready integrations
                </p>
              </div>
              <Link
                href="/servers"
                className="hidden sm:flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium transition-colors duration-200"
              >
                View all
                <IconArrowRight size={16} />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {featuredServers.map((server) => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 5. Recently Updated ── */}
      {recentServers.length > 0 && (
        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-neutral-950/50">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
                  Recently Updated
                </h2>
                <p className="text-neutral-500">
                  Fresh releases and recent updates
                </p>
              </div>
              <Link
                href="/servers?sort=updated"
                className="hidden sm:flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium transition-colors duration-200"
              >
                View all
                <IconArrowRight size={16} />
              </Link>
            </div>

            {/* Horizontal scroll strip */}
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
              {recentServers.map((server) => (
                <Link
                  key={server.id}
                  href={`/servers/${server.slug}`}
                  className="snap-start shrink-0 w-72 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 transition-all duration-200 hover:bg-neutral-900/80 group"
                >
                  <div className="mb-3">
                    {server.github_last_push && (
                      <p className="text-xs text-neutral-600 mb-1.5">
                        {new Date(server.github_last_push).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" }
                        )}
                      </p>
                    )}
                    <h3 className="font-semibold text-white text-sm group-hover:text-blue-300 transition-colors duration-200">
                      {server.name}
                    </h3>
                    {server.github_url && (
                      <p className="text-neutral-500 text-xs mt-0.5">
                        {server.github_url.replace("https://github.com/", "")}
                      </p>
                    )}
                  </div>
                  <p className="text-neutral-400 text-xs leading-relaxed mb-3 line-clamp-2">
                    {server.description}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      <IconStar size={11} className="text-amber-400" />
                      {server.github_stars.toLocaleString()}
                    </span>
                    {server.npm_weekly_downloads > 0 && (
                      <span className="flex items-center gap-1">
                        <IconDownload size={11} className="text-green-400" />
                        {(server.npm_weekly_downloads / 1000).toFixed(1)}k
                      </span>
                    )}
                    {server.github_language && (
                      <span className="ml-auto px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                        {server.github_language}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 6. CTA Banner ── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden border border-blue-500/20 bg-gradient-to-r from-blue-900/20 via-purple-900/20 to-blue-900/20 p-12 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.1)_0%,transparent_70%)]" />
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-300 to-purple-300">
                Built an MCP server?
              </h2>
              <p className="text-neutral-400 text-lg mb-8 max-w-xl mx-auto">
                Share it with the community. MCP Hub makes it easy for
                developers to discover your integration and start using it in
                minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/submit"
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors duration-200"
                >
                  Submit Your Server
                  <IconArrowRight size={18} />
                </Link>
                <Link
                  href="/servers"
                  className="flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors duration-200"
                >
                  Browse the Directory
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Footer ── */}
      <footer className="border-t border-neutral-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div>
              <Link href="/" className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <IconPlug size={15} className="text-white" />
                </div>
                <span className="font-bold text-white tracking-tight">
                  MCP Hub
                </span>
              </Link>
              <p className="text-neutral-500 text-sm leading-relaxed">
                The open directory for Model Context Protocol servers.
              </p>
            </div>

            {/* Browse — first 5 categories */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-300 mb-4">
                Browse
              </h4>
              <ul className="space-y-2">
                {CATEGORIES.slice(0, 5).map((cat: string) => (
                  <li key={cat}>
                    <Link
                      href={`/servers?category=${encodeURIComponent(cat)}`}
                      className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors duration-200"
                    >
                      {CATEGORY_LABELS[cat as Category]}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* More — remaining categories */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-300 mb-4">
                More
              </h4>
              <ul className="space-y-2">
                {CATEGORIES.slice(5).map((cat: string) => (
                  <li key={cat}>
                    <Link
                      href={`/servers?category=${encodeURIComponent(cat)}`}
                      className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors duration-200"
                    >
                      {CATEGORY_LABELS[cat as Category]}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-300 mb-4">
                Resources
              </h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/servers"
                    className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors duration-200"
                  >
                    Browse Servers
                  </Link>
                </li>
                <li>
                  <Link
                    href="/submit"
                    className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors duration-200"
                  >
                    Submit a Server
                  </Link>
                </li>
                <li>
                  <a
                    href="https://modelcontextprotocol.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors duration-200"
                  >
                    MCP Documentation
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-neutral-900 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-neutral-600 text-sm">
              &copy; 2026 MCP Hub. Open source.
            </p>
            <p className="text-neutral-600 text-sm">
              Model Context Protocol is an open standard by Anthropic.
            </p>
          </div>
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "MCP Find",
            url: "https://mcpfind.org",
            description:
              "Open-source directory of MCP servers. AI-agent optimized. Get instant install configs for Claude Desktop, Cursor, VS Code, Windsurf, and Claude Code.",
            publisher: {
              "@type": "Organization",
              name: "MCP Find",
              url: "https://mcpfind.org",
            },
          }),
        }}
      />
    </div>
  );
}
