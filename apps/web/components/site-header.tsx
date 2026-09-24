"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { formatNumber } from "@/lib/ui";
import { ThemeToggle } from "./theme-toggle";

const GITHUB_URL = "https://github.com/cnmcp-com/cnmcp";

const LINKS = [
  { href: "/", label: "首页", match: (path: string) => path === "/" },
  { href: "/servers", label: "目录", match: (path: string) => path.startsWith("/servers") },
  { href: "/report", label: "数据报告", match: (path: string) => path.startsWith("/report") },
  { href: "/doctor", label: "配置体检", match: (path: string) => path.startsWith("/doctor") },
  { href: "/news", label: "验证动态", match: (path: string) => path.startsWith("/news") },
];

export function SiteHeader({ staticChecked, total }: { staticChecked: number; total: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className={`hdr${open ? " open" : ""}`}>
      <div className="wrap hdr-in">
        <Link href="/" className="logo" onClick={() => setOpen(false)}>
          <img className="brand-icon" src="/cnmcp-icon.svg" alt="" width="26" height="26" />
          <span className="brand-lockup"><b>CNMCP</b><small>MCP 资源验证目录</small></span>
        </Link>
        <nav className="nav" aria-label="主导航">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={link.match(pathname) ? "on" : undefined} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hdr-r">
          <span className="gh">
            {total > 0 ? `${formatNumber(total)} 项资源 · ${formatNumber(staticChecked)} 项证据检查` : "公开数据 · 持续更新"}
          </span>
          <a className="github-link" href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="在 GitHub 查看 CNMCP 开源项目">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.55 9.55 0 0 1 12 7.3c.85 0 1.71.11 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.28c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>
            <span>开源</span>
          </a>
          <ThemeToggle />
          <button type="button" className="tgl menu-btn" aria-label={open ? "关闭菜单" : "打开菜单"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            ☰
          </button>
        </div>
      </div>
    </header>
  );
}
