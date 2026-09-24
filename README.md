# CNMCP

[CNMCP](https://www.cnmcp.com) 是面向中文用户的 MCP 资源发现与验证目录，帮助用户从业务用途出发查找服务，并通过公开来源、工具能力和验证证据判断是否值得接入。

- 网站：<https://www.cnmcp.com>
- 开源仓库：<https://github.com/cnmcp-com/cnmcp>
- 许可证：站点与 API 使用 Apache-2.0；可复用检查器使用 MIT

## 核心能力

- **资源目录**：按软件开发、数据分析、研究检索、内容创作等业务场景组织 MCP 服务。
- **公开证据检查**：检查来源仓库、发布主体、工具声明、接入配置和维护时间，衡量资料的完整性与可追溯性。
- **动态验证**：对具备可验证条件的服务执行 MCP `initialize` 与 `tools/list`，记录协议版本、工具清单、可达性和延迟。
- **变更历史**：持续比较工具清单、运行结果和 GitHub 仓库状态，保留可复核的变更记录。
- **配置体检**：在浏览器本地检查 MCP 配置中的明文凭证、非加密连接、可变依赖和宽泛权限，配置内容不会上传。

## 信息如何解读

CNMCP 以公开证据为主要展示维度，动态验证作为辅助证据：

- **证据完整度**回答“公开资料是否充分、来源是否可追溯”。高分不代表服务一定可用或绝对安全。
- **动态验证状态**回答“本站探测节点能否完成标准 MCP 协议交互”。它不是漏洞扫描，也不代表所有地区或网络环境都可访问。
- **可信方发布**表示资源与已核对的可信组织或仓库规则相匹配，不构成 CNMCP 的安全背书。

评分方法和适用边界以站内“评分方法”页面及 `packages/checkers` 的公开实现为准。

## 项目结构

```text
apps/web              Next.js 网站：目录、资源详情、配置体检和数据报告
apps/api              Cloudflare Worker：采集、队列、验证、只读 API
packages/checkers     静态检查与动态评分逻辑
packages/doctor       浏览器端配置体检
packages/schema       共享数据结构、发布方规则和展示转换
scripts               数据整理与维护脚本
```

生产环境使用 Cloudflare Workers、D1、Queues、Workflows 和 R2。D1 保存目录与验证结果，R2 保存可复核证据，Queues 与 Cron Trigger 负责分批执行验证任务。

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

- 只对公开 Remote MCP 端点执行标准协议握手，不调用资源提供的业务工具。
- 本地 `stdio` 服务必须在受限的隔离环境中运行，不能由普通 Worker 直接执行。
- 所有外部内容均视为不可信数据；来源文本不会作为系统指令执行。
- 不接受付费收录、付费提分或隐藏负面验证结果。
- 资源作者可以提交更正、申诉或退出收录请求。

## 参与贡献

欢迎通过 [GitHub Issues](https://github.com/cnmcp-com/cnmcp/issues) 提交数据纠错、规则建议和缺陷报告。涉及验证逻辑的改动应同时提供测试，并说明证据来源及兼容性影响。

提交代码前请运行：

```bash
npm test
npm run typecheck
```
