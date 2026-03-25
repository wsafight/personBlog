---
title: 深入理解 Go Context：从原理到实战（基于 Go 1.26）
published: 2026-03-25
description: 深入解析 Go context 包的核心原理与实战用法，涵盖 goroutine 生命周期控制、取消传播、超时管理及最佳实践。
tags: [Go]
category: 工程实践
draft: false
---

## 前言

在 Go 的并发编程中，`context` 包是最核心的基础设施之一。它解决了一个看似简单却极其重要的问题：**如何优雅地控制 goroutine 的生命周期？**

先看一个没有 context 的反面例子：

```go
// 模拟：用户请求一个接口，后端派 goroutine 去查数据库
func handleRequest() {
    go queryDB("SELECT * FROM orders") // 耗时 5 秒
    go callRPC("user-service")         // 耗时 3 秒
    go fetchCache("hot-items")         // 耗时 1 秒
}
```

如果用户在第 0.5 秒就断开了连接，会发生什么？

```go
func main() {
    for i := 0; i < 100; i++ {
        handleRequest() // 每个请求派生 3 个 goroutine
        // 假设用户全部在 0.5 秒后断开
    }
    time.Sleep(1 * time.Second)
    fmt.Println("当前 goroutine 数:", runtime.NumGoroutine())
    // 输出: 当前 goroutine 数: 301
    // 300 个 goroutine 在做无用功，没人要它们的结果了
}
```

这 300 个 goroutine 每一个都在占用内存（最少 2KB 栈空间）、可能持有数据库连接、消耗 CPU 时间片——而它们的结果已经没人需要了。在高并发场景下，这种泄漏会像滚雪球一样拖垮整个服务。

有了 context，一行代码就能解决：

```go
func handleRequest(ctx context.Context) {
    go queryDB(ctx, "SELECT * FROM orders")
    go callRPC(ctx, "user-service")
    go fetchCache(ctx, "hot-items")
}

// 用户断开 → ctx 被取消 → 三个 goroutine 收到信号 → 立即退出
// goroutine 数: 1（只剩 main）
```

这就是 context 的价值：**它是 goroutine 之间的"紧急叫停"机制**。没有它，你派出去的 goroutine 就像断了线的风筝，再也收不回来。

## 一、Context 是什么

`context.Context` 是一个接口，定义在标准库 `context` 包中：

```go
type Context interface {
    // 返回 context 的截止时间。如果没有设置截止时间，ok 为 false
    Deadline() (deadline time.Time, ok bool)

    // 返回一个 channel，当 context 被取消或超时时，该 channel 会被关闭
    Done() <-chan struct{}

    // 返回 context 被取消的原因
    Err() error

    // 从 context 中获取 key 对应的值
    Value(key any) any
}
```

四个方法，各司其职：

| 方法 | 作用 | 典型使用场景 |
|------|------|-------------|
| `Deadline()` | 获取截止时间 | 判断剩余时间是否够完成操作 |
| `Done()` | 获取取消信号 channel | 在 select 中监听取消事件 |
| `Err()` | 获取取消原因 | 区分是主动取消还是超时 |
| `Value()` | 获取传递的值 | 读取 request-scoped 数据（如 traceID） |

## 二、五种创建方式

### 1. context.Background() 和 context.TODO()

这两个函数返回的都是空 context，永远不会被取消，没有截止时间，没有值。

```go
// 作为整棵 context 树的根节点，通常在 main、init 或顶层请求入口使用
ctx := context.Background()

// 当你还不确定该用什么 context 时的占位符
ctx := context.TODO()
```

它们的区别纯粹是语义上的——`TODO()` 是在告诉代码的读者："这里以后要换成真正的 context"。

### 2. context.WithCancel — 手动取消

```go
func WithCancel(parent Context) (ctx Context, cancel CancelFunc)
```

返回一个子 context 和一个取消函数。调用 `cancel()` 时，子 context 的 `Done()` channel 会被关闭，所有监听它的 goroutine 都会收到信号。

```go
func main() {
    ctx, cancel := context.WithCancel(context.Background())

    go worker(ctx, "worker-1")
    go worker(ctx, "worker-2")

    time.Sleep(3 * time.Second)
    fmt.Println("主协程：通知所有 worker 停止")
    cancel() // 手动发出取消信号，同时释放资源

    time.Sleep(1 * time.Second) // 等待 worker 退出
}

func worker(ctx context.Context, name string) {
    for {
        select {
        case <-ctx.Done():
            fmt.Printf("%s: 收到取消信号，退出。原因: %v\n", name, ctx.Err())
            return
        default:
            fmt.Printf("%s: 工作中...\n", name)
            time.Sleep(1 * time.Second)
        }
    }
}
```

