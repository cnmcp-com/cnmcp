"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectDetail, ReviewItem } from "@cnmcp/schema";
import { SECURITY_LABEL, SECURITY_NOTE } from "@cnmcp/schema";

import type { CategoryItem, ProjectTypeItem } from "@/lib/api";
import { authHeaders, readSession } from "@/lib/browser-session";
import { getPublicApiUrl, githubLoginUrl } from "@/lib/public-api";

type MeState = { liked: boolean; rating: { stars: number; note: string | null } | null; canEdit: boolean };

export function ProjectPanel({
  project,
  reviews,
  categories,
  types,
}: {
  project: ProjectDetail;
  reviews: ReviewItem[];
  categories: CategoryItem[];
  types: ProjectTypeItem[];
}) {
  const [me, setMe] = useState<MeState | null>(null);
  const [items, setItems] = useState(reviews);
  const [message, setMessage] = useState("");
  const [authed, setAuthed] = useState(false);
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(project.category?.slug ?? "");
  const [secondary, setSecondary] = useState(project.secondaryCategories.map((item) => item.slug).join(","));
  const [type, setType] = useState(project.type?.slug ?? "");
  const api = getPublicApiUrl();
  const listed = project.status === "listed";

  useEffect(() => {
    setAuthed(Boolean(readSession()));
    if (!readSession()) return;
    fetch(`${api}/v1/projects/${project.slug}/me`, { headers: authHeaders() })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: MeState | null) => {
        if (!data) return;
        setMe(data);
        setStars(data.rating?.stars ?? 0);
        setNote(data.rating?.note ?? "");
      })
      .catch(() => undefined);
  }, [api, project.slug]);

  async function send(path: string, method: string, payload?: unknown) {
    if (!readSession()) {
      window.location.href = githubLoginUrl(`/projects/${project.slug}`);
      return null;
    }
    const response = await fetch(`${api}${path}`, { method, headers: authHeaders(), body: payload == null ? undefined : JSON.stringify(payload) });
    const data = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setMessage(data.error?.message ?? "操作没有成功");
      return null;
    }
    setMessage("");
    return data;
  }

  return (
    <div className="stack">
      <section className="card stack">
        <div className="meta-row">
          <span className={`pill ${project.security.status === "risk" ? "p-bad" : project.security.status === "warn" ? "p-warn" : project.security.status === "clear" ? "p-ok" : "p-info"}`}>
            {SECURITY_LABEL[project.security.status]}
          </span>
          <span>{project.category?.name ?? "未分类"}</span>
          <span>{project.type?.name ?? "类型未定"}</span>
        </div>
        <p>{SECURITY_NOTE[project.security.status]}</p>
        <details>
          <summary>查看检查证据</summary>
          <ul>
            {project.security.evidence.length ? project.security.evidence.map((item) => <li key={`${item.code}-${item.subject}`}>{item.code}：{item.detail}</li>) : <li>静态扫描还没有证据。</li>}
            {project.security.dynamicEvidence.map((item) => <li key={`${item.code}-${item.detail}`}>{item.code}：{item.detail}</li>)}
          </ul>
        </details>
      </section>
      {project.mcp ? (
        <section className="card stack">
          <h2>MCP 探测</h2>
          <p className="muted">{project.mcp.status}{project.mcp.protocolVersion ? ` · ${project.mcp.protocolVersion}` : ""}{project.mcp.error ? ` · ${project.mcp.error}` : ""}</p>
          {project.mcp.tools.length ? (
            <ul>{project.mcp.tools.map((tool) => <li key={tool.name}><b>{tool.name}</b> {tool.description}</li>)}</ul>
          ) : <p>还没有工具列表。</p>}
        </section>
      ) : null}
      {listed ? (
        <section className="card stack">
          <div className="action-row">
            <div className="stars" aria-label="评分">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" className={value <= stars ? "on" : undefined} onClick={() => { setStars(value); void send(`/v1/projects/${project.slug}/rating`, "PUT", { stars: value, note }); }}>★</button>
              ))}
            </div>
            <button type="button" className="btn btn-s btn-sm" onClick={() => void send(`/v1/projects/${project.slug}/like`, "POST", {}).then((data) => { if (data && "liked" in data) setMe((current) => ({ ...(current ?? { rating: null, canEdit: false }), liked: Boolean((data as { liked: boolean }).liked) })); })}>
              {me?.liked ? "已赞" : "点赞"}
            </button>
            <button type="button" className="btn btn-s btn-sm" onClick={() => void send(`/v1/projects/${project.slug}/favorite`, "POST", {}).then(() => setMessage("已放进默认收藏夹"))}>收藏</button>
            <button type="button" className="btn btn-g btn-sm" onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => setMessage("链接已复制"))}>复制链接</button>
          </div>
          <label className="field">短评（可选）<input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} /></label>
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            void send(`/v1/projects/${project.slug}/reviews`, "POST", { title, body }).then((data) => {
              if (!data) return;
              setItems((current) => [{ id: "local", title: title || null, body, createdAt: new Date().toISOString(), author: { login: "我", avatarUrl: null } }, ...current]);
              setTitle("");
              setBody("");
            });
          }}>
            <label className="field">体验标题（可选）<input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} /></label>
            <label className="field">评论 / 体验<textarea value={body} required maxLength={4000} rows={4} onChange={(event) => setBody(event.target.value)} /></label>
            <button className="btn btn-p btn-sm" type="submit">发布</button>
          </form>
          {me?.canEdit ? (
            <form className="stack" onSubmit={(event) => {
              event.preventDefault();
              const secondaryCategorySlugs = secondary.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
              void send(`/v1/projects/${project.slug}`, "PATCH", { primaryCategorySlug: category || null, primaryTypeSlug: type || null, secondaryCategorySlugs });
            }}>
              <label className="field">主分类
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">未分类</option>
                  {categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
              </label>
              <label className="field">类型
                <select value={type} onChange={(event) => setType(event.target.value)}>
                  <option value="">未定</option>
                  {types.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
              </label>
              <label className="field">次分类 slug，用逗号分隔<input value={secondary} onChange={(event) => setSecondary(event.target.value)} /></label>
              <button className="btn btn-s btn-sm" type="submit">保存分类</button>
            </form>
          ) : null}
          {message ? <p role="status">{message}</p> : null}
          {!authed ? <p className="muted">登录后才能评分、评论、点赞和收藏。<Link href={githubLoginUrl(`/projects/${project.slug}`)}>GitHub 登录</Link></p> : null}
        </section>
      ) : null}
      <section className="card stack">
        <h2>评论与体验</h2>
        {items.length ? items.map((review) => (
          <article key={review.id} className="review">
            <b>{review.title || "评论"}</b>
            <p>{review.body}</p>
            <small>{review.author.login} · {review.createdAt.slice(0, 10)}</small>
          </article>
        )) : <p className="muted">还没有评论。</p>}
      </section>
    </div>
  );
}
