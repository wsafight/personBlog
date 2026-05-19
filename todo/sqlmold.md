# sqlmold 设计

## 项目定位

`sqlmold` 是一个面向 sqlc 的查询预处理器。它读取 **schema 表结构 + `sqlmold.yaml` 配置**，生成稳定、可审查的 `.sql` 查询文件，再交给 `sqlc generate` 生成类型安全的 Go 代码。

目标不是替代 sqlc，也不是运行时 SQL Builder，而是在 sqlc 之前补齐标准 CRUD、可选过滤、静态排序和常见投影查询的代码生成能力。

```
schema.sql + sqlmold.yaml -> [sqlmold] -> generated/*.sql -> [sqlc generate] -> *.go
```

开发者主要维护：

- `schema.sql`：真实数据库结构，仍然是单一事实来源。
- `sqlmold.yaml`：声明哪些表需要生成哪些查询。
- `sqlc.yaml`：sqlc 自身配置，需要与目标数据库方言保持一致。

---

## 设计边界

`sqlmold` 只生成 **编译期确定** 的 SQL：

- 支持标准 CRUD。
- 支持按白名单字段生成 `get_by` 查询。
- 支持按白名单字段展开静态 `ORDER BY` 查询。
- 支持少量可选过滤条件。
- 支持固定列集合的 projection 查询。

不处理：

- 任意动态过滤条件组合。
- 复杂 JOIN 查询建模。
- 业务级权限条件。
- 运行时拼接 SQL。
- 数据库迁移。

当查询需要完全动态的 where/order/group 组合时，应使用 go-jet、Squirrel、Bun、GORM clause builder 等运行时 SQL Builder，而不是强行塞进 sqlc 预生成流程。

---

## 配置示例

```yaml
name: sqlmold
engine: postgresql
schema: schema.sql
output: generated

defaults:
  primary_key: id
  soft_delete_column: deleted_at
  timestamps:
    created_at: created_at
    updated_at: updated_at

tables:
  - name: users
    model: User
    crud:
      get_by: [id, email]
      list:
        default_sort: created_at
        filters: [status, role]
        sort:
          - column: created_at
            direction: desc
          - column: name
            direction: asc
        columns:
          summary: [id, name, avatar_url]
          detail: [id, name, avatar_url, bio, email, created_at]
      insert:
        exclude: [id, created_at, updated_at, deleted_at]
      update:
        columns: [name, bio, email]
      delete:
        mode: soft

  - name: posts
    model: Post
    crud:
      get_by: [id, slug]
      list:
        default_sort: published_at
        filters: [user_id, status]
        sort:
          - column: published_at
            direction: desc
          - column: created_at
            direction: desc
      insert:
        exclude: [id, created_at, updated_at, deleted_at]
      update:
        columns: [title, content, status, published_at]
      delete:
        mode: hard
```

配置原则：

- 表名、列名、排序字段都必须来自 schema 解析结果，不能直接信任配置文本。
- 默认主键是 `id`，但可以在表级覆盖。
- soft delete 必须显式配置字段名，否则不自动注入 `deleted_at IS NULL`。
- `insert.exclude` 用于排除自增列、默认值列、generated column 和审计字段。
- `update.columns` 必须显式声明，避免误更新不可变字段。

---

## 方言策略

`engine` 只控制生成 SQL 的方言，不保证单靠改一行就能无痛切换数据库。实际项目里通常还需要同步调整：

- `schema.sql` 的字段类型、自增语法、索引语法。
- `sqlc.yaml` 的 `engine`、`schema`、`queries`、`gen` 配置。
- 查询返回策略，例如 MySQL 没有通用 `RETURNING`。

