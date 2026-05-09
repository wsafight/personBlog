---
title: TSRX：一份源码，编译到 React / Solid / Vue / Preact / Ripple
published: 2026-05-09
description: Ripple 作者 Dominic Gannaway 的新作 TSRX，把 if / for / try 变回语句，编译到主流前端框架
tags: [TypeScript, UI Framework, Frontend, JSX, Compiler]
category: 前端框架
draft: false
---

JSX 这十几年承载了海量的生产代码——如果让 `if` / `for` / `try` 回到它们本来的样子，代码会变成什么样？

> **TL;DR**
> - 一份 `.tsrx` 源码，编译到 React / Preact / Solid / Vue / Ripple
> - UI 从表达式变成语句：`if` / `for` / `try` 直接用
> - `&{ }` 统一响应式解构，条件 Hooks 由编译器处理
> - 目前 Alpha，可逐文件采用，影响半径可控

## 从 Ripple 到 TSRX

几个月前我写过 [Ripple](./ripplejs)——那个用 `track()` 和 `@` 让响应式变得极简的框架。

现在 Ripple 的作者 **Dominic Gannaway** 又推出了 [TSRX](https://tsrx.dev/)。

这次不是新框架，而是**语法扩展 + 多目标编译器**：一份 `.tsrx` 代码，编译到 **React、Preact、Solid、Vue、Ripple** 之一。

---

## JSX 的约束来自它那个时代

JSX 诞生于 2013 年，它做了一件影响深远的事：**把 UI 和逻辑放在一起写**，并让整个前端生态接受了这个理念。在那个 TypeScript 刚起步、Babel 还叫 6to5、AST 工具链远不成熟的年代，"复用 JavaScript 表达式语法"是把语法扩展快速推出去的最短路径。

今天工具链的前提变了。TypeScript、编译器、AST 处理都比 2013 年成熟得多，当年必须接受的几个约束，今天已经有条件换一种写法：

```jsx
function List({ items, loading }) {
  return (
    <div>
      {loading ? (
        <Spinner />
      ) : items.length > 0 ? (
        items.map(item => <Item key={item.id} {...item} />)
      ) : (
        <Empty />
      )}
    </div>
  )
}
```

问题在哪里？

- **三元嵌套读起来像谜语**——明明是 if/else，却要写成表达式
- **`.map()` 是个绕路**——明明是循环，却要写成"返回数组"
- **`key` 藏在属性里**——它不是元素属性，而是循环的语义
- **样式不是语言的一部分**——要靠 CSS Modules、Tailwind、CSS-in-JS 或框架约定

> 一句话：**JSX 只有"表达式槽"一种位置，所有控制流都得挤进去。**这是那个时代工具链下的合理取舍，今天有条件换一种做法。

### TSRX 的答案

TSRX 不是要取代 JSX，而是沿着它开创的方向继续走一步：

```tsrx
export component List({ items, loading }: Props) {
  <div>
    if (loading) {
      <Spinner />
    } else if (items.length > 0) {
      for (const item of items; key item.id) {
        <Item {...item} />
      }
    } else {
      <Empty />
    }
  </div>
}
```

**JSX 是表达式，TSRX 是语句。** `if`、`for`、`switch`、`try` 都是真正的 JavaScript 语句——编译器认识它们，IDE 认识它们，你的大脑也认识它们。

---

## 核心语法速览

### `component`：组件不再 return

TSRX 的组件用 `component` 声明，模板直接写在函数体里，**没有 `return`**：

```tsrx
export component Greeting({ name }: { name?: string }) {
  <div class="card">
    if (name) {
      <p>"Hello, "{name}</p>
    } else {
      <p>"Hello, stranger"</p>
    }
  </div>
  <style>
    .card { padding: 1rem; }
  </style>
}
```

> **两个容易踩的细节**
> - 静态文本要加双引号：`"Hello, "`——让编译器区分文本节点和表达式
> - `<style>` 自动加作用域哈希；要写全局选择器用 `:global(...)`

作用域样式还有一个边界：父组件的 scoped class **不会自动穿透到子组件**。需要传递时用 `{style 'className'}` 生成带哈希的 class 字符串，再通过普通 `class` prop 传下去。被传的 class 必须在父组件 `<style>` 里作为独立选择器出现。

TSRX 的元素默认是**语句**，不能像 JSX 一样随手赋值或 `return`。要把 UI 当成表达式，需显式放进 expression island：

```tsrx
const message = <tsrx>
  <strong>"Hello"</strong>
</tsrx>;
```

### `&{ }`：跨框架统一的响应式解构

React 和 Solid 对 props 解构的处理完全相反：

```jsx
// React：解构没问题
function Counter({ count, label }) { ... }

// Solid：解构会破坏响应式！必须写 props.count
function Counter(props) {
  return <p>{props.count}</p>
}
```

TSRX 用 `&{ }` 统一了这个差异：

```tsrx
component Counter(&{ count, label }: Props) {
  <section>
    <h2>{label}</h2>
    <p>"Count: "{count}</p>
  </section>
}
```

`&{ }` 编译成**对源对象的延迟属性访问**：

| 目标   | 编译结果                       |
| ------ | ------------------------------ |
| React  | 普通属性读取                   |
| Solid  | 保留 signal 的 per-access 响应式 |
| Vue    | 保留 proxy 的响应式            |
| Ripple | 等价于 `.value` 读取           |

**同一份源码，各自编译到合适的形态。**

### 条件 Hooks：编译器来排序

React 有个人尽皆知的规则：**Hooks 不能写在条件分支里**。更隐蔽的是"早退 + 后置 Hook"：

```jsx
function Profile({ user }) {
  if (!user) return null;        // 看起来很合理的 guard
  const data = useUser(user.id); // ❌ 其实这是 bug
  return <h1>{data.name}</h1>
}
```

> **为什么是 bug？**
> `user = null` 时组件直接返回，`useUser` 从未调用；`user` 变有值时 `useUser` 第一次调用。Hook 调用顺序前后不一致，状态切换那一刻就会崩溃。

ESLint 能把这种写法标出来，但你写的明明是很自然的控制流。TSRX 让你就这么写：

```tsrx
component Profile({ userId }: { userId: string | null }) {
  if (userId) {
    const user = useUser(userId);
    <h1>{user.name}</h1>
  } else {
    <a href="/login">"Sign in"</a>
  }
}
```

> **编译器会把 Hook 调用提升到生成函数顶部；循环里的 Hook 则按项拆到子组件渲染。**

你在 TSRX 里可以把 Hook 写在更接近业务语义的位置，编译器负责把它变成目标框架能接受的调用顺序。加上 TSRX 规定 guard 用 `return;` 而不是 `return <JSX />`，早退也变成一目了然的语法结构。

这是"语言层"解决"框架层"问题的典型例子——不是告诉你"别这么写"，而是让你"就这么写也没事"。

> ⚠️ **代价**：编译器可能生成额外的组件边界或重排代码，调试栈、组件名、状态保留和 `key` 稳定性都要依赖编译器处理得足够好。

### 模板里直接声明局部变量

JSX 里想在模板中间声明变量？你得拆出函数或用 IIFE。TSRX 直接让你在模板里声明：

```tsrx
component Cart({ items }: { items: Item[] }) {
  <div>
    const subtotal = items.reduce((sum, i) => sum + i.price, 0);
    const discount = subtotal > 100 ? 0.1 : 0;
    const total = subtotal * (1 - discount);

    <p>"Subtotal: "{subtotal}</p>
    if (discount > 0) {
      <p>"Discount: "{discount * 100}"%"</p>
    }
    <strong>"Total: "{total}</strong>
  </div>
}
```

变量作用域就是它所在的块——读起来就像普通的 JavaScript。

### `for` 循环：`index`、`key`、`continue`

`for...of` 支持 `index` 和 `key` 子句，还能用 `continue`：

```tsrx
component TodoList({ todos }: { todos: Todo[] }) {
  <ul>
    for (const todo of todos; index i; key todo.id) {
      if (todo.hidden) continue;
      <li>
        <span>{i + 1}". "</span>
        <span>{todo.text}</span>
      </li>
    }
  </ul>
}
```

对比 JSX 的 `.map((todo, i) => todo.hidden ? null : ...)`——TSRX 直白太多。

> ⚠️ **边界**：`for...of` 里可以 `continue`，但不能用顶层 `break` 或 `return`；普通 `for` / `while` 不是渲染语法。命令式循环请放进内部函数里写普通 TypeScript。

### `try / pending / catch`：异步边界语法化

Suspense 和 Error Boundary 本来是两个 API，TSRX 把它们合并成一个语言结构——更准确地说是**异步子树边界**：

```tsrx
import { lazy } from "@tsrx/core";

const Profile = lazy(() => import("./Profile"));

component UserPage({ id }: { id: string }) {
  try {
    <Profile id={id} />
  } pending {
    <Spinner />
  } catch (err) {
    <ErrorView message={err.message} />
  }
}
```

一眼就懂：正常走 `try`，加载中走 `pending`，出错走 `catch`。

> ⚠️ **跨目标差异**：React / Preact 支持组件体顶层 `await`，但 Solid / Ripple 不允许，直接写会编译报错。写跨目标代码时要收敛到更可移植的模式。

### Guard 退出只写 `return;`

因为模板不是表达式，guard clause 直接写 `return;`——**永远不要写 `return <JSX />`**：

```tsrx
component MaybeRender({ show }: { show: boolean }) {
  if (!show) return;
  <div>"I'm visible"</div>
}
```

### 一张表总览与 JSX 的差异

| 维度         | JSX                     | TSRX                                       |
| ------------ | ----------------------- | ------------------------------------------ |
| UI 单元      | 表达式                  | **语句**                                   |
| 控制流       | 三元 / `.map()`         | **原生 `if` / `for` / `switch`**           |
| 静态文本     | 裸写                    | **双引号**                                 |
| 样式         | 交给生态方案处理        | **内联 `<style>` + 作用域哈希**            |
| 异步处理     | `<Suspense>` 组件       | **`try / pending / catch` 语法**           |
| 响应式解构   | 框架各异                | **`&{ }` 统一抽象**                        |
| 条件 Hooks   | 必须遵守固定调用顺序    | **编译器提升到顶部 / 循环里按项拆子组件**  |
| 局部变量     | 需要 IIFE / 子函数      | **模板内直接声明**                         |
| 编译目标     | 各 JSX runtime 自己定义 | **统一源语言 + 多目标编译器**              |

---

## 现在能用吗

TSRX 官网明确标注 **Alpha**。API 可能变，边缘场景可能出问题，Source Map、SSR / hydration、跨目标语义映射都可能踩坑。

> **但它不是"新框架的 Alpha"。**
> Ripple 那种 Alpha 是编译器、响应式系统、渲染器一起上；TSRX 的产物是普通的 React / Solid / Vue 组件，渲染和状态语义由目标框架承接。

所以 TSRX 的**影响半径**相对可控：新文件或非核心页面里用，其他地方继续写 JSX / TSX；遇到问题可以局部回退，而不是押上整个项目。

核心工具链也已齐全：LSP、Prettier、ESLint 插件都有，Vite / Rspack / Turbopack / Bun 也有对应插件。还不适合全仓迁移，但已经值得在副项目或低风险模块里认真评估。

---

## 编译架构

> 以下包名和插件支持范围基于当前 Alpha 阶段文档，后续可能变化。

TSRX 的包结构很清晰：

```
@tsrx/core       ← 解析器 + AST
@tsrx/react      ← React 代码生成
@tsrx/solid      ← Solid 代码生成
@tsrx/vue        ← Vue 代码生成
@tsrx/preact     ← Preact 代码生成
@tsrx/ripple     ← Ripple 代码生成
```

最小上手（React + Vite）：

```bash
npm install @tsrx/react
npm install -D @tsrx/vite-plugin-react
```

其他编译目标把 `react` 换成 `preact` / `solid` / `vue` 即可（Vue 还要装 `vue` 和 `vue-jsx-vapor`）。Rspack / Bun 的插件名遵循 `@tsrx/rspack-plugin-*` / `@tsrx/bun-plugin-*` 模式。

**Bundler 支持按编译目标看**：Vite / Rspack 覆盖 React、Preact、Solid、Vue；Bun 覆盖 React、Preact、Vue；Turbopack 目前主要是 React helper；Ripple 通过自己的 Vite 插件内置 TSRX 支持。

**同一份 `.tsrx`，不同编译目标产出不同结果：**

| 目标    | 特性                                                    |
| ------- | ------------------------------------------------------- |
| React   | Hook 调用会被重排以满足 Rules of Hooks；支持组件体顶层 `await` |
| Preact  | 类似 React，异步边界走 Preact 的 Suspense 兼容层        |
| Solid   | 输出 Solid JSX / 控制流形态；组件体保持同步，不支持 inline `await` |
| Vue     | 输出 Vue 风格的 TSX，再交给 `vue-jsx-vapor` 做后续转换 |
| Ripple  | 和 Ripple 运行时集成最深；组件体同样保持同步             |

差异是真实存在的——`{html ...}` 在 React、Preact、Solid 编译目标下就是编译期错误；异步边界也要依赖目标框架自己的 lazy / resource 能力。TSRX 能把一部分边界前移到编译期，但它不抹平所有框架差异。

---

## 不是银弹

"一份源码编译到多个目标"很诱人，但**真正可移植的是 TSRX 和各编译目标的交集**。事件模型、`ref`、`children`、raw HTML、异步边界、样式穿透、SSR / hydration，都可能把你拉回具体框架。

更现实的采用方式不是全仓迁移，而是：

1. **先在新组件或非核心页面试用**——看编译输出、Source Map、调试体验是否可接受
2. **跨目标只写可移植子集**——少碰 raw HTML、框架专属 ref、复杂异步边界
3. **库作者要保留目标测试矩阵**——不能因为源码只有一份，就以为行为自动一致

> TSRX 的价值不在于消灭框架差异，而在于把 UI 语言里最反复出现的样板控制流抽出来，让不同框架共享更接近的书写体验。

## 和 Ripple 是什么关系

- **Ripple 是一个框架**——有自己的运行时、响应式系统、渲染器
- **TSRX 是一个语法扩展 + 编译器**——编译到别人家的框架，包括 Ripple

Dominic 做 Ripple 是在问："响应式框架还可以怎么做？"
做 TSRX 是在问："JSX 这条路还可以怎么走？"

两个问题正交。你可以用 TSRX 写 React 享受更好的语法；也可以用 TSRX 写 Ripple，同时享受更好的语法和更好的运行时。

这种"**语言层 vs 框架层**"的分离，让生态演进有了新的路径——你不需要推翻 React 来改善 React 的开发体验。

---

## 谁该关心 TSRX

- **写 React 的人**：TSRX 给你更好的控制流和样式方案，还解决了条件 Hooks 这个老大难
- **写 Solid 的人**：`&{ }` 让你摆脱 `props.xxx` 的束缚，其他语法也更直观
- **做库的人**：可以用同一份源码生成多个目标，但仍要维护目标测试矩阵
- **思考前端未来的人**：TSRX 是一次大胆的尝试——把"框架无关的 UI 语言"这件事真正做出来

## 写在最后

JSX 定义了一代前端开发者的思维方式。TSRX 想问的是下一个问题：**在它铺好的路上，换一套更成熟的工具链，还能往前走几步？**

多目标编译只是手段，真正有意思的是让 `if` 回到 `if`、`for` 回到 `for`——不是否定三元和 `.map()`，而是在语言和编译器条件都变了之后，去掉那些曾经不得不接受的约束。

如果你对 JSX 的表达式限制、条件 Hooks 或跨框架组件源码感到疲惫，TSRX 已经值得在副项目或非核心模块里试一次。

---

*TSRX — 沿着 JSX 再往前一步*

[官网](https://tsrx.dev/) · [llms.txt](https://tsrx.dev/llms.txt)
