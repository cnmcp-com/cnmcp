# CNMCP 2.0 在 Cloudflare 上发布

生产包含两个 Worker。 `cnmcp-web` 负责 Next.js 页面和同源 API 转发，通过 `COMMUNITY` Service Binding 调用 `cnmcp-server-v2`。只有后端绑定 `cnmcp-community` D1。

## 1. 后端与种子

先在目标 Cloudflare 账户验证 Wrangler 登录。进入私有 `cnmcp-server` 仓库：

```sh
npm ci
npm test
npx wrangler whoami
npx wrangler d1 create cnmcp-community
node scripts/configure-d1.mjs <新库的数据库-ID>
npm run build
npm run db:remote
npm run deploy
```

如果数据库已创建，使用它的 ID。配置脚本拒绝旧版两个数据库 ID。生产工作流接受同一个 ID，读取 `CNMCP_COMMUNITY_D1_ID`。

迁移完成后核对六个领域、100 条资源和每个首批领域 25 条：

```sh
npx wrangler d1 execute DB --remote --command "SELECT d.id,count(rd.resource_id) AS resources FROM domains d LEFT JOIN resource_domains rd ON rd.domain_id=d.id GROUP BY d.id ORDER BY d.sort_order;"
```

### 配置 GitHub 登录

1. 打开 [GitHub OAuth Apps](https://github.com/settings/developers)，选择 **New OAuth App**。
2. 设置 **Application name** 为 `CNMCP`，**Homepage URL** 为 `https://www.cnmcp.com`。在 **Redirect URIs** 下的 **Redirect URI** 输入框填入 `https://www.cnmcp.com/auth/github/callback`，保持 **Allow wildcard matching** 未勾选，然后点击 **Register application**。
3. 注册后复制 **Client ID**，选择 **Generate a new client secret** 并保存生成的值。
4. 在 [Cloudflare 控制台](https://dash.cloudflare.com/)打开 **Workers & Pages → cnmcp-server-v2 → Settings → Variables and Secrets → Add**，以 **Secret** 类型分别添加 `GITHUB_CLIENT_ID` 和 `GITHUB_CLIENT_SECRET`，然后选择 **Deploy**。后端 `SITE_ORIGIN` 使用 `https://www.cnmcp.com`。
5. 打开 [CNMCP 登录入口](https://www.cnmcp.com/auth/github/start)，确认跳转到 GitHub。授权后返回 CNMCP，打开工作台确认会话有效。

GitHub 资料同步使用可选的 `GITHUB_TOKEN`，OAuth 登录使用上面两项凭据。

## 2. 网站与切流

进入公开 `cnmcp` 仓库：

```sh
npm ci
npm test
npm run deploy
node scripts/smoke-deployment.mjs https://<网站-Worker-预览地址>
```

先验证预览可读、健康接口返回 2.0、资源分页显示真实种子。然后在 Cloudflare 中将 `www.cnmcp.com` 绑定至 `cnmcp-web`，根据现有域名配置移除旧 Pages 的冲突绑定。正式域名验证：

```sh
node scripts/smoke-deployment.mjs https://www.cnmcp.com
```

在正式域名实际执行 GitHub 登录、发布、工作台和退出。GitHub Actions 可分别手动运行后台和网站的发布工作流。两个仓库使用各自生产环境中的 `CLOUDFLARE_ACCOUNT_ID` 与 `CLOUDFLARE_API_TOKEN`。

## 3. 退役旧部署

确认正式域名已切流且两个旧 D1 均无其他使用方后，停用公开旧版 `cnmcp-api`、移除 `api.cnmcp.com` 与 `cms.cnmcp.com` 的旧路由。确认新版网站与 Worker 都只绑定新 D1 后，删除原版 `cnmcp` 和 `cnmcp-server` D1。这一步会永久清除旧表与数据。最后重新跑正式域名检查。
