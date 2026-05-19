---
title: Hertz + pgxpool + sqlc——Go 高性能 API 服务的黄金三角
published: 2026-05-19
description: 从架构选型到完整实现，剖析 Hertz + pgxpool + sqlc 这套组合为什么能在 Go 生态里做到全链路无反射、零运行时开销、类型安全的数据库访问。
tags: [Go, Hertz, PostgreSQL, pgx, sqlc, 高性能]
category: 后端
draft: false
---

Go 写 API 服务，技术选型的核心问题就三个：网络层用什么、数据库怎么连、查询怎么写。

这三个问题的答案如果选对了，整条链路上几乎没有多余的抽象——请求进来，路由匹配，拿连接，执行 SQL，返回结果。每一步都是最短路径。

这篇文章要讲的组合是：**Hertz**（网络层）+ **pgxpool**（连接池）+ **sqlc**（查询层）。先说为什么选它们，再给一个完整可运行的最小示例。

先放全局地图：

| 层 | 选择 | 核心优势 | 替代方案及其代价 |
|---|---|---|---|
| 网络层 | Hertz | netpoll 事件驱动，路由代码生成 | net/http（性能低）、Gin（反射绑定） |
| 连接池 | pgxpool | 原生 PG 协议，binary format | database/sql（多一层抽象、text protocol） |
| 查询层 | sqlc | 编译期类型安全，零运行时 | GORM（反射）、sqlx（运行时 tag 扫描） |

关键洞察：**这三层的设计哲学高度一致——都在编译期/启动期把能做的事做完，运行时只做最少的事**。

## 为什么是这三个

选技术栈不是选"最好的"，是选"组合起来摩擦最小的"。这三个能放在一起，是因为它们共享同一个设计原则：**把工作往编译期推，运行时只做不得不做的事**。

- Hertz 用 `hz` 工具从 IDL 生成路由代码和参数绑定代码，运行时不需要反射解析 struct tag
- pgxpool 用 PostgreSQL 的 binary protocol，类型转换在驱动层编译期确定，不走 `database/sql` 的 `driver.Value` interface 装箱
- sqlc 在 `generate` 阶段把 SQL 编译成 Go 函数，运行时就是直接的 `pool.Query` + `rows.Scan`

三层叠起来，一个请求从进入到返回，**没有一次 `reflect` 调用**（除了 JSON 序列化，这个用 sonic 也能干掉）。

对比一下常见的替代组合：

| 组合 | 运行时反射点 |
|---|---|
| Gin + GORM + database/sql | 路由参数绑定、ORM 查询构建、ORM 结果扫描、driver.Value 装箱 |
| Echo + sqlx + database/sql | 路由参数绑定、struct tag 扫描、driver.Value 装箱 |
| Hertz + pgxpool + sqlc | JSON 序列化（可用 sonic 消除） |

这不是说反射就一定慢——简单场景下网络延迟远大于反射开销。但在高并发（万级 QPS）、大结果集（千行以上）的场景下，反射的 CPU 开销会成为瓶颈。而且更重要的是：**反射意味着运行时才能发现的错误**。字段拼错、类型不匹配，这些问题越早发现越好。

## Hertz：不只是"又一个 Web 框架"

Hertz 是 CloudWeGo 体系下的 HTTP 框架，字节内部大规模使用。它跟 Gin/Echo 的核心区别不在 API 设计（其实很像），而在底层：

**1. netpoll 替代 net/http**

标准库的 `net/http` 是 goroutine-per-connection 模型——每个连接一个 goroutine，连接多了 goroutine 调度开销大。Hertz 底层用 `cloudwego/netpoll`，基于 epoll/kqueue 的事件驱动模型，在大量并发连接下调度开销更低。

**2. 代码生成的路由和参数绑定**

`hz` 工具从 Thrift/Protobuf IDL 生成 handler 骨架和路由注册代码。参数绑定不是运行时反射 struct tag，而是生成的代码直接从请求里取值。当然你也可以不用 IDL，手写路由——这时参数绑定走的是 Hertz 自己的 binding 库，性能也比 Gin 的反射绑定好（内部有缓存优化）。

**3. 分层网络库设计**

Hertz 把网络层（netpoll）、协议层（HTTP1/HTTP2）、路由层分开。你可以只替换网络层（比如在不支持 epoll 的平台回退到标准库），上层代码不用改。

对于本文的场景，Hertz 的关键价值是：**高并发下稳定的低延迟，以及和 CloudWeGo 生态（Kitex、Volo）的无缝集成**。

