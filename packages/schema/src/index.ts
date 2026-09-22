export const ALGORITHM_VERSION = "v1.0";

export const V1_WEIGHTS = {
  alive: 40,
  contract: 30,
  probe: 20,
  freshness: 10,
} as const;

export type V1Checker = keyof typeof V1_WEIGHTS;

export const GRADES = ["A", "B", "C", "D"] as const;
export type Grade = (typeof GRADES)[number];

export const TRANSPORTS = ["remote", "local", "unknown"] as const;
export type Transport = (typeof TRANSPORTS)[number];

export const PRICING_MODELS = [
  "free",
  "byok",
  "freemium",
  "subscription",
  "metered",
  "unknown",
] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const CHECKER_STATUSES = ["pass", "warn", "fail", "skip"] as const;
export type CheckerStatus = (typeof CHECKER_STATUSES)[number];

export const SERVER_STATUSES = ["unverified", "verified", "dead", "unverifiable", "local_untested"] as const;
export type ServerStatus = (typeof SERVER_STATUSES)[number];

export type ScoreReason = "scored" | "dead" | "unverified_local" | "unverifiable";

export type VendorType = "company" | "individual" | "community";

export type Vendor = {
  id: string;
  name: string;
  type: VendorType;
  verified: boolean;
  homepage: string | null;
};

export type Pricing = {
  serverId: string;
  model: PricingModel;
  detail: string | null;
  billingParty: string | null;
  freeQuota: string | null;
  source: "official" | "vendor" | "unverified";
  collectedAt: string | null;
};

export type Endpoint = {
  url: string;
  transport: string;
  region: string | null;
  reachableProbe: boolean | null;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
};

export type ToolRecord = {
  name: string;
  description: string;
  inputSchema: unknown;
  poisoningFlags: string[];
  firstSeenAt: string;
  lastSeenAt: string;
};

export type Verification = {
  id: string;
  serverId: string;
  runAt: string;
  checker: V1Checker;
  status: CheckerStatus;
  score: number;
  evidence: unknown;
};

export type ScoreSnapshot = {
  serverId: string;
  score: number | null;
  grade: Grade | null;
  algorithmVersion: string;
  computedAt: string;
  reason: ScoreReason;
  components: Record<V1Checker, CheckerComponent>;
};

export type CheckerComponent = {
  status: CheckerStatus;
  score: number;
  evidence: unknown;
};

export type ChangeEvent = {
  serverId: string;
  type: "tool_added" | "tool_removed" | "description_changed" | "schema_changed" | "pricing_changed";
  severity: "info" | "warn" | "high";
  diff: unknown;
  detectedAt: string;
};

export type Submission = {
  id: string;
  type: "new_server" | "claim" | "appeal" | "rule" | "opt_out";
  payload: unknown;
  status: "queued" | "accepted" | "rejected";
  submittedAt: string;
};

export type ServerSummary = {
  id: string;
  namespace: string;
  name: string;
  title: string;
  description: string;
  transport: Transport;
  isOfficial: boolean;
  status: ServerStatus;
  score: number | null;
  grade: Grade | null;
  algorithmVersion: string;
  reachableProbe: boolean | null;
  latencyMs: number | null;
  pricingModel: PricingModel;
  verifiedAt: string | null;
  lastPublishedAt: string | null;
  protocolVersion: string | null;
  sourceRegistries: string[];
};

export type ServerDetail = ServerSummary & {
  repoUrl: string | null;
  packageName: string | null;
  latestVersion: string | null;
  versionCount: number;
  firstPublishedAt: string | null;
  license: string | null;
  homepage: string | null;
  docsUrl: string | null;
  capabilities: string[];
  vendor: Vendor | null;
  pricing: Pricing;
  endpoints: Endpoint[];
  tools: ToolRecord[];
  claimedToolNames: string[];
  verifications: Verification[];
  snapshots: ScoreSnapshot[];
  changeEvents: ChangeEvent[];
};

export type CatalogIndexEntry = {
  id: string;
  name: string;
  namespace: string;
  title: string;
  score: number | null;
  grade: Grade | null;
  transport: Transport;
  status: ServerStatus;
  reachableProbe: boolean | null;
  latencyMs: number | null;
  auth: string | null;
  region: string | null;
  versionCount: number;
  protocolVersion: string | null;
  pricingModel: PricingModel;
  billingParty: string | null;
  poisoned: boolean;
  endpointHost: string | null;
};

export type CatalogIndex = {
  generatedAt: string;
  algorithmVersion: string;
  servers: CatalogIndexEntry[];
};

export type DirectoryQuery = {
  q: string;
  grade: Grade | "";
  reachable: "yes" | "no" | "";
  transport: Transport | "";
  official: "yes" | "no" | "";
  pricing: PricingModel | "";
  cursor: string;
  limit: number;
};
