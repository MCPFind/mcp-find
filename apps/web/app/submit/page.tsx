import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "@mcpfind/shared";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import {
  IconBrandGithub,
  IconSparkles,
  IconShieldCheck,
  IconRocket,
} from "@tabler/icons-react";
import { SubmitForm } from "@/components/SubmitForm";
import { safeJsonLd } from "@/lib/json-ld";

const PAGE_TITLE = `Submit Your MCP Server | ${SITE_NAME}`;
const PAGE_DESCRIPTION = "Add your MCP server to the open-source directory used by thousands of AI developers. Submit via GitHub PR — no account required, reviewed within 48 hours.";

export const metadata: Metadata = {
  title: "Submit Your MCP Server",
  description: PAGE_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/submit` },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: `${SITE_URL}/submit`,
    type: "website",
    images: [
      {
        url: `${SITE_URL}/og-image-mcp.png`,
        width: 1200,
        height: 630,
        alt: "MCP Find — The open-source way to find MCP servers",
      },
    ],
  },
};

export default function SubmitPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar variant="sticky" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-6">
            <IconSparkles size={14} />
            Open Submissions
          </div>
          <h1 className="text-4xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
            Submit Your MCP Server
          </h1>
          <p className="text-neutral-400 text-lg">
            Share your integration with thousands of AI developers.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {[
            {
              icon: <IconRocket size={20} className="text-blue-400" />,
              title: "Instant Visibility",
              desc: "Get discovered by developers building AI apps",
            },
            {
              icon: <IconShieldCheck size={20} className="text-green-400" />,
              title: "Quality Review",
              desc: "We check all submissions for security and quality",
            },
            {
              icon: <IconBrandGithub size={20} className="text-purple-400" />,
              title: "Open Source",
              desc: "Contribute back to the MCP ecosystem",
            },
          ].map((b) => (
            <div
              key={b.title}
              className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 text-center"
            >
              <div className="flex justify-center mb-2">{b.icon}</div>
              <p className="text-sm font-semibold text-white mb-1">{b.title}</p>
              <p className="text-xs text-neutral-500">{b.desc}</p>
            </div>
          ))}
        </div>

        {/* How to submit */}
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-6 mb-8">
          <h2 className="text-lg font-bold text-white mb-3">How it works</h2>
          <p className="text-neutral-400 text-sm leading-relaxed mb-1">
            Fill in the form below and click <strong className="text-white">Open GitHub Editor</strong>.
            Your data will be prefilled in GitHub&apos;s web editor as a new{" "}
            <code className="text-blue-400 bg-neutral-800 px-1.5 py-0.5 rounded font-mono text-xs">
              submissions/your-server.yml
            </code>{" "}
            file. GitHub will guide you through forking the repo and opening a pull request — no
            local Git setup required.
          </p>
          <p className="text-neutral-500 text-xs mt-3">
            Prefer to edit manually?{" "}
            <Link
              href="https://github.com/MCPFind/mcp-find/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white transition-colors duration-200 underline underline-offset-2"
            >
              Read the contributing guide
            </Link>
            .
          </p>
        </div>

        {/* Functional form */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-white">Your server details</h2>
          <SubmitForm />
          <p className="text-center text-neutral-600 text-xs">
            By submitting you agree that your server meets our{" "}
            <Link
              href="https://github.com/MCPFind/mcp-find/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white transition-colors duration-200"
            >
              community guidelines
            </Link>
            .
          </p>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": `${SITE_URL}/submit#webpage`,
            "name": PAGE_TITLE,
            "description": PAGE_DESCRIPTION,
            "url": `${SITE_URL}/submit`,
            "isPartOf": { "@id": `${SITE_URL}/#website` },
          }),
        }}
      />
    </div>
  );
}