输出：

```
worker-1: 工作中...
worker-2: 工作中...
worker-1: 工作中...
worker-2: 工作中...
worker-1: 工作中...
worker-2: 工作中...
主协程：通知所有 worker 停止
worker-1: 收到取消信号，退出。原因: context canceled
worker-2: 收到取消信号，退出。原因: context canceled
```

### 3. context.WithTimeout — 超时自动取消

```go
func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc)
```

在指定时间后自动取消。这是 HTTP 客户端调用、数据库查询等场景的标配。

```go
func queryDatabase(ctx context.Context) (string, error) {
    // 模拟一个可能很慢的数据库查询
    select {
    case <-time.After(5 * time.Second): // 查询需要 5 秒
        return "查询结果", nil
    case <-ctx.Done():
        return "", fmt.Errorf("查询被取消: %w", ctx.Err())
    }
}

func main() {
    // 设置 2 秒超时
    ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
    defer cancel()

    result, err := queryDatabase(ctx)
    if err != nil {
        fmt.Println("错误:", err) // 输出: 错误: 查询被取消: context deadline exceeded
        return
    }
    fmt.Println("结果:", result)
}
```

### 4. context.WithDeadline — 指定截止时间

```go
func WithDeadline(parent Context, d time.Time) (Context, CancelFunc)
```

和 `WithTimeout` 类似，但接受的是一个绝对时间点而非相对时长。实际上 `WithTimeout` 内部就是调用的 `WithDeadline`：

```go
// 标准库源码
func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc) {
    return WithDeadline(parent, time.Now().Add(timeout))
}
```

使用场景：当你需要让多个操作共享同一个截止时间时，`WithDeadline` 更直观。

```go
func main() {
    deadline := time.Now().Add(3 * time.Second)

    ctx, cancel := context.WithDeadline(context.Background(), deadline)
    defer cancel()

    // 检查还剩多少时间
    if d, ok := ctx.Deadline(); ok {
        fmt.Printf("截止时间: %v, 剩余: %v\n", d, time.Until(d))
    }
}
```

### 5. context.WithValue — 传递请求级数据

```go
func WithValue(parent Context, key, val any) Context
```

在 context 中附加一个键值对。常用于传递 traceID、用户认证信息等 request-scoped 数据。

```go
// 推荐使用自定义类型作为 key，避免冲突
type contextKey string

const (
    keyTraceID contextKey = "traceID"
    keyUserID  contextKey = "userID"
)

func middleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // 注入 traceID
        traceID := generateTraceID()
        ctx := context.WithValue(r.Context(), keyTraceID, traceID)

        // 注入用户信息
        userID := authenticate(r)
        ctx = context.WithValue(ctx, keyUserID, userID)

        next(w, r.WithContext(ctx))
    }
}

func handler(w http.ResponseWriter, r *http.Request) {
    traceID, _ := r.Context().Value(keyTraceID).(string)
    userID, _ := r.Context().Value(keyUserID).(string)
    fmt.Fprintf(w, "trace=%s, user=%s", traceID, userID)
}
```

## 三、横向对比：如何选择正确的 Context

面对这么多创建方式，实际开发中该怎么选？以下从多个维度做对比。

### WithCancel vs WithTimeout vs WithDeadline

| 维度 | WithCancel | WithTimeout | WithDeadline |
|------|-----------|-------------|-------------|
| 取消方式 | 手动调用 cancel() | 超时自动 + 手动 | 超时自动 + 手动 |
| 时间参数 | 无 | 相对时长 (Duration) | 绝对时间点 (Time) |
| 底层实现 | cancelCtx | timerCtx（内部调 WithDeadline） | timerCtx |
| 典型场景 | 手动控制 goroutine 生命周期 | 单次操作限时（DB 查询、HTTP 调用） | 多个操作共享同一截止时间 |

选择原则：
- 不需要超时 → `WithCancel`
- 限制单个操作耗时 → `WithTimeout`（更直观）
- 多个操作共享同一个截止时间 → `WithDeadline`（避免各自计算剩余时间）

