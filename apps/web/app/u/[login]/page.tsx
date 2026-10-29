import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CollectionCard } from "@/components/collection-card";
import { ProjectCards } from "@/components/project-list";
import { fetchProfile } from "@/lib/api";
import { formatRelative } from "@/lib/project-present";
import { avatarColorClass } from "@/lib/ui";

type Params = { login: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { login } = await params;
  return { title: decodeURIComponent(login) };
}

export default async function UserPage({ params }: { params: Promise<Params> }) {
  const { login } = await params;
  const profile = await fetchProfile(decodeURIComponent(login));
  if (!profile) notFound();
  const publicCollections = profile.collections.filter((item) => item.isPublic);

  return (
    <div className="wrap stack" style={{ padding: "28px 0 48px", maxWidth: 880, gap: 16 }}>
      <header className="meta-row">
        <span className="avatar" aria-hidden="true" style={{ width: 34, height: 34 }}>
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : profile.login.slice(0, 1).toUpperCase()}
        </span>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 720, letterSpacing: "-0.5px" }}>{profile.login}</h1>
        {profile.name ? <span className="muted">{profile.name}</span> : null}
      </header>

      <section className="sec-box">
        <h2>提交的项目</h2>
        <div className="sec-bd">
          {profile.projects.length ? (
            <ProjectCards items={profile.projects} />
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              还没有提交的项目。
            </p>
          )}
        </div>
      </section>

      <section className="sec-box">
        <h2>公开评论</h2>
        <div className="sec-bd">
          {profile.reviews.length ? (
            profile.reviews.map((review) => (
              <article key={review.id} className="review">
                <span className={`av ${avatarColorClass(review.author.login)}`} aria-hidden="true">
                  {review.author.avatarUrl ? <img src={review.author.avatarUrl} alt="" /> : review.author.login.slice(0, 1).toUpperCase()}
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
              还没有公开评论。
            </p>
          )}
        </div>
      </section>

      <section className="sec-box">
        <h2>公开收藏夹</h2>
        <div className="sec-bd">
          {publicCollections.length ? (
            <ul className="collections-grid" style={{ listStyle: "none", margin: 0, padding: 0 }} role="list">
              {publicCollections.map((item) => (
                <li key={item.id}>
                  <CollectionCard id={item.id} title={item.title} isPublic itemCount={item.itemCount} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              暂无公开收藏夹。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