## pgxpool：为什么不用 database/sql

大部分 Go 教程会教你用 `database/sql` + `lib/pq` 或 `pgx/stdlib` 连 PostgreSQL。这没问题，但你会多一层抽象，而这层抽象有实实在在的代价。

### database/sql 的抽象税

`database/sql` 是 Go 标准库的通用数据库接口。"通用"意味着它要兼容所有数据库驱动，所以：

- **所有值都走 `driver.Value` 接口**（`int64`、`float64`、`string`、`[]byte`、`time.Time` 之一）。PostgreSQL 的 `uuid`、`jsonb`、`inet`、`int4range` 这些类型？要么转成 string 再解析，要么实现 `Scanner`/`Valuer` 接口。每次都有一次 interface 装箱/拆箱。
- **Text protocol**。`database/sql` 默认用 PostgreSQL 的 text protocol——数据库把结果编码成文本，驱动再解析回 Go 类型。一个 `int64` 要经历：数据库 → 文本 "12345" → `strconv.ParseInt` → `int64`。
- **连接池是黑盒**。`sql.DB` 的连接池行为（idle 连接回收、health check）不够透明，调参靠猜。

### pgx 的原生优势

pgx 直接实现 PostgreSQL wire protocol，不经过 `database/sql`：

- **Binary protocol**。数据库直接发二进制，`int64` 就是 8 字节，不需要文本解析。对于大结果集，这个差距是可测量的。
- **原生类型支持**。`pgtype` 包直接支持 PostgreSQL 的所有类型——`uuid.UUID`、`pgtype.JSONB`、`netip.Addr`、range 类型、composite 类型。不需要 `Scanner`/`Valuer` 的 interface 开销。
- **Batch query**。一次网络往返发多条查询，减少 RTT。`database/sql` 没有这个能力。
- **COPY protocol**。批量插入走 PostgreSQL 的 COPY 协议，比逐行 INSERT 快一个数量级。
- **连接池透明**。pgxpool 的每个配置项都有明确语义：`MaxConns`、`MinConns`、`MaxConnLifetime`、`MaxConnIdleTime`、`HealthCheckPeriod`。

### pgxpool 的连接管理

```go
config, _ := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
config.MaxConns = 20
config.MinConns = 5
config.MaxConnLifetime = 30 * time.Minute
config.MaxConnIdleTime = 5 * time.Minute

pool, _ := pgxpool.NewWithConfig(ctx, config)
```

pgxpool 还支持 `AfterConnect` hook——连接建立后自动注册自定义类型、设置 `search_path`、执行初始化 SQL。这在多租户场景下很有用。

## sqlc + pgx：天然适配

sqlc 从 v1.x 起原生支持 pgx/v5 作为目标驱动。在 `sqlc.yaml` 里设置 `sql_package: "pgx/v5"`，生成的代码就直接用 pgx 的类型和接口，不经过 `database/sql`。

这意味着：

- 生成的 `DBTX` 接口匹配 `pgxpool.Pool` 和 `pgx.Tx`，不需要适配层
- 返回类型直接用 `pgtype.Text`、`pgtype.Timestamptz` 等原生类型（如果你配置了的话）
- Batch query 和 COPY 可以和 sqlc 生成的代码无缝配合

```yaml
version: "2"
sql:
  - schema: "schema.sql"
    queries: "query/"
    engine: "postgresql"
    gen:
      go:
        package: "db"
        out: "internal/db"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_empty_slices: true
```

生成的接口：

```go
type DBTX interface {
  Exec(context.Context, string, ...interface{}) (pgconn.CommandTag, error)
  Query(context.Context, string, ...interface{}) (pgx.Rows, error)
  QueryRow(context.Context, string, ...interface{}) pgx.Row
}
```

`pgxpool.Pool` 天然实现这个接口。所以初始化就是一行：

```go
queries := db.New(pool)
```

不需要 wrapper、不需要适配器、不需要中间层。

## 完整示例：从零搭建

下面是一个最小但完整的示例——一个 todo API，包含创建和列表两个接口。

### 目录结构

```
.
├── sqlc.yaml
├── schema.sql
├── query/
│   └── todo.sql
├── internal/
│   └── db/          ← sqlc 生成的代码
├── handler/
│   └── todo.go
└── main.go
```

### schema.sql

```sql
CREATE TABLE todos (
  id         BIGSERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### query/todo.sql

```sql
-- name: CreateTodo :one
INSERT INTO todos (title) VALUES ($1) RETURNING *;

