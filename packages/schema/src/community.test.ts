import { describe, expect, it } from "vitest";

import { inferTaxonomy, projectSlugFromRepoKey, publicSecurityStatus } from "./community";

const categories = [
  { slug: "视频创作", name: "视频创作", keywords: ["字幕", "视频"] },
  { slug: "程序开发", name: "程序开发", keywords: ["编译器", "代码审查"] },
];

const types = [
  { slug: "software", name: "软件", keywords: ["插件", "命令行"] },
  { slug: "mcp", name: "mcp", keywords: ["mcp", "model context protocol"] },
  { slug: "tutorial", name: "教程", keywords: ["教程"] },
];

describe("community taxonomy and security status", () => {
  it("does not treat pending or scan_failed as risk", () => {
    expect(publicSecurityStatus("pending", "skipped")).toBe("pending");
    expect(publicSecurityStatus("scan_failed", "skipped")).toBe("scan_failed");
    expect(publicSecurityStatus("clear", "pending")).toBe("pending");
    expect(publicSecurityStatus("clear", "skipped")).toBe("clear");
    expect(publicSecurityStatus("warn", "clear")).toBe("warn");
    expect(publicSecurityStatus("clear", "risk")).toBe("risk");
    expect(publicSecurityStatus("risk", "pending")).toBe("risk");
    expect(publicSecurityStatus(null, null)).toBe("pending");
  });

  it("picks a business category and a project type from keywords", () => {
    expect(inferTaxonomy("字幕生成 mcp 服务", categories, types)).toEqual({
      categorySlug: "视频创作",
      typeSlug: "mcp",
    });
    expect(inferTaxonomy("一份教程", categories, types)).toEqual({
      categorySlug: null,
      typeSlug: "tutorial",
    });
    expect(inferTaxonomy("普通仓库", categories, types)).toEqual({
      categorySlug: null,
      typeSlug: null,
    });
  });

  it("builds a stable slug from owner/name", () => {
    expect(projectSlugFromRepoKey("Acme/Subtitle_MCP")).toBe("acme-subtitle-mcp");
  });
});
