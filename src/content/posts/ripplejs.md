---
title: Ripple：一个现代的响应式 UI 框架
published: 2026-01-09
description: 深入解析 Ripple.js 的设计原理、核心特性，以及与 React、Svelte、Solid 的对比分析
tags: [TypeScript, UI Framework, Frontend, Reactive]
category: Frontend
draft: false
---

> 用最直观的语法，构建最高效的 Web 应用

## AI 时代，更需要精品框架

2026 年，AI 编程已经成为常态。Cursor、Claude、Copilot……开发者每天都在用 AI 生成大量代码。

但这带来了一个新问题：**代码量爆炸，质量却在下降。**

AI 可以快速生成代码，但它生成的往往是"能跑就行"的代码——冗余的状态管理、不必要的重渲染、臃肿的依赖。当项目规模增长，这些问题会被放大。

**AI 时代不缺代码，缺的是精品框架**——能够约束代码质量、保证性能、减少出错的框架。

### 现有框架的问题

```javascript
// React: 样板代码太多
function Counter() {
  const [count, setCount] = useState(0)
  const increment = useCallback(() => {
    setCount(prev => prev + 1)
  }, [])
  return <button onClick={increment}>{count}</button>
}

// Vue: 需要记住 .value
const count = ref(0)
count.value++  // 忘记 .value 就出错

// 这些"仪式感"代码，AI 可能写对，也可能写错
// 更重要的是：它们让代码变得臃肿
```

### Ripple 的答案：少即是多

```javascript
component Counter() {
  let count = track(0);
  <button onClick={() => @count++}>{@count}</button>
}
```

**4 行代码，零样板。**

- 没有 `useState` / `ref` / `signal`
- 没有 `useCallback` / `useMemo`
- 没有 `.value` / `$:`
- 编译器自动优化，运行时极致精简

| 指标 | React | Vue | Ripple |
|------|-------|-----|--------|
| 计数器代码行数 | 6-8 行 | 4-5 行 | **3 行** |
| 运行时大小 | ~40KB | ~30KB | **~5KB** |
| 更新粒度 | 组件级 | 组件级 | **节点级** |

### 为什么这在 AI 时代更重要？

1. **代码审查成本**：AI 生成的代码需要人工审查，越简洁越好审
2. **错误概率**：语法越简单，AI（和人）出错的机会越少
3. **性能兜底**：即使 AI 不考虑性能，编译器会帮你优化
4. **可维护性**：三个月后回看代码，还能一眼看懂

Ripple 的设计哲学：**代码应该读起来像它做的事情。**

---

## 为什么选择 Ripple？

Ripple 追求**两全其美**——既要 React 的组件模型和 JSX 表达力，又要 Svelte 的编译时优化和极致性能。

看看这段代码：

```javascript
component Counter() {
  let count = track(0);

  <button onClick={() => @count++}>
    {"点击了 "}{@count}{" 次"}
  </button>
}
```

这就是 Ripple。没有 `useState`，没有 `$:`，没有 `.value`。`track()` 创建状态，`@` 读写值，简洁直观。

## 核心理念

### 1. 编译器优先

Ripple 不是一个运行时框架，而是一个**编译器**。你写的代码会被转换成高效的 JavaScript：

```
你写的代码                         编译后的代码
─────────────                     ─────────────
let count = track(0)    →        var count = _$_.tracked(0)
{@count}                →        _$_.get(count)
@count++                →        _$_.update(count)
```

这意味着：
- **零运行时开销**：响应式追踪在编译时完成
- **更小的包体积**：没有虚拟 DOM diff 算法
- **更快的更新**：直接操作需要更新的 DOM 节点

### 2. 组件即函数

在 Ripple 中，组件就是带有 `component` 关键字的函数：

```javascript
component Greeting({ name = "World" }) {
  <h1>{"Hello, "}{name}{"!"}</h1>
}

// 使用
<Greeting name="Ripple" />
```

### 3. 响应式状态：`track()` 和 `@` 语法

用 `track()` 创建响应式变量，用 `@` 读写值：

```javascript
component Form() {
  let name = track("");
  let email = track("");

  <form>
    <input value={@name} onInput={(e) => @name = e.target.value} />
    <input value={@email} onInput={(e) => @email = e.target.value} />
    <p>{"你好，"}{@name}{"！我们会发邮件到 "}{@email}</p>
  </form>
}
```

