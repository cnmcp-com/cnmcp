import type { Metadata } from "next";

import { githubLoginUrl } from "@/lib/public-api";

export const metadata: Metadata = { title: "登录", robots: { index: false, follow: false } };

type Search = { return_to?: string };

/** 只接受站内路径，防 open redirect（phase2 §2.7） */
function safeReturnTo(value: string | undefined): string {
  if (!value) return "/me";
  if (!value.startsWith("/") || value.startsWith("//")) return "/me";
  return value;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.return_to);

  return (
    <div className="wrap auth-wrap">
      <div className="gate-card">
        <h1 style={{ fontSize: 24, margin: 0 }}>使用 GitHub 登录</h1>
        <p className="muted" style={{ fontSize: 13.5, margin: 0, maxWidth: "46ch" }}>
          评分、评论、点赞、收藏和提交都使用 GitHub 身份。只读页面不需要登录。
        </p>
        <a className="btn btn-s" href={githubLoginUrl(returnTo)} style={{ justifyContent: "center", width: "100%", maxWidth: 320, minHeight: 48, marginTop: 8 }}>
          继续使用 GitHub
        </a>
        <p className="field-hint" style={{ margin: 0 }}>
          登录后会回到 {returnTo === "/me" ? "个人页" : returnTo}
        </p>
      </div>
    </div>
  );
}
