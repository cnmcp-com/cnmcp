import { describe, expect, it } from "vitest";

import { readmeToBlocks, sourceLabelOf } from "./present";

describe("source label", () => {
  it("uses the GitHub repo instead of the plaza namespace", () => {
    expect(
      sourceLabelOf({
        namespace: "cloud.tencent.com",
        srcUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
        author: "modelcontextprotocol",
      }),
    ).toBe("github.com/modelcontextprotocol/servers");
  });

  it("hides the plaza namespace when no source exists", () => {
    expect(sourceLabelOf({ namespace: "cloud.tencent.com", srcUrl: null, author: null })).toBeNull();
  });

  it("keeps a non-plaza namespace", () => {
    expect(sourceLabelOf({ namespace: "example.com", srcUrl: null, author: null })).toBe("example.com");
  });
});

describe("readme blocks", () => {
  it("keeps Chinese headings, lists and config from plaza HTML", () => {
    const blocks = readmeToBlocks(`<h1>析言 MCP 服务器</h1><p>一个支持自然语言查询数据库的服务器</p><h2>可用工具</h2><ul><li>\`get_data\` 查询数据</li></ul><pre><code>{
  "mcpServers": { "xiyan": { "command": "/xxx/python" } }
}</code></pre>`);
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "heading", "list", "code"]);
    expect(blocks[0]).toMatchObject({ type: "heading", text: "析言 MCP 服务器" });
    expect(blocks[3]).toMatchObject({ type: "list", items: ["get_data 查询数据"] });
    expect(blocks.find((block) => block.type === "code")?.text).toContain("mcpServers");
  });
});
