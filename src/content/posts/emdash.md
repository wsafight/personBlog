---
title: EmDash：如果今天重写一遍 WordPress
published: 2026-06-30
description: 从设计动机一路下探到源码，拆解 EmDash 这个建立在 Astro 与 Cloudflare 上的全栈 TypeScript CMS：它把 CMS 编进 Astro，把插件放进 Worker 沙箱，用结构化 Portable Text 和数据库 schema 取代序列化 HTML。
tags: [EmDash, CMS, Astro, Astro集成, Cloudflare, WordPress, 插件沙箱, 结构化内容]
category: 后端
draft: false
---

如果只用一句话解释 EmDash：**它是按今天的工具重写一遍的 WordPress——把扩展性、后台体验和插件生态搬到 Serverless 和类型安全的地基上。**

:::note[三句速览]
- **它是什么**：一个 Astro 集成。你在 `astro.config.mjs` 里加一行，后台、REST API、认证、媒体库、插件系统就一起进站点，默认跑在 Cloudflare（D1 + R2 + Workers）上。
- **它重做了什么**：插件被关进 Worker 沙箱，按能力清单授权；内容存成结构化 Portable Text，schema 直接落成真实 SQL 表，而不是序列化 HTML 或 EAV。
- **现在能用吗**：截至 2026-06 仍是 beta preview。尝鲜可以，投产前要自己评估稳定性。
:::

真正会注意到变化的人，既有内容作者，也有搭站和写插件的人。对他们来说，过去那些别扭的事开始变顺了：

- 装一个插件不再意味着“把整个数据库和文件系统的钥匙交出去”。
- 非开发者能在后台点出一个新的内容类型，背后却是一张真正的 SQL 表，而不是一坨序列化字段。
- 写好的内容能同时渲染成网页、邮件、移动端或一个 API 响应，而不被锁死在某种 HTML 里。
- 部署一个 CMS 不再需要单独养一台 PHP 主机，直接随 Astro 站点发上去就行。

过去很长一段时间，自托管 CMS 的人只能在两种痛苦里二选一：要么用 WordPress 拿到无与伦比的插件生态，同时承受 PHP 运维、层层缓存和来自插件的安全漏洞；要么用各种 headless CMS 拿到干净的 API 和现代栈，却失去后台 UX 和“非开发者也能改”的能力。EmDash 想补的正是这个缺口。

这篇文章会沿一条线走：先讲它为什么这么设计，再一路下探到源码——看 Astro 集成入口、请求中间件链、插件沙箱加载和 schema 入库这几处的真实实现。本文引用的源码均来自 EmDash 仓库，行内的 `文件:行号` 标注方便你对照着读。我们想回答两个问题：**这套设计到底解决了 WordPress 的什么结构性问题，以及为什么“把 WordPress 重写一遍”这件事到今天才真正可行。**

---

## WordPress 的问题不在功能，而在它诞生的年代

先说清楚：WordPress 不是因为功能差才被人想替换。恰恰相反，它的后台 UX、所见即所得编辑、插件市场和“非技术人员也能维护一个站”的能力，至今仍是行业标杆。它真正的负担来自它诞生的那个年代。

那个年代的默认架构是：一台长期运行的服务器，跑 PHP，连一个 MySQL，把渲染和数据都压在同一台机器上。于是今天运行一个 WordPress 站，往往意味着：PHP 和 JavaScript 两套语言并行维护，为了能跑得动要叠好几层缓存，还要时刻提防插件带来的安全问题。

