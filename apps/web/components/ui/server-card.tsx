import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { ServerListItem } from "@mcpfind/shared";
import { CategoryBadge } from "./category-badge";
import { languageColors } from "./language-badge";
import { formatNumber } from "./stat-badge";
import {
  IconStar,
  IconDownload,
  IconBrandGithub,
  IconShieldCheck,
  IconSparkles,
  IconServer,
} from "@tabler/icons-react";


interface ServerCardProps {
  server: ServerListItem;
  className?: string;
}

export function ServerCard({ server, className }: ServerCardProps) {
  const tags = server.registry_tags ?? [];
  const language = server.github_language;
// Derive author display from github_url, e.g. "org/repo"
  const author = server.github_url
    ? server.github_url.replace("https://github.com/", "")
    : server.package_name ?? null;
  const githubOwner = author?.split("/")[0] ?? null;
  const avatarUrl = githubOwner
    ? `https://github.com/${githubOwner}.png?size=80`
    : null;

  return (
    <Link
      href={`/servers/${server.slug}`}
      className={cn(
        "group relative block bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl p-5 transition-all duration-200 hover:bg-neutral-900/80 hover:shadow-lg hover:shadow-black/20 cursor-pointer",
        className
      )}
    >
      {/* Status badges — absolute top-right */}
      <div className="absolute top-4 right-4 flex gap-1.5">
        {server.is_official && (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
            <IconShieldCheck size={11} />
            Official
          </span>
        )}
        {server.featured && (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            <IconSparkles size={11} />
            Featured
          </span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start gap-3 pr-24 mb-3">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={githubOwner ?? ""}
            width={36}
            height={36}
            className="rounded-lg shrink-0 bg-neutral-800"
            unoptimized
          />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
            <IconServer size={16} className="text-neutral-500" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-white font-semibold text-base group-hover:text-blue-300 transition-colors duration-200">
            {server.name}
          </h3>
        </div>
      </div>

      {/* Repo & Stars row */}
      <div className="flex items-center gap-3 mb-2 text-xs text-neutral-500">
        {author && (
          <span className="flex items-center gap-1">
            <IconBrandGithub size={12} />
            {author}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <IconStar size={13} className="text-amber-400" />
          <span className="font-medium text-neutral-300">
            {formatNumber(server.github_stars)}
          </span>
        </span>
      </div>

      {/* Description */}
      <p className="text-neutral-400 text-sm leading-relaxed mb-4 line-clamp-2">
        {server.description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {tags.slice(0, 3).map((tag: string) => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700"
          >
            #{tag}
          </span>
        ))}
        {tags.length > 3 && (
          <span className="text-xs px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-500">
            +{tags.length - 3}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
<CategoryBadge category={server.category} />
          {language && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-md border font-mono",
                languageColors[language] ||
                  "text-neutral-400 bg-neutral-800 border-neutral-700"
              )}
            >
              {language}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      {server.npm_weekly_downloads > 0 && (
        <div className="flex items-center mt-4 pt-4">
          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5">
              <IconDownload size={13} className="text-green-400" />
              <span className="font-medium text-neutral-300">
                {formatNumber(server.npm_weekly_downloads)}
              </span>
              <span>/wk</span>
            </span>
          </div>
        </div>
      )}
    </Link>
  );
}
