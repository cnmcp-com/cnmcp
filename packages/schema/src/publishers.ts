import catalogJson from "./publishers.json" with { type: "json" };

export type PublisherTier = "known" | "watch" | "blocked";

export type PublisherRule = {
  id: string;
  tier: PublisherTier;
  name: string;
  note: string | null;
};

export type PublisherCatalog = {
  version: string;
  publishers: PublisherRule[];
};

export type PublisherMatch = PublisherRule & {
  version: string;
};

const TIERS = new Set<PublisherTier>(["known", "watch", "blocked"]);
const ID_RE = /^github\.com\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/;

function asCatalog(value: unknown): PublisherCatalog {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const version = typeof record.version === "string" ? record.version : "";
  const publishers = Array.isArray(record.publishers)
    ? record.publishers.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const rule = item as Record<string, unknown>;
        const id = typeof rule.id === "string" ? rule.id : "";
        const tier = typeof rule.tier === "string" ? rule.tier : "";
        if (!ID_RE.test(id) || !TIERS.has(tier as PublisherTier)) return [];
        return [
          {
            id,
            tier: tier as PublisherTier,
            name: typeof rule.name === "string" && rule.name.trim() ? rule.name.trim() : id,
            note: typeof rule.note === "string" && rule.note.trim() ? rule.note.trim() : null,
          },
        ];
      })
    : [];
  return { version, publishers };
}

export const publisherCatalog: PublisherCatalog = asCatalog(catalogJson);

export function sourceKey(srcUrl: string | null | undefined): string | null {
  const raw = srcUrl?.trim();
  if (!raw) return null;
  const prefixed = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(prefixed);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const owner = parts[0]?.replace(/\.git$/i, "");
    const repo = parts[1]?.replace(/\.git$/i, "");
    if (!owner) return null;
    return repo ? `github.com/${owner}/${repo}`.toLowerCase() : `github.com/${owner}`.toLowerCase();
  } catch {
    return null;
  }
}

export function matchPublisher(srcUrl: string | null | undefined, catalog: PublisherCatalog = publisherCatalog): PublisherMatch | null {
  const key = sourceKey(srcUrl);
  if (!key) return null;
  let best: PublisherRule | null = null;
  for (const rule of catalog.publishers) {
    const id = rule.id.toLowerCase();
    if (key === id || key.startsWith(`${id}/`)) {
      if (!best || id.length > best.id.length) best = rule;
    }
  }
  if (!best) return null;
  return { ...best, version: catalog.version };
}

export function isOfficialPublisher(srcUrl: string | null | undefined, catalog: PublisherCatalog = publisherCatalog): boolean {
  return matchPublisher(srcUrl, catalog)?.tier === "known";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function githubLikePatterns(id: string): string[] {
  if (!ID_RE.test(id)) return [];
  const path = escapeLike(id.slice("github.com/".length));
  const suffixes = ["", "/%", ".git", "?%"];
  return ["https", "http"].flatMap((scheme) => suffixes.map((suffix) => `${scheme}://github.com/${path}${suffix}`));
}

function likeClause(patterns: string[]): { sql: string; binds: string[] } {
  return {
    sql: patterns.map(() => `IFNULL(src.src_url, '') LIKE ? ESCAPE '\\'`).join(" OR "),
    binds: patterns,
  };
}

export function blockedSourceSql(catalog: PublisherCatalog = publisherCatalog): { sql: string; binds: string[] } | null {
  const patterns = catalog.publishers.filter((rule) => rule.tier === "blocked").flatMap((rule) => githubLikePatterns(rule.id));
  if (!patterns.length) return null;
  const likes = likeClause(patterns);
  return { sql: `NOT (${likes.sql})`, binds: likes.binds };
}

export function knownRankSql(catalog: PublisherCatalog = publisherCatalog): { sql: string; binds: string[] } {
  const patterns = catalog.publishers.filter((rule) => rule.tier === "known").flatMap((rule) => githubLikePatterns(rule.id));
  if (!patterns.length) return { sql: "1", binds: [] };
  const known = likeClause(patterns);
  const demote = catalog.publishers
    .filter((rule) => rule.tier !== "known")
    .filter((rule) => catalog.publishers.some((knownRule) => knownRule.tier === "known" && rule.id.toLowerCase().startsWith(`${knownRule.id.toLowerCase()}/`)))
    .flatMap((rule) => githubLikePatterns(rule.id));
  if (!demote.length) return { sql: `CASE WHEN ${known.sql} THEN 0 ELSE 1 END`, binds: known.binds };
  const longer = likeClause(demote);
  return { sql: `CASE WHEN (${known.sql}) AND NOT (${longer.sql}) THEN 0 ELSE 1 END`, binds: [...known.binds, ...longer.binds] };
}
