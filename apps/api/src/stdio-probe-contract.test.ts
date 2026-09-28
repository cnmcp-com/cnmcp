import { describe, expect, it, vi } from "vitest";

import { resolveStdioLaunch, stdioLaunchOf } from "./stdio-probe-contract";

function config(entry: Record<string, unknown>): unknown {
  return { mcpServers: { demo: entry } };
}

describe("stdio container probe contract", () => {
  it("accepts a credential-free npx package", () => {
    const result = stdioLaunchOf(config({ command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"] }));
    expect(result).toMatchObject({
      ok: true,
      launch: { launcher: "npx", packageName: "@modelcontextprotocol/server-fetch", registry: "npm" },
    });
  });

  it("keeps configs with environment variables out of the public runner", () => {
    const result = stdioLaunchOf(config({ command: "npx", args: ["-y", "demo-mcp"], env: { API_KEY: "placeholder" } }));
    expect(result).toEqual({ ok: false, status: "credential_required", error: "environment_variables_required" });
  });

  it("rejects credentials embedded in arguments or headers", () => {
    expect(stdioLaunchOf(config({ command: "npx", args: ["-y", "demo-mcp", "--api-key", "secret-value"] })))
      .toMatchObject({ ok: false, status: "credential_required" });
    expect(stdioLaunchOf(config({ command: "npx", args: ["-y", "demo-mcp"], headers: { Authorization: "Bearer token" } })))
      .toMatchObject({ ok: false, status: "credential_required" });
  });

  it("rejects local paths and unresolved placeholders", () => {
    expect(stdioLaunchOf(config({ command: "uv", args: ["--directory", "/Users/demo/mcp", "run", "server.py"] })))
      .toMatchObject({ ok: false, status: "unsafe_config" });
    expect(stdioLaunchOf(config({ command: "npx", args: ["-y", "YOUR_PACKAGE"] })))
      .toMatchObject({ ok: false, status: "unsafe_config" });
  });

  it("supports uv packages declared with --with", () => {
    const result = stdioLaunchOf(config({ command: "uv", args: ["run", "--with", "hologres-mcp-server", "hologres-mcp-server"] }));
    expect(result).toMatchObject({
      ok: true,
      launch: { launcher: "uv", packageName: "hologres-mcp-server", mode: "uv-with" },
    });
  });

  it("resolves and pins an npm package version before execution", async () => {
    const decision = stdioLaunchOf(config({ command: "npx", args: ["-y", "demo-mcp"] }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ version: "1.2.3" }), { status: 200 })) as unknown as typeof fetch;
    const resolved = await resolveStdioLaunch(decision.launch, fetcher);
    expect(resolved).toEqual({ args: ["-y", "demo-mcp@1.2.3"], version: "1.2.3" });
  });

  it("replaces npm version ranges with an exact registry version", async () => {
    const decision = stdioLaunchOf(config({ command: "npx", args: ["-y", "demo-mcp@^1.0.0"] }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ version: "1.4.2" }), { status: 200 })) as unknown as typeof fetch;
    expect(await resolveStdioLaunch(decision.launch, fetcher)).toEqual({ args: ["-y", "demo-mcp@1.4.2"], version: "1.4.2" });
  });

  it("uses an exact Python requirement for uvx", async () => {
    const decision = stdioLaunchOf(config({ command: "uvx", args: ["mcp-server-fetch"] }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ info: { version: "2.0.1" } }), { status: 200 })) as unknown as typeof fetch;
    const resolved = await resolveStdioLaunch(decision.launch, fetcher);
    expect(resolved).toEqual({ args: ["--from", "mcp-server-fetch==2.0.1", "mcp-server-fetch"], version: "2.0.1" });
  });
});
