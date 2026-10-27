import type { ProjectDetail, ProjectListResponse, ReviewItem } from "@cnmcp/schema";

import { getPublicApiUrl } from "./public-api";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export { getPublicApiUrl };

export type CategoryItem = {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  projectCount: number;
};

export type ProjectTypeItem = {
  slug: string;
  name: string;
  sortOrder: number;
  enablesDynamicProbe: boolean;
};

export type PublicProfile = {
  login: string;
  avatarUrl: string | null;
  name: string | null;
  projects: ProjectListResponse["items"];
  reviews: ReviewItem[];
  collections: Array<{ id: string; title: string; isPublic: boolean; itemCount: number }>;
};

export type CollectionView = {
  id: string;
  title: string;
  isPublic: boolean;
  owner: { login: string };
  items: ProjectListResponse["items"];
};

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { next: { revalidate: 30 } });
  if (!response.ok) throw new Error(`API ${response.status} ${path}`);
  return (await response.json()) as T;
}

export async function fetchProjects(search = ""): Promise<ProjectListResponse> {
  return api(`/v1/projects${search ? `?${search}` : ""}`);
}

export async function fetchProject(slug: string): Promise<{ project: ProjectDetail; reviews: ReviewItem[] } | null> {
  const response = await fetch(`${API_URL}/v1/projects/${encodeURIComponent(slug)}`, { next: { revalidate: 30 } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${response.status}`);
  return (await response.json()) as { project: ProjectDetail; reviews: ReviewItem[] };
}

export async function fetchCategories(includeEmpty = false): Promise<CategoryItem[]> {
  const data = await api<{ items: CategoryItem[] }>(`/v1/categories${includeEmpty ? "?includeEmpty=1" : ""}`);
  return data.items;
}

export async function fetchProjectTypes(): Promise<ProjectTypeItem[]> {
  const data = await api<{ items: ProjectTypeItem[] }>("/v1/project-types");
  return data.items;
}

export async function fetchProfile(login: string): Promise<PublicProfile | null> {
  const response = await fetch(`${API_URL}/v1/users/${encodeURIComponent(login)}`, { next: { revalidate: 30 } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${response.status}`);
  return (await response.json()) as PublicProfile;
}

export async function fetchCollection(id: string): Promise<CollectionView | null> {
  const response = await fetch(`${API_URL}/v1/collections/${encodeURIComponent(id)}`, { next: { revalidate: 30 } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${response.status}`);
  return (await response.json()) as CollectionView;
}

export async function fetchStats(): Promise<{ projects: number; pendingScans: number }> {
  return api("/v1/stats");
}
