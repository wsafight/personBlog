---
title: Drizzle 凭什么贴着 Go 跑——从设计哲学到热路径源码
published: 2026-05-10
description: 从设计哲学到热路径源码全面剖析 Drizzle ORM，解析其 Schema 即 TS、关系查询一条 SQL、.prepare() + JIT mapper 等核心设计如何一路传导到逼近 Go 的性能表现。
tags: [Node.js, ORM, Drizzle, 数据库, TypeScript]
category: Web 服务
draft: false
---

前几天翻 Drizzle 的官网，看到 benchmark 页面上有这么一张图：Drizzle（TypeScript ORM）和 Go 放在一起对比，数字还差不多。

我第一反应是："这不对吧？" 一个 JS 的 ORM 凭什么贴着 Go？是不是测试有猫腻？

benchmark 当然都有场景偏向，官网自己也提醒要谨慎看。但仔细看完测试设置、又把 Drizzle 源码翻了一遍，发现这事确实有解释空间——而且"为什么能接近"这个问题，答案比性能数字本身有意思得多。

性能只是个结果。要真正理解它，得先搞清楚几件事：

- 同样叫 ORM，Drizzle 和 Prisma、TypeORM 的心智模型有什么本质区别？
- 这些设计上的不同，是怎么一路传导到性能结果上的？
- 所谓的 `.prepare()` 和 `jit: true` 到底各自做了什么——前者把 SQL 编译、placeholder 和 mapper 绑定移出热路径，后者在 prepare 阶段生成专用 row mapper。

先放一张全局地图，急着看性能原理的可以直接跳到「性能」一节：

| 决策点 | Drizzle 选了啥 | 后果 |
|---|---|---|
| Schema | TS 表达式 | 不用 generate，类型实时更新 |
| 查询 DSL | 链式，跟 SQL 一一对应 | 懂 SQL 的人学习成本低 |
| 结果类型 | 纯对象字面量 | 没变更追踪、没 proxy |
| 关系查询 | 一条 SQL，DB 侧组装嵌套结果 | 少往返，嵌套交给数据库 |
| 性能路径 | `.prepare()` + 可选 `jit: true` | 热路径只剩填参数 + pg.query + row mapper |

