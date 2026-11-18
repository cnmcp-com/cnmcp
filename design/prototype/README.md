# CNMCP 普通用户定稿原型

## 直接执行

[打开原型](http://127.0.0.1:4173/#/?view=all&domain=video)

项目目录为 `design/prototype/`。这是完整可运行的前端项目；页面入口是 [src/App.jsx](src/App.jsx)，样式为 [src/styles.css](src/styles.css)。

- 全部：按领域展示最近讨论与资源发现两个分区。
- 主题：领域下方显示平级节点。
- 资源发现：领域下方显示适用标签，与节点共用样式，无左侧标签栏或页内搜索。
- 社区侧栏：普通用户卡片、发布/待回应、演示今日热议及实际本机浏览记录。
- 发布：标题、选填正文、领域/节点与@/按钮资源引用，支持草稿和预览。
- 登录仅普通用户，无角色切换或管理页面。

定稿依据：[PRD](../PRD.md)、[界面规范](../UI-SPEC.md)、[项目架构](../ARCHITECTURE.md)、[数据库](../database/README.md)。[当前验收结果](design-qa.md)保留最终结论，不再保留各轮过程报告。

维护命令（在本目录执行）：

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
npm run test:model
npm run build
npm run test:sites
```

运行依赖及构建输出由 `node_modules/` 和 `dist/` 保存并忽略提交；源代码、依赖锁、Vite配置、worker和发布配置完整保留。

## 深度交互

账号、内容和通知为浏览器内演示，真实OAuth、业务API、采集、通知投递和MCP尚未接入。最近浏览真实记录本机访问，保留20条、显示最新5条；清空浏览器数据会丢失本地演示状态。重构生产后端仍按架构文档实施，本项目不承担生产DB写入。
