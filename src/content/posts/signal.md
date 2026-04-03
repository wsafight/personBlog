---
title: 深入理解 Signal：Push-Pull 响应式算法源码解读
published: 2026-04-03
description: 从零开始逐层构建一个完整的 Signal 系统，深入解读 Push-Pull 混合算法、全局栈自动依赖追踪、动态依赖清理等核心机制，理解 Vue、Solid、Preact 等现代前端框架响应式系统的共同原理。
tags: [Signal, 响应式, TypeScript, Vue, Solid, 前端框架]
category: 前端原理
draft: false
---

## 什么是 Signal

Signal 是现代前端框架（Vue、Solid、Preact、Angular、Svelte）共同采用的响应式原语。它解决的核心问题是：**当数据变化时，如何高效地通知依赖方更新？**

答案是 **Push-Pull 混合算法**：
- **Push**：数据变化时，急切地向下游传播"你脏了"的通知
- **Pull**：只有当值真正被读取时，才惰性地重新计算

本文将从零开始，逐层构建一个完整的 Signal 系统，每一层都在上一层基础上增加一个概念。

---

## 第一层：Signal — 带通知的盒子

Signal 是最基础的响应式单元。本质就是观察者模式：

```typescript
type Sub<T> = (s: T) => void

export function signal<T>(initial: T) {
  let value = initial
  const subs = new Set<Sub<T>>()

  return {
    get value(): T {
      return value
    },
    set value(v: T) {
      if (value === v) return       // 值没变，跳过
      value = v
      for (const fn of [...subs]) fn(v)  // 通知所有订阅者
    },
    subscribe(fn: Sub<T>) {
      subs.add(fn)
      return () => subs.delete(fn)  // 返回取消订阅函数
    },
  }
}
```

使用：

```typescript
const count = signal(1)
count.subscribe((v) => console.log('变了:', v))
count.value = 2  // 打印 "变了: 2"
count.value = 2  // 值没变，不触发
```

三个要点：
- `subs`：订阅者集合，存的是回调函数
- setter 里 `if (value === v) return`：值没变就不通知，避免无意义的更新
- setter 遍历 subs 并调用 — 这就是 **Push**（主动推送）

这一层没什么难的。接下来加入 computed。

---

## 第二层：Computed — 惰性计算 + 缓存

Computed 是派生值，由一个计算函数 `fn` 定义：

```typescript
export function computed<T>(fn: () => T) {
  let cachedValue: T
  let dirty = true

  function _internalCompute() {
    cachedValue = fn()
    dirty = false
  }

  return {
    get value(): T {
      if (dirty) _internalCompute()
      return cachedValue
    },
  }
}
```

使用：

```typescript
const count = signal(1)
const double = computed(() => count.value * 2)
console.log(double.value)  // 此时才执行计算，返回 2
console.log(double.value)  // dirty=false，直接返回缓存
```

两个要点：
- `dirty` 标记：true 表示需要重算，false 表示缓存有效
- 只有读取 `.value` 时才计算 — 这就是 **Pull**（按需拉取）

但这个版本有两个大问题：
1. computed 不知道自己依赖了谁，没人把它标记为 dirty
2. 没有自动依赖追踪，需要手动管理

第三层解决这两个问题。

---

## 第三层：自动依赖追踪 — 全局栈

这是整个算法最精妙的部分。核心问题：**computed 执行 `fn()` 时，怎么自动知道自己读了哪些 signal？**

答案：用一个全局栈 `STACK` 当"暗号"。

### 类型定义

```typescript
type ComputeContext = {
  setDirty: () => void                // 把我标记为 dirty
  addSource: (cleanup: () => void) => void  // 记录一个依赖源的退订函数
}

const STACK: ComputeContext[] = []
```

### Signal 的改造

有了全局栈，signal 不再需要第一层的 `subscribe` 方法——依赖注册由 getter 自动完成。同时 `subs` 的类型从 `Set<Sub<T>>` 变为 `Set<() => void>`，因为现在存的是 computed 的 `setDirty`（无参函数），不再需要传递新值：

```typescript
export function signal<T>(initial: T) {
  let value = initial
  const subs = new Set<() => void>()    // 改：存 setDirty 函数

  return {
    get value(): T {
      const ctx = STACK[STACK.length - 1]  // 看栈顶
      if (ctx) {
        subs.add(ctx.setDirty)                          // ①
        ctx.addSource(() => subs.delete(ctx.setDirty))  // ②
      }
      return value
    },
    set value(v: T) {
      if (value === v) return
      value = v
      for (const fn of [...subs]) fn()   // 改：不传参，只通知"脏了"
    },
  }
}
```

这两行是整个系统的核心"握手"：

- **① `subs.add(ctx.setDirty)`** — signal 说："我变了会通知你"。把 computed 的 `setDirty` 加入自己的订阅者列表。以后 signal 值变了，setter 遍历 subs 时就会调用它，把 computed 标记为 dirty。

