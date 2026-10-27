"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { authHeaders, captureSessionFromHash, readSession } from "@/lib/browser-session";
import { getPublicApiUrl, githubLoginUrl } from "@/lib/public-api";

export function SubmitForm() {
  const [repoUrl, setRepoUrl] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [message, setMessage] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    captureSessionFromHash();
    setSignedIn(Boolean(readSession()));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!readSession()) {
      window.location.href = githubLoginUrl("/submit");
      return;
    }
    setPending(true);
    setMessage("");
    setSlug(null);
    try {
      const response = await fetch(`${getPublicApiUrl()}/v1/submissions`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ repoUrl, recommendation: recommendation || undefined }),
      });
      const body = (await response.json()) as { projectSlug?: string; status?: string; error?: { message?: string } };
      if (!response.ok || !body.projectSlug) {
        setMessage(body.error?.message ?? "提交没有成功");
        return;
      }
      setSlug(body.projectSlug);
      setMessage(body.status === "duplicate" ? "这个仓库已经在站上，没有重复建档。" : "已上架。检查会在后台继续，未完成不等于有风险。");
    } catch {
      setMessage("网络请求失败，请稍后再试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      {!signedIn ? <p>提交需要 GitHub 登录。<Link href={githubLoginUrl("/submit")}>去登录</Link></p> : null}
      <label className="field">
        GitHub 仓库地址
        <input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repo" required />
      </label>
      <label className="field">
        推荐语（可选，不会覆盖仓库简介）
        <textarea value={recommendation} onChange={(event) => setRecommendation(event.target.value)} maxLength={500} rows={4} />
      </label>
      <button className="btn btn-p" type="submit" disabled={pending}>{pending ? "正在提交…" : "提交并上架"}</button>
      {message ? <p role="status">{message}</p> : null}
      {slug ? <Link href={`/projects/${slug}`}>查看项目</Link> : null}
    </form>
  );
}
