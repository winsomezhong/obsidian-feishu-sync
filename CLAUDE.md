# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作提供指引。

## Project Overview

This project syncs notes between **Obsidian** (local markdown note-taking) and **Feishu/Lark** (字节跳动 collaboration platform). It is in early development with no source code yet.

## Tech Stack (planned)

- **Language**: TypeScript/Node.js
- **Build**: Obsidian Plugin API + Rollup
- **Platform**: Windows (development environment)
- **Frameworks**: OpenSpec (spec-driven) + Superpowers (behavior discipline)

## 0. 全局工具路由规则

> **对于任何任务，第一步判断：当前需求适合哪条路径？**

### 路径 A：OpenSpec + Superpowers 联合（新功能 / 破坏性变更 / 架构变更）

**适用场景**：
- 新功能/新能力开发（如：自定义同步范围过滤、增量同步优化）
- API / Schema 破坏性变更
- 架构/模式变更（如：从轮询改为 WebSocket 实时同步）
- 预计耗时 > 30 分钟的任务

**流程**：
1. `/opsx:propose <change-name>` — 生成 proposal/design/specs/tasks
2. **人类审阅 artifacts（15 分钟）** — 这是最关键的质量关卡
3. `Superpowers: writing-plans` — 将 tasks 拆解为 2-5 分钟微任务
4. `Superpowers: TDD` — RED（写测试）→ GREEN（实现）→ REFACTOR（重构）
5. `Superpowers: subagent` — 子代理隔离执行 + 两阶段审查（spec 合规 + 代码质量）
6. `Superpowers: verification-before-completion` — 完成前全面验证
7. `/opsx:verify <change-name>` — OpenSpec 验证实现匹配 spec
8. `/opsx:archive <change-name>` — OpenSpec 归档（知识固化）

### 路径 B：Superpowers 单独（Bug 修复 / 快速任务 / 技术债务）

**适用场景**：
- Bug 修复（恢复原有行为）
- 非破坏性依赖升级
- 小规模技术债务清理
- 预计耗时 < 30 分钟的任务

**流程**：
1. `Superpowers: brainstorming` — 澄清问题（一问一答）
2. 创建 git worktree 隔离分支
3. `Superpowers: TDD` — 测试先行（RED-GREEN-REFACTOR）
4. `Superpowers: subagent` — 子代理隔离执行
5. `Superpowers: requesting-code-review` — 代码审查
6. `Superpowers: finishing-a-development-branch` — 合并/清理

### 路径 C：OpenSpec 单独（知识管理 / 变更追溯）

**适用场景**：
- 需要详细变更审计轨迹
- 需要更新 `openspec/project.md` / 主规格文档
- 跨 AI 工具团队协作需要统一规范
- 纯规格维护，不涉及代码变更

**流程**：
1. `/opsx:propose <change-name>`
2. `/opsx:apply <change-name>`
3. `/opsx:verify <change-name>`
4. `/opsx:archive <change-name>`

### 路径 D：直接实现（无需任何流程）

**适用场景**：
- 拼写/格式/注释修复
- 极小调整（1-2 行代码）
- 纯配置修改（如调整轮询间隔）

## 1. OpenSpec Config

- Config: `openspec/config.yaml`
- OPSX commands: `/opsx:propose` `/opsx:apply` `/opsx:verify` `/opsx:archive`
- **Core Profile** 即可满足大部分场景
- 切换 Expanded Profile 可启用 `/opsx:verify` 和 `/opsx:bulk-archive`

## 2. Superpowers Config

- Superpowers 通过 Claude Code 插件市场安装
- 核心技能将自动激活：TDD、writing-plans、subagent-driven-development、verification-before-completion
- 自定义技能可放置在 `.claude/skills/` 目录

## 3. 项目约定

### 命名规范
- 变更名称使用 kebab-case：`add-user-profile-filters`
- spec 中的模块名使用 PascalCase：`SyncEngine`, `ConflictResolver`
- 源文件名使用小写连字符

### 测试规范
- 使用 vitest 作为测试框架
- 测试文件与被测文件同目录，后缀 `.test.ts`
- 遵循 TDD 原则：先写测试，再写实现

### 归档要求
- 每次功能变更完成后必须运行 `/opsx:archive`
- 归档前必须运行 `/opsx:verify` 验证实现与 spec 匹配
- 归档不执行 = 知识不继承

## 4. 快速参考

| 场景 | 路径 | 主要命令 |
|------|------|----------|
| 添加新同步能力 | A | `/opsx:propose` → Superpowers TDD → `/opsx:archive` |
| 修复同步 bug | B | `Superpowers: brainstorming` → TDD → review → finish |
| 更新规格文档 | C | `/opsx:propose` → `/opsx:apply` → `/opsx:archive` |
| 改注释/格式化 | D | 直接修改 |
