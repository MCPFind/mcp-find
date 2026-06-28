import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "@mcpfind/shared";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";

export const metadata: Metadata = {
  title: `Privacy Policy | ${SITE_NAME}`,
  description: "How MCP Find collects, uses, and protects information. We use Google Analytics 4 for aggregate analytics — no personal data is ever collected or stored.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar variant="sticky" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <h1 className="text-4xl font-extrabold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
          Privacy Policy
        </h1>
        <p className="text-neutral-500 text-sm mb-10">
          Last updated: May 2026
        </p>

        <div className="space-y-10 text-neutral-400 leading-relaxed">

          {/* Overview */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">Overview</h2>
            <p>
              MCP Find is an open-source directory of Model Context Protocol (MCP) servers. We do
              not sell personal data. We do not require account creation. We use Google Analytics 4
              (GA4) to understand aggregate usage patterns so we can improve the directory.
            </p>
          </section>

          {/* Data we collect */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">Data We Collect</h2>
            <p className="mb-3">
              We use Google Analytics 4 (property ID: G-LLD1VR2K5Z) to collect anonymous,
              aggregate analytics. GA4 may collect:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Pages visited and time on page</li>
              <li>Approximate geographic region (country/city — not street-level)</li>
              <li>Browser type and device category</li>
              <li>Referrer source and medium (how you arrived at the site)</li>
              <li>Aggregated conversion events (described below)</li>
            </ul>
            <p className="mt-3">
              GA4 uses cookies to distinguish unique sessions. No personally identifiable information
              (PII) such as name, email address, or IP address is stored by MCP Find.
            </p>
          </section>

          {/* GA4 Conversion Events */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">
              GA4 Conversion Events — Non-PII Payload Contract
            </h2>
            <p className="mb-4">
              MCP Find fires four custom GA4 conversion events. Each event payload is strictly
              limited to non-personal, non-identifying data. No email addresses, names, free-text
              query strings, or user identifiers are ever included.
            </p>

            <div className="space-y-6">
              {/* submit_form_completed */}
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5">
                <h3 className="text-base font-semibold text-white mb-1 font-mono">
                  submit_form_completed
                </h3>
                <p className="text-sm mb-3">
                  Fired when a user successfully opens the GitHub editor via the{" "}
                  <Link href="/submit" className="text-blue-400 hover:text-blue-300">
                    Submit a Server
                  </Link>{" "}
                  form.
                </p>
                <p className="text-sm font-medium text-neutral-300 mb-1">Payload fields:</p>
                <ul className="text-sm list-disc list-inside ml-2 space-y-0.5">
                  <li>
                    <code className="text-blue-300 text-xs">category</code> — enum:{" "}
                    <code className="text-xs text-neutral-400">bug | feature | server-submit | other</code>
                  </li>
                  <li>
                    <code className="text-blue-300 text-xs">has_email_provided</code> — boolean
                    (always false for this form; included for future contact forms)
                  </li>
                </ul>
                <p className="text-xs text-neutral-600 mt-2">
                  Forbidden: email value, name, message body, any free-text field.
                </p>
              </div>

              {/* blog_to_servers_click */}
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5">
                <h3 className="text-base font-semibold text-white mb-1 font-mono">
                  blog_to_servers_click
                </h3>
                <p className="text-sm mb-3">
                  Fired when a user clicks a related server card inside a blog post. Measures how
                  often editorial content drives discovery of new servers.
                </p>
                <p className="text-sm font-medium text-neutral-300 mb-1">Payload fields:</p>
                <ul className="text-sm list-disc list-inside ml-2 space-y-0.5">
                  <li>
                    <code className="text-blue-300 text-xs">blog_slug</code> — URL slug of the
                    source blog post (e.g.{" "}
                    <code className="text-xs text-neutral-400">top-github-mcp-servers</code>)
                  </li>
                  <li>
                    <code className="text-blue-300 text-xs">server_slug</code> — URL slug of the
                    destination server (e.g. <code className="text-xs text-neutral-400">github-mcp</code>)
                  </li>
                  <li>
                    <code className="text-blue-300 text-xs">category</code> — server category enum
                  </li>
                </ul>
                <p className="text-xs text-neutral-600 mt-2">
                  Forbidden: user identifiers, query strings beyond category.
                </p>
              </div>

              {/* server_outbound_click */}
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5">
                <h3 className="text-base font-semibold text-white mb-1 font-mono">
                  server_outbound_click
                </h3>
                <p className="text-sm mb-3">
                  Fired when a user clicks an outbound link on a server detail page (e.g., View on
                  GitHub or a package registry link).
                </p>
                <p className="text-sm font-medium text-neutral-300 mb-1">Payload fields:</p>
                <ul className="text-sm list-disc list-inside ml-2 space-y-0.5">
                  <li>
                    <code className="text-blue-300 text-xs">server_slug</code> — URL slug of the
                    server
                  </li>
                  <li>
                    <code className="text-blue-300 text-xs">destination_host</code> — hostname only
                    (e.g. <code className="text-xs text-neutral-400">github.com</code> — never the
                    full URL)
                  </li>
                </ul>
                <p className="text-xs text-neutral-600 mt-2">
                  Forbidden: full destination URL with query string, referrer chain.
                </p>
              </div>

              {/* directory_search_used */}
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5">
                <h3 className="text-base font-semibold text-white mb-1 font-mono">
                  directory_search_used
                </h3>
                <p className="text-sm mb-3">
                  Fired when a user interacts with the directory search bar or category filter on
                  the{" "}
                  <Link href="/servers" className="text-blue-400 hover:text-blue-300">
                    Browse Servers
                  </Link>{" "}
                  page.
                </p>
                <p className="text-sm font-medium text-neutral-300 mb-1">Payload fields:</p>
                <ul className="text-sm list-disc list-inside ml-2 space-y-0.5">
                  <li>
                    <code className="text-blue-300 text-xs">category</code> — category enum or
                    empty string for &ldquo;All Categories&rdquo;
                  </li>
                  <li>
                    <code className="text-blue-300 text-xs">results_count</code> — bucketed integer:{" "}
                    <code className="text-xs text-neutral-400">0 | 1-5 | 6-20 | 20+</code> (never
                    exact count)
                  </li>
                </ul>
                <p className="text-xs text-neutral-600 mt-2">
                  Forbidden: exact query string (we bucket result counts to prevent fingerprinting).
                </p>
              </div>
            </div>
          </section>

          {/* LLM Referrer Analysis */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">
              LLM Referrer Analysis
            </h2>
            <p>
              GA4 source/medium reporting may reveal referral traffic from AI assistants and large
              language model (LLM) chat interfaces (e.g., ChatGPT, Claude, Perplexity). We analyze
              this aggregate data to understand how AI tools discover and recommend MCP Find. No
              individual user sessions are identified or linked to specific AI interactions.
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">Cookies</h2>
            <p className="mb-3">
              Google Analytics sets first-party cookies (
              <code className="text-blue-300 text-xs">_ga</code>,{" "}
              <code className="text-blue-300 text-xs">_ga_*</code>) to distinguish sessions. These
              cookies do not identify you personally.
            </p>
            <p>
              MCP Find does not use advertising cookies, tracking pixels, or any third-party
              analytics beyond GA4.
            </p>
            {/* EU/cookie consent note */}
            <p className="mt-3 text-sm text-neutral-500">
              <strong className="text-neutral-400">EU visitors:</strong> If you are located in the
              European Economic Area (EEA), GA4 is configured with IP anonymization enabled. We do
              not currently display a cookie consent banner — if you have questions about GDPR
              compliance, contact us at the address below.
            </p>
          </section>

          {/* Third Parties */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">Third-Party Services</h2>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>
                <strong className="text-neutral-300">Google Analytics 4</strong> — aggregate
                analytics; see{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  Google Privacy Policy
                </a>
              </li>
              <li>
                <strong className="text-neutral-300">Vercel</strong> — hosting; collects standard
                server access logs (IP anonymized per Vercel policy)
              </li>
              <li>
                <strong className="text-neutral-300">GitHub</strong> — submission flow redirects
                to github.com; governed by{" "}
                <a
                  href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  GitHub&apos;s Privacy Statement
                </a>
              </li>
            </ul>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">Contact</h2>
            <p>
              Questions about this policy? Open an issue on{" "}
              <a
                href="https://github.com/MCPFind/mcp-find"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                github.com/MCPFind/mcp-find
              </a>{" "}
              or reach out via the{" "}
              <Link href="/submit" className="text-blue-400 hover:text-blue-300">
                Submit page
              </Link>
              .
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
