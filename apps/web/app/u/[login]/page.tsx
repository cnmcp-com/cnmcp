import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectCards } from "@/components/project-list";
import { fetchProfile } from "@/lib/api";

type Params = { login: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { login } = await params;
  return { title: decodeURIComponent(login) };
}

export default async function UserPage({ params }: { params: Promise<Params> }) {
  const { login } = await params;
  const profile = await fetchProfile(decodeURIComponent(login));
  if (!profile) notFound();
  return (
    <div className="wrap stack" style={{ padding: "28px 0 48px" }}>
      <h1>{profile.login}</h1>
      {profile.name ? <p className="muted">{profile.name}</p> : null}
      <section className="stack">
        <h2>提交的项目</h2>
        <ProjectCards items={profile.projects} />
      </section>
      <section className="stack">
        <h2>公开评论</h2>
        <ul>{profile.reviews.map((review) => <li key={review.id}><Link href={`/projects/${review.projectSlug}`}>{review.projectTitle}</Link> · {review.body}</li>)}</ul>
      </section>
      <section className="stack">
        <h2>公开收藏夹</h2>
        <ul>{profile.collections.map((item) => <li key={item.id}><Link href={`/collections/${item.id}`}>{item.title}</Link> · {item.itemCount}</li>)}</ul>
      </section>
    </div>
  );
}