这篇文章就按这个顺序展开。所有源码引用基于 [`drizzle-team/drizzle-orm`](https://github.com/drizzle-team/drizzle-orm) v1.0.0-rc.1。

先把名词钉住：本文里的 `.prepare()` 指 Drizzle query builder 的 prepare；`jit: true` 指 v1.0.0-rc.1 新增的 opt-in JIT mapper，不是把整条查询在应用构建期编译成机器码，而是在查询准备阶段为当前选中字段生成并复用专用映射函数。后文所有"热路径变薄"都按这个意思讲。

## ORM 到底在解决什么问题

不管哪种 ORM，至少都得回答四件事：Schema 怎么定义、查询怎么写、类型怎么对上、迁移怎么搞。你要是光用 `pg` 或者 `postgres`（postgres.js）这种裸驱动手写 SQL，其实连类型映射都只解决了一半：驱动给你的就是 `string` 和 `number`，`rows[0].user_name` 这字段在不在、拼写对不对，TS 完全不知道。

"ORM"这个标签下面，不同的库对这四件事给出了完全不同的答案。而 Drizzle 的答案，几乎决定了它其他所有特性——包括性能。

## Schema 定义：Drizzle vs Prisma

不同 ORM 在 schema 定义上的选择差别很大，分别来看。

### Prisma：我自己搞一套 DSL

```prisma
// schema.prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}
```

注意，这不是 TS，是 Prisma 自己的语言。用起来的流程是：

1. 写 `.prisma` 文件
2. 跑一下 `prisma generate`
3. 工具帮你生成 `@prisma/client`，里面有 TS 类型和各种查询方法
4. 代码里 `import { PrismaClient }` 开用

DSL 本身确实挺干净，读起来舒服。但麻烦在于：你每次改 schema，都得重新 generate 一下，IDE 里的类型才会跟上。而且你的类型是"生成出来的"，不是 TS 编译器直接从 schema 推导的——这俩事在日常开发里的手感完全不一样。

### Drizzle：schema 就是 TS 代码

```ts
// schema.ts
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').references(() => users.id),
  title: text('title').notNull(),
});
```

就这么简单，纯 TS，没有 generate 步骤，你敲完键盘的那一刻类型就变了。

那这玩意儿背后怎么做到的？看 `drizzle-orm/src/pg-core/table.ts:33` 的返回类型就明白了：

```ts
export type PgTableWithColumns<T extends TableConfig> =
  & PgTable<T>
  & { [Key in keyof T['columns']]: T['columns'][Key]; }
  & { enableRLS: () => ...; };
```

`pgTable` 的返回值**既是** `PgTable` 实例**又是** columns 字典。所以 `users.id` 你既能当对象用（它运行时带 `mapToDriverValue` 这些方法），又能在类型层面拿到精确的 `PgColumn<{ data: number; ... }>`。整条类型链从头到尾都在 TS 编译器里跑，不需要任何外挂工具。

这一个选择定下了 Drizzle 的整个基调：**它把 ORM 建立在 TS 类型系统本身之上，而不是外挂一个 schema 语言**。后面你会看到，很多性能和 DX 上的优势，都是从这一个决定一路推导出来的。

### TypeORM：装饰器 + class 实体

```ts
@Entity()
class User {
  @PrimaryGeneratedColumn() id!: number;
  @Column() email!: string;
  @OneToMany(() => Post, post => post.author) posts!: Post[];
}
```

TypeORM 支持 Active Record 和 Data Mapper 两种模式。如果让实体继承 `BaseEntity`，实例可以自带 `.save()`、`.remove()`；如果用 Data Mapper，操作会集中到 repository / entity manager 上。但不管哪种模式，它的核心模型都是"装饰器元数据 + class 实体"。

这套模型对很多 Java / Ruby 程序员很熟悉，代价也实实在在：查询结果通常要 hydrate 成 class 实例，关系、列映射和生命周期钩子都要经过运行时元数据；类型推导也不像 Drizzle 那样直接从 TS 表达式一路算出来。

## 查询怎么写：DSL 的哲学差异

Schema 定义只是起点，用起来最直接能感受到的还是查询 DSL。各家的差别在这里更明显。

### Drizzle：写起来跟 SQL 一模一样

```ts
const result = await db
  .select({ id: users.id, email: users.email, postCount: count(posts.id) })
  .from(users)
  .leftJoin(posts, eq(posts.authorId, users.id))
  .where(and(eq(users.active, true), gt(users.createdAt, lastWeek)))
  .groupBy(users.id)
  .having(gt(count(posts.id), 5))
  .orderBy(desc(users.createdAt))
  .limit(20);
```

你盯着这段代码看一眼就知道它啥意思——**链式调用的顺序跟 SQL 子句的顺序一一对应**。脑子里想好一条 SQL，直接往下敲就行，不用先把它重构成某种"查询对象图"。

### Prisma：把查询包装成对象

```ts
const result = await prisma.user.findMany({
  where: { active: true, createdAt: { gt: lastWeek } },
  include: {
    posts: { take: 5, orderBy: { createdAt: 'desc' } }
  },
  orderBy: { createdAt: 'desc' },
  take: 20,
});
```

这风格更像在"描述我要啥"而不是"告诉数据库怎么查"。简单场景确实挺顺手，一个对象塞进去啥都有了。

但复杂起来就容易撞墙：

- 想用 `GROUP BY ... HAVING`？得切到 `groupBy` API，语法跟 `findMany` 完全是两套
- 窗口函数、CTE、递归查询？在 `findMany` 这套 API 里基本不支持
- 复杂的 `OR` / `AND` 嵌套？只能写成层层套娃的对象

Prisma 把 SQL 的一个子集包装得漂漂亮亮，但超出这个子集你通常就得跳到 `$queryRaw` / TypedSQL 去写 SQL；它能解决 raw SQL 问题，但不能像 Drizzle 的 `sql` fragment 那样自然嵌回同一条 query builder 链里。

## 关系查询：把嵌套组装往数据库推

这里是真正拉开差距的地方，也是后面性能差距的一大来源。

**Prisma 的做法**分两种。`relationLoadStrategy: 'query'` 会先查父表，再发子查询，最后在 JS 里做嵌套组装；嵌套 N 层就会有多次往返。Prisma 6.0（2024年11月）起 `join` 成为默认 strategy：Postgres 下会用 `LATERAL JOIN` 加 JSON aggregation，让数据库侧直接组装嵌套结果。

所以这里真正的差异不是"谁会不会一条 SQL"，而是**这个能力是不是 Drizzle 一开始就围绕 SQL 形状设计出来的**。Drizzle RQBv2 的做法是直接生成一条关系查询 SQL，让数据库一次性返回嵌套好的结果：

```ts
const result = await db.query.users.findMany({
  with: {
    posts: {
      with: { comments: true },
      limit: 5,
    },
  },
});
```

Postgres 下生成出来的 SQL 大概长这样：

```sql
SELECT users.*, (
  SELECT json_agg(p) FROM (
    SELECT posts.*, (
      SELECT json_agg(c) FROM comments c WHERE c.post_id = posts.id
    ) AS comments
    FROM posts WHERE posts.author_id = users.id LIMIT 5
  ) p
) AS posts
FROM users;
```

**一次往返就搞定**，嵌套的活全交给 Postgres 去做。核心理念：**Drizzle 信任数据库，把活儿往下推**。

## 进阶特性：动态查询与 SQL 片段

大部分 ORM 遇到"根据条件拼查询"这种场景，最后都会退化成字符串拼接，或者各种 `if...else` 地狱。Drizzle 有一招挺妙的，在 `drizzle-orm/src/pg-core/query-builders/select.ts:1056`：

```ts
$dynamic(): PgSelectDynamic<this> {
  return this;
}
```

运行时什么也不做，但在类型层面把 query builder 标记为"可变"，允许后续链式调用：

```ts
function buildQuery(filters: Filters) {
  let q = db.select().from(users).$dynamic();
  if (filters.email) q = q.where(eq(users.email, filters.email));
  if (filters.sortBy) q = q.orderBy(users[filters.sortBy]);
  return q;
}
```

如果不调 `$dynamic()`，TS 会直接拒绝你给 `q` 重新赋值后的 builder 再加条件——因为链式方法的返回类型会"越链越窄"，限制你能调什么、不能调什么。`$dynamic()` 就是显式告诉 TS："我知道我在动态拼，放我一马"。这是类型安全和动态构造之间一个挺精致的平衡。

Drizzle 还自带一个 `sql` 模板字面量，既能塞到查询里当片段用，也能完全裸写 SQL：

```ts
// 嵌到查询里
db.select().from(users).where(sql`${users.email} ILIKE ${pattern}`);

// 完全裸写，动态 identifier 必须白名单校验后再拼
const viewName = allowedViews[input.viewName];
if (!viewName) throw new Error('invalid view name');
await db.execute(sql`REFRESH MATERIALIZED VIEW ${sql.identifier(viewName)}`);
```

模板字符串里的普通 `${}` 值会走参数化流程（就是前面提过的 `fillPlaceholders`），不是字符串拼接；表名、列名、view 名这类 identifier 不能当普通参数传，必须优先用 schema 对象。确实要动态传 identifier 时，可以用 `sql.identifier()` 做方言级转义，但输入仍然必须先过白名单；`sql.raw()` 只应该用于完全可信的 SQL 片段。

这里有个重要的区别值得特别强调：**Drizzle 的 `sql` 不是"紧急出口"，而是"一等公民"**。你可以在任何位置塞一段 `sql` 片段进去，不用放弃类型安全的整条查询。

Prisma 的 `$queryRaw` / TypedSQL 更像另一条查询通道：类型安全在改善，但它和 `findMany` / `include` 这套对象 API 不是同一个可组合系统。需要临时塞一个特殊 SQL 表达式时，Drizzle 这种 fragment 一等公民的模型更顺手。

## 类型映射：查出来的东西怎么变成 TS 类型

### 每一列自己管自己的类型转换

每个列的 builder 都带俩关键方法，`drizzle-orm/src/pg-core/columns/jsonb.ts` 是最小的例子：

```ts
export class PgJsonb<...> extends PgColumn<T> {
  getSQLType(): string { return 'jsonb'; }

  override mapToDriverValue(value: T['data']): string {
    return JSON.stringify(value);
  }

  override mapFromDriverValue(value: T['data'] | string): T['data'] {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return value as T['data']; }
    }
    return value;
  }
}
```

就这么简单——每一列自己负责 JS 和 driver 之间的双向转换。数组列会递归调 `baseColumn.mapFromDriverValue`（`columns/common.ts:334`），所以 `text[]` 出来就是 `string[]`，`integer[][]` 出来就是 `number[][]`，类型一点都不含糊。

这里有个细节值得说：**这些 mapper 就是普通方法**，没有什么元编程、没有反射、没有装饰器。`mapResultRow` 每次跑起来就是遍历一下字段列表，挨个调对应列的 `mapFromDriverValue`。简单到几乎没有运行时开销。

### 查询结果的类型从哪来

```ts
const rows = await db
  .select({ id: users.id, email: users.email })
  .from(users);
// rows: { id: number; email: string }[]  ← TS 自动推导
```

注意看：**这里完全没有代码生成、没有装饰器、也没有运行时的 schema lookup**。纯粹是 `.select({...})` 的参数类型和 `.from(users)` 的类型组合起来，让 TS 自己推导出来的。

这就是"schema 就是 TS"带来的直接好处：既然 schema 本身是 TS 表达式，那查询结果的类型推导也就是正常的 TS 类型运算，不需要任何外挂工具。

Prisma 就不一样了——`rows` 的类型是从生成的 `UserGetPayload<...>` 来的。你改完 schema 必须重跑 `prisma generate`，TS 那边才能感知到。这个延迟听起来没啥，但日常开发里真的烦。

### 没有变更追踪，这是好事

Drizzle 查出来的数据是**纯对象字面量**，不是什么带方法的实例。你没法写 `user.save()` 这种东西，想更新就得老老实实写 `db.update(users).set(...).where(eq(users.id, user.id))`。

看起来啰嗦，但这个设计是有意为之的：

- 纯对象 = 没有 class hydrate、没有 proxy、没有变更追踪对象
- 没有隐式状态 = 不会"脏检查"，也不会因为访问某个属性就意外触发一条查询（延迟加载的坑）
- 拿来直接 `JSON.stringify` 就能扔给前端，不用 `.toJSON()` 什么的

代价是手写 update 语句比 `user.save()` 多打几个字。但换来的是**可预测性**：看到一次 `db.update()`，就是一次数据库操作，没有隐藏的调用。

## 生态和运行时：能在哪些地方跑

### 驱动适配：分层架构的红利

Drizzle 的代码组织本身就能说明它的设计理念。`drizzle-orm/src/` 下面长这样：

```
pg-core/         ← 方言抽象（SQL 生成、query builder）
node-postgres/   ← node.js pg 驱动适配器
postgres-js/     ← postgres.js 驱动适配器
neon-http/       ← Neon serverless HTTP 适配器
neon-serverless/ ← Neon WebSocket 适配器
pglite/          ← WASM Postgres 适配器
vercel-postgres/ ← Vercel 适配器
...
```

核心逻辑（SQL 生成、query builder）都在 `pg-core` 里，抽象出 `PgSession` 和 `PgPreparedQuery`（`pg-core/session.ts:168`）。每个驱动适配器只管实现 `prepareQuery` 这一个方法——把 Drizzle 生成的 `{ sql, params }` 翻译给自己对应的驱动就完事了。

支持的数据库一长串：Postgres、MySQL、SQLite、SingleStore、MSSQL、CockroachDB、Gel，外加它们各自的 serverless 变体。

这架构最实际的好处是：**同一套 schema 和查询 DSL 可以复用在不同驱动上**。你今天用本地 `pg`，明天想上 Neon serverless，通常主要改初始化和 import，业务查询不用跟着重写。Prisma 7 的 Driver Adapters 已是默认，换驱动的体验也改善了很多，但抽象模型仍然比 Drizzle 厚。

### Edge / Serverless：能跑吗？

现在写 TS 后端绕不过去的一个问题：能不能扔到 Cloudflare Workers、Vercel Edge Functions、AWS Lambda 上跑？

Drizzle 的核心库是**纯 TS，零原生依赖**。V8 isolate、Node 冷启动都没问题，配上 Neon HTTP 或 Cloudflare D1 整条链路都能塞进 edge runtime。

对比：Prisma 7.0（2025年11月）已切换到纯 TypeScript 实现，移除了 Rust query engine，原生支持 edge runtime；TypeORM 重度依赖反射和装饰器运行时，在 edge runtime 里限制会多很多。

Bundle size 也是实际差距：Drizzle 核心和驱动适配器很薄；Prisma 7 移除 Rust engine 后 bundle 已大幅缩小，但生成的 Client 代码仍然比 Drizzle 重。具体数字会随版本、bundler 和目标平台变化，最好以你的实际构建产物为准。

### drizzle-kit：迁移怎么处理

schema 在代码里写好了，怎么落到生产数据库？drizzle-kit（独立的 CLI 工具）给了三条路：

```bash
# 1. 生成迁移 SQL（生产环境推荐）
drizzle-kit generate
# 对比当前 schema.ts 和上次的快照，生成 0001_xxx.sql

# 2. 直接推（开发期用）
drizzle-kit push
# 不生成迁移文件，直接 ALTER TABLE 怼过去

# 3. 从已有数据库反向生成 schema.ts
drizzle-kit introspect
```

原理不复杂：drizzle-kit 在 `meta/` 目录下存一个 schema 的 JSON 快照，`generate` 的时候对比新旧快照得到 `jsonStatements`（看 `drizzle-kit/src/jsonStatements.ts` 和 `snapshotsDiffer.ts`），再由 `sqlgenerator.ts` 翻译成对应方言的 SQL。

跟 Prisma Migrate 比：

- 两家都是声明式 schema → 自动生成迁移，这点一样
- Prisma 的迁移历史塞在 `_prisma_migrations` 这张表里，还需要一个 shadow database 用来检测漂移
- Drizzle 生成的就是普通 SQL 文件，人眼可读，你随便拿编辑器打开改

**能手改**这件事在实际生产里太重要了。自动生成的迁移偶尔会是不安全的——比如给一张大表加 `NOT NULL` 列，没有 `DEFAULT` 直接上可能锁死一段时间。你得能打开那个 SQL 文件，加个默认值，或者拆成"加列 + 回填 + 加约束"这种分步流程。Prisma 也能手改，但 Drizzle 这种纯 SQL 文件心理负担小得多。

## 性能：前面所有选择的后果

铺垫了这么久，终于可以回到一开始那个问题：**Drizzle 凭什么贴着 Go 跑？**

前面每一章的设计选择都在为性能铺路，现在钻进源码看看热路径上具体省了什么。

假设你写了这么一段代码：

```ts
const q = db.select().from(users)
  .where(eq(users.id, sql.placeholder('id')))
  .prepare('get_user');

await q.execute({ id: 1 });
```

如果你在初始化 Drizzle 时打开 `jit: true`，同一个 prepare 过程里还会生成专用的 row mapper。为了避免混在一起，先看 `.prepare()` 本身，再看 JIT mapper。

### `.prepare()` 到底做了什么

v1.0.0-rc.1 把 prepare 逻辑从 query builder 中拆出，移到了 `pg-core/async/select.ts:104`：

```ts
_prepare(name?: string, generateName = false): PgAsyncSelectPrepare<this> {
  const { session, config, dialect, joinsNotNullableMap, cacheConfig, usedTables } = this;
  return tracer.startActiveSpan('drizzle.prepareQuery', () => {
    const query = dialect.sqlToQuery(this.getSQL());       // 1. AST → SQL + params
    const fieldsList = orderSelectedFields<PgColumn>(fields);
    const mapper = this.dialect.mapperGenerators.rows(fieldsList, joinsNotNullableMap);
    const preparedQuery = session.prepareQuery(            // 2. 创建预编译查询
      query, 'arrays', name ?? generateName, mapper,
      { type: 'select', tables: [...usedTables] }, cacheConfig,
    );
    return preparedQuery;
  });
}
```

三件大事在查询准备阶段一次性做完，之后执行同一个 prepared query 时不再重复：

- SQL chunk 编译成 `{ sql, params }`
- select fields 排序并绑定 row mapper
- 让具体 session 生成 `PgPreparedQuery`

### SQL 编译：就是 chunk 拼字符串

`dialect.sqlToQuery()` 最终会调到 `sql/sql.ts:170` 的 `buildQueryFromSourceParams`：

```ts
buildQueryFromSourceParams(chunks: SQLChunk[], _config: BuildQueryConfig): Query {
  // ...
  const mappedChunks = chunks.map((chunk): QueryWithTypings => {
    if (is(chunk, StringChunk)) return { sql: chunk.value.join(''), params: [] };
    if (is(chunk, Name))        return { sql: escapeName(chunk.value), params: [] };
    // ... Param / Placeholder / 嵌套 SQL / 数组
  });
}
```

注意一个关键细节：**`Placeholder` 在这一步不会被替换掉**，它会被原样塞进 `params` 数组里。这就是为什么 SQL 字符串能一次生成、无数次复用的秘密——参数填充是后面的事。

编译结果 `{ sql: "SELECT ... WHERE id = $1", params: [Placeholder('id')] }` 被缓存在 `PgAsyncPreparedQuery` 实例里。

### 驱动层也提前把东西准备好

去看 `drizzle-orm/src/node-postgres/session.ts:65`，`prepareQuery` 方法里干了件聪明事——把 pg 驱动要的 `QueryConfig` 封装成一个 `executor` 闭包，**一次性**捕获所有配置：

```ts
prepareQuery(query, mode, name, mapper, queryMetadata, cacheConfig) {
  const queryName = typeof name === 'string'
    ? name
    : name === true ? preparedStatementName(query.sql, query.params) : undefined;

  const executor = async (params?: unknown[]) => {
    return this.client.query({
      name: queryName,           // ← 关键
      rowMode: mode === 'arrays' ? 'array' : undefined,
      text: query.sql,
      types: typeConfig,
    }, params).then((r) => mode === 'raw' ? r : r.rows);
  };

  return new PgAsyncPreparedQuery(executor, query, mapper, ...);
}
```

闭包创建完就定型了，之后每次执行都是同一个 `executor` 直接调用。注意：`QueryConfig` 对象字面量仍然是在 `executor` 里创建的，每次调用都会有一个很小的对象分配；真正被复用的是 SQL、`queryName`、mapper 和闭包里捕获的配置。

**`name` 字段是整件事的点睛之笔**：pg 驱动看到 `QueryConfig.name` 有值，就会使用 named prepared statement。第一次在某个连接上执行时，Postgres 会按这个 name 缓存解析后的 statement；之后同一连接上的同名调用可以复用它，省掉重复 parse 的开销，并且在多次执行后（默认第 6 次起）Postgres 还可能切换到 generic plan，后续执行直接复用同一个 plan，不再重新规划。至于 plan 是 custom 还是 generic、何时复用，Postgres 自己还有一套策略（`plan_cache_mode`），不宜简单说成"永远跳过 plan"。

值得注意的是，rc.1 里如果你调 `.prepare()` 不传 name，Drizzle 会自动根据 SQL 和 params 生成一个确定性的 statement name（`preparedStatementName(query.sql, query.params)`），所以即使不手动命名也能享受 server-side prepare。

有意思的是：**Drizzle 自己其实啥都没做**，它就是把这个 `name` 透传下去。所谓"server-side prepare"的活儿，是 pg 驱动和 Postgres 服务器之间完成的。Drizzle 只是足够聪明地站在了正确的位置。

### 热路径：`execute()` 新增 fastPath 优化

看 `drizzle-orm/src/pg-core/async/session.ts:61`：

```ts
async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
  const { query, logger, executor, mapper, fastPath } = this;

  if (fastPath) {
    const params = query.params.length === 0
      ? query.params
      : fillPlaceholders(query.params, placeholderValues);  // 1
    logger.logQuery(sql, params);
    const res = executor(params);                            // 2
    if (!mapper) return res;
    return res.then((rows) => mapper(rows));                 // 3
  }
  // 非 fastPath 走 tracing span...
}
```

rc.1 新增了 `fastPath` 判断（`session.ts:56`）：当没有 cache、没有 telemetry 时，跳过 tracing span 直接执行。热路径比之前更薄——连 tracing 的开销都省了。

再看 `fillPlaceholders`（`sql.ts:793`），还是一个 `.map()`：

```ts
export function fillPlaceholders(params: unknown[], values: Record<string, unknown>): unknown[] {
  return params.map((p) => {
    if (is(p, Placeholder)) return values[p.name];
    if (is(p, Param) && is(p.value, Placeholder))
      return p.encoder.mapToDriverValue(values[p.value.name]);
    return p;
  });
}
```

**没有 SQL 生成、没有 AST 遍历、没有类型反射**——能提前做的全在查询准备阶段做完了，热路径薄到几乎透明。

### `jit: true` 到底 JIT 了什么

v1.0.0-rc.1 的 JIT 不是把 SQL 编译成机器码，也不是把业务查询提前塞进构建产物里。它做的是更窄的一件事：在 `.prepare()` 的时候，为当前 select fields 生成一个专用 mapper。

默认 mapper 是通用函数，执行时要按字段列表循环、判断 nested path、处理 nullability、再调用每列的 decoder。JIT mapper 则把这套结构展开成当前查询专用的函数。换句话说，`.prepare()` 复用的是查询形状，`jit: true` 进一步复用的是"这条查询的结果该怎么组装"。

所以 benchmark 里所谓 "JIT" vs "non-JIT" 的差异，不能简单理解成"构建期优化 vs 运行时优化"。更准确的说法是：non-JIT 走通用 row mapper；JIT 在 prepare 阶段生成专用 mapper，减少每行结果映射时的分支和循环。

### 不调 `.prepare()` 呢？

看 `pg-core/async/select.ts:144` 这条对比路径：

```ts
execute(placeholderValues?: Record<string, unknown>) {
  return this._prepare().execute(placeholderValues);
}
```

你直接 `await db.select()...` 不调 `.prepare()` 的话，**每次请求都会调一遍 `_prepare()`**——重新走 chunk 遍历拼 SQL、重新建 `PgAsyncPreparedQuery` 和 `executor` 闭包。因为这条临时 prepare 没有稳定的 statement name，也就吃不到 named prepared statement 在同一连接上复用 server-side statement 的收益。

现在应该也能看出 Drizzle 性能故事里其实有两层：`.prepare()` 把 SQL 编译和查询对象创建从热路径拿出去；`jit: true` 把结果映射也变成当前查询专用的函数。两层叠起来，才是官网 benchmark 里那条很薄的路径。

### 那为啥其他 ORM 做不到这种薄？

同样是 TS，Prisma 和 TypeORM 在同一条路径上到底比 Drizzle 多做了什么？

- **Prisma（≤6.x 老架构）**：查询对象 → 序列化成 JSON → IPC 到 Rust query engine 子进程 → 反序列化 → engine 里生成 SQL → 查库 → 结果序列化回来 → Node 这边再反序列化。每次查询跨进程两次，固定开销天然更高。
- **Prisma 7（纯 TS 架构）**：Rust engine 已移除，查询在 Node 进程内直接编译成 SQL，跨进程开销归零。但查询对象到 SQL 的翻译层仍然比 Drizzle 更厚——Prisma 的抽象模型（对象化查询 → 内部 IR → SQL）比 Drizzle 的"链式调用 ≈ SQL 子句"多一层转换。
- **TypeORM**：查询结果要 hydrate 成 class 实体，还要依赖运行时 metadata 处理列映射、关系和生命周期钩子；如果使用 Active Record，还会把持久化方法挂到实体模型上。
- **关系查询**：Prisma 6.0 起默认用 `join` strategy（LATERAL JOIN + JSON aggregation），和 Drizzle 一样在数据库侧组装嵌套结果。差异在于 Drizzle 从第一天就围绕 SQL 形状设计，`sql` 片段可以自然嵌入关系查询；Prisma 的 `include` / `select` 对象 API 和 raw SQL 仍然是两套系统。

所以问题根本不在"TS 慢"，而在"抽象有多厚"。Drizzle 的抽象厚度刚好覆盖类型安全和 SQL 生成，再往下一步都不做，把性能空间全留给底层。

## 什么时候 Drizzle 不是好选择

说了这么多好话，也得诚实——Drizzle 不是万能的，有几个场景它真的不合适：

**团队习惯 ActiveRecord 那套**。如果你团队大部分人是从 Rails / Hibernate / Django ORM 过来的，习惯了 `user.save()` 这种工作流，Drizzle 的显式 `db.update().set().where()` 会让他们觉得特别啰嗦。这不是谁好谁坏的问题，是心智模型的差异。强行切换可能反而让团队效率变低。

**SQL 不熟的团队**。Drizzle 的 DSL 跟 SQL 一一对应，好处是懂 SQL 的人上手快，坏处是**不懂 SQL 的人上手慢**。如果你团队里有不少只用过 ORM、没认真写过 SQL 的成员，Prisma 那种对象化查询在简单场景下反而更友好。

**查询高度动态的场景**。前面说了，Drizzle 占便宜靠的是能 `.prepare()` 一次。但如果你的业务里过滤条件、字段、排序规则都跟请求变化，查询形状很难稳定复用，每次都得重新构造 SQL。这种场景下 Drizzle 相对其他 ORM 的性能优势会缩水。

**CPU-bound 的工作负载（这条其实不是 Drizzle 的问题）**。别忘了 benchmark 结果的前提是 DB-bound——大部分时间都在等数据库。如果你的应用花大量时间在 JS 里做计算（比如复杂的业务规则、数据转换），那 Go 的优势会立刻拉开，换什么 ORM 都救不了你。这不是 Drizzle 的短板，而是 ORM 选型本身就不是这类场景的瓶颈所在——你该考虑的是换语言或者把计算下推到数据库。

**有特别复杂的 legacy schema 要迁移**。drizzle-kit 的自动迁移对常见变更来说够用，但遇到跨 schema 重命名、复杂约束变更这种情况，偶尔还是得手工调整。不过这是所有自动迁移工具的通病，不是 Drizzle 独有的问题。

## 总结

回头看这一整套设计，每个决策之间都是互相印证的：

| 决策点 | Drizzle 选了啥 | 后果 |
|---|---|---|
| Schema | TS 表达式 | 不用 generate，类型实时更新 |
| 查询 DSL | 链式，跟 SQL 一一对应 | 懂 SQL 的人学习成本低，复杂查询也不退化 |
| 结果类型 | 纯对象字面量 | 没变更追踪、没 proxy、序列化友好 |
| 关系查询 | 一条 SQL，DB 侧组装嵌套结果 | 少往返，嵌套交给数据库 |
| 驱动层 | 薄适配器 | 支持所有主流 PG 驱动和 serverless 变体 |
| 迁移 | 人眼可读的 SQL 文件 | 能手改，审计友好 |
| 性能路径 | `.prepare()` + 可选 `jit: true` | 热路径就剩填参数 + pg.query + row mapper |

回到最开始那个问题——**"贴着 Go 跑"不是什么性能 trick，而是这套设计哲学自然而然的结果**。核心思想一句话：**ORM 只做类型安全和 SQL 生成，别的事情都交给下面的层**。

Drizzle 不是银弹——它要求你懂 SQL，不适合 Active Record 爱好者，高度动态查询场景没有特殊优势。但如果你想要**类型安全 + 贴近 SQL + 能在 edge 上跑 + 性能不成为瓶颈**的 TS 后端方案，它是目前少数几个取舍非常清楚的选项之一。

**Drizzle 真正的价值不在它快，而在它薄。** 快只是薄的副产品。

## 参考

- Drizzle benchmarks: https://orm.drizzle.team/benchmarks
- Drizzle v1.0.0-rc.1 release notes（JIT mapper）：https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0-rc.1
- Drizzle `sql` API：https://orm.drizzle.team/docs/sql
- Prisma relation load strategies：https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries
- node-postgres prepared statements：https://node-postgres.com/features/queries
- TypeORM Active Record vs Data Mapper：https://typeorm.io/docs/guides/active-record-data-mapper/
- 源码：[`drizzle-team/drizzle-orm`](https://github.com/drizzle-team/drizzle-orm)（本文基于 v1.0.0-rc.1）
  - `src/pg-core/table.ts` — `pgTable` 定义
  - `src/pg-core/query-builders/select.ts` — 查询 builder 和 `$dynamic()`
  - `src/pg-core/async/select.ts` — `.prepare()` / `_prepare()` 入口
  - `src/pg-core/async/session.ts` — `PgAsyncPreparedQuery`（fastPath + execute）
  - `src/pg-core/columns/*.ts` — 列类型与 `mapToDriverValue` / `mapFromDriverValue`
  - `src/sql/sql.ts` — chunk 编译（`buildQueryFromSourceParams`）和 `fillPlaceholders`
  - `src/node-postgres/session.ts` — pg 驱动适配（`prepareQuery` + executor 闭包）
- drizzle-kit：`drizzle-kit/src/jsonStatements.ts`、`snapshotsDiffer.ts`、`sqlgenerator.ts`
