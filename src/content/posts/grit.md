---
title: "Grit：代码重构利器"
published: 2025-12-30
description: Grit 是一款强大的代码批量重构工具，使用声明式语法支持多种语言。文章介绍了其核心命令、GritQL 语法、实战案例（清理 console、框架迁移等）以及 CI 集成等最佳实践。
category: 开发工具
tags: [代码重构, 开发工具]
draft: false
---

> 面对需要修改数百个文件的代码迁移，你还在手动一个个改吗？今天介绍一款能让代码批量重构像查找替换一样简单的工具 —— Grit。

## 为什么需要 Grit

作为开发者，我们经常遇到这样的场景：

- 团队决定统一使用 `lodash-es` 替代 `lodash`，需要修改几百个 import 语句
- 项目要从 React 类组件迁移到 Hooks，涉及上千个组件
- 某个废弃的 API 需要全面替换，但调用位置散落在代码库各处

传统的解决方案各有痛点：

| 方案 | 问题 |
|------|------|
| 手动修改 | 耗时长、易遗漏、容易出错 |
| 正则替换 | 不理解代码结构，容易误伤 |
| jscodeshift | 仅支持 JS/TS，需懂 AST，编写复杂 |
| find + sed | 脆弱，难以处理复杂场景 |

**Grit** 就是为了解决这些问题而生的 —— 它用声明式的语法，支持多种语言，让任何人都能写出安全的代码转换规则。

---

## 快速开始

### 安装

```bash
# 方式一：官方安装脚本
curl -fsSL https://docs.grit.io/install | bash

# 方式二：npm 安装
npm install -g @getgrit/cli
```

### 验证安装

```bash
# 检查版本
grit version

# 诊断环境
grit doctor
```

### 第一个转换

假设我们要把所有的 `console.log` 调用删除：

```bash
# 方式一：使用标准库 pattern（推荐）
grit apply no_console_log src/

# 方式二：使用内联 pattern
grit apply '`console.log($_)`' src/

# 先预览会改什么（dry-run）
grit apply --dry-run no_console_log src/

# 查看某个 pattern 的详细信息
grit patterns describe no_console_log
```

---

## 核心命令

### grit apply - 应用转换

**语法**: `grit apply [OPTIONS] <PATTERN> [PATHS]...`

**Pattern 参数形式**：
- 标准库 pattern: `no_console_log`
- 内联模式: `'`console.log($_)`'`（用单引号包裹反引号内的 pattern）
- Pattern 文件: `./patterns/my_pattern.grit`

**常用选项**：

```bash
# 预览模式（不实际修改文件）
grit apply --dry-run no_console_log file.js

# 指定语言
grit apply --language python print_to_log file.py

# 限制修改数量
grit apply --limit 10 no_console_log src/

# 紧凑输出
grit apply --output compact no_console_log src/

# 交互式选择（逐个确认）
grit apply --interactive no_console_log src/

# JSONL 格式输出
grit apply --jsonl no_console_log src/
```

### grit list - 列出可用 Patterns

```bash
# 列出所有 patterns
grit list

# 仅列出 JavaScript/TypeScript patterns
grit list --language js

# 仅列出 Python patterns
grit list --language python

# 仅列出本地 patterns
grit list --source local
```

### grit check - 检查代码

```bash
# 检查当前目录
grit check

# 自动修复
grit check --fix

# 详细输出
grit check --verbose
```

### 其他有用命令

```bash
# 描述某个 pattern
grit patterns describe no_console_log

# 列出 patterns
grit patterns list

# 诊断环境
grit doctor
```

---

## 核心语法

### 代码片段模式

最基本的模式是用反引号包裹的代码片段：

```gritql
`console.log('Hello')`
```

**结构化匹配**意味着 Grit 忽略格式差异，以下都会被匹配：

```javascript
console.log('Hello')
console.log ( 'Hello' )     // 换行和空格不影响
console.log("Hello")         // 单双引号等价
```

