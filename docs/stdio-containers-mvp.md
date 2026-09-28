# Cloudflare Containers stdio 探测 MVP

## 目标与边界

MVP 在一次性 Cloudflare Container 中启动公开、无需凭证的 `npx`、`uvx` 和受限 `uv` MCP，且只发送 `initialize`、`notifications/initialized` 与 `tools/list`。它不是漏洞扫描，不执行业务工具，也不能代表用户电脑上的真实运行环境。

自动探测默认关闭。上线迁移和容器部署完成后，必须先手动灰度，再将 `STDIO_PROBE_ENABLED` 改为 `true`。

## 当前生产状态

2026-09-28 已完成生产迁移、Queue/DLQ 创建、API Worker 与 Container 发布，以及首批 5 项手动灰度。结果为 3 项验证成功、1 项 npm 包不存在、1 项上游 Python 包启动失败；5 项均在时限内进入明确终态，成功证据已写入 R2。自动调度继续保持 `STDIO_PROBE_ENABLED=false`，等待 10 项与 50 项灰度完成后再评估开启。

## 数据流

1. Cron 或内部接口从 D1 选择到期的本地 MCP。
2. `cnmcp-stdio-probe` Queue 以单条消息触发一个任务。
3. Worker 校验配置并从 npm 或 PyPI 解析精确版本。
4. 每个任务使用新的 `StdioProbeContainer` 实例；容器仅能访问 npm、PyPI 的包下载域名。
5. runner 完成 stdio 握手后强制结束进程树，Container class 随即销毁实例。
6. 运行摘要写入 `stdio_probe_runs`，证据写入 R2；只有成功握手才进入现有动态评分。

## 安全控制

- 不接受 Shell 字符串，容器进程使用参数数组启动。
- 拒绝环境变量、本地路径、未解析占位符以及 `npx -c/--call`。
- Container 默认关闭互联网，只允许 `registry.npmjs.org`、`pypi.org`、`files.pythonhosted.org`。
- 镜像基础层固定到摘要，运行依赖解析成精确版本。
- 单任务最长 180 秒，最多 1 MiB 协议输出、8 KiB stderr、500 个工具。
- `basic` 实例最多同时运行 2 个队列任务，容器配置上限为 4 个实例。
- 设施、安装和凭证错误只记录运行状态，不降低 MCP 的动态评分。

## 部署顺序

1. 在生产 D1 应用 `0006_stdio_probe_runs.sql`。
2. 部署 API Worker 和 Container 镜像，保持 `STDIO_PROBE_ENABLED=false`。
3. 确认 `cnmcp-stdio-probe` 和 `cnmcp-stdio-probe-dlq` 队列可见。
4. 调用内部接口灰度单个项目：

   ```http
   POST /internal/stdio-probes
   Authorization: Bearer <INTERNAL_API_TOKEN>
   Content-Type: application/json

   {"serverId":"cloud.tencent.com/10005"}
   ```

5. 检查 D1 `stdio_probe_runs`、R2 证据、Container 日志和详情页状态。
6. 依次灰度 10、50、全部安全候选项目。
7. 成功率和费用稳定后，将 `STDIO_PROBE_ENABLED` 设为 `true`。

## 验收指标

- 任务终态率至少 95%，终态包括成功及明确分类的失败。
- P95 完成时间小于 90 秒。
- 没有超过 180 秒仍运行的实例。
- 没有业务 `tools/call` 请求。
- 月度总成本目标不超过 10 美元，告警阈值 8 美元。

## 回滚

1. 将 `STDIO_PROBE_ENABLED` 设为 `false`，停止新增自动任务。
2. 暂停 `cnmcp-stdio-probe` Queue consumer。
3. 回滚 Worker 版本时保留 `stdio_probe_runs` 表；历史证据无需删除。
4. 如镜像存在问题，先部署修复镜像，再手动重试 DLQ 项目。不要把设施错误改写为 MCP 失效。