```go
// 场景：一个请求内，DB 和 Redis 必须在同一时刻前完成
deadline := time.Now().Add(5 * time.Second)

// 用 WithDeadline：两个操作共享截止时间，语义清晰
dbCtx, c1 := context.WithDeadline(ctx, deadline)
defer c1()
redisCtx, c2 := context.WithDeadline(ctx, deadline)
defer c2()

// 用 WithTimeout：需要各自计算剩余时间，容易出现微小偏差
dbCtx, c1 := context.WithTimeout(ctx, 5*time.Second)    // 从现在开始 5 秒
defer c1()
// ... 中间可能已经过了几毫秒
redisCtx, c2 := context.WithTimeout(ctx, 5*time.Second) // 又从现在开始 5 秒，比 DB 晚
defer c2()
```

### 普通版 vs Cause 版

| 维度 | WithCancel / WithTimeout | WithCancelCause / WithTimeoutCause |
|------|--------------------------|-----------------------------------|
| 取消后 Err() | `context.Canceled` 或 `DeadlineExceeded` | 同左（不变） |
| 取消后 Cause() | 等同于 Err() | 返回你传入的自定义 error |
| 适用场景 | 只需知道"被取消了" | 需要知道"为什么被取消" |
| 性能开销 | 略低 | 多存一个 cause 字段，可忽略 |

选择原则：
- 简单场景（单层调用）→ 普通版足够
- 微服务链路 / 需要精确排查超时原因 → Cause 版

```go
// 普通版：只知道超时了
ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
defer cancel()
// ctx.Err() → "context deadline exceeded"  但不知道是哪个环节

// Cause 版：精确定位
ctx, cancel := context.WithTimeoutCause(parentCtx, 2*time.Second,
    fmt.Errorf("调用用户服务超时"))
defer cancel()
// context.Cause(ctx) → "调用用户服务超时"  一目了然
```

### WithoutCancel vs 直接传父 context

> `WithoutCancel` 和 `AfterFunc` 是 Go 1.21 新增的 API，详见[第七节](#七context-api-演进go-120--126)。这里先从选型角度做对比。

| 维度 | 传父 context | WithoutCancel |
|------|-------------|---------------|
| 父取消时 | 子也取消 | 子不受影响 |
| 继承 Value | 是 | 是 |
| 继承 Deadline | 是 | 否 |
| 典型场景 | 绝大多数情况 | 请求结束后的异步任务（审计日志、指标上报） |

**注意**：`WithoutCancel` 返回的 context 没有 `Done()` channel（返回 nil），也没有 `Deadline`。如果你的异步任务本身也需要超时控制，需要再套一层 `WithTimeout`：

```go
func handler(w http.ResponseWriter, r *http.Request) {
    // 脱离请求生命周期，但给异步任务设置独立超时
    asyncCtx := context.WithoutCancel(r.Context())
    asyncCtx, cancel := context.WithTimeout(asyncCtx, 10*time.Second)

    go func() {
        defer cancel()
        writeAuditLog(asyncCtx, "user accessed resource")
    }()
}
```

### 快速选型指南

| 你的需求 | 选择 |
|---------|------|
| 仅传值，不需要取消 | `WithValue` |
| 手动取消 goroutine | `WithCancel` / `WithCancelCause` |
| 限制操作耗时 | `WithTimeout` / `WithTimeoutCause` |
| 多操作共享截止时间 | `WithDeadline` / `WithDeadlineCause` |
| 脱离父 context 生命周期 | `WithoutCancel` |
| 取消后执行清理回调 | `AfterFunc` |

需要排查"为什么被取消"时，选 Cause 版本。

## 四、Context 的树形结构

Context 的核心设计是**父子关系形成的树**。理解这棵树，就理解了 context 的精髓。

```
Background (根)
├── WithCancel (请求级)
│   ├── WithTimeout (数据库查询, 2s)
│   ├── WithTimeout (Redis 查询, 1s)
│   └── WithCancel (下游 RPC 调用)
│       ├── WithTimeout (服务A, 3s)
│       └── WithTimeout (服务B, 3s)
```

关键规则：

- **取消向下传播**：父 context 取消时，所有子 context 自动取消
- **取消不向上传播**：子 context 取消不影响父 context
- **超时取最短**：子 context 的超时不能超过父 context 的剩余时间

```go
func main() {
    // 父 context: 5 秒超时
    parent, cancelParent := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancelParent()

    // 子 context: 2 秒超时 — 实际生效 2 秒
    child1, cancel1 := context.WithTimeout(parent, 2*time.Second)
    defer cancel1()

    // 子 context: 10 秒超时 — 实际生效 5 秒（受父 context 限制）
    child2, cancel2 := context.WithTimeout(parent, 10*time.Second)
    defer cancel2()

    select {
    case <-child1.Done():
        fmt.Println("child1 超时") // 2 秒后触发
    }

    select {
    case <-child2.Done():
        fmt.Println("child2 超时") // 5 秒后触发（跟随父 context）
    }
}
```

## 五、实战：HTTP 服务中的 Context

一个完整的例子，展示 context 在真实 HTTP 服务中的使用方式：

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "time"
)

