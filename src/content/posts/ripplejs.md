---
title: Ripple.js - 优雅的 TypeScript UI 框架
published: 2026-01-09
description: 深入解析 Ripple.js 的设计原理、核心特性，以及与 React、Svelte、Solid 的对比分析
tags: [TypeScript, UI Framework, Frontend, Reactive]
category: Frontend
draft: false
---

## 简介

[Ripple](https://www.ripplejs.com/) 是一个优雅的、编译器驱动的 TypeScript UI 框架，由 Dominic Gannaway ([@trueadm](https://github.com/trueadm)) 创建。Dominic 是前端领域的资深专家，曾参与 Inferno、React Hooks、Lexical 以及 Svelte 5 的开发。

Ripple 结合了 React、Solid 和 Svelte 的优点，提供了一种基于 JSX 超集的全新开发体验。它使用独特的 `.ripple` 文件扩展名，原生支持 TypeScript，并引入了创新的响应式语法。

> **注意**: Ripple 目前仍处于早期开发阶段，尚未准备好用于生产环境。

## 核心特性

### 1. 响应式状态管理

Ripple 使用 `track()` 函数创建响应式变量，通过 `@` 符号访问和修改值：

```tsx
import { track } from 'ripple';

export component Counter() {
  let count = track(0);
  let double = track(() => @count * 2);  // 派生响应式值

  <div>
    <p>{"Count: "}{@count}</p>
    <p>{"Double: "}{@double}</p>
    <button onClick={() => @count++}>{"Increment"}</button>
  </div>
}
```

这种设计的优势在于：
- 显式的响应式追踪，避免意外的重渲染
- `@` 语法清晰地标识响应式值的读写
- 支持派生状态，自动追踪依赖

### 2. 组件定义语法

不同于 React 的函数返回 JSX，Ripple 使用 `component` 关键字定义组件，模板直接作为语句书写：

```tsx
component Button(props: { text: string, onClick: () => void }) {
  <button onClick={props.onClick}>
    {props.text}
  </button>
}

export component App() {
  <Button text="Click me" onClick={() => console.log("Clicked!")} />
}
```

**重要**: Ripple 中所有文本内容必须包裹在表达式 `{}` 中：

```tsx
// 错误写法
<div>Hello World</div>

// 正确写法
<div>{"Hello World"}</div>
```

### 3. 原生控制流

Ripple 支持在模板中直接使用 JavaScript 原生控制流语句：

```tsx
component TodoList({ todos }) {
  <ul>
    for (const todo of todos; index i; key todo.id) {
      <li>{todo.text}{" at index "}{i}</li>
    }
  </ul>

  if (todos.length === 0) {
    <p>{"No todos yet!"}</p>
  } else {
    <p>{"Total: "}{todos.length}</p>
  }
}
```

还支持 `switch` 语句和 `try-catch` 错误边界：

```tsx
component StatusIndicator({ status }) {
  switch (status) {
    case 'loading':
      <p>{'Loading...'}</p>
      break;
    case 'success':
      <p>{'Success!'}</p>
      break;
    case 'error':
      <p>{'Error!'}</p>
      break;
    default:
      <p>{'Unknown status'}</p>
  }
}
```

### 4. 响应式集合

Ripple 提供了完整的响应式集合类型：

```tsx
// 响应式数组
const items = #[1, 2, 3];
// 或
const items = new TrackedArray(1, 2, 3);

// 响应式对象
const obj = #{a: 1, b: 2};
// 或
const obj = new TrackedObject({a: 1, b: 2});

// 响应式 Map
const map = new TrackedMap([[1, 'a'], [2, 'b']]);

// 响应式 Set
const set = new TrackedSet([1, 2, 3]);
```

### 5. 作用域样式

组件支持内置的作用域 CSS：

```tsx
component StyledCard() {
  <div class="card">
    <h1>{"Styled Content"}</h1>
  </div>

  <style>
    .card {
      background: #f0f0f0;
      padding: 1rem;
      border-radius: 8px;
    }
    h1 {
      color: #333;
    }
  </style>
}
```

## 工作原理

### 编译器驱动

Ripple 是一个编译器驱动的框架。`.ripple` 文件在构建时被编译成优化的 JavaScript 代码。这种方式带来了几个优势：

1. **细粒度更新**: 不使用虚拟 DOM，而是在编译时分析依赖关系，生成精确的 DOM 更新代码
2. **更小的运行时**: 许多工作在编译时完成，运行时代码更精简
3. **类型安全**: 编译器可以进行完整的 TypeScript 类型检查

### 响应式系统

Ripple 的响应式系统基于 `Tracked<V>` 对象：

```tsx
// track() 创建一个 Tracked<V> 对象
let count = track(0);

// @count 读取值（建立依赖追踪）
console.log(@count);  // 0

// @count++ 修改值（触发更新）
@count++;
```

这种设计确保了：
- 只有实际被读取的值才会建立依赖关系
- 更新是细粒度的，只影响真正依赖该值的 DOM 节点
- 可以使用 `untrack()` 显式跳过依赖追踪

### 模板作为词法作用域

Ripple 的独特之处在于模板本身就是词法作用域，可以在其中声明变量和执行语句：

```tsx
component TemplateScope() {
  <div>
    // 在模板内声明变量
    const message = "Hello";
    let count = 42;

    console.log("This runs during render");

    <h1>{message}</h1>
    <p>{"Count: "}{count}</p>

    // 嵌套作用域
    <section>
      const sectionData = "Nested scope";
      <p>{sectionData}</p>
    </section>
  </div>
}
```

## 与其他框架对比

### vs React

| 特性 | Ripple | React |
|------|--------|-------|
| 响应式 | 内置 `track()` + `@` 语法 | useState/useEffect |
| DOM 更新 | 细粒度直接更新 | 虚拟 DOM diff |
| 样式 | 内置作用域 CSS | 需要 CSS-in-JS 库 |
| 组件定义 | `component` 关键字 | 函数返回 JSX |
| 控制流 | 原生 if/for/switch | JSX 表达式 / map() |
| TypeScript | 原生支持 | 需要配置 |

**Ripple 优势**:
- 无需学习 Hooks 规则
- 更直观的响应式语法
- 更好的性能（无虚拟 DOM 开销）
- 更小的包体积

**React 优势**:
- 成熟的生态系统
- 大量社区资源和第三方库
- SSR/SSG 完善支持
- 稳定的生产就绪状态

### vs Svelte

| 特性 | Ripple | Svelte |
|------|--------|--------|
| 语法风格 | TypeScript/JSX 优先 | HTML 模板优先 |
| 响应式语法 | `track()` + `@` | `$:` 和 runes |
| 控制流 | 原生 JS 语句 | 特殊指令 `{#if}` `{#each}` |
| 类型系统 | TypeScript 原生 | 需要额外配置 |

**Ripple 优势**:
- TypeScript 优先设计
- 使用原生 JS 控制流而非特殊语法
- JSX 风格对 React 开发者更友好

**Svelte 优势**:
- 更成熟稳定
- 完善的 SSR (SvelteKit)
- 更大的社区和生态

### vs Solid

| 特性 | Ripple | Solid |
|------|--------|-------|
| 组件定义 | `component` 关键字 | 普通函数 |
| 响应式访问 | `@` 语法 | 函数调用 `count()` |
| 集合 | 内置 TrackedArray/TrackedObject | 需要 createStore |
| 模板 | 组件体内语句 | JSX 返回值 |

**Ripple 优势**:
- 更简洁的响应式访问语法
- 内置响应式集合类型
- 模板词法作用域特性

**Solid 优势**:
- 生产就绪
- 标准 JSX 兼容性
- 更成熟的生态

## 快速开始

### 安装

```bash
# 从模板创建新项目
npx degit Ripple-TS/ripple/templates/basic my-app
cd my-app
npm i && npm run dev

# 或在现有项目中安装
npm install ripple
npm install --save-dev @ripple-ts/vite-plugin
```

### 基础示例

```tsx
import { track } from 'ripple';

export component App() {
  let count = track(0);

  <div class="container">
    <h1>{"Welcome to Ripple!"}</h1>
    <p>{"Count: "}{@count}</p>
    <button onClick={() => @count++}>{"Increment"}</button>
  </div>

  <style>
    .container {
      text-align: center;
      padding: 2rem;
    }
    button {
      padding: 0.5rem 1rem;
      cursor: pointer;
    }
  </style>
}
```

### 挂载应用

```typescript
import { mount } from 'ripple';
import App from './App.ripple';

mount(App, {
  target: document.getElementById('root')
});
```

## 开发工具支持

Ripple 提供了完整的开发工具链：

- **VSCode 扩展**: 语法高亮、诊断、IntelliSense
- **Prettier 插件**: 代码格式化支持
- **ESLint 插件**: 代码检查支持
- **Vite 插件**: 开发和构建支持

## 当前限制

作为早期开发阶段的框架，Ripple 目前存在一些限制：

1. **无 SSR 支持**: 目前仅支持 SPA 模式
2. **生态系统不完善**: 第三方库和工具较少
3. **可能存在 Bug**: 框架仍在快速迭代中
4. **文档不完整**: 部分高级特性文档待完善

## 总结

Ripple 是一个充满创新的前端框架，它汇集了 Dominic Gannaway 多年前端框架开发经验的精华。其独特的响应式语法、编译器驱动的架构以及 TypeScript 优先的设计理念，为前端开发提供了一种新的可能性。

**适合尝试 Ripple 的场景**:
- 对新技术感兴趣的个人项目
- 想要学习现代响应式框架设计原理
- 不需要 SSR 的小型应用

**暂不建议使用的场景**:
- 生产环境的商业项目
- 需要完善 SSR 支持的应用
- 依赖大量第三方库的项目

随着框架的不断成熟，Ripple 有望成为前端开发的一个有力选择。如果你对现代前端框架的设计感兴趣，Ripple 绝对值得关注和尝试。

## 参考链接

- [Ripple 官网](https://www.ripplejs.com/)
- [GitHub 仓库](https://github.com/Ripple-TS/ripple)
- [官方文档](https://www.ripplejs.com/docs/introduction)