### 变量系统

使用 `$` 前缀定义变量，匹配任意内容：

```gritql
`console.$method($msg)`      // 匹配 console 的任何方法调用
```

**变量复用规则**：同一变量多次出现必须匹配相同值

```gritql
`$obj && $obj.$prop()`       // foo && foo.bar() ✓
                              // foo && bar.baz()   ✗
```

### 条件过滤

使用 `where` 子句精确控制匹配范围：

```gritql
`console.$method($msg)` where {
  $method <: or { `log`, `warn` }    // 只匹配 log 和 warn
}
```

### 转换语法

使用 `=>` 进行代码转换：

```gritql
`旧代码($args)` => `新代码($args)`
```

---

## 实战案例

### 案例 1：清理 console 调试语句

最简单的场景 —— 直接删除匹配的代码。

```javascript
// 转换前
console.log('fetching data...');
console.debug('state:', state);
console.info('API called');
console.error('Critical error');  // 保留

// 转换后
console.error('Critical error');
```

**使用标准库 pattern（推荐）**：

```bash
grit apply no_console_log src/
```

**自定义 GritQL 规则**：

```gritql
`console.log($a)` => ``
`console.debug($a)` => ``
`console.info($a)` => ``
```

> **注意**: 标准库的 `no_console_log` 会自动保留 catch 块中的 console.log，更加安全。

---

### 案例 2：Python print 转 logger

将 Python 中的 `print` 语句转换为 logger 调用。

```python
# 转换前
print("Hello, World")
print(f"User: {username}")
print("Error:", error)

# 转换后
log("Hello, World")
log(f"User: {username}")
log("Error:", error)
```

**使用标准库 pattern**：

```bash
grit apply --language python print_to_log src/
```

---

### 案例 3：移除 debugger 语句

清理开发时留下的 debugger 语句。

```javascript
// 转换前
function processData(data) {
    debugger;  // 调试用
    return data.map(x => x * 2);
}

// 转换后
function processData(data) {
    return data.map(x => x * 2);
}
```

**使用标准库 pattern**：

```bash
grit apply no_debugger src/
```

---

### 案例 4：import 路径调整

项目目录重构时的常见需求 —— 批量更新 import 路径。

```javascript
// 转换前
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { formatDate } from '@/utils/date'

// 转换后
import { Button } from '@/components/Button'
import { useAuth } from '@/hooks/auth'
import { formatDate } from '@/utils/format'
```

**GritQL 规则**：

```gritql
`from '@/components/ui/$name'` => `from '@/components/$name'`
`from '@/hooks/use$name'` => `from '@/hooks/$name'`
`from '@/utils/date'` => `from '@/utils/format'`
```

---

### 案例 5：箭头函数简化

> ⚠️ **限制**：内联 pattern 对多参数函数的处理有限制，建议仅用于单参数场景。

单行返回的箭头函数可以省略 `return` 和大括号。

```javascript
// 转换前
const double = x => { return x * 2; }
const getValue = () => { return config.value; }

// 转换后
const double = x => x * 2
const getValue = () => config.value
```

**异步箭头函数**：可以去除 `async` 和 `await`（当直接返回 Promise 时）。

```javascript
// 转换前
const getData = async () => { return await fetch('/api/data'); }

// 转换后
const getData = () => fetch('/api/data')
```

> **说明**：当函数只是直接返回 `await` 的结果时，`async/await` 是冗余的。

**GritQL 规则**：

```gritql
# 单参数箭头函数（推荐）
`$param => { return $expr }` => `$param => $expr`

# 无参数箭头函数
`() => { return $expr }` => `() => $expr`

# 异步箭头函数 - 去除 async/await
`async () => { return await $expr }` => `() => $expr`
```

**注意**：多参数函数 `(a, b) => ...` 的转换存在括号处理问题，建议手动处理或使用 .grit 文件。

