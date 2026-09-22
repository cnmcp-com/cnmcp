import { describe, expect, it } from "vitest";

import { normalizeRegistryEntry } from "./registry";

describe("registry ingest", () => {
  it("keeps remote servers that have no GitHub repository", () => {
    const parsed = normalizeRegistryEntry({
      server: {
        name: "example.com/no-repo",
        title: "No Repo MCP",
        description: "remote only",
        version: "1.0.0",
        remotes: [{ type: "streamable-http", url: "https://mcp.example.com/mcp" }],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          publishedAt: "2026-04-13T17:32:20.852269Z",
          isLatest: true,
        },
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe("example.com/no-repo");
    expect(parsed?.repoUrl).toBeNull();
    expect(parsed?.remotes[0]?.url).toBe("https://mcp.example.com/mcp");
  });
});
