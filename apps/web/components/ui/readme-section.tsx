"use client";

import { useState, useEffect } from "react";
import { MarkdownContent } from "./markdown-content";
import { TracingBeam } from "./tracing-beam";
import { IconExternalLink } from "@tabler/icons-react";

interface ReadmeSectionProps {
  readmeContent: string | null;
  githubUrl: string | null;
}

function ReadmeSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 bg-neutral-800 rounded" />
      <div className="space-y-2">
        <div className="h-4 w-full bg-neutral-900 rounded" />
        <div className="h-4 w-5/6 bg-neutral-900 rounded" />
        <div className="h-4 w-4/6 bg-neutral-900 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full bg-neutral-900 rounded" />
        <div className="h-4 w-3/4 bg-neutral-900 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full bg-neutral-900 rounded" />
        <div className="h-4 w-5/6 bg-neutral-900 rounded" />
        <div className="h-4 w-2/3 bg-neutral-900 rounded" />
      </div>
    </div>
  );
}

/**
 * Strip decorative HTML that doesn't render outside GitHub:
 * - <p align="center"> blocks (logos, badges, taglines)
 * - <picture>/<source>/<video> tags
 * - HTML comments
 * - Standalone badge-link lines (<a><img shields.io ...></a>)
 * - Leftover blank lines from stripping
 */
function cleanReadmeHtml(raw: string): string {
  let cleaned = raw;

  // Remove <p align="center">...</p> blocks (single-line and multiline)
  cleaned = cleaned.replace(/<p\s+align="center"[^>]*>[\s\S]*?<\/p>/gi, "");

  // Remove <h1-h6 align="center">...</h1-h6> decorative headings
  cleaned = cleaned.replace(/<h[1-6]\s+align="center"[^>]*>[\s\S]*?<\/h[1-6]>/gi, "");

  // Remove standalone <br> / <br /> tags
  cleaned = cleaned.replace(/^[ \t]*<br\s*\/?>[ \t]*$/gm, "");

  // Remove <hr> / <hr /> / <hr class="..."> tags
  cleaned = cleaned.replace(/<hr\b[^>]*\/?>/gi, "");

  // Remove <picture>...</picture> blocks
  cleaned = cleaned.replace(/<picture[\s\S]*?<\/picture>/gi, "");

  // Remove <video ... /> or <video>...</video>
  cleaned = cleaned.replace(/<video[\s\S]*?(?:<\/video>|\/>)/gi, "");

  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  // Remove standalone lines that are just badge links: <a ...><img ...></a>
  cleaned = cleaned.replace(
    /^[ \t]*<a\s[^>]*>[ \t]*<img\s[^>]*>[ \t]*<\/a>[ \t]*$/gm,
    ""
  );

  // Remove standalone <img> tags with shields.io or badge URLs
  cleaned = cleaned.replace(
    /^[ \t]*<img\s[^>]*src="[^"]*(?:shields\.io|badge)[^"]*"[^>]*\/?>[ \t]*$/gm,
    ""
  );

  // Collapse 3+ consecutive blank lines into 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // Trim leading whitespace/newlines
  cleaned = cleaned.replace(/^\s+/, "");

  return cleaned;
}

function parseOwnerRepo(githubUrl: string): string | null {
  try {
    const { hostname, pathname } = new URL(githubUrl);
    if (!hostname.includes("github.com")) return null;
    const parts = pathname.split("/").filter(Boolean).slice(0, 2);
    return parts.length === 2 ? parts.join("/") : null;
  } catch {
    return null;
  }
}

export function ReadmeSection({ readmeContent, githubUrl }: ReadmeSectionProps) {
  const [content, setContent] = useState<string | null>(readmeContent);
  const [loading, setLoading] = useState(!readmeContent && !!githubUrl);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (readmeContent || !githubUrl) return;

    const ownerRepo = parseOwnerRepo(githubUrl);
    if (!ownerRepo) {
      setLoading(false);
      setError(true);
      return;
    }

    const controller = new AbortController();

    fetch(`https://api.github.com/repos/${ownerRepo}/readme`, {
      headers: { Accept: "application/vnd.github.raw+json" },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.text();
      })
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(true);
        setLoading(false);
      });

    return () => controller.abort();
  }, [readmeContent, githubUrl]);

  const showContent = !loading && !error && content;
  const showEmpty = !loading && !showContent;

  return (
    <section>
      {loading && <ReadmeSkeleton />}

      {showContent && (
        <TracingBeam className="pl-6 md:pl-12">
          <MarkdownContent content={cleanReadmeHtml(content!)} />
        </TracingBeam>
      )}

      {showEmpty && (
        <div className="rounded-xl bg-neutral-900/50 border border-neutral-800 p-6 text-center">
          <p className="text-neutral-500 text-sm">
            This MCP has no overview available.
            {githubUrl && (
              <>
                {" "}
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors duration-200"
                >
                  View on GitHub
                  <IconExternalLink size={12} />
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
