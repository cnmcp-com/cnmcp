"use client";

import { useState } from "react";
import type { ServerDetail } from "@cnmcp/schema";

import { toast } from "./toast";

const CLIENTS = ["Cursor", "Claude Desktop", "Cherry Studio", "Cline", "通用 JSON"] as const;
type Client = (typeof CLIENTS)[number];

function configFor(server: ServerDetail, client: Client): string {
  const endpoint = server.endpoints[0]?.url ?? "https://example.com/mcp";
  const key = server.name || server.id;

  if (server.transport === "local") {
    return JSON.stringify(
      {
        mcpServers: {
          [key]: {
            command: "npx",
            args: ["-y", server.packageName ?? server.id],
          },
        },
      },
      null,
      2,
    );
  }

  if (client === "Claude Desktop") {
    return JSON.stringify(
      {
        mcpServers: {
          [key]: {
            command: "npx",
            args: ["-y", "mcp-remote", endpoint],
            env: { MCP_TOKEN: "YOUR_TOKEN_HERE" },
          },
        },
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      mcpServers: {
        [key]: {
          type: "http",
          url: endpoint,
          headers: { Authorization: "Bearer YOUR_TOKEN_HERE" },
        },
      },
    },
    null,
    2,
  );
}

export function CopyConfig({ server }: { server: ServerDetail }) {
  const [client, setClient] = useState<Client>("Cursor");
  const config = configFor(server, client);

  async function onCopy() {
    await navigator.clipboard.writeText(config);
    toast("已复制到剪贴板");
  }

  return (
    <div className="rail-c">
      <h4>
        接入配置
        <em style={{ fontStyle: "normal", fontSize: 11, color: "var(--tx-3)", fontFamily: "var(--mono)" }}>{server.tools.length} tools</em>
      </h4>
      <div className="ctabs">
        {CLIENTS.map((item) => (
          <button key={item} type="button" className={client === item ? "on" : undefined} onClick={() => setClient(item)}>
            {item}
          </button>
        ))}
      </div>
      <div style={{ padding: 12 }}>
        <pre className="code" style={{ margin: 0 }}>
          {config}
        </pre>
      </div>
      <div className="copybar">
        <span style={{ fontSize: 11.5, color: "var(--tx-3)" }}>凭证一律用占位符</span>
        <button type="button" className="btn btn-s btn-sm" onClick={onCopy}>
          复制配置
        </button>
      </div>
    </div>
  );
}
