---
title: RTK：给 AI 编码助手瘦身的 Rust 代理
published: 2026-03-29
description: 一个 Rust 编写的 CLI 代理，在 AI 编码工具和系统命令之间插入智能过滤，将 LLM token 消耗降低 60-90%。
tags: [Rust, AI, CLI, 性能优化]
category: 技术
draft: false
---

> 一个 Rust 编写的 CLI 代理，在 AI 编码工具和系统命令之间插入一层智能过滤，将 LLM token 消耗降低 60-90%。

## 为什么需要 RTK？

当你使用 Claude Code、Cursor、Gemini CLI 等 AI 编码工具时，每一次 `git status`、`cargo test`、`ls -la` 的输出都会被完整地送入 LLM 上下文。一个 30 分钟的编码会话，仅命令输出就可能消耗 ~118,000 tokens。

问题在于：这些输出中大量信息对 LLM 来说是噪音。`git push` 的 15 行进度条、`cargo test` 中 98 个通过的测试用例、`ls -la` 的文件权限和时间戳——LLM 不需要这些。

RTK 的做法很简单：在命令执行后、输出返回 LLM 之前，过滤掉噪音，只保留有用信息。

### 真实场景对比

**场景 1：调试测试失败**
```bash
# 没有 RTK：pytest 输出 500 行，98 个通过的测试占据 450 行
# LLM 需要滚动大量无关信息才能找到 2 个失败的测试

# 有 RTK：直接显示
FAILED: 2/100 tests
  test_auth.py::test_expired_token: AssertionError at line 45
  test_db.py::test_connection_pool: TimeoutError
```

**场景 2：检查 Git 状态**
```bash
# 没有 RTK：git status 输出 50 行，包含完整的 untracked files 列表
# LLM 被迫处理 node_modules/、.DS_Store 等噪音

# 有 RTK：
3 modified, 1 untracked, 2 staged ✓
```

**场景 3：查看大型日志文件**
```bash
# 没有 RTK：docker logs 输出 10,000 行重复的健康检查日志
# LLM 上下文被撑爆，无法处理后续请求

# 有 RTK：
[INFO] Server started on :8080
[ERROR] Connection refused to db:5432 (×847)
[WARN] Rate limit exceeded (×23)
```

```
  Without RTK:                              With RTK:

  Claude  --git status-->  shell  --> git   Claude  --git status-->  RTK  --> git
    ^                                 |       ^                      |        |
    |      ~2,000 tokens (raw)        |       |   ~200 tokens        | filter |
    +------ 完整原始输出 -------------+       +---- 精简输出 --------+--------+
```

## 实际节省多少？

以一个中等规模 TypeScript/Rust 项目的 30 分钟会话为例：

| 操作 | 频次 | 原始 tokens | RTK 后 | 节省 |
|------|------|------------|--------|------|
| `git status` | 10x | 3,000 | 600 | -80% |
| `cat` / `read` | 20x | 40,000 | 12,000 | -70% |
| `cargo test` | 5x | 25,000 | 2,500 | -90% |
| `git push` | 8x | 1,600 | 120 | -92% |
| `grep` / `rg` | 8x | 16,000 | 3,200 | -80% |
| **合计** | | **~118,000** | **~23,900** | **-80%** |

### 成本节省计算

按 Claude API 定价（Sonnet 4.6）：
- Input: $3 / 1M tokens
- Output: $15 / 1M tokens

**单次 30 分钟会话节省**：
```
输入节省：(118,000 - 23,900) × $3 / 1M = $0.28
```

**月度节省（每天 4 小时编码）**：
```
每天 8 个会话 × 30 天 = 240 个会话
240 × $0.28 = $67.2 / 月
```

**团队节省（10 人团队）**：
```
$67.2 × 10 = $672 / 月 = $8,064 / 年
```

> 注：这只是输入 token 节省。实际上，更干净的上下文也会间接减少输出冗余，进一步降低成本。

## 安装与配置

```bash
# macOS (推荐)
brew install rtk

# Linux/macOS 快速安装
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

# 从源码
cargo install --git https://github.com/rtk-ai/rtk

# 验证
rtk --version
rtk gain
```

### 为 AI 工具安装 Hook

