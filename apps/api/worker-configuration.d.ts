interface CloudflareEnv {
  DB: D1Database;
  EVIDENCE?: R2Bucket;
  VERIFY_QUEUE?: Queue<{ serverId: string }>;
  STDIO_PROBE_QUEUE?: Queue<{ kind: "stdio"; serverId: string }>;
  STDIO_PROBE_CONTAINER?: DurableObjectNamespace<import("./src/stdio-container").StdioProbeContainer>;
  INGEST_WORKFLOW: Workflow;
  ALLOWED_ORIGINS: string;
  GITHUB_TOKEN?: string;
  INTERNAL_API_TOKEN?: string;
  STDIO_PROBE_ENABLED?: string;
  STDIO_PROBE_BATCH_SIZE?: string;
}

declare module "cloudflare:workers" {
  interface ProcessEnv extends CloudflareEnv {}
}
