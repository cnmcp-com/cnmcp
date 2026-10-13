import { isLikelyMcpEndpoint } from "./plaza-normalize";

export type SubmissionPayload = {
  type?: string;
  repoUrl?: string;
  packageName?: string;
  packageRegistry?: "npm" | "pypi";
  endpoint?: string;
  remoteUrl?: string;
  transport?: "remote" | "local";
  config?: unknown;
  title?: string;
  description?: string;
  note?: string;
};

export type NormalizedSubmission = {
  type: "new_server";
  repoUrl?: string;
  packageName?: string;
  packageRegistry?: "npm" | "pypi";
  remoteUrl?: string;
  transport: "remote" | "local";
};

export type PublicEvidence = {
  title: string;
  description: string;
  author: string | null;
  repoUrl: string | null;
  packageName: string | null;
  packageRegistry: "npm" | "pypi" | null;
  latestVersion: string | null;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  homepage: string | null;
  readme: string | null;
  sourceUrl: string;
  protocolVersion?: string | null;
  tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  handshake?: Awaited<ReturnType<EndpointProbe>>;
};

type EndpointProbe = (url: string) => Promise<{
  ok: boolean;
  error?: string;
  latencyMs: number | null;
  protocolVersion: string | null;
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function cleanString(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) return undefined;
  return cleaned;
}

function normalizedHttpUrl(value: unknown, kind: "repo" | "endpoint"): string | undefined {
  const raw = cleanString(value, 2_000);
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${kind}_url_invalid`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${kind}_url_invalid`);
  if (url.username || url.password) throw new Error(`${kind}_url_invalid`);
  url.hash = "";
  if (kind === "repo") url.search = "";
  else url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (kind === "repo") url.pathname = url.pathname.replace(/\.git$/i, "");
  return url.toString().replace(/\/$/, "");
}

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^\$\{[A-Z][A-Z0-9_]*\}$/.test(trimmed) ||
    /^<[A-Z][A-Z0-9_-]*>$/.test(trimmed) ||
    /^(?:YOUR_|REPLACE_|EXAMPLE_|PLACEHOLDER)/i.test(trimmed) ||
    /^(?:token|secret|password|api[-_]?key)$/i.test(trimmed)
  );
}

function assertNoCredentialMaterial(value: unknown, key = ""): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      const previous = typeof value[index - 1] === "string" ? value[index - 1] : "";
      if (
        typeof item === "string" &&
        /^(?:--?(?:token|secret|password|api[-_]?key|authorization|credential))$/i.test(previous) &&
        !isPlaceholder(item)
      ) {
        throw new Error("credential_material_not_allowed");
      }
      assertNoCredentialMaterial(item, key);
    }
    return;
  }
  const record = asRecord(value);
  if (record) {
    for (const [childKey, childValue] of Object.entries(record)) assertNoCredentialMaterial(childValue, childKey);
    return;
  }
  if (typeof value !== "string") return;
  const secretKey = /(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|credential|authorization|bearer)/i.test(key);
  const inlineSecret = /(?:--?(?:token|secret|password|api[-_]?key|authorization|credential)=|\bBearer\s+)[^\s$<{][^\s]*/i.test(value);
  if ((secretKey || inlineSecret) && value.trim() && !isPlaceholder(value)) throw new Error("credential_material_not_allowed");
}

