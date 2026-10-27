import { githubRepositoryFromUrl, type GitHubRepository } from "../github-scan";
import { HttpError } from "./sql";

export type RepoSnapshot = {
  description: string;
  homepage: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  license: string | null;
  language: string | null;
  topics: string[];
  defaultBranch: string | null;
  pushedAt: string | null;
  archived: boolean;
  readme: string;
};

export class IngestError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = true,
  ) {
    super(code);
  }
}

function headers(token: string | undefined, accept: string): Record<string, string> {
  const result: Record<string, string> = {
    Accept: accept,
    "User-Agent": "cnmcp-community/1.0 (+https://www.cnmcp.com)",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

async function readLimited(response: Response, limit: number): Promise<string> {
  const text = await response.text();
  return text.slice(0, limit);
}

export function repositoryFromSubmission(value: string): GitHubRepository {
  const repository = githubRepositoryFromUrl(value.trim());
  if (!repository) throw new HttpError(400, "请填写 github.com 上的公开仓库地址");
  return repository;
}

export async function loadGitHubRepository(
  repository: GitHubRepository,
  token: string | undefined,
  fetcher: typeof fetch,
): Promise<RepoSnapshot> {
  const response = await fetcher(repository.apiUrl, { headers: headers(token, "application/vnd.github+json") });
  if (response.status === 403 || response.status === 429) throw new IngestError("github_rate_limited");
  if (!response.ok) throw new IngestError(`github_http_${response.status}`);
  const body = (await response.json()) as Record<string, unknown>;
  const license = body.license && typeof body.license === "object" ? (body.license as Record<string, unknown>).spdx_id : null;
  const topics = Array.isArray(body.topics) ? body.topics.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  const readmeResponse = await fetcher(`${repository.apiUrl}/readme`, { headers: headers(token, "application/vnd.github.raw+json") });
  let readme = "";
  if (readmeResponse.status !== 404) {
    if (readmeResponse.status === 403 || readmeResponse.status === 429) throw new IngestError("github_rate_limited");
    if (!readmeResponse.ok) throw new IngestError(`github_readme_http_${readmeResponse.status}`);
    readme = await readLimited(readmeResponse, 100_000);
  } else {
    await readmeResponse.text().catch(() => undefined);
  }
  const homepage = typeof body.homepage === "string" && body.homepage.trim() ? body.homepage.trim() : null;
  return {
    description: typeof body.description === "string" ? body.description.slice(0, 500) : "",
    homepage,
    stars: typeof body.stargazers_count === "number" ? Math.max(0, Math.floor(body.stargazers_count)) : 0,
    forks: typeof body.forks_count === "number" ? Math.max(0, Math.floor(body.forks_count)) : 0,
    openIssues: typeof body.open_issues_count === "number" ? Math.max(0, Math.floor(body.open_issues_count)) : 0,
    license: typeof license === "string" ? license : null,
    language: typeof body.language === "string" ? body.language : null,
    topics,
    defaultBranch: typeof body.default_branch === "string" ? body.default_branch : null,
    pushedAt: typeof body.pushed_at === "string" ? body.pushed_at : null,
    archived: body.archived === true,
    readme,
  };
}
