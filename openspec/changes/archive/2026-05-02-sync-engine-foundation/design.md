## Context

当前无任何代码，这是一个从零开始的 Obsidian 插件项目。需建立 Obsidian → 飞书单向同步的完整技术架构。v1 通过本地 lark-cli 调用飞书 API，避免直接处理 OAuth 和 token 管理。

系统边界：
- 数据源：Obsidian vault 中的 .md 文件
- 目标：飞书云盘指定文件夹内的云文档（docx 类型）
- 中间层：lark-cli（@larksuite/cli）作为 API 代理
- 运行环境：Windows（开发环境），用户本地 Node.js 环境

## Goals / Non-Goals

**Goals:**
- 建立可扩展的插件架构，支持后续增量开发
- 实现 Obsidian → 飞书单向同步的完整管道：事件监听 → 变更检测 → 内容转换 → 飞书写入
- 支持手动触发同步（单文件 / 全量）
- 支持 Obsidian 文件 modify/create/delete/rename 事件自动触发同步
- 提供可配置的 Markdown 预处理管道，覆盖 Obsidian 主要特有语法
- 持久化同步状态，支持增量同步（跳过未变更文件）

**Non-Goals:**
- 飞书 → Obsidian 反向同步（v2 目标）
- 实时双向冲突合并（v2 目标）
- 不依赖云端服务做同步中转
- 不支持非 .md 文件的双向同步（附件仅作单向上传）
- 不支持飞书侧文档结构变更反向同步

## Decisions

### Decision 1: lark-cli 作为 API 代理

**选择**：通过 child_process.exec 调用 lark-cli 子进程，而非直接调用飞书 OpenAPI

**理由**：
- lark-cli 已封装 OAuth 2.0 授权和 token 刷新，插件无需处理认证
- 200+ 命令覆盖所有需要的操作（docs +create/update/fetch, drive +delete）
- 用户仅需 `lark-cli auth login` 一次性授权
- 避免维护 API 版本兼容和 HTTP 客户端

**替代方案**：直接调用飞书 OpenAPI → token 管理复杂，需处理刷新、过期重试等

### Decision 2: 文档级 mtime 冲突裁决

**选择**：基于文件 mtime 和 lastSyncedAt 比较，本地 mtime > 上次同步时间则推送

**理由**：
- v1 单向同步，无需复杂冲突逻辑
- mtime 是文件系统原生属性，可靠且零成本
- SyncState 只需记录 lastSyncedAt 和 lastLocalMtime

### Decision 3: PreProcessor 管道模式

**选择**：责任链模式，每个 Obsidian 语法特性独立为一个 Processor

**理由**：
- 每个处理器可独立启用/禁用/配置策略
- 新增处理器不影响既有逻辑
- 可通过 Obsidian Plugin API 暴露 registerProcessor() 让第三方扩展

### Decision 4: 完整内容覆盖式更新

**选择**：每次同步用 `lark-cli docs +update --command overwrite` 全文替换

**理由**：
- 实现简单，无需块级 diff
- Obsidian 侧是 Markdown 源文件，作为数据主源
- lark-cli v2 API 的 overwrite 模式原子性替换全部内容
- 文档 <=1MB 时性能可接受；1MB~10MB 发出警告并继续；>10MB 跳过并通知用户

**替代方案**：块级增量更新（update_block）→ 复杂度高，需要 diff 引擎，v1 不需要

### Decision 5: 构建工具链

**选择**：Obsidian Rollup 模板（官方推荐）

**理由**：
- Obsidian 社区插件标准，esbuild 已内置
- 与 Obsidian 热加载开发插件兼容
- TypeScript 类型定义通过 @types/obsidian 获取

### Decision 6: 同步状态存储

**选择**：本地 JSON 文件（data.json），存储在 Obsidian 插件数据目录

**理由**：
- 简单可靠，无需 SQLite 依赖
- 小型状态映射，单 vault <1000 条记录
- Obsidian 自动管理 plugin data 目录生命周期

### Decision 7: 内容编码

**选择**：统一使用 UTF-8 编码，通过 subprocess stdin 传递内容给 lark-cli

**理由**：
- Obsidian vault 中 Markdown 文件使用 UTF-8 编码
- lark-cli `--content @-` 从 stdin 读取，默认 UTF-8
- Windows 平台需显式设置 `{ encoding: 'utf-8' }` 避免 GBK 默认编码问题
- 中文内容在非 UTF-8 编码下会损坏

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| lark-cli 未安装或版本不兼容 | 启动预检，版本检查，明确提示 |
| lark-cli 子进程执行开销 | 仅在有变更时触发，不加轮询；30s 超时保护 |
| 全文覆盖更新大文档 | <=1MB 正常；1MB~10MB 警告；>10MB 跳过 |
| Obsidian 事件频繁触发（自动保存） | 2s 防抖窗口合并事件 |
| 网络不可用时排队积压 | 跳过本次，下次事件重试；手动触发兜底 |
| 飞书 API 限频 | 指数退避重试（3s/10s/30s），最多 3 次 |
| 长表格超过飞书 9 行限制 | 自动拆分保留表头，v2 优化 |
| 图片上传失败中断同步 | 跳过图片，同步文本内容，记录警告 |