```bash
rtk init -g                     # Claude Code (默认)
rtk init -g --gemini            # Gemini CLI
rtk init -g --codex             # Codex
rtk init -g --agent cursor      # Cursor
rtk init --agent windsurf       # Windsurf
rtk init --agent cline          # Cline / Roo Code
```

安装后重启 AI 工具，所有 Bash 命令会被自动透明改写。

### 常见问题排查

**问题 1：`rtk gain` 报错 "command not found"**
```bash
# 检查安装路径
which rtk

# 如果没有输出，检查 PATH
echo $PATH | grep -o '[^:]*cargo[^:]*'

# 手动添加到 PATH（~/.zshrc 或 ~/.bashrc）
export PATH="$HOME/.cargo/bin:$PATH"
```

**问题 2：Hook 不生效，命令没有被改写**
```bash
# 检查 hook 配置
cat ~/.claude/settings.json | grep -A 5 PreToolUse

# 重新安装 hook
rtk init -g --force

# 重启 AI 工具（必须）
```

**问题 3：与 reachingforthejack/rtk 冲突**
```bash
# 检查是哪个 rtk
rtk --version

# 如果显示 "Rust Type Kit"，卸载它
cargo uninstall rtk

# 重新安装正确的 rtk
cargo install --git https://github.com/rtk-ai/rtk
```

## 核心原理：四大过滤策略

RTK 针对不同命令类型应用不同的过滤策略：

### 1. 统计提取（Stats Extraction）

将大量输出压缩为关键统计数据。

```bash
# git push 原始输出 (15 行, ~200 tokens)
Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Delta compression using up to 8 threads
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 1.23 KiB | 1.23 MiB/s, done.
...

# RTK 输出 (1 行, ~10 tokens)
ok main
```

用于：`git status/log/diff/push`、`pnpm list`

### 2. 失败聚焦（Failure Focus）

测试输出只保留失败用例，隐藏通过的。

```bash
# cargo test 原始输出 (200+ 行)
running 15 tests
test utils::test_parse ... ok
test utils::test_format ... ok
... (13 个 ok)
test edge::test_overflow ... FAILED

# RTK 输出 (~20 行)
FAILED: 2/15 tests
  test_edge_case: assertion failed
  test_overflow: panic at utils.rs:18
```

用于：`cargo test`、`pytest`、`vitest`、`playwright`、`rspec`、`go test`

### 3. 模式分组（Grouping by Pattern）

将分散的错误按规则/文件聚合。

```bash
# ESLint 原始输出：100 条分散的错误
src/a.ts:1 no-unused-vars
src/b.ts:5 no-unused-vars
src/c.ts:3 semi
...

# RTK 输出：按规则分组
no-unused-vars: 23 violations
semi: 45 violations
```

用于：`lint`（ESLint/Biome）、`tsc`、`grep`、`golangci-lint`、`rubocop`

### 4. 去重（Deduplication）

合并重复的日志行。

```bash
# 原始日志
[ERROR] Connection refused to db:5432
[ERROR] Connection refused to db:5432
[ERROR] Connection refused to db:5432
... (重复 100 次)

# RTK 输出
[ERROR] Connection refused to db:5432 (×100)
```

用于：`docker logs`、`kubectl logs`、应用日志

## Hook 机制：零感知的透明代理

RTK 最强大的特性是 hook 系统。安装后，你的 AI 工具完全不知道 RTK 的存在——它照常发出 `git status`，hook 在执行前将其改写为 `rtk git status`，LLM 只看到精简后的输出。

```
Claude Code              settings.json        rtk-rewrite.sh        RTK
     │                       │                     │                  │
     │  Bash: "git status"   │                     │                  │
     │──────────────────────►│                     │                  │
     │                       │  PreToolUse hook    │                  │
     │                       │────────────────────►│                  │
     │                       │                     │  检测: git       │
     │                       │                     │  改写:           │
     │                       │                     │  rtk git status  │
     │                       │◄────────────────────│                  │
     │                       │  updatedInput       │                  │
     │                       │                                        │
     │  执行: rtk git status ────────────────────────────────────────►│
     │                                                                │
     │◄──────────────────────────────────────────────────────────────│
     │  "3 modified, 1 untracked ✓"                                  │
```

关键点：
- hook 只作用于 Bash 工具调用，Claude Code 内置的 `Read`、`Grep`、`Glob` 不经过 hook
- 已经带 `rtk` 前缀的命令、heredoc（`<<`）不会被重复改写
- 支持 10+ AI 工具：Claude Code、Cursor、Gemini CLI、Copilot、Codex、Windsurf、Cline 等

