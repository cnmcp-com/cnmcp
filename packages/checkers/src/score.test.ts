import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ALGORITHM_VERSION } from "@cnmcp/schema";
import { describe, expect, it } from "vitest";

import { computeTrustScore, gradeFromScore, recomputeFromEvidence, type ScoreInput } from "./score";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/example-server.json");

function loadFixture(): ScoreInput {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as ScoreInput;
}

describe("trust score v1", () => {
  it("recomputes the public fixture to 100 / A", () => {
    const result = recomputeFromEvidence(loadFixture());
    expect(result.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(result.reason).toBe("scored");
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
    expect(result.components.alive.score).toBe(40);
    expect(result.components.contract.score).toBe(30);
    expect(result.components.probe.score).toBe(20);
    expect(result.components.freshness.score).toBe(10);
  });

  it("does not invent a score for a dead remote server", () => {
    const result = computeTrustScore({
      transport: "remote",
      alive: { ok: false, error: "timeout" },
      toolsActual: [],
      toolsClaimed: ["search"],
      probe: { reachable: false, latencyMs: null, error: "timeout" },
      lastPublishedAt: "2026-01-01T00:00:00.000Z",
      versionCount: 3,
      now: Date.parse("2026-09-21T00:00:00.000Z"),
    });
    expect(result.reason).toBe("dead");
    expect(result.score).toBeNull();
    expect(result.grade).toBeNull();
    expect(result.components.alive.status).toBe("fail");
  });

  it("marks local packages as unverified rather than scored", () => {
    const result = computeTrustScore({
      transport: "local",
      alive: { ok: false, error: "not_probed" },
      toolsActual: [],
      toolsClaimed: [],
      probe: { reachable: null, latencyMs: null },
      lastPublishedAt: "2026-09-01T00:00:00.000Z",
      versionCount: 12,
      now: Date.parse("2026-09-21T00:00:00.000Z"),
    });
    expect(result.reason).toBe("unverified_local");
    expect(result.score).toBeNull();
    expect(result.components.probe.status).toBe("skip");
  });

  it("partial contract match yields grade C on a live endpoint", () => {
    const result = computeTrustScore({
      transport: "remote",
      alive: { ok: true, protocolVersion: "2025-03-26", latencyMs: 80 },
      toolsActual: [{ name: "search" }],
      toolsClaimed: ["search", "write", "delete"],
      probe: { reachable: false, latencyMs: null, error: "timeout" },
      lastPublishedAt: "2024-01-01T00:00:00.000Z",
      versionCount: 1,
      now: Date.parse("2026-09-21T00:00:00.000Z"),
    });
    expect(result.reason).toBe("scored");
    expect(result.score).toBe(50);
    expect(result.grade).toBe("C");
    expect(gradeFromScore(50)).toBe("C");
  });
});
