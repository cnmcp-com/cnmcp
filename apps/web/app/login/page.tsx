import type { Metadata } from "next";

import { githubLoginUrl } from "@/lib/public-api";

export const metadata: Metadata = { title: "登录", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <div className="wrap stack" style={{ padding: "28px 0 48px", maxWidth: 680 }}>
      <h1>使用 GitHub 登录</h1>
      <p>评分、评论、点赞、收藏和提交都使用 GitHub 身份。只读页面不需要登录。</p>
      <a className="btn btn-p" href={githubLoginUrl("/me")}>继续使用 GitHub</a>
    </div>
  );
}
