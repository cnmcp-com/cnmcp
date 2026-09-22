import {
  ALGORITHM_VERSION,
  V1_WEIGHTS,
  type CheckerComponent,
  type CheckerStatus,
  type Grade,
  type ScoreReason,
  type ScoreSnapshot,
  type Transport,
  type V1Checker,
} from "@cnmcp/schema";

export type ToolInput = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type ScoreInput = {
  transport: Transport;
  alive: { ok: boolean; error?: string; protocolVersion?: string | null; latencyMs?: number | null };
  toolsActual: ToolInput[];
  toolsClaimed: string[];
  probe: { reachable: boolean | null; latencyMs: number | null; error?: string };
  lastPublishedAt: string | null;
  versionCount: number;
  now?: number;
};

export function gradeFromScore(score: number): Grade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

export function checkAlive(input: ScoreInput["alive"]): CheckerComponent {
  if (input.ok) {
    return {
      status: "pass",
      score: V1_WEIGHTS.alive,
      evidence: {
        initialize: "ok",
        protocolVersion: input.protocolVersion ?? null,
        latencyMs: input.latencyMs ?? null,
      },
    };
  }
  return {
    status: "fail",
    score: 0,
    evidence: { initialize: "fail", error: input.error ?? "unreachable" },
  };
}

export function checkContract(actual: ToolInput[], claimed: string[]): CheckerComponent {
  const actualNames = actual.map((tool) => tool.name);
  if (claimed.length === 0) {
    return {
      status: actualNames.length > 0 ? "pass" : "warn",
      score: actualNames.length > 0 ? V1_WEIGHTS.contract : 10,
      evidence: {
        claimedCount: 0,
        actualCount: actualNames.length,
        actualNames,
        note: "无声称清单，按实测 tools/list 计",
      },
    };
  }
  const actualSet = new Set(actualNames);
  const claimedSet = new Set(claimed);
  const missing = claimed.filter((name) => !actualSet.has(name));
  const extra = actualNames.filter((name) => !claimedSet.has(name));
  const matched = claimed.length - missing.length;
  const ratio = claimed.length === 0 ? 1 : matched / claimed.length;
  const score = Math.round(V1_WEIGHTS.contract * ratio);
  const status: CheckerStatus = missing.length === 0 ? "pass" : score >= 15 ? "warn" : "fail";
  return {
    status,
    score,
    evidence: { claimed, actualNames, missing, extra },
  };
}

export function checkProbe(transport: Transport, probe: ScoreInput["probe"]): CheckerComponent {
  if (transport !== "remote") {
    return {
      status: "skip",
      score: V1_WEIGHTS.probe,
      evidence: { skipped: true, reason: "local_or_unknown", note: "非 remote 端点不做本站探测" },
    };
  }
  if (probe.reachable === true) {
    return {
      status: "pass",
      score: V1_WEIGHTS.probe,
      evidence: { reachableProbe: true, latencyMs: probe.latencyMs, note: "本站探测可达，不是中国大陆四城实测" },
    };
  }
  return {
    status: "fail",
    score: 0,
    evidence: { reachableProbe: false, latencyMs: probe.latencyMs, error: probe.error ?? "timeout" },
  };
}

export function checkFreshness(
  lastPublishedAt: string | null,
  versionCount: number,
  now = Date.now(),
): CheckerComponent {
  if (!lastPublishedAt) {
    return {
      status: "warn",
      score: versionCount > 0 ? 4 : 0,
      evidence: { lastPublishedAt: null, versionCount, label: "unknown" },
    };
  }
  const published = Date.parse(lastPublishedAt);
  if (!Number.isFinite(published)) {
    return {
      status: "warn",
      score: 0,
      evidence: { lastPublishedAt, versionCount, label: "invalid_date" },
    };
  }
  const ageDays = Math.max(0, (now - published) / 86_400_000);
  let score = 0;
  let label = "abandoned";
  let status: CheckerStatus = "fail";
  if (ageDays <= 90) {
    score = V1_WEIGHTS.freshness;
    label = "active";
    status = "pass";
  } else if (ageDays <= 180) {
    score = 6;
    label = "stale";
    status = "warn";
  } else if (ageDays <= 365) {
    score = 3;
    label = "aging";
    status = "warn";
  }
  return {
    status,
    score,
    evidence: { lastPublishedAt, versionCount, ageDays: Math.round(ageDays), label },
  };
}

export function computeTrustScore(input: ScoreInput): ScoreSnapshot {
  const computedAt = new Date(input.now ?? Date.now()).toISOString();
  const alive = checkAlive(input.alive);
  const contract = checkContract(input.toolsActual, input.toolsClaimed);
  const probe = checkProbe(input.transport, input.probe);
  const freshness = checkFreshness(input.lastPublishedAt, input.versionCount, input.now);
  const components: Record<V1Checker, CheckerComponent> = { alive, contract, probe, freshness };

  let reason: ScoreReason;
  if (input.transport === "unknown") reason = "unverifiable";
  else if (input.transport === "local") reason = "unverified_local";
  else if (!input.alive.ok) reason = "dead";
  else reason = "scored";

  const raw = alive.score + contract.score + probe.score + freshness.score;
  const score = reason === "scored" ? raw : null;
  const grade = score === null ? null : gradeFromScore(score);

  return {
    serverId: "",
    score,
    grade,
    algorithmVersion: ALGORITHM_VERSION,
    computedAt,
    reason,
    components,
  };
}

export function recomputeFromEvidence(input: ScoreInput): Pick<ScoreSnapshot, "score" | "grade" | "algorithmVersion" | "reason" | "components"> {
  const result = computeTrustScore(input);
  return {
    score: result.score,
    grade: result.grade,
    algorithmVersion: result.algorithmVersion,
    reason: result.reason,
    components: result.components,
  };
}