| 特性 | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| 占位符 | `$1, $2` | `?` | `?` |
| 命名参数 | `sqlc.arg` / `sqlc.narg` | `sqlc.arg` / `sqlc.narg` | `sqlc.arg` / `sqlc.narg` |
| 自增主键 | `BIGSERIAL` / identity | `AUTO_INCREMENT` | `INTEGER PRIMARY KEY` |
| UPSERT | `ON CONFLICT DO UPDATE` | `ON DUPLICATE KEY UPDATE` | `ON CONFLICT DO UPDATE` |
| 大小写不敏感搜索 | `ILIKE` | `LIKE` 或 collation | `LIKE` 或 collation |
| INSERT 返回 | `RETURNING *` | `:execresult` + `LastInsertId` | `RETURNING *` |
| UPDATE 返回 | `RETURNING *` | `:execrows` 或后续 SELECT | `RETURNING *` |
| 当前时间 | `NOW()` | `NOW()` | `datetime('now')` |

MySQL 特别规则：

- `CreateXxx` 默认生成 `:execresult`，由调用方读取 `LastInsertId()`。
- `UpdateXxx` / `DeleteXxx` 默认生成 `:execrows`。
- 如果业务必须返回完整行，应生成额外的 `GetXxxByID` 查询，由上层组合调用。

---

## 生成规则

### get_by

`get_by: [id, email]` 为每个字段生成一条查询：

```sql
-- name: GetUserByID :one
SELECT id, name, avatar_url, bio, email, created_at
FROM users
WHERE id = $1
  AND deleted_at IS NULL;

-- name: GetUserByEmail :one
SELECT id, name, avatar_url, bio, email, created_at
FROM users
WHERE email = $1
  AND deleted_at IS NULL;
```

规则：

- 字段必须存在于 schema。
- 推荐 `get_by` 字段具备唯一索引，否则 `:one` 可能在运行时返回多行错误。
- 如果字段不是唯一列，应允许配置 `many_by`，生成 `:many`。

### list + filters

少量可选过滤可用 `sqlc.narg` 生成。PostgreSQL 示例：

```sql
-- name: ListUsersOrderByCreatedAt :many
SELECT id, name, avatar_url
FROM users
WHERE deleted_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('role')::text IS NULL OR role = sqlc.narg('role'))
ORDER BY created_at DESC;
```

MySQL / SQLite 不能使用 PostgreSQL 的 `::text` cast，需按方言生成：

```sql
-- name: ListUsersOrderByCreatedAt :many
SELECT id, name, avatar_url
FROM users
WHERE deleted_at IS NULL
  AND (sqlc.narg('status') IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('role') IS NULL OR role = sqlc.narg('role'))
ORDER BY created_at DESC;
```

规则：

- `filters` 适合少量等值过滤。
- 多字段组合会让查询计划变复杂，过滤字段多时应改为生成多个明确查询，或使用运行时 SQL Builder。
- 每个 filter 需要支持 `operator` 扩展，例如 `eq`、`in`、`gte`、`lte`、`contains`。

### list + sort

`ORDER BY` 的字段名和方向不能用普通 SQL 参数替代，因此按配置展开为多条独立查询：

```sql
-- name: ListUsersOrderByCreatedAt :many
SELECT id, name, avatar_url
FROM users
WHERE deleted_at IS NULL
ORDER BY created_at DESC;

-- name: ListUsersOrderByName :many
SELECT id, name, avatar_url
FROM users
WHERE deleted_at IS NULL
ORDER BY name ASC;
```

同时生成 Go dispatch 辅助函数：

```go
type UserSort string

const (
	UserSortCreatedAt UserSort = "created_at"
	UserSortName      UserSort = "name"
)

func ListUsers(ctx context.Context, q *Queries, arg ListUsersOrderByCreatedAtParams, sortBy UserSort) ([]User, error) {
	switch sortBy {
	case UserSortName:
		return q.ListUsersOrderByName(ctx, ListUsersOrderByNameParams(arg))
	default:
		return q.ListUsersOrderByCreatedAt(ctx, arg)
	}
}
```

注意：

- 上面的示例假设查询返回完整 `users` 行，sqlc 可以复用 `User` model。
- 如果查询只返回部分列，sqlc 通常会为每条 query 生成独立 row struct，不能直接把不同排序查询合并成 `[]User`。
- projection 查询需要生成 adapter 转成统一 DTO，或只生成独立查询函数，不生成统一 dispatch。

