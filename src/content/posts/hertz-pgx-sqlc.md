---
title: Hertz + pgxpool + sqlc——Go 高性能 API 服务的实用组合
published: 2026-05-19
description: 从架构选型到完整实现，剖析 Hertz + pgxpool + sqlc 如何减少运行时反射和动态查询构建，用较低的抽象成本实现类型安全的 PostgreSQL 访问。
tags: [Go, Hertz, PostgreSQL, pgx, sqlc, 高性能]
category: 后端
draft: false
---

Go 写 API 服务，技术选型的核心问题就三个：网络层用什么、数据库怎么连、查询怎么写。

这三个问题的答案如果选对了，整条链路上就不会堆太多多余的抽象——请求进来，路由匹配，拿连接，执行 SQL，返回结果。路径越短，越容易定位问题。

这篇文章要讲的组合是：**Hertz**（网络层）+ **pgxpool**（连接池）+ **sqlc**（查询层）。先说为什么选它们，再给一个完整可运行的最小示例。

先放全局地图：

| 层 | 选择 | 核心优势 | 替代方案及其代价 |
|---|---|---|---|
| 网络层 | Hertz | 高并发连接下的网络模型，CloudWeGo 生态完整 | net/http（生态稳，性能通常足够）、Gin/Echo（API 成熟，但绑定和中间件模型不同） |
| 连接池 | pgxpool | 原生 PG 协议、连接池状态透明、PG 特性支持完整 | database/sql（通用接口更强，但 PG 专属能力要绕一层） |
| 查询层 | sqlc | 静态 SQL 生成类型安全代码 | GORM（抽象高但运行时行为更多）、sqlx（轻量但仍要运行时映射） |

关键洞察：**这三层的设计哲学高度一致——尽量在代码生成、编译期或启动期把能确定的事确定下来，运行时少做动态推断**。

## 为什么是这三个

选技术栈不是选"最好的"，是选"组合起来摩擦最小的"。这三个能放在一起，是因为它们共享同一个设计原则：**尽量把工作往编译期或生成阶段推，运行时少做动态推断**。

- Hertz 可以用 `hz` 工具从 IDL 生成项目骨架、路由注册和类型定义，减少手写胶水代码；不用 IDL 时也可以保持非常薄的 handler
- pgxpool 直接使用 pgx 的 PostgreSQL 协议实现，不经过 `database/sql` 的通用适配层，并且能暴露 Batch、COPY、Listen/Notify、连接池统计等 PG 专属能力
- sqlc 在 `generate` 阶段把 SQL 转成 Go 方法，运行时就是明确的 `Query` / `QueryRow` / `Exec` 和生成的 `Scan`

三层叠起来，一个请求从进入到返回，可以避开 ORM 常见的模型反射、动态 SQL 构建和字段 tag 扫描。需要注意的是，JSON 编解码、请求绑定、`rows.Scan`、网络读写和参数传递仍然是正常的运行时成本；这里追求的是**少一点隐式行为，多一点可预测性**，不是字面意义上的“零开销”。

对比一下常见的替代组合：

| 组合 | 常见运行时成本 |
|---|---|
| Gin + GORM + database/sql | 参数绑定、ORM 查询构建、模型关系处理、通用驱动接口转换 |
| Echo + sqlx + database/sql | 参数绑定、struct tag 映射、通用驱动接口转换 |
| Hertz + pgxpool + sqlc | 请求绑定、JSON 编解码、pgx 参数传递、生成代码里的 `Scan` |

这不是说反射就一定慢——简单场景下网络延迟远大于反射开销。但在高并发（万级 QPS）、大结果集（千行以上）的场景下，重复的动态映射和反射调用会更容易进入性能剖析结果。更重要的是：**依赖运行时映射的代码，很多错误只能在运行时暴露**。字段拼错、类型不匹配，这些问题越早发现越好。

## Hertz：不只是"又一个 Web 框架"

