"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { readSession } from "@/lib/browser-session";
import { githubLoginUrl } from "@/lib/public-api";

/**
 * 提交入口：未登录走 OAuth 回跳当前路径，已登录跳 /submit。
 * 用于空状态 CTA 与首页 rail 渐变卡（phase2 §2.1）。
 */
export function SubmitCta({
  className = "btn btn-p",
  children,
  returnTo = "/",
}: {
  className?: string;
  children: ReactNode;
  returnTo?: string;
}) {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(readSession()));
  }, []);

  if (authed) {
    return (
      <Link className={className} href="/submit">
        {children}
      </Link>
    );
  }
  return (
    <a className={className} href={githubLoginUrl(returnTo)}>
      {children}
    </a>
  );
}

/** 「星芒起点」空状态（phase1 §3.9）：每个空状态都必须给出下一步动作。 */
export function EmptyState({
  title,
  desc,
  cta = "提交 GitHub 仓库",
  returnTo = "/",
}: {
  title: string;
  desc?: string;
  cta?: string | null;
  returnTo?: string;
}) {
  return (
    <div className="empty empty--cta">
      <span className="empty-star" aria-hidden="true">
        ✦
      </span>
      <p className="empty-title">{title}</p>
      {desc ? <p className="empty-desc">{desc}</p> : null}
      {cta ? <SubmitCta returnTo={returnTo}>{cta}</SubmitCta> : null}
    </div>
  );
}