### columns projection

`columns.summary / columns.detail` 生成固定列集合查询：

```sql
-- name: GetUserSummary :one
SELECT id, name, avatar_url
FROM users
WHERE id = $1
  AND deleted_at IS NULL;

-- name: GetUserDetail :one
SELECT id, name, avatar_url, bio, email, created_at
FROM users
WHERE id = $1
  AND deleted_at IS NULL;
```

规则：

- projection 查询通常会生成 query-specific row struct，而不是复用完整 `User` model。
- projection 名称必须参与查询名，避免 `ListUsers` / `ListUserSummaries` 这类命名冲突。
- 默认列集合应明确配置，例如 `default_columns: summary`。

### insert

PostgreSQL / SQLite 示例：

```sql
-- name: CreateUser :one
INSERT INTO users (name, avatar_url, bio, email, status, role)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;
```

MySQL 示例：

```sql
-- name: CreateUser :execresult
INSERT INTO users (name, avatar_url, bio, email, status, role)
VALUES (?, ?, ?, ?, ?, ?);
```

规则：

- 默认不插入主键、自增列、generated column、有数据库默认值且在 `exclude` 中声明的列。
- PostgreSQL / SQLite 可以返回完整行。
- MySQL 返回 `sql.Result`，由调用方决定是否继续查询完整行。

### update

PostgreSQL / SQLite 示例：

```sql
-- name: UpdateUser :one
UPDATE users
SET name = sqlc.arg('name'),
    bio = sqlc.arg('bio'),
    email = sqlc.arg('email'),
    updated_at = NOW()
WHERE id = sqlc.arg('id')
  AND deleted_at IS NULL
RETURNING *;
```

MySQL 示例：

```sql
-- name: UpdateUser :execrows
UPDATE users
SET name = sqlc.arg('name'),
    bio = sqlc.arg('bio'),
    email = sqlc.arg('email'),
    updated_at = NOW()
WHERE id = sqlc.arg('id')
  AND deleted_at IS NULL;
```

规则：

- 只允许更新 `update.columns` 中声明的字段。
- 主键、创建时间、删除时间、generated column 默认禁止更新。
- 生成 SQL 时优先使用 `sqlc.arg` 命名参数，减少参数顺序调整造成的破坏性变更。

### delete

soft delete：

```sql
-- name: DeleteUser :execrows
UPDATE users
SET deleted_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL;
```

hard delete：

```sql
-- name: DeletePost :execrows
DELETE FROM posts
WHERE id = $1;
```

规则：

- `delete.mode: soft` 需要配置 `soft_delete_column`。
- hard delete 默认使用 `:execrows`，不返回行。
- 如果需要返回删除前数据，PostgreSQL / SQLite 可额外支持 `returning: true`。

---

## 组合规则

`list` 的维度包括：

- projection：例如 `summary`、`detail`。
- filter set：固定的一组可选过滤条件。
- sort：每个排序字段生成一个独立 SQL。

建议生成策略：

1. 每个 projection 生成一组 list 查询。
2. 每个 sort 在该 projection 下展开独立 SQL。
3. filters 作为同一组参数出现在每个 sort 查询中。
4. 查询命名包含 projection 和 sort，例如 `ListUserSummariesOrderByCreatedAt`。
5. Go dispatch 只在同一 projection 内生成，不跨 projection 合并。

示例命名：

| 配置 | 查询名 |
|---|---|
| `summary + created_at` | `ListUserSummariesOrderByCreatedAt` |
| `summary + name` | `ListUserSummariesOrderByName` |
| `detail + created_at` | `ListUserDetailsOrderByCreatedAt` |
| `detail + name` | `ListUserDetailsOrderByName` |

---

## 校验规则

生成前必须失败退出的问题：

