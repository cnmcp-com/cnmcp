"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { ServerSummary } from "@cnmcp/schema";

import { PRICING, formatDateShort, reachLabel } from "@/lib/ui";
import { ScoreRing } from "./score-ring";

export function HeroSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function go(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("{")) {
      try {
        sessionStorage.setItem("cnmcp-doctor-config", trimmed);
      } catch {
        /* ignore */
      }
      router.push("/doctor");
      return;
    }
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
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          if (next.trim().startsWith("{")) go(next);
        }}
        placeholder="搜索 server、工具名或直接粘贴 mcp.json"
        aria-label="搜索 server 或粘贴配置"
      />
    </form>
  );
}

export function ServerCard({ server }: { server: ServerSummary }) {
  const pricing = PRICING[server.pricingModel];
  const reach = reachLabel(server.transport, server.reachableProbe);

  return (
    <Link href={`/servers/${encodeURIComponent(server.id)}`} className="sc">
      {server.status === "dead" ? <span className="pill p-bad sc-badge">失效</span> : null}
      <div className="sc-top">
        <ScoreRing score={server.score} grade={server.grade} size="card" />
        <div className="nm">
          <h3>
            {server.title}
            {server.isOfficial ? <span className="chip" style={{ fontSize: 11 }}>官方</span> : null}
          </h3>
          <div className="ns">{server.namespace || server.id}</div>
        </div>
      </div>
      <div className="sc-desc">{server.description || "暂无描述"}</div>
      <div className="sc-tags">
        <span className={`pill ${pricing.pill}`}>{pricing.label}</span>
        <span className="chip mono">{server.transport}</span>
        <span className={`pill ${reach.pill}`}>{reach.text}</span>
      </div>
      <div className="sc-foot">
        <span>{server.latencyMs != null ? `${Math.round(server.latencyMs)}ms` : "—"}</span>
        <span style={{ marginLeft: "auto" }}>{formatDateShort(server.verifiedAt)}</span>
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
