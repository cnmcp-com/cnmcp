import assert from "node:assert/strict";
import test from "node:test";

import {
  detailTags,
  displayTitle,
  formatCompact,
  formatRelative,
  headerSummary,
  securityAxis,
  securityPanelTone,
} from "./project-present.ts";

test("static checks stay unlabeled when unfinished", () => {
  assert.equal(securityAxis("pending").tone, "muted");
  assert.equal(securityAxis("scan_failed").label, "检查未完成");
  assert.match(securityAxis("skipped").note, /不是风险结论/);
  assert.equal(securityAxis("clear").tone, "ok");
  assert.equal(securityPanelTone("clear"), "ok");
  assert.equal(securityPanelTone("pending"), "muted");
  assert.equal(securityPanelTone("risk"), "bad");
  assert.equal(JSON.stringify(securityAxis(null)).includes("动态"), false);
});

test("chinese recommendation leads the title and is not repeated as the summary", () => {
  const project = {
    title: "confcheck",
    recommendation: "一个轻量级、可嵌入的配置管理与合规检查工具",
    summary: "在持续集成里验证配置。",
  };
  assert.equal(displayTitle(project), project.recommendation);
  assert.equal(headerSummary(project), project.summary);
  assert.equal(headerSummary({ ...project, summary: project.recommendation }), null);
});

test("type and topic tags collapse duplicates and drop languages", () => {
  assert.deepEqual(
    detailTags({ type: { slug: "mcp", name: "mcp" }, tags: ["MCP", "framework", "agent", "Python"] }),
    ["mcp", "framework", "agent"],
  );
  assert.deepEqual(detailTags({ type: null, tags: null, language: "TypeScript" }), []);
  assert.deepEqual(detailTags({ tags_json: '["skill","typescript"]', language: "TypeScript" }), ["skill"]);
  assert.deepEqual(detailTags({}), []);
});

test("compact counts and relative time follow the discovery list", () => {
  assert.equal(formatCompact(896), "896");
  assert.equal(formatCompact(2800), "2.8k");
  assert.equal(formatCompact(12000), "1.2 万");
  const now = Date.parse("2026-10-27T00:00:00.000Z");
  assert.equal(formatRelative("2026-10-15T00:00:00.000Z", now), "12 天前");
  assert.equal(formatRelative(null, now), "未知");
});
