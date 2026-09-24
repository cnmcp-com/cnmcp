import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

import { fetchStats } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { ToastHost } from "@/components/toast";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com"),
  title: { default: "CNMCP — 中文 MCP 资源验证目录", template: "%s | CNMCP" },
  description: "搜索和浏览中文 MCP 服务，查看工具能力、发布来源、公开证据完整度与动态实测结果。",
  keywords: ["MCP", "Model Context Protocol", "MCP 服务器", "MCP 工具", "MCP 安全", "中文 MCP"],
  icons: { icon: "/cnmcp-icon.svg" },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "CNMCP",
    title: "CNMCP — 中文 MCP 资源验证目录",
    description: "搜索中文 MCP 服务，用公开来源和验证证据判断是否值得接入。",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let staticChecked = 0;
  let total = 0;
  try {
    const stats = await fetchStats();
    staticChecked = stats.staticChecked;
    total = stats.total;
  } catch {
    staticChecked = 0;
  }

  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Script id="cnmcp-theme" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("cnmcp-theme");if(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.setAttribute("data-theme","dark");else document.documentElement.setAttribute("data-theme","light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})();`}
        </Script>
        <SiteHeader staticChecked={staticChecked} total={total} />
        <main>{children}</main>
        <footer className="wrap ft">
          <span>CNMCP · 中文 MCP 资源验证目录</span>
          <span>实测证据公开可复核</span>
          <span>不接受付费收录与付费提分</span>
          <span>可达数据来自本站探测，不是北上广成四城</span>
          <span style={{ marginLeft: "auto" }}>
            <Link href="/submit">提交 server</Link>
            {" · "}
            <Link href="/report">数据报告</Link>
            {" · "}
            <Link href="/methodology">评分方法</Link>
            {" · "}
            <a href="https://github.com/cnmcp-com/cnmcp" target="_blank" rel="noopener noreferrer">GitHub 开源</a>
          </span>
        </footer>
        <ToastHost />
      </body>
    </html>
  );
}
