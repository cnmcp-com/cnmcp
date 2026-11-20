# CNMCP 最新定稿设计

整理日期为 2026-11-18。产品 PRD 2.0，数据库基线 2.1，项目架构 1.0。覆盖普通用户使用范围。

## 直接执行

本目录是当前设计的唯一入口，不再按过程版本保存多个方案。

```text
design/
├── README.md                 定稿目录与阅读顺序
├── PRD.md                    产品范围、页面流程、权限与验收
├── ARCHITECTURE.md           cnmcp / cnmcp-server 职责及实施边界
├── UI-SPEC.md                页面结构、样式、响应式规则
├── database/
│   ├── README.md             表字典、关系、事务与查询说明
│   ├── schema.sql            新空库DDL：26表、4视图
│   ├── seed.sql              分类种子，无用户或互动数据
│   ├── queries.sql           16 个命名查询
│   ├── writes.sql            关注、取消关注与登录状态的原子 SQL
│   └── test_schema.py        35 项数据库检查
├── prototype/                可运行交互原型、配置与测试
│   ├── README.md             预览和运行说明
│   ├── AGENTS.md             最终范围及维护约束
│   ├── design-qa.md          当前定稿验收结果
│   ├── src/                  页面、样式和演示模型
│   ├── tests/                模型与打包检查
│   ├── scripts/              构建整理脚本
│   ├── worker/               静态预览/发布入口
│   └── .openai/              发布所需配置
└── screenshots/
    ├── overview.jpg          普通用户定稿概览
    └── login.jpg             仅普通用户的体验登录
```

推荐依次阅读：[PRD](PRD.md) → [架构](ARCHITECTURE.md) → [数据库](database/README.md) → [界面规范](UI-SPEC.md)。

[打开本地原型](http://127.0.0.1:4173/#/?view=all&domain=video) · [原型项目说明](prototype/README.md) · [定稿验收](prototype/design-qa.md)

从仓库根目录验证：

```sh
python3 design/database/test_schema.py
npm --prefix design/prototype run test:model
npm --prefix design/prototype run build
npm --prefix design/prototype run test:sites
```

已清理旧版PRD、早期页面/视觉提案、历史静态原型、过程截图与重复职责文档。部署说明保留在 [docs/deployment.md](../docs/deployment.md)，它描述现有运行环境，不是另一份产品设计。

## 深度交互

cnmcp负责网站、交互和公开契约；cnmcp-server负责唯一业务后端、数据库、鉴权、任务及后续MCP。数据库设计目前在本目录审阅，后端实施时一次性移交唯一迁移链，不维护两套生效SQL。原型仍为本地演示，文档整理不代表生产服务或远端数据库已切换。