---

### 案例 6：框架升级迁移

Grit 提供了丰富的框架升级 patterns，可自动化常见的迁移工作。

#### React 升级

| 迁移类型 | Pattern | 命令 |
|---------|---------|------|
| 类组件 → Hooks | `react_to_hooks` | `grit apply react_to_hooks src/` |
| React Query v3 → v4 | `migrating_from_react_query_3_to_react_query_4` | `grit apply migrating_from_react_query_3_to_react_query_4 src/` |
| MUI v4 → v5 | `mui4_to_mui5` | `grit apply mui4_to_mui5 src/` |
| Knockout → React | `knockout_to_react` | `grit apply knockout_to_react src/` |
| Jest → Vitest | `jest_to_vitest` | `grit apply jest_to_vitest src/` |
| Chai → Jest | `chai_to_jest` | `grit apply chai_to_jest src/` |
| Enzyme → RTL | `enzyme_rtl` | `grit apply enzyme_rtl src/` |

**React 类组件转 Hooks 示例**：

```javascript
// 转换前
class UserList extends React.Component {
  state = { users: [], loading: false }
  componentDidMount() {
    this.fetchUsers()
  }
  fetchUsers() {
    this.setState({ loading: true })
    api.getUsers().then(users => this.setState({ users, loading: false }))
  }
  render() {
    if (this.state.loading) return <div>Loading...</div>
    return <div>{this.state.users.length} users</div>
  }
}

// 转换后
function UserList() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  function fetchUsers() {
    setLoading(true)
    api.getUsers().then(data => { setUsers(data); setLoading(false) })
  }

  if (loading) return <div>Loading...</div>
  return <div>{users.length} users</div>
}
```

**使用命令**：

```bash
# 预览转换结果
grit apply --dry-run react_to_hooks src/

# 执行转换
grit apply react_to_hooks src/

# 交互式选择（逐个确认）
grit apply --interactive react_to_hooks src/
```

#### Vue 升级

Vue 相关的迁移 pattern 较少，建议手动或配合其他工具进行 Vue 2 → Vue 3 的升级。

#### 其他迁移

| 迁移类型 | Pattern | 命令 |
|---------|---------|------|
| Cypress → Playwright | `cypress_to_playwright` | `grit apply cypress_to_playwright src/` |
| Protractor → Playwright | `protractor_to_playwright` | `grit apply protractor_to_playwright src/` |
| CodeceptJS → Playwright | `codecept_to_playwright` | `grit apply codecept_to_playwright src/` |
| Moment → date-fns | `moment_to_datefns` | `grit apply moment_to_datefns src/` |
| io-ts → Zod | `iots_to_zod` | `grit apply iots_to_zod src/` |
| OpenAI v3 → v4 | `openai_v4` | `grit apply openai_v4 src/` |


**使用示例**：

```bash
# Jest 迁移到 Vitest
grit apply --dry-run jest_to_vitest src/
grit apply jest_to_vitest src/

# OpenAI SDK 升级
grit apply --dry-run openai_v4 src/
grit apply openai_v4 src/

# 测试框架迁移（Cypress → Playwright）
grit apply --dry-run cypress_to_playwright tests/
grit apply cypress_to_playwright tests/
```

---

### 案例 7：对象简写属性

> ⚠️ **限制**：必须使用 `.grit` 文件，内联语法不支持，且转换后需要人工检查。

ES6 允许属性名和变量名相同时省略冒号。

```javascript
// 转换前
const user = { name: name, age: age, userId: id }
return { data: data, isLoading: loading }

// 转换后
const user = { name, age, userId: id }
return { data, isLoading: loading }
```

**创建 `shorthand.grit` 文件**：

```grit
# 指定使用的引擎版本（marzano 是 Grit 的匹配引擎）
engine marzano(0.1)
# 指定目标语言
language js

`{ $props }` where {
  $props <: some {
    `$k: $k` => `$k`
  }
}
```

