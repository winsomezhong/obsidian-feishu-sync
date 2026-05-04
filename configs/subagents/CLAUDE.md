# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作提供指引。

## 项目概述

本插件将 **Obsidian**（本地 Markdown 笔记）单向同步到 **飞书云盘**。项目处于活跃开发中（v0.1.0）。

## 技术栈

- **语言**：TypeScript / Node.js
- **构建**：Obsidian Plugin API + Rollup
- **平台**：Windows（开发环境）
- **框架**：OpenSpec（规范驱动）+ Subagents（子代理编排）+ Superpowers（执行纪律）

## 0. 全局工具路由规则 — Subagent 编排模式

> **架构决策**：本项目使用 **Subagents + Superpowers 混合架构**。主代理（你）作为编排器（Orchestrator），通过 Agent 工具直接调用专业化子代理。Subagents 提供稳定的上下文隔离（非实验性），Superpowers 提供微观执行纪律。相比 Agent Teams，Subagents 模式更稳定、成本更低（1.5-2x vs 3-7x），但不支持子代理间直接通信——所有协调通过主代理中转。

### 0.0 模式选择

| 条件 | 模式 | 理由 |
|------|------|------|
| 新功能 / 破坏性变更 / >30min | **Path A — Feature 子代理链** | 多 Phase 需要专职 Spec + QA |
| Bug 修复 / 小任务 / <30min | **Path B — Fix 子代理并行** | 审查可与实现并行 |
| 纯规范维护 / 审计 | **Path C — Solo** | 只需 OpenSpec，无需子代理 |
| 拼写/格式/1-2行 | **Path D — Solo** | 无流程直接改 |

---

### 路径 A：Feature 子代理链（新功能 / 破坏性变更）

**子代理**: 3 个 — spec-agent (Opus) + implementer-agent (Sonnet, worktree) + qa-agent (Sonnet)

**执行流程**（主代理编排）：

```
1. 调用 spec-agent（propose）
   Agent(spec-agent, "执行 /opsx:propose <change-name>")

2. 👤 HUMAN GATE — 等待人类批准

3. For each Phase（自动续接）:
   a. 调用 implementer-agent（实现，worktree 隔离）
      Agent(implementer-agent, "实现 Phase N: <任务描述>")
   b. implementer 完成后，调用 qa-agent（验证）
      Agent(qa-agent, "验证 Phase N 实现")
   c. qa 通过 → 下一 Phase

4. 所有 Phase 完成后，并行调用：
   - Agent(qa-agent, "执行集成测试")    ∥ 并行
   - Agent(spec-agent, "执行 verify")   ∥ 并行

5. Agent(qa-agent, "执行 E2E 测试")
   Agent(spec-agent, "执行 archive")

6. 主代理执行 merge-to-main
```

> ⚠️ **HUMAN GATE 是唯一必停点**。Phase 循环和验证全部自动续接。
>
> ⚠️ **禁止 `/opsx:apply`**：必须走 implementer-agent（TDD+Superpowers）+ qa-agent（证据验证）链路。

---

### 路径 B：Fix 子代理并行（Bug 修复 / 小任务 / 技术债务）

**子代理**: 2-3 个 — implementer-agent (Sonnet, worktree) + review-agent (Sonnet) + qa-agent (Sonnet，按需)

**核心优势**：review-agent 与 implementer-agent 并行调用——主代理同时启动两个子代理。

**执行流程**：

```
1. 主代理自己做 brainstorming（一问一答）

2. 创建 git worktree

3. 并行调用两个子代理：
   Agent(implementer-agent, "修复: <bug描述>", run_in_background=true)
   Agent(review-agent, "审查实现", run_in_background=true)
   ← 两者同时运行，review 增量审查每次提交

4. implementer 完成 → 调用 qa-agent
   Agent(qa-agent, "执行回归测试")

5. qa 通过 → 调用 qa-agent 做 E2E
   Agent(qa-agent, "执行 E2E 测试")

6. 调用 review-agent
   Agent(review-agent, "检测规范影响")

7. 主代理执行 finish（合并 + 清理）
```

> ⚡ **并行收益**：步骤 3 是 Subagent 模式的核心优势——审查子代理通过 `run_in_background` 与实现子代理同时运行。

---

### 路径 C：OpenSpec 单独 — Solo 模式

主代理直接执行：`/opsx:propose` → `/opsx:apply` → `/opsx:verify` → `/opsx:archive`

### 路径 D：直接实现 — Solo 模式

直接修改，不走任何流程。

---

### 主代理编排职责

| 职责 | 说明 |
|------|------|
| **创建 worktree** | 调用 implementer-agent 前创建 git worktree |
| **调用子代理** | 用 Agent 工具指定任务、模型、run_in_background |
| **人类门控** | Path A 的 propose→批准 必须等待人类信号 |
| **并行调度** | Path B 的 implement ∥ review，Path A 的 integration ∥ verify |
| **最终合并** | 所有子代理完成后，合并到 main + 推送 + 清理 |

