# CNMCP

面向视频、游戏、AI、开发工具、效率工具、自托管的开源资源发现与交流社区。

- [产品设计与交互原型](design/README.md)
- [Cloudflare 发布](docs/deployment.md)

本仓库包含 Next.js 网站、同源 BFF 与公开接口契约。私有 `cnmcp-server` Worker 管理 GitHub 登录、社区数据、资源资料同步和通知。

## 本地开发与检查

需要 Node.js 22.13 或以上。启动社区后端本地 API 后，在本仓库运行：

```sh
npm ci
CNMCP_LOCAL_API_URL=http://127.0.0.1:8787 npm run dev
npm test
npm run build
```

首批资源选自 [HelloGitHub 月刊](https://hellogithub.com/periodical)，视频、游戏、AI、开发工具各 25 条。效率工具、自托管先开放分类。
