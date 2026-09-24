import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { categoryMap, isCnOfficial, mapToCnmcpCategories, reliabilityOf } from "./categories.mjs";

describe("cnmcp category map", () => {
  it("covers CNMCP chips and plaza categories except 腾讯产品MCP", () => {
    const names = categoryMap.cnmcpCategories.map((item) => item.name);
    for (const name of ["开发工具", "搜索检索", "数据库", "地图出行", "企业协作", "金融加密", "数据查询"]) {
      assert.ok(names.includes(name), `missing ${name}`);
    }
    const plaza100 = categoryMap.plazaMapping.find((item) => item.plazaId === 100);
    assert.deepEqual(plaza100?.cnmcpIds, []);
  });

  it("maps plaza 开发者工具 to 开发工具 and drops 腾讯产品MCP", () => {
    const cats = mapToCnmcpCategories(
      [
        { categoryId: 100, name: "腾讯产品MCP" },
        { categoryId: 101, name: "开发者工具" },
      ],
      { title: "腾讯云 CVM" },
    );
    assert.deepEqual(cats, [{ id: "devops", name: "开发工具" }]);
  });

  it("overlays CNMCP-native tags onto 腾讯产品 that already have plaza siblings", () => {
    assert.deepEqual(
      mapToCnmcpCategories(
        [
          { categoryId: 100, name: "腾讯产品MCP" },
          { categoryId: 101, name: "开发者工具" },
        ],
        { title: "腾讯云TAPD MCP Server", plazaOfficial: true },
      ),
      [
        { id: "devops", name: "开发工具" },
        { id: "collab", name: "企业协作" },
      ],
    );
    assert.deepEqual(
      mapToCnmcpCategories(
        [
          { categoryId: 100, name: "腾讯产品MCP" },
          { categoryId: 106, name: "搜索与信息检索" },
        ],
        { title: "企查查-企业信息 MCP" },
      ),
      [
        { id: "search", name: "搜索检索" },
        { id: "query", name: "数据查询" },
      ],
    );
  });

  it("scatters leftover 腾讯产品 into sibling CNMCP categories", () => {
    assert.deepEqual(mapToCnmcpCategories([{ categoryId: 100, name: "腾讯产品MCP" }], { title: "云服务器 CVM" }), [
      { id: "devops", name: "开发工具" },
    ]);
    assert.deepEqual(mapToCnmcpCategories([{ categoryId: 100, name: "腾讯产品MCP" }], { title: "腾讯文档" }), [
      { id: "docs", name: "文档工具" },
    ]);
    assert.deepEqual(mapToCnmcpCategories([{ categoryId: 100, name: "腾讯产品MCP" }], { title: "腾讯会议" }), [
      { id: "collab", name: "企业协作" },
    ]);
    assert.deepEqual(mapToCnmcpCategories([{ categoryId: 100, name: "腾讯产品MCP" }], { title: "腾讯位置服务" }), [
      { id: "maps", name: "地图出行" },
    ]);
    assert.deepEqual(mapToCnmcpCategories([{ categoryId: 100, name: "腾讯产品MCP" }], { title: "企查查" }), [
      { id: "query", name: "数据查询" },
    ]);
  });
});

describe("reliability", () => {
  it("drops hosted even when GitHub exists", () => {
    assert.deepEqual(
      reliabilityOf({
        isHosted: true,
        repoUrl: "https://github.com/TCATools/tca-mcp-server",
        srcAuthor: "腾讯云",
        title: "TCA",
        plazaOfficial: true,
      }),
      { ok: false, reason: "hosted" },
    );
  });

  it("keeps public GitHub and CN-official without GitHub", () => {
    assert.equal(
      reliabilityOf({
        isHosted: false,
        repoUrl: "https://github.com/modelcontextprotocol/servers",
        srcAuthor: "modelcontextprotocol",
        title: "Fetch",
      }).ok,
      true,
    );
    assert.deepEqual(
      reliabilityOf({
        isHosted: false,
        repoUrl: null,
        srcAuthor: "腾讯文档",
        title: "腾讯文档",
        plazaOfficial: true,
      }),
      { ok: true, reason: "cn-official" },
    );
    assert.equal(isCnOfficial({ srcAuthor: "高德地图", title: "Maps" }), true);
  });

  it("drops community items without GitHub", () => {
    assert.deepEqual(
      reliabilityOf({
        isHosted: false,
        repoUrl: null,
        srcAuthor: "random-dev",
        title: "Cool MCP",
        plazaOfficial: false,
      }),
      { ok: false, reason: "unverified-source" },
    );
  });
});