## 命令速查

### 文件操作
```bash
rtk ls .                        # 紧凑目录树
rtk read file.rs                # 智能文件读取
rtk read file.rs -l aggressive  # 只显示函数签名
rtk grep "pattern" .            # 按文件分组的搜索结果
rtk find "*.rs" .               # 紧凑查找
```

### Git
```bash
rtk git status                  # 紧凑状态
rtk git diff                    # 精简 diff
rtk git log -n 10               # 单行提交
rtk git push                    # → "ok main"
```

### 测试 & 构建
```bash
rtk cargo test                  # 只显示失败 (-90%)
rtk pytest                      # Python 测试 (-90%)
rtk vitest run                  # Vitest (-99.5%)
rtk tsc                         # TS 错误按文件分组 (-83%)
rtk lint                        # ESLint 按规则分组 (-84%)
```

### 容器 & 基础设施
```bash
rtk docker ps                   # 紧凑容器列表
rtk kubectl logs <pod>          # 去重日志
rtk aws s3 ls                   # 精简 S3 列表
```

## 数据分析：rtk gain & rtk discover

RTK 内置 SQLite 追踪系统，记录每次命令的原始/过滤后 token 数。

```bash
rtk gain                        # 全局节省统计
rtk gain --graph                # ASCII 图表（近 30 天）
rtk gain --history              # 最近命令历史
rtk gain --daily                # 按天统计
```

### 输出示例

**全局统计**：
```
RTK Token Savings (Global)
════════════════════════════
Total commands:     1,234
Input tokens:       1,234,567
Output tokens:      247,000
Tokens saved:       987,567 (80.0%)

Top commands by savings:
  cargo test       -90.2%  (125,000 → 12,250)
  git status       -82.1%  (45,000 → 8,055)
  vitest run       -99.5%  (200,000 → 1,000)
```

**按天统计**：
```bash
rtk gain --daily

Date         Commands  Saved      Savings %
2026-03-29   45        12,450     78.3%
2026-03-28   52        15,890     81.2%
2026-03-27   38        9,234      76.5%
```

**命令历史**：
```bash
rtk gain --history

Recent commands (last 20):
Time      Command           Input   Output  Saved   %
14:32:05  cargo test        5,200   520     4,680   90%
14:28:13  git status        450     90      360     80%
14:15:42  vitest run        8,900   45      8,855   99%
```

### rtk discover：找出遗漏的优化机会

`rtk discover` 分析 Claude Code 会话历史，找出没有经过 RTK 的命令：

```bash
rtk discover                    # 当前项目，近 7 天
rtk discover --all --since 30   # 所有项目，近 30 天
```

**输出示例**：
```
Analyzing Claude Code history...
Found 234 commands in 15 sessions

Commands that could benefit from RTK:
  git status       18 times  (est. 3,600 tokens wasted)
  cargo test       5 times   (est. 12,500 tokens wasted)
  docker logs      3 times   (est. 45,000 tokens wasted)

Total potential savings: ~61,100 tokens

Recommendation:
  Run: rtk init -g
  Then restart Claude Code
```

## 架构设计

### 六阶段命令生命周期

```
PARSE → ROUTE → EXECUTE → FILTER → PRINT → TRACK
```

1. **PARSE**：Clap 解析参数和全局标志
2. **ROUTE**：`Commands` 枚举匹配，分发到对应模块
3. **EXECUTE**：`std::process::Command` 执行底层命令，捕获 stdout/stderr
4. **FILTER**：模块特定的过滤逻辑（正则、状态机、JSON 解析等）
5. **PRINT**：输出过滤结果
6. **TRACK**：SQLite 记录 input_tokens、output_tokens、savings_pct

### 性能约束

| 指标 | 目标 | 原因 |
|------|------|------|
| 启动时间 | <10ms | 开发者期望 CLI 即时响应 |
| 内存占用 | <5MB | 不影响其他进程 |
| 二进制大小 | <5MB | 快速安装 |

实现手段：
- 零 async（单线程，无 tokio 运行时）
- `lazy_static!` 编译正则（首次使用时编译，之后复用）
- 借用优先于克隆（`&str` > `String`）
- 按需加载配置（启动时零文件 I/O）

