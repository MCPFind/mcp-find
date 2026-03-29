"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div
      className={[
        "prose prose-invert prose-neutral max-w-none",
        // Headings
        "prose-headings:text-white prose-headings:font-bold prose-headings:tracking-tight",
        "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base",
        "prose-headings:border-b prose-headings:border-neutral-800 prose-headings:pb-2 prose-headings:mb-4",
        // Body text
        "prose-p:text-neutral-400 prose-p:leading-relaxed",
        // Links
        "prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300 prose-a:transition-colors",
        // Strong / em
        "prose-strong:text-neutral-200 prose-strong:font-semibold",
        "prose-em:text-neutral-300",
        // Lists
        "prose-li:text-neutral-400 prose-ul:marker:text-neutral-600 prose-ol:marker:text-neutral-600",
        // Blockquote
        "prose-blockquote:border-l-neutral-700 prose-blockquote:text-neutral-400 prose-blockquote:not-italic",
        // HR
        "prose-hr:border-neutral-800",
        // Tables
        "prose-table:border-collapse",
        "prose-thead:border-neutral-700",
        "prose-th:text-neutral-300 prose-th:bg-neutral-800/60 prose-th:border prose-th:border-neutral-700 prose-th:px-3 prose-th:py-2",
        "prose-td:text-neutral-400 prose-td:border prose-td:border-neutral-800 prose-td:px-3 prose-td:py-2",
        "prose-tr:border-neutral-800",
        // Inline code — strip prose backtick decorations
        "prose-code:text-blue-300 prose-code:bg-neutral-900 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5",
        "prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none",
        // Block pre — zero out default prose styles; CodeBlock owns its own look
        "prose-pre:p-0 prose-pre:bg-transparent prose-pre:rounded-none prose-pre:border-0 prose-pre:shadow-none",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Block code: delegate to the project's styled CodeBlock
          pre({ children }) {
            // Let the code renderer handle everything; unwrap the <pre> wrapper
            return <>{children}</>;
          },
          code({ className: cls, children }) {
            const langMatch = /language-(\w+)/.exec(cls || "");
            const codeString = String(children).replace(/\n$/, "");

            if (langMatch || codeString.includes("\n")) {
              return (
                <CodeBlock
                  code={codeString}
                  language={langMatch?.[1] ?? "text"}
                />
              );
            }

            // Inline code
            return (
              <code className="text-blue-300 bg-neutral-900 rounded px-1.5 py-0.5 text-sm font-mono">
                {children}
              </code>
            );
          },
          // Open all links externally
          a({ href, children }) {
            const isExternal = href?.startsWith("http");
            return (
              <a
                href={href}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="text-blue-400 hover:text-blue-300 transition-colors duration-200"
              >
                {children}
              </a>
            );
          },
          // Images — constrain size and add rounded corners
          img({ src, alt }) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt ?? ""}
                className="rounded-lg max-w-full h-auto my-4 border border-neutral-800"
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
