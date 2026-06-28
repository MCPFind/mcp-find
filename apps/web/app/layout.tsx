import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { SITE_URL } from "@mcpfind/shared";

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
  // Note: blog pages emit explicit absolute canonical URLs via SITE_URL.
  // metadataBase below is for pages that use relative canonicals — do not rely on
  // it for new blog/server routes; use ${SITE_URL}/path explicitly.
  metadataBase: new URL(SITE_URL),
  openGraph: {
    siteName: "MCP Find",
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    images: [
      {
        url: `${SITE_URL}/og-image-mcp.png`,
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
    images: [`${SITE_URL}/og-image-mcp.png`],
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
    canonical: SITE_URL,
    types: {
      'application/rss+xml': `${SITE_URL}/blog/feed.xml`,
    },
  },
  // Verified via DNS (domain name provider) for both Google and Bing — no HTML meta tags needed
  keywords: ['MCP servers', 'Model Context Protocol', 'Claude Desktop', 'Cursor', 'VS Code', 'AI tools', 'MCP directory', 'MCP integrations', 'AI agent tools'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Preconnect + DNS prefetch for third-party analytics origins (LCP support) */}
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="preconnect" href="https://www.clarity.ms" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.clarity.ms" />
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-black text-white`}>
        {children}
        {/* Google Analytics 4 — lazyOnload defers GTM until after idle to reduce bandwidth contention before first paint (LCP) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-LLD1VR2K5Z"
          strategy="lazyOnload"
        />
        <Script id="ga4-init" strategy="lazyOnload">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-LLD1VR2K5Z');
          `}
        </Script>
        {/* Microsoft Clarity — lazyOnload reduces TBT vs afterInteractive */}
        <Script id="clarity-init" strategy="lazyOnload">
          {`
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "w4hafhct20");
          `}
        </Script>
      </body>
    </html>
  );
}
