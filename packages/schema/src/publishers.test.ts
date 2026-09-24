import { describe, expect, it } from "vitest";

import { blockedSourceSql, isOfficialPublisher, knownRankSql, matchPublisher, publisherCatalog, type PublisherCatalog } from "./publishers";

const catalog: PublisherCatalog = {
  version: "2026-09-23",
  publishers: [
    { id: "github.com/modelcontextprotocol", tier: "known", name: "MCP", note: "含已归档仓库" },
    { id: "github.com/modelcontextprotocol/servers-archived", tier: "watch", name: "归档", note: null },
    { id: "github.com/evil_org", tier: "blocked", name: "拒绝", note: null },
  ],
};

describe("publisher match", () => {
  it("uses the longest github prefix and keeps the catalog version", () => {
    const match = matchPublisher("https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gitlab", catalog);
    expect(match).toMatchObject({
      id: "github.com/modelcontextprotocol/servers-archived",
      tier: "watch",
      version: "2026-09-23",
    });
  });

  it("matches an org when no repo rule is longer", () => {
    expect(matchPublisher("https://github.com/modelcontextprotocol/servers", catalog)?.tier).toBe("known");
    expect(isOfficialPublisher("https://github.com/modelcontextprotocol/servers", catalog)).toBe(true);
    expect(isOfficialPublisher("https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gitlab", catalog)).toBe(false);
  });

  it("leaves an unknown org unlisted", () => {
    expect(matchPublisher("https://github.com/XGenerationLab/xiyan_mcp_server", catalog)).toBeNull();
  });

  it("builds sql that can exclude a blocked org without treating the label as a score", () => {
    const blocked = blockedSourceSql(catalog);
    expect(blocked?.sql).toContain("NOT (");
    expect(blocked?.binds.some((item) => item.includes("evil\\_org"))).toBe(true);
    const rank = knownRankSql(catalog);
    expect(rank.sql).toContain("AND NOT");
    expect(rank.binds.some((item) => item.includes("servers-archived"))).toBe(true);
  });

  it("matches maintained orgs, demotes the archived repo, and leaves personal accounts unlisted", () => {
    expect(publisherCatalog.version).toBe("2026-09-23.2");
    for (const url of [
      "https://github.com/TencentEdgeOne/edgeone-pages-mcp",
      "https://github.com/modelcontextprotocol/servers",
      "https://github.com/baidu-maps/mcp",
      "https://github.com/MiniMax-AI/MiniMax-MCP",
    ]) {
      expect(matchPublisher(url)?.tier).toBe("known");
    }
    expect(matchPublisher("https://github.com/TencentEdgeOneX/mcp")).toBeNull();
    expect(matchPublisher("https://github.com/upstash/context7")?.id).toBe("github.com/upstash");
    expect(matchPublisher("https://github.com/modelcontextprotocol/servers-archived/tree/main/src/github")?.tier).toBe("watch");
    expect(matchPublisher("https://github.com/crazyrabbitltc/anything")).toBeNull();
    expect(isOfficialPublisher("https://github.com/mendableai/firecrawl-mcp-server")).toBe(true);
    expect(isOfficialPublisher("https://github.com/mastergo-design/mastergo-magic-mcp")).toBe(true);
    expect(isOfficialPublisher("https://github.com/vrknetha/mcp-server-firecrawl")).toBe(false);
  });
});