### 4. 响应式集合：`#[]` 和 `#{}`

数组和对象也可以是响应式的：

```javascript
const items = #[];                          // 响应式数组
const user = #{ name: "Tom" };              // 响应式对象
const tags = new TrackedSet(["a", "b"]);    // 响应式 Set
const cache = new TrackedMap([["k", "v"]]); // 响应式 Map
```

对这些集合的任何修改都会自动触发 UI 更新：

```javascript
items.push("new item");   // UI 自动更新
user.name = "Jerry";      // UI 自动更新
```

---

## 实战：构建一个 Todo 应用

让我们用 Ripple 构建一个完整的 Todo 应用，体验框架的核心特性。

### 完整代码

```javascript
import { track } from 'ripple';

component TodoInput({ onAdd }) {
  let value = track("");

  function handleKeyDown(e) {
    if (e.key === "Enter" && @value.trim()) {
      onAdd(@value.trim());
      @value = "";
    }
  }

  <div class="input-section">
    <input
      type="text"
      placeholder="Add a new todo..."
      value={@value}
      onInput={(e) => @value = e.target.value}
      onKeyDown={handleKeyDown}
    />
    <button onClick={() => { if (@value.trim()) { onAdd(@value.trim()); @value = ""; } }}>{"Add"}</button>
  </div>
}

component TodoItem({ todo, onToggle, onDelete }) {
  <li>
    <input type="checkbox" checked={todo.completed} onChange={onToggle} />
    <span class={todo.completed ? "done" : ""}>{todo.text}</span>
    <button onClick={onDelete}>{"×"}</button>
  </li>
}

export component App() {
  const todos = #[];

  function addTodo(text) {
    todos.push(#{ id: Date.now(), text, completed: false });
  }

  function toggleTodo(todo) {
    todo.completed = !todo.completed;
  }

  function deleteTodo(id) {
    const index = todos.findIndex(t => t.id === id);
    if (index > -1) todos.splice(index, 1);
  }

  const activeCount = () => todos.filter(t => !t.completed).length;

  <div class="app">
    <h1>{"Todo App"}</h1>

    <TodoInput onAdd={addTodo} />

    <ul>
      for (const todo of todos) {
        <TodoItem
          todo={todo}
          onToggle={() => toggleTodo(todo)}
          onDelete={() => deleteTodo(todo.id)}
        />
      }
    </ul>

    <p>{todos.length}{" total, "}{activeCount()}{" remaining"}</p>
  </div>

  <style>
    .app { max-width: 400px; margin: 40px auto; font-family: system-ui; }
    h1 { color: #e91e63; }
    .input-section { display: flex; gap: 8px; margin-bottom: 16px; }
    .input-section input { flex: 1; padding: 8px; }
    ul { list-style: none; padding: 0; }
    li { display: flex; gap: 8px; align-items: center; padding: 8px 0; }
    li span { flex: 1; }
    li span.done { text-decoration: line-through; color: #888; }
    p { color: #666; font-size: 14px; }
  </style>
}
```

### 代码解析

#### 1. 响应式数组 `#[]`

```javascript
const todos = #[];
```

`#[]` 创建一个响应式数组。当你调用 `push`、`splice`、`filter` 等方法时，Ripple 会自动追踪变化并更新 UI。

#### 2. 响应式对象 `#{}`

```javascript
todos.push(#{ id: Date.now(), text, completed: false });
```

每个 todo 项也是响应式对象，这样 `todo.completed = !todo.completed` 就能触发更新。

#### 3. 控制流：内联 `for` 和 `if`

```javascript
for (const todo of todos) {
  <TodoItem todo={todo} ... />
}

if (todos.some(t => t.completed)) {
  <button>{"清除已完成"}</button>
}
```

Ripple 的控制流直接写在 JSX 中，不需要 `map` 或三元表达式。编译器会将其转换为高效的 block 结构。

#### 4. 作用域样式

```javascript
<style>
  .todo-item { ... }
</style>
```

组件内的 `<style>` 标签会被自动添加作用域哈希，不会污染全局样式。

---

## 编译产物一览

好奇 Ripple 编译器做了什么？来看看 `@count++` 这行代码的旅程：

