"use client";

import { useEffect, useState } from "react";
import { DEMO_CONFIG, runDoctor, type DoctorReport } from "@cnmcp/doctor";
import type { CatalogIndex } from "@cnmcp/schema";

import { toast } from "./toast";

export function DoctorPanel({ indexUrl }: { indexUrl: string }) {
  const [raw, setRaw] = useState("");
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [catalog, setCatalog] = useState<CatalogIndex["servers"]>([]);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(indexUrl)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((index: CatalogIndex) => setCatalog(index.servers ?? []))
      .catch(() => setIndexError("目录索引暂不可用，密钥检测仍可离线完成。"));
  }, [indexUrl]);

  useEffect(() => {
    try {
      const pasted = sessionStorage.getItem("cnmcp-doctor-config");
      if (pasted) {
        sessionStorage.removeItem("cnmcp-doctor-config");
        setRaw(pasted);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function run() {
    const computed = runDoctor(raw, catalog);
    setReport(computed);
    setStatus("完成 · 全部在本地完成");
  }

  const jsonState = (() => {
    if (!raw.trim()) return { text: "等待输入", ok: false };
    try {
      JSON.parse(raw);
      return { text: "JSON 格式有效", ok: true };
    } catch {
      return { text: "JSON 格式有误", ok: false };
    }
  })();

  async function copyFixed() {
    if (!report?.redactedConfig) return;
    await navigator.clipboard.writeText(report.redactedConfig);
    toast("已复制修复后的配置");
  }

  return (
    <div className="doc">
      <div className="ed">
        <div className="ed-h">
          <span className="dot d-info" />
          <span className="fn">mcp.json</span>
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: jsonState.ok ? "var(--ok)" : "var(--tx-3)" }}>{jsonState.text} · 本地解析</span>
        </div>
        <textarea value={raw} onChange={(event) => setRaw(event.target.value)} spellCheck={false} aria-label="mcp.json 配置" />
        <div className="ed-f">
          <button type="button" className="btn btn-p btn-sm" onClick={run} disabled={!raw.trim()}>
            开始体检
          </button>
          <label className="btn btn-g btn-sm file-btn">
            读取 JSON 文件
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setRaw(await file.text());
                setReport(null);
                setStatus(`已读取 ${file.name}`);
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={() => {
              setRaw(DEMO_CONFIG);
              setReport(null);
              setStatus("");
            }}
          >
            填入示例
          </button>
          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={() => {
              setRaw("");
              setReport(null);
              setStatus("");
            }}
          >
            清空
          </button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--tx-3)", fontFamily: "var(--mono)" }}>{status}</span>
        </div>
        {indexError ? <p style={{ padding: "0 14px 12px", fontSize: 12, color: "var(--warn)" }}>{indexError}</p> : null}
      </div>
      <div>
        {!report ? (
          <div className="card" style={{ padding: "48px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>报告会显示在这里</div>
            <div style={{ fontSize: 13, color: "var(--tx-2)", maxWidth: 340, margin: "0 auto" }}>
              粘贴配置后点「开始体检」。整个过程在你的浏览器里完成，密钥不会离开这台机器。
            </div>
          </div>
        ) : null}
        {report?.parseError ? (
          <div className="card" style={{ padding: 24, borderColor: "color-mix(in srgb, var(--bad) 40%, transparent)", background: "var(--bad-bg)", color: "var(--bad)" }}>
            {report.parseError}
          </div>
        ) : null}
        {report && !report.parseError ? (
          <>
            <div className="kpis">
              <div className="kpi">
                <div className="n">{report.serverCount}</div>
                <div className="k">个服务配置</div>
              </div>
              <div className="kpi">
                <div className="n" style={{ color: "var(--bad)" }}>
                  {report.high}
                </div>
                <div className="k">高危</div>
              </div>
              <div className="kpi">
                <div className="n" style={{ color: "var(--warn)" }}>
                  {report.warn}
                </div>
                <div className="k">需关注</div>
              </div>
              <div className="kpi">
                <div className="n">{report.rulesApplied}</div>
                <div className="k">项本地规则</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>发现 {report.rows.reduce((sum, row) => sum + row.issues.length, 0)} 个问题</span>
              {report.high ? <span className="chip">{report.high} 高危建议立即处理</span> : null}
              {report.redactedConfig ? (
                <button type="button" className="btn btn-s btn-sm" style={{ marginLeft: "auto" }} onClick={copyFixed}>
                  复制修复后的配置
                </button>
              ) : null}
            </div>
            {report.rows.map((row) => (
              <div key={row.key} className={`wrow ${row.level === "high" ? "bad" : row.level === "warn" ? "warn" : "info"}`}>
                <div className="wrow-h">
                  <span className={`dot ${row.level === "high" ? "d-bad" : row.level === "warn" ? "d-warn" : "d-na"}`} />
                  <span className="nm">{row.key}</span>
                  {row.matched ? <span className="chip">{row.matched.title}</span> : <span className="chip">未收录</span>}
                  <span className={`pill ${row.level === "high" ? "p-bad" : row.level === "warn" ? "p-warn" : "p-gray"}`}>{row.issues.length} 个问题</span>
                </div>
                <ul>
                  {row.issues.length ? row.issues.map((issue) => (
                    <li key={issue.text}>
                      <span style={{ color: issue.level === "high" ? "var(--bad)" : issue.level === "warn" ? "var(--warn)" : "var(--tx-3)", fontFamily: "var(--mono)", width: 12, flex: "none" }}>
                        {issue.level === "high" ? "✕" : issue.level === "warn" ? "!" : "·"}
                      </span>
                      <span>
                        <b>{issue.text}</b>
                        {issue.recommendation ? <small>{issue.recommendation}</small> : null}
                      </span>
                    </li>
                  )) : <li><span style={{ color: "var(--ok)" }}>✓</span><span><b>未发现当前规则覆盖的风险</b><small>这不代表服务绝对安全，仍需核对来源与权限。</small></span></li>}
                </ul>
              </div>
            ))}
            {report.redactedConfig ? (
              <>
                <pre className="code" style={{ marginTop: 14 }}>
                  {report.redactedConfig}
                </pre>
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button type="button" className="btn btn-s btn-sm" onClick={copyFixed}>
                    复制修复后的配置
                  </button>
                  <a className="btn btn-g btn-sm" href="/submit">
                    提交未收录项给我们验证
                  </a>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