- `engine` 不在支持列表中。
- `schema` 文件不存在或无法解析。
- 配置中的表不存在。
- 配置中的列不存在。
- `sort` 字段不是表字段。
- `filters` 字段不是表字段。
- `update.columns` 包含主键、自增列、generated column 或禁止更新字段。
- `delete.mode: soft` 但缺少 soft delete 字段。
- 查询命名冲突。
- 生成目标目录里存在非 sqlmold 管理的同名文件。

推荐警告但不阻断的问题：

- `get_by` 字段没有唯一索引。
- `sort` 字段没有索引。
- 可选过滤字段过多。
- projection 没有包含主键。
- MySQL 配置了需要 `RETURNING` 的行为。

---

## 文件结构

```
project/
├── sqlc.yaml
├── sqlmold.yaml
├── schema.sql
├── generated/
│   ├── users.sql
│   └── posts.sql
└── db/
    ├── models.go
    ├── users.sql.go
    ├── posts.sql.go
    └── dispatch.go
```

生成文件建议带头部标记：

```sql
-- Code generated by sqlmold. DO NOT EDIT.
```

`dispatch.go` 也应带相同语义的 Go 注释：

```go
// Code generated by sqlmold. DO NOT EDIT.
```

---

## sqlc.yaml 示例

```yaml
version: "2"
sql:
  - engine: "postgresql"
    schema: "schema.sql"
    queries: "generated"
    gen:
      go:
        package: "db"
        out: "db"
        sql_package: "pgx/v5"
```

`sqlc.yaml` 的 `engine` 必须与 `sqlmold.yaml` 的 `engine` 一致。可以在 `sqlmold` 执行时读取并校验，避免生成出的 SQL 和 sqlc 解析方言不一致。

---

## Makefile 示例

```makefile
generate:
	go run ./cmd/sqlmold
	sqlc generate
```

如果作为独立 CLI 发布：

```makefile
generate:
	sqlmold generate
	sqlc generate
```

---

## 语言选型

使用 **Go** 实现，原因：

- 目标用户是 Go 开发者，工具链一致，便于贡献和调试。
- sqlc 本身是 Go 写的，schema 解析逻辑可参考复用。
- 单二进制分发，`go install github.com/xxx/sqlmold@latest` 与 sqlc 使用方式完全一致。
- `go generate` 集成自然，符合 Go 项目惯例。

> 曾评估 sqlc codegen plugin（WASM）方案：plugin 可以输出任意文件类型包括 `.sql`，但 sqlc 的多个 codegen plugin 是并行执行的，sqlmold 输出的 `.sql` 无法被同一次 `sqlc generate` 读取再生成 Go 代码，仍需两步执行，独立 CLI 更干净。

---

## 实现建议

优先实现 PostgreSQL，稳定后再扩展 MySQL / SQLite：

1. 解析配置。
2. 解析 schema 并建立表、列、索引元数据。
3. 校验配置和 schema 是否匹配。
4. 生成 PostgreSQL CRUD SQL。
5. 生成 `sqlc.yaml` 兼容性检查。
6. 生成 Go dispatch helper。
7. 增加 MySQL / SQLite 方言层。

内部模块建议：

```text
cmd/sqlmold/
internal/config/
internal/schema/
internal/dialect/
internal/generator/
internal/validate/
internal/naming/
```

---

## 场景选择

| 场景 | 推荐方案 | 原因 |
|---|---|---|
| 标准 CRUD | sqlmold 生成 | 重复度高，适合静态生成 |
| 固定字段查询 | `get_by` / `many_by` | 类型安全，可审查 |
| 动态排序 | sort 白名单展开 | `ORDER BY` 字段不能安全参数化 |
| 少量可选过滤 | `sqlc.narg` | 保持 sqlc 生成类型 |
| 多 projection 查询 | columns 固定展开 | 避免运行时选择列 |
| 完全动态过滤 | 运行时 SQL Builder | 编译期无法穷举 |
| 跨数据库支持 | 方言层 + 独立 schema 校验 | 不能只靠字符串替换 |