type contextKey string

const keyRequestID contextKey = "requestID"

// 模拟数据库查询
func fetchUser(ctx context.Context, id string) (map[string]string, error) {
    dbCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
    defer cancel()

    select {
    case <-time.After(1 * time.Second): // 正常情况 1 秒返回
        return map[string]string{"id": id, "name": "张三"}, nil
    case <-dbCtx.Done():
        return nil, fmt.Errorf("数据库查询超时: %w", dbCtx.Err())
    }
}

// 模拟调用下游服务
func fetchOrders(ctx context.Context, userID string) ([]string, error) {
    select {
    case <-time.After(500 * time.Millisecond):
        return []string{"order-001", "order-002"}, nil
    case <-ctx.Done():
        return nil, fmt.Errorf("获取订单失败: %w", ctx.Err())
    }
}

func userHandler(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    reqID := ctx.Value(keyRequestID)

    log.Printf("[%s] 开始处理请求", reqID)

    // 并发查询用户信息和订单
    type userResult struct {
        data map[string]string
        err  error
    }
    type orderResult struct {
        data []string
        err  error
    }

    userCh := make(chan userResult, 1)
    orderCh := make(chan orderResult, 1)

    go func() {
        data, err := fetchUser(ctx, "123")
        userCh <- userResult{data, err}
    }()

    go func() {
        data, err := fetchOrders(ctx, "123")
        orderCh <- orderResult{data, err}
    }()

    // 等待结果，同时监听 context 取消
    var user map[string]string
    var orders []string

    for i := 0; i < 2; i++ {
        select {
        case ur := <-userCh:
            if ur.err != nil {
                http.Error(w, ur.err.Error(), http.StatusInternalServerError)
                return
            }
            user = ur.data
        case or := <-orderCh:
            if or.err != nil {
                http.Error(w, or.err.Error(), http.StatusInternalServerError)
                return
            }
            orders = or.data
        case <-ctx.Done():
            log.Printf("[%s] 请求被取消: %v", reqID, ctx.Err())
            return
        }
    }

    resp := map[string]any{"user": user, "orders": orders}
    json.NewEncoder(w).Encode(resp)
    log.Printf("[%s] 请求处理完成", reqID)
}

// 中间件：注入 requestID + 设置总超时
func withRequestContext(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
        defer cancel()

        reqID := fmt.Sprintf("req-%d", time.Now().UnixNano()) // 示例简化，生产环境建议用 UUID
        ctx = context.WithValue(ctx, keyRequestID, reqID)

        next(w, r.WithContext(ctx))
    }
}

