# CNMCP AI 相关开源社区重构设计

状态：已对齐。本文只记录产品与架构决策。
范围：不改应用代码、数据库迁移、`package.json` 或配置；下文的实施顺序留到后续变更。

品牌与域名保持 **CNMCP / cnmcp.com**。产品从「中文 MCP 目录 + 机器验证」扩展为面向 **AI 相关开源** 的中文社区。MCP 仍是项目类型之一，不再是整站的全部对象。

## 1. 背景与目标

### 现状

CNMCP 现在是中文 MCP 资源目录和机器验证平台，不是 UGC 社区。目录按业务场景收录 MCP；静态检查看公开来源、工具声明和仓库状态；具备条件时做 MCP `initialize` 与 `tools/list`，stdio 在隔离容器里探测，并保留变更记录。配置体检在浏览器本地完成，不上传配置。

代码在现有 monorepo：

- `apps/web`：Next.js 站点，经 OpenNext 跑在 Cloudflare Workers 上
- `apps/api`：Cloudflare Worker，公开 API、提交、队列、D1、Cron；证据对象可放 R2
- `packages/schema`、`packages/checkers`、`packages/doctor`：共享结构、静态/动态检查、浏览器端体检

运营内容走私有 CMS `cnmcp-server`。它服务运营，不是社区主流量路径。

现有 D1 以 `servers` 为中心（并含 `vendors`、`pricing`、`endpoints`、`verifications`、`tools`、`score_snapshots`、`change_events`、`submissions`、`ingest_state`、`server_sources`、`declared_tools`、`server_configs`、`server_readmes`、`static_checks`、`github_repository_state`、`stdio_probe_runs`、`resource_identities`）。这套表描述的是 MCP 服务，不是可评分、可投稿的开源项目。

### 目标

做成接近 HelloGitHub 的中文社区，范围只放在 AI 相关开源：skills、agents、MCP、plugins、skill/MCP 管理工具等。第一阶段做到三件事：

- 发现：按时间、粗热度、类型/标签、安全状态找到项目
- 评价：星级（可带短评）和体验文
- 提交：粘贴 GitHub 地址后自动入库并出现在列表里

第一阶段按**数百个项目、较低 DAU** 设计，用来验证有没有人愿意发现、提交和评价。不为万级目录或完整社交预留复杂结构。

现有 MCP 行**不迁移**。领域模型按社区重做，整体重构可以接受。技术栈不换：仍是这个 monorepo 里的 Next.js 与 Cloudflare Workers / D1 / Queues。`cnmcp-server` 继续承担运营内容，以及下架、改标签一类运营动作。

## 2. 决策记录

| 决策 | 备选 | 原因 |
| --- | --- | --- |
| 做 AI 相关开源社区，而不是泛开源社区 | 直接克隆一个通用 HelloGitHub | 用户要找的是 skill、agent、MCP、plugin、管理工具等，不是所有开源项目 |
| 保留 CNMCP / cnmcp.com | 新品牌、新域名 | 扩展名字的含义，已有域名继续用 |
| 路线 A：在现有 monorepo 里重做领域模型 | B：新社区应用 + 旧验证服务并存；C：先用静态页做运营 | 一套栈；安全检查和社区放在一起；旧数据可以不要 |
| 不迁移旧 `servers` 数据 | 把现有目录迁进新模型 | 用户明确选择放弃旧数据 |
| 安全：所有项目都做线索收集和静态扫描；动态检查第一阶段优先给 MCP | 所有类型都做完整动态检查；或有风险就不允许上架 | 先上架。`pending` 是还没查完，不是有风险 |
| 提交：自动拉取 GitHub 后上架，有问题再下架 | 先人工审核再上架 | 冷启动要快 |
| 登录只做 GitHub OAuth | 微信登录，或允许匿名写入 | 对象是开源项目，GitHub 身份足够 |
| 第一阶段：发现 + 评分/体验评论 + 提交；收藏以后再做 | 一次做完关注、点赞、收藏等社交 | 先验证产品是否有人用 |
| 容量按数百个项目 | 按 1 万级目录设计 | 用不上的规模不做（YAGNI） |
| 继续 Next.js + Cloudflare；CMS 仍是 `cnmcp-server` | 换一套技术栈 | 复用现有部署、队列和检查器 |

