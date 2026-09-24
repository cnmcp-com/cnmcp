import type { ActivityItem, CatalogIndex, ServerDetail, ServerSummary } from "@cnmcp/schema";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export function getPublicApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
}

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
  if (!response.ok) {
    throw new Error(`API ${response.status} ${path}`);
  }
  return (await response.json()) as T;
}

export async function fetchStats(): Promise<{
  total: number;
  remote: number;
  verified: number;
  reachable: number;
  dead: number;
  localUntested: number;
  unverifiable: number;
  official: number;
  staticChecked: number;
  configured: number;
  pricingKnown: number;
  gradeA: number;
  gradeB: number;
  lastVerifiedAt: string | null;
  probeLabel: string;
}> {
  return api("/v1/stats");
}

export async function fetchActivity(limit = 30): Promise<{ items: ActivityItem[] }> {
  return api(`/v1/activity?limit=${limit}`);
}

export async function fetchDirectory(search: string): Promise<{ items: ServerSummary[]; total: number; nextCursor: string | null }> {
  return api(`/v1/servers?${search}`);
}

export async function fetchServer(id: string): Promise<ServerDetail | null> {
  const response = await fetch(`${API_URL}/v1/servers/${encodeURIComponent(id)}`, { next: { revalidate: 60 } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${response.status}`);
  return (await response.json()) as ServerDetail;
}

export async function fetchCatalogIndex(): Promise<CatalogIndex> {
  return api("/data/servers-index.json");
}
