import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

import { fetchStats } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { ToastHost } from "@/components/toast";

import "./globals.css";

export const metadata: Metadata = {
  title: "CNMCP — 中文 MCP 可信评测",
  description: "对公开 remote MCP 端点做握手实测。本站探测可达，不是中国大陆四城。",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let verified = 0;
  try {
    const stats = await fetchStats();
    verified = stats.verified;
  } catch {
    verified = 0;
  }

  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Script id="cnmcp-theme" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("cnmcp-theme");if(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.setAttribute("data-theme","dark");else document.documentElement.setAttribute("data-theme","light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})();`}
        </Script>
        <SiteHeader verified={verified} />
        <main>{children}</main>
        <footer className="wrap ft">
          <span>CNMCP · 中文 MCP 生态可信评测</span>
          <span>方法论公开可复算</span>
          <span>不接受付费收录与付费提分</span>
          <span>可达数据来自本站探测，不是北上广成四城</span>
          <span style={{ marginLeft: "auto" }}>
            <Link href="/submit">提交 server</Link>
            {" · "}
            <Link href="/report">探测报告</Link>
          </span>
        </footer>
        <ToastHost />
      </body>
    </html>
  );
}
