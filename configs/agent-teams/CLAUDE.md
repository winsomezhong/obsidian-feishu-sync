# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作提供指引。

## 项目概述

本插件将 **Obsidian**（本地 Markdown 笔记）单向同步到 **飞书云盘**。项目处于活跃开发中（v0.1.0）。

## 技术栈

- **语言**：TypeScript / Node.js
- **构建**：Obsidian Plugin API + Rollup
- **平台**：Windows（开发环境）
- **框架**：OpenSpec（规范驱动）+ Agent Teams（多智能体编排）

## 0. 全局工具路由规则 — Agent Team 模式

> **架构决策**：本项目使用 **Agent Teams + Superpowers 混合架构**。Agent Teams 负责宏观编排（创建团队、任务依赖图、队员孵化、并行协调），Superpowers 负责队员内部的微观执行纪律（writing-plans 拆解微任务、TDD 红绿重构、verification-before-completion 证据驱动验证、requesting-code-review 结构化审查）。两者不是替代关系，而是**编排层 + 执行层**的互补。

### 0.0 模式选择：Team 还是 Solo？

| 条件 | 模式 | 理由 |
|------|------|------|
| 新功能 / 破坏性变更 / >30min | **Path A — Feature Team** | 多 Phase 需要专职 Spec + QA |
| Bug 修复 / 小任务 / <30min | **Path B — Fix Team** | 审查可与实现并行 |
| 纯规范维护 / 审计 | **Path C — Solo** | 只需 OpenSpec，无需团队 |
| 拼写/格式/1-2行 | **Path D — Solo** | 无流程直接改 |

---

### 路径 A：Feature Team（新功能 / 破坏性变更）

**Team**: 4 人 — Team Lead (你) + spec-teammate + implementer-teammate + qa-teammate

**任务依赖图**（→ = 顺序依赖， ∥ = 可并行）：

```
propose-spec [spec]
    ↓
  ╔══ HUMAN GATE ═══╗  ← 唯一必停点：人类审阅 artifacts
  ╚══════════════════╝
    ↓
implement-phase-1 [implementer]        ← worktree 隔离
    ↓
verify-phase-1 [qa]
    ↓
implement-phase-2 [implementer]
    ↓
verify-phase-2 [qa]
    ↓
   ... (循环所有 Phase)
    ↓
┌───────────────────┬───────────────────┐
│ integration-test  │ verify-spec       │  ← ∥ 并行！
│ [qa]              │ [spec]            │
│ e2e-test [qa]     │ archive-spec      │
│                   │ [spec]            │
└───────────────────┴───────────────────┘
    ↓
merge-to-main [team-lead]
```

**Team Lead 具体动作**：

```
1. 创建 team "feature-{change-name}"
2. 定义任务列表（按上图写入 task description + dependency）
3. 孵化 3 个队员：
   Task(team_name="feature-{change-name}", teammate="spec-teammate")
   Task(team_name="feature-{change-name}", teammate="implementer-teammate")  
   Task(team_name="feature-{change-name}", teammate="qa-teammate")
4. spec-teammate 认领 propose-spec → 完成后报告 Team Lead
5. 👤 HUMAN GATE：展示 artifacts 路径，等待批准信号
6. 批准后，implementer-teammate 逐 Phase 认领 implement-phase-N
   qa-teammate 逐 Phase 认领 verify-phase-N
   （自动续接：Phase N 验证通过 → Phase N+1 实现开始，不等 Team Lead）
7. 所有 Phase 完成后：
   - qa-teammate 认领 integration-test
   - spec-teammate 认领 verify-spec  ← ∥ 并行
8. qa-teammate 认领 e2e-test (依赖 integration-test)
   spec-teammate 认领 archive-spec (依赖 verify-spec)
9. Team Lead 执行 merge-to-main
```

> ⚠️ **HUMAN GATE 是唯一必停点**：Team Lead 在 propose-spec 完成后必须等待人类明确批准（"可以"/"开始"/"LGTM"/"+1"），不得自动续接。之后的 Phase 循环和验证全部自动执行。
>
> ⚠️ **禁止 `/opsx:apply`**：即使 OpenSpec 输出提示 `Run /opsx:apply to start`，也必须忽略。`/opsx:apply` 没有 TDD 强制、没有 QA 门控、没有审查。本项目的实现阶段全部由 implementer-teammate + qa-teammate 完成。

---

### 路径 B：Fix Team（Bug 修复 / 小任务 / 技术债务）

**Team**: 3-4 人 — Team Lead (你) + implementer-teammate + review-teammate (+ qa-teammate 仅在需要回归测试时)

**任务依赖图**：

