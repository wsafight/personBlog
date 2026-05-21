---
title: rari：把 React Server Components 的运行时搬到 Rust
published: 2026-05-21
description: rari 是一个基于 Rust runtime 和嵌入式 V8 的 React Server Components 框架。它把 HTTP、路由、RSC 渲染和 Server Actions 调度下沉到 Rust，同时保留 React 与 npm 生态。本文从架构、请求链路、性能数据和迁移边界出发，解释它快在哪里、数字该怎么看，以及哪些业务适合先试点。
tags: [Rust, React, RSC, V8, 性能优化, 开源项目解析]
category: 开源项目解析
draft: false
---

> [rari](https://rari.build/) 是一个 React Server Components 框架。简单说：React 写法不变，Node.js 框架运行时尽量换成 Rust；组件代码仍然交给嵌入式 V8 执行。

## 前言

过去两年，前端工具链被系统级语言重新写了一轮：Rolldown 对齐 Rollup，Biome 替代 ESLint / Prettier 的一部分场景，tsgo 试图重写 TypeScript 编译器，Turbopack 也在重构 webpack 式的打包体验。

这些项目大多解决的是 **构建期** 问题：启动更快、热更新更快、打包更快、类型检查更快。

rari 往前多走了一步：它把加速点推到 **运行期**。HTTP server、路由匹配、RSC 渲染管线、Server Actions 调度这些框架基础设施由 Rust runtime 承担；JavaScript 仍然存在，但更像是被 V8 执行的业务模块，而不是承载整个 Web 框架的服务器运行时。

官方给出的 benchmark 很激进：

| 指标 | rari | Next.js | 提升幅度 |
|------|------|---------|----------|
| 平均响应时间 | **0.13ms** | 1.98ms | **15.2x** |
| 吞吐量（50 并发，30s） | **105,698 req/s** | 1,463 req/s | **72.3x** |
| P95 延迟（负载下） | **0.80ms** | 42.84ms | **53.6x** |
| 构建时间 | **1.98s** | 4.42s | **2.2x** |
| 客户端 Bundle | **285 KB** | 634 KB | 减少 55% |

> 注：以上数据来自 rari 官方 README / benchmark，标注更新时间为 2026-05-15。它能说明框架固定开销的差异，但不能直接等价为真实业务页面的端到端性能提升。

先给结论：

- rari 优化的不是组件里的业务计算，而是 HTTP、路由、调度、RSC 流拼装这些每个请求都会经过的固定开销。
- 页面越轻、Server Component 占比越高，rari 的优势越容易体现；瓶颈如果在数据库、第三方 API 或客户端图表，收益会被摊薄。
- 迁移成本主要不在 React 写法，而在 Node API、Next.js 专有能力、部署和观测链路。

## 核心取舍：Rust 接管框架外壳

rari 不是“用 Rust 写 React 组件”，也不是“让 JavaScript 计算突然变快”。

它更像是把 React 应用外围那层框架基础设施换成 Rust：

- 请求进来后由 Rust HTTP server 接住
- 路由匹配和请求上下文由 Rust runtime 管理
- Server Components 在嵌入式 V8 里执行
- RSC payload / HTML stream 由 Rust 侧组织和返回
- Server Actions 的入口、参数解析和调度也由 runtime 接管

rari 的核心判断是：

> React 应用里有一部分工作其实不必由 Node.js 框架层来做。只要这些工作能被移到 Rust runtime，React 生态可以保留，框架固定开销也有机会下降。

这个判断很关键。它决定了 rari 和 Leptos / Dioxus 这类 Rust 前端框架不是同一种路线。

| 问题 | rari 的答案 | Leptos / Dioxus 的答案 |
|------|-------------|------------------------|
| 组件语言 | React / TypeScript | Rust |
| 运行时代码 | Rust + V8 | Rust / WASM / 原生 |
| 生态兼容 | 优先兼容 React 和 npm | 优先利用 Rust 类型系统和性能 |
| 性能突破口 | HTTP、路由、框架调度、RSC 管线 | 组件执行、状态系统、渲染模型 |
| 迁移成本 | 相对低 | 相对高 |

rari 选择的是“换底盘，不换驾驶方式”：你依旧写 React，但框架运行时尽量少让 Node.js 承担固定工作。

## 架构分层

rari 把自己描述为 **three layers, one framework**。理解它时可以按三层看：底层负责运行时，中间层提供 React 语义，上层负责构建和开发体验。

```text
┌─────────────────────────────────────────────┐
│  Layer 3: Build Toolchain                    │
│  Rolldown + Vite + tsgo                      │
├─────────────────────────────────────────────┤
│  Layer 2: React Framework                    │
│  App Router · Server Actions · Streaming     │
├─────────────────────────────────────────────┤
│  Layer 1: Rust Runtime                       │
│  HTTP Server · RSC Renderer · Router · V8    │
└─────────────────────────────────────────────┘
```

### Layer 1：Rust Runtime

这一层是真正替换 Node.js 框架运行时的部分，也是性能差异最容易出现的地方：

- **HTTP 服务器**：基于 Rust 异步生态处理连接、请求和响应
- **路由器**：与 App Router 协作，减少 JS 层路由匹配和调度开销
- **RSC 渲染器**：组织 Server Components 的执行结果和 RSC stream
- **嵌入式 V8**：负责执行 React 组件、Server Actions 和应用侧 JavaScript

HTTP 处理、路由匹配、响应流拼装这些固定开销越低，轻页面的吞吐和尾延迟就越容易被拉开。

### Layer 2：React Framework

语义上，rari 对齐的是 Next.js App Router 这套开发模型：

- **App Router**：文件系统路由，支持 layouts、loading、error 边界
- **Server Components by default**：默认是服务端组件，需要浏览器能力时再声明 `'use client'`
- **Server Actions**：表单提交或 mutation 可以直接映射到服务端函数
- **Streaming SSR + Suspense**：通过 Suspense 边界逐步 flush 页面内容

这也是 rari 的吸引力所在：它没有要求你放弃 React 心智模型。对熟悉 RSC / App Router 的开发者来说，迁移成本主要不在组件写法，而在运行时兼容、部署和工程链路。

### Layer 3：构建工具链

rari 的构建层选择了一套偏底层实现的现代工具：

| 角色 | 选型 | 作用 |
|------|------|------|
| Bundler | **Rolldown** | Rust 写的 Rollup 兼容打包器 |
| Dev Server | Vite | 复用 Vite 的开发体验和插件生态 |
| 类型检查 | **tsgo** | TypeScript 编译器的 Go 实现 |
| 包解析 | `node_modules` | 使用标准 npm 包解析路径 |

最后一点很实际。很多“非 Node 的 JS runtime”会在 npm 兼容上付出很大成本，而 rari 选择直接支持 `node_modules`，能明显降低 React 项目的试用门槛。

但 `node_modules` 能解析，不代表完整复刻 Node.js。Node API、native addon、Next.js 专有 API 仍然要逐项验证。

## 一条请求在 rari 里怎么跑

从外部看，rari 应用还是 App Router 风格；从内部看，一次页面请求大致经过这条链路：

```text
Browser
  │
  │ GET /dashboard
  ▼
Rust HTTP server
  │
  │ 路由匹配、请求上下文、RSC/SSR 调度
  ▼
Embedded V8
  │
  │ 执行 Server Component 模块
  │ 遇到 Client Component 时记录 client reference
  ▼
RSC renderer / SSR pipeline
  │
  │ 生成 HTML + RSC payload
  │ 通过 Suspense 边界逐步 flush
  ▼
Browser
  │
  │ 加载客户端 bundle，hydrate Client Component
  ▼
Interactive UI
```

这条链路里，最影响 bundle 和运行时收益的是 Server Component / Client Component 边界：

- Server Component 在服务端执行，结果通过 RSC payload 传给浏览器，本身不需要作为组件源码进入客户端 bundle
- Client Component 用 `'use client'` 标记，它以及它向下引入的交互代码会进入客户端依赖图
- Server Component 可以 import Client Component，但传入的 props 必须可序列化
- 函数、数据库连接、文件句柄这类服务端资源不能直接跨到客户端组件
- Suspense 边界决定哪些内容可以先返回，哪些内容等数据准备好后再补上

这套语义来自 React RSC。rari 做的是把语义背后的路由、渲染调度和流式响应拼装尽量放到 Rust runtime。

Server Action 的链路也类似：

```text
form/action call
  │
  ▼
rari action endpoint
  │
  │ 解析 action 标识和 FormData
  ▼
Embedded V8
  │
  │ 调用 'use server' 函数
  ▼
serialize result
  │
  ▼
更新客户端状态 / 触发后续导航或刷新
```

它的价值是减少手写 API 层：mutation 逻辑仍然写成服务端函数，框架负责把表单提交、参数序列化、服务端调用和客户端状态更新接起来。

## 写起来是什么样

先看最小项目：

```bash
# 1. 使用脚手架
pnpm create rari-app@latest my-rari-app

# 2. 启动开发服务器
cd my-rari-app
pnpm dev
# 默认运行在 http://localhost:5173
```

Server Component 默认在服务端执行：

```tsx
// app/page.tsx
// 默认就是 Server Component
export default async function HomePage() {
  const posts = await fetch('https://api.example.com/posts').then((r) => r.json())

  return (
    <main>
      <h1>Hello rari</h1>
      <ul>
        {posts.map((post: { id: string; title: string }) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </main>
  )
}
```

这里没有 `getServerSideProps`，也没有额外的 loader。数据请求直接写在服务端组件里，客户端只接收渲染结果和必要的交互代码。

需要交互时再显式声明 Client Component：

```tsx
// app/components/Counter.tsx
'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount((value) => value + 1)}>
      clicked {count} times
    </button>
  )
}
```

`'use client'` 会切开依赖图：这个文件以及它向下 import 的交互逻辑都会进入客户端 bundle。因此它应该尽量靠近真正需要浏览器状态、事件或 DOM API 的地方。

Server Action 仍然按 React 语义写：

```tsx
// app/actions/todo-actions.ts
'use server'

export async function addTodo(formData: FormData) {
  const title = formData.get('title') as string

  if (!title?.trim()) {
    return { success: false, error: 'title is required' }
  }

  await db.todo.create({ data: { title: title.trim() } })

  return { success: true }
}
```

```tsx
// app/components/TodoForm.tsx
'use client'

import { useActionState } from 'react'
import { addTodo } from '@/actions/todo-actions'

export default function TodoForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prevState, formData: FormData) => addTodo(formData),
    { success: false },
  )

  return (
    <form action={formAction}>
      <input name="title" />
      <button type="submit" disabled={isPending}>
        {isPending ? 'adding...' : 'add'}
      </button>
      {'error' in state && state.error ? <p>{state.error}</p> : null}
    </form>
  )
}
```

背后的流程是：

```text
表单提交
  ↓
rari action endpoint 收到请求
  ↓
在 V8 中调用 addTodo
  ↓
序列化返回结果
  ↓
更新客户端状态或触发后续刷新
```

Server Action 可以访问数据库、环境变量和 server-only 能力。如果要调用 Node API 或 native addon，仍然需要按 rari 当前运行时兼容性逐项验证。

## 性能数据怎么看

官方 benchmark 最大的价值，是展示框架固定开销的差异。它回答的是“runtime 本身能省多少”，不是“业务页面一定快多少”。

一个请求的总耗时可以粗略拆成：

```text
T_total =
  T_http
+ T_route
+ T_framework_orchestration
+ T_react_render
+ T_data_fetch
+ T_serialize
+ T_network
```

rari 主要压低的是前几项：HTTP、路由、框架调度、RSC 流拼装。`T_react_render` 仍然发生在 V8 里；`T_data_fetch` 取决于数据库、缓存和外部 API；`T_network` 取决于部署位置和网络环境。

所以更实际的判断是：

- 页面越轻、框架固定开销占比越高，rari 的相对优势越容易体现
- 页面如果主要慢在数据库、第三方接口、图片处理或复杂业务计算，rari 只能减少框架层开销
- Client Component 占比越高，bundle 和 hydration 成本越难靠服务端 runtime 解决
- Node API / native addon 依赖越深，迁移验证成本越高

### 吞吐 72.3x

105,698 req/s 更适合被理解为“轻页面场景下的 runtime 上限差异”。

在这样的 benchmark 中，页面渲染本身通常不复杂，数据库和外部 API 也不会成为瓶颈。此时每个请求都会经过的 HTTP、路由、请求上下文、RSC 管线调度、响应流拼装就会变得非常显眼。

Node/Next 的请求处理、React 渲染、RSC 管线都在 JS 框架上下文里调度。Node 的事件循环本身没有问题，但如果框架层在每个请求上都要创建较多 JS 对象、执行路由包装、组织模块和序列化结果，固定成本会在高并发下被放大。

Rust runtime 的优势主要体现在：

- 更低的框架层对象分配压力
- 更可控的线程和异步调度模型
- 更容易把 HTTP 连接、请求上下文、响应流组织成低开销路径
- V8 只在需要执行应用代码时参与，而不是让整个服务器框架都跑在 JS 层

只要页面渲染本身变重，或者每个请求都要等待多个慢查询，瓶颈就会快速转移到 React render / 数据层。此时 72.3x 这个比例就不再是可期待的真实收益。

### Bundle 缩小 55%

285 KB vs 634 KB 不能简单理解成“rari 的 RSC 比 Next.js 更激进”。Next.js App Router 本身也是 Server Components by default。

更合理的解释是几件事叠加：

- benchmark 应用依赖图不同：框架 runtime、路由代码、client boundary 数量都会影响最终 bundle
- RSC 边界切分不同：服务端组件越多，客户端需要下载的组件代码越少
- Rolldown 的 tree-shaking 和代码分割可能在示例应用里产出更小的客户端代码

真正影响 bundle 的不是“用了 rari”这个开关，而是组件边界：

```tsx
// 这个文件一旦标记 'use client'，
// 它下面 import 的交互逻辑也会进入客户端依赖图
'use client'

import HeavyChart from './HeavyChart'
import { formatMoney } from '@/lib/format'
import { getServerOnlyConfig } from '@/lib/server-config' // 应该避免
```

在 RSC 应用里，`'use client'` 更像依赖图切割点。切得太靠上，整个子树都会变成客户端代码；切得足够靠近交互点，Server Components 才能真正减少 bundle。

实际优化时应该看 bundle analyzer，而不是只看框架宣传数字：

- 页面骨架、数据读取、权限判断、文案拼装尽量留在 Server Component
- 输入框、图表交互、弹窗、局部状态这类确实需要浏览器能力的部分再标记 `'use client'`
- 避免在 Client Component 依赖图里误引 server-only 模块
- 对关键页面单独观察 JS bundle size 和 hydration time

### 构建时间 2.2x

| 阶段 | Next.js | rari |
|------|---------|------|
| 类型检查 | tsc / Next build 流程 | **tsgo** |
| Bundling | webpack / Turbopack | **Rolldown** |
| Server build | Node / Next 产物 | Rust runtime + rari 产物 |

构建时间差异来自两个层面：

1. Rolldown 用 Rust 实现 Rollup 语义，在解析、依赖图构建和代码生成上有更低的底层成本。
2. tsgo 把 TypeScript 编译器移到 Go 实现，目标是改善大型项目的冷启动和全量检查速度。

但 Next.js 的生产构建不只是 bundling。它还包括路由分析、RSC / Client 边界处理、静态生成、图片、字体、metadata 等框架任务。rari benchmark 里的构建时间适合同示例应用对照，不适合线性外推到复杂生产项目。

## 它适合什么场景

判断 rari 是否值得试，核心不是“它是否比 Next.js 快”，而是你的项目瓶颈是否刚好落在它擅长优化的那一层。

### 适合

- **重 IO、轻计算的 RSC 应用**：内容站点、文档、详情页、Dashboard、BFF 型页面
- **对冷启动或低延迟敏感的部署**：Rust runtime + 嵌入式 V8 有机会降低固定开销
- **想保留 React 生态，又被 Next.js 运行时成本困扰的团队**：可以先从性能敏感页面试点

### 暂时不适合

- **强依赖 Node 原生能力的应用**：例如 native addon、复杂 stream、特定数据库驱动、图片处理链路
- **生产稳定性要求极高的核心系统**：截至 2026-05-21，rari 最新 release 为 0.13.6，仍处在快速迭代阶段
- **大量依赖 Next.js 专有能力的项目**：例如 `next/cache`、`next/image`、middleware、route handlers、复杂 metadata 生态
- **富交互优先的应用**：低代码画布、编辑器、复杂可视化、游戏这类页面的瓶颈通常在客户端

## 迁移前应该检查什么

如果只是体验新框架，`create rari-app` 就够了；如果要评估真实项目迁移，建议先做下面几项检查。

### 1. Client Component 比例

RSC 框架的收益高度依赖服务端组件占比。如果页面大部分区域都需要浏览器状态、拖拽、复杂图表、实时协同，最终还是会产生较大的客户端 bundle 和 hydration 成本。

可以先按页面类型做一次分类：

| 页面类型 | rari 收益预期 |
|----------|---------------|
| 内容页、文档页、详情页 | 高 |
| Dashboard + 表格筛选 | 中到高 |
| 富交互编辑器、低代码画布 | 中到低 |
| Web 游戏、复杂可视化 | 低 |

### 2. Node API 和 npm 包边界

支持 `node_modules` 不等于完整兼容 Node runtime。迁移前要列出项目里的 server-side 依赖：

- 是否使用 `fs`、`path`、`crypto`、`stream` 等 Node 内置模块
- 是否依赖 native addon，例如 `sharp`、`canvas`、某些数据库驱动或压缩库
- 是否依赖 Next.js 特有 API，例如 `next/cache`、`next/image`、middleware、route handlers
- 是否有 webpack loader、Babel plugin、Next plugin 之类的构建期扩展

这些依赖不一定不能用，但需要逐项验证。rari 的低迁移成本主要针对标准 React / RSC / npm 依赖，不应该被理解为所有 Next.js 应用都能无痛替换。

### 3. 部署模型

rari 的优势来自 Rust runtime，但部署收益要放到真实平台里评估：

- 产物如何启动：单进程、容器、serverless 还是边缘运行时
- 当前瓶颈是否真的是冷启动、TTFB 或高并发尾延迟
- 日志、metrics、tracing、错误上报如何接入
- 是否需要复用现有 Node 中间件、认证、session、缓存层
- 发布、回滚、灰度和故障排查链路是否需要重新设计

如果团队已经有成熟的 Next.js 部署平台，迁移成本不只在代码，还在观测和运维体系。

### 4. 验证方式

不要直接拿官方 72.3x 套自己的项目。更合理的做法是选 2-3 个代表性页面做对照：

1. 一个轻量内容页：观察框架固定开销
2. 一个真实 Dashboard：观察数据请求 + RSC 渲染
3. 一个重交互页面：观察 bundle、hydration 和客户端性能

重点看这些指标：

| 指标 | 为什么看它 |
|------|------------|
| TTFB | 服务端响应起始速度 |
| P95 / P99 latency | 高并发下尾延迟 |
| req/s | 框架吞吐上限 |
| JS bundle size | 客户端下载成本 |
| hydration time | 交互可用时间 |
| memory / CPU | 部署成本 |

如果 rari 只在空页面 benchmark 里快，但真实页面瓶颈是数据库或客户端图表，迁移价值就要重新计算。

## 与同类方案对比

| 维度 | rari | Next.js | Remix | Leptos / Dioxus |
|------|------|---------|-------|-----------------|
| 组件语言 | React | React | React | Rust |
| 运行时 | **Rust + V8** | Node.js | Node.js | Rust / WASM / 原生 |
| RSC 支持 | 默认支持 | App Router 支持 | 部分探索 | 不适用 |
| 学习成本 | 低 | 低 | 中 | 高 |
| 生态成熟度 | 早期 | 极成熟 | 成熟 | 早期 |
| 性能突破口 | 框架 runtime | 框架能力与生态 | Web 标准与数据流 | 语言与渲染模型 |

rari 的差异点很清晰：在不放弃 React 生态的前提下，把 React 框架运行时尽量搬到 Rust。

## 值得关注的实现细节

从仓库结构可以看出一些工程取向：

- `crates/rari/`：Rust 主体，Cargo workspace 管理
- `packages/`：发布到 npm 的客户端包和 Vite 插件
- `examples/app-router-example/`：官方示例应用
- `playwright.config.ts` + e2e 测试：近期版本持续补齐端到端测试
- `rust-toolchain.toml` + `Cargo.lock`：固定 Rust 工具链与依赖版本

这些细节说明 rari 不只是 proof of concept，而是在往可维护的应用型 Rust 项目方向推进。但从版本号和生态成熟度看，它仍然更适合先试点，再进入核心生产链路。

## 个人观察

1. **系统级运行时正在进入前端框架内部**。过去是打包器、linter、formatter 被 Rust / Go / Zig 重写，现在 rari 把 HTTP、路由和 RSC 管线也纳入系统级运行时的优化范围。
2. **RSC 是适合“换底盘”的边界**。Server Component、Client Component、Suspense、Server Action 天然把服务端执行、客户端交互和流式传输拆开，Rust runtime 有清晰的接管空间。
3. **业务团队应该关注的是固定成本下降，而不是宣传倍数**。如果你的瓶颈在数据库、第三方 API 或客户端图表，rari 不会让页面直接快 72 倍；如果你的瓶颈在框架 runtime、冷启动或高并发尾延迟，它才更值得认真评估。

## 总结

rari 的方向很明确：

- **下沉运行时**：把 HTTP、路由、RSC 渲染和 Server Actions 调度从 Node.js 框架层下沉到 Rust
- **保留生态**：继续使用 React、TypeScript 和 npm，而不是要求团队改写组件语言
- **更新工具链**：用 Rolldown、Vite、tsgo 组成更偏底层实现的现代构建链路
- **仍然早期**：截至 2026-05-21，最新 release 为 0.13.6，API 和运行时边界仍可能变化

如果你想体验 RSC 在低固定开销 runtime 上的表现，rari 很值得关注；如果要迁移成熟的 Next.js 生产体系，更稳妥的方式是先挑选性能敏感、依赖边界清晰的页面做试点，再用真实业务指标判断收益。

## 参考链接

- 官网：[https://rari.build/](https://rari.build/)
- 仓库：[https://github.com/rari-build/rari](https://github.com/rari-build/rari)
- 文档：[https://rari.build/docs](https://rari.build/docs)
- Benchmarks：[https://github.com/rari-build/benchmarks](https://github.com/rari-build/benchmarks)
