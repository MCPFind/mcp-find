import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { CATEGORIES, CATEGORY_LABELS } from "@mcpfind/shared";
import type { Category } from "@mcpfind/shared";
import {
  IconBrandGithub,
  IconSparkles,
  IconShieldCheck,
  IconRocket,
  IconArrowUpRight,
} from "@tabler/icons-react";

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
          <h2 className="text-lg font-bold text-white mb-3">How to submit</h2>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            MCP Find is open source and community-driven. To submit your server,
            open a pull request adding your server to the{" "}
            <code className="text-blue-400 bg-neutral-800 px-1.5 py-0.5 rounded font-mono text-xs">
              community-servers.yml
            </code>{" "}
            file in our GitHub repository.
          </p>
          <a
            href="https://github.com/adambushman/mcp-find/blob/main/community-servers.yml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors duration-200 text-sm"
          >
            <IconBrandGithub size={16} />
            View community-servers.yml
            <IconArrowUpRight size={14} />
          </a>
        </div>

        {/* Form fields for reference */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-white">Required fields</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Server Name
              </label>
              <input
                type="text"
                placeholder="e.g. My Awesome MCP Server"
                disabled
                className="w-full bg-neutral-900/50 border border-neutral-800 text-neutral-600 placeholder-neutral-700 rounded-xl px-4 py-3 text-sm outline-none cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                GitHub Repository URL
              </label>
              <input
                type="url"
                placeholder="https://github.com/org/repo"
                disabled
                className="w-full bg-neutral-900/50 border border-neutral-800 text-neutral-600 placeholder-neutral-700 rounded-xl px-4 py-3 text-sm outline-none cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Short Description
              </label>
              <input
                type="text"
                placeholder="One sentence description of what your server does"
                disabled
                className="w-full bg-neutral-900/50 border border-neutral-800 text-neutral-600 placeholder-neutral-700 rounded-xl px-4 py-3 text-sm outline-none cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Category
              </label>
              <select
                disabled
                className="w-full bg-neutral-900/50 border border-neutral-800 text-neutral-600 rounded-xl px-4 py-3 text-sm outline-none cursor-not-allowed"
              >
                <option value="">Select a category...</option>
                {CATEGORIES.map((cat: string) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat as Category]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <a
            href="https://github.com/adambushman/mcp-find/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-colors duration-200 text-base"
          >
            <IconBrandGithub size={18} />
            Submit via GitHub PR
            <IconArrowUpRight size={16} />
          </a>
          <p className="text-center text-neutral-600 text-xs">
            By submitting you agree that your server meets our{" "}
            <a
              href="https://github.com/adambushman/mcp-find/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white transition-colors duration-200"
            >
              community guidelines
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
