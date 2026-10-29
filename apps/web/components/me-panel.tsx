"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectCard, ReviewItem } from "@cnmcp/schema";

import { CollectionCard } from "@/components/collection-card";
import { ProjectCards } from "@/components/project-list";
import { authHeaders, captureSessionFromHash, readSession, writeSession } from "@/lib/browser-session";
import { getPublicApiUrl, githubLoginUrl } from "@/lib/public-api";
import { formatRelative } from "@/lib/project-present";
import { avatarColorClass } from "@/lib/ui";
import { toast } from "./toast";

type MeResponse = {
  login: string;
  projects: ProjectCard[];
  reviews: ReviewItem[];
  collections: Array<{ id: string; title: string; isPublic: boolean; itemCount: number }>;
  ratings: Array<{ stars: number; note: string | null; projectSlug: string; projectTitle: string }>;
  likes: ProjectCard[];
  submissions: Array<{ id: string; status: string; repoUrl: string; projectSlug: string | null }>;
};

const SUBMISSION_STATUS: Record<string, string> = {
  received: "已接收",
  duplicate: "重复",
  metadata_fetched: "元数据已拉取",
  retryable: "失败可重试",
  completed: "完成",
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
          setAuthed(false);
          setMe(null);
          toast("登录已过期，请重新登录");
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

  if (!ready) return <MeSkeleton />;
  if (!authed) {
    return (
      <div className="gate-card">
        <p className="empty-title">个人页需要 GitHub 登录</p>
        <p className="empty-desc">登录后可以看到提交记录、评分、评论和收藏夹。</p>
        <a className="btn btn-s" href={githubLoginUrl("/me")}>
          使用 GitHub 登录
        </a>
      </div>
    );
  }
  if (!me) return error ? <p className="field-error">{error}</p> : <MeSkeleton />;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <header className="meta-row">
        <span className="avatar" aria-hidden="true" style={{ width: 34, height: 34 }}>
          {me.login.slice(0, 1).toUpperCase()}
        </span>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 720, letterSpacing: "-0.5px" }}>{me.login}</h1>
        <Link className="btn btn-g btn-sm" href={`/u/${me.login}`} style={{ marginLeft: "auto" }}>
          公开主页
        </Link>
        <button
          type="button"
          className="btn btn-g btn-sm"
          onClick={() => {
            void fetch(`${api}/v1/auth/logout`, { method: "POST", headers: authHeaders() }).catch(() => undefined);
            writeSession(null);
            setAuthed(false);
            setMe(null);
            toast("已退出登录");
          }}
        >
          退出
        </button>
      </header>

      <section className="sec-box">
        <h2>收藏夹</h2>
        <div className="sec-bd">
          {me.collections.length ? (
            <div className="collections-grid">
              {me.collections.map((item) => (
                <CollectionCard key={item.id} id={item.id} title={item.title} isPublic={item.isPublic} itemCount={item.itemCount} />
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              还没有收藏夹，去发现页找找灵感 →{" "}
              <Link href="/" style={{ color: "var(--brand)" }}>
                去发现
              </Link>
            </p>
          )}

          <form
            className="stack"
            style={{ marginTop: 16, maxWidth: 420 }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!title.trim()) return;
              void fetch(`${api}/v1/collections`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ title, isPublic }) })
                .then((response) => {
                  if (!response.ok) throw new Error("create");
                  setTitle("");
                  setIsPublic(false);
                  load();
                  toast("收藏夹已创建");
                })
                .catch(() => toast("操作没有成功，请稍后再试"));
            }}
          >
            <div className="field">
              <label className="lbl" htmlFor="collection-title">
                新建收藏夹
              </label>
              <input id="collection-title" value={title} required maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="例如：视频字幕工具" />
            </div>
            <label className="meta-row" style={{ fontSize: 13, color: "var(--tx-2)" }} htmlFor="collection-public">
              <input id="collection-public" type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
              公开这个收藏夹
            </label>
            <div>
              <button className="btn btn-s btn-sm" type="submit">
                创建
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="sec-box">
        <h2>我提交的</h2>
        <div className="sec-bd">
          {me.submissions.length ? (
            <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "grid", gap: 8 }}>
              {me.submissions.map((item) => (
                <li key={item.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontSize: 13 }}>
                  <span className="mono" style={{ color: "var(--tx-2)" }}>
                    {item.repoUrl}
                  </span>
                  <span className="pill s-pill s-sm s-pending">{SUBMISSION_STATUS[item.status] ?? item.status}</span>
                  {item.projectSlug ? (
                    <Link href={`/projects/${item.projectSlug}`} style={{ color: "var(--brand)" }}>
                      查看项目
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              还没有提交记录。
            </p>
          )}
          {me.projects.length ? <ProjectCards items={me.projects} /> : null}
        </div>
      </section>

      <section className="sec-box">
        <h2>我的评分</h2>
        <div className="sec-bd">
          {me.ratings.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {me.ratings.map((item) => (
                <li key={item.projectSlug} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontSize: 13 }}>
                  <span className="stars" aria-hidden="true" style={{ fontSize: 12 }}>
                    {"★".repeat(Math.round(item.stars))}
                  </span>
                  <Link href={`/projects/${item.projectSlug}`}>{item.projectTitle}</Link>
                  {item.note ? <span className="muted">{item.note}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              还没有评分。
            </p>
          )}
        </div>
      </section>

      <section className="sec-box">
        <h2>我的评论</h2>
        <div className="sec-bd">
          {me.reviews.length ? (
            me.reviews.map((review) => (
              <article key={review.id} className="review">
                <span className={`av ${avatarColorClass(review.author.login)}`} aria-hidden="true">
                  {review.author.login.slice(0, 1).toUpperCase()}
                </span>
                <div className="rc">
                  <div className="who">
                    <Link href={`/projects/${review.projectSlug}`}>{review.projectTitle ?? review.projectSlug}</Link>
                    <time dateTime={review.createdAt}>{formatRelative(review.createdAt)}</time>
                  </div>
                  {review.title ? <p className="rt">{review.title}</p> : null}
                  <p>{review.body}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              还没有评论。
            </p>
          )}
        </div>
      </section>

      <section className="sec-box">
        <h2>我赞过的</h2>
        <div className="sec-bd">
          {me.likes.length ? (
            <ProjectCards items={me.likes} />
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              还没有点赞的项目。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function MeSkeleton() {
  return (
    <div className="stack" style={{ gap: 12 }} aria-busy="true">
      {[0, 1, 2].map((index) => (
        <div className="skel" key={index}>
          <span className="sk-tile" />
          <span className="sk-lines">
            <span className="sk-l w60" />
            <span className="sk-l w85" />
            <span className="sk-l w60" />
          </span>
        </div>
      ))}
    </div>
  );
}