> **`engine marzano(0.1)`**：Grit 的匹配引擎版本，所有 `.grit` 文件都需要在开头声明。

**使用方式**：

```bash
# 应用转换（可能需要运行多次直到所有属性都转换完成）
grit apply shorthand.grit src/
```

**测试结果**：
- ✅ 可以匹配并转换 `{ name: name }` → `{ name }`
- ⚠️ 多个属性需要运行多次才能全部转换
- ⚠️ 转换后建议人工检查结果

---

## 常用标准 Patterns

Grit 提供了丰富的标准 patterns 库，使用 `grit list` 查看。

### JavaScript/TypeScript 常用 Patterns

| Pattern | 说明 | 命令 |
|---------|------|------|
| `no_console_log` | 移除 `console.log` | `grit apply no_console_log` |
| `no_debugger` | 移除 `debugger` | `grit apply no_debugger` |
| `no_alert` | 移除 `alert()` | `grit apply no_alert` |
| `no_commented_out_code` | 移除注释代码 | `grit apply no_commented_out_code` |
| `es6_imports` | 转换为 ES6 imports | `grit apply es6_imports` |
| `es6_exports` | 转换为 ES6 exports | `grit apply es6_exports` |
| `jest_to_vitest` | Jest 迁移到 Vitest | `grit apply jest_to_vitest` |
| `chai_to_jest` | Chai 迁移到 Jest | `grit apply chai_to_jest` |
| `openai_v4` | OpenAI v4 迁移 | `grit apply openai_v4` |

### Python 常用 Patterns

| Pattern | 说明 | 命令 |
|---------|------|------|
| `print_to_log` | print 转 logger | `grit apply --language python print_to_log` |
| `py_no_debugger` | 移除 `pdb.set_trace()` | `grit apply py_no_debugger` |
| `no_skipped_tests` | 移除跳过的测试 | `grit apply no_skipped_tests` |
| `openai` | OpenAI SDK 迁移 | `grit apply openai` |

---

## 支持的语言

Grit 支持以下编程语言（使用 `--language` 选项指定）：

### 语言列表

| 标识符 | 语言 |
|--------|------|
| `js` | JavaScript / TypeScript / JSX / TSX |
| `html` | HTML |
| `css` | CSS |
| `json` | JSON |
| `java` | Java |
| `kotlin` | Kotlin |
| `csharp` | C# |
| `python` | Python |
| `markdown` | Markdown |
| `go` | Go |
| `rust` | Rust |
| `ruby` | Ruby |
| `elixir` | Elixir |
| `solidity` | Solidity |
| `hcl` | HCL |
| `yaml` | YAML |
| `sql` | SQL |
| `vue` | Vue |
| `toml` | TOML |
| `php` | PHP |

### 使用示例

```bash
# Python 项目 - 将 print 转换为 logger
grit apply --language python print_to_log src/

# Go 项目 - 移除 debugger 语句
grit apply --language go no_debugger src/

# Java 项目 - 列出可用的 Java patterns
grit list --language java

# Rust 项目 - 应用自定义 pattern
grit apply --language rust ./patterns/custom.grit src/

# Vue 项目 - 检查代码规范
grit check --language vue src/

# 多语言项目 - 同时处理多种文件类型
grit apply --language js no_console_log src/
grit apply --language python print_to_log src/

# 查看某个语言的可用 patterns
grit patterns list --language python
```

---

## 工作流最佳实践

### 推荐工作流程

```bash
# 1. 列出可用的 patterns
grit list --language js

# 2. 查看 pattern 详情
grit patterns describe no_console_log

# 3. 预览模式（不会修改文件）
grit apply --dry-run no_console_log src/

# 4. 限制范围测试
grit apply no_console_log src/components/

# 5. 交互式应用（逐个确认）
grit apply --interactive no_console_log src/

# 6. 确认后正式应用
grit apply no_console_log src/
```

