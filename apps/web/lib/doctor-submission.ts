export type DoctorSubmissionItem = {
  key: string;
  payload: {
    type: "new_server";
    endpoint?: string;
    config: { mcpServers: Record<string, Record<string, unknown>> };
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function buildDoctorSubmissionItems(config: unknown): DoctorSubmissionItem[] {
  const root = asRecord(config);
  if (!root) return [];
  const servers = asRecord(root.mcpServers) ?? asRecord(root.servers) ?? root;
  return Object.entries(servers).flatMap(([key, value]) => {
    const entry = asRecord(value);
    if (!entry) return [];
    const endpoint = typeof entry.url === "string" && entry.url.trim() ? entry.url.trim() : undefined;
    return [{
      key,
      payload: {
        type: "new_server" as const,
        ...(endpoint ? { endpoint } : {}),
        config: { mcpServers: { [key]: entry } },
      },
    }];
  });
}
