---
title: sqlc 凭什么成为 Go 数据库访问层的最优解——从编译管线到零运行时开销
published: 2026-05-19
description: 从设计哲学到编译管线全面剖析 sqlc，解析其 SQL-first、编译期类型推导、WASM Parser、零运行时开销等核心设计如何让 Go 的数据库访问层回归本质。
tags: [Go, 数据库, sqlc, PostgreSQL, 代码生成]
category: 后端
draft: false
---

Go 生态里访问数据库，选择太多了：GORM、Ent、sqlx、squirrel、raw `database/sql`……每个都有自己的哲学，每个都有自己的代价。

但如果你仔细想想，问题的本质其实很简单：**你写了一条 SQL，你希望 Go 编译器能帮你检查它对不对，返回值类型是什么**。就这么一件事。

GORM 的答案是"别写 SQL 了，我帮你生成"——代价是反射、`interface{}` 装箱、运行时才能发现的字段拼写错误。sqlx 的答案是"你写 SQL，我帮你扫描结果到 struct"——代价是 struct tag 拼错了编译器不管。Ent 的答案是"你定义 schema，我帮你生成一切"——代价是生成代码膨胀、框架锁定。

sqlc 的答案不一样：**你写 SQL，我在编译期帮你验证它，然后生成刚好够用的 Go 代码。运行时？没有运行时。**

这篇文章就来拆解 sqlc 到底怎么做到的。先放一张全局地图：

| 决策点 | sqlc 选了啥 | 后果 |
|---|---|---|
| 真相源 | SQL 文件 | 不用学新 DSL，数据库支持啥你就能写啥 |
| 类型安全 | 编译期（代码生成） | 列名拼错、类型不匹配在 `generate` 阶段就报错 |
| 运行时开销 | 零 | 生成的代码就是 `database/sql` 直接调用 |
| Parser | PostgreSQL 真实 parser (WASM) | 不是正则匹配，是数据库级别的 SQL 验证 |
| 结果映射 | 生成的 `rows.Scan()` | 没有反射、没有 struct tag 查找 |
| 扩展性 | WASM 插件系统 | 社区可以在沙箱边界内扩展到更多语言 |

