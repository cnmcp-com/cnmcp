import { describe, expect, it } from "vitest";

import { declaredToolsFromSources, extractReliableConfig, parametersFromSchema, parseDeclaredToolsFromReadme } from "./plaza-normalize";
import {
  declaredToolsOf,
  extractRemotesFromReadme,
  githubRepoUrl,
  inferPricingModel,
  inferTransport,
  plazaServerId,
  reliableConfigOf,
  shouldPersistPlazaServer,
  sourceInfoOf,
  staticCheckInputOf,
  staticCheckOf,
  toIsoFromPlaza,
  type PlazaCatalogServer,
} from "./tencent-plaza";

const XIYAN_README = [
  "### 工具预览",
  " - 工具``get_data``提供了一个自然语言接口，用于从数据库中检索数据。此服务器将使用内置模型将输入的自然语言转换为SQL。",
  "```json",
  JSON.stringify({
    mcpServers: {
      "xiyan-mcp-server": {
        command: "/xxx/python",
        args: ["-m", "xiyan_mcp_server"],
        env: { YML: "PATH/TO/YML" },
      },
    },
  }),
  "```",
  "```json",
  JSON.stringify({ mcpServers: { xiyan_sse: { url: "http://localhost:8000/sse" } } }),
  "```",
].join("\n");

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

  it("keeps 析言 declared tool and drops placeholder config", () => {
    const tools = parseDeclaredToolsFromReadme(XIYAN_README);
    expect(tools).toEqual([
      {
        name: "get_data",
        description: "提供了一个自然语言接口，用于从数据库中检索数据。此服务器将使用内置模型将输入的自然语言转换为SQL。",
        inputSchema: null,
      },
    ]);
    expect(extractReliableConfig({ readme: XIYAN_README, remotes: [], serverKey: "xiyan_mcp_server" })).toBeNull();
    expect(declaredToolsFromSources({ tools: [], readme: XIYAN_README })[0]?.name).toBe("get_data");
  });

  it("stores schema parameters and does not invent an npx config", () => {
    const server = {
      id: "cloud.tencent.com/10002",
      name: "10002",
      mcpName: "servers",
      srcAuthor: "modelcontextprotocol",
      iconUrl: "https://cdn.example.com/github.png",
      srcUrl: "https://github.com/example/github-mcp",
      repoUrl: "https://github.com/example/github-mcp",
      plazaUrl: "https://developer.cloud.tencent.com/mcp/server/10002",
      homepage: "https://developer.cloud.tencent.com/mcp/server/10002",
      srcSite: "github",
      cnmcpCategories: [{ id: "devops", name: "开发工具" }],
      plazaCategories: [{ categoryId: 101, name: "开发者工具" }],
      tools: [
        {
          name: "add_issue_comment",
          description: "Add a comment to an existing issue",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              issue_number: { type: "number" },
              body: { type: "string", description: "comment" },
            },
            required: ["owner", "repo", "issue_number", "body"],
          },
        },
      ],
      remotes: [],
      reliableConfig: null,
      claimedToolNames: [],
    } as unknown as PlazaCatalogServer;

    expect(sourceInfoOf(server)).toMatchObject({
      author: "modelcontextprotocol",
      iconUrl: "https://cdn.example.com/github.png",
      srcUrl: "https://github.com/example/github-mcp",
      categories: [{ id: "devops", name: "开发工具" }],
    });
    expect(declaredToolsOf(server)[0]?.parameters).toEqual([
      { name: "owner", type: "string", description: null, required: true },
      { name: "repo", type: "string", description: null, required: true },
      { name: "issue_number", type: "number", description: null, required: true },
      { name: "body", type: "string", description: "comment", required: true },
    ]);
    expect(reliableConfigOf(server)).toBeNull();
    expect(parametersFromSchema(null)).toEqual([]);
  });

  it("keeps an explicit launcher config and a public endpoint", () => {
    const readme = `
\`\`\`json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>" }
    }
  }
}
\`\`\`
`;
    expect(extractReliableConfig({ readme, serverKey: "servers" })?.config.mcpServers).toMatchObject({
      github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
    });
    expect(extractReliableConfig({ remotes: [{ url: "https://docs.qq.com/openapi/mcp" }], serverKey: "10007" })).toEqual({
      source: "remote",
      config: { mcpServers: { mcp: { url: "https://docs.qq.com/openapi/mcp" } } },
    });
    expect(extractReliableConfig({ readme: "", remotes: [], serverKey: "servers" })).toBeNull();
    const placeholderArgs = ["```json", JSON.stringify({ mcpServers: { filesystem: { command: "docker", args: ["run", "src=/path/to/other"] } } }), "```"].join("\n");
    expect(extractReliableConfig({ readme: placeholderArgs, serverKey: "filesystem" })).toBeNull();
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

  it("builds a deterministic static trust check during ingest", () => {
    const input = staticCheckInputOf({
      id: "cloud.tencent.com/10002",
      transport: "local",
      repoUrl: "https://github.com/example/github-mcp",
      reliability: "github",
      isOfficial: false,
      pricingModel: "unknown",
      lastPublishedAt: "2026-09-20T00:00:00.000Z",
      tools: [{ name: "search", description: "Search public data", inputSchema: null }],
      reliableConfig: {
        source: "readme",
        config: { mcpServers: { search: { command: "npx", args: ["-y", "search-mcp"] } } },
      },
      authParams: [],
      install: { env: [], headers: [] },
    } as unknown as PlazaCatalogServer, "This repository is deprecated and no longer maintained.");

    expect(input).toMatchObject({ id: "cloud.tencent.com/10002", transport: "local", reliability: "github" });
    const result = staticCheckOf(input, "2026-09-23T00:00:00.000Z");
    expect(result.serverId).toBe("cloud.tencent.com/10002");
    expect(result.status).toBe("ready_for_dynamic");
    expect(result.dynamicMode).toBe("isolated_stdio");
    expect(result.signals.some((signal) => signal.code === "DEPRECATED_SOURCE")).toBe(true);
  });
});