### 容错设计

RTK 的核心原则：**永远不阻塞用户**。如果过滤失败，回退到原始命令输出：

```rust
let filtered = filter_output(&output.stdout)
    .unwrap_or_else(|e| {
        eprintln!("rtk: filter warning: {}", e);
        output.stdout.clone()  // 回退到原始输出
    });
```

### Tee 系统：失败时的完整输出恢复

当命令失败时，RTK 将完整未过滤输出保存到文件，LLM 可以按需读取而不必重新执行：

```
FAILED: 2/15 tests
[full output: ~/.local/share/rtk/tee/1707753600_cargo_test.log]
```

## 50+ 支持的命令

RTK 覆盖了主流开发工具链：

- **Git**：status, diff, log, add, commit, push, pull, branch
- **GitHub CLI**：pr, issue, run
- **Rust**：cargo build/test/clippy/check
- **JavaScript/TypeScript**：vitest, tsc, lint (ESLint/Biome), prettier, playwright, next, prisma, pnpm
- **Python**：pytest, ruff, pip, mypy
- **Go**：go test/build/vet, golangci-lint
- **Ruby**：rspec, rubocop, rake test, bundle
- **容器**：docker, kubectl
- **云**：aws, psql
- **通用**：ls, read, grep, find, diff, curl, wget, json, log, env

不认识的命令会透传执行（passthrough），保证 RTK 始终安全可用。

## 配置

`~/.config/rtk/config.toml`：

```toml
[tracking]
database_path = "/path/to/custom.db"  # 自定义数据库路径

[hooks]
exclude_commands = ["curl", "playwright"]  # 不改写的命令

[tee]
enabled = true          # 失败时保存完整输出
mode = "failures"       # "failures" | "always" | "never"
max_files = 20          # 文件轮转上限

[filters]
# 全局过滤级别：minimal | balanced | aggressive
level = "balanced"

# 针对特定命令的自定义级别
[filters.overrides]
"cargo test" = "aggressive"  # 测试只看失败
"git log" = "minimal"        # 保留更多历史信息
```

### 项目级自定义过滤规则

在项目根目录创建 `.rtk/filters.toml`：

```toml
# 为特定命令定义正则匹配、行过滤、最大行数等
[[filters]]
command = "npm run build"
patterns = [
  "^✓",           # 隐藏成功标记
  "^\\s*$",       # 隐藏空行
]
max_lines = 50    # 最多保留 50 行

[[filters]]
command = "docker-compose logs"
dedup = true      # 启用去重
group_by = "service"  # 按服务分组
```

### 环境变量

```bash
# 临时禁用 RTK（调试用）
RTK_DISABLE=1 git status

# 强制显示完整输出
RTK_PASSTHROUGH=1 cargo test

# 调试模式（显示过滤前后对比）
RTK_DEBUG=1 git status
```

## 高级用法与最佳实践

### 1. 针对不同场景调整过滤级别

```bash
# 调试阶段：使用 minimal 保留更多信息
RTK_LEVEL=minimal cargo test

# 日常开发：使用 balanced（默认）
cargo test

# CI/CD 或快速迭代：使用 aggressive
RTK_LEVEL=aggressive cargo test
```

### 2. 与 CI/CD 集成

在 CI 环境中，RTK 可以减少日志存储和传输成本：

```yaml
# .github/workflows/test.yml
jobs:
  test:
    steps:
      - name: Install RTK
        run: curl -fsSL https://rtk.sh | sh

      - name: Run tests with RTK
        run: rtk cargo test
        env:
          RTK_LEVEL: aggressive
          RTK_TEE_MODE: failures  # 只保存失败的完整输出
```

### 3. 团队协作：共享过滤规则

将 `.rtk/filters.toml` 提交到版本控制：

```bash
# 项目根目录
mkdir -p .rtk
cat > .rtk/filters.toml <<EOF
# 团队统一的过滤规则
[[filters]]
command = "npm test"
max_lines = 100

[[filters]]
command = "docker-compose logs"
dedup = true
EOF

git add .rtk/filters.toml
git commit -m "chore: add RTK filters for team"
```

### 4. 性能优化：预热正则缓存

对于频繁使用的命令，可以在启动脚本中预热：