最刺痛的是插件安全模型。WordPress 的插件直接运行在主进程里，拥有对数据库、文件系统和用户数据的完全访问权限——一个有漏洞的插件就能拖垮整个站。统计上，[96% 的 WordPress 安全漏洞来自插件](https://patchstack.com/whitepaper/state-of-wordpress-security-in-2024/)。这不是某个插件作者粗心，而是架构本身没有给插件画边界。

所以 EmDash 的出发点不是“做一个功能更多的 CMS”，而是一个更克制的问题：**如果保留 WordPress 让人离不开的那些东西（扩展性、后台、生态），但从零开始用今天的地基重写，会长成什么样？**

---

## 地基是一个 Astro 集成：一行配置背后发生了什么

EmDash 的第一个根本变化，是它不再是一个需要单独部署的应用，而是一个 **Astro 集成**。你在 `astro.config.mjs` 里加一行，就得到一整套 CMS：后台面板、REST API、认证、媒体库和插件系统。

```typescript
// astro.config.mjs
import emdash from "emdash/astro";
import { d1 } from "emdash/db";

export default defineConfig({
	integrations: [emdash({ database: d1() })],
});
```

要理解这一行为什么能换来一整套 CMS，得先看 Astro 集成本身是什么。一个 Astro 集成就是一个带 `hooks` 的对象，Astro 会在构建/启动的不同阶段回调这些 hook，并把一组“能改写宿主项目”的工具函数交给你，比如 `injectRoute`（注册页面/接口路由）、`addMiddleware`（往请求链里塞中间件）、`updateConfig`（改写 Vite/Astro 配置）。换句话说，集成不是一个跑在旁边的服务，而是在宿主项目编译期“长进去”的一段代码。

EmDash 的 `emdash()` 正是返回这样一个对象。它的主力 hook 是 `astro:config:setup`，在构建期一次性接管上面那几样工具：

```typescript
// packages/core/src/astro/integration/index.ts
return {
	name: "emdash",
	hooks: {
		"astro:config:setup": ({
			injectRoute,
			addMiddleware,
			updateConfig,
			config: astroConfig,
			command,
		}) => {
			// updateConfig() 注入 Vite 配置，填充 virtual:emdash/* 虚拟模块
			// injectRoute() 注册 /_emdash/ 下的 50+ 个 API 路由与后台页面
			// addMiddleware() 按顺序塞入运行时/鉴权/上下文中间件
			// ...
		},
	},
};
```

所以那“一行配置”的展开顺序是：构建期 `astro:config:setup` 触发；`updateConfig` 把数据库方言、存储适配器等信息写进 `virtual:emdash/*` 虚拟模块；`injectRoute` 把后台 SPA 和全部 REST 接口注册进路由表；`addMiddleware` 把请求链铺好。等真正的请求打进来时，整套运行时早已就位。CMS 不是被部署在你的站点旁边，而是被编译进了你的站点。

它的默认目标平台是 Cloudflare：数据库用 D1，存储用 R2，逻辑跑在 Workers 上。但它没有把自己锁死在 Cloudflare 上。每一层都用了可移植的抽象——SQL 用 Kysely，存储走 S3 API——所以同样的代码也能跑在 Node + SQLite、Turso、PostgreSQL、AWS S3 或本地文件上。具体的方言/存储实现就是通过上面 `updateConfig` 填进虚拟模块的，运行时只面向抽象接口，不关心底下是 D1 还是 SQLite。

| 层      | Cloudflare              | 也能用                              |
| ------- | ----------------------- | ----------------------------------- |
| 数据库  | D1                      | SQLite、Turso/libSQL、PostgreSQL    |
| 存储    | R2                      | AWS S3、任意 S3 兼容服务、本地文件   |
| 会话    | KV                      | Redis、文件                         |
| 插件沙箱 | Worker Loader（隔离）    | workerd 适配器（Node）；无 runner 时可改为 `plugins: []` 进程内插件 |

对运维者来说，这条线的意义很直接：开发时在 Node + SQLite 上跑，零成本、不需要 Cloudflare 账号；上线时换成 D1 + R2，享受边缘部署，而不用重写业务代码。

---

## 一次请求怎么跑：中间件链与 ALS

上一节说集成在构建期用 `addMiddleware` 把请求链铺好了。这条链是 EmDash 把“数据库、鉴权、运行时上下文”塞进每个请求的地方，值得单独拆开看，因为它解释了为什么后台、API、前台页面能共用同一套运行时。

这些中间件在 `astro:config:setup` 里按固定顺序注册，且都用 `order: "pre"`——意味着它们跑在 Astro 默认中间件之前，请求到达任何路由处理器时，运行时已经准备好：

```typescript
// packages/core/src/astro/integration/index.ts
addMiddleware({ entrypoint: "emdash/middleware", order: "pre" }); // 运行时初始化
addMiddleware({ entrypoint: "emdash/middleware/redirect", order: "pre" });
addMiddleware({ entrypoint: "emdash/middleware/setup", order: "pre" }); // 首次部署引导
addMiddleware({ entrypoint: "emdash/middleware/auth", order: "pre" }); // 只认证，不授权
addMiddleware({ entrypoint: "emdash/middleware/request-context", order: "pre" }); // ALS
```

一次请求穿过这条链的样子，大致是这样：

```text
  HTTP 请求
     │   order:"pre" 中间件链（构建期 addMiddleware 一次性铺好，跑在 Astro 默认中间件之前）
     ▼
  ① emdash/middleware              运行时初始化：拿到/惰性创建 EmDashRuntime 单例
  ② emdash/middleware/redirect     应用重定向规则
  ③ emdash/middleware/setup        首次部署？→ 导去 /_emdash/admin/setup 跑迁移、建管理员
  ④ emdash/middleware/auth         校验会话（Passkey / OAuth / magic link），解出当前用户
  ⑤ emdash/middleware/request-context   建立 AsyncLocalStorage 请求级上下文（可选覆盖 db）
     │
     ▼
  路由处理器  ← 后台 SPA / REST API / 前台页面，共用同一套已就位的运行时
     └─ 授权在这里才发生：requirePerm 按权限串判断“你能不能做这件事”
```

把这条链顺着读下来，就是一次请求的生命周期：

- **运行时初始化**（`emdash/middleware`）：拿到（或惰性创建）`EmDashRuntime` 单例。它编排数据库、`PluginManager`、存储、沙箱 runner 与调度器——所有后续中间件和路由都从这里取依赖。
- **setup 检查**：首次部署时探测系统表是否存在，没有就把用户导去 `/_emdash/admin/setup`，跑迁移、建管理员。
- **auth**：校验会话（Passkey / OAuth / magic link），解出当前用户。注意它**只做认证不做授权**——“你是谁”在中间件解决，“你能不能做这件事”留到路由里按权限判断（见后面「为内容创作者保留的」一节的 `requirePerm`）。
- **request-context**：建立基于 `AsyncLocalStorage`（ALS）的请求级上下文。

ALS 这一层值得多说一句，它是 EmDash 处理“预览”和“playground”这类需要临时换数据库场景的关键。请求上下文里存着一个可选的 `db`，而所有查询入口的 `getDb()` 都遵循同一个约定：先看 ALS 里有没有被覆盖的库，没有才回退到模块级单例。

```typescript
// 简化自 packages/core/src/loader.ts
function getDb() {
	return getRequestContext()?.db ?? moduleSingletonDb;
}
```

这意味着预览草稿、可视化编辑、playground 隔离会话都能在不改动任何查询代码的前提下“换一个库进来”——查询函数完全不知道自己这次跑在主库还是某个隔离副本上。这种“上下文驱动的依赖替换”是边缘运行时下的惯用法：没有长驻进程能持有可变全局状态，ALS 是少数能安全地携带请求级状态穿过整条调用栈的机制。

---

## 真正的重做：插件跑在沙箱里，能力是声明出来的

EmDash 最核心、也最能体现“为什么是今天”的设计，是它的插件模型。

WordPress 插件的问题前面说过：它们和主程序共享一切。EmDash 把这件事彻底反过来——插件运行在隔离的 [Worker 沙箱](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/)里（Cloudflare 上通过 Dynamic Worker Loader），每个插件带一份**能力清单**（capability manifest）。一个声明了 `content:read` 和 `email:send` 的插件，就只能做这两件事，多一点都不行。

```typescript
export default () =>
	definePlugin({
		id: "notify-on-publish",
		capabilities: ["content:read", "email:send"],
		hooks: {
			"content:afterSave": async (event, ctx) => {
				if (event.content.status !== "published") return;
				await ctx.email.send({
					to: "editors@example.com",
					subject: `New post: ${event.content.title}`,
				});
			},
		},
	});
```

这里有几个值得拆开看的设计细节：

**能力是白名单，不是约定。** 能力字符串是一组明确的枚举——`content:read`、`content:write`、`media:read`、`network:request`、`email:send` 等等。运行时按清单授权，插件拿不到没声明的桥接接口。它不是“请你自觉别乱动数据库”，而是从隔离层面让你动不了。

对应到源码，这组能力就是一份明确的枚举常量——没在这张表里的字符串，根本通不过 manifest 校验：

```typescript
// packages/core/src/plugins/manifest-schema.ts
export const CURRENT_PLUGIN_CAPABILITIES = [
	"network:request",
	"network:request:unrestricted",
	"content:read",
	"content:write",
	"media:read",
	"media:write",
	"users:read",
	"email:send",
	"hooks.email-transport:register",
	"hooks.email-events:register",
	"hooks.page-fragments:register",
] as const;
```

注意命名是 `content:read`（资源在前、动作在后）。早期版本用过 `read:content` 这种反向写法，现在作为 deprecated 别名保留、在发布时会被规范化并告警——所以你看老插件里 `read:content` 不要照抄。

**沙箱有资源上限。** 在 Cloudflare runner 下，每次调用默认受 CPU 时间（50ms）、内存（128MB）、子请求数和墙钟时间限制。一个写得糟糕或者恶意的插件，最坏情况是自己这次调用被掐掉，而不是拖垮整个站点。

这些上限不是文档里的口头承诺，而是沙箱运行时（Worker Loader）强制执行的接口约束：

```typescript
// packages/core/src/plugins/sandbox/types.ts
export interface ResourceLimits {
	/** 每次调用的 CPU 时间，单位毫秒（默认 50ms） */
	cpuMs?: number;
	/** 内存上限，单位 MB（默认 128MB） */
	memoryMb?: number;
	/** 每次调用允许的子请求数（默认 10） */
	subrequests?: number;
	/** 墙钟时间上限，单位毫秒（默认 30000ms） */
	wallTimeMs?: number;
}
```

**插件通过 hook 参与生命周期，而不是直接改全局状态。** 上面例子里的 `content:afterSave` 就是一个 hook：内容保存后触发，插件在自己的隔离环境里收到一个事件和一个受限的 `ctx`，能做的事由它声明的能力决定。`ctx.email.send` 之所以能用，正是因为它声明了 `email:send`，并且宿主站点已经注册了邮件 transport。

**这套隔离具体怎么加载？** `PluginManager` 负责插件的注册与生命周期，真正的隔离交给一个 `SandboxRunner` 接口，由平台适配器实现。在 Cloudflare 上，适配器拿到 Worker Loader 绑定，把插件 bundle 装进一个独立的 V8 isolate，插件对 `db`、`storage`、`email` 的调用全部通过一个 RPC bridge 回到宿主，再按能力清单校验每一次调用。资源上限也是在这一层由 Worker Loader 强制执行的。所以“隔离 + 能力声明”不是两个独立机制，而是同一道边界：插件连越权调用的入口都拿不到。

**不在 Cloudflare 上呢？这里有个容易被误读的点。** 沙箱不是 Cloudflare 独有——Node 上可以装 `@emdash-cms/sandbox-workerd` 适配器，用 workerd 拿到同样的隔离。如果没有配置 runner，`sandboxed: []` 里的插件会在启动时跳过；想在当前平台继续跑，就把它移到 `plugins: []`，作为进程内插件执行：

```typescript
// packages/core/src/plugins/sandbox/noop.ts
async load(_manifest, _code): Promise<SandboxedPluginInstance> {
	throw new SandboxNotAvailableError();
}
```

这时它不再有隔离和资源上限，应该按 native 插件的信任级别对待。换句话说，EmDash 不会把“你以为有沙箱、其实没有”的中间状态留给你。

对比一下就很清楚：WordPress 的插件安全是“信任 + 事后审计”，EmDash 的插件安全是“隔离 + 能力声明”。前者把 96% 的漏洞解释成“插件作者的问题”，后者从架构上让一个越权操作根本发不出去。

---

## 内容不再是序列化 HTML，而是结构化数据

换过地基、重做了插件模型之后，第三个根本改动落在内容存储本身。

WordPress 把富文本存成 HTML，元数据塞在 HTML 注释里——这等于把你的内容和它的某种 DOM 表现绑死了。想换一种渲染方式（比如发邮件、推到移动端、喂给一个 API），你就得去解析 HTML，把信息再抠出来。

EmDash 用的是 [Portable Text](https://www.portabletext.org/)：一种结构化的 JSON 格式，把内容和它的呈现解耦。一段加粗、一个链接、一张图、一个自定义区块，都是结构里的节点，而不是一串 `<strong>` 标签。同一份内容因此可以渲染成网页、移动端、邮件或 API 响应，不需要任何一方去 parse HTML。

有人会问：Markdown 不也解耦了 HTML 吗？区别在于可扩展性。Markdown 的表达力是固定的一套语法，自定义区块只能退回到内嵌 HTML——于是又把你拽回解析 HTML 的老路。Portable Text 里每个区块是带类型的 JSON 节点，一个“产品卡片”“地图嵌入”“CTA 按钮”可以是有明确字段结构的自定义节点，渲染端按类型分发，既不丢结构也不用 parse。对一个要支持任意自定义内容类型的 CMS 来说，这个差别是本质的。

更深一层的设计是：**schema 存在数据库里，而不是写在代码里。** `_emdash_collections` 和 `_emdash_fields` 这两张系统表是内容结构的唯一真相来源。每新建一个内容类型（collection），EmDash 就给它建一张真正的 SQL 表（`ec_posts`、`ec_products`），带类型化的列——而不是那种 “一切都塞进一张 key-value 表” 的 EAV 反模式。

这件事落到源码上很直接。在后台点出一个新内容类型，最终会走到 `SchemaRegistry.createContentTable()`：表名是 `ec_` 加上 slug，然后用 Kysely 的 schema builder 真的 `CREATE TABLE`，建出 `id`、`slug`、`status`、`locale` 等一组标准列，并配齐索引：

```typescript
// packages/core/src/schema/registry.ts
private async createContentTable(slug: string, db?): Promise<void> {
	const tableName = this.getTableName(slug); // => `ec_${slug}`
	await conn.schema
		.createTable(tableName)
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("slug", "text")
		.addColumn("status", "text", (col) => col.defaultTo("draft"))
		// ... created_at / locale / translation_group 等标准列
		.execute();
	// 紧接着建 slug / scheduled / live_revision 等索引
}
```

每加一个字段，则是往这张表 `ALTER TABLE ... ADD COLUMN`，列的 SQL 类型由字段类型映射决定——这张映射表就是“字段类型如何变成真实列”的全部依据：

```typescript
// packages/core/src/schema/types.ts
export const FIELD_TYPE_TO_COLUMN: Record<FieldType, ColumnType> = {
	string: "TEXT",
	number: "REAL",
	integer: "INTEGER",
	boolean: "INTEGER",
	portableText: "JSON",
	json: "JSON",
	multiSelect: "JSON",
	// ...
};
```

所以一个带 `title`（string）字段的 `posts` 内容类型，落地就是 `ec_posts` 表上一列实打实的 `title TEXT`——能被 SQL 直接查询、索引、约束，而不是塞进某张 key-value 表再在应用层拼装。这正是“真 SQL 表，不是 EAV”的字面含义。

"真正的 SQL 表"也带来一个隐患：collection slug、字段名这些标识符是用户在后台造出来的，一旦被拼进 SQL 就有注入风险。EmDash 的约定是——值永远走参数化（Kysely 的 `sql` 模板自动参数化），而动态标识符必须先过一道白名单校验，再用 `sql.ref()` 包裹：

```typescript
// packages/core/src/database/validate.ts
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

export function validateIdentifier(value: string, label = "identifier"): void {
	if (!value || typeof value !== "string") {
		throw new IdentifierError(`${label} must be a non-empty string`, String(value));
	}
	if (value.length > MAX_IDENTIFIER_LENGTH) {
		throw new IdentifierError(`${label} too long`, value);
	}
	if (!IDENTIFIER_PATTERN.test(value)) {
		throw new IdentifierError(`${label} must match /^[a-z][a-z0-9_]*$/`, value);
	}
}
```

```typescript
// 危险：字符串插值，等于把表名直接焊进 SQL
const query = `SELECT * FROM ${table} WHERE name = '${name}'`;

// 正确：值参数化、标识符用 sql.ref()
await sql`SELECT * FROM ${sql.ref(table)} WHERE name = ${name}`.execute(db);

// 必须拼接标识符时（如 json_extract 路径），先校验
validateIdentifier(field);
sql.raw(`json_extract(data, '$.${field}')`);
```

这就是"schema 在数据库里"这条设计的另一面：把建模能力交给非开发者的同时，必须在标识符进入 SQL 的每一个入口都设校验，否则后台的自由就成了注入面。

这带来两个实际好处。一是非开发者能在后台的可视化 schema builder 里点出新内容类型，不用碰代码；二是开发者可以从实时 schema 生成 TypeScript 类型：

```bash
npx emdash types
```

然后用 Astro 的 Live Collections 直接查内容——不需要重新构建，也不需要单独的 API 层：

```astro
---
import { getEmDashCollection } from "emdash";
const { entries: posts } = await getEmDashCollection("posts");
---

{posts.map((post) => <article>{post.data.title}</article>)}
```

这条“直接查”的链路同样是接在前面的 Astro 集成机制上的。`getEmDashCollection()` 背后是一个实现了 Astro `LiveLoader` 接口的 `emdashLoader()`——Astro 的 Live Collections 把“运行时按需查询”这件事标准化，EmDash 只需提供 `loadCollection` / `loadEntry` 两个方法，就能让模板像查静态内容一样查数据库，且每次请求实时取数、无需重建：

```typescript
// packages/core/src/loader.ts
export function emdashLoader(): LiveLoader<EntryData, EntryFilter, CollectionFilter> {
	return {
		name: "emdash",
		async loadCollection({ filter }) { /* 查 ec_{type}，keyset 分页 */ },
		async loadEntry({ filter }) { /* 按 id/slug 取单条，支持预览快照 */ },
	};
}
```

实现里有个值得注意的性能设计：分类法、作者署名这类关联数据不是 N+1 地逐条补查，而是折叠成单条查询里的关联 JSON 子查询一次取出；分页用 keyset（游标）而非 offset。再叠加前面那个 `getDb()` 读 ALS 的约定，预览模式只要在上下文里换一个带草稿快照的库，loader 代码一行都不用改就能查到未发布内容。

“结构化内容 + schema 在数据库 + 生成类型 + LiveLoader 实时查询”这一套组合拳，让 EmDash 同时拿到了两个通常互斥的东西：headless CMS 那种干净、可复用、类型安全的数据流，和 WordPress 那种“非技术人员也能自助建模”的后台能力。

---

## 为内容创作者保留的：后台、认证、迁移

把地基和插件模型换掉之后，EmDash 没有丢掉 WordPress 让普通用户离不开的那些东西，反而按现代标准重做了一遍。

**后台。** 完整的管理面板：可视化 schema builder、媒体库（拖拽上传，走签名 URL）、导航菜单、分类法、widgets，还有一个 WordPress 导入向导。富文本编辑基于 TipTap，但存储是 Portable Text。支持修订历史、草稿、定时发布和全文搜索（SQLite 的 FTS5），以及行内可视化编辑。

**认证。** 默认走 Passkey（WebAuthn），同时保留 OAuth 和 magic link 作为兜底。权限是基于角色的访问控制：Administrator、Editor、Author、Contributor。值得一提的是，授权在 EmDash 里是基于**权限**而非角色硬编码的——每个改状态的接口都要检查一个明确的权限串，角色只是权限的集合。

落到代码上，每个会改状态的路由开头都会调一个守卫函数：要么是"任意操作者只要有这个权限就行"，要么是"考虑归属——作者能改自己的、编辑能改任何人的"。它们返回 `null` 表示放行，返回一个 401/403 `Response` 表示拦截，直接 return 出去即可：

```typescript
// packages/core/src/api/authorize.ts
export function requirePerm(
	user: UserLike | null | undefined,
	permission: Permission,
): Response | null {
	if (!user) {
		return apiError("UNAUTHORIZED", "Authentication required", 401);
	}
	if (!hasPermission(user, permission)) {
		return apiError("FORBIDDEN", "Insufficient permissions", 403);
	}
	return null;
}

// 归属感知版本：作者改自己的（content:edit_own），编辑改任何人的（content:edit_any）
export function requireOwnerPerm(
	user: UserLike | null | undefined,
	ownerId: string,
	ownPermission: Permission,
	anyPermission: Permission,
): Response | null {
	if (!user) return apiError("UNAUTHORIZED", "Authentication required", 401);
	if (!canActOnOwn(user, ownerId, ownPermission, anyPermission)) {
		return apiError("FORBIDDEN", "Insufficient permissions", 403);
	}
	return null;
}
```

在路由里就是一行守卫，权限串集中定义在 `rbac.ts` 的 `Permissions` map 里，角色只是这些权限的预设组合——所以加一种新权限不需要动角色枚举：

```typescript
const denied = requireOwnerPerm(user, post.authorId, "content:edit_own", "content:edit_any");
if (denied) return denied;
```

**迁移。** 这是面向现有 WordPress 用户的现实考量：能从 WXR 导出、WordPress REST API 或 WordPress.com 导入文章、页面、媒体和分类法。配套的 agent skill 还能帮你把旧插件和主题移植过来。

**为 agent 而生。** EmDash 内置了给 AI 用的 skill 文件（用于开发插件和主题）、一个能让 agent 以编程方式管理内容和 schema 的 CLI，以及一个内置的 [MCP server](https://modelcontextprotocol.io/)——让 Claude、ChatGPT 这类工具能直接和你的站点交互。这一条在 WordPress 时代是不存在的，因为它本就是按今天的工作方式设计的。

---

## 为什么是今天

回到开头那个问题：把 WordPress 重写一遍的想法不新，为什么到今天才真正可行？

因为几块拼图最近才同时到位：边缘 Serverless 让 CMS 不再依赖常驻 PHP 主机；Worker Loader 让插件隔离和能力授权变成可执行的边界；Portable Text 和类型安全的 TypeScript 让内容模型既能自助建模，又能端到端类型安全；AI agent 也终于成了一类默认用户。

所以 EmDash 的价值不只是“又一个 CMS”。它回答的是：当地基、隔离、内容模型和使用者都变了之后，WordPress 那套理念该长成什么样。

如果你正在自托管 WordPress 并被插件安全或 PHP 运维困扰，或者在用 headless CMS 但怀念“非开发者也能改”的后台，它值得装一个 demo 跑跑看。亲手试一下“装插件不用交出整个数据库”是什么感觉，就很直观了。只是别忘了它还在 beta preview，投产前自己评估稳定性。
