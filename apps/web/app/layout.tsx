import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MCP Find — The open-source way to find MCP servers",
    template: "%s | MCP Find",
  },
  description:
    "Open-source directory of MCP servers. AI-agent optimized. Get instant install configs for Claude Desktop, Cursor, VS Code, Windsurf, and Claude Code.",
  metadataBase: new URL("https://mcpfind.org"),
  openGraph: {
    siteName: "MCP Find",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "https://mcpfind.org/og-image-mcp.png",
        width: 1200,
        height: 630,
        alt: "MCP Find — The open-source way to find MCP servers",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@mcpfind",
    creator: "@mcpfind",
    images: ["https://mcpfind.org/og-image-mcp.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  alternates: {
    canonical: "https://mcpfind.org",
  },
  verification: {
    google: '', // TODO: add Google Search Console verification code
    other: {
      'msvalidate.01': '', // TODO: add Bing Webmaster Tools verification code
    },
  },
  keywords: ['MCP servers', 'Model Context Protocol', 'Claude Desktop', 'Cursor', 'VS Code', 'AI tools', 'MCP directory', 'MCP integrations', 'AI agent tools'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-black text-white`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'MCP Find',
              url: 'https://mcpfind.org',
              description: 'Open-source directory of MCP servers. AI-agent optimized.',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://mcpfind.org/servers?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
