import type { Metadata } from "next";
import Link from "next/link";

import { fetchActivity } from "@/lib/api";
import { formatDate } from "@/lib/ui";

export const metadata: Metadata = {
  title: "MCP 验证动态",
  description: "展示 CNMCP 数据库中最近的动态验证和工具变更事件。",
  alternates: { canonical: "/news" },
};

const DETAIL: Record<string, string> = {
  scored: "完成动态验证并生成评分",
  unverified_local: "本地运行资源未完成动态握手",
  unverifiable: "缺少可执行配置或当前无法验证",
  dead: "动态验证失败或端点失效",
  tool_added: "发现新增工具",
  tool_removed: "发现工具移除",
  description_changed: "服务描述发生变化",
  schema_changed: "工具 Schema 发生变化",
  repository_updated: "GitHub 代码仓库出现新的推送",
  repository_archived: "GitHub 代码仓库已归档",
  repository_restored: "GitHub 代码仓库恢复维护",
  default_branch_changed: "GitHub 代码仓库默认分支发生变化",
};

export default async function NewsPage() {
  const activity = await fetchActivity(50).catch(() => ({ items: [] }));
  const items = activity.items.filter((item) => item.detail !== "pricing_changed").slice(0, 40);
  return (
    <div className="wrap">
      <div className="page-hd">
        <h1>验证动态</h1>
        <p>直接来自本地数据库的最近验证和变更事件。每条记录都能回到对应资源与证据页面。</p>
      </div>
      {items.length ? (
        <div className="activity-list">
          {items.map((item, index) => (
            <Link className="activity-row" href={`/servers/${encodeURIComponent(item.serverId)}`} key={`${item.serverId}-${item.occurredAt}-${index}`}>
              <span className={`dot ${item.severity === "high" ? "d-bad" : item.severity === "warn" ? "d-warn" : "d-ok"}`} />
              <div className="activity-main">
                <div><b>{item.title}</b><span className="pill p-gray">{item.kind === "change" ? "变更" : "验证"}</span></div>
                <p>{DETAIL[item.detail] ?? item.detail}</p>
              </div>
              <div className="activity-meta">
                <b>{item.kind === "change" ? "变更记录" : item.score != null ? "已完成实测" : "待实测"}</b>
                <time>{formatDate(item.occurredAt)}</time>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">数据库中还没有可展示的验证或变更事件。</div>
      )}
    </div>
  );
}
