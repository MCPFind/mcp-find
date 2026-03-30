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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-black text-white`}>
        {children}
      </body>
    </html>
  );
}