- **② `ctx.addSource(退订函数)`** — signal 说："你不要我了就用这个取消"。把一个清理函数交给 computed 保管。computed 下次重新计算前会调用它，从 signal 的 subs 里删掉自己。

这个"握手"只在 `STACK` 非空时发生——即某个 computed 正在执行 `fn()` 时。普通代码读取 signal（如 `console.log(count.value)`）不会注册依赖。

### Computed 的完整实现

```typescript
export function computed<T>(fn: () => T) {
  const subs = new Set<ComputeContext>()    // 谁依赖我
  const sources = new Set<() => void>()     // 我依赖谁（存的是退订函数）
  let cachedValue: T
  let dirty = true

  function _internalCompute() {
    // 1. 清理旧依赖
    sources.forEach((cleanup) => cleanup())
    sources.clear()

    // 2. 压栈：告诉所有 signal "接下来读取是我发起的"
    STACK.push({
      setDirty: () => {
        if (dirty) return           // 已经 dirty 了，不重复传播
        dirty = true
        for (const sub of [...subs]) sub.setDirty()  // 向下游继续传播
      },
      addSource: (unsub) => sources.add(unsub),
    })

    // 3. 执行计算函数 — 过程中会触发 signal 的 getter，自动注册依赖
    cachedValue = fn()
    dirty = false

    // 4. 弹栈
    STACK.pop()
  }

  return {
    get value(): T {
      // 如果有上层 computed 在读我，也要注册依赖
      const ctx = STACK[STACK.length - 1]
      if (ctx) {
        subs.add(ctx)
        ctx.addSource(() => subs.delete(ctx))
      }
      if (dirty) _internalCompute()
      return cachedValue
    },
  }
}
```

注意 computed 的 `subs` 和 signal 的 `subs` 存的东西不一样：
- **signal.subs** = `Set<函数>` — 存的是 `setDirty` 函数，值变了直接调用
- **computed.subs** = `Set<ComputeContext>` — 存的是上下文对象，dirty 时调用 `.setDirty()` 继续向下游传播

因为 computed 既是消费者（依赖 signal），又是生产者（被其他 computed 依赖），需要把 dirty 继续往下传。

---

## 执行流程详解

用一个具体例子走完整个流程：

```typescript
const count = signal(1)
const double = computed(() => count.value * 2)
const plusOne = computed(() => double.value + 1)
```

### 阶段一：首次读取 `plusOne.value`

```
plusOne.value 被读取
  → dirty === true，进入 _internalCompute()
  → STACK.push(plusOne_ctx)
  → STACK: [plusOne_ctx]
  → 执行 fn()：double.value + 1
    │
    ├→ 读取 double.value
    │    → double 的 getter 检查栈顶 = plusOne_ctx
    │    → double.subs.add(plusOne_ctx)          // double 记住 plusOne
    │    → plusOne.sources.add(退订函数)          // plusOne 记住 double
    │    → double.dirty === true，进入 double._internalCompute()
    │    → STACK.push(double_ctx)
    │    → STACK: [plusOne_ctx, double_ctx]       // 两个同时在栈里！
    │    → 执行 fn()：count.value * 2
    │    │
    │    ├→ 读取 count.value
    │    │    → count 的 getter 检查栈顶 = double_ctx（不是 plusOne_ctx！）
    │    │    → count.subs.add(double.setDirty)  // count 记住 double
    │    │    → double.sources.add(退订函数)      // double 记住 count
    │    │    → 返回 1
    │    │
    │    → cachedValue = 1 * 2 = 2
    │    → STACK.pop() → STACK: [plusOne_ctx]
    │    → 返回 2
    │
    → cachedValue = 2 + 1 = 3
    → STACK.pop() → STACK: []
    → 返回 3
```

执行完后的依赖关系：

```
count.subs = { double.setDirty }
double.subs = { plusOne_ctx }
double.sources = { count的退订函数 }
plusOne.sources = { double的退订函数 }
```

**为什么用栈而不是单个变量？** 因为 computed 的 `fn()` 内部可能触发另一个 computed 的求值，形成嵌套。栈的 LIFO 特性天然匹配：栈顶永远是当前最内层正在计算的 computed。JS 是单线程的，不存在两个 computed 同时执行的情况，所以栈不会冲突。

### 阶段二：修改 `count.value = 5`（Push 阶段）

```
count.value = 5
  → setter 触发
  → 遍历 subs，调用 double.setDirty()
    → double.dirty = true
    → double 遍历自己的 subs，调用 plusOne_ctx.setDirty()
      → plusOne.dirty = true
```

注意：**只标记 dirty，不做任何计算**。这就是 Push 的特点——轻量、快速，只传播"失效通知"。

### 阶段三：再次读取 `plusOne.value`（Pull 阶段）

```
plusOne.value 被读取
  → dirty === true，进入 _internalCompute()
  → 清理旧依赖（断开与 double 的连接）
  → 压栈，执行 fn()
    → 读取 double.value → double 也是 dirty → 重新计算
      → 清理旧依赖（断开与 count 的连接）
      → 压栈，执行 fn()
        → 读取 count.value → 重新注册依赖
      → 返回 10
    → 重新注册依赖
    → 返回 11
```