```
brainstorm [team-lead]
    ↓
┌───────────────────┬───────────────────┐
│ implement-fix     │ code-review       │  ← ∥ 并行！review 不等实现完成
│ [implementer]     │ [review]          │
│ worktree 隔离     │ 增量审查每次提交   │
└───────────────────┴───────────────────┘
    ↓                       ↓
regression-test [qa] ←──────┘
    ↓
e2e-test [qa]
    ↓
spec-impact-check [review]  ← review-teammate 的第二个任务
    ↓
finish [team-lead]
```

**Team Lead 具体动作**：

```
1. 创建 team "fix-{brief-desc}"
2. 定义任务列表（implement-fix 和 code-review 设为无相互依赖 → 可并行认领）
3. 孵化队员：
   Task(team_name="fix-{brief-desc}", teammate="implementer-teammate")  
   Task(team_name="fix-{brief-desc}", teammate="review-teammate")
   Task(team_name="fix-{brief-desc}", teammate="qa-teammate")  ← 可选，仅大修复
4. Team Lead 自己做 brainstorming（小范围一问一答，不孵化队员）
5. implementer-teammate 认领 implement-fix，review-teammate 同时认领 code-review
   → review-teammate 每看到一次提交就增量审查，不等实现完成
6. implement-fix 完成 → qa-teammate 认领 regression-test
7. regression-test 通过 → qa-teammate 认领 e2e-test
8. review-teammate 认领 spec-impact-check → 自动判定并回写
9. Team Lead 执行 finish（合并 + 清理）
```

> ⚡ **并行收益**：步骤 5 是 Agent Team 相比原先 Superpowers 串行链的核心优势——代码审查不再等实现完成，而是在第一次提交后就启动，实现和审查交替进行，大幅缩短总耗时。

---

### 路径 C：OpenSpec 单独（知识管理）— Solo 模式

**不创建 Team**，Team Lead 直接使用 spec-teammate（单次 subagent）或手工执行：

1. `/opsx:propose <change-name>` — 生成工件
2. `/opsx:apply <change-name>` — 执行 tasks.md
3. `/opsx:verify <change-name>` — 验证
4. `/opsx:archive <change-name>` — 归档

### 路径 D：直接实现 — Solo 模式

直接修改。拼写/格式/1-2行/纯配置，不走任何流程。

---

### Team Lead 通用职责

无论 Path A 还是 Path B，你（Team Lead）负责：

| 职责 | 说明 |
|------|------|
| **创建团队** | 每次变更创建新 team，完成后清理 |
| **定义任务图** | 写清楚每个 task 的 description + dependencies |
| **孵化队员** | 用 Task 工具将队员加入团队 |
| **人类门控** | Path A 的 propose→批准 必须等待人类信号 |
| **监控进度** | 用 TaskList 查看团队状态，但不要微管理 |
| **最终合并** | 所有 task completed 后，合并到 main + 推送 + 清理 |

### 队员通信协议

队员之间通过 **SendMessage** 通信（Agent Teams 原生能力）：

| 发送方 | 接收方 | 消息内容 |
|--------|--------|---------|
| implementer | qa | "Phase N ready for verification at commit <hash>" |
| qa | implementer | "Phase N test failure: <file>:<line> - <error>" |
| review | implementer | "Review finding: <file>:<line> - <suggestion>" |
| spec | Team Lead | "Spec artifacts ready at openspec/changes/<name>/" |
| spec | qa | "verify-spec mismatch: <spec-section> not covered" |
| 任何人 | Team Lead | "Blocked: <reason>" |

> Team Lead **不主动打断队员**，除非收到 blocked 消息或 TaskList 显示长时间无进展。

## 1. OpenSpec 配置

- 配置文件：`openspec/config.yaml`
- 命令：`/opsx:propose` `/opsx:apply` `/opsx:verify` `/opsx:archive`
- **核心模式（Core Profile）** 即可满足大部分场景
- 切换到扩展模式（Expanded Profile）可启用 `/opsx:verify` 和 `/opsx:bulk-archive`

## 2. 混合架构配置

### 架构总览

```
Agent Teams（宏观编排层）
  ├── Team Lead 创建团队、定义任务依赖图、孵化队员
  ├── 队员间 SendMessage 通信、共享 TaskList
  └── 队员内部调用 Superpowers 执行微观纪律：
        ├── implementer → writing-plans + TDD + subagent
        ├── qa          → verification-before-completion
        └── review      → requesting-code-review
```

### Agent Teams 配置

- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 已在 `.claude/settings.local.json` 和 WSL `~/.claude/settings.json` 中启用
- **启动方式**：`.\start-wsl-tmux.ps1` — 在 WSL2 + tmux 中启动，每个队员自动获得独立 pane
- `teammateMode: "tmux"` 配置在 WSL 端

### Superpowers 的角色