Hertz 是 CloudWeGo 体系下的 HTTP 框架。它跟 Gin/Echo 的核心区别不只是 API 设计（其实很像），而是它把网络层、协议层和代码生成工具链都放进了同一个体系里：

**1. 可选择 netpoll 网络层**

标准库的 `net/http` 成熟、可靠，绝大多数业务场景性能都足够。Hertz 的优势主要出现在大量并发连接、长连接或对尾延迟更敏感的场景：它可以使用 `cloudwego/netpoll`，基于 epoll/kqueue 的事件驱动模型，减少高连接数下的调度压力。

**2. `hz` 带来的工程骨架和路由生成**

`hz` 工具可以从 Thrift/Protobuf IDL 生成项目结构、model、handler 骨架和路由注册代码。这对团队协作很有价值：接口定义先行，生成代码承担重复的胶水工作，handler 只写业务逻辑。

当然你也可以不用 IDL，像下面的示例一样手写路由。这时 `BindJSON` / binding 仍然是运行时解析请求体，不应该把它宣传成“完全无反射绑定”。更准确的说法是：Hertz 允许你按项目复杂度选择“手写薄 handler”或“IDL + 生成代码”。

**3. 分层网络库设计**

Hertz 把网络层（netpoll）、协议层（HTTP1/HTTP2）、路由层分开。你可以只替换网络层（比如在不支持 epoll 的平台回退到标准库），上层代码不用改。

对于本文的场景，Hertz 的关键价值是：**高并发连接场景下更可控的网络层，以及和 CloudWeGo 生态（Kitex、Volo）的集成路径**。

## pgxpool：为什么不用 database/sql

大部分 Go 教程会教你用 `database/sql` + `lib/pq` 或 `pgx/stdlib` 连 PostgreSQL。这没问题，`database/sql` 的优势是稳定、通用、生态熟。但如果服务明确只面向 PostgreSQL，直接用 pgxpool 会少一层通用适配，也能更自然地使用 PostgreSQL 的专属能力。

### database/sql 的抽象税

`database/sql` 是 Go 标准库的通用数据库接口。"通用"意味着它要兼容所有数据库驱动，所以：

- **参数和结果要经过通用接口**。`driver.Value` 只能表达 `nil`、`bool`、`int64`、`float64`、`string`、`[]byte`、`time.Time` 等通用类型。PostgreSQL 的 `uuid`、`jsonb`、`inet`、range、composite 等类型，通常要依赖驱动转换，或者实现 `Scanner` / `Valuer`。
- **PG 专属能力不好直接暴露**。Batch、COPY、Listen/Notify、自定义类型注册、tracer hook 这些能力，在 pgx 原生 API 里是直接的一等能力；走 `database/sql` 时要么不可用，要么需要绕回具体驱动。
- **连接池语义更通用**。`sql.DB` 有 `SetMaxOpenConns`、`SetMaxIdleConns`、`SetConnMaxLifetime` 等配置，足够可用；pgxpool 则额外提供 `AfterConnect`、`BeforeAcquire`、`AfterRelease`、`Stat()` 等更贴近 PostgreSQL 服务的控制点。

### pgx 的原生优势

pgx 直接实现 PostgreSQL wire protocol，不经过 `database/sql`：

- **Extended protocol 和 statement cache**。pgx 默认使用 extended protocol，并带有 prepared statement cache。对支持的类型，pgx 可以使用 binary format，避免很多文本编码/解析成本。
- **原生类型支持**。`pgtype` 包覆盖大量 PostgreSQL 类型——`uuid`、`jsonb`、`inet`、range、composite 等，不需要全部压扁成字符串再解析。
- **Batch query**。一次网络往返发多条查询，减少 RTT。`database/sql` 没有这个能力。
- **COPY protocol**。批量插入走 PostgreSQL 的 COPY 协议，比逐行 INSERT 快一个数量级。
- **连接池透明**。pgxpool 的配置项和状态都很直接：`MaxConns`、`MinConns`、`MaxConnLifetime`、`MaxConnIdleTime`、`HealthCheckPeriod`、`Stat()`。

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

