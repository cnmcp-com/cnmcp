import type { ScoreSnapshot } from "@cnmcp/schema";

import type { StaticCatalogCheck } from "./static";

export type TrustVerdict = "unverified" | "blocked" | "not_recommended" | "conditional" | "verified_usable";

export type TrustAssessmentReason =
  | "STATIC_EVIDENCE_INCOMPLETE"
  | "DYNAMIC_NOT_RUN"
  | "HIGH_RISK_STATIC_SIGNAL"
  | "DYNAMIC_VERIFICATION_FAILED"
  | "MEDIUM_RISK_SIGNAL"
  | "LOW_EVIDENCE_CONFIDENCE"
  | "LOW_OPERATIONAL_SCORE";

export type TrustAssessment = {
  serverId: string;
  verdict: TrustVerdict;
  label: "未完成验证" | "高危阻断" | "不建议接入" | "有条件可用" | "已验证可用";
  operationalScore: number | null;
  evidenceConfidence: number;
  reasons: TrustAssessmentReason[];
};

const LABELS: Record<TrustVerdict, TrustAssessment["label"]> = {
  unverified: "未完成验证",
  blocked: "高危阻断",
  not_recommended: "不建议接入",
  conditional: "有条件可用",
  verified_usable: "已验证可用",
};

function result(
  staticCheck: StaticCatalogCheck,
  dynamic: ScoreSnapshot | null,
  verdict: TrustVerdict,
  reasons: TrustAssessmentReason[],
): TrustAssessment {
  return {
    serverId: staticCheck.serverId,
    verdict,
    label: LABELS[verdict],
    operationalScore: dynamic?.reason === "scored" ? dynamic.score : null,
    evidenceConfidence: staticCheck.confidence.score,
    reasons,
  };
}

export function assessTrust(staticCheck: StaticCatalogCheck, dynamic: ScoreSnapshot | null): TrustAssessment {
  if (staticCheck.status === "blocked" || staticCheck.risk.level === "high") {
    return result(staticCheck, dynamic, "blocked", ["HIGH_RISK_STATIC_SIGNAL"]);
  }

  if (!dynamic) {
    const reasons: TrustAssessmentReason[] = ["DYNAMIC_NOT_RUN"];
    if (staticCheck.status === "metadata_only") reasons.unshift("STATIC_EVIDENCE_INCOMPLETE");
    return result(staticCheck, null, "unverified", reasons);
  }

  if (dynamic.reason === "dead") {
    return result(staticCheck, dynamic, "not_recommended", ["DYNAMIC_VERIFICATION_FAILED"]);
  }
  if (dynamic.reason !== "scored" || dynamic.score === null) {
    return result(staticCheck, dynamic, "unverified", ["DYNAMIC_VERIFICATION_FAILED"]);
  }
  if (dynamic.score < 50) {
    return result(staticCheck, dynamic, "not_recommended", ["LOW_OPERATIONAL_SCORE"]);
  }

  const conditionalReasons: TrustAssessmentReason[] = [];
  if (staticCheck.risk.level === "medium") conditionalReasons.push("MEDIUM_RISK_SIGNAL");
  if (staticCheck.confidence.band !== "high") conditionalReasons.push("LOW_EVIDENCE_CONFIDENCE");
  if (dynamic.score < 70) conditionalReasons.push("LOW_OPERATIONAL_SCORE");
  if (conditionalReasons.length) return result(staticCheck, dynamic, "conditional", conditionalReasons);

  return result(staticCheck, dynamic, "verified_usable", []);
}
