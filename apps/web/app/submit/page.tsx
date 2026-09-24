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
    const type = String(form.get("type") ?? "new_server");
    const endpoint = String(form.get("endpoint") ?? "").trim();
    const namespace = String(form.get("namespace") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();

    if (!endpoint && !namespace) {
      setStatus({ tone: "bad", text: "请至少填写公开端点或 namespace/name。" });
      return;
    }
    if (endpoint) {
      try {
        const url = new URL(endpoint);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error("protocol");
      } catch {
        setStatus({ tone: "bad", text: "公开端点需要是完整的 http 或 https URL。" });
        return;
      }
    }

    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch(`${getPublicApiUrl()}/v1/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, endpoint, namespace, note }),
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
        <h1>提交资源或更正</h1>
        <p>只提交公开信息。不要粘贴 API Key、访问令牌或包含真实凭证的 mcp.json。</p>
      </div>
      <div className="submit-grid">
        <form onSubmit={onSubmit} className="card submit-form">
          <label className="form-field">
            提交类型
            <select name="type" defaultValue="new_server">
              <option value="new_server">新增资源</option>
              <option value="claim">认领或补充发布方</option>
              <option value="appeal">更正验证结果</option>
              <option value="rule">补充检查规则</option>
              <option value="opt_out">申请退出收录</option>
            </select>
          </label>
          <label className="form-field">
            公开端点 URL <span>可选</span>
            <input name="endpoint" placeholder="https://example.com/mcp" inputMode="url" />
          </label>
          <label className="form-field">
            namespace/name <span>可选</span>
            <input name="namespace" placeholder="example.com/maps" />
          </label>
          <label className="form-field">
            说明与证据
            <textarea name="note" placeholder="请附公开仓库、官网或能够复核的说明。" maxLength={2000} />
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
          <p>提交不代表通过，也不会因付费获得收录或提分。</p>
        </aside>
      </div>
    </div>
  );
}
