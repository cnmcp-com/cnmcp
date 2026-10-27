"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { captureSessionFromHash, readSession } from "@/lib/browser-session";
import { githubLoginUrl } from "@/lib/public-api";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/", label: "发现", match: (path: string) => path === "/" },
  { href: "/projects", label: "项目", match: (path: string) => path.startsWith("/projects") || path.startsWith("/categories") },
  { href: "/search", label: "搜索", match: (path: string) => path.startsWith("/search") },
  { href: "/submit", label: "提交", match: (path: string) => path.startsWith("/submit") },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    captureSessionFromHash();
    setAuthed(Boolean(readSession()));
  }, [pathname]);

  return (
    <header className={`hdr${open ? " open" : ""}`}>
      <div className="wrap hdr-in">
        <Link href="/" className="logo" onClick={() => setOpen(false)}>
          <img className="brand-icon" src="/cnmcp-icon.svg" alt="" width="26" height="26" />
          <span className="brand-lockup"><b>CNMCP</b><small>AI 开源社区</small></span>
        </Link>
        <nav className="nav" aria-label="主导航">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={link.match(pathname) ? "on" : undefined} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hdr-r">
          <Link href={authed ? "/me" : githubLoginUrl(pathname || "/me")}>{authed ? "我的" : "GitHub 登录"}</Link>
          <ThemeToggle />
          <button type="button" className="tgl menu-btn" aria-label={open ? "关闭菜单" : "打开菜单"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>☰</button>
        </div>
      </div>
    </header>
  );
}
