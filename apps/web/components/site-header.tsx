"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { captureSessionFromHash, readSession, writeSession } from "@/lib/browser-session";
import { getPublicApiUrl, githubLoginUrl } from "@/lib/public-api";
import { IconClose, IconGitHub, IconMenu } from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { toast } from "./toast";

const LINKS = [
  { href: "/", label: "发现", match: (path: string) => path === "/" },
  { href: "/projects", label: "项目", match: (path: string) => path.startsWith("/projects") || path.startsWith("/categories") },
  { href: "/search", label: "搜索", match: (path: string) => path.startsWith("/search") },
  { href: "/submit", label: "提交", match: (path: string) => path.startsWith("/submit") },
];

/** 内联星芒主标：内联才能吃到主题变量（phase1 §4） */
function BrandMark() {
  return (
    <svg className="mk" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="cnmcp-mark-grad" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B4DFF" />
          <stop offset="1" stopColor="#17B8E8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#cnmcp-mark-grad)" />
      <path
        d="M32 13 C33.8 25 39 30.2 51 32 C39 33.8 33.8 39 32 51 C30.2 39 25 33.8 13 32 C25 30.2 30.2 25 32 13 Z"
        fill="#FFFFFF"
      />
      <circle cx="32" cy="32" r="4" fill="#FFFFFF" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [returnTo, setReturnTo] = useState("/");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    captureSessionFromHash();
    setAuthed(Boolean(readSession()));
  }, [pathname]);

  // return_to = 当前路径 + 筛选参数（phase2 §0.2）。
  // 只读 window.location，避免 useSearchParams 把整棵页头推进 Suspense/CSR。
  useEffect(() => {
    setReturnTo(`${pathname}${window.location.search}`);
  }, [pathname]);

  // 移动菜单：展开时焦点移入第一项、Esc 关闭、锁定 body 滚动（phase2 §0.7）
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector("a, button");
    (first as HTMLElement | null)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function logout() {
    void fetch(`${getPublicApiUrl()}/v1/auth/logout`, { method: "POST" }).catch(() => undefined);
    writeSession(null);
    setAuthed(false);
    toast("已退出登录");
  }

  const loginHref = githubLoginUrl(returnTo || "/");

  return (
    <header className="hdr">
      <div className="wrap hdr-in">
        <Link href="/" className="logo" aria-label="CNMCP 首页" onClick={() => setOpen(false)}>
          <BrandMark />
          <span className="brand-lockup">
            <b>CNMCP</b>
            <small>AI 开源社区</small>
          </span>
        </Link>
        <nav className="nav" aria-label="主导航">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={link.match(pathname) ? "on" : undefined} aria-current={link.match(pathname) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hdr-r">
          {authed ? (
            <span className="hdr-me">
              <Link href="/me" className="hdr-avatar" aria-label="我的主页">
                <span aria-hidden="true">我</span>
              </Link>
              <button type="button" className="btn btn-g btn-sm" onClick={logout}>
                退出
              </button>
            </span>
          ) : (
            <a className="gh-login" href={loginHref}>
              <IconGitHub className="icon" />
              GitHub 登录
            </a>
          )}
          <ThemeToggle />
          <button
            type="button"
            className="tgl menu-btn"
            aria-label={open ? "关闭菜单" : "打开菜单"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <IconClose className="icon" /> : <IconMenu className="icon" />}
          </button>
        </div>
      </div>
      <div className={`wrap mobile-nav${open ? " open" : ""}`} ref={panelRef}>
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={link.match(pathname) ? "on" : undefined} aria-current={link.match(pathname) ? "page" : undefined} onClick={() => setOpen(false)}>
            {link.label}
          </Link>
        ))}
        {authed ? (
          <>
            <Link href="/me" className="on" onClick={() => setOpen(false)}>
              我的主页
            </Link>
            <button type="button" className="btn btn-g m-nav-logout" onClick={logout}>
              退出登录
            </button>
          </>
        ) : (
          <a className="gh-login" href={loginHref} onClick={() => setOpen(false)}>
            <IconGitHub className="icon" />
            GitHub 登录
          </a>
        )}
      </div>
    </header>
  );
}
