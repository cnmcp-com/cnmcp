interface CloudflareEnv {
  DB: D1Database;
  EVIDENCE?: R2Bucket;
  VERIFY_QUEUE?: Queue<{ serverId: string }>;
  INGEST_WORKFLOW: Workflow;
  ALLOWED_ORIGINS: string;
}

declare module "cloudflare:workers" {
  interface ProcessEnv extends CloudflareEnv {}
}
