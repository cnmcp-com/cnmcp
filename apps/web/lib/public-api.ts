export function getPublicApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
}

export function getPublicSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function githubLoginUrl(path = "/me"): string {
  const target = `${getPublicSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  return `${getPublicApiUrl()}/v1/auth/github?return_to=${encodeURIComponent(target)}`;
}
