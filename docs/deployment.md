# CNMCP 生产发布配置

CNMCP 使用 GitHub Actions 发布两个 Cloudflare Workers：

- `cnmcp-api`：Hono API、Cron、Queue、Workflow，并绑定 D1 与 R2。
- `cnmcp-web`：通过 OpenNext 将 Next.js 15 应用发布到 Workers。

推送到 `main` 后，工作流会先测试和构建 API，应用 D1 增量迁移并发布 API；API 健康检查通过后，再构建和发布网站。也可以在 GitHub Actions 页面手动运行 `Deploy`。

## Cloudflare 配置

1. 确认域名 `cnmcp.com` 已接入当前 Cloudflare 账户。首次发布会按 Wrangler 配置创建 `api.cnmcp.com` 与 `www.cnmcp.com` Custom Domain、DNS 记录和证书。当前 `www.cnmcp.com` 仍在提供旧站内容，切换前需要从旧 Pages 项目解绑该域名；若主机名还有 CNAME 或同名 Worker 路由，也要先删除冲突项。
2. 保留已创建的 D1 数据库 `cnmcp`（ID `a648e64c-8857-4efe-90bb-20d4eb715698`）。不要新建同名空库。
3. 确认 R2 bucket `cnmcp-evidence`、Queue `cnmcp-verify` 已存在。Wrangler 会部署 Worker 和 Workflow，但不会替你迁移已有对象数据。
4. 在 `cnmcp-api` Worker 中配置两个 Secret：
   - `INTERNAL_API_TOKEN`：至少 32 字节的随机值；所有 `/internal/*` 请求使用 `Authorization: Bearer <token>`。
   - `GITHUB_TOKEN`：建议使用只读 GitHub fine-grained token，仅需读取公开仓库元数据，用于提高定期变更扫描的 API 限额。
5. 创建一个用于 GitHub Actions 的 Cloudflare API Token，并只授权当前账户/zone。至少需要 Workers Scripts、Workers Routes、D1、Queues、R2 的编辑权限，以及账户和 zone 的读取权限。

本地设置 Worker Secret：

```bash
cd apps/api
npx wrangler secret put INTERNAL_API_TOKEN
npx wrangler secret put GITHUB_TOKEN
```

## GitHub 配置

1. 在仓库 `cnmcp-com/cnmcp` 的 Settings → Environments 创建 `production` 环境。
2. 在 `production` 的 Environment secrets 中添加：
   - `CLOUDFLARE_ACCOUNT_ID`：`4861c298421ed03b14c02c703bdf1c88`
   - `CLOUDFLARE_API_TOKEN`：上一步创建的最小权限 Cloudflare Token
3. 将 `production` 的 deployment branches 限制为 `main`。需要人工确认发布时，可再配置 required reviewers。
4. Settings → Actions → General 中保持 Actions 可运行，并把默认 `GITHUB_TOKEN` 权限定为 Read repository contents；当前工作流只申请 `contents: read`。
5. 为 `main` 添加分支保护，要求 `CI / test` 通过后才能合并。

`INTERNAL_API_TOKEN` 与运行时 `GITHUB_TOKEN` 应保存在 Cloudflare Worker Secrets，不需要复制到 GitHub Actions。

## 发布顺序与恢复

1. `CI` 对提交执行测试、类型检查和两个 Worker 的生产构建。
2. `Deploy / api` 应用未执行的 D1 迁移；D1 会在迁移前自动创建备份，单个失败迁移会回滚。
3. API 发布并通过 `https://api.cnmcp.com/health` 检查。
4. 网站发布并通过 `https://www.cnmcp.com` 检查。

若网站发布失败，API 与已经成功的 D1 迁移不会回滚。修复后重新运行 `Deploy` 即可；迁移命令只应用尚未执行的文件。
