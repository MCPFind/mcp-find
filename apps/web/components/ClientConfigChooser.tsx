"use client";

import { useState } from "react";
import { generateConfig } from "@mcpfind/shared";
import type { ClientType, PackageType } from "@mcpfind/shared";
import { CodeBlock } from "@/components/ui/code-block";

const CLIENTS: { value: ClientType; label: string; docs: string }[] = [
  { value: "claude-desktop", label: "Claude Desktop", docs: "https://modelcontextprotocol.io/docs/develop/connect-local-servers" },
  { value: "cursor", label: "Cursor", docs: "https://cursor.com/docs/mcp" },
  { value: "vscode", label: "VS Code", docs: "https://code.visualstudio.com/docs/agents/reference/mcp-configuration" },
  { value: "windsurf", label: "Windsurf", docs: "https://docs.windsurf.com/windsurf/cascade/mcp" },
  { value: "claude-code", label: "Claude Code", docs: "https://code.claude.com/docs/en/mcp" },
];

/** Source-derived template, not a claim that this third-party package was executed. */
export function ClientConfigChooser({ serverSlug, packageName, packageType }: {
  serverSlug: string; packageName: string; packageType: PackageType;
}) {
  const [client, setClient] = useState<ClientType>("claude-desktop");
  const [os, setOs] = useState<"macos" | "windows" | "linux">("macos");
  let generated;
  try {
    generated = generateConfig({ slug: serverSlug, packageName, packageType }, client);
  } catch {
    return <p className="text-sm text-neutral-400">No supported local configuration template is available. Follow the maintainer’s setup documentation above.</p>;
  }
  const selected = CLIENTS.find(c => c.value === client)!;
  return <section className="space-y-4" aria-labelledby="client-setup">
    <h2 id="client-setup" className="text-xl font-bold text-white">Set up in your AI client</h2>
    <div className="flex flex-wrap gap-4">
      <label className="text-sm text-neutral-300">AI client
        <select value={client} onChange={e => setClient(e.target.value as ClientType)} className="block mt-2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-white">
          {CLIENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <label className="text-sm text-neutral-300">Operating system
        <select value={os} onChange={e => setOs(e.target.value as typeof os)} className="block mt-2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-white">
          <option value="macos">macOS</option><option value="windows">Windows</option><option value="linux">Linux</option>
        </select>
      </label>
    </div>
    <p className="text-sm text-neutral-400">Merge this template into <code className="text-neutral-200 break-all">{generated.filePath[os]}</code>. Keep existing servers. Add any arguments, credentials, and permissions required by the maintainer; this template has not been install-tested.</p>
    <CodeBlock code={JSON.stringify(generated.config, null, 2)} language="json" copyContext={{ server_slug: serverSlug, client, format: "config" }} />
    <p className="text-sm text-neutral-400">{generated.postInstall} Confirm the server appears connected in the client’s tool list, then try a read-only example from its documentation.</p>
    <a href={selected.docs} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-300 underline">{selected.label} setup reference</a>
  </section>;
}
