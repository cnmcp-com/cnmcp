"use client";

import { useState } from "react";

import { getPublicApiUrl } from "@/lib/api";

export default function SubmitPage() {
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${getPublicApiUrl()}/v1/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "new_server",
        endpoint: String(form.get("endpoint") ?? ""),
        namespace: String(form.get("namespace") ?? ""),
        note: String(form.get("note") ?? ""),
      }),
    });
    setStatus(response.ok ? "已进入验证队列" : "提交失败");
  }

  return (
    <div className="wrap">
      <div className="page-hd">
      <h1>提交 server</h1>
        <p>不要粘贴含密钥的 mcp.json。只需公开端点或 namespace。</p>
      </div>
      <form onSubmit={onSubmit} className="card" style={{ padding: 20, maxWidth: 520, display: "grid", gap: 12 }}>
        <label className="form-field">
          公开端点 URL
          <input name="endpoint" placeholder="https://example.com/mcp" />
        </label>
        <label className="form-field">
          namespace/name
          <input name="namespace" placeholder="example.com/maps" />
        </label>
        <label className="form-field">
          说明
          <textarea name="note" />
        </label>
        <button className="btn btn-p" type="submit">
          提交验证
        </button>
        {status ? <p style={{ fontSize: 13, color: "var(--tx-2)" }}>{status}</p> : null}
      </form>
    </div>
  );
}