## 3. 非目标（第一阶段）

第一阶段不做：

- 收藏、点赞、关注
- 微信登录，以及匿名发评分、体验文或提交
- 月报 / 月刊
- 个性化或复杂推荐（首页「热」只用粗排）
- 迁移旧 `servers` 及相关表的数据
- 新品牌或新域名

浏览器端配置体检（`packages/doctor`）留在仓库里，但不进入社区入库主路径，也不作为第一阶段交付。

## 4. 信息架构

公开站点以项目为对象。运营文章、公告仍可以由 `cnmcp-server` 提供，发现、详情、搜索、提交和评价不依赖 CMS 才可用。

| 路径 | 作用 |
| --- | --- |
| `/` | 信息流。可切换最新、热、安全状态（`pending` / `clear` / `warn` / `risk` / `scan_failed`）。只出 `listed` 项目 |
| `/projects` | 项目列表，可按类型和标签收窄 |
| `/projects/[slug]` | 详情：元数据、安全摘要、评分、体验文。类型为 MCP 时多一块工具列表和探测结果 |
| `/submit` | 已登录用户提交 GitHub URL，自动入库后即为 `listed` |
| `/search` | 关键词搜索，并按类型/标签过滤：skill、agent、mcp、plugin、tool 等 |
| `/login` | 仅 GitHub OAuth |
| `/me` | 最小个人页：我提交的项目、我打过的分。不做社交主页 |

详情上的安全摘要始终可见，证据默认折叠、可展开。`pending`（还在检查）和 `scan_failed`（没跑成）都要写成未完成，不能用风险样式。`taken_down` 不进信息流和列表；直接打开旧链接时说明已下架。

热度由 Cron 做粗排（例如近期评分数和星级），不按人推荐。

写入（提交、评分、体验文）都要 GitHub 登录。只读页面不要求登录。

## 5. 领域模型

新表服务社区，不从旧表导数据。实现时用**新的迁移**建空 schema。现有库已经有 `submissions` 等表，不要在同一条迁移链上混用两套模型：使用新的 D1 数据库，或在明确废弃旧库之后从空库开始。旧库可留作备份，产品不读它。

### `projects`

一个 GitHub 仓库对应一个项目。

- `slug`：站内稳定标识
- `repo`：规范化的 GitHub 仓库（owner/name 与 URL），用作去重键
- `type`：`skill`、`agent`、`mcp`、`plugin`、`tool` 等；暂时判不准时可以先空着或标成未分类，仍然保持上架
- `tags`
- `summary`：来自仓库元数据的短介绍
- `status`：`listed` 或 `taken_down`

项目状态只表示是否公开。安全结论不写进这个字段。

### `users`

- GitHub 用户 id、login、avatar
- 不存微信身份，也不建匿名写用户

### `ratings`

- 一个用户对一个项目最多一条
- 星级，外加可选短评

### `reviews`

体验文，不是星级的重复。

- 标题、正文、所属项目、作者
- 第一阶段不做楼中楼，也不做关注流

### `submissions`

每次提交一条记录，并留下入库状态（已接收、重复、元数据已拉取、失败可重试、完成）。重复的 GitHub 仓库不新建第二个 `projects`，只把这次提交记为重复。

### `security_scans`

每个项目在入库时就有安全记录。重扫追加新记录，对外只展示最新一条，旧记录留下供复核。

- `clues`：线索收集结果
- 静态摘要：`pending`、`clear`、`warn`、`risk` 或 `scan_failed`，并带证据
- 动态摘要：MCP 可有探测结论；其他类型第一阶段为跳过或轻量结果