-- name: ListTodos :many
SELECT * FROM todos ORDER BY created_at DESC LIMIT $1;

-- name: MarkDone :exec
UPDATE todos SET done = true WHERE id = $1;
```

### main.go

```go
package main

import (
  "context"
  "os"

  "github.com/cloudwego/hertz/pkg/app/server"
  "github.com/jackc/pgx/v5/pgxpool"
  "yourmod/handler"
)

func main() {
  pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
  if err != nil {
    panic(err)
  }
  defer pool.Close()

  h := server.Default(server.WithHostPorts(":8080"))

  todoHandler := handler.NewTodoHandler(pool)
  h.POST("/todos", todoHandler.Create)
  h.GET("/todos", todoHandler.List)
  h.PUT("/todos/:id/done", todoHandler.MarkDone)

  h.Spin()
}
```

### handler/todo.go

```go
package handler

import (
  "context"
  "strconv"

  "github.com/cloudwego/hertz/pkg/app"
  "github.com/cloudwego/hertz/pkg/protocol/consts"
  "github.com/jackc/pgx/v5/pgxpool"
  "yourmod/internal/db"
)

type TodoHandler struct {
  q *db.Queries
}

func NewTodoHandler(pool *pgxpool.Pool) *TodoHandler {
  return &TodoHandler{q: db.New(pool)}
}

func (h *TodoHandler) Create(ctx context.Context, c *app.RequestContext) {
  var req struct {
    Title string `json:"title"`
  }
  if err := c.BindJSON(&req); err != nil {
    c.JSON(consts.StatusBadRequest, map[string]string{"error": err.Error()})
    return
  }
  todo, err := h.q.CreateTodo(ctx, req.Title)
  if err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }
  c.JSON(consts.StatusCreated, todo)
}

func (h *TodoHandler) List(ctx context.Context, c *app.RequestContext) {
  limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 32)
  todos, err := h.q.ListTodos(ctx, int32(limit))
  if err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }
  c.JSON(consts.StatusOK, todos)
}

func (h *TodoHandler) MarkDone(ctx context.Context, c *app.RequestContext) {
  id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
  if err := h.q.MarkDone(ctx, id); err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }
  c.Status(consts.StatusNoContent)
}
```

跑起来：

```bash
sqlc generate
go run main.go
```

就这么多。没有 ORM 初始化、没有 model 注册、没有 migration 框架配置。SQL 写好，generate 一下，handler 里直接调用类型安全的函数。

## 三层怎么串起来

看完示例代码，来分析一个请求从进入到返回的完整路径：

```
HTTP POST /todos {"title": "buy milk"}
    ↓
[Hertz] netpoll 收到连接事件，路由匹配到 todoHandler.Create
    ↓
[Handler] c.BindJSON 解析请求体（sonic JSON 解码，无反射）
    ↓
[sqlc] h.q.CreateTodo(ctx, "buy milk")
    ↓  这是生成的代码，展开就是：
    ↓  pool.QueryRow(ctx, "INSERT INTO todos (title) VALUES ($1) RETURNING *", "buy milk")
    ↓
[pgxpool] 从池中取一个连接，发送 binary protocol 请求
    ↓
[PostgreSQL] 执行 INSERT，返回 binary 结果
    ↓
[pgx] 直接把 binary 结果映射到 Go 类型（int64, string, bool, time.Time）
    ↓
[sqlc] rows.Scan 填充生成的 struct
    ↓
[Handler] c.JSON 序列化返回（sonic JSON 编码）
    ↓