```bash
# ~/.zshrc 或 ~/.bashrc
if command -v rtk &> /dev/null; then
  # 预热常用命令的正则缓存
  rtk git status > /dev/null 2>&1 &
  rtk cargo test --help > /dev/null 2>&1 &
fi
```

### 5. 监控与告警

定期检查 token 节省情况，发现异常：

```bash
# 每周一检查上周的节省情况
rtk gain --since 7 | grep "Savings %" | awk '{
  if ($NF < 50) {
    print "Warning: Low savings detected: " $0
  }
}'
```

### 6. 调试过滤规则

当怀疑过滤规则有问题时：

```bash
# 1. 查看原始输出
RTK_PASSTHROUGH=1 cargo test > raw.log

# 2. 查看过滤后输出
rtk cargo test > filtered.log

# 3. 对比差异
diff -u raw.log filtered.log

# 4. 如果需要调整，编辑配置
vim ~/.config/rtk/config.toml
```

### 7. 多项目管理

为不同项目使用不同的配置：

```bash
# 项目 A：激进过滤
cd ~/projects/project-a
echo 'level = "aggressive"' > .rtk/config.toml

# 项目 B：保守过滤
cd ~/projects/project-b
echo 'level = "minimal"' > .rtk/config.toml
```

## 局限性：只优化输入，不减少输出

需要明确的一点：RTK **只优化输入 token（input tokens）**，不影响模型的输出 token（output tokens）。

RTK 的作用点是命令执行结果返回给 LLM 之前的过滤——这些内容属于 LLM 的输入上下文。模型生成的回复完全不经过 RTK。

间接来看，减少输入也会略微减少输出——模型收到精简的命令结果后，不太会在回复中复述大段原始输出，上下文更干净回复也倾向更简洁。但这个间接效果很小。

对于按 input/output 分别计费的 API（如 Claude API），RTK 省的是输入那一侧的钱。

### 其他限制

**1. 不适用于内置工具**
Claude Code 的 `Read`、`Grep`、`Glob` 等内置工具不经过 Bash hook，因此不会被 RTK 过滤。这些工具已经过优化，通常不需要额外过滤。

**2. 过滤可能丢失关键信息**
在极少数情况下，RTK 的过滤规则可能会误删有用信息。如果遇到这种情况：
```bash
# 临时禁用过滤
RTK_PASSTHROUGH=1 <command>

# 或读取完整输出（失败命令）
cat ~/.local/share/rtk/tee/<timestamp>_<command>.log
```

**3. 不支持交互式命令**
RTK 只处理非交互式命令的输出。对于需要用户输入的命令（如 `git rebase -i`、`vim`），请直接运行原始命令。

**4. 首次运行略慢**
RTK 使用 `lazy_static!` 编译正则表达式，首次运行某个命令时会有 ~5ms 的编译开销。后续调用会复用已编译的正则，开销降至 <1ms。

## 总结

RTK 解决了一个简单但影响巨大的问题：AI 编码工具浪费大量 token 在无用的命令输出上。通过一个 <5MB 的 Rust 二进制、<10ms 的启动开销、透明的 hook 集成，它在不改变任何工作流的前提下节省 60-90% 的输入 token 消耗。


### 适用人群

- **个人开发者**：降低 API 成本，延长上下文窗口可用性
- **团队**：统一的 token 优化方案，可量化的成本节省
- **企业**：大规模部署时显著降低 AI 工具运营成本

### 与其他工具的对比

| 工具 | 方式 | 节省 | 侵入性 | 维护成本 |
|------|------|------|--------|----------|
| **RTK** | 命令输出过滤 | 60-90% | 零（透明 hook） | 低（自动更新） |
| 手动精简提示词 | 人工优化 | 10-30% | 高（改变工作流） | 高（每次手动） |
| 上下文窗口限制 | 截断历史 | 20-40% | 中（丢失上下文） | 低 |
| 自定义 LLM 代理 | 重写工具链 | 50-80% | 极高（重新开发） | 极高 |

### 社区与支持

- **GitHub**：[github.com/rtk-ai/rtk](https://github.com/rtk-ai/rtk)
- **问题反馈**：[Issues](https://github.com/rtk-ai/rtk/issues)
- **功能请求**：[Discussions](https://github.com/rtk-ai/rtk/discussions)
- **Discord**：[加入社区](https://discord.gg/rtk-ai)