sqlc 支持把 pgx/v5 作为目标驱动。在 `sqlc.yaml` 里设置 `sql_package: "pgx/v5"`，生成的代码就直接使用 pgx 的类型和接口，不经过 `database/sql`。

这意味着：

- 生成的 `DBTX` 接口可以由 `pgxpool.Pool` 和 `pgx.Tx` 实现，不需要适配层
- 返回类型直接用 `pgtype.Text`、`pgtype.Timestamptz` 等原生类型（如果你配置了的话）
- pgx 的 Batch 和 COPY 可以和 sqlc 生成的代码共用同一个 pool / tx；其中 Batch 可用 sqlc 的 batch annotations，COPY 通常直接手写 pgx `CopyFrom`

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

这里也能看到一个边界：生成接口仍然使用 `...interface{}` 传参，因为 pgx 的底层查询 API 就是这样设计的。sqlc 的价值不是把所有运行时成本消灭掉，而是让调用点的参数类型、返回结构和 SQL 形状在生成阶段就被检查出来。

## 完整示例：从零搭建

下面是一个最小但完整的示例——一个 todo API，包含创建、列表和标记完成三个接口。

### 目录结构

```
.
├── go.mod
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
INSERT INTO todos (title)
VALUES ($1)
RETURNING id, title, done, created_at;

-- name: ListTodos :many
SELECT id, title, done, created_at
FROM todos
ORDER BY created_at DESC
LIMIT $1;

-- name: MarkDone :execrows
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
  "example.com/todo-api/handler"
)

func main() {
  ctx := context.Background()

  pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
  if err != nil {
    panic(err)
  }
  defer pool.Close()

  if err := pool.Ping(ctx); err != nil {
    panic(err)
  }

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
  "strings"

  "github.com/cloudwego/hertz/pkg/app"
  "github.com/cloudwego/hertz/pkg/protocol/consts"
  "github.com/jackc/pgx/v5/pgxpool"
  "example.com/todo-api/internal/db"
)

type TodoHandler struct {
  pool *pgxpool.Pool
  q    *db.Queries
}

func NewTodoHandler(pool *pgxpool.Pool) *TodoHandler {
  return &TodoHandler{
    pool: pool,
    q:    db.New(pool),
  }
}

func (h *TodoHandler) Create(ctx context.Context, c *app.RequestContext) {
  var req struct {
    Title string `json:"title"`
  }
  if err := c.BindJSON(&req); err != nil {
    c.JSON(consts.StatusBadRequest, map[string]string{"error": err.Error()})
    return
  }

  req.Title = strings.TrimSpace(req.Title)
  if req.Title == "" {
    c.JSON(consts.StatusBadRequest, map[string]string{"error": "title is required"})
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
  limit, err := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 32)
  if err != nil || limit < 1 || limit > 100 {
    c.JSON(consts.StatusBadRequest, map[string]string{"error": "limit must be between 1 and 100"})
    return
  }

  todos, err := h.q.ListTodos(ctx, int32(limit))
  if err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }
  c.JSON(consts.StatusOK, todos)
}

func (h *TodoHandler) MarkDone(ctx context.Context, c *app.RequestContext) {
  id, err := strconv.ParseInt(c.Param("id"), 10, 64)
  if err != nil || id < 1 {
    c.JSON(consts.StatusBadRequest, map[string]string{"error": "invalid todo id"})
    return
  }

  rowsAffected, err := h.q.MarkDone(ctx, id)
  if err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }
  if rowsAffected == 0 {
    c.JSON(consts.StatusNotFound, map[string]string{"error": "todo not found"})
    return
  }

  c.Status(consts.StatusNoContent)
}
```

跑起来：

```bash
go mod init example.com/todo-api
go get github.com/cloudwego/hertz github.com/jackc/pgx/v5
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest

export DATABASE_URL='postgres://postgres:postgres@localhost:5432/todos?sslmode=disable'
createdb todos
sqlc generate
psql "$DATABASE_URL" -f schema.sql
go run .
```

