import Link from "next/link";
import {
  EDITORIAL_ANNOTATION_CHECKED_AT,
  type ServerEditorialAnnotation,
} from "@/lib/server-editorial-annotations";

export function ServerEditorialAnnotation({
  annotation,
}: {
  annotation: ServerEditorialAnnotation;
}) {
  return (
    <aside
      aria-label="Docs-derived setup note"
      className="rounded-xl border border-blue-900/70 bg-blue-950/20 p-5"
    >
      <h2 className="text-lg font-semibold text-white mb-3">{annotation.title}</h2>
      <div className="space-y-3 text-sm leading-6 text-neutral-300">
        <p>{annotation.decision}</p>
        <p>{annotation.workflow}</p>
        <p className="text-neutral-400">{annotation.reviewBoundary}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <a
          href={annotation.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
        >
          Source: {annotation.sourceLabel}
        </a>
        {annotation.guideHref && annotation.guideLabel && (
          <Link
            href={annotation.guideHref}
            className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
          >
            {annotation.guideLabel}
          </Link>
        )}
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Docs reviewed {EDITORIAL_ANNOTATION_CHECKED_AT}; not independently tested by MCPFind.
      </p>
    </aside>
  );
}