这篇文章按这个顺序展开。所有源码引用基于 [`sqlc-dev/sqlc`](https://github.com/sqlc-dev/sqlc) v1.31.x。

## SQL-first：一个根本性的设计选择

Go 生态里的数据库工具，按"真相源在哪"可以分成三派：

### Code-first：GORM

```go
type User struct {
  ID    uint   `gorm:"primaryKey"`
  Email string `gorm:"uniqueIndex"`
  Posts []Post
}

db.Where("email = ?", email).First(&user)
```

真相源是 Go struct。你改了 struct，跑一下 `AutoMigrate`，数据库跟着变。问题是：**Go struct 能表达的东西远比 SQL schema 少**。分区表、部分索引、CHECK 约束、物化视图——这些在 struct tag 里根本没法写。而且 `db.Where("email = ?", email)` 里的 `"email"` 是个字符串，拼错了编译器不管，运行时才炸。

### Schema-first：Ent

```go
func (User) Fields() []ent.Field {
  return []ent.Field{
    field.Int("id"),
    field.String("email").Unique(),
  }
}
```

真相源是 Go 的 schema DSL。跑 `go generate`，Ent 帮你生成查询代码、迁移 SQL、甚至 GraphQL resolver。类型安全做得很好，但代价是**生成代码量巨大**（一个实体可能生成上千行），而且你被锁在 Ent 的查询 API 里——想写个窗口函数或者递归 CTE？得跳出框架用 raw SQL。

### SQL-first：sqlc

```sql
-- schema.sql
CREATE TABLE users (
  id   BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE
);

-- query.sql
-- name: GetUser :one
SELECT id, email FROM users WHERE id = $1;
```

真相源是 SQL 本身。你写的就是真正的 SQL——能在 `psql` 里直接跑的那种。sqlc 读这些文件，验证语法和类型，生成对应的 Go 函数。

这个选择的后果是深远的：

- **表达力接近原生 SQL**。CTE、窗口函数、LATERAL JOIN、递归查询、JSON 操作符这类常见高级特性都能直接写。少数复杂语句可能仍受 sqlc analyzer / codegen 能力限制，但你不需要被 ORM 的查询 API 绑住。
- **SQL 就是文档**。新人看 `query.sql` 就知道这个服务跟数据库之间的所有交互，不用在代码里翻 ORM 调用链。
- **DBA 友好**。DBA 可以直接审查 `.sql` 文件，不用理解 Go 代码。
- **可测试**。`.sql` 文件可以直接在数据库客户端里跑，不需要启动 Go 程序。

## 编译管线：从 SQL 文件到 Go 代码

sqlc 的核心是一条编译管线。理解这条管线，就理解了它为什么能做到编译期类型安全。

```
SQL 文件 (schema.sql + query.sql)
    ↓
[Parser] — 用 PostgreSQL 真实 parser 解析 SQL
    ↓
[AST] — 转换为内部抽象语法树
    ↓
[Compiler] — 类型推导 + 验证
    ↓
[Codegen] — 生成 Go 代码（或通过插件生成其他语言）
    ↓
生成的 .go 文件
```

### Parser：不是正则，是真正的 PostgreSQL parser

这是 sqlc 最硬核的设计决策之一。

v1.25.0 之前，sqlc 通过 cgo 调用 `pganalyze/pg_query_go`——这是 PostgreSQL 源码里的 parser 编译成的 C 库。好处是语法兼容度高，坏处是需要 C 编译器，Windows 上很痛苦。

v1.25.0 起，sqlc 切换到 `wasilibs/go-pgquery`——把同一个 C parser 编译成 WebAssembly，通过 `tetratelabs/wazero`（纯 Go 的 WASM 运行时）执行。它把构建和分发成本降了下来：

- 纯 Go 编译，零 cgo 依赖
- Windows、macOS、Linux 原生支持
- 交叉编译无障碍

**为什么这很重要？** 因为用真实的 PostgreSQL parser 意味着 sqlc 不是靠正则去猜 SQL。`CREATE TABLE ... PARTITION BY`、`WITH RECURSIVE`、`LATERAL JOIN`、`jsonb_path_query` 这类 PostgreSQL 语法，parser 都有机会按数据库的规则理解。如果你写了一条语法错误的 SQL，sqlc 会在 `generate` 阶段就告诉你，而不是等到运行时数据库报错。

MySQL 使用 TiDB 生态的 parser，SQLite 也有自己的方言分析实现；v1.25.0 同时把连接 SQLite 数据库的依赖从 `mattn/go-sqlite3` 换成了 `modernc.org/sqlite`，减少 cgo 依赖。重点不是“一套 parser 吃所有方言”，而是按数据库引擎分别处理。

### Compiler：从 AST 到类型信息

Parser 输出 AST 之后，`internal/compiler/` 包接手做两件事：

**1. Schema 分析**：读 `schema.sql`，建立一个内存中的 catalog——哪些表、哪些列、什么类型、哪些约束。这就是 sqlc 的"数据库"。

**2. Query 分析**：对每条查询的 AST 做类型推导：
- `SELECT id, email FROM users WHERE id = $1` → 参数 `$1` 的类型是 `bigint`（因为 `users.id` 是 `BIGSERIAL`），返回值是 `(int64, string)`
- `SELECT count(*) FROM users` → 返回值是 `int64`
- `SELECT u.*, p.title FROM users u JOIN posts p ON ...` → 返回值是 users 的所有列 + posts.title

v1.23.0 起还支持**数据库辅助分析**：连接到真实数据库获取元数据，解决静态分析搞不定的场景（比如自定义函数的返回类型、复杂聚合表达式）。

## 类型推导：怎么从 SQL 算出 Go 类型

类型推导是 sqlc 的核心价值所在。它要回答的问题是：给定一条 SQL，参数是什么类型？返回值是什么类型？

### 基本映射

sqlc 内置了一套 SQL 类型到 Go 类型的映射表：

| PostgreSQL 类型 | Go 类型 | 说明 |
|---|---|---|
| `BIGSERIAL` / `BIGINT` | `int64` | |
| `SERIAL` / `INTEGER` | `int32` | |
| `TEXT` / `VARCHAR` | `string` | |
| `BOOLEAN` | `bool` | |
| `TIMESTAMP` / `TIMESTAMPTZ` | `time.Time` | |
| `UUID` | `uuid.UUID` / `pgtype.UUID` | `database/sql` 默认用 `github.com/google/uuid`，`pgx/v5` 默认用 `pgtype.UUID`，需要换类型时再 override |
| `JSONB` | `json.RawMessage` 或自定义类型 | 可配置 |
| `TEXT[]` | `[]string` | 数组类型 |

### Nullable 处理

这是每个数据库工具都要面对的问题：SQL 里的 `NULL` 在 Go 里怎么表示？

sqlc 的默认策略是用 `database/sql` 的 Null 类型：

```sql
-- name: GetUser :one
SELECT id, email, bio FROM users WHERE id = $1;
```

如果 `bio` 列是 `TEXT`（可空），生成的 struct 是：

```go
type GetUserRow struct {
  ID    int64
  Email string
  Bio   sql.NullString  // 可空列
}
```

如果你使用 `pgx/v5` 或 SQLite，也可以在 `sqlc.yaml` 里配置用指针代替：

```yaml
gen:
  go:
    sql_package: "pgx/v5"
    emit_pointers_for_null_types: true
```

这样 `Bio` 就变成 `*string`。如果还是默认的 `database/sql`，可空字段会继续使用 `sql.NullString` 这类类型。或者用第三方库：

```yaml
overrides:
  - db_type: "text"
    nullable: true
    go_type:
      import: "gopkg.in/guregu/null.v4"
      package: "null"
      type: "String"
```

### 自定义类型映射

sqlc 的 override 系统允许你精确控制类型映射：

```yaml
overrides:
  - db_type: "uuid"
    go_type:
      import: "github.com/google/uuid"
      type: "UUID"
  - column: "users.created_at"
    go_type: "time.Time"
  - db_type: "pg_catalog.timestamptz"
    nullable: true
    go_type:
      import: "gopkg.in/guregu/null.v4"
      package: "null"
      type: "Time"
```

可以按 `db_type`（全局）或 `column`（精确到某张表的某列）来配置。这比 GORM 的 struct tag 灵活得多——你不需要在每个用到 UUID 的 struct 上都加 tag，配置一次全局生效。

### 枚举类型

PostgreSQL 的 `CREATE TYPE ... AS ENUM` 会被 sqlc 生成为带常量的 Go 类型：

```sql
CREATE TYPE status AS ENUM ('active', 'inactive', 'banned');
```

生成：

```go
type Status string

const (
  StatusActive   Status = "active"
  StatusInactive Status = "inactive"
  StatusBanned   Status = "banned"
)
```

编译期就能检查你有没有传一个不存在的枚举值。

## 生成代码长什么样

看一个完整的例子。假设你有这样的 SQL 文件：

```sql
-- schema.sql
CREATE TABLE authors (
  id   BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  bio  TEXT
);

-- query.sql
-- name: GetAuthor :one
SELECT id, name, bio FROM authors WHERE id = $1;

-- name: ListAuthors :many
SELECT id, name, bio FROM authors ORDER BY name;

-- name: CreateAuthor :one
INSERT INTO authors (name, bio) VALUES ($1, $2) RETURNING *;

-- name: DeleteAuthor :exec
DELETE FROM authors WHERE id = $1;
```

`sqlc generate` 之后，你得到三个文件：

**models.go** — 表对应的 struct：

```go
package db

import "database/sql"

type Author struct {
  ID   int64
  Name string
  Bio  sql.NullString
}
```

**query.sql.go** — 每条 SQL 对应一个方法：

```go
package db

import (
  "context"
  "database/sql"
)

const getAuthor = `SELECT id, name, bio FROM authors WHERE id = $1`

func (q *Queries) GetAuthor(ctx context.Context, id int64) (Author, error) {
  row := q.db.QueryRowContext(ctx, getAuthor, id)
  var i Author
  err := row.Scan(&i.ID, &i.Name, &i.Bio)
  return i, err
}

const listAuthors = `SELECT id, name, bio FROM authors ORDER BY name`

func (q *Queries) ListAuthors(ctx context.Context) ([]Author, error) {
  rows, err := q.db.QueryContext(ctx, listAuthors)
  if err != nil {
    return nil, err
  }
  defer rows.Close()
  var items []Author
  for rows.Next() {
    var i Author
    if err := rows.Scan(&i.ID, &i.Name, &i.Bio); err != nil {
      return nil, err
    }
    items = append(items, i)
  }
  if err := rows.Err(); err != nil {
    return nil, err
  }
  return items, nil
}
```

**db.go** — Queries struct 和接口：

```go
package db

import (
  "context"
  "database/sql"
)

type DBTX interface {
  ExecContext(context.Context, string, ...interface{}) (sql.Result, error)
  QueryContext(context.Context, string, ...interface{}) (*sql.Rows, error)
  QueryRowContext(context.Context, string, ...interface{}) *sql.Row
}

type Queries struct {
  db DBTX
}

func New(db DBTX) *Queries {
  return &Queries{db: db}
}

func (q *Queries) WithTx(tx *sql.Tx) *Queries {
  return &Queries{db: tx}
}
```

### 零运行时开销意味着什么

盯着生成的代码看一眼，你会发现：

- **SQL 是常量字符串**。`const getAuthor = "SELECT ..."` 在编译期就确定了，运行时不做任何拼接。
- **参数直接传递**。`q.db.QueryRowContext(ctx, getAuthor, id)` 里的 `id` 从生成函数签名开始就是 `int64`，参数类型在编译期已确定，不经过 ORM 反射层。
- **结果直接 Scan**。`row.Scan(&i.ID, &i.Name, &i.Bio)` 是 `database/sql` 最原始的用法，没有反射、没有 struct tag 查找。
- **没有 sqlc 的运行时依赖**。这个例子里的生成代码只 import `database/sql` 和 `context`。你甚至可以删掉 sqlc，生成的代码照样编译运行。

这就是"零运行时开销"的含义：**生成的代码接近你会手写的 `database/sql` 代码**。sqlc 的主要工作都在 `generate` 阶段完成，业务运行时不需要加载一个 sqlc 框架。

## 对比其他方案：抽象的代价

现在可以把 sqlc 放到 Go 生态的大图里，看看每种方案在同一条查询上的表现。

### GORM：反射的代价

```go
var user User
db.Where("email = ?", email).First(&user)
```

这一行背后发生了什么：
1. `Where("email = ?", email)` — 运行时拼接 SQL 字符串
2. `First(&user)` — 通过反射检查 `User` struct 的字段和 tag，确定 SELECT 哪些列
3. 结果返回后，再通过反射把每列的值填到 struct 对应字段里
4. 如果有 hook（`BeforeFind`、`AfterFind`），还要通过反射检查并调用

每次查询都要走这套反射流程。简单场景下网络延迟远大于反射开销，但在高并发、大结果集的场景下，GORM 的 CPU 开销是 raw `database/sql` 的 2-5 倍。

更关键的问题是**类型安全**：`"email = ?"` 里的 `email` 是字符串，拼错了编译器不管。字段改名了，全局搜索替换是唯一的办法。

### Ent：生成代码的膨胀

```go
user, err := client.User.
  Query().
  Where(user.EmailEQ(email)).
  Only(ctx)
```

Ent 的类型安全做得很好——`user.EmailEQ` 是生成的函数，拼错了编译不过。但代价是：

- 一个实体可能生成上千行代码（包括各种 predicate、edge traversal、mutation）
- 查询 API 是 Ent 自己的，不是 SQL。想写窗口函数？得用 `ent/dialect/sql`，回到拼字符串
- 关系查询生成的 SQL 往往比手写的复杂，即使是简单场景

Ent 适合关系密集、需要 GraphQL 集成的场景。但如果你的需求是"写 SQL，类型安全"，它的抽象层太厚了。

### sqlx：运行时的 struct tag

```go
var user User
err := db.Get(&user, "SELECT id, email, bio FROM users WHERE id = $1", id)
```

sqlx 是最轻量的选择——它就是 `database/sql` 加了个 struct 扫描。但：

- `"SELECT id, email, bio FROM users WHERE id = $1"` 是字符串，没有编译期验证
- struct tag `db:"email"` 拼错了，运行时才报错（而且报错信息不一定明显）
- 每次 `Get` / `Select` 都要通过反射读 struct tag，虽然有缓存但仍有开销

sqlx 的定位是"比 raw SQL 少写点代码"，但它不解决类型安全问题。

### squirrel：查询构建器

```go
query, args, _ := sq.Select("id", "email").
  From("users").
  Where(sq.Eq{"id": id}).
  ToSql()

row := db.QueryRow(query, args...)
```

squirrel 解决的是动态拼 SQL 的问题——比字符串拼接安全，比 `fmt.Sprintf` 优雅。但：

- 零类型安全。`"id"`、`"email"`、`"users"` 全是字符串
- 结果还是要手动 `Scan`
- 每次调用都在运行时构建 SQL 字符串

squirrel 适合查询条件高度动态的场景，但它和 sqlc 解决的是不同的问题。

### 对比总结

| | sqlc | GORM | Ent | sqlx | squirrel |
|---|---|---|---|---|---|
| 类型安全 | 编译期 | 运行时 | 编译期 | 运行时 | 无 |
| 运行时开销 | 零 | 高（反射） | 中 | 低（反射扫描） | 低 |
| SQL 表达力 | 完整 | 受限 | 受限 | 完整 | 完整 |
| 动态查询 | 弱 | 强 | 中 | 强 | 强 |
| 学习成本 | 低（会 SQL 就行） | 中（API 多） | 高（概念多） | 低 | 低 |
| 代码生成 | 是（极简） | 否 | 是（大量） | 否 | 否 |

## 进阶特性

基础用法已经能覆盖大部分场景，但 sqlc 还提供了一些特性来解决特定问题：JOIN 结果的组织、动态参数、性能优化、以及跨语言扩展。

### sqlc.embed：JOIN 结果的优雅组织

多表 JOIN 的结果默认是扁平的——所有列混在一个 struct 里。`sqlc.embed` 让你把结果组织成嵌套 struct：

```sql
-- name: GetStudentWithScores :many
SELECT sqlc.embed(students), sqlc.embed(test_scores)
FROM students
JOIN test_scores ON test_scores.student_id = students.id
WHERE students.id = $1;
```

生成：

```go
type GetStudentWithScoresRow struct {
  Student   Student
  TestScore TestScore
}
```

比起手动定义一个包含所有列的扁平 struct，这种方式更清晰，而且 `Student` 和 `TestScore` 可以复用 models.go 里已有的类型。

### sqlc.slice：动态 IN 查询

```sql
-- name: GetUsersByIDs :many
SELECT * FROM users WHERE id IN (sqlc.slice('ids'));
```

生成的函数接受 `[]int64` 参数，sqlc 在运行时展开成正确数量的占位符。

**注意**：这是 sqlc 为数不多的运行时开销场景。因为 IN 的参数数量是动态的，无法在编译期确定占位符数量，必须在运行时构建 SQL 字符串。这是为了实用性做的权衡——动态 IN 查询太常见了。

### Prepared Statements

非 `pgx/v5` 驱动需要先开启配置：

```yaml
gen:
  go:
    emit_prepared_queries: true
```

```go
queries, err := db.Prepare(ctx, conn)
if err != nil {
  return err
}
// 后续调用复用预编译的 statement
user, err := queries.GetAuthor(ctx, authorID)
```

开启 `emit_prepared_queries` 后，sqlc 生成的 `Prepare` 函数会一次性预编译所有查询。如果使用 `pgx/v5`，pgx 自身已经有隐式 prepared statement 支持，不需要额外开启这个 sqlc 选项。

### WASM 插件系统

v1.23.0 起，sqlc 把代码生成器抽成了独立的 WASM 插件。`sqlc-gen-go` 本身就是一个插件：

```yaml
version: "2"
plugins:
  - name: golang
    wasm:
      url: "https://downloads.sqlc.dev/plugin/sqlc-gen-go_v1.4.0.wasm"
      sha256: "..."
sql:
  - schema: "schema.sql"
    queries: "query.sql"
    engine: "postgresql"
    codegen:
      - plugin: golang
        out: "db"
        options:
          package: "db"
          sql_package: "pgx/v5"
```

WASM 插件运行在沙箱里——没有文件系统访问、没有网络、没有环境变量（除非显式授权）。这意味着社区可以安全地开发和分发插件，不用担心供应链攻击。

目前已有 Go、Python、Kotlin、TypeScript 的官方插件，社区还有 PHP、Zig 等语言的实现。

### sqlc vet：SQL 静态分析

```yaml
rules:
  - name: no-delete-without-where
    message: "DELETE without WHERE is dangerous"
    rule: |
      query.sql.matches("(?is).*\\bdelete\\s+from\\b.*") &&
      !query.sql.matches("(?is).*\\bwhere\\b.*")
```

`sqlc vet` 用 CEL（Common Expression Language）定义规则，可以在 CI 里跑，防止危险的 SQL 模式进入代码库。配合数据库连接还能跑 `EXPLAIN`，检查查询计划是否合理。

## 什么时候 sqlc 不是好选择

说了这么多好话，也得诚实地说清楚 sqlc 的短板。

**动态查询是最大的痛点**。如果你的业务有大量"根据用户输入动态拼条件"的场景——比如搜索页面有 10 个可选过滤器——sqlc 会很痛苦。官方在 2025 年明确关闭了动态查询相关 issue，标记为 "not planned"，短期内不会有原生支持。

目前能用的方案：

**方案一：`sqlc.narg` 可选参数**（过滤条件少、相对固定）

```sql
-- name: ListUsers :many
SELECT * FROM users
WHERE
  deleted_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('email')::text IS NULL OR email ILIKE sqlc.narg('email'))
ORDER BY created_at DESC;
```

参数为 `nil` 时条件自动跳过。超过 5-6 个过滤器时 SQL 会很难看。

**方案二：sqlc + [go-jet/jet](https://github.com/go-jet/jet) 混用**（过滤条件多且动态）

sqlc 处理静态查询，go-jet 只负责动态条件拼接（squirrel 的活跃替代，持续维护）：

```go
q := SELECT(User.ID, User.Email).FROM(User).WHERE(User.DeletedAt.IS_NULL())
if params.Status != "" {
    q = q.WHERE(User.Status.EQ(String(params.Status)))
}
```

**动态排序是另一个死角**。`ORDER BY` 字段无法参数化——这是 SQL 协议的限制，不是 sqlc 的问题。任何方案都必须在 Go 层做白名单校验：

```go
allowedSorts := map[string]string{
    "created_at": "created_at DESC",
    "name":       "name ASC",
}
orderBy, ok := allowedSorts[params.SortBy]
if !ok {
    orderBy = "created_at DESC"
}
// 白名单保证安全，再拼入 SQL
```

这种场景下 go-jet 或手写白名单是唯一出路。

**CRUD 密集型应用**。如果你的服务 80% 的操作是简单的增删改查，每张表都要写 `GetByID`、`List`、`Create`、`Update`、`Delete` 五条 SQL，确实啰嗦。GORM 的 `db.Create(&user)` 一行搞定的事，sqlc 要写 SQL + 跑 generate。对于这类场景，sqlc 的"显式"反而变成了负担。

**团队不熟悉 SQL**。sqlc 要求你会写 SQL。如果团队里有人连 `LEFT JOIN` 和 `INNER JOIN` 的区别都说不清，强推 sqlc 只会让他们更痛苦。GORM 至少把简单场景包装得很友好。

**需要跨数据库兼容**。sqlc 的 parser 是按数据库引擎分的——PostgreSQL 的 SQL 和 MySQL 的 SQL 不能混用。如果你的应用需要同时支持多种数据库（比如开源项目），sqlc 帮不了你，GORM 的方言抽象反而有用。

**Schema 变更的连锁反应**。改了一个列名，所有引用这个列的 `.sql` 文件都要手动改。sqlc 不会自动帮你重命名——它只会在 `generate` 时报错告诉你哪些查询坏了。对于大型项目（几百条查询），这个维护成本不低。

## 总结

回头看 sqlc 的整套设计，每个决策都指向同一个方向：**信任 SQL，信任数据库，中间层越薄越好**。

| 你得到了什么 | 你付出了什么 |
|---|---|
| 编译期类型安全（列名、类型、nullable） | 动态查询能力弱，需要写多个 SQL 或用 hack |
| 零运行时开销（生成代码接近手写） | Schema 变更需要手动修改所有相关 SQL |
| 完整的 SQL 表达力（CTE、窗口函数、递归） | CRUD 密集场景比 ORM 啰嗦 |
| 生成代码极简、可读、无框架依赖 | 团队需要熟悉 SQL |
| DBA 可直接审查 SQL 文件 | 跨数据库兼容需要维护多套 SQL |

**sqlc 的价值不在它生成代码，而在它让 SQL 重新成为一等公民。** 你不需要学一套新的查询语言，不需要猜 ORM 背后生成了什么 SQL，不需要在"类型安全"和"SQL 表达力"之间做取舍。写 SQL，跑 generate，完事。

## 参考

- [sqlc 官网](https://sqlc.dev)
- [sqlc 文档](https://docs.sqlc.dev)
- [sqlc GitHub](https://github.com/sqlc-dev/sqlc)
- [sqlc v1.25.0 移除 cgo](https://sqlc.dev/posts/2024/01/04/sqlc-v1-25-0-c-ya-c-go/)
- [sqlc-gen-go 插件](https://github.com/sqlc-dev/sqlc-gen-go)
- [数据库辅助分析 v1.23.0](https://sqlc.dev/posts/2023/10/24/sqlc-v1-23-0-database-backed-analyzer/)
- [wasilibs/go-pgquery（WASM PostgreSQL parser）](https://github.com/wasilibs/go-pgquery)
- [GORM 文档](https://gorm.io/docs/)
- [Ent 文档](https://entgo.io/docs/getting-started)
- [sqlx](https://github.com/jmoiron/sqlx)
- [squirrel](https://github.com/Masterminds/squirrel)
- [Go ORM 对比（Bytebase）](https://www.bytebase.com/blog/golang-orm-query-builder/)
- [JetBrains Go 数据库包对比](https://blog.jetbrains.com/go/2023/04/27/comparing-db-packages/)
