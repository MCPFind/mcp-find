import { getServerBySlug, getTopServers, getServersByCategory } from "@/lib/queries";
import { generateServerMetadata, generateServerJsonLd } from "@/lib/metadata";
import { safeJsonLd } from "@/lib/json-ld";
import { generateConfig } from "@mcpfind/shared";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBadge } from "@/components/ui/category-badge";
import { LanguageBadge } from "@/components/ui/language-badge";
import { CodeBlock } from "@/components/ui/code-block";
import { ReadmeSection } from "@/components/ui/readme-section";
import { ServerCard } from "@/components/ui/server-card";
import { formatNumber } from "@/components/ui/stat-badge";
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
} from "@tabler/icons-react";

export const revalidate = 86400;

export async function generateStaticParams() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return [];
  }
  const topServers = await getTopServers(200);
  return topServers.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const server = await getServerBySlug(slug);
  if (!server) return { title: "Server Not Found" };
  return generateServerMetadata(server);
}


export default async function ServerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const server = await getServerBySlug(slug);
  if (!server) notFound();

  const relatedServers = server.category
    ? (await getServersByCategory(server.category))
        .filter((s) => s.id !== server.id)
        .slice(0, 4)
    : [];

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

  return (
    <div className="min-h-screen bg-black text-white">
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
                <a
                  href={server.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors duration-200 text-sm"
                >
                  <IconBrandGithub size={16} />
                  View on GitHub
                  <IconExternalLink size={13} className="text-neutral-500" />
                </a>
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
                    <a
                      href={server.package_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 transition-colors duration-200"
                    >
                      <IconExternalLink size={14} />
                    </a>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Right: Sidebar */}
          <aside className="space-y-6">
            {/* Stats */}
            <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
                Stats
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-neutral-500 text-sm">
                    <IconStar size={15} className="text-amber-400" />
                    Stars
                  </span>
                  <span className="text-white font-semibold text-sm">
                    {server.github_stars.toLocaleString()}
                  </span>
                </div>
                {server.npm_weekly_downloads > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconDownload size={15} className="text-green-400" />
                      Weekly Downloads
                    </span>
                    <span className="text-white font-semibold text-sm">
                      {formatNumber(server.npm_weekly_downloads)}
                    </span>
                  </div>
                )}
                {server.github_forks > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconGitFork size={15} className="text-blue-400" />
                      Forks
                    </span>
                    <span className="text-white font-semibold text-sm">
                      {server.github_forks.toLocaleString()}
                    </span>
                  </div>
                )}
                {server.github_contributors > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconUsers size={15} className="text-purple-400" />
                      Contributors
                    </span>
                    <span className="text-white font-semibold text-sm">
                      {server.github_contributors}
                    </span>
                  </div>
                )}
                {server.github_last_push && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconCalendar size={15} className="text-purple-400" />
                      Last Push
                    </span>
                    <span className="text-white font-semibold text-sm">
                      {new Date(server.github_last_push).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      )}
                    </span>
                  </div>
                )}
                {server.github_license && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-neutral-500 text-sm">
                      <IconCode size={15} className="text-indigo-400" />
                      License
                    </span>
                    <span className="text-white font-semibold text-sm">
                      {server.github_license}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Author */}
            {server.github_url && (() => {
              const authorPath = server.github_url.replace("https://github.com/", "");
              const authorOrg = authorPath.split("/")[0];
              const firstLetter = authorOrg.charAt(0).toUpperCase();
              const statusLabel = server.is_official
                ? "Official"
                : server.source === "registry"
                ? "Registry"
                : "Community";
              return (
                <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
                    Author
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-white font-semibold text-base shrink-0">
                      {firstLetter}
                    </div>
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">
                        {authorOrg}
                      </div>
                      <div className="text-neutral-500 text-xs capitalize">
                        {statusLabel} server
                      </div>
                    </div>
                  </div>
                  <a
                    href={server.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm transition-colors duration-200"
                  >
                    <IconBrandGithub size={15} />
                    <span className="truncate">{authorPath}</span>
                    <IconExternalLink
                      size={12}
                      className="text-neutral-600 ml-auto shrink-0"
                    />
                  </a>
                </div>
              );
            })()}

            {/* Tags */}
            {server.registry_tags && server.registry_tags.length > 0 && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <IconTag size={14} />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {server.registry_tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/servers?q=${encodeURIComponent(tag)}`}
                      className="text-xs px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-600 transition-all duration-200"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Related Servers */}
            {relatedServers.length > 0 && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
                  Related Servers
                </h3>
                <div className="space-y-2">
                  {relatedServers.map((related) => (
                    <Link
                      key={related.id}
                      href={`/servers/${related.slug}`}
                      className="flex flex-col gap-0.5 p-3 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 hover:border-neutral-700 transition-all duration-200 group"
                    >
                      <span className="text-white text-sm font-medium group-hover:text-blue-300 transition-colors duration-200 line-clamp-1">
                        {related.name}
                      </span>
                      {related.description && (
                        <span className="text-neutral-500 text-xs line-clamp-1">
                          {related.description}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
