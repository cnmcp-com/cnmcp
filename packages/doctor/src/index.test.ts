import { describe, expect, it } from "vitest";

import { DEMO_CONFIG, maskSecret, runDoctor } from "./index";

describe("doctor", () => {
  it("masks secrets and never needs a network call to find them", () => {
    const report = runDoctor(DEMO_CONFIG, []);
    expect(report.parseError).toBeNull();
    expect(report.secretCount).toBeGreaterThan(0);
    expect(report.secrets[0]?.masked).toMatch(/…/);
    expect(report.secrets[0]?.masked).not.toContain("8f2c1a9e4b7d6c3f0a1b2c3d4e5f6a7b");
    expect(report.redactedConfig).toContain("${env:MCP_TOKEN}");
    expect(report.redactedConfig).not.toContain("8f2c1a9e4b7d6c3f0a1b2c3d4e5f6a7b");
  });

  it("returns a parse error location for invalid json", () => {
    const report = runDoctor("{ not json", []);
    expect(report.parseError).toMatch(/JSON 解析失败/);
    expect(report.serverCount).toBe(0);
  });

  it("matches catalog by endpoint host", () => {
    const report = runDoctor(DEMO_CONFIG, [
      {
        id: "example.com/maps",
        name: "maps",
        namespace: "example.com",
        title: "Demo Maps",
        score: 90,
        grade: "A",
        transport: "remote",
        status: "verified",
        reachableProbe: false,
        latencyMs: null,
        auth: "none",
        region: null,
        versionCount: 1,
        protocolVersion: "2025-03-26",
        pricingModel: "byok",
        billingParty: "Example",
        poisoned: false,
        endpointHost: "mcp.example-maps.test",
      },
    ]);
    const maps = report.rows.find((row) => row.key === "demo-maps");
    expect(maps?.matched?.id).toBe("example.com/maps");
    expect(maps?.issues.some((issue) => issue.text.includes("本站探测不可达"))).toBe(true);
  });

  it("masks short secrets", () => {
    expect(maskSecret("Bearer abcdefghij")).toMatch(/\*\*\*\*/);
  });
});
