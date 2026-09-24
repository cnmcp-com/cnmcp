export type GitHubRepository = {
  key: string;
  url: string;
  apiUrl: string;
};

export type GitHubRepositorySnapshot = {
  pushedAt: string | null;
  updatedAt: string | null;
  defaultBranch: string | null;
  archived: boolean;
};

type RepositoryStateRow = {
  repo_key: string;
  repo_url: string;
  etag: string | null;
  pushed_at: string | null;
  updated_at: string | null;
  default_branch: string | null;
  archived: number;
  last_checked_at: string;
  last_error: string | null;
};

type RepositoryChange = {
  type: "repository_updated" | "repository_archived" | "repository_restored" | "default_branch_changed";
  severity: "info" | "warn" | "high";
  diff: Record<string, unknown>;
};

const REPO_PART_RE = /^[A-Za-z0-9_.-]+$/;
const RESCAN_AFTER_MS = 24 * 60 * 60 * 1000;

export function githubRepositoryFromUrl(value: string | null | undefined): GitHubRepository | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "github.com") return null;
    const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
    const repo = rawRepo?.replace(/\.git$/i, "");
    if (!owner || !repo || !REPO_PART_RE.test(owner) || !REPO_PART_RE.test(repo)) return null;
    const key = `${owner}/${repo}`.toLowerCase();
    return { key, url: `https://github.com/${owner}/${repo}`, apiUrl: `https://api.github.com/repos/${owner}/${repo}` };
  } catch {
    return null;
  }
}

export function diffGitHubRepository(previous: GitHubRepositorySnapshot, next: GitHubRepositorySnapshot): RepositoryChange[] {
  const changes: RepositoryChange[] = [];
  if (previous.pushedAt && next.pushedAt && previous.pushedAt !== next.pushedAt) {
    changes.push({
      type: "repository_updated",
      severity: "info",
      diff: { field: "pushedAt", previous: previous.pushedAt, current: next.pushedAt },
    });
  }
  if (previous.archived !== next.archived) {
    changes.push({
      type: next.archived ? "repository_archived" : "repository_restored",
      severity: next.archived ? "high" : "info",
      diff: { field: "archived", previous: previous.archived, current: next.archived },
    });
  }
  if (previous.defaultBranch && next.defaultBranch && previous.defaultBranch !== next.defaultBranch) {
    changes.push({
      type: "default_branch_changed",
      severity: "warn",
      diff: { field: "defaultBranch", previous: previous.defaultBranch, current: next.defaultBranch },
    });
  }
  return changes;
}

function snapshotOf(row: RepositoryStateRow): GitHubRepositorySnapshot {
  return {
    pushedAt: row.pushed_at,
    updatedAt: row.updated_at,
    defaultBranch: row.default_branch,
    archived: Boolean(row.archived),
  };
}

function due(lastCheckedAt: string | null, now: number): boolean {
  if (!lastCheckedAt) return true;
  const checked = Date.parse(lastCheckedAt);
  return !Number.isFinite(checked) || now - checked >= RESCAN_AFTER_MS;
}

