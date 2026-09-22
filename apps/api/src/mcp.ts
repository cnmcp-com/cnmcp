export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpHandshake = {
  ok: boolean;
  error?: string;
  latencyMs: number | null;
  protocolVersion: string | null;
  tools: McpTool[];
};

function parseSseData(body: string): unknown {
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      const data = line.slice(5).trim();
      if (data && data !== "[DONE]") return JSON.parse(data) as unknown;
    }
  }
  return JSON.parse(body) as unknown;
}

async function rpc(url: string, method: string, params: unknown, sessionId: string | null, timeoutMs: number): Promise<{ json: Record<string, unknown>; sessionId: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
      "User-Agent": "cnmcp-verify/0.1",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    const nextSession = response.headers.get("Mcp-Session-Id") ?? sessionId;
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = (text.startsWith("event:") || text.includes("data:") ? parseSseData(text) : JSON.parse(text)) as Record<string, unknown>;
    if (parsed.error) throw new Error(JSON.stringify(parsed.error));
    return { json: parsed, sessionId: nextSession };
  } finally {
    clearTimeout(timer);
  }
}

export async function handshakeMcp(url: string, timeoutMs = 12_000): Promise<McpHandshake> {
  const started = Date.now();
  try {
    const init = await rpc(
      url,
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "cnmcp", version: "0.1.0" },
      },
      null,
      timeoutMs,
    );
    const result = (init.json.result ?? {}) as Record<string, unknown>;
    const protocolVersion = typeof result.protocolVersion === "string" ? result.protocolVersion : null;
    try {
      await rpc(url, "notifications/initialized", {}, init.sessionId, Math.min(4000, timeoutMs));
    } catch {
      // some servers reject the notification; tools/list may still work
    }
    const listed = await rpc(url, "tools/list", {}, init.sessionId, timeoutMs);
    const listResult = (listed.json.result ?? {}) as Record<string, unknown>;
    const tools = Array.isArray(listResult.tools)
      ? listResult.tools.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const tool = item as Record<string, unknown>;
          if (typeof tool.name !== "string") return [];
          return [
            {
              name: tool.name,
              description: typeof tool.description === "string" ? tool.description : "",
              inputSchema: tool.inputSchema ?? tool.input_schema,
            },
          ];
        })
      : [];
    return {
      ok: true,
      latencyMs: Date.now() - started,
      protocolVersion,
      tools,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: message === "The operation was aborted." ? "timeout" : message.slice(0, 300),
      latencyMs: Date.now() - started,
      protocolVersion: null,
      tools: [],
    };
  }
}
