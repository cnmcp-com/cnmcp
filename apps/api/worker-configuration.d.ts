type WorkerQueueMessage =
  | { kind: "community-ingest"; submissionId: string }
  | { kind: "community-static"; projectId: string; submissionId?: string }
  | { kind: "community-dynamic"; projectId: string }
  | { kind: "submission"; submissionId: string }
  | { kind: "stdio"; serverId: string }
  | { serverId: string };

interface CloudflareEnv {
  DB: D1Database;
  EVIDENCE?: R2Bucket;
  VERIFY_QUEUE?: Queue<WorkerQueueMessage>;
  STDIO_PROBE_QUEUE?: Queue<WorkerQueueMessage>;
  SUBMISSION_QUEUE?: Queue<WorkerQueueMessage>;
  STDIO_PROBE_CONTAINER?: DurableObjectNamespace<import("./src/stdio-container").StdioProbeContainer>;
  ALLOWED_ORIGINS: string;
  GITHUB_TOKEN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  INTERNAL_API_TOKEN?: string;
  STDIO_PROBE_ENABLED?: string;
  STDIO_PROBE_BATCH_SIZE?: string;
}

declare module "cloudflare:workers" {
  interface ProcessEnv extends CloudflareEnv {}
}