列表和详情上的安全状态读最新扫描，不读 `projects.status`。

### `mcp_*`（仅 `type = mcp`）

可选扩展，例如工具列表、探测记录。承接现在的握手、`tools/list` 和容器探测。非 MCP 项目不建这些表的行。

旧表（包括现有 `submissions`）不改造成上面的新模型，也不做数据回填。

## 6. 安全入库流水线

原则：**安全展示不挡住上架。`pending` 不是 `risk`，`scan_failed` 也不是 `risk`。**

1. 已登录用户提交 GitHub URL。按规范化仓库去重，写入 `submissions`。新仓库立即创建 `projects`（`listed`，安全状态 `pending`）。
2. 队列拉取仓库元数据，推断 `type` 和 `tags`，补上 `summary`。拉取失败仍保持 `listed`，摘要可暂时用仓库名，提交记为可重试；不因没有 README 而下架。
3. 收集线索，写入 `security_scans.clues`。
4. 静态扫描必做，结论为 `clear`、`warn` 或 `risk`，并保存证据。扫描本身失败时项目仍然 `listed`，状态为 `scan_failed`。
5. 动态检查：MCP 复用协议握手、工具列表和容器探测。其他类型第一阶段跳过，或只做很轻的检查。
6. 详情把安全摘要放在显眼位置，证据可展开。运营可通过 `cnmcp-server` 将项目标为 `taken_down`（也可改标签）。
7. Cron 定期重扫、重试失败的拉取和扫描。MCP 的变更观察（工具清单、仓库状态）保留在 MCP 类型上。

`risk` 默认仍然留在列表里，用摘要告诉读者，而不是自动下架。下架是运营动作。

## 7. 架构切分

```text
apps/web     发现、详情、提交、登录、评分与体验文。OpenNext → Cloudflare Workers
apps/api     公开读 API、GitHub OAuth 会话、接收提交并入队、读写 D1
Queues       ingest → security-static → 可选 security-dynamic / 现有 MCP 探测
packages     schema 描述新模型；静态规则走 checkers；MCP 检查器只挂在动态路径
cnmcp-server 运营内容，以及下架、改标签。不承载社区主流量
Cron         重扫、粗热度、失败重试
```

会话在 API。Web 负责跳转 GitHub 和展示登录态。

队列按阶段拆开，避免一次消息里串完拉取、静态和动态。MCP 动态阶段调用现有检查能力（远程握手与 `tools/list`，stdio 仍走隔离容器），不把动态检查推广成所有类型的门槛。

证据摘要进 D1。体积大的原始证据可以继续放 R2。不迁移旧的证据对象。

`packages/doctor` 保持本地体检，不进这条队列。

## 8. 实施顺序

下面是后续实现顺序。**本设计不实现其中任何一步。**

1. D1 新 schema（新库或空库上的新迁移）
2. GitHub 入库（去重、建 `projects`、拉元数据、推断类型和标签）
3. 静态安全（线索 + 静态扫描 + `scan_failed`）
4. 列表、详情、搜索
5. GitHub OAuth，以及评分和体验文
6. `/submit` 页面
7. 把 MCP 动态探测接到 `type = mcp`
8. 文案、空状态、下架展示等收尾

第 2 步可以用内部入口或 API 灌入项目；第 6 步再对登录用户开放提交页。这样列表不需要等提交页才能验。

## 9. 假设

- 继续当前 monorepo 布局：`apps/web`、`apps/api`、`packages/*`，不新建平行应用。
- 第一阶段只验证小规模下的产品是否成立，容量和交互都按数百项目、低 DAU 收口。
- MCP 验证变成 MCP 类型上的增强，不再定义整站。
- 项目来源是公开 GitHub 仓库；提交只收 GitHub URL。
- 界面文案用简体中文。协议字段、仓库名和检查器原有英文标识可以保留。
- `cnmcp-server` 仍是独立的私有 CMS，不并进这个 monorepo，也不做社区读流量的必经之路。