---

## 1. OpenSpec 配置

- 配置文件：`openspec/config.yaml`
- 命令：`/opsx:propose` `/opsx:apply` `/opsx:verify` `/opsx:archive`
- **核心模式（Core Profile）** 即可满足大部分场景
- 切换到扩展模式（Expanded Profile）可启用 `/opsx:verify` 和 `/opsx:bulk-archive`

## 2. Subagents + Superpowers 混合架构

### 架构总览

```
主代理（Orchestrator）
  │
  ├── Agent(spec-agent, "propose")        → OpenSpec 生命周期
  ├── Agent(implementer-agent, "Phase N") → worktree 隔离 + SP 内部调用
  ├── Agent(qa-agent, "verify")           → 证据驱动验证
  └── Agent(review-agent, "review")       → 结构化审查（可后台并行）
```

### Superpowers 的角色

Superpowers **下沉为子代理内部的执行纪律层**：

| Superpowers Skill | 调用者 | 用途 |
|-------------------|--------|------|
| `writing-plans` | implementer-agent | 将 Phase 拆解为 2-5 分钟微任务 |
| `TDD` | implementer-agent | 每个微任务强制 RED→GREEN→REFACTOR |
| `subagent-driven-development` | implementer-agent | 复杂微任务的隔离执行 |
| `verification-before-completion` | qa-agent | 证据驱动验证，禁止无证据断言 |
| `requesting-code-review` | review-agent | 按维度结构化审查，输出分级报告 |

### 子代理定义

| 文件 | 子代理 | 模型 | 隔离 | 内部调用的 Superpowers |
|------|--------|------|------|----------------------|
| `spec-agent.md` | spec-agent | Opus | fork | 无（OpenSpec 原生） |
| `implementer-agent.md` | implementer-agent | Sonnet | worktree | writing-plans + TDD + subagent |
| `qa-agent.md` | qa-agent | Sonnet | fork | verification-before-completion |
| `review-agent.md` | review-agent | Sonnet | fork | requesting-code-review |

### 与 Agent Teams 版本的对比

| 维度 | Subagents 版本（本文件） | Agent Teams 版本 |
|------|------------------------|-----------------|
| 协调方式 | 主代理手动调用子代理 | Team Lead + 共享任务列表 |
| 子代理间通信 | 不支持（通过主代理中转） | SendMessage 直接通信 |
| 任务认领 | 主代理分配 | 队员自主认领 |
| 稳定性 | ✅ 稳定 | ⚠️ 实验性 |
| Token 成本 | 1.5-2x | 3-7x |
| 并行方式 | `run_in_background` | 依赖图自动并行 |

## 3. 项目约定

### 命名规范
- 变更名称使用 kebab-case：`add-user-profile-filters`
- spec 中的模块名使用 PascalCase：`SyncEngine`, `ConflictResolver`
- 源文件名使用小写连字符

### 测试规范
- **单元测试**：使用 vitest，测试文件与被测文件同目录，后缀 `.test.ts`。遵循 TDD 原则：先写测试，再写实现
- **集成测试**：`tests/integration/` 目录，后缀 `.integration.test.ts`。覆盖跨模块接口协调和数据流
- **全量回归**：Path B 完成子代理执行后，必须运行 `npm test`

### 归档要求
- 每次功能变更完成后必须运行 `/opsx:archive`
- 归档前必须运行 `/opsx:verify` 验证实现与 spec 匹配
- 归档不执行 = 知识不继承

## 4. 快速参考

| 场景 | 路径 | 核心动作 |
|------|------|----------|
| 添加新同步能力 | A — Feature 子代理链 | spec propose → 👤批准 → implement→qa 逐 Phase → 并行 verify+integration → merge |
| 修复同步 bug | B — Fix 子代理并行 | brainstorm → implement ∥ review → qa regression → review spec-impact → finish |
| 更新规格文档 | C — Solo | `/opsx:propose` → `/opsx:apply` → `/opsx:archive` |
| 改注释/格式化 | D — Solo | 直接修改 |

## 5. Spec Auto-Sync 机制（Path B → specs 回写）

Path B（Fix 模式）不生成完整 OpenSpec artifacts，但 bug 修复可能改变 API 签名、接口类型等 spec 覆盖的范围。review-agent 在执行 `spec-impact-check` 时自动检测并回写。

### 判定规则（Spec Impact Detector）

| 触发同步 | 跳过 |
|---------|------|
| 函数/方法签名变更 | 纯内部重构 |
| 新增/删除/重命名公开 API / 导出符号 | 拼写/格式/注释 |
| 配置项变更 | 非行为依赖升级 |
| 错误码 / 错误信息 | — |
| 接口 / 类型定义变更 | — |

### 自动同步产出

review-agent 检测到影响后自动执行：
1. 创建审计目录：`openspec/changes/auto-<ts>-<描述>/`，内含 design.md + delta.md
2. 更新 `openspec/specs/` 主规范文件
3. 追加 `openspec/changelog.yaml`
