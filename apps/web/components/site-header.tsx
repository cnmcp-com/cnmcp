"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ALGORITHM_VERSION } from "@cnmcp/schema";

import { formatNumber } from "@/lib/ui";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/", label: "首页", match: (path: string) => path === "/" },
  { href: "/servers", label: "目录", match: (path: string) => path.startsWith("/servers") },
  { href: "/doctor", label: "配置体检", match: (path: string) => path.startsWith("/doctor") },
  { href: "/news", label: "安全动态", match: (path: string) => path.startsWith("/news") },
  { href: "/methodology", label: "方法论", match: (path: string) => path.startsWith("/methodology") },
];

export function SiteHeader({ verified }: { verified: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className={`hdr${open ? " open" : ""}`}>
      <div className="wrap hdr-in">
        <Link href="/" className="logo" onClick={() => setOpen(false)}>
          <span className="mk">CN</span> CNMCP
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
            {ALGORITHM_VERSION} · {formatNumber(verified)} 已验证
          </span>
          <ThemeToggle />
          <button type="button" className="tgl menu-btn" aria-label={open ? "关闭菜单" : "打开菜单"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            ☰
          </button>
        </div>
      </div>
    </header>
  );
}