```
源码                     编译阶段               运行时
────                     ────────               ──────

let count = track(0)  →  解析为 AST     →    var count = _$_.tracked(0)
                         (TrackedExpression)

@count++              →  分析绑定类型    →    _$_.update(count)
                         (kind: 'tracked')

{@count}              →  转换为渲染函数  →    _$_.render(() => {
                                               _$_.set_text(anchor, _$_.get(count))
                                             })
```

**三阶段编译流程：**

1. **解析 (Parse)**：将源码转为 AST，识别 `@`、`#[]`、`component` 等特殊语法
2. **分析 (Analyze)**：构建作用域、标记变量类型、裁剪未使用的 CSS
3. **转换 (Transform)**：生成客户端/服务端 JavaScript 代码

---

## 与其他框架对比

| 特性 | Ripple | React | Vue 3 | Svelte |
|------|--------|-------|-------|--------|
| 响应式语法 | `track()` + `@` | `useState` | `ref().value` | `$:` |
| 虚拟 DOM | 无 | 有 | 有 | 无 |
| 编译时优化 | 是 | 否 | 部分 | 是 |
| 包体积 | ~5KB | ~40KB | ~30KB | ~2KB |
| 学习曲线 | 低 | 中 | 中 | 低 |
| 控制流 | 内联语法 | map/三元 | v-if/v-for | {#if}/{#each} |
| 样板代码 | **极少** | 多 | 中 | 少 |

---

## 编译器：质量的守护者

Ripple 的编译器不只是"翻译"代码，它是代码质量的守护者：

### 1. 自动依赖追踪

```javascript
// 你只需要写业务逻辑
const fullName = () => `${@firstName} ${@lastName}`

// 编译器自动分析依赖，生成优化代码：
// _$_.render(() => set_text(anchor, `${get(firstName)} ${get(lastName)}`))
```

不需要 `useMemo([dep1, dep2])`，编译器比你更清楚依赖关系。

### 2. CSS 死代码消除

```javascript
component Button() {
  <button class="primary">{"Click"}</button>

  <style>
    .primary { background: blue; }
    .secondary { background: gray; }  /* 编译器自动移除 */
    .danger { background: red; }      /* 编译器自动移除 */
  </style>
}
```

不用担心 CSS 越写越多，编译器只保留真正用到的样式。

### 3. 细粒度更新

```javascript
component Profile() {
  const user = #{ name: "Tom", bio: "Developer" };

  <div>
    <h1>{user.name}</h1>      {/* 只在 name 变化时更新 */}
    <p>{user.bio}</p>         {/* 只在 bio 变化时更新 */}
  </div>
}
```

编译器分析每个表达式的依赖，生成最精确的更新逻辑。

---

## 让 AI 更懂 Ripple

Ripple 提供了 [llms.txt](https://www.ripplejs.com/llms.txt)，这是一份专为 AI 助手设计的框架说明文档。

当你使用 Claude、ChatGPT 或其他 AI 助手时，可以让它先阅读这份文档：

```
请先阅读 https://www.ripplejs.com/llms.txt，然后帮我用 Ripple 框架实现一个 [功能描述]
```

llms.txt 包含：
- Ripple 核心语法速查
- 常见模式和最佳实践
- 易错点和正确写法
- 完整示例代码

这确保 AI 生成的代码符合 Ripple 的设计理念，而不是用 React 的思维写 Ripple。

---

## 快速开始

```bash
# 创建新项目
npx create-ripple-app my-app
cd my-app

# 启动开发服务器
npm run dev
```

然后打开 `src/App.ripple`，开始编写你的第一个 Ripple 组件！

---

## 写在最后

AI 让写代码变得更快了，但"更快"不等于"更好"。

当代码生成的速度超过理解的速度，我们更需要：
- **精简的语法** — 让代码量回归理性
- **编译时优化** — 让性能有保障
- **直观的心智模型** — 让维护不再痛苦

Ripple 不是为了追逐新概念而生，而是对"前端开发应该是什么样"的一次回答。

**少写代码，写好代码。**

---

*Ripple — 让响应式回归简单*

[GitHub](https://github.com/anthropics/ripple) · [文档](https://www.ripplejs.com) · [llms.txt](https://www.ripplejs.com/llms.txt)
