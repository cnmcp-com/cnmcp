"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectCard, ProjectDetail, ReviewItem, ScanEvidence } from "@cnmcp/schema";

import type { CategoryItem, ProjectTypeItem } from "@/lib/api";
import { authHeaders, captureSessionFromHash, readSession, writeSession } from "@/lib/browser-session";
import { getPublicApiUrl, githubLoginUrl } from "@/lib/public-api";
import {
  clueNumber,
  clueString,
  displayTitle,
  formatCompact,
  formatRelative,
  headerSummary,
  securityAxis,
} from "@/lib/project-present";
import {
  avatarColorClass,
  formatDateShort,
  securityPillClass,
  securityPillText,
  typeBadgeClass,
  typeTileClass,
  typeTileLetter,
} from "@/lib/ui";
import { ProjectCards } from "./project-list";
import { IconCode, IconGitHub, IconBookmark, IconLike, IconShare, IconStar } from "./icons";
import { toast } from "./toast";

type MeState = { liked: boolean; rating: { stars: number; note: string | null } | null; canEdit: boolean; collected: boolean };

export function ProjectDetailView({
  project,
  reviews,
  categories,
  types,
  related,
}: {
  project: ProjectDetail;
  reviews: ReviewItem[];
  categories: CategoryItem[];
  types: ProjectTypeItem[];
  related: ProjectCard[];
}) {
  const [me, setMe] = useState<MeState | null>(null);
  const [items, setItems] = useState(reviews);
  const [authed, setAuthed] = useState(false);
  const [stars, setStars] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(project.category?.slug ?? "");
  const [secondary, setSecondary] = useState(project.secondaryCategories.map((item) => item.slug).join(","));
  const [type, setType] = useState(project.type?.slug ?? "");
  const [likeCount, setLikeCount] = useState(project.likeCount);
  const [favoriteCount, setFavoriteCount] = useState(project.favoriteCount);
  const [pending, setPending] = useState(false);
  const api = getPublicApiUrl();

  const listed = project.status === "listed";
  const heading = displayTitle(project);
  const summary = headerSummary(project);
  const detailPath = `/projects/${project.slug}`;
  const axis = securityAxis(project.security.staticStatus);
  const tone = axis.tone === "ok" ? "clear" : axis.tone === "warn" ? "warn" : axis.tone === "bad" ? "risk" : project.security.staticStatus === "scan_failed" ? "failed" : "pending";
  const license = clueString(project.security.clues, "license") ?? clueString(project.security.clues, "spdxId");
  const forks = clueNumber(project.security.clues, "forks");
  const evidence = Array.isArray(project.security.evidence) ? project.security.evidence : [];
  const isMcp = project.type?.slug === "mcp";
  const tools = project.mcp?.tools ?? [];

  useEffect(() => {
    captureSessionFromHash();
    setAuthed(Boolean(readSession()));
    if (!readSession()) return;
    fetch(`${api}/v1/projects/${project.slug}/me`, { headers: authHeaders() })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: (MeState & { collectionIds?: string[] }) | null) => {
        if (!data) return;
        const collected = Array.isArray(data.collectionIds) && data.collectionIds.length > 0;
        setMe({ liked: data.liked, rating: data.rating, canEdit: data.canEdit, collected });
        setStars(data.rating?.stars ?? 0);
        setNote(data.rating?.note ?? "");
      })
      .catch(() => undefined);
  }, [api, project.slug]);

  /** 写入统一出口：未登录整页跳 OAuth（return_to=当前详情路径），401 清会话。 */
  async function send(path: string, method: string, payload?: unknown): Promise<Record<string, unknown> | null> {
    if (!readSession()) {
      window.location.href = githubLoginUrl(detailPath);
      return null;
    }
    try {
      const response = await fetch(`${api}${path}`, {
        method,
        headers: authHeaders(),
        body: payload == null ? undefined : JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (response.status === 401) {
        writeSession(null);
        setAuthed(false);
        toast("登录已过期，请重新登录");
        return null;
      }
      if (!response.ok) {
        toast(data.error?.message ?? "操作没有成功，请稍后再试");
        return null;
      }
      return data as Record<string, unknown>;
    } catch {
      toast("网络请求失败，请稍后再试");
      return null;
    }
  }

  async function saveRating(value: number) {
    const previous = stars;
    setStars(value);
    const data = await send(`/v1/projects/${project.slug}/rating`, "PUT", { stars: value, note });
    if (data) toast("评分已保存");
    else setStars(previous);
  }

  async function toggleLike() {
    const was = me?.liked ?? false;
    const data = await send(`/v1/projects/${project.slug}/like`, "POST", {});
    if (!data || !("liked" in data)) return;
    const liked = Boolean(data.liked);
    if (was !== liked) setLikeCount((count) => Math.max(0, count + (liked ? 1 : -1)));
    setMe((current) => ({ ...(current ?? { rating: null, canEdit: false, collected: false }), liked }));
  }

  async function toggleCollect() {
    if (me?.collected) {
      toast("已在默认收藏夹");
      return;
    }
    const data = await send(`/v1/projects/${project.slug}/favorite`, "POST", {});
    if (!data) return;
    setFavoriteCount((count) => count + 1);
    setMe((current) => ({ ...(current ?? { rating: null, canEdit: false, liked: false }), collected: true }));
    toast("已放进默认收藏夹");
  }

  async function share() {
    const url = window.location.href;
    const nav = navigator as Navigator & { share?: (data: { title?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: heading, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("链接已复制");
    } catch {
      toast("复制没有成功，请手动复制地址栏");
    }
  }

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    const data = await send(`/v1/projects/${project.slug}/reviews`, "POST", { title, body });
    setPending(false);
    if (!data) return;
    setItems((current) => [
      { id: `local-${Date.now()}`, title: title || null, body, createdAt: new Date().toISOString(), author: { login: "我", avatarUrl: null } },
      ...current,
    ]);
    setTitle("");
    setBody("");
    toast("评论已发布");
  }

  const shownStars = hoverStar || stars;
  const ratingAvg = project.ratingAvg;

  return (
    <div className="detail">
      <nav className="crumb" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span aria-hidden="true">/</span>
        <Link href="/projects">发现</Link>
        <span aria-hidden="true">/</span>
        <span>{project.repoKey}</span>
      </nav>

      <header className="detail-head">
        <span className={`tile ${typeTileClass(project.type?.slug)}`} aria-hidden="true">
          {typeTileLetter(project.type?.slug, project.type?.name)}
        </span>
        <div className="detail-title">
          <h1>
            {heading}
            {project.type ? <span className={`pill ${typeBadgeClass(project.type.slug)}`}>{project.type.name}</span> : null}
            <span className={`pill s-pill s-sm ${securityPillClass(project.securityStatus)}`}>
              <i className="dot" aria-hidden="true" />
              {securityPillText(project.securityStatus)}
            </span>
          </h1>
          <p className="detail-repo">
            <a href={project.repoUrl} target="_blank" rel="noopener noreferrer">
              {project.repoKey}
            </a>
          </p>
          <div className="detail-facts">
            {project.category ? <Link href={`/categories/${encodeURIComponent(project.category.slug)}`}>{project.category.name}</Link> : <span>未分类</span>}
            {project.language ? (
              <span>
                <IconCode className="icon" />
                {project.language}
              </span>
            ) : null}
            <span>
              <IconStar className="icon" />
              {formatCompact(project.stars)}
            </span>
          </div>
        </div>
      </header>

      {listed ? (
        <div className="act-bar" role="group" aria-label="项目操作">
          <a className="act" href={project.repoUrl} target="_blank" rel="noopener noreferrer">
            <b>
              <IconGitHub className="icon" />
            </b>
            <span>GitHub</span>
          </a>
          <button type="button" className={me?.liked ? "act on" : "act"} aria-pressed={Boolean(me?.liked)} onClick={() => void toggleLike()}>
            <b>
              <IconLike className="icon" />
              {formatCompact(likeCount)}
            </b>
            <span>点赞</span>
          </button>
          <button type="button" className={me?.collected ? "act on" : "act"} aria-pressed={Boolean(me?.collected)} onClick={() => void toggleCollect()}>
            <b>
              <IconBookmark className="icon" />
              {formatCompact(favoriteCount)}
            </b>
            <span>收藏</span>
          </button>
          <button
            type="button"
            className="act"
            onClick={() => document.getElementById("my-rating")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            <b>
              <IconStar className="icon" />
              {stars ? `${stars}.0` : "—"}
            </b>
            <span>我的评分</span>
          </button>
          <button type="button" className="act" onClick={() => void share()}>
            <b>
              <IconShare className="icon" />
            </b>
            <span>分享</span>
          </button>
          {!authed ? (
            <p className="action-hint">
              登录后才能评分、点赞和收藏。<a href={githubLoginUrl(detailPath)}>GitHub 登录</a>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="dt-body">
        <div className="dt-main">
          <section className={`sec-box tone-${tone}`} aria-labelledby="security-heading">
            <h2 id="security-heading">
              安全结论
              <span className={`pill s-pill s-sm ${securityPillClass(project.security.staticStatus)}`}>
                <i className="dot" aria-hidden="true" />
                {securityPillText(project.security.staticStatus)}
              </span>
            </h2>
            <div className="sec-bd">
              <p className="sec-note">{axis.note}</p>
              <p className="field-hint" style={{ marginTop: 6 }}>
                {project.security.scannedAt ? `最近检查 ${formatDateShort(project.security.scannedAt)}` : "还没有完成检查"}
              </p>
              <details className="evidence">
                <summary>查看证据（{evidence.length} 项）</summary>
                {evidence.length ? (
                  <ul>
                    {evidence.map((item) => (
                      <EvidenceRow key={`${item.code}-${item.subject}`} item={item} />
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0 }}>还没有静态检查证据。</p>
                )}
              </details>
            </div>
          </section>

          <section className="sec-box" aria-labelledby="intro-heading">
            <h2 id="intro-heading">项目介绍</h2>
            <div className="sec-bd">
              <div className="prose">
                {summary ? <p>{summary}</p> : <p className="muted">还没有项目介绍。</p>}
                {project.recommendation?.trim() ? <p className="blurb">{project.recommendation}</p> : null}
                {project.homepage ? (
                  <p>
                    <a href={project.homepage} target="_blank" rel="noopener noreferrer">
                      项目主页<span className="sr-only">（在新窗口打开）</span>
                    </a>
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="sec-box" aria-labelledby="rating-heading">
            <h2 id="rating-heading">评分与体验</h2>
            <div className="sec-bd">
              <div className="score-line">
                <span className="score-big">
                  {ratingAvg != null ? ratingAvg.toFixed(1) : "—"}
                  <small>/5</small>
                </span>
                <span className="stars" aria-hidden="true">
                  {"★".repeat(Math.round(ratingAvg ?? 0))}
                  {"☆".repeat(5 - Math.round(ratingAvg ?? 0))}
                </span>
                <span className="field-hint">{project.ratingCount ? `基于 ${project.ratingCount} 条评分` : "还没有评分"}</span>
              </div>

              {listed ? (
                <div style={{ marginTop: 14 }}>
                  <span className="lbl" id="my-rating-label">
                    我的评分
                  </span>
                  <div
                    className="rate-stars"
                    role="radiogroup"
                    aria-label="我的评分"
                    id="my-rating"
                    tabIndex={-1}
                    onMouseLeave={() => setHoverStar(0)}
                    style={{ marginTop: 6 }}
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={stars === value}
                        aria-label={`${value} 星`}
                        className={value <= shownStars ? "on" : undefined}
                        onMouseEnter={() => setHoverStar(value)}
                        onClick={() => void saveRating(value)}
                      >
                        <IconStar className="icon" />
                      </button>
                    ))}
                  </div>
                  <div className="field" style={{ marginTop: 10, maxWidth: 420 }}>
                    <label className="lbl" htmlFor="rating-note">
                      短评 <span className="opt">（可选）</span>
                    </label>
                    <input id="rating-note" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="一句话说明理由" />
                    <div>
                      <button
                        type="button"
                        className="btn btn-s btn-sm"
                        disabled={!stars}
                        onClick={() => void saveRating(stars)}
                      >
                        保存短评
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: 16 }}>
                {items.length ? (
                  items.map((review) => <ReviewRow key={review.id} review={review} />)
                ) : (
                  <div className="empty" style={{ marginTop: 4 }}>
                    <p className="empty-title">还没有评论。</p>
                    <p className="empty-desc">第一个分享体验的人，会帮到后面找工具的人。</p>
                  </div>
                )}
              </div>

              {listed ? (
                <form className="stack" style={{ marginTop: 16 }} onSubmit={submitReview}>
                  <div className="field">
                    <label className="lbl" htmlFor="review-title">
                      体验标题 <span className="opt">（可选）</span>
                    </label>
                    <input id="review-title" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
                  </div>
                  <div className="field">
                    <label className="lbl" htmlFor="review-body">
                      评论 / 体验
                    </label>
                    <textarea id="review-body" value={body} required maxLength={4000} rows={4} onChange={(event) => setBody(event.target.value)} />
                  </div>
                  <div>
                    <button className="btn btn-p" type="submit" disabled={pending} aria-busy={pending}>
                      {pending ? "正在发布…" : "发布评论"}
                    </button>
                  </div>
                </form>
              ) : null}

              {listed && me?.canEdit ? (
                <details className="editor">
                  <summary>维护分类与类型</summary>
                  <form
                    className="stack"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const secondaryCategorySlugs = secondary
                        .split(/[,，\s]+/)
                        .map((item) => item.trim())
                        .filter(Boolean);
                      void send(`/v1/projects/${project.slug}`, "PATCH", {
                        primaryCategorySlug: category || null,
                        primaryTypeSlug: type || null,
                        secondaryCategorySlugs,
                      }).then((data) => {
                        if (data) toast("分类已保存，刷新后可见");
                      });
                    }}
                  >
                    <div className="field">
                      <label className="lbl" htmlFor="edit-category">
                        领域
                      </label>
                      <select id="edit-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                        <option value="">未分类</option>
                        {categories.map((item) => (
                          <option key={item.slug} value={item.slug}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="lbl" htmlFor="edit-type">
                        类型
                      </label>
                      <select id="edit-type" value={type} onChange={(event) => setType(event.target.value)}>
                        <option value="">未定</option>
                        {types.map((item) => (
                          <option key={item.slug} value={item.slug}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="lbl" htmlFor="edit-secondary">
                        次领域 slug <span className="opt">（逗号分隔）</span>
                      </label>
                      <input id="edit-secondary" value={secondary} onChange={(event) => setSecondary(event.target.value)} />
                    </div>
                    <div>
                      <button className="btn btn-s" type="submit">
                        保存分类
                      </button>
                    </div>
                  </form>
                </details>
              ) : null}
            </div>
          </section>

          {isMcp ? (
            <section className="sec-box" aria-labelledby="tools-heading">
              <h2 id="tools-heading">mcp 工具列表</h2>
              <div className="sec-bd">
                {tools.length ? (
                  <ul className="tool-list">
                    {tools.map((tool) => (
                      <li key={tool.name}>
                        <b>{tool.name}</b>
                        {tool.description}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="field-hint" style={{ margin: 0 }}>
                    {project.mcp?.status === "ok" ? "这次握手没有返回工具。" : "还没有完成公开端点握手。这不是风险结论。"}
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="dt-side" aria-label="项目信息">
          <section className="sec-box">
            <h2>项目信息</h2>
            <dl className="kv">
              <div>
                <dt>领域</dt>
                <dd>{project.category?.name ?? "未分类"}</dd>
              </div>
              <div>
                <dt>类型</dt>
                <dd>{project.type?.name ?? "未定"}</dd>
              </div>
              {project.secondaryCategories.length ? (
                <div>
                  <dt>次分类</dt>
                  <dd>{project.secondaryCategories.map((item) => item.name).join("、")}</dd>
                </div>
              ) : null}
              <div>
                <dt>语言</dt>
                <dd>{project.language ?? "未标注"}</dd>
              </div>
              <div>
                <dt>Stars</dt>
                <dd>{formatCompact(project.stars)}</dd>
              </div>
              {forks != null ? (
                <div>
                  <dt>Forks</dt>
                  <dd>{formatCompact(forks)}</dd>
                </div>
              ) : null}
              <div>
                <dt>许可证</dt>
                <dd>{license ?? "未标明"}</dd>
              </div>
              <div>
                <dt>最近推送</dt>
                <dd>{formatRelative(project.pushedAt)}</dd>
              </div>
              <div>
                <dt>收录时间</dt>
                <dd>{formatDateShort(project.createdAt)}</dd>
              </div>
            </dl>
          </section>
          <a className="btn btn-p" href={project.repoUrl} target="_blank" rel="noopener noreferrer" style={{ justifyContent: "center" }}>
            <IconGitHub className="icon" />
            在 GitHub 打开仓库
            <span className="sr-only">（在新窗口打开）</span>
          </a>
        </aside>
      </div>

      <section className="sec-box" aria-labelledby="related-heading">
        <h2 id="related-heading">相关推荐</h2>
        <div className="sec-bd">
          <ProjectCards items={related} variant="related" empty="暂时没有同领域或同类型的项目。" />
        </div>
      </section>
    </div>
  );
}

function ReviewRow({ review }: { review: ReviewItem }) {
  const login = review.author.login;
  return (
    <article className="review">
      <span className={`av ${avatarColorClass(login)}`} aria-hidden="true">
        {review.author.avatarUrl ? <img src={review.author.avatarUrl} alt="" /> : login.slice(0, 1).toUpperCase()}
      </span>
      <div className="rc">
        <div className="who">
          {login}
          <time dateTime={review.createdAt}>{formatRelative(review.createdAt)}</time>
        </div>
        {review.title ? <p className="rt">{review.title}</p> : null}
        <p>{review.body}</p>
      </div>
    </article>
  );
}

function EvidenceRow({ item }: { item: ScanEvidence }) {
  const label = item.severity === "high" ? "高风险" : item.severity === "warn" ? "留意" : "信息";
  return (
    <li>
      <span className={`sev sev-${item.severity}`}>{label}</span>
      <span className="mono">{item.code}</span>
      <span>{item.detail}</span>
    </li>
  );
}