如果你已经安装过 sqlc，`go install` 这一步可以跳过；如果数据库已经存在，`createdb todos` 也可以跳过。这里为了让示例最小化，直接用 `psql -f schema.sql` 建表；生产环境还是应该使用 migration 工具。除此之外，没有 ORM 初始化、没有 model 注册。SQL 写好，generate 一下，handler 里直接调用类型安全的函数。

## 三层怎么串起来

看完示例代码，来分析一个请求从进入到返回的完整路径：

```
HTTP POST /todos {"title": "buy milk"}
    ↓
[Hertz] netpoll 收到连接事件，路由匹配到 todoHandler.Create
    ↓
[Handler] c.BindJSON 解析请求体（具体 JSON 实现取决于 Hertz 配置）
    ↓
[sqlc] h.q.CreateTodo(ctx, "buy milk")
    ↓  这是生成的代码，展开就是：
    ↓  pool.QueryRow(ctx, "... RETURNING id, title, done, created_at", "buy milk")
    ↓
[pgxpool] 从池中取一个连接，通过 pgx 发送查询
    ↓
[PostgreSQL] 执行 INSERT，返回结果
    ↓
[pgx] 解码结果到 Go 类型（int64, string, bool, time.Time）
    ↓
[sqlc] rows.Scan 填充生成的 struct
    ↓
[Handler] c.JSON 序列化返回
    ↓
HTTP 201 {"id":1,"title":"buy milk","done":false,"created_at":"..."}
```

整条路径上：
- **没有 ORM 式 SQL 拼接**：SQL 主体是常量，参数由驱动绑定
- **没有模型关系魔法**：handler 里能直接看到调用了哪条查询
- **参数和返回值有生成代码约束**：SQL 改错字段、类型不匹配，尽量在 `sqlc generate` 或编译阶段暴露
- **仍然有正常运行时成本**：JSON、请求绑定、pgx 参数传递、网络缓冲、`rows.Scan` 都不会凭空消失

### 事务怎么处理

sqlc 生成的 `Queries` 有 `WithTx` 方法。下面假设你另外定义了 `CreateAuditLog` 这条 sqlc 查询：

```go
func (h *TodoHandler) CreateWithAudit(ctx context.Context, c *app.RequestContext) {
  var req struct {
    Title string `json:"title"`
  }
  if err := c.BindJSON(&req); err != nil {
    c.JSON(consts.StatusBadRequest, map[string]string{"error": err.Error()})
    return
  }

  req.Title = strings.TrimSpace(req.Title)
  if req.Title == "" {
    c.JSON(consts.StatusBadRequest, map[string]string{"error": "title is required"})
    return
  }

  tx, err := h.pool.Begin(ctx)
  if err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }
  defer tx.Rollback(ctx)

  qtx := h.q.WithTx(tx)
  todo, err := qtx.CreateTodo(ctx, req.Title)
  if err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }

  if err := qtx.CreateAuditLog(ctx, db.CreateAuditLogParams{
    Action:   "create_todo",
    EntityID: todo.ID,
  }); err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }

  if err := tx.Commit(ctx); err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }

  c.JSON(consts.StatusCreated, todo)
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

pgx 支持 tracer hook，可以接入 OpenTelemetry。常见做法是接一个 pgx tracer，例如：

```go
import "github.com/exaring/otelpgx"

