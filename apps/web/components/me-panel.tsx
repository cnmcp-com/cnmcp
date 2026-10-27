"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectCard, ReviewItem } from "@cnmcp/schema";

import { ProjectCards } from "@/components/project-list";
import { authHeaders, captureSessionFromHash, readSession, writeSession } from "@/lib/browser-session";
import { getPublicApiUrl, githubLoginUrl } from "@/lib/public-api";

type MeResponse = {
  login: string;
  projects: ProjectCard[];
  reviews: ReviewItem[];
  collections: Array<{ id: string; title: string; isPublic: boolean; itemCount: number }>;
  ratings: Array<{ stars: number; note: string | null; projectSlug: string; projectTitle: string }>;
  likes: ProjectCard[];
  submissions: Array<{ id: string; status: string; repoUrl: string; projectSlug: string | null }>;
};

export function MePanel() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState("");
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const api = getPublicApiUrl();

  function load() {
    const session = readSession();
    if (!session) {
      setMe(null);
      return;
    }
    fetch(`${api}/v1/me`, { headers: authHeaders() })
      .then(async (response) => {
        if (response.status === 401) {
          writeSession(null);
          setMe(null);
          return;
        }
        if (!response.ok) throw new Error("load");
        setMe((await response.json()) as MeResponse);
      })
      .catch(() => setError("个人页暂时加载失败"));
  }

  useEffect(() => {
    captureSessionFromHash();
    setAuthed(Boolean(readSession()));
    setReady(true);
    load();
  }, []);

  if (!ready) return <p>正在加载…</p>;
  if (!authed) {
    return <p>个人页需要 GitHub 登录。<Link href={githubLoginUrl("/me")}>使用 GitHub 登录</Link></p>;
  }
  if (!me) return <p>{error || "正在加载…"}</p>;

  return (
    <div className="stack">
      <div className="meta-row">
        <h1 style={{ margin: 0 }}>{me.login}</h1>
        <button type="button" className="btn btn-g btn-sm" onClick={() => { const session = readSession(); void fetch(`${api}/v1/auth/logout`, { method: "POST", headers: authHeaders() }); writeSession(null); setMe(null); void session; }}>退出</button>
      </div>
      <section className="stack">
        <h2>我提交的</h2>
        <ul>{me.submissions.map((item) => <li key={item.id}>{item.projectSlug ? <Link href={`/projects/${item.projectSlug}`}>{item.repoUrl}</Link> : item.repoUrl} · {item.status}</li>)}</ul>
        <ProjectCards items={me.projects} />
      </section>
      <section className="stack">
        <h2>我的评分</h2>
        <ul>{me.ratings.map((item) => <li key={item.projectSlug}><Link href={`/projects/${item.projectSlug}`}>{item.projectTitle}</Link> · {item.stars} 星 {item.note}</li>)}</ul>
      </section>
      <section className="stack">
        <h2>我的评论</h2>
        <ul>{me.reviews.map((item) => <li key={item.id}><Link href={`/projects/${item.projectSlug}`}>{item.projectTitle}</Link> · {item.body}</li>)}</ul>
      </section>
      <section className="stack">
        <h2>我赞过的</h2>
        <ProjectCards items={me.likes} />
      </section>
      <section className="card stack">
        <h2>收藏夹</h2>
        <ul>
          {me.collections.map((item) => <li key={item.id}><Link href={`/collections/${item.id}`}>{item.title}</Link> · {item.itemCount} 个 · {item.isPublic ? "公开" : "私有"}</li>)}
        </ul>
        <form className="stack" onSubmit={(event) => {
          event.preventDefault();
          void fetch(`${api}/v1/collections`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ title, isPublic }) })
            .then(() => { setTitle(""); load(); });
        }}>
          <label className="field">新建收藏夹<input value={title} required maxLength={80} onChange={(event) => setTitle(event.target.value)} /></label>
          <label><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} /> 公开</label>
          <button className="btn btn-s btn-sm" type="submit">创建</button>
        </form>
      </section>
    </div>
  );
}