**只有被读取的 computed 才会重算**。如果没人读 plusOne，即使它被标记了 dirty，也不会浪费算力。

---

## 为什么要清理旧依赖

这是很多人困惑的地方。看这个例子：

```typescript
const toggle = signal(true)
const a = signal(1)
const b = signal(2)
const result = computed(() => toggle.value ? a.value : b.value)
```

第一次执行（toggle=true）：result 读了 toggle 和 a，依赖关系：

```
toggle.subs = { result.setDirty }
a.subs      = { result.setDirty }
b.subs      = { }                   // b 没被读，没有依赖
result.sources = { toggle的退订, a的退订 }
```

现在 toggle 变为 false，result 被标记 dirty。重新计算时：

**第一步：清理**

```typescript
sources.forEach((cleanup) => cleanup())  // 执行退订函数
sources.clear()
```

- `toggle.subs.delete(result.setDirty)` → toggle.subs 变空
- `a.subs.delete(result.setDirty)` → a.subs 变空
- result.sources 清空

所有连接断开。

**第二步：执行 fn()**

这次 toggle=false，走 else 分支，读了 toggle 和 b（没读 a）：

- toggle 的 getter → 重新注册 result
- b 的 getter → 注册 result
- a 没被读 → 不注册

**最终状态：**

```
toggle.subs = { result.setDirty }   // 重新建立
a.subs      = { }                   // 干净了！
b.subs      = { result.setDirty }   // 新建立
result.sources = { toggle的退订, b的退订 }
```

如果不清理，a.subs 里还残留着 result 的 setDirty。以后 a 变了，会错误地通知 result 重算，但 result 根本不依赖 a 了。

**清理的本质：先全部拆掉，再通过 fn() 的执行自动重建。** `cachedValue = fn()` 这一行同时完成了两件事：计算新值 + 重新建立所有依赖关系。

---

## 两个 subs 的区别

signal 和 computed 都有 `subs`，但存的东西不同：

```
signal.subs   = Set<函数>          // 存 setDirty 函数
computed.subs = Set<ComputeContext> // 存上下文对象（包含 setDirty + addSource）
```

为什么？

- signal 是纯数据源，值变了只需要调用订阅者的 `setDirty`，一个函数就够了
- computed 是中间节点，它被标记 dirty 后还需要**继续向下游传播**，所以下游注册的是完整的 context 对象，通过 `sub.setDirty()` 链式传播

```
count 变了
  → count.subs 里的函数被调用 → double.dirty = true
    → double.subs 里的 context.setDirty() 被调用 → plusOne.dirty = true
```

---

## 不用全局栈的替代方案

全局栈不是唯一的实现方式：

**显式声明依赖**：手动列出依赖，不需要运行时追踪。React 的 `useMemo` 依赖数组就是这个思路。缺点是手动维护容易出错，无法处理动态依赖。

**Proxy 拦截**：用 Proxy 包装数据对象，在 get 陷阱里记录访问。Vue 2 用的 `Object.defineProperty` 就是类似思路。缺点是 API 有侵入性。

**编译时静态分析**：编译器扫描代码，直接确定依赖关系。Svelte 的做法。缺点是需要编译器，动态依赖处理不了。

全局栈是唯一同时满足"自动追踪 + 动态依赖 + 零侵入 API + 无需编译"的方案，所以成为了主流选择。

---

## 编译时优化的可能性

运行时"清理+重建"的策略简单可靠，但对于静态依赖（依赖关系永远不变）来说有冗余开销。编译器可以识别这种情况并优化：

```typescript
// 源码：依赖永远是 count
const double = computed(() => count.value * 2)

// 编译产物：直接硬连接，跳过 STACK 机制
subscribe(count, () => double.dirty = true)
```

各框架的策略：
- **Svelte**：编译时分析，静态依赖直接硬连接
- **Vue 3.4**：运行时用版本号优化，computed 重算后值没变则不向下游传播 dirty
- **Solid**：区分静态/动态 computed，静态的不清理
- **React Compiler**：编译时自动插入 memo，思路完全不同

---

## 总结

Signal 的 Push-Pull 算法 = 三个概念的组合：

1. **观察者模式**（signal 的 subs + setter 通知）
2. **惰性求值**（computed 的 dirty 标记 + 按需计算）
3. **全局栈自动追踪**（STACK + getter 里的"握手"注册）

Push 保证响应性——变化不会被遗漏。Pull 保证效率——没人读的值不会白算。全局栈保证易用性——不需要手动声明依赖。三者缺一不可。

完整实现只有约 70 行代码，却是 Vue `ref/computed`、Solid `createSignal/createMemo`、Preact `@preact/signals` 背后的共同原理。理解了这 70 行，再去读任何框架的响应式源码都不会陌生。
