import { describe, expect, it } from "vitest";

import {
  extractRemotesFromReadme,
  githubRepoUrl,
  inferPricingModel,
  inferTransport,
  plazaServerId,
  shouldPersistPlazaServer,
  toIsoFromPlaza,
} from "./tencent-plaza";

describe("tencent plaza normalize", () => {
  it("uses a stable cloud.tencent.com id", () => {
    expect(plazaServerId(11698)).toBe("cloud.tencent.com/11698");
  });

  it("parses plaza timestamps as China local time", () => {
    expect(toIsoFromPlaza("2025-06-12 20:34:37")).toBe("2025-06-12T12:34:37.000Z");
  });

  it("normalizes GitHub repo URLs and drops .git", () => {
    expect(githubRepoUrl("https://github.com/TCATools/tca-mcp-server.git")).toBe("https://github.com/TCATools/tca-mcp-server");
    expect(githubRepoUrl("https://example.com/not-github")).toBeNull();
  });

  it("only treats a validated public MCP URL as remote", () => {
    expect(inferTransport({ isHosted: true, remotes: [], authParams: [] })).toBe("local");
    expect(inferTransport({ isHosted: false, remotes: [{ url: "https://docs.qq.com/openapi/mcp" }], authParams: [] })).toBe("remote");
    expect(
      inferTransport({
        isHosted: false,
        remotes: [],
        authParams: [{ fieldName: "Authorization", required: true, isHeader: true, placeholder: "token" }],
      }),
    ).toBe("local");
  });

  it("marks secret-like params as BYOK", () => {
    expect(inferPricingModel([{ fieldName: "TENCENTCLOUD_SECRETKEY", required: true, isHeader: false, placeholder: null }])).toBe("byok");
    expect(inferPricingModel([])).toBe("unknown");
  });

  it("extracts real MCP URLs and ignores placeholders", () => {
    const remotes = extractRemotesFromReadme(`
      {"mcpServers":{"tencent-docs":{"url":"https://docs.qq.com/openapi/mcp"}}}
      {"url":"https://mcp-api.tencent-cloud.com/sse/<your-token>"}
      {"url":"http://localhost:3001/sse"}
      {"url":"https://api.github.com/users/octocat"}
      {"url":"http://0.0.0.0:8080/sse"}
      {"url":"https://您的函数URL/mcp"}
    `);
    expect(remotes).toEqual([{ type: "streamable-http", url: "https://docs.qq.com/openapi/mcp" }]);
  });

  it("drops hosted and unverified sources before ingest", () => {
    expect(
      shouldPersistPlazaServer({
        isHosted: true,
        reliability: "hosted",
        repoUrl: "https://github.com/TCATools/tca-mcp-server",
        isOfficial: true,
      } as never),
    ).toBe(false);
    expect(
      shouldPersistPlazaServer({
        isHosted: false,
        reliability: "unverified-source",
        repoUrl: null,
        isOfficial: false,
      } as never),
    ).toBe(false);
    expect(
      shouldPersistPlazaServer({
        isHosted: false,
        reliability: "cn-official",
        repoUrl: null,
        isOfficial: true,
      } as never),
    ).toBe(true);
  });
});
