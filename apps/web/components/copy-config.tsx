"use client";

import { useState } from "react";
import type { ReliableConfig } from "@cnmcp/schema";

import { toast } from "./toast";

const SOURCE_LABEL = {
  readme: "广场 README 原文",
  remote: "来源给出的端点",
} as const;

export function CopyConfig({
  config,
  declaredCount,
  measuredCount,
}: {
  config: ReliableConfig | null;
  declaredCount: number;
  measuredCount: number;
}) {
  const [copied, setCopied] = useState(false);
  const text = config ? JSON.stringify(config.config, null, 2) : "";

  async function onCopy() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast("已复制到剪贴板");
  }

  return (
    <div className="rail-c">
      <h4>
        接入配置
        <em style={{ fontStyle: "normal", fontSize: 11, color: "var(--tx-3)", fontFamily: "var(--mono)" }}>
          声明 {declaredCount} · 实测 {measuredCount}
        </em>
      </h4>
      {config ? (
        <>
          <div className="config-note">{SOURCE_LABEL[config.source]}</div>
          <div style={{ padding: 12 }}>
            <pre className="code" style={{ margin: 0 }}>
              {text}
            </pre>
          </div>
          <div className="copybar">
            <span style={{ fontSize: 11.5, color: "var(--tx-3)" }}>按来源原文复制</span>
            <button type="button" className="btn btn-s btn-sm" onClick={onCopy}>
              {copied ? "已复制" : "复制配置"}
            </button>
          </div>
        </>
      ) : (
        <div className="config-empty">来源未提供可直接复制的接入配置。</div>
      )}
    </div>
  );
}
