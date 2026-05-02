## Why

Obsidian 和飞书是两种不同的知识管理工具，用户经常需要同时在两个平台维护内容。目前缺少一个本地优先的同步工具，能够将 Obsidian 笔记自动同步到飞书文档。本提案旨在建立 Obsidian → 飞书单向同步的基础架构，打通技术路径，为后续双向同步奠定基础。

## What Changes

- 创建 Obsidian 插件骨架，注册到 Obsidian 插件市场格式
- 实现 SyncEngine 核心，监听 Obsidian 文件事件（modify/create/delete/rename）并驱动同步
- 实现 Markdown 预处理管道，将 Obsidian 特有语法（frontmatter、wikilink、tag、dataview、长表格等）转换为飞书兼容的 Markdown
- 实现 feishu-bridge 适配层，通过 lark-cli 子进程调用飞书文档 CRUD API
- 实现 SyncStatusTracker，持久化同步状态映射（localPath ↔ docToken + 时间戳）
- 实现冲突裁决器，基于文档级 mtime 时间戳跳过未变更文件
- 提供 Obsidian 设置页，配置目标文件夹、处理器策略等
- 支持命令面板手动触发同步（"Sync current note" / "Sync all"）

## Capabilities

### New Capabilities

- `sync-engine`: 核心同步编排引擎。负责监听 Obsidian 文件事件（modify/create/delete/rename）、防抖处理、变更检测、冲突裁决（文档级时间戳）、同步状态追踪与持久化
- `markdown-converter`: Markdown 预处理管道。将 Obsidian 特有语法（frontmatter、[[wikilink]]、#tag、Dataview、长表格、图片引用、Callout、数学公式）通过可配置的处理器链转换为飞书兼容的 Markdown
- `feishu-bridge`: lark-cli 子进程适配层。封装 docs +create/update/fetch、drive +delete 等命令，处理超时、重试、错误解析
- `plugin-ui`: Obsidian 插件界面。包括设置页（目标文件夹、处理器开关与策略配置）、状态栏指示器、通知、同步日志面板

### Modified Capabilities

<!-- 无既有规格需要修改 -->

## Impact

- 新增 Obsidian 插件项目（TypeScript + Rollup 构建）
- 依赖：lark-cli（@larksuite/cli >= 1.0.22），安装在用户本地
- 依赖：Obsidian Plugin API（热加载开发）
- 无后端服务依赖，纯本地 → 飞书 API 直连
- 不影响 Obsidian vault 中既有文件结构
