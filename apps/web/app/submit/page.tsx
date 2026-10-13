"use client";

import { useState } from "react";

import { getPublicApiUrl } from "@/lib/api";

type SubmissionState = { tone: "ok" | "bad"; text: string } | null;

export default function SubmitPage() {
  const [status, setStatus] = useState<SubmissionState>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const repoUrl = String(form.get("repoUrl") ?? "").trim();
    const packageName = String(form.get("packageName") ?? "").trim();
    const packageRegistry = String(form.get("packageRegistry") ?? "npm");
    const endpoint = String(form.get("endpoint") ?? "").trim();
    const configText = String(form.get("config") ?? "").trim();

    if (!repoUrl && !packageName && !endpoint && !configText) {
      setStatus({ tone: "bad", text: "请至少填写公开仓库、包名、MCP 端点或公开安装配置。" });
      return;
    }
    let config: unknown;
    if (configText) {
      try {
        config = JSON.parse(configText) as unknown;
      } catch {
        setStatus({ tone: "bad", text: "安装配置不是有效 JSON。请勿粘贴真实密钥。" });
        return;
      }
    }

    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch(`${getPublicApiUrl()}/v1/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "new_server",
          repoUrl: repoUrl || undefined,
          packageName: packageName || undefined,
          packageRegistry: packageName ? packageRegistry : undefined,
          endpoint: endpoint || undefined,
          config,
        }),
      });
      const result = await response.json() as { id?: string; error?: { message?: string } };
      setStatus(response.ok
        ? { tone: "ok", text: `已进入处理队列。回执编号：${result.id ?? "—"}` }
        : { tone: "bad", text: result.error?.message ?? "提交失败，请稍后重试。" });
      if (response.ok) event.currentTarget.reset();
    } catch {
      setStatus({ tone: "bad", text: "无法连接提交接口，请确认本地 API 已启动。" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wrap submit-page">
      <div className="page-hd">
        <h1>提交 MCP 资源</h1>
        <p>提交内容只用于定位资源，站点会重新获取公开资料并独立检测，不会把用户描述作为收录或评分依据。</p>
      </div>
      <div className="submit-grid">
        <form onSubmit={onSubmit} className="card submit-form">
          <label className="form-field">
            公开代码仓库 <span>推荐</span>
            <input name="repoUrl" placeholder="https://github.com/owner/project" inputMode="url" />
          </label>
          <label className="form-field">
            发布包 <span>可选</span>
            <select name="packageRegistry" defaultValue="npm">
              <option value="npm">npm</option>
              <option value="pypi">PyPI</option>
            </select>
            <input name="packageName" placeholder="@scope/package 或 package-name" />
          </label>
          <label className="form-field">
            公开 MCP 端点 <span>可选</span>
            <input name="endpoint" placeholder="https://mcp.example.org/mcp" inputMode="url" />
          </label>
          <label className="form-field">
            安装配置 JSON <span>可选，可自动识别包名</span>
            <textarea
              name="config"
              placeholder={'{"mcpServers":{"demo":{"command":"npx","args":["-y","demo-mcp"],"env":{"API_TOKEN":"${API_TOKEN}"}}}}'}
              maxLength={12000}
            />
          </label>
          <button className="btn btn-p" type="submit" disabled={submitting}>
            {submitting ? "正在提交…" : "提交审核"}
          </button>
          {status ? <p className={`submit-status ${status.tone}`}>{status.text}</p> : null}
        </form>
        <aside className="card submit-flow">
          <h2>提交后会发生什么</h2>
          <ol>
            <li><b>1</b><div><strong>检查公开来源</strong><span>核对端点、仓库和发布主体。</span></div></li>
            <li><b>2</b><div><strong>静态检查</strong><span>生成证据完整度与风险线索。</span></div></li>
            <li><b>3</b><div><strong>动态验证</strong><span>具备条件时执行标准协议握手。</span></div></li>
            <li><b>4</b><div><strong>写入目录</strong><span>保留证据、时间和算法版本。</span></div></li>
          </ol>
          <p>提交记录只表示进入处理队列，不构成可信证据。请勿提交 API Key、令牌或密码。</p>
        </aside>
      </div>
    </div>
  );
}
