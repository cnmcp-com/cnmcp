import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

import { SiteHeader } from "@/components/site-header";
import { ToastHost } from "@/components/toast";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com"),
  title: { default: "CNMCP — 中文 AI 开源社区", template: "%s | CNMCP" },
  description: "发现 AI 相关开源项目。按领域浏览，类型以徽章呈现，安全结论写在项目页。",
  keywords: ["AI", "开源", "MCP", "skill", "agent", "中文"],
  icons: { icon: "/cnmcp-icon.svg" },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "CNMCP",
    title: "CNMCP — 中文 AI 开源社区",
    description: "按领域发现 AI 开源项目。类型以徽章呈现，安全结论在项目页。",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Script id="cnmcp-theme" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("cnmcp-theme");if(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.setAttribute("data-theme","dark");else document.documentElement.setAttribute("data-theme","light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})();`}
        </Script>
        <SiteHeader />
        <main>{children}</main>
        <footer className="wrap ft">
          <span>CNMCP · 中文 AI 开源社区</span>
          <span>检查未完成不是风险结论</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Link href="/submit">提交项目</Link>
            <Link href="/methodology">安全说明</Link>
            <Link href="/doctor">本地配置体检</Link>
            <a href="https://github.com/cnmcp-com/cnmcp" target="_blank" rel="noopener noreferrer">
              GitHub<span className="sr-only">（在新窗口打开）</span>
            </a>
          </span>
        </footer>
        <ToastHost />
      </body>
    </html>
  );
}