### 使用配置文件

创建 `.grit/grit.yaml` 管理项目规则：

```yaml
patterns:
  - no_console_log
  - no_debugger
  - .grit/patterns/**/*.grit

ignored:
  - node_modules/**
  - dist/**
  - build/**
  - "**/*.min.js"

enforcement:
  level: fix
```

### CI 集成

在 GitHub Actions 中集成代码检查：

```yaml
name: Grit Code Quality

on: [pull_request]

jobs:
  grit-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Grit
        run: npm install -g @getgrit/cli
      - name: Check code patterns
        run: grit check --github-actions
```

---

## 工作原理

### 处理流程

```
源代码
    ↓
┌─────────────────────────────────────┐
│  Tree-sitter 解析器                 │
│  (多语言支持，增量解析)              │
└─────────────────────────────────────┘
    ↓ AST
┌─────────────────────────────────────┐
│  Grit 模式匹配引擎                  │
│  (变量绑定，条件过滤)                │
└─────────────────────────────────────┘
    ↓ 匹配结果
┌─────────────────────────────────────┐
│  AST 转换引擎                       │
│  (语义保持，结构转换)                │
└─────────────────────────────────────┘
    ↓ 修改后的 AST
┌─────────────────────────────────────┐
│  代码生成器                         │
│  (保留格式，生成代码)                │
└─────────────────────────────────────┘
    ↓
转换后代码
```

### 为什么比正则更安全？

| 特性 | 正则表达式 | Grit |
|------|-----------|------|
| 理解代码结构 | ❌ | ✅ |
| 忽略空白/引号差异 | ❌ | ✅ |
| 变量绑定与复用 | ❌ | ✅ |
| AST 感知 | ❌ | ✅ |
| 语义安全 | ❌ | ✅ |


---

## 常见问题

**Q: 转换会破坏代码格式吗？**

A: 不会。Grit 保留原始格式，只修改语义结构。

**Q: 内联 pattern 怎么写？**

A: 使用单引号包裹整个 pattern（反引号内是匹配代码）：

```bash
# 正确 - 单引号包裹，shell 不会解析反引号
grit apply '`console.log($_)`' file.js

# 错误 - shell 会尝试执行反引号内的命令
grit apply `console.log($_)` file.js
```

**Q: 如何查看所有可用的 patterns？**

A: 使用 `grit list` 命令：

```bash
# 列出所有
grit list

# 按语言过滤
grit list --language js
grit list --language python
```

**Q: `--json` 和 `--jsonl` 有什么区别？**

A: `--json` 目前不被 `apply_pattern` 支持，使用 `--jsonl` 获取 JSON Lines 格式输出。

**Q: 如何限制修改数量？**

A: 使用 `--limit` 选项：

```bash
# 只修改前 10 处
grit apply --limit 10 no_console_log src/
```

**Q: 如何安全地进行大规模转换？**

A: 建议按以下步骤：
1. 先用 `--dry-run` 预览
2. 用 `--limit` 小范围测试
3. 用 `--interactive` 交互式确认
4. 确认无误后正式应用

---

## 总结

Grit 的核心价值在于：

1. **简单** - 用代码片段写规则，无需懂 AST
2. **安全** - 结构化匹配，不会误伤代码
3. **高效** - 秒级完成大规模代码迁移
4. **可维护** - 规则即文档，易于 review
5. **丰富** - 内置大量标准 patterns，开箱即用

下次遇到代码迁移任务，不妨试试 Grit，让繁琐的重构工作变得轻松高效。

---

## 参考资源

- [Grit 官网](https://grit.io/)
- [Grit 官方文档](https://docs.grit.io/)
- [Grit 标准 Patterns 库](https://github.com/biomejs/gritql-stdlib)
- [Grit GitHub](https://github.com/biomejs/gritql)
