"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { ServerSummary } from "@cnmcp/schema";

import { GRADE_PILL, formatDateShort, reachLabel, transportLabel } from "@/lib/ui";

export function HeroSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function go(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    router.push(`/servers?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      className="srch"
      onSubmit={(event) => {
        event.preventDefault();
        go(value);
      }}
    >
      <span className="ic" aria-hidden>
        ⌕
      </span>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="搜索 MCP 服务、工具或业务场景"
        aria-label="搜索 MCP 服务、工具或业务场景"
        type="search"
      />
      <button type="submit" aria-label="搜索目录">搜索</button>
    </form>
  );
}

export function ServerCard({ server }: { server: ServerSummary }) {
  const reach = reachLabel(server.transport, server.reachableProbe);
  const measuredLabel = server.grade === "C" ? "已实测 · 需谨慎" : server.grade === "D" ? "已实测 · 结果较差" : "已实测";

  return (
    <Link href={`/servers/${encodeURIComponent(server.id)}`} className="sc">
      {server.status === "dead" ? <span className="pill p-bad sc-badge">失效</span> : null}
      <div className="sc-top">
        <span className={`resource-mark ${server.isOfficial ? "official" : server.transport === "remote" ? "remote" : "local"}`} role="img" aria-label={server.isOfficial ? "可信方发布资源" : transportLabel(server.transport)}>
          {server.isOfficial ? (
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2.8 20 6v5.9c0 4.9-3.2 8.2-8 9.8-4.8-1.6-8-4.9-8-9.8V6l8-3.2Z"/><path d="m8.3 12.1 2.3 2.3 5.1-5.1"/></svg>
          ) : server.transport === "remote" ? (
            <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5C9.8 18.2 8.7 15.4 8.7 12S9.8 5.8 12 3.5Z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="m7.5 9 3 3-3 3M12.5 15h4"/></svg>
          )}
        </span>
        <div className="nm">
          <h3>
            {server.title}
            {server.isOfficial ? <span className="pill p-info" style={{ fontSize: 11 }}>可信方发布</span> : null}
            {server.grade ? <span className={`pill ${GRADE_PILL[server.grade]}`}>{measuredLabel}</span> : <span className="pill p-gray">待实测</span>}
          </h3>
          {server.sourceLabel ? <div className="ns">{server.sourceLabel}</div> : null}
        </div>
      </div>
      <div className="sc-desc">{server.description || "暂无描述"}</div>
      <div className="sc-tags">
        <span className="chip">{transportLabel(server.transport)}</span>
        {server.transport === "remote" ? <span className={`pill ${reach.pill}`}>{reach.text}</span> : null}
      </div>
      <div className="sc-foot">
        {server.latencyMs != null ? <span>{Math.round(server.latencyMs)}ms</span> : null}
        <span style={{ marginLeft: "auto" }}>{server.score != null ? `实测更新 ${formatDateShort(server.verifiedAt)}` : "公开资料已检查"}</span>
      </div>
    </Link>
  );
}

export function DetailTabs({ tabs }: { tabs: Array<{ id: string; label: string; content: ReactNode }> }) {
  const first = tabs[0]?.id ?? "ov";
  const [active, setActive] = useState(first);

  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} className={active === tab.id ? "on" : undefined} onClick={() => setActive(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} className={`panel${active === tab.id ? " on" : ""}`} role="tabpanel">
          {tab.content}
        </div>
      ))}
    </>
  );
}