func main() {
    http.HandleFunc("/user", withRequestContext(userHandler))
    log.Println("服务启动在 :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

## 六、使用 Context 的最佳实践

### 1. 始终 defer cancel()

```go
ctx, cancel := context.WithTimeout(parentCtx, 5*time.Second)
defer cancel() // 即使操作提前完成，也要释放资源
```

不调用 `cancel()` 会导致 context 内部的 timer 泄漏，直到父 context 被取消。

### 2. context 作为函数第一个参数

这是 Go 社区的强约定：

```go
// 正确
func GetUser(ctx context.Context, id string) (*User, error)

// 错误 — 不要把 context 放在其他位置
func GetUser(id string, ctx context.Context) (*User, error)

// 错误 — 不要把 context 放在结构体里
type Service struct {
    ctx context.Context // 不推荐
}
```

### 3. 不要用 WithValue 传递业务参数

`WithValue` 应该只用于传递 request-scoped 的元数据（traceID、认证信息等），不要用它替代函数参数：

```go
// 错误 — 把业务参数塞进 context
ctx = context.WithValue(ctx, "userID", userID)
ctx = context.WithValue(ctx, "page", 1)
ctx = context.WithValue(ctx, "pageSize", 20)
result := queryUsers(ctx)

// 正确 — 业务参数走函数签名
result := queryUsers(ctx, userID, page, pageSize)
```

原因：`Value()` 返回 `any`，没有类型安全，也没有编译期检查。

### 4. 检查 context 是否已取消

在长时间运行的循环中，定期检查 context 状态：

```go
func processItems(ctx context.Context, items []Item) error {
    for i, item := range items {
        // 每次迭代检查是否被取消
        if ctx.Err() != nil {
            return fmt.Errorf("处理在第 %d 项中断: %w", i, ctx.Err())
        }
        process(item)
    }
    return nil
}
```

### 5. 合理设置超时层级

```go
// 请求总超时 10 秒
reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
defer cancel()

// 数据库查询 3 秒（在请求超时内）
dbCtx, dbCancel := context.WithTimeout(reqCtx, 3*time.Second)
defer dbCancel()

// 缓存查询 1 秒（在请求超时内）
cacheCtx, cacheCancel := context.WithTimeout(reqCtx, 1*time.Second)
defer cacheCancel()
```

## 七、Context API 演进（Go 1.20 → 1.26）

context 包在 Go 1.20 之后经历了一轮重要的 API 扩展。以下按版本梳理所有新增内容。

### Go 1.20：Cause 系列 — 让取消原因可追溯

在 Go 1.20 之前，context 被取消后只能通过 `Err()` 得到 `context.Canceled` 或 `context.DeadlineExceeded`，无法知道"为什么被取消"。Cause 系列 API 解决了这个问题。

**WithCancelCause** — 取消时附带自定义错误：

```go
ctx, cancel := context.WithCancelCause(parentCtx)

// 取消时传入具体原因
cancel(fmt.Errorf("上游服务 %s 返回 503", serviceName))

// 获取取消原因
cause := context.Cause(ctx)
fmt.Println(cause) // "上游服务 xxx 返回 503"

// Err() 仍然返回 context.Canceled，但 Cause() 返回你传入的错误
fmt.Println(ctx.Err()) // context canceled
```

### Go 1.21：四个重要新增

**WithDeadlineCause / WithTimeoutCause** — 超时时附带自定义原因：

```go
// WithTimeoutCause：相对时间版本
ctx, cancel := context.WithTimeoutCause(
    parentCtx,
    2*time.Second,
    fmt.Errorf("调用支付服务超时"),
)
defer cancel()

select {
case <-time.After(5 * time.Second):
    fmt.Println("完成")
case <-ctx.Done():
    fmt.Println(context.Cause(ctx)) // "调用支付服务超时"
}

// WithDeadlineCause：绝对时间版本，用法类似
// ctx, cancel := context.WithDeadlineCause(parentCtx, time.Now().Add(3*time.Second), cause)
```

当一个请求链路涉及多个下游调用时，每个调用都可以附带独立的超时原因，排查问题时一目了然。

**WithoutCancel** — 创建不随父 context 取消的子 context，但仍继承 `Value`：

```go
// 场景：请求结束后仍需执行的异步任务（如写审计日志）
func handler(w http.ResponseWriter, r *http.Request) {
    // 请求结束后 r.Context() 会被取消
    // 但审计日志需要继续执行
    auditCtx := context.WithoutCancel(r.Context())
    go writeAuditLog(auditCtx, "user accessed resource")
}
```

**AfterFunc** — 在 context 取消后执行回调：

```go
ctx, cancel := context.WithCancel(parentCtx)
defer cancel()

stop := context.AfterFunc(ctx, func() {
    log.Println("context 被取消，执行清理工作")
    cleanup()
})
defer stop() // 如果不再需要回调，可以提前取消注册
```

### Go 1.24：testing 包集成 Context

Go 1.24 为 `testing.T` 和 `testing.B` 新增了 `Context()` 方法，返回一个在测试结束后（cleanup 之前）自动取消的 context：

```go
func TestUserService(t *testing.T) {
    // 不再需要手动创建 context
    // t.Context() 会在测试结束时自动取消
    ctx := t.Context()

    user, err := service.GetUser(ctx, "123")
    if err != nil {
        t.Fatal(err)
    }
    // ...
}
```

这消除了测试代码中大量的 `context.Background()` 样板，也让测试超时能自动传播到被测函数。

### Go 1.26：生态持续完善

Go 1.26 本身没有对 context 包新增 API，但相关生态有重要变化：

- **Green Tea GC 默认启用**：GC 开销降低 10–40%，高并发场景下大量 context 的创建和回收更高效
- **cgo 调用开销降低约 30%**：如果你的 context 跨越 cgo 边界（如调用 C 库），性能显著提升
- **`errors.AsType` 泛型函数**：配合 `context.Cause()` 使用，类型安全地提取取消原因中的特定错误类型

```go
// Go 1.26: 用 errors.AsType 替代 errors.As，更简洁
ctx, cancel := context.WithCancelCause(parentCtx)
cancel(&TimeoutError{Service: "payment", Duration: 3 * time.Second})

// 类型安全地提取 cause
if te, ok := errors.AsType[*TimeoutError](context.Cause(ctx)); ok {
    log.Printf("服务 %s 超时 %v", te.Service, te.Duration)
}
```

### 完整 API 速查表（截至 Go 1.26）

| 函数 | 引入版本 | 作用 |
|------|---------|------|
| `Background()` | 1.7 | 返回空的根 context |
| `TODO()` | 1.7 | 占位用的空 context |
| `WithValue()` | 1.7 | 附加键值对 |
| `WithCancel()` | 1.7 | 手动取消 |
| `WithDeadline()` | 1.7 | 指定截止时间 |
| `WithTimeout()` | 1.7 | 指定超时时长 |
| `WithCancelCause()` | 1.20 | 取消时附带原因 |
| `Cause()` | 1.20 | 获取取消原因 |
| `WithDeadlineCause()` | 1.21 | 截止时间 + 自定义原因 |
| `WithTimeoutCause()` | 1.21 | 超时 + 自定义原因 |
| `WithoutCancel()` | 1.21 | 不随父取消的子 context |
| `AfterFunc()` | 1.21 | 取消后执行回调 |
| `t.Context()` / `b.Context()` | 1.24 | 测试中自动管理 context |

## 八、常见陷阱

了解了 API 的演进，再来看看实际使用中最容易踩的坑。

### 陷阱 1：忘记调用 cancel

```go
// 内存泄漏！timer 不会被释放
ctx, _ := context.WithTimeout(parentCtx, 5*time.Second)
```

`go vet` 会对此发出警告。始终接收并 defer 调用 cancel。

### 陷阱 2：用 string 类型作为 Value 的 key

```go
// 危险：不同包可能用相同的 string key，导致冲突
ctx = context.WithValue(ctx, "userID", "123")

// 安全：自定义未导出类型，包级别隔离
type ctxKey struct{}
ctx = context.WithValue(ctx, ctxKey{}, "123")
```

### 陷阱 3：在 context 取消后继续使用

```go
ctx, cancel := context.WithTimeout(parentCtx, 1*time.Second)
defer cancel()

conn, err := db.Conn(ctx)
if err != nil {
    return err
}
// 此时 ctx 可能已经超时
// 用已取消的 ctx 执行查询会立即失败
rows, err := conn.QueryContext(ctx, "SELECT ...") // 可能立即返回错误
```

解决方案：如果后续操作需要独立的超时控制，为它创建新的 context：

```go
conn, err := db.Conn(ctx)
if err != nil {
    return err
}
queryCtx, queryCancel := context.WithTimeout(context.Background(), 3*time.Second)
defer queryCancel()
rows, err := conn.QueryContext(queryCtx, "SELECT ...")
```

## 九、源码解析：context 的内部实现

> 以下源码基于 Go 1.26（`$GOROOT/src/context/context.go`），核心逻辑自 Go 1.7 以来保持稳定。理解源码能帮你在复杂场景下做出更好的判断。

### 9.1 内部类型总览

整个 context 包只有五种核心 struct：

```
Context (接口)
├── emptyCtx        → Background() / TODO() 返回（值类型，零分配，Done() 返回 nil）
├── cancelCtx       → WithCancel() 返回（取消机制的核心）
│   ├── timerCtx    → WithDeadline() / WithTimeout() 返回
│   └── afterFuncCtx → AfterFunc() 内部使用
├── valueCtx        → WithValue() 返回（链表式键值存储）
└── withoutCancelCtx → WithoutCancel() 返回（切断取消链，保留 Value）
```

`emptyCtx` 是一切的起点——`Background()` 和 `TODO()` 返回的就是它的包装类型 `backgroundCtx{}` 和 `todoCtx{}`，四个方法全部返回零值，唯一区别是 `String()` 返回不同的名字方便调试。

### 9.2 cancelCtx — 取消机制的核心

这是整个 context 包最重要的结构体：

```go
// 源码
type cancelCtx struct {
    Context                          // 嵌入父 context（形成链表/树）

    mu       sync.Mutex             // 保护以下字段
    done     atomic.Value           // chan struct{}，懒创建，首次 cancel 时关闭
    children map[canceler]struct{}  // 子 context 集合，首次 cancel 时置 nil
    err      atomic.Value           // 首次 cancel 时设置
    cause    error                  // 取消原因（Cause 系列 API 使用）
}
```

关键设计点：

**1) Done() channel 懒创建**

```go
// 源码
func (c *cancelCtx) Done() <-chan struct{} {
    d := c.done.Load()
    if d != nil {
        return d.(chan struct{})
    }
    c.mu.Lock()
    defer c.mu.Unlock()
    d = c.done.Load()
    if d == nil {
        d = make(chan struct{})
        c.done.Store(d)
    }
    return d.(chan struct{})
}
```

使用了 double-check locking 模式：先用 atomic 无锁快速检查，miss 后才加锁创建。如果一个 context 从未被 `select` 监听过 `Done()`，channel 就不会被创建，节省内存。

**2) Err() 用 atomic 而非 mutex**

