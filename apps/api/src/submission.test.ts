import { describe, expect, it, vi } from "vitest";

import {
  fetchPublicEvidence,
  normalizeSubmissionPayload,
  resourceIdentityKeys,
  serverIdForIdentity,
  type SubmissionPayload,
} from "./submission";

describe("submission intake", () => {
  it("uses submitted values only as discovery hints, not public evidence", () => {
    const normalized = normalizeSubmissionPayload({
      type: "new_server",
      title: "用户声称的标题",
      description: "用户声称的介绍",
      repoUrl: "https://github.com/acme/example-mcp",
      note: "请给高分",
    });

    expect(normalized).toMatchObject({
      type: "new_server",
      repoUrl: "https://github.com/acme/example-mcp",
    });
    expect(normalized).not.toHaveProperty("title");
    expect(normalized).not.toHaveProperty("description");
    expect(normalized).not.toHaveProperty("note");
  });

  it("rejects submitted configs that contain credential material", () => {
    expect(() =>
      normalizeSubmissionPayload({
        type: "new_server",
        config: {
          mcpServers: {
            demo: {
              command: "npx",
              args: ["demo-mcp"],
              env: { API_TOKEN: "sk-live-1234567890abcdef" },
            },
          },
        },
      }),
    ).toThrow("credential_material_not_allowed");
  });

  it("rejects credentials embedded in command arguments", () => {
    expect(() =>
      normalizeSubmissionPayload({
        type: "new_server",
        config: {
          mcpServers: {
            demo: { command: "npx", args: ["demo-mcp", "--token", "sk-live-1234567890abcdef"] },
          },
        },
      }),
    ).toThrow("credential_material_not_allowed");
  });

  it("accepts placeholder credentials and derives an npm package discovery hint", () => {
    const normalized = normalizeSubmissionPayload({
      type: "new_server",
      config: {
        mcpServers: {
          demo: {
            command: "npx",
            args: ["-y", "@acme/example-mcp"],
            env: { API_TOKEN: "${API_TOKEN}" },
          },
        },
      },
    });

    expect(normalized.packageName).toBe("@acme/example-mcp");
    expect(normalized.packageRegistry).toBe("npm");
  });
});

describe("public evidence", () => {
  it("builds resource facts from GitHub responses instead of submitted marketing copy", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/acme/example-mcp") {
        return Response.json({
          name: "example-mcp",
          full_name: "acme/example-mcp",
          description: "Description from the repository",
          html_url: "https://github.com/acme/example-mcp",
          homepage: "https://example.com",
          default_branch: "main",
          pushed_at: "2026-10-01T00:00:00Z",
          archived: false,
          owner: { login: "acme" },
        });
      }
      if (url === "https://raw.githubusercontent.com/acme/example-mcp/main/README.md") {
        return new Response("# Example MCP\n\n```json\n{\"mcpServers\":{\"example\":{\"command\":\"npx\",\"args\":[\"@acme/example-mcp@1.2.3\"]}}}\n```\n");
      }
      return new Response("not found", { status: 404 });
    });
    const payload = normalizeSubmissionPayload({
      type: "new_server",
      title: "Untrusted title",
      repoUrl: "https://github.com/acme/example-mcp",
    });

    const evidence = await fetchPublicEvidence(payload, fetcher);

    expect(evidence.title).toBe("example-mcp");
    expect(evidence.description).toBe("Description from the repository");
    expect(evidence.author).toBe("acme");
    expect(evidence.readme).toContain("@acme/example-mcp@1.2.3");
    expect(evidence.sourceUrl).toBe("https://github.com/acme/example-mcp");
  });

  it("builds resource facts from npm package metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        name: "demo-mcp",
        description: "Package description",
        "dist-tags": { latest: "2.0.0" },
        versions: {
          "2.0.0": {
            name: "demo-mcp",
            version: "2.0.0",
            homepage: "https://example.com",
            repository: { type: "git", url: "git+https://github.com/acme/demo-mcp.git" },
          },
        },
        time: { "2.0.0": "2026-09-30T00:00:00Z" },
        readme: "# demo-mcp",
        maintainers: [{ name: "acme" }],
      }),
    );
    const payload = normalizeSubmissionPayload({ type: "new_server", packageName: "demo-mcp", packageRegistry: "npm" });

    const evidence = await fetchPublicEvidence(payload, fetcher);

    expect(evidence).toMatchObject({
      title: "demo-mcp",
      description: "Package description",
      packageName: "demo-mcp",
      latestVersion: "2.0.0",
      repoUrl: "https://github.com/acme/demo-mcp",
    });
  });

  it("creates normalized identity keys for repository, package and endpoint deduplication", () => {
    const input = {
      repoUrl: "https://github.com/Acme/Demo.git",
      packageName: "@Acme/Demo",
      packageRegistry: "npm",
      remoteUrl: "https://mcp.example.com/mcp/",
    } satisfies Pick<SubmissionPayload, "repoUrl" | "packageName" | "packageRegistry" | "remoteUrl">;

    expect(resourceIdentityKeys(input)).toEqual([
      "repo:https://github.com/acme/demo",
      "package:npm:@acme/demo",
      "endpoint:https://mcp.example.com/mcp",
    ]);
  });

  it("rejects private endpoints and preserves case-sensitive public endpoint paths", () => {
    expect(() => normalizeSubmissionPayload({ endpoint: "http://127.0.0.1/mcp" })).toThrow("endpoint_not_public_mcp");
    expect(
      resourceIdentityKeys({ remoteUrl: "https://MCP.acme.test/MCP/?b=2&a=One" }),
    ).toEqual(["endpoint:https://mcp.acme.test/MCP?a=One&b=2"]);
  });

  it("creates a stable server id from independently verifiable identity", async () => {
    await expect(serverIdForIdentity("repo:https://github.com/acme/demo")).resolves.toMatch(
      /^community\/demo-[a-f0-9]{12}$/,
    );
    await expect(serverIdForIdentity("repo:https://github.com/acme/demo")).resolves.toBe(
      await serverIdForIdentity("repo:https://github.com/acme/demo"),
    );
  });

  it("requires a successful MCP handshake before an endpoint becomes evidence", async () => {
    const payload = normalizeSubmissionPayload({ type: "new_server", endpoint: "https://mcp.acme.test/mcp" });
    const probe = vi.fn(async () => ({
      ok: true,
      latencyMs: 42,
      protocolVersion: "2025-03-26",
      tools: [{ name: "search", description: "Search public records" }],
    }));

    const evidence = await fetchPublicEvidence(payload, fetch, probe);

    expect(probe).toHaveBeenCalledWith("https://mcp.acme.test/mcp");
    expect(evidence).toMatchObject({
      title: "mcp.acme.test",
      sourceUrl: "https://mcp.acme.test/mcp",
      protocolVersion: "2025-03-26",
      tools: [{ name: "search" }],
    });
  });
});