function configLaunch(config: unknown): { packageName?: string; packageRegistry?: "npm" | "pypi" } {
  const root = asRecord(config);
  const servers = asRecord(root?.mcpServers);
  const first = servers ? asRecord(Object.values(servers)[0]) : null;
  const command = cleanString(first?.command, 100)?.toLowerCase();
  const args = Array.isArray(first?.args) ? first.args.filter((item): item is string => typeof item === "string") : [];
  const packageArg = args.find((arg) => !arg.startsWith("-") && !/^\$\{/.test(arg));
  if (!packageArg) return {};
  if (command === "npx" || command === "npm" || command === "pnpx" || command === "bunx") {
    const match = packageArg.match(/^(@[^/]+\/[^@]+|[^@/]+)(?:@[^/]+)?$/);
    if (match?.[1]) return { packageName: match[1], packageRegistry: "npm" };
  }
  if (command === "uvx" || command === "uv" || command === "pipx") {
    const name = packageArg.split(/[<>=!~\[]/, 1)[0];
    if (name) return { packageName: name, packageRegistry: "pypi" };
  }
  return {};
}

export function normalizeSubmissionPayload(input: SubmissionPayload): NormalizedSubmission {
  if ((input.type ?? "new_server") !== "new_server") throw new Error("submission_type_not_supported");
  assertNoCredentialMaterial(input.config);
  const repoUrl = normalizedHttpUrl(input.repoUrl, "repo");
  const remoteUrl = normalizedHttpUrl(input.remoteUrl ?? input.endpoint, "endpoint");
  if (remoteUrl && !isLikelyMcpEndpoint(remoteUrl)) throw new Error("endpoint_not_public_mcp");
  const explicitPackage = cleanString(input.packageName, 300);
  const explicitRegistry = input.packageRegistry === "pypi" ? "pypi" : input.packageRegistry === "npm" ? "npm" : undefined;
  const inferred = configLaunch(input.config);
  const packageName = explicitPackage ?? inferred.packageName;
  const packageRegistry = packageName ? explicitRegistry ?? inferred.packageRegistry ?? "npm" : undefined;
  if (!repoUrl && !packageName && !remoteUrl) throw new Error("public_locator_required");
  return {
    type: "new_server",
    ...(repoUrl ? { repoUrl } : {}),
    ...(packageName ? { packageName } : {}),
    ...(packageRegistry ? { packageRegistry } : {}),
    ...(remoteUrl ? { remoteUrl } : {}),
    transport: remoteUrl ? "remote" : "local",
  };
}

function canonicalGitRepo(value: unknown): string | null {
  const raw = cleanString(typeof value === "string" ? value : asRecord(value)?.url, 2_000);
  if (!raw) return null;
  const cleaned = raw.replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/\.git$/, "");
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function githubCoordinates(repoUrl: string): { owner: string; repo: string } | null {
  const url = new URL(repoUrl);
  if (url.hostname.toLowerCase() !== "github.com") return null;
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  return owner && repo ? { owner, repo: repo.replace(/\.git$/i, "") } : null;
}

async function fetchJson(fetcher: typeof fetch, url: string): Promise<Record<string, unknown>> {
  const response = await fetcher(url, { headers: { Accept: "application/json", "User-Agent": "cnmcp-evidence-checker" } });
  if (!response.ok) throw new Error(`public_evidence_unavailable:${response.status}`);
  const body = await response.json();
  const record = asRecord(body);
  if (!record) throw new Error("public_evidence_invalid");
  return record;
}

async function fetchGitHubEvidence(repoUrl: string, fetcher: typeof fetch): Promise<PublicEvidence> {
  const coordinates = githubCoordinates(repoUrl);
  if (!coordinates) throw new Error("unsupported_repository_host");
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}`;
  const metadata = await fetchJson(fetcher, apiUrl);
  if (metadata.archived === true) throw new Error("repository_archived");
  const canonicalUrl = cleanString(metadata.html_url, 2_000) ?? `https://github.com/${coordinates.owner}/${coordinates.repo}`;
  const branch = cleanString(metadata.default_branch, 300);
  let readme: string | null = null;
  if (branch) {
    const rawUrl = `https://raw.githubusercontent.com/${coordinates.owner}/${coordinates.repo}/${branch}/README.md`;
    const response = await fetcher(rawUrl, { headers: { "User-Agent": "cnmcp-evidence-checker" } });
    if (response.ok) readme = (await response.text()).slice(0, 500_000);
  }
  return {
    title: cleanString(metadata.name, 300) ?? coordinates.repo,
    description: cleanString(metadata.description, 2_000) ?? "",
    author: cleanString(asRecord(metadata.owner)?.login, 300) ?? coordinates.owner,
    repoUrl: canonicalUrl,
    packageName: null,
    packageRegistry: null,
    latestVersion: null,
    firstPublishedAt: cleanString(metadata.created_at, 100) ?? null,
    lastPublishedAt: cleanString(metadata.pushed_at, 100) ?? null,
    homepage: cleanString(metadata.homepage, 2_000) ?? null,
    readme,
    sourceUrl: canonicalUrl,
  };
}

async function fetchNpmEvidence(packageName: string, fetcher: typeof fetch): Promise<PublicEvidence> {
  const metadata = await fetchJson(fetcher, `https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
  const latestVersion = cleanString(asRecord(metadata["dist-tags"])?.latest, 100) ?? null;
  const version = latestVersion ? asRecord(asRecord(metadata.versions)?.[latestVersion]) : null;
  const repoUrl = canonicalGitRepo(version?.repository ?? metadata.repository);
  const times = asRecord(metadata.time);
  return {
    title: cleanString(metadata.name, 300) ?? packageName,
    description: cleanString(metadata.description ?? version?.description, 2_000) ?? "",
    author: cleanString(asRecord(metadata.author)?.name, 300) ?? cleanString(asRecord((metadata.maintainers as unknown[])?.[0])?.name, 300) ?? null,
    repoUrl,
    packageName,
    packageRegistry: "npm",
    latestVersion,
    firstPublishedAt: cleanString(times?.created, 100) ?? null,
    lastPublishedAt: (latestVersion ? cleanString(times?.[latestVersion], 100) : undefined) ?? cleanString(times?.modified, 100) ?? null,
    homepage: cleanString(version?.homepage ?? metadata.homepage, 2_000) ?? null,
    readme: cleanString(metadata.readme, 500_000) ?? null,
    sourceUrl: `https://www.npmjs.com/package/${packageName}`,
  };
}

async function fetchPypiEvidence(packageName: string, fetcher: typeof fetch): Promise<PublicEvidence> {
  const metadata = await fetchJson(fetcher, `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`);
  const info = asRecord(metadata.info);
  const projectUrls = asRecord(info?.project_urls);
  const repoUrl = canonicalGitRepo(projectUrls?.Source ?? projectUrls?.Repository ?? projectUrls?.Homepage);
  return {
    title: cleanString(info?.name, 300) ?? packageName,
    description: cleanString(info?.summary, 2_000) ?? "",
    author: cleanString(info?.author, 300) ?? null,
    repoUrl,
    packageName,
    packageRegistry: "pypi",
    latestVersion: cleanString(info?.version, 100) ?? null,
    firstPublishedAt: null,
    lastPublishedAt: null,
    homepage: cleanString(info?.home_page, 2_000) ?? null,
    readme: cleanString(info?.description, 500_000) ?? null,
    sourceUrl: `https://pypi.org/project/${packageName}/`,
  };
}

export async function fetchPublicEvidence(
  payload: NormalizedSubmission,
  fetcher: typeof fetch = fetch,
  endpointProbe?: EndpointProbe,
): Promise<PublicEvidence> {
  if (payload.repoUrl) return fetchGitHubEvidence(payload.repoUrl, fetcher);
  if (payload.packageName && payload.packageRegistry === "pypi") return fetchPypiEvidence(payload.packageName, fetcher);
  if (payload.packageName) return fetchNpmEvidence(payload.packageName, fetcher);
  if (payload.remoteUrl && endpointProbe) {
    const result = await endpointProbe(payload.remoteUrl);
    if (!result.ok) throw new Error(`endpoint_handshake_failed:${result.error ?? "unknown"}`);
    const endpoint = new URL(payload.remoteUrl);
    return {
      title: endpoint.hostname,
      description: "",
      author: null,
      repoUrl: null,
      packageName: null,
      packageRegistry: null,
      latestVersion: null,
      firstPublishedAt: null,
      lastPublishedAt: null,
      homepage: null,
      readme: null,
      sourceUrl: payload.remoteUrl,
      protocolVersion: result.protocolVersion,
      tools: result.tools,
      handshake: result,
    };
  }
  throw new Error("independent_public_evidence_required");
}

export function resourceIdentityKeys(input: Pick<SubmissionPayload, "repoUrl" | "packageName" | "packageRegistry" | "remoteUrl">): string[] {
  const keys: string[] = [];
  const repoUrl = normalizedHttpUrl(input.repoUrl, "repo");
  if (repoUrl) keys.push(`repo:${repoUrl.toLowerCase()}`);
  const packageName = cleanString(input.packageName, 300);
  if (packageName) keys.push(`package:${input.packageRegistry ?? "npm"}:${packageName.toLowerCase()}`);
  const remoteUrl = normalizedHttpUrl(input.remoteUrl, "endpoint");
  if (remoteUrl) keys.push(`endpoint:${remoteUrl}`);
  return keys;
}

export async function serverIdForIdentity(identityKey: string): Promise<string> {
  const segment = identityKey.split(/[/:]/).filter(Boolean).at(-1) ?? "mcp";
  const slug = segment
    .replace(/^@/, "")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48) || "mcp";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identityKey));
  const hash = [...new Uint8Array(digest)].slice(0, 6).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `community/${slug}-${hash}`;
}
