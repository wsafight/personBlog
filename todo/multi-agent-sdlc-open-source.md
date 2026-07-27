# Multi-Agent 需求到交付开源方案调研

调研日期：2026-07-27

## 目标

搭建一条由多个 AI 角色协作的软件交付链路：

```text
需求澄清 / Spec
-> 实现
-> 独立 CR
-> 验收
-> 部署
```

核心原则：实现 Agent 不能自己给自己验收通过；部署尤其是生产部署必须保留人工确认。

## 开源现状

目前没有一个开源项目能成熟地覆盖“需求、实现、CR、验收、部署”全链路并适合直接上生产。更现实的做法是组合多个开源工具：

- Spec 工具负责需求结构化和验收标准。
- Coding Agent 负责改代码、跑命令、开 PR。
- Review Agent 独立审查 diff。
- CI / E2E / QA Agent 负责验收。
- GitHub Actions、Dagger、Argo CD、Flux 等负责部署。

AI 适合做编排、检查、诊断和生成材料，不适合作为唯一发布门禁。

## 候选项目

| 项目 | 地址 | 适用环节 | 说明 |
| --- | --- | --- | --- |
| MetaGPT | https://github.com/foundationagents/metagpt | 需求、设计、任务拆解 | 多角色“软件公司”式流程，适合参考 PM / 架构师 / 工程师角色分工。 |
| ChatDev | https://github.com/openbmb/ChatDev | 需求到编码实验链路 | 偏研究和 demo，适合学习多 Agent 软件开发协作模式。 |
| OpenHands | https://github.com/OpenHands/openhands | 实现、PR、Review、自动化任务 | 更接近真实工程 agent，可改代码、跑命令、自托管，也有 PR review 用例。 |
| SWE-agent | https://github.com/swe-agent/SWE-agent | Issue 修复、实现 Agent | 面向真实 GitHub issue 修复，适合作为实现环节参考。 |
| Open SWE | https://github.com/langchain-ai/open-swe | 异步实现、PR 工作流 | LangChain / LangGraph 生态的异步 coding agent，可接 Linear、GitHub、Slack 等流程。 |
| GitHub Spec Kit | https://github.com/github/spec-kit | Spec-driven development | 先定义 spec、plan、tasks，再交给 AI coding agent 实现。 |
| OpenSpec | https://github.com/Fission-AI/openspec | 需求变更管理 | 将 proposal、design、tasks、spec 放进仓库，适合把需求变成可审查资产。 |
| PR-Agent | https://github.com/qodo-ai/pr-agent | AI CR | 开源 PR reviewer，支持 PR summary、review、suggestions 等能力。 |
| LangGraph | https://github.com/langchain-ai/langgraph | 多 Agent 编排 | 适合做有状态、可恢复、有条件分支的工作流。 |
| CrewAI | https://github.com/crewAIInc/crewAI | 多角色 Agent 编排 | 上手简单，适合快速搭建角色型流程。 |
| AG2 | https://github.com/ag2ai/ag2 | 多 Agent 对话编排 | AutoGen 社区延续方向，适合多 Agent 协作实验。 |
| Dagger | https://github.com/dagger/dagger | CI/CD 编排 | 用代码定义 build、test、ship pipeline。 |
| Argo CD | https://github.com/argoproj/argo-cd | GitOps 部署 | Kubernetes GitOps CD，适合作为部署执行层。 |
| Flux | https://github.com/fluxcd/flux2 | GitOps 部署 | Kubernetes GitOps CD，可作为 Argo CD 替代。 |

## 推荐组合

### 轻量本地版

适合个人或小团队先跑起来：

```text
OpenSpec / Spec Kit
-> Codex / OpenHands / SWE-agent 实现
-> PR-Agent 做 PR Review
-> GitHub Actions 跑测试和 E2E
-> 人工合并和部署
```

优点：工程改造小，容易接入现有仓库。

限制：跨 Agent 状态、审查结论、验收证据需要自己约定格式。

### 可审计工程版

适合团队内长期使用：

```text
Spec Agent
-> Implementation Agent
-> Reviewer Agent
-> Acceptance Agent
-> Release Agent
-> CI/CD / GitOps
```

建议把每一步的输入输出落库或落文件：

- `spec.md`：需求、范围、非目标。
- `tasks.md`：实现任务。
- `acceptance.md`：验收标准。
- `review.md`：独立 CR 结论。
- `verification.md`：测试、截图、日志、验收结果。
- `release.md`：发布记录、commit、环境、回滚方式。

## Agent 职责划分

### Spec Agent

输入：用户需求、背景材料、已有 issue / PRD。

输出：

- 问题定义。
- 目标和非目标。
- 用户故事或场景。
- 验收标准。
- 技术约束。
- 实施任务清单。

### Implementation Agent

输入：spec、tasks、仓库代码。

输出：

- 代码变更。
- 单测 / 集成测试。
- 自测记录。
- PR 描述。

要求：

- 不负责最终验收。
- 不允许绕过测试失败。
- 对未完成项明确标记。

### Reviewer Agent

输入只给：

- 原始需求 / spec。
- 验收标准。
- git diff。
- 测试输出。

输出：

- blocker。
- non-blocking issues。
- 测试缺口。
- 安全和回归风险。

要求：

- 不共享 Implementation Agent 的完整思考上下文。
- 默认站在 code review 视角，而不是帮实现者解释。

### Acceptance Agent

输入：验收标准、部署地址或本地环境、测试命令。

输出：

- 每条验收标准 pass / fail。
- 关键截图、日志、trace。
- 失败复现步骤。

### Release Agent

输入：PR、commit、环境、部署配置。

输出：

- 发布 checklist。
- release note。
- 部署状态。
- 失败诊断。
- 回滚建议。

要求：

- PPE / staging 可以自动触发。
- production / full traffic 必须人工确认。

## 最小可行实现

如果要自己做一套，建议先不要重写 agent 框架，先用脚本和 prompt 固化流程：

```text
scripts/ai/spec.sh
scripts/ai/implement.sh
scripts/ai/review.sh
scripts/ai/accept.sh
scripts/ai/release.sh
```

每个脚本只做一件事，输入输出都是仓库内文件：

```text
.ai/runs/<run_id>/spec.md
.ai/runs/<run_id>/tasks.md
.ai/runs/<run_id>/diff.patch
.ai/runs/<run_id>/review.md
.ai/runs/<run_id>/verification.md
.ai/runs/<run_id>/release.md
```

这样以后可以把底层模型从 Codex 换成 OpenHands、SWE-agent、Claude Code 或内部 agent，不影响流程资产。

## 风险和门禁

必须避免：

- 实现 Agent 自己审自己。
- Review Agent 只看总结不看 diff。
- 验收只看测试通过，不对照 acceptance criteria。
- AI 自动生产部署。
- 部署失败时只报失败，不抓诊断日志。

建议门禁：

- spec 已冻结或明确允许变更。
- diff 已由独立 Reviewer Agent 审查。
- CI 必须通过。
- Acceptance Agent 明确列出所有验收项结果。
- 生产部署必须人工确认。
- 发布记录包含 commit hash、环境、部署单、回滚方式。

## 结论

推荐从组合方案开始：

```text
OpenSpec / Spec Kit
-> OpenHands 或 SWE-agent
-> PR-Agent
-> Playwright / pytest / CI
-> GitHub Actions / Dagger / Argo CD / Flux
```

如果要沉淀成团队能力，可以把这条链路封装成内部 Codex skills 或一个 LangGraph workflow。关键不在于让 AI 一次性全自动，而在于每个阶段有清晰输入、输出、证据和门禁。