HTTP 201 {"id":1,"title":"buy milk","done":false,"created_at":"..."}
```

整条路径上：
- **零反射**（如果用 sonic 替代标准 JSON 库）
- **零 SQL 拼接**（SQL 是编译期常量）
- **零 interface 装箱**（pgx binary protocol 直接到目标类型）
- **零额外内存分配**（没有中间 map、没有临时 struct）

### 事务怎么处理

sqlc 生成的 `Queries` 有 `WithTx` 方法：

```go
func (h *TodoHandler) CreateWithAudit(ctx context.Context, c *app.RequestContext) {
  tx, err := h.pool.Begin(ctx)
  if err != nil {
    // handle error
  }
  defer tx.Rollback(ctx)

  qtx := h.q.WithTx(tx)
  todo, err := qtx.CreateTodo(ctx, req.Title)
  if err != nil {
    // handle error
  }
  err = qtx.CreateAuditLog(ctx, db.CreateAuditLogParams{
    Action:   "create_todo",
    EntityID: todo.ID,
  })
  if err != nil {
    // handle error
  }

  tx.Commit(ctx)
}
```

事务边界完全显式——你能看到哪些操作在同一个事务里，不存在 GORM 那种"不知道这个 `.Save()` 有没有开事务"的困惑。

## 生产环境的补全

最小示例能跑起来，但离生产还差几件事：

### Migration

sqlc 不管 migration。推荐搭配：

- **golang-migrate/migrate**：最成熟，支持 SQL 文件，CLI + Go 库双模式
- **Atlas**：声明式 schema diff，自动生成 migration，更现代但学习成本稍高
- **goose**：轻量，纯 SQL migration，跟 sqlc 的 SQL-first 哲学一致

```bash
# goose 示例
goose -dir migrations postgres "$DATABASE_URL" up
```

### 可观测性

pgx 支持 tracer hook，可以接入 OpenTelemetry：

```go
config, _ := pgxpool.ParseConfig(dbURL)
config.ConnConfig.Tracer = &tracepgx.Tracer{}
```

每条 SQL 的执行时间、参数、错误都会自动上报到你的 tracing 系统。配合 Hertz 的 middleware 做请求级 tracing，整条链路一目了然。

### 连接池调优

生产环境的 pgxpool 配置建议：

```go
config.MaxConns = int32(runtime.NumCPU() * 2)  // CPU 核数 × 2 是起点
config.MinConns = 5                             // 避免冷启动
config.MaxConnLifetime = 30 * time.Minute       // 防止连接老化
config.MaxConnIdleTime = 5 * time.Minute        // 回收闲置连接
config.HealthCheckPeriod = 30 * time.Second     // 定期检查连接可用性
```

如果并发量特别大（万级 QPS），在 pgxpool 前面加一层 PgBouncer（transaction mode）：应用侧维持少量连接到 PgBouncer，PgBouncer 维持少量连接到 PostgreSQL。这样 PostgreSQL 侧的连接数可以控制在很低的水平。

### 错误处理

pgx 的错误类型是结构化的，可以精确匹配：

```go
import "github.com/jackc/pgx/v5/pgconn"

var pgErr *pgconn.PgError
if errors.As(err, &pgErr) {
  switch pgErr.Code {
  case "23505": // unique_violation
    c.JSON(409, map[string]string{"error": "already exists"})
  case "23503": // foreign_key_violation
    c.JSON(400, map[string]string{"error": "referenced entity not found"})
  }
}
```

比 GORM 的 `errors.Is(err, gorm.ErrDuplicatedKey)` 更精确——你能拿到具体是哪个约束冲突了。

### 动态查询的补充方案

sqlc 处理不了的动态查询场景（搜索、多条件过滤），可以局部引入 squirrel：

```go
func (h *TodoHandler) Search(ctx context.Context, c *app.RequestContext) {
  qb := sq.Select("*").From("todos")

  if title := c.Query("title"); title != "" {
    qb = qb.Where("title ILIKE ?", "%"+title+"%")
  }
  if done := c.Query("done"); done != "" {
    qb = qb.Where("done = ?", done == "true")
  }

  query, args, _ := qb.PlaceholderFormat(sq.Dollar).ToSql()
  rows, err := h.pool.Query(ctx, query, args...)
  // ...手动 scan
}
```

这不是"放弃 sqlc"，而是承认不同场景用不同工具。静态查询用 sqlc（类型安全），动态查询用 squirrel（灵活性），两者共存没有冲突。

## 总结

| 层 | 做了什么 | 没做什么 |
|---|---|---|
| Hertz | 路由匹配、参数绑定、中间件 | 不管数据库、不管业务逻辑 |
| pgxpool | 连接管理、协议编解码、类型映射 | 不管 SQL 怎么写、不管结果怎么用 |
| sqlc | SQL 验证、类型推导、代码生成 | 不管网络、不管连接池、运行时不存在 |

每一层只做自己的事，不越界、不重叠。这就是为什么它们能组合得这么干净——没有两层在抢同一个职责。

这套组合的核心价值不是"快"（虽然确实快），而是**可预测**：

- 看到一个 handler，你就知道它会执行哪条 SQL
- 看到一条 SQL，你就知道它的参数和返回值类型
- 看到一个错误，你就知道它来自哪一层

没有魔法、没有隐式行为、没有"框架帮你做了什么你不知道的事"。对于需要长期维护的生产服务来说，这种可预测性比任何性能优势都重要。
