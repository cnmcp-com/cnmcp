import { describe, expect, it } from "vitest";

import type { ScoreSnapshot } from "@cnmcp/schema";
import { assessTrust } from "./assessment";
import type { StaticCatalogCheck } from "./static";

function staticCheck(overrides: Partial<StaticCatalogCheck> = {}): StaticCatalogCheck {
  return {
    serverId: "cloud.tencent.com/10000",
    checkerVersion: "static-v1",
    status: "ready_for_dynamic",
    dynamicMode: "remote_handshake",
    risk: { level: "unknown", high: 0, warnings: 0 },
    confidence: {
      score: 100,
      band: "high",
      components: { provenance: 25, tools: 25, config: 25, pricing: 10, freshness: 15 },
    },
    signals: [],
    ...overrides,
  };
}

function dynamic(overrides: Partial<ScoreSnapshot> = {}): ScoreSnapshot {
  return {
    serverId: "cloud.tencent.com/10000",
    score: 100,
    grade: "A",
    algorithmVersion: "v1.0",
    computedAt: "2026-09-23T00:00:00.000Z",
    reason: "scored",
    components: {
      alive: { status: "pass", score: 40, evidence: {} },
      contract: { status: "pass", score: 30, evidence: {} },
      probe: { status: "pass", score: 20, evidence: {} },
      freshness: { status: "pass", score: 10, evidence: {} },
    },
    ...overrides,
  };
}

describe("trust assessment", () => {
  it("never turns metadata-only evidence into a trust score", () => {
    const result = assessTrust(staticCheck({ status: "metadata_only", dynamicMode: "none" }), null);
    expect(result.verdict).toBe("unverified");
    expect(result.operationalScore).toBeNull();
  });

  it("blocks a high-risk static finding even if a handshake succeeded", () => {
    const result = assessTrust(
      staticCheck({ status: "blocked", risk: { level: "high", high: 1, warnings: 0 } }),
      dynamic(),
    );
    expect(result.verdict).toBe("blocked");
    expect(result.reasons).toContain("HIGH_RISK_STATIC_SIGNAL");
  });

  it("does not recommend a dead endpoint", () => {
    const result = assessTrust(staticCheck(), dynamic({ score: null, grade: null, reason: "dead" }));
    expect(result.verdict).toBe("not_recommended");
  });

  it("keeps destructive or deprecated resources conditional after a successful handshake", () => {
    const result = assessTrust(staticCheck({ risk: { level: "medium", high: 0, warnings: 1 } }), dynamic());
    expect(result.verdict).toBe("conditional");
    expect(result.operationalScore).toBe(100);
  });

  it("calls a complete live result verified usable, not safe or production ready", () => {
    const result = assessTrust(staticCheck(), dynamic());
    expect(result.verdict).toBe("verified_usable");
    expect(result.label).toBe("已验证可用");
  });
});
