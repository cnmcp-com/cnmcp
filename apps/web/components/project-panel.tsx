"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectCard, ProjectDetail, ReviewItem, ScanEvidence } from "@cnmcp/schema";

import type { CategoryItem, ProjectTypeItem } from "@/lib/api";
import { authHeaders, captureSessionFromHash, readSession } from "@/lib/browser-session";
import { getPublicApiUrl, githubLoginUrl } from "@/lib/public-api";
import {
  clueNumber,
  clueString,
  detailTags,
  displayTitle,
  formatCompact,
  formatRelative,
  headerSummary,
  isProgrammingLanguageTag,
  securityAxis,
  securityPanelTone,
  severityLabel,
} from "@/lib/project-present";
import { formatDateShort } from "@/lib/ui";
import { ProjectCards } from "./project-list";
import { IconBookmark, IconGitHub, IconLike, IconShare, IconShield, IconStar } from "./icons";

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
  const [message, setMessage] = useState("");
  const [authed, setAuthed] = useState(false);
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(project.category?.slug ?? "");
  const [secondary, setSecondary] = useState(project.secondaryCategories.map((item) => item.slug).join(","));
  const [type, setType] = useState(project.type?.slug ?? "");
  const [likeCount, setLikeCount] = useState(project.likeCount);
  const [favoriteCount, setFavoriteCount] = useState(project.favoriteCount);
  const api = getPublicApiUrl();
  const listed = project.status === "listed";
  const heading = displayTitle(project);
  const summary = headerSummary(project);
  const tags = detailTags(project);
  const staticAxis = securityAxis(project.security.staticStatus);
  const tone = securityPanelTone(project.security.staticStatus);
  const forks = clueNumber(project.security.clues, "forks");
  const openIssues = clueNumber(project.security.clues, "openIssues");
  const license = clueString(project.security.clues, "license");
  const defaultBranch = clueString(project.security.clues, "defaultBranch");
  const evidence = Array.isArray(project.security.evidence) ? project.security.evidence : [];
  const introTopics = (Array.isArray(project.topics) ? project.topics : []).filter(
    (topic) => !isProgrammingLanguageTag(topic, project.language) && !tags.some((tag) => tag.toLowerCase() === topic.toLowerCase()),
  );

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
      setMessage("链接已复制");
    } catch {
      setMessage("复制没有成功，请手动复制地址栏");
    }
  }

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
        <div className="detail-title">
          <span className="repo-mark" aria-hidden="true">
            <IconGitHub className="icon icon-lg" />
          </span>
          <div>
            <h1>{heading}</h1>
            <p className="hg-repo">
              <a href={project.repoUrl} target="_blank" rel="noopener noreferrer">{project.repoKey}</a>
            </p>
          </div>
        </div>
        <div className="detail-chips">
          {project.category ? (
            <Link className="domain-chip" href={`/categories/${encodeURIComponent(project.category.slug)}`}>{project.category.name}</Link>
          ) : (
            <span className="domain-chip">未分类</span>
          )}
          {project.secondaryCategories.map((item) => (
            <Link key={item.slug} className="domain-chip" href={`/categories/${encodeURIComponent(item.slug)}`}>{item.name}</Link>
          ))}
          {tags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
        <div className="detail-facts">
          {project.language ? <span>{project.language}</span> : null}
          <span className="fact-stars"><IconStar className="icon" /> {formatCompact(project.stars)}</span>
          {project.ratingAvg != null ? <span>评分 {project.ratingAvg}/5 · {project.ratingCount} 人</span> : <span>还没有评分</span>}
        </div>
        {summary ? <p className="detail-summary">{summary}</p> : null}
      </header>

      {listed ? (
        <div className="action-bar">
          <a className="action" href={project.repoUrl} target="_blank" rel="noopener noreferrer">
            <IconGitHub className="icon" /> GitHub
          </a>
          <div className="rate-control" aria-label="评分">
            <span className="rate-label">评分</span>
            <div className="rate-stars">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" className={value <= stars ? "on" : undefined} aria-label={`${value} 星`} aria-pressed={value <= stars} onClick={() => {
                  setStars(value);
                  void send(`/v1/projects/${project.slug}/rating`, "PUT", { stars: value, note });
                }}>
                  <IconStar className="icon" />
                </button>
              ))}
            </div>
            <span className="rate-avg">{project.ratingAvg != null ? `${project.ratingAvg}/5` : "—"}</span>
          </div>
          <button type="button" className="action" aria-pressed={Boolean(me?.liked)} onClick={() => {
            const was = me?.liked ?? false;
            void send(`/v1/projects/${project.slug}/like`, "POST", {}).then((data) => {
              if (!data || !("liked" in data)) return;
              const liked = Boolean((data as { liked: boolean }).liked);
              if (was !== liked) setLikeCount((count) => Math.max(0, count + (liked ? 1 : -1)));
              setMe((current) => ({ ...(current ?? { rating: null, canEdit: false, collected: false }), liked }));
            });
          }}>
            <IconLike className="icon" /> 点赞 {formatCompact(likeCount)}
          </button>
          <button type="button" className="action" aria-pressed={Boolean(me?.collected)} onClick={() => {
            if (me?.collected) {
              setMessage("已在默认收藏夹");
              return;
            }
            void send(`/v1/projects/${project.slug}/favorite`, "POST", {}).then((data) => {
              if (!data) return;
              setFavoriteCount((count) => count + 1);
              setMe((current) => ({ ...(current ?? { rating: null, canEdit: false, liked: false }), collected: true }));
              setMessage("已放进默认收藏夹");
            });
          }}>
            <IconBookmark className="icon" /> 收藏 {formatCompact(favoriteCount)}
          </button>
          <button type="button" className="action" onClick={() => void share()}>
            <IconShare className="icon" /> 分享
          </button>
          {message ? <p className="action-status" role="status">{message}</p> : null}
          {!authed ? <p className="action-hint">登录后才能评分、点赞和收藏。<Link href={githubLoginUrl(`/projects/${project.slug}`)}>GitHub 登录</Link></p> : null}
        </div>
      ) : null}

      <section className={`section-block security-panel tone-${tone}`} aria-labelledby="security-heading">
        <div className="security-head">
          <h2 id="security-heading"><IconShield className="icon" /> 安全结论</h2>
          <p>{staticAxis.note}</p>
          <p className="security-when">{project.security.scannedAt ? `最近检查 ${formatDateShort(project.security.scannedAt)}` : "还没有完成检查"}</p>
        </div>
        <article className={`security-cell tone-${staticAxis.tone}`}>
          <span className="axis-k">静态分析</span>
          <strong>{staticAxis.label}</strong>
          <p>{staticAxis.note}</p>
        </article>
        <details className="evidence">
          <summary>查看证据（{evidence.length} 项）</summary>
          {evidence.length ? (
            <ul>
              {evidence.map((item) => (
                <EvidenceRow key={`${item.code}-${item.subject}-${item.detail}`} item={item} />
              ))}
            </ul>
          ) : (
            <p>还没有静态检查证据。</p>
          )}
        </details>
      </section>

      <section className="section-block" aria-labelledby="intro-heading">
        <h2 id="intro-heading">项目介绍</h2>
        <div className="prose">
          {summary ? <p>{summary}</p> : heading === project.title ? <p className="muted">还没有项目介绍。</p> : <p>{heading}</p>}
          {project.homepage ? <p><a href={project.homepage} target="_blank" rel="noopener noreferrer">项目主页</a></p> : null}
          {introTopics.length ? <p className="muted">主题：{introTopics.join("、")}</p> : null}
        </div>
      </section>

      <section className="section-block" aria-labelledby="snapshot-heading">
        <h2 id="snapshot-heading">仓库快照</h2>
        <div className="snapshot-grid">
          <article>
            <span>Stars</span>
            <strong>{formatCompact(project.stars)}</strong>
          </article>
          <article>
            <span>Forks</span>
            <strong>{forks == null ? "—" : formatCompact(forks)}</strong>
          </article>
          <article>
            <span>最近推送</span>
            <strong>{formatRelative(project.pushedAt)}</strong>
          </article>
          <article>
            <span>开源协议</span>
            <strong>{license ?? "未标明"}</strong>
          </article>
        </div>
        <dl className="snapshot-meta">
          <div>
            <dt>语言</dt>
            <dd>{project.language ?? "未标注"}</dd>
          </div>
          <div>
            <dt>归档</dt>
            <dd>{project.archived ? "已归档" : "维护中"}</dd>
          </div>
          {defaultBranch ? (
            <div>
              <dt>默认分支</dt>
              <dd>{defaultBranch}</dd>
            </div>
          ) : null}
          {openIssues != null ? (
            <div>
              <dt>未关闭 issue</dt>
              <dd>{formatCompact(openIssues)}</dd>
            </div>
          ) : null}
          <div>
            <dt>收录</dt>
            <dd>{formatDateShort(project.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="section-block" aria-labelledby="feedback-heading">
        <h2 id="feedback-heading">社区反馈</h2>
        <div className="feedback">
          <div className="feedback-score">
            <strong>{project.ratingAvg != null ? project.ratingAvg.toFixed(1) : "—"}<small>/5</small></strong>
            <p>{project.ratingCount ? `基于 ${project.ratingCount} 条评分` : "还没有评分"}</p>
            <p className="muted">点赞 {formatCompact(likeCount)} · 收藏 {formatCompact(favoriteCount)}</p>
          </div>
          <div className="feedback-list">
            {items.length ? items.map((review) => (
              <article key={review.id} className="comment">
                <span className="avatar" aria-hidden="true">
                  {review.author.avatarUrl ? <img src={review.author.avatarUrl} alt="" /> : review.author.login.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <header>
                    <b>{review.author.login}</b>
                    <time dateTime={review.createdAt}>{formatRelative(review.createdAt)}</time>
                  </header>
                  {review.title ? <h3>{review.title}</h3> : null}
                  <p>{review.body}</p>
                </div>
              </article>
            )) : <p className="muted">还没有评论。</p>}
          </div>
        </div>
        {listed ? (
          <div className="feedback-forms">
            <label className="field">评分短评（可选）
              <input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
            </label>
            <button className="btn btn-s btn-sm" type="button" onClick={() => {
              if (!stars) {
                setMessage("先选 1 到 5 星");
                return;
              }
              void send(`/v1/projects/${project.slug}/rating`, "PUT", { stars, note }).then((data) => {
                if (data) setMessage("评分已保存");
              });
            }}>保存短评</button>
            <form className="stack" onSubmit={(event) => {
              event.preventDefault();
              void send(`/v1/projects/${project.slug}/reviews`, "POST", { title, body }).then((data) => {
                if (!data) return;
                setItems((current) => [{ id: `local-${Date.now()}`, title: title || null, body, createdAt: new Date().toISOString(), author: { login: "我", avatarUrl: null } }, ...current]);
                setTitle("");
                setBody("");
                setMessage("评论已发布");
              });
            }}>
              <label className="field">体验标题（可选）<input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} /></label>
              <label className="field">评论 / 体验<textarea value={body} required maxLength={4000} rows={4} onChange={(event) => setBody(event.target.value)} /></label>
              <button className="btn btn-p btn-sm" type="submit">发布评论</button>
            </form>
            {me?.canEdit ? (
              <details className="editor">
                <summary>维护分类与类型</summary>
                <form className="stack" onSubmit={(event) => {
                  event.preventDefault();
                  const secondaryCategorySlugs = secondary.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
                  void send(`/v1/projects/${project.slug}`, "PATCH", { primaryCategorySlug: category || null, primaryTypeSlug: type || null, secondaryCategorySlugs }).then((data) => {
                    if (data) setMessage("分类已保存，刷新后可见");
                  });
                }}>
                  <label className="field">领域
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
                  <label className="field">次领域 slug，用逗号分隔<input value={secondary} onChange={(event) => setSecondary(event.target.value)} /></label>
                  <button className="btn btn-s btn-sm" type="submit">保存分类</button>
                </form>
              </details>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="section-block" aria-labelledby="related-heading">
        <h2 id="related-heading">相关推荐</h2>
        <p className="section-note">同一领域，或同一类型标签。</p>
        <ProjectCards items={related} variant="related" empty="暂时没有同领域或同类型的项目。" />
      </section>
    </div>
  );
}

function EvidenceRow({ item }: { item: ScanEvidence }) {
  return (
    <li>
      <span className={`sev sev-${item.severity}`}>{severityLabel(item.severity)}</span>
      <span className="mono">{item.code}</span>
      <span>{item.detail}</span>
    </li>
  );
}