```go
// 源码
func (c *cancelCtx) Err() error {
    if err := c.err.Load(); err != nil {
        <-c.Done()  // 确保 done channel 已关闭
        return err.(error)
    }
    return nil
}
```

源码注释说得很直白：`atomic load 比 mutex 快约 5 倍`。在高频调用 `ctx.Err()` 的热循环中，这个优化很有意义。注意它在返回非 nil error 前会先 `<-c.Done()`，确保 done channel 已经关闭——这保证了 `Err()` 和 `Done()` 的一致性。

**3) cancel() — 取消的核心逻辑**

```go
// 源码（简化注释）
func (c *cancelCtx) cancel(removeFromParent bool, err, cause error) {
    if cause == nil {
        cause = err
    }
    c.mu.Lock()
    if c.err.Load() != nil {
        c.mu.Unlock()
        return // 已经取消过了，幂等
    }
    c.err.Store(err)
    c.cause = cause

    // 关闭 done channel
    d, _ := c.done.Load().(chan struct{})
    if d == nil {
        c.done.Store(closedchan) // 复用全局已关闭 channel
    } else {
        close(d)
    }

    // 递归取消所有子 context
    for child := range c.children {
        child.cancel(false, err, cause)
    }
    c.children = nil
    c.mu.Unlock()

    if removeFromParent {
        removeChild(c.Context, c)
    }
}
```

