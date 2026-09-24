import type { Metadata } from "next";
import { getPublicConfig } from "@/lib/config";
import "./globals.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const config = getPublicConfig();
  return {
    title: config.siteName,
    description: config.siteDescription,
    robots: { index: false, follow: false },
    icons: {
      icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `(() => { try { const saved = localStorage.getItem("gloopix-lite-theme"); const theme = saved === "light" || saved === "dark" ? saved : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"); document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; } catch {} })();`;
  return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body>{children}</body></html>;
}
