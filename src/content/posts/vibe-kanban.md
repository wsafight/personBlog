---
title: Vibe Kanban：AI 编码代理的编排利器
published: 2026-01-01
description: Vibe Kanban 是开源的 AI 编码代理编排工具，基于 Git worktrees 实现多 AI 并行工作，互不干扰，内置代码审查，本地运行，数据安全。
tags: [AI, 工具, Rust, 看板]
category: 开发工具
draft: false
---

> "Vibe Kanban 是自 Cursor 以来我最大的生产力提升工具。"
> —— Eleven Labs Growth Lead, Luke Harries

---

2017 年刚入行时，我学的第一个项目管理工具就是看板。那时候用的是 WeKan——一张张卡片在「待办」「进行中」「已完成」之间流转，工作变得可视化，协作变得顺畅。

九年过去了，转眼已是 2026 年。

AI 不再只是辅助工具，它们成了能独立写代码的「数字同事」。但问题来了：当 Claude、Gemini、Cursor 这些助手同时工作时，谁来管理它们？

这就是 Vibe Kanban 存在的理由——**给 AI 代理人用的看板**。

想象一下：Claude 在左边重构登录模块，Gemini 在右边写测试用例，Cursor 在中间修 Bug。它们在各自的 Git worktree 里安静工作，而你只需要在「看板」上审阅成果。

从人类团队的看板，到 AI 团队的看板。工具在变，协作的本质没变。

---

## 一句话介绍

[Vibe Kanban](https://www.vibekanban.com/) 是开源的 AI 编码代理编排工具——让多个 AI 并行工作，互不干扰，内置代码审查，本地运行，数据安全。

---

## 核心功能

| 功能 | 说明 |
|:------|:------|
| **并行执行** | 多个 AI 代理同时工作，互不干扰 |
| **独立空间** | 基于 Git worktrees 的隔离环境 |
| **代码审查** | 像 PR 一样查看和审批代码变更 |
| **多代理支持** | Claude、Gemini、Cursor、Copilot 等 9 款 |
| **IDE 集成** | VS Code 扩展直接交互 |
| **MCP 协议** | 连接外部工具和资源 |

---

## 快速开始

```bash
npx vibe-kanban
```

就这样。

---

## 原理：Git Worktrees

Vibe Kanban 的核心魔法来自 Git worktrees：

```bash
git worktree add ../task-123 feature/task-123
```

每个任务获得独立的工作目录，共享同一 Git 仓库，不同分支可同时工作。AI 代理之间完全隔离，不会踩踏彼此的修改。

```
创建任务 → 分配代理 → 创建 worktree → 执行修改
                                    ↓
审查 ← 生成 diff ← 任务完成 ← 合并主分支
```

**本地运行，数据安全**——代码不外传，完全本地控制。

---

## 技术架构

### 技术栈

| 层级 | 技术 |
|:------|:------|
| 后端 | Rust 2024 + Axum + SQLx + tokio |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 数据库 | SQLite（开发）/ PostgreSQL（生产） |
| 协议 | MCP (Model Context Protocol) |

### 项目结构

```
vibe-kanban-main/
├── crates/
│   ├── server/               # API 服务器
│   ├── executors/            # AI 代理执行器
│   ├── services/             # 业务服务层
│   ├── deployment/           # 部署抽象
│   └── local-deployment/     # 本地部署
├── frontend/                 # 前端应用
└── shared/                   # Rust ↔ TS 共享类型
```

### 核心设计

**Deployment 抽象层**——依赖倒置，本地/远程共享接口：

```rust
#[async_trait]
pub trait Deployment: Clone + Send + Sync + 'static {
    async fn new() -> Result<Self, DeploymentError>;
    fn container(&self) -> &impl ContainerService;
    // ...
}
```

**执行器枚举**——`enum_dispatch` 零成本抽象：

```rust
pub enum CodingAgent {
    ClaudeCode, Amp, Gemini, Codex,
    Opencode, CursorAgent, QwenCode, Copilot, Droid,
}
```

不同的 AI 代理，统一的执行接口。

---

## 设计理念

三个信念驱动 Vibe Kanban 的设计：

1. **AI 已经足够可靠**——大多数任务可以放心交给 AI
2. **AI 会越来越好**——每半年解决一半当前的失败模式
3. **技术会不断变化**——工作流程不应因更换代理而改变

---

## 常见问题

| 问题 | 回答 |
|:------|:------|
| 安全吗？ | 本地运行，代码不上传 |
| 费用？ | 免费开源，只需付 AI 服务费 |
| 多代理？ | 支持，每个任务独立 worktree |
| 失败处理？ | 实时监控，可随时暂停/恢复/停止 |

---

## 写在最后

从 2017 年的 WeKan 到 2026 年的 Vibe Kanban，看板从管理人类团队走向管理 AI 团队。

Vibe Kanban 把 AI 编码代理从「单打独斗」提升到「团队协作」层次。你可以安全、高效地利用 AI 的力量，同时保持对代码质量和开发流程的完全控制。

这或许就是 AI 时代协作工具应有的样子。

---

*官网：https://www.vibekanban.com/ | GitHub：https://github.com/BloopAI/vibe-kanban*