几个精妙之处：
- **幂等**：多次调用 cancel 只有第一次生效
- **closedchan 复用**：如果 Done() 从未被调用过（d == nil），直接存入一个全局的已关闭 channel，避免创建再关闭
- **递归取消**：遍历 children map，逐个取消子 context——这就是"取消向下传播"的实现
- **先取消子，再从父移除**：避免在持有父锁时操作父的 children map

**4) propagateCancel() — 建立父子关系**

```go
// 源码（简化）
func (c *cancelCtx) propagateCancel(parent Context, child canceler) {
    c.Context = parent

    done := parent.Done()
    if done == nil {
        return // 父 context 永远不会取消（如 Background），无需传播
    }

    select {
    case <-done:
        child.cancel(false, parent.Err(), Cause(parent))
        return // 父已取消，立即取消子
    default:
    }

    if p, ok := parentCancelCtx(parent); ok {
        // 父是标准 cancelCtx：直接加入 children map（高效）
        p.mu.Lock()
        if err := p.err.Load(); err != nil {
            child.cancel(false, err.(error), p.cause)
        } else {
            if p.children == nil {
                p.children = make(map[canceler]struct{})
            }
            p.children[child] = struct{}{}
        }
        p.mu.Unlock()
    } else if a, ok := parent.(afterFuncer); ok {
        // 父实现了 AfterFunc 接口：用 AfterFunc 注册取消回调
        stop := a.AfterFunc(func() {
            child.cancel(false, parent.Err(), Cause(parent))
        })
        c.Context = stopCtx{Context: parent, stop: stop}
    } else {
        // 父是自定义 Context 实现：启动 goroutine 监听
        go func() {
            select {
            case <-parent.Done():
                child.cancel(false, parent.Err(), Cause(parent))
            case <-child.Done():
            }
        }()
    }
}
```

这个函数体现了 context 包的分层优化策略：

