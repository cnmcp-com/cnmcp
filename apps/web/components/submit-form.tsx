"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { authHeaders, captureSessionFromHash, readSession } from "@/lib/browser-session";
import { getPublicApiUrl, githubLoginUrl } from "@/lib/public-api";
import { IconGitHub } from "./icons";
import { toast } from "./toast";

const GITHUB_URL_RE = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/i;

export function SubmitForm() {
  const [repoUrl, setRepoUrl] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [message, setMessage] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [pending, setPending] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    captureSessionFromHash();
    setSignedIn(Boolean(readSession()));
  }, []);

  const urlLooksOff = repoUrl.trim().length > 0 && !GITHUB_URL_RE.test(repoUrl.trim());

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
        body: JSON.stringify({ repoUrl: repoUrl.trim(), recommendation: recommendation || undefined }),
      });
      const body = (await response.json().catch(() => ({}))) as { projectSlug?: string; status?: string; error?: { message?: string } };
      if (response.status === 401) {
        toast("登录已过期，请重新登录");
        setMessage("登录已过期，请重新登录");
        return;
      }
      if (!response.ok || !body.projectSlug) {
        setMessage(body.error?.message ?? "操作没有成功，请稍后再试");
        return;
      }
      setSlug(body.projectSlug);
      setDuplicate(body.status === "duplicate");
      setMessage("");
    } catch {
      setMessage("网络请求失败，请稍后再试");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="sec-box">
      <h2>提交 GitHub 仓库</h2>
      <div className="sec-bd">
        {!signedIn ? (
          <p className="notice" style={{ marginBottom: 16 }}>
            提交需要 GitHub 身份。<a href={githubLoginUrl("/submit")} style={{ color: "var(--brand)", fontWeight: 600 }}>先去登录</a>，登录后会回到这一页。
          </p>
        ) : null}

        <form className="stack" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label className="lbl" htmlFor="repo-url">
              GitHub 仓库地址
            </label>
            <input
              id="repo-url"
              className={urlLooksOff ? "mono-input input-error" : "mono-input"}
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repo"
              aria-describedby={urlLooksOff ? "repo-url-hint repo-url-error" : "repo-url-hint"}
              required
            />
            <p className="field-hint" id="repo-url-hint">
              只收公开仓库。去掉末尾的 /tree、/issues 等路径。
            </p>
            {urlLooksOff ? (
              <p className="field-error" id="repo-url-error">
                看起来不是 https://github.com/owner/repo 的形态，仍然可以提交，最终以后端规范化结果为准。
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="lbl" htmlFor="recommendation">
              推荐语 <span className="opt">（可选，最多 500 字）</span>
            </label>
            <textarea
              id="recommendation"
              value={recommendation}
              onChange={(event) => setRecommendation(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="说说它解决什么问题，怎么用。不会覆盖仓库简介。"
            />
          </div>

          <div>
            <button className="btn btn-p" type="submit" disabled={pending} aria-busy={pending}>
              <IconGitHub className="icon" />
              {pending ? "正在提交…" : "提交并上架"}
            </button>
          </div>
        </form>

        {message ? (
          <p className="field-error" role="alert" style={{ marginTop: 14 }}>
            {message}
          </p>
        ) : null}

        {slug ? (
          <div className="sec-box" style={{ marginTop: 18, borderColor: "color-mix(in srgb, var(--s-clear) 32%, var(--border))" }}>
            <h2 style={{ color: "var(--s-clear)" }}>{duplicate ? "这个仓库已经在站上" : "已上架 ✦"}</h2>
            <div className="sec-bd">
              <p style={{ margin: 0 }}>
                {duplicate ? "这个仓库已经在站上，没有重复建档。" : "安全检查会在后台继续，未完成不等于有风险。"}
              </p>
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="btn btn-s" href={`/projects/${slug}`}>
                  查看项目
                </Link>
                <Link className="btn btn-g" href="/projects">
                  继续浏览
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
