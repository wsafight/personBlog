---
title: TSRX：JSX 的精神继承者，一份源码编译到多套框架
published: 2026-05-09
description: 深入解析 TSRX —— Ripple 作者 Dominic Gannaway 的新作，一个编译到 React、Preact、Solid、Vue、Ripple 的 TypeScript 语法扩展
tags: [TypeScript, UI Framework, Frontend, JSX, Compiler]
category: 前端框架
draft: false
---

> 如果 JSX 今天重新设计，它会是什么样？

> **TL;DR**：TSRX 是一份 `.tsrx` 源码可以编译到 React / Preact / Solid / Vue / Ripple 的语法扩展。核心创新是把 UI 从表达式变成语句（`if` / `for` / `try` 直接用）、`&{ }` 统一响应式解构、条件 Hooks 由编译器处理。目前 Alpha，但可以逐文件采用，blast radius 可控。

## 从 Ripple 到 TSRX

几个月前，我写过一篇关于 [Ripple](./ripplejs) 的博客——那个用 `track()` 和 `@` 语法让响应式变得极简的框架。

现在，Ripple 的作者 **Dominic Gannaway** 又推出了新东西：[TSRX](https://tsrx.dev/)。

但这次不是一个新框架。**TSRX 是一个语法扩展 + 多目标编译器。**

一份 `.tsrx` 代码，可以编译到 **React、Preact、Solid、Vue、Ripple** 这些目标之一。

---

## 先回答最关心的问题：现在能用吗？

TSRX 官网明确标注 **Alpha**。我知道你看到 Alpha 标签可能就想关页面了，但先别急——它和"新框架的 Alpha"不是一回事。

**Ripple 那种 Alpha**：自己的编译器、自己的响应式系统、自己的渲染器。运行时任何 bug 都得等作者修，你绕不过去。风险集中，退路有限。

**TSRX 这种 Alpha 不一样**：

1. **编译目标是成熟框架** —— 产物是普通的 React、Solid、Vue 等组件，渲染和状态语义仍由目标框架承接
2. **核心工具链已经出现** —— LSP、Prettier、ESLint 插件都有，Vite / Rspack / Turbopack / Bun 也有若干 target 插件
3. **可以逐文件采用** —— 真遇到编译器或插件问题，可以把局部文件退回 TSX / JSX，而不是一次性押上整个项目

所以 TSRX 的 **blast radius 比 Ripple 小得多**。它更像一个可以渐进采用的语法层工具——你可以只在新文件里用，其他文件继续写 JSX。

当然，Alpha 就是 Alpha：API 可能变，边缘 case 可能炸，source map、SSR / hydration、不同 target 的语义映射也都可能踩坑。但如果你愿意在副项目或者非核心模块里试水，TSRX 已经值得认真评估。

现在，我们来看看它凭什么值得你试。

---

## JSX 的遗憾

JSX 诞生于 2013 年。它解决了一个重要问题：**让 UI 和逻辑写在一起**。

但十几年过去，JSX 的几个设计约束越来越显眼：

```jsx
// 控制流必须挤进表达式槽
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

这段代码有什么问题？

1. **三元嵌套读起来像谜语** —— 看完要在脑中还原成 if/else
2. **`.map()` 是个绕路** —— 明明是循环，却要写成"返回数组"的形式
3. **`key` 属性藏在属性里** —— 它不是元素的属性，而是循环的语义
4. **样式不是语言的一部分** —— JSX 本身不提供作用域，通常要交给 CSS Modules、Tailwind、CSS-in-JS 或框架约定

JSX 把"UI 是 JS 表达式"这个设计推到极致，代价就是：所有控制流都要**挤进表达式槽**。

### TSRX 的答案

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

**JSX 是表达式，TSRX 是语句。**

`if`、`for`、`switch`、`try` 都是真正的 JavaScript 语句——编译器认识它们，IDE 认识它们，你的大脑也认识它们。

---

## 核心语法速览

### 1. `component` 关键字

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

注意两个细节：
- **静态文本要加双引号**：`"Hello, "` —— 这让编译器能区分文本节点和表达式
- **`<style>` 是组件的一部分** —— 自动加作用域哈希；如果确实要写全局选择器，可以用 `:global(...)`

作用域样式还有一个容易忽略的边界：父组件的 scoped class 不会自动穿透到子组件。需要把某个 scoped class 传给子组件时，用 `{style 'className'}` 生成带作用域哈希的 class 字符串，再通过普通 `class` / `className` prop 传下去。注意被传的 class 必须在父组件 `<style>` 里作为独立选择器出现，否则作用域哈希对不上。

还有一个关键边界：TSRX 的元素默认是**语句**，不能像 JSX 一样随手赋值或 `return`。如果你确实需要把一段 UI 当成表达式，可以显式放进 expression island：

```tsrx
const message = <tsrx>
  <strong>"Hello"</strong>
</tsrx>;
```

### 2. `&{ }` 响应式解构

这是 TSRX 最巧妙的设计之一。React 和 Solid 对 props 解构的处理完全相反：

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

`&{ }` 会被编译成**对源对象的延迟属性访问**——React 下就是普通属性读取，Solid 里保留 signal 的 per-access 响应式，Vue 里保留 proxy 的响应式，Ripple 里等价于 `.value` 读取。**同一份源码，各自编译到合适的形态。**

### 3. 条件 Hooks？编译器帮你搞定

React 有个人尽皆知的规则：**Hooks 不能写在条件分支里**。但这个坑有个更隐蔽的变种——**早退 + 后置 Hook**：

```jsx
function Profile({ user }) {
  if (!user) return null;           // 看起来很合理的 guard

  // ... 一堆渲染准备逻辑、className 拼接、事件处理函数 ...

  const data = useUser(user.id);    // ❌ 其实这是 bug
  return <h1>{data.name}</h1>
}
```

这段代码初看没毛病，guard clause 在前端代码里随处可见。但它有个要命的问题：

- `user = null` 时，组件直接返回 null，`useUser` **从未被调用**
- `user` 变成有值时，`useUser` **第一次被调用**
- React 记录的 Hook 调用顺序前后不一致 → 运行时崩溃，报 `Rendered more hooks than during the previous render`

更糟的是，这个 bug 只在**状态切换的那一刻**暴露——本地测试可能一直都是 `user` 有值，永远发现不了。

ESLint 的 `react-hooks/rules-of-hooks` 会把这种“早退后再调用 Hook”的写法标出来。问题不在于工具完全抓不到，而在于你明明写的是很自然的控制流，却要被 React 的 Hook 调用顺序约束打断。

TSRX 的做法很有意思。同样的场景，你直接这么写：

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

**编译器会把所有 Hook 调用提升到生成函数顶部；对循环里的 Hook，则按项拆到子组件里渲染**。你在 TSRX 里可以把 Hook 写在更接近业务语义的位置，编译器负责把它变成目标框架能接受的调用顺序。

加上 TSRX 规定 guard 用 `return;` 而不是 `return <JSX />`，早退这种模式也变成一目了然的语法结构，不会混在 JSX 里形成隐蔽的 bug。

这是"语言层"解决"框架层"问题的典型例子——不是告诉你"别这么写"，而是让你"就这么写也没事"。代价是编译器可能生成额外的组件边界或重排代码，调试栈、组件名、状态保留和 `key` 稳定性都要依赖编译器处理得足够好。

### 4. 模板内的局部变量

在 JSX 里，想在模板中间声明一个变量？你得拆出一个函数，或者用 IIFE。

TSRX 直接让你在模板里声明变量：

```tsrx
component Cart({ items }: { items: Item[] }) {
  <div>
    const subtotal = items.reduce((sum, i) => sum + i.price, 0);
    const discount = subtotal > 100 ? 0.1 : 0;
    const total = subtotal * (1 - discount);

    <p>"Subtotal: $"{subtotal}</p>
    if (discount > 0) {
      <p>"Discount: "{discount * 100}"%"</p>
    }
    <strong>"Total: $"{total}</strong>
  </div>
}
```

变量的作用域就是它所在的块——读起来就像普通的 JavaScript。

### 5. `for` 循环的渲染控制

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

对比 JSX 里的 `.map((todo, i) => todo.hidden ? null : ...)`——TSRX 的版本直白太多。

这里的“渲染控制”也有边界：在模板渲染的 `for...of` 里可以 `continue`，但不能用顶层 `break` 或 `return`；普通 `for`、`while` 也不是渲染语法。需要命令式循环时，放进内部函数里写普通 TypeScript。

### 6. 异步边界：`try / pending / catch`

Suspense 和 Error Boundary 本来是两个 API，TSRX 把它们合并成一个语言结构。更推荐把它理解成“异步子树边界”，而不是任意框架里都能随手写 inline `await`：

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

一眼就懂：正常走 `try`，加载中走 `pending`，出错走 `catch`。React / Preact target 可以支持组件体顶层 `await`，但 Solid / Ripple 这类目标不允许组件体里直接 `await`——直接写会编译报错，所以写跨 target 代码时要收敛到更可移植的模式。

### 7. Guard 退出用 `return;`

因为模板不是表达式，guard clause 直接写 `return;`——**永远不要写 `return <JSX />`**：

```tsrx
component MaybeRender({ show }: { show: boolean }) {
  if (!show) return;
  <div>"I'm visible"</div>
}
```

---

## 编译架构

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

其他 target 把 `react` 换成 `preact` / `solid` / `vue` 即可（Vue 还要额外装 `vue` 和 `vue-jsx-vapor`）。Rspack / Bun 的插件名遵循 `@tsrx/rspack-plugin-*` / `@tsrx/bun-plugin-*` 的模式。

Bundler 支持也要按 target 看。官方文档里，Vite / Rspack 覆盖 React、Preact、Solid、Vue；Bun 覆盖 React、Preact、Vue；Turbopack 目前主要是 React helper；Ripple 则通过自己的 Vite 插件内置 TSRX 支持。

**同一份 `.tsrx`，不同 target 产出不同结果：**

| 目标    | 特性                                                    |
| ------- | ------------------------------------------------------- |
| React   | Hook 调用会被重排以满足 Rules of Hooks；支持组件体顶层 `await` |
| Preact  | 类似 React，异步边界默认走 Preact 的 Suspense 兼容层    |
| Solid   | 输出 Solid JSX / 控制流形态；组件体保持同步，不支持 inline `await` |
| Vue     | 输出 Vue 风格的 TSX，再交给 `vue-jsx-vapor` 做后续转换 |
| Ripple  | 和 Ripple 运行时集成最深；组件体同样保持同步             |

差异是真实存在的——比如 `{html ...}` 在 React、Preact、Solid target 下就是编译期错误；异步边界也要依赖目标框架自己的 lazy / resource 能力。TSRX 能把一部分边界前移到编译期，但它不是把所有框架差异都抹平。

---

## 它不是银弹

“一份源码编译到多个目标”很诱人，但真正可移植的是 TSRX 和各 target 的**交集**。事件模型、`ref`、`children`、raw HTML、异步边界、样式穿透、SSR / hydration，都可能把你拉回具体框架。

所以更现实的采用方式不是全仓迁移，而是：

1. **先在新组件或非核心页面试用** —— 看编译输出、source map、调试体验是否能接受
2. **跨 target 只写可移植子集** —— 少碰 raw HTML、框架专属 ref、复杂异步边界
3. **库作者要保留 target 测试矩阵** —— 不能因为源码只有一份，就以为行为自动一致

TSRX 的价值不在于消灭框架差异，而在于把 UI 语言里最反复出现的样板控制流抽出来，让不同框架共享更接近的书写体验。

---

## 它和 Ripple 是什么关系？

这是我觉得最有意思的部分。

**Ripple 是一个框架**——有自己的运行时、响应式系统、渲染器。
**TSRX 是一个语法扩展 + 编译器**——它编译到别人家的框架，包括 Ripple。

Dominic 做 Ripple 是在问："如果响应式框架从头设计，应该是什么样？"
做 TSRX 是在问："如果 JSX 从头设计，应该是什么样？"

两个问题是正交的。你可以用 TSRX 写 React，享受更好的语法；也可以用 TSRX 写 Ripple，同时享受更好的语法和更好的运行时。

这种"**语言层 vs 框架层**"的分离，让生态演进有了新的路径——你不需要推翻 React 来改善 React 的开发体验。

---

## 和 JSX 的关键差异

| 维度         | JSX                  | TSRX                                 |
| ------------ | -------------------- | ------------------------------------ |
| UI 单元      | 表达式               | **语句**                             |
| 控制流       | 三元 / `.map()`      | **原生 `if` / `for` / `switch`**     |
| 静态文本     | 裸写                 | **双引号**                           |
| 样式         | 交给生态方案处理     | **内联 `<style>` + 作用域哈希**       |
| 异步处理     | `<Suspense>` 组件    | **`try / pending / catch` 语法**     |
| 响应式解构   | 框架各异             | **`&{ }` 统一抽象**                  |
| 条件 Hooks   | 必须遵守固定调用顺序 | **编译器提升到顶部 / 循环里按项拆子组件** |
| 局部变量     | 需要 IIFE / 子函数   | **模板内直接声明**                   |
| 编译目标     | 各 JSX runtime 自己定义 | **统一源语言 + 多 target 编译器** |

---

## 谁应该关心 TSRX？

**如果你在写 React**：TSRX 给你更好的控制流和样式方案，而且解决了条件 Hooks 这个老大难。

**如果你在写 Solid**：`&{ }` 让你摆脱 `props.xxx` 的束缚，其他语法也更直观。

**如果你在做库**：可以用同一份源码生成多个目标，但仍然要维护 target 测试矩阵，确认事件、ref、children、样式和异步行为一致。

**如果你在思考前端的未来**：TSRX 是一次大胆的尝试——把"框架无关的 UI 语言"这件事真正做出来。

---

## 写在最后

JSX 定义了一代前端开发者的思维方式，TSRX 想问的是：这些东西本来就可以更好吗？

多目标编译只是手段，真正重要的是把 UI 代码写回它本该有的样子——`if` 就是 `if`，`for` 就是 `for`，不需要三元和 `.map()` 来伪装。

现在就可以装 `@tsrx/core` 试，然后告诉我你的感受。

---

*TSRX — 如果 JSX 今天重新设计*

[官网](https://tsrx.dev/) · [llms.txt](https://tsrx.dev/llms.txt)