| 父 context 类型 | 传播方式 | 开销 |
|-----------------|---------|------|
| `Background`/`TODO`（Done 为 nil） | 不传播 | 零开销 |
| 标准 `cancelCtx` | 加入 children map | O(1)，无 goroutine |
| 实现了 `AfterFunc` 接口 | 注册回调 | 无 goroutine |
| 自定义 Context 实现 | 启动 goroutine 监听 | 一个 goroutine |

绝大多数场景走的是前两条路径，不需要额外 goroutine。

### 9.3 timerCtx — 在 cancelCtx 上加定时器

```go
// 源码
type timerCtx struct {
    cancelCtx
    timer    *time.Timer
    deadline time.Time
}
```

`WithDeadline` 的核心逻辑：

```go
// 源码（简化）
func WithDeadlineCause(parent Context, d time.Time, cause error) (Context, CancelFunc) {
    // 关键优化：如果父的 deadline 更早，直接退化为 WithCancel
    if cur, ok := parent.Deadline(); ok && cur.Before(d) {
        return WithCancel(parent)
    }

    c := &timerCtx{deadline: d}
    c.cancelCtx.propagateCancel(parent, c)

    dur := time.Until(d)
    if dur <= 0 {
        c.cancel(true, DeadlineExceeded, cause) // 已过期，立即取消
        return c, func() { c.cancel(false, Canceled, nil) }
    }

    c.mu.Lock()
    defer c.mu.Unlock()
    if c.err.Load() == nil {
        c.timer = time.AfterFunc(dur, func() {
            c.cancel(true, DeadlineExceeded, cause)
        })
    }
    return c, func() { c.cancel(true, Canceled, nil) }
}
```

两个重要优化：
- **父 deadline 更早时退化**：如果父 context 的截止时间比你设置的更早，子 context 一定会被父先取消，所以没必要创建 timer，直接退化为 `WithCancel`
- **cancel 时停止 timer**：`timerCtx.cancel()` 会调用 `c.timer.Stop()`，这就是为什么 `defer cancel()` 很重要——它释放了 timer 资源

### 9.4 valueCtx 与 withoutCancelCtx

**valueCtx** — 每个 `WithValue` 只存一个键值对，查找时沿链表向上遍历：

```go
type valueCtx struct {
    Context
    key, val any
}

func (c *valueCtx) Value(key any) any {
    if c.key == key {
        return c.val
    }
    return value(c.Context, key) // 向上查找
}
```

内部的 `value()` 函数用 **for 循环替代递归**（避免深层链表导致栈溢出），通过 type switch 逐层向上查找。查找复杂度 O(n)，n 是 context 链深度——这也是不建议用 `WithValue` 存大量数据的原因。

**withoutCancelCtx** — 用普通字段 `c Context`（而非嵌入）持有父 context：

```go
type withoutCancelCtx struct {
    c Context  // 注意：不是嵌入
}

func (withoutCancelCtx) Done() <-chan struct{} { return nil }  // 永不取消
func (withoutCancelCtx) Err() error            { return nil }
func (c withoutCancelCtx) Value(key any) any   { return value(c, key) } // 仍继承值
```

不嵌入意味着 `Done()` 和 `Deadline()` 不会委托给父 context，从而切断了取消传播链，同时 `Value()` 仍能沿链查找——这就是"脱离生命周期但保留上下文数据"的实现。

### 9.5 设计启示

从源码中可以提炼出几个值得学习的设计模式：

1. **接口小而精**：`Context` 只有 4 个方法，但支撑了整个并发控制体系。`canceler` 内部接口只有 2 个方法。
2. **懒初始化**：Done channel 只在被监听时才创建，closedchan 全局复用。
3. **分层优化**：`propagateCancel` 针对不同父类型选择最优传播策略，避免不必要的 goroutine。
4. **循环替代递归**：`value()` 函数用 for + type switch 替代递归调用，避免深层链表导致栈溢出。
5. **atomic + mutex 混用**：热路径（`Err()`）用 atomic，冷路径（`cancel()`）用 mutex，在正确性和性能间取得平衡。

## 总结

context 包从 Go 1.7 引入至今（Go 1.26），已经发展为一套完整的并发控制工具集（完整 API 见[第七节速查表](#完整-api-速查表截至-go-126)）。

记住三条核心原则：

1. **context 是请求的生命线** — 它控制着整棵 goroutine 调用树的生死
2. **取消向下传播** — 父取消，子必取消；子取消，父不受影响
3. **始终 defer cancel()** — 这是防止资源泄漏的最后一道防线

掌握了 context，你就掌握了 Go 并发编程中最重要的协作机制。
