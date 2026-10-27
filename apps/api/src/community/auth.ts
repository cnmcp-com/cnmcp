import { HttpError, get, run, type SqlDatabase } from "./sql";

export type SessionUser = {
  id: string;
  login: string;
  avatarUrl: string | null;
  name: string | null;
};

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function secretsEqual(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (left: BufferSource, right: BufferSource) => boolean };
  if (typeof subtle.timingSafeEqual === "function") return subtle.timingSafeEqual(a, b);
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

export function allowedOrigins(header: string | undefined): string[] {
  return (header ?? "http://localhost:3000,https://www.cnmcp.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function safeReturnTo(returnTo: string | null | undefined, origins: string[]): string {
  const fallbackOrigin = origins[0] ?? "http://localhost:3000";
  const fallback = `${fallbackOrigin}/me`;
  if (!returnTo) return fallback;
  try {
    const url = new URL(returnTo);
    if (url.username || url.password || url.hash) return fallback;
    if (!origins.includes(url.origin)) return fallback;
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export async function userFromAuthorization(db: SqlDatabase, header: string | undefined, now = new Date()): Promise<SessionUser | null> {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const row = await get<{ id: string; login: string; avatar_url: string | null; name: string | null; expires_at: string }>(
    db,
    `SELECT u.id, u.login, u.avatar_url, u.name, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    token,
  );
  if (!row || Date.parse(row.expires_at) <= now.getTime()) return null;
  return { id: row.id, login: row.login, avatarUrl: row.avatar_url, name: row.name };
}

export async function createSession(db: SqlDatabase, userId: string, now = new Date()): Promise<string> {
  const id = crypto.randomUUID();
  await run(db, `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`, id, userId, new Date(now.getTime() + SESSION_TTL_MS).toISOString(), now.toISOString());
  return id;
}

export async function deleteSession(db: SqlDatabase, sessionId: string): Promise<void> {
  await run(db, `DELETE FROM sessions WHERE id = ?`, sessionId);
}

export async function upsertGitHubUser(
  db: SqlDatabase,
  profile: { id: string; login: string; avatarUrl: string | null; name: string | null },
  now = new Date(),
): Promise<void> {
  const timestamp = now.toISOString();
  await run(
    db,
    `INSERT INTO users (id, login, avatar_url, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET login = excluded.login, avatar_url = excluded.avatar_url, name = excluded.name, updated_at = excluded.updated_at`,
    profile.id,
    profile.login,
    profile.avatarUrl,
    profile.name,
    timestamp,
    timestamp,
  );
}

export async function beginOAuth(db: SqlDatabase, returnTo: string, now = new Date()): Promise<string> {
  const state = crypto.randomUUID();
  await run(db, `INSERT INTO oauth_states (state, return_to, created_at) VALUES (?, ?, ?)`, state, returnTo, now.toISOString());
  return state;
}

export async function consumeOAuthState(db: SqlDatabase, state: string, now = new Date()): Promise<string | null> {
  const row = await get<{ return_to: string; created_at: string }>(db, `SELECT return_to, created_at FROM oauth_states WHERE state = ?`, state);
  if (!row) return null;
  await run(db, `DELETE FROM oauth_states WHERE state = ?`, state);
  if (now.getTime() - Date.parse(row.created_at) > 15 * 60 * 1000) return null;
  return row.return_to;
}

export async function exchangeGitHubCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetcher?: typeof fetch;
}): Promise<{ id: string; login: string; avatarUrl: string | null; name: string | null }> {
  const fetcher = input.fetcher ?? fetch;
  const tokenResponse = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "cnmcp-community/1.0" },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  });
  if (!tokenResponse.ok) throw new HttpError(502, "GitHub 登录没有完成");
  const tokenBody = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!tokenBody.access_token) throw new HttpError(502, "GitHub 登录没有完成");
  const userResponse = await fetcher("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokenBody.access_token}`,
      "User-Agent": "cnmcp-community/1.0 (+https://www.cnmcp.com)",
    },
  });
  if (!userResponse.ok) throw new HttpError(502, "GitHub 登录没有完成");
  const user = (await userResponse.json()) as { id?: number | string; login?: string; avatar_url?: string; name?: string | null };
  if ((typeof user.id !== "number" && typeof user.id !== "string") || typeof user.login !== "string" || !user.login) {
    throw new HttpError(502, "GitHub 登录没有完成");
  }
  return {
    id: String(user.id),
    login: user.login,
    avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : null,
    name: typeof user.name === "string" ? user.name : null,
  };
}