export async function scanGitHubRepositories(
  env: CloudflareEnv,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<{ candidates: number; scanned: number; unchanged: number; changes: number; failed: number; rateLimited: boolean }> {
  const [sourceRows, stateRows] = await Promise.all([
    env.DB.prepare(
      `SELECT s.id AS server_id,
              CASE WHEN s.repo_url LIKE 'https://github.com/%' THEN s.repo_url ELSE src.src_url END AS repo_url
       FROM servers s
       LEFT JOIN server_sources src ON src.server_id = s.id
       WHERE s.repo_url LIKE 'https://github.com/%' OR src.src_url LIKE 'https://github.com/%'`,
    ).all<{ server_id: string; repo_url: string }>(),
    env.DB.prepare(`SELECT * FROM github_repository_state`).all<RepositoryStateRow>(),
  ]);

  const repositories = new Map<string, { repository: GitHubRepository; serverIds: string[] }>();
  for (const row of sourceRows.results ?? []) {
    const repository = githubRepositoryFromUrl(row.repo_url);
    if (!repository) continue;
    const existing = repositories.get(repository.key);
    if (existing) existing.serverIds.push(row.server_id);
    else repositories.set(repository.key, { repository, serverIds: [row.server_id] });
  }

  const states = new Map((stateRows.results ?? []).map((row) => [row.repo_key, row]));
  const limit = env.GITHUB_TOKEN ? 100 : 40;
  const selected = [...repositories.values()]
    .filter(({ repository }) => due(states.get(repository.key)?.last_checked_at ?? null, now.getTime()))
    .sort((a, b) => (states.get(a.repository.key)?.last_checked_at ?? "").localeCompare(states.get(b.repository.key)?.last_checked_at ?? ""))
    .slice(0, limit);

  const summary = { candidates: repositories.size, scanned: 0, unchanged: 0, changes: 0, failed: 0, rateLimited: false };
  let cursor = 0;
  const checkedAt = now.toISOString();

  async function scanOne(item: (typeof selected)[number]): Promise<void> {
    const previous = states.get(item.repository.key);
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "cnmcp-repository-monitor/1.0 (+https://www.cnmcp.com)",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    if (previous?.etag) headers["If-None-Match"] = previous.etag;

    const response = await fetcher(item.repository.apiUrl, { headers });
    if (response.status === 304 && previous) {
      await env.DB.prepare(`UPDATE github_repository_state SET last_checked_at = ?, last_error = NULL WHERE repo_key = ?`)
        .bind(checkedAt, item.repository.key)
        .run();
      summary.scanned += 1;
      summary.unchanged += 1;
      return;
    }
    if (response.status === 403 || response.status === 429) {
      summary.rateLimited = true;
      return;
    }
    if (!response.ok) {
      await env.DB.prepare(
        `INSERT INTO github_repository_state (repo_key, repo_url, last_checked_at, last_error)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(repo_key) DO UPDATE SET last_checked_at = excluded.last_checked_at, last_error = excluded.last_error`,
      )
        .bind(item.repository.key, item.repository.url, checkedAt, `HTTP ${response.status}`)
        .run();
      summary.scanned += 1;
      summary.failed += 1;
      return;
    }

    const body = await response.json<Record<string, unknown>>();
    const next: GitHubRepositorySnapshot = {
      pushedAt: typeof body.pushed_at === "string" ? body.pushed_at : null,
      updatedAt: typeof body.updated_at === "string" ? body.updated_at : null,
      defaultBranch: typeof body.default_branch === "string" ? body.default_branch : null,
      archived: body.archived === true,
    };
    const changes = previous ? diffGitHubRepository(snapshotOf(previous), next) : [];
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO github_repository_state
           (repo_key, repo_url, etag, pushed_at, updated_at, default_branch, archived, last_checked_at, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(repo_key) DO UPDATE SET
           repo_url = excluded.repo_url,
           etag = excluded.etag,
           pushed_at = excluded.pushed_at,
           updated_at = excluded.updated_at,
           default_branch = excluded.default_branch,
           archived = excluded.archived,
           last_checked_at = excluded.last_checked_at,
           last_error = NULL`,
      ).bind(
        item.repository.key,
        item.repository.url,
        response.headers.get("etag"),
        next.pushedAt,
        next.updatedAt,
        next.defaultBranch,
        next.archived ? 1 : 0,
        checkedAt,
      ),
    ];
    for (const serverId of new Set(item.serverIds)) {
      for (const change of changes) {
        statements.push(
          env.DB.prepare(`INSERT INTO change_events (server_id, type, severity, diff_json, detected_at) VALUES (?, ?, ?, ?, ?)`)
            .bind(serverId, change.type, change.severity, JSON.stringify({ repository: item.repository.url, ...change.diff }), checkedAt),
        );
      }
    }
    await env.DB.batch(statements);
    summary.scanned += 1;
    summary.changes += changes.length;
    if (!changes.length && previous) summary.unchanged += 1;
  }

  async function worker(): Promise<void> {
    while (!summary.rateLimited) {
      const item = selected[cursor++];
      if (!item) return;
      try {
        await scanOne(item);
      } catch (error) {
        summary.failed += 1;
        console.error(JSON.stringify({ path: "github-scan", repo: item.repository.key, error: String(error) }));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, selected.length) }, () => worker()));
  return summary;
}
