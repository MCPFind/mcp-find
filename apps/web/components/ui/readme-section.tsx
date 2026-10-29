import { IconExternalLink } from "@tabler/icons-react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { isSafeHttpUrl } from "@/lib/url";

interface ReadmeSectionProps {
  readmeContent: string | null;
  githubUrl: string | null;
}

type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** Remove decorative GitHub-specific markup before conversion. */
export function cleanReadmeHtml(raw: string): string {
  let cleaned = raw;
  cleaned = cleaned.replace(/<p\s+align="center"[^>]*>[\s\S]*?<\/p>/gi, "");
  cleaned = cleaned.replace(/<h[1-6]\s+align="center"[^>]*>[\s\S]*?<\/h[1-6]>/gi, "");
  cleaned = cleaned.replace(/^[ \t]*<br\s*\/?>[ \t]*$/gm, "");
  cleaned = cleaned.replace(/<hr\b[^>]*\/?>/gi, "");
  cleaned = cleaned.replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, "");
  cleaned = cleaned.replace(/<video[\s\S]*?(?:<\/video>|\/>)\s*/gi, "");
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
  cleaned = cleaned.replace(/^[ \t]*<a\s[^>]*>[ \t]*<img\s[^>]*>[ \t]*<\/a>[ \t]*$/gm, "");
  cleaned = cleaned.replace(/^[ \t]*<img\s[^>]*src="[^"]*(?:shields\.io|badge)[^"]*"[^>]*\/?>[ \t]*$/gm, "");
  return cleaned.replace(/\n{3,}/g, "\n\n").replace(/^\s+/, "");
}

type GitHubRepository = { owner: string; repo: string };

function githubRepository(githubUrl: string | null): GitHubRepository | null {
  if (!githubUrl) return null;
  try {
    const url = new URL(githubUrl);
    if (url.hostname !== "github.com") return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    return owner && repo ? { owner, repo } : null;
  } catch {
    return null;
  }
}

function resolveRepositoryReference(value: string, repository: GitHubRepository | null, image: boolean): string {
  if (!repository || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return value;
  try {
    // Resolve dot segments against a synthetic file, never the Git `HEAD`
    // path. Resolving directly against .../HEAD/ lets `..` escape the ref.
    const reference = new URL(value, "https://readme-reference.invalid/README.md");
    const path = reference.pathname.replace(/^\//, "");
    const root = image
      ? `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/HEAD/`
      : `https://github.com/${repository.owner}/${repository.repo}/blob/HEAD/`;
    return `${root}${path}${reference.search}${reference.hash}`;
  } catch {
    return value;
  }
}

function decorateReadmeTree(tree: unknown, repository: GitHubRepository | null): void {
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const element = node as HastNode;
    if (element.type === "element" && element.tagName) {
      const properties = element.properties ?? {};
      const headingClasses: Record<string, string> = {
        h1: "text-2xl font-bold tracking-tight text-white border-b border-neutral-800 pb-2 mb-4",
        h2: "text-xl font-bold tracking-tight text-white border-b border-neutral-800 pb-2 mb-4",
        h3: "text-lg font-bold tracking-tight text-white border-b border-neutral-800 pb-2 mb-4",
        h4: "text-base font-bold tracking-tight text-white border-b border-neutral-800 pb-2 mb-4",
        h5: "text-base font-semibold tracking-tight text-white border-b border-neutral-800 pb-2 mb-4",
      };
      const shiftHeading: Record<string, string> = { h1: "h2", h2: "h3", h3: "h4", h4: "h5", h5: "h6", h6: "p" };
      if (shiftHeading[element.tagName]) {
        properties.className = headingClasses[element.tagName] ?? "text-sm font-bold text-neutral-300";
        element.tagName = shiftHeading[element.tagName];
      } else if (element.tagName === "pre") {
        properties.className = "overflow-x-auto rounded-xl bg-neutral-950 border border-neutral-800 p-4 text-sm font-mono leading-relaxed";
      } else if (element.tagName === "code") {
        properties.className = "text-neutral-200";
      } else if (element.tagName === "img") {
        properties.className = "rounded-lg max-w-full h-auto my-4 border border-neutral-800";
        if (typeof properties.src === "string") {
          properties.src = resolveRepositoryReference(properties.src, repository, true);
        }
      } else if (element.tagName === "a") {
        if (typeof properties.href === "string") {
          properties.href = resolveRepositoryReference(properties.href, repository, false);
        }
        const href = properties.href;
        if (typeof href === "string" && href.startsWith("http")) {
          properties.target = "_blank";
          properties.rel = "noopener noreferrer";
        }
      }
      element.properties = properties;
    }
    for (const child of element.children ?? []) visit(child);
  };
  visit(tree);
}

/**
 * Convert untrusted markdown through a sanitized AST and emit static HTML.
 * The component inserts only this sanitizer-produced string, not raw README
 * HTML. A single HTML value is cheaper to serialize into Flight than a React
 * node per markdown token while retaining crawlable README text and links.
 */
export async function renderReadmeHtml(markdown: string, githubUrl: string | null = null): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize)
    .use(() => tree => decorateReadmeTree(tree, githubRepository(githubUrl)))
    .use(rehypeStringify)
    .process(cleanReadmeHtml(markdown));
  return String(result);
}

export async function ReadmeSection({ readmeContent, githubUrl }: ReadmeSectionProps) {
  if (!readmeContent) {
    return (
      <section className="rounded-xl border border-neutral-800 p-6 text-center">
        <p className="text-neutral-500 text-sm">
          This MCP has no overview available.
          {githubUrl && isSafeHttpUrl(githubUrl) && (
            <>
              {" "}
              <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors duration-200">
                View on GitHub
                <IconExternalLink size={12} />
              </a>
            </>
          )}
        </p>
      </section>
    );
  }

  const html = await renderReadmeHtml(readmeContent, githubUrl);
  return (
    <section>
      <div
        className="prose prose-invert prose-neutral max-w-none prose-headings:text-white prose-headings:font-bold prose-headings:tracking-tight prose-headings:border-b prose-headings:border-neutral-800 prose-headings:pb-2 prose-headings:mb-4 prose-p:text-neutral-400 prose-p:leading-relaxed prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300 prose-a:transition-colors prose-strong:text-neutral-200 prose-strong:font-semibold prose-em:text-neutral-300 prose-li:text-neutral-400 prose-ul:marker:text-neutral-600 prose-ol:marker:text-neutral-600 prose-blockquote:border-l-neutral-700 prose-blockquote:text-neutral-400 prose-blockquote:not-italic prose-table:border-collapse prose-thead:border-neutral-700 prose-th:text-neutral-300 prose-th:bg-neutral-800/60 prose-th:border prose-th:border-neutral-700 prose-th:px-3 prose-th:py-2 prose-td:text-neutral-400 prose-td:border prose-td:border-neutral-800 prose-td:px-3 prose-td:py-2 prose-tr:border-neutral-800 prose-code:text-blue-300 prose-code:bg-neutral-900 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