config, _ := pgxpool.ParseConfig(dbURL)
config.ConnConfig.Tracer = otelpgx.NewTracer()
```

每条 SQL 的执行时间和错误可以进入 tracing 系统。参数是否上报要谨慎配置，生产环境默认不要记录完整参数，尤其是用户输入、token、手机号、邮箱等敏感数据。配合 Hertz 的 middleware 做请求级 tracing，整条链路就能串起来。

### 连接池调优

生产环境的 pgxpool 配置要从 PostgreSQL 的 `max_connections`、应用副本数、慢查询比例和 PgBouncer 部署方式一起推。可以先从保守值开始：

```go
config.MaxConns = 20                         // 单个应用实例最多持有的连接数
config.MinConns = 5                          // 避免冷启动
config.MaxConnLifetime = 30 * time.Minute    // 防止连接长期不释放
config.MaxConnIdleTime = 5 * time.Minute     // 回收闲置连接
config.HealthCheckPeriod = 30 * time.Second  // 定期检查连接可用性
```

`runtime.NumCPU() * 2` 可以作为压测前的粗略起点，但不要按 QPS 线性放大连接数。PostgreSQL 连接本身很重，连接太多会让数据库先被调度和内存拖垮。

如果并发量特别大，可以在 pgxpool 前面加一层 PgBouncer。使用 transaction pooling 时要特别注意 prepared statement cache：pgx 默认会缓存 prepared statement，而 transaction mode 下同一个逻辑连接可能换到不同后端连接。除非你的 PgBouncer 版本和配置明确支持，否则建议关闭 statement cache 或改查询执行模式，例如：

```go
import "github.com/jackc/pgx/v5"

config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
```

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
  qb := sq.Select("id", "title", "done", "created_at").From("todos")

  if title := c.Query("title"); title != "" {
    qb = qb.Where("title ILIKE ?", "%"+title+"%")
  }
  if done := c.Query("done"); done != "" {
    doneValue, err := strconv.ParseBool(done)
    if err != nil {
      c.JSON(consts.StatusBadRequest, map[string]string{"error": "done must be true or false"})
      return
    }
    qb = qb.Where("done = ?", doneValue)
  }

  query, args, err := qb.PlaceholderFormat(sq.Dollar).ToSql()
  if err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }

  rows, err := h.pool.Query(ctx, query, args...)
  if err != nil {
    c.JSON(consts.StatusInternalServerError, map[string]string{"error": err.Error()})
    return
  }
  defer rows.Close()

  // ...手动 scan
}
```

这不是"放弃 sqlc"，而是承认不同场景用不同工具。静态查询用 sqlc（类型安全），动态查询用 squirrel（灵活性），两者共存没有冲突。

## 什么时候不该选这套

这套组合适合 PostgreSQL-first、SQL 形状相对明确、团队愿意维护 SQL 文件、重视类型安全和可观测性的服务。

它不一定适合这些场景：

- 后台管理系统，CRUD 很多但业务逻辑很薄，团队更需要快速建模和关联加载
- 查询条件高度动态，SQL 形状大部分由用户输入组合出来
- 团队更熟 ORM，对 SQL review、索引设计、执行计划分析没有稳定习惯
- 数据库类型不固定，未来可能在 MySQL、PostgreSQL、SQLite 之间频繁切换

技术选型不应该只看“快不快”。如果团队维护成本和认知成本压不住，理论上的性能优势很快会被工程复杂度吃掉。

## 总结

| 层 | 做了什么 | 没做什么 |
|---|---|---|
| Hertz | 路由匹配、参数绑定、中间件 | 不管数据库、不管业务逻辑 |
| pgxpool | 连接管理、协议编解码、类型映射 | 不管 SQL 怎么写、不管结果怎么用 |
| sqlc | SQL 验证、类型推导、代码生成 | 不管网络、不管连接生命周期、不提供 ORM 运行时 |

每一层只做自己的事，不越界、不重叠。这就是为什么它们能组合得这么干净——没有两层在抢同一个职责。

这套组合的核心价值不是"快"（虽然确实快），而是**可预测**：

- 看到一个 handler，你就知道它会执行哪条 SQL
- 看到一条 SQL，你就知道它的参数和返回值类型
- 看到一个错误，你就知道它来自哪一层

少一点魔法，少一点隐式行为，少一点"框架帮你做了什么你不知道"。对于需要长期维护的生产服务来说，这种可预测性经常比单点性能优势更重要。
