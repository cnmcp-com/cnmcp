# CNMCP

中文 MCP 生态的可信评测与准入层。对公开 remote MCP 端点做 `initialize` + `tools/list` 握手，给出可复算的 Trust Score。

生产域名计划：站点 `https://www.cnmcp.com`，API `https://api.cnmcp.com`。

本仓库是公开 monorepo：

- `apps/web` Next.js 目录 / 实测卡 / 配置体检 / 方法论
- `apps/api` Cloudflare Worker：Registry 入库、验证队列、只读 API、徽章
- `packages/checkers` MIT，可对一份证据 JSON 复算分数
- `packages/doctor` MIT，浏览器内解析 `mcp.json`，密钥不上传
- `packages/schema` 共享类型

**不进本仓库：** `ops/probes/`、管理端、探测节点 IP、Turnstile 密钥。`.gitignore` 已排除 `ops/` 与 `admin/`。

## 本站探测，不是四城

M1 的「可达」是 Cloudflare Worker 出口的本站探测，**不是**北京/上海/广州/成都四城，也不是「中国大陆连通率」。页面和报告都用「本站探测可达」。

## 本地开发

需要 Node 22+。

```sh
cp .env.example .env
npm install
npx wrangler d1 migrations apply cnmcp --local --config apps/api/wrangler.jsonc
npm run dev:api
npm run dev:web
```

- 站点 http://localhost:3000
- API http://127.0.0.1:8787

手动拉两页 Registry 并验证：

```sh
curl -X POST http://127.0.0.1:8787/internal/ingest?pages=2
```

复算公开 fixture：

```sh
npm test -w @cnmcp/checkers
```

配置体检只在浏览器内存解析。密钥检测不依赖网络；对照目录会请求 `/data/servers-index.json`（公开目录，不含用户配置）。

## 部署

见 `apps/api/wrangler.jsonc` 与 `apps/web/wrangler.jsonc`。创建 D1 `cnmcp`、Queue `cnmcp-verify`、R2 `cnmcp-evidence` 后：

```sh
npm run deploy -w @cnmcp/api
npm run build -w @cnmcp/web && npx wrangler deploy --config apps/web/wrangler.jsonc
```

将 `www.cnmcp.com` 与 `api.cnmcp.com` **同时**切流。`api.cnmcp.com` 当前是旧统计 API，不能单独覆盖。

首次部署走 `*.workers.dev` 验证：

```sh
npx wrangler d1 create cnmcp --config apps/api/wrangler.jsonc
npx wrangler queues create cnmcp-verify
npx wrangler r2 bucket create cnmcp-evidence
# 把返回的 database_id 填进 apps/api/wrangler.jsonc
npx wrangler d1 migrations apply cnmcp --remote --config apps/api/wrangler.jsonc
npm run deploy -w @cnmcp/api
```

自定义域在 `apps/api/wrangler.jsonc` 加回：

```
"routes": [{ "pattern": "api.cnmcp.com/*", "zone_name": "cnmcp.com" }]
```

站点 `www.cnmcp.com` 在 Next.js 能以 Workers/OpenNext 发布后再切。切流前旧仓已冻结，见 `cnmcp-index` README。
