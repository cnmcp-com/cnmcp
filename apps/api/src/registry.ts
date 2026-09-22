const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";

export type RegistryRemote = {
  type: string;
  url: string;
};

export type RegistryPackage = {
  registryType?: string;
  identifier?: string;
};

export type NormalizedRegistryServer = {
  id: string;
  title: string;
  description: string;
  version: string | null;
  repoUrl: string | null;
  packageName: string | null;
  homepage: string | null;
  isOfficial: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
  isLatest: boolean;
  remotes: RegistryRemote[];
  packages: RegistryPackage[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractRepo(server: Record<string, unknown>, meta: Record<string, unknown> | null): string | null {
  const repository = asRecord(server.repository);
  return (
    asString(repository?.url) ||
    asString(repository?.web) ||
    asString(server.repository) ||
    asString(server.websiteUrl) ||
    asString(asRecord(meta?.["io.modelcontextprotocol.registry/official"])?.repository) ||
    null
  );
}

export function normalizeRegistryEntry(raw: unknown): NormalizedRegistryServer | null {
  const entry = asRecord(raw);
  if (!entry) return null;
  const server = asRecord(entry.server) ?? entry;
  const meta = asRecord(entry._meta);
  const official = asRecord(meta?.["io.modelcontextprotocol.registry/official"]);
  const id = asString(server.name);
  if (!id) return null;

  const remotes: RegistryRemote[] = [];
  if (Array.isArray(server.remotes)) {
    for (const item of server.remotes) {
      const remote = asRecord(item);
      const url = asString(remote?.url);
      if (url) remotes.push({ type: asString(remote?.type) ?? "streamable-http", url });
    }
  }

  const packages: RegistryPackage[] = [];
  if (Array.isArray(server.packages)) {
    for (const item of server.packages) {
      const pkg = asRecord(item);
      if (!pkg) continue;
      packages.push({
        registryType: asString(pkg.registryType) ?? undefined,
        identifier: asString(pkg.identifier) ?? undefined,
      });
    }
  }

  return {
    id,
    title: asString(server.title) || id,
    description: asString(server.description) ?? "",
    version: asString(server.version),
    repoUrl: extractRepo(server, meta),
    packageName: packages[0]?.identifier ?? null,
    homepage: asString(server.websiteUrl) || asString(server.homepage),
    isOfficial: Boolean(official && (official.isLatest === true || asString(official.status) === "active")),
    publishedAt: asString(official?.publishedAt),
    updatedAt: asString(official?.updatedAt) || asString(official?.statusChangedAt),
    isLatest: official?.isLatest === true,
    remotes,
    packages,
  };
}

export async function fetchRegistryPage(
  fetchImpl: typeof fetch,
  cursor: string | null,
  limit = 100,
): Promise<{ servers: NormalizedRegistryServer[]; nextCursor: string | null }> {
  const url = new URL(REGISTRY_URL);
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await fetchImpl(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "cnmcp-verify/0.1" },
  });
  if (!response.ok) throw new Error(`MCP Registry HTTP ${response.status}`);
  const payload = (await response.json()) as unknown;
  const root = asRecord(payload);
  const rawServers = Array.isArray(root?.servers) ? root.servers : [];
  const servers = rawServers.map(normalizeRegistryEntry).filter((item): item is NormalizedRegistryServer => Boolean(item));
  const metadata = asRecord(root?.metadata);
  const nextCursor = asString(metadata?.nextCursor) || asString(root?.nextCursor) || asString(root?.next_cursor);
  return { servers, nextCursor };
}