Superpowers **不再作为顶层串行链**使用（原先的 Path A/B 已由 Agent Team 接管编排），而是**下沉为队员内部的执行纪律层**：

| Superpowers Skill | 调用者 | 用途 |
|-------------------|--------|------|
| `writing-plans` | implementer-teammate | 将 Phase 拆解为 2-5 分钟微任务 |
| `TDD` | implementer-teammate | 每个微任务强制 RED→GREEN→REFACTOR |
| `subagent-driven-development` | implementer-teammate | 复杂微任务的隔离执行 |
| `verification-before-completion` | qa-teammate | 证据驱动验证，禁止无证据断言 |
| `requesting-code-review` | review-teammate | 按维度结构化审查，输出分级报告 |
| `brainstorming` | Team Lead | Path B 步骤 1，需求澄清 |

### 队员定义

队员 persona 定义在 `.claude/agents/` 目录，每个文件同时声明了 Agent Team 角色和 Superpowers 内部调用规则：

| 文件 | 队员 | 模型 | 隔离 | 内部调用的 Superpowers |
|------|------|------|------|----------------------|
| `spec-teammate.md` | spec-teammate | Opus | fork | 无（OpenSpec 原生） |
| `implementer-teammate.md` | implementer-teammate | Sonnet | worktree | writing-plans + TDD + subagent |
| `qa-teammate.md` | qa-teammate | Sonnet | fork | verification-before-completion |
| `review-teammate.md` | review-teammate | Sonnet | fork | requesting-code-review |

## 3. 项目约定

### 命名规范
- 变更名称使用 kebab-case：`add-user-profile-filters`
- spec 中的模块名使用 PascalCase：`SyncEngine`, `ConflictResolver`
- 源文件名使用小写连字符

### 测试规范
- **单元测试**：使用 vitest，测试文件与被测文件同目录，后缀 `.test.ts`。遵循 TDD 原则：先写测试，再写实现
- **集成测试**：`tests/integration/` 目录，后缀 `.integration.test.ts`。覆盖跨模块接口协调和数据流。所有 Phase 完成后自动编写并执行
- **全量回归**：Path B 完成子代理执行后，必须运行 `npm test`（单元 + 集成 + E2E），确认不引入回归

### 归档要求
- 每次功能变更完成后必须运行 `/opsx:archive`
- 归档前必须运行 `/opsx:verify` 验证实现与 spec 匹配
- 归档不执行 = 知识不继承

## 4. 快速参考

| 场景 | 路径 | 团队 | 核心动作 |
|------|------|------|----------|
| 添加新同步能力 | A — Feature Team | spec + implementer + qa | Team Lead 创建 team → spec propose → 👤批准 → implement+qa 逐 Phase → 并行 verify+integration → merge |
| 修复同步 bug | B — Fix Team | implementer + review (+ qa) | Team Lead brainstorm → implement ∥ review → qa regression → review spec-impact → finish |
| 更新规格文档 | C — Solo | 无 | `/opsx:propose` → `/opsx:apply` → `/opsx:archive` |
| 改注释/格式化 | D — Solo | 无 | 直接修改 |

## 5. Spec Auto-Sync 机制（Path B → specs 回写）

### 5.1 为什么需要

Path B（Fix Team 模式）不生成完整的 OpenSpec artifacts，但 bug 修复或小任务可能改变 API 签名、接口类型、配置项、错误行为等 spec 覆盖的范围。若不回写，`openspec/specs/` 会逐渐与代码实际行为脱节。

### 5.2 判定规则（Spec Impact Detector）

| 触发同步 | 跳过 |
|---------|------|
| 函数/方法签名变更 | 纯内部重构 |
| 新增/删除/重命名公开 API / 导出符号 | 拼写/格式/注释 |
| 配置项变更（CLI flag、config key） | 非行为依赖升级 |
| 错误码 / 错误信息 | — |
| 接口 / 类型定义变更 | — |

### 5.3 自动同步产出

每触发一次，AI 自动执行：

1. **创建审计目录**：`openspec/changes/auto-<YYYYMMDD>-<HHmmss>-<brief-desc>/`
   - 内含 `design.md`（1-2 段说明改了什么 + 为什么）
   - 内含 `specs/<domain>/delta.md`（精确到字段级别的变更标记）
2. **更新主规范**：修改 `openspec/specs/` 中对应的 spec 文件
3. **追加流水日志**：写入 `openspec/changelog.yaml`

### 5.4 定期批量归档

```bash
# 每月或迭代末执行一次，将零散 auto-* 收编为正式归档记录
# 手动操作：收集 → 冲突检测 → 移入 archive/
# 目标：openspec/changes/auto-* → openspec/changes/archive/<date>-<batch-name>/
```
