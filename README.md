# CNMCP

[CNMCP](https://www.cnmcp.com) 是面向中文用户的 AI 开源社区。项目按业务领域和类型（skill、agent、教程、软件、MCP）浏览，提交 GitHub 仓库后自动上架，并展示安全检查摘要。设计说明见 [`_docs/cnmcp-ai-community-redesign.md`](_docs/cnmcp-ai-community-redesign.md)。

- 网站：<https://www.cnmcp.com>
- 开源仓库：<https://github.com/cnmcp-com/cnmcp>
- 许可证：站点与 API 使用 Apache-2.0；可复用检查器使用 MIT

## 核心能力

- **发现与搜索**：按最新或热度浏览，并用一级业务领域、二级项目类型、安全状态筛选。
- **提交**：登录后粘贴 GitHub 地址，可写推荐语。新仓库立即上架。
- **互动**：评分、评论/体验、点赞、收藏夹和个人页。
- **安全检查**：所有项目做线索收集和静态扫描。动态 MCP 握手只在类型为 `mcp` 时进行。`pending` 和 `scan_failed` 都表示检查未完成，不是风险。
- **本地配置体检**：`/doctor` 仍在浏览器本地检查 mcp.json，不进入社区入库。

## 信息如何解读

列表里的安全状态来自最新一次扫描，不来自项目是否上架：

- **检查未完成**：还在检查，或这次没跑成。这不是风险。
- **未发现明显风险 / 需要留意 / 存在风险线索**：静态扫描结论。MCP 的动态结果会一并算进去。
- **已下架**：运营动作。下架项目不进信息流；直接打开地址会看到说明。

分类名单存在数据库里，空的一级分类不出现在默认筛选中。

## 项目结构

```text
apps/web              Next.js 网站：发现、搜索、详情、提交、登录和个人页
apps/api              Cloudflare Worker：公开 API、GitHub 入库、静态扫描、队列和 D1
packages/checkers     静态规则；MCP 动态检查只挂在类型 mcp 上
packages/doctor       浏览器端配置体检，不进社区入库
packages/schema       项目、两级分类和安全状态
scripts               数据整理与维护脚本
```

生产环境使用 Cloudflare Workers、D1、Queues 和 R2。D1 保存项目、分类、互动和扫描摘要，R2 可存放 README 原文，Queues 与 Cron 负责入库、静态扫描、MCP 动态检查和热度。

## 本地开发

要求 Node.js 22 或更高版本。

```bash
cp .env.example .env
npm install
npx wrangler d1 migrations apply cnmcp --local --config apps/api/wrangler.jsonc
npm run dev
```

本地地址：

- 网站：<http://localhost:3000>
- API：<http://127.0.0.1:8787>

运行完整检查：

```bash
npm test
npm run typecheck
npm run build
```

## Cloudflare 部署

生产环境由 GitHub Actions 发布：推送到 `main` 后先执行测试和构建，再应用 D1 增量迁移并依次发布 API 与网站。网站通过 OpenNext 运行于 Cloudflare Workers，不使用静态 Pages 输出。

首次上线需要配置 Cloudflare API Token、GitHub `production` 环境以及 Worker Secrets。完整步骤、最小权限建议和恢复流程见 [生产发布配置](docs/deployment.md)。

## 数据与安全边界

- 提交只接受公开 GitHub 仓库。推荐语不会覆盖仓库简介。
- 所有项目做线索收集和静态扫描。动态协议握手只在类型为 `mcp` 且发现公开 HTTPS 端点时进行，不调用业务工具。
- `stdio` 隔离容器仍保留在仓库里，这一轮还没有接到新的项目模型上。
- 检查未完成或失败不会自动下架，也不会显示成风险。
- 外部 README 和工具描述都当不可信文本，不作为系统指令执行。密钥原文不写入扫描证据。
- 不接受付费收录或隐藏风险线索。
- 写入操作需要 GitHub 登录。内部灌入走已有的 `INTERNAL_API_TOKEN`。

## 参与贡献

欢迎通过 [GitHub Issues](https://github.com/cnmcp-com/cnmcp/issues) 提交数据纠错、规则建议和缺陷报告。涉及验证逻辑的改动应同时提供测试，并说明证据来源及兼容性影响。

提交代码前请运行：

```bash
npm test
npm run typecheck
```
