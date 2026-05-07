---
title: Hono 深入使用指南：从入门到精通
published: 2026-01-21
description: 一份全面的 Hono 框架实战指南，涵盖核心概念、Context API、中间件系统、RPC 模式、类型安全验证、认证授权、JSX 渲染、实时通信、测试部署等高级特性与生产环境最佳实践。
tags: [Hono, TypeScript, Web框架, 边缘计算, Serverless]
category: Web 服务
draft: false
---

## 写在前面

在 JavaScript 生态系统中，Web 框架层出不穷。从经典的 Express 到现代化的 Fastify、Koa，每个框架都有自己的特色。而今天我要和大家分享的 **Hono**，是我在 2025 年开始使用后深深爱上的一个框架。

为什么选择 Hono？

- **极致轻量**: 核心代码不到 14KB，零依赖
- **跨运行时**: 一套代码，到处运行（Node.js、Deno、Bun、Cloudflare Workers...）
- **类型安全**: TypeScript 的完美支持让你的 API 开发如丝般顺滑
- **超高性能**: JavaScript 世界最快的路由器之一
- **开发体验**: 简洁的 API 设计，学习曲线平缓

这篇文章是我在生产环境中使用 Hono 近一年的经验总结。无论你是刚接触 Hono 的新手，还是想深入了解其高级特性的开发者，相信都能从中有所收获。

---

## 第一部分：核心概念

### Web 标准优先：为什么这很重要

当我第一次看到 Hono 的代码时，最吸引我的就是它对 Web 标准的坚守。在一个碎片化严重的 JavaScript 运行时环境中，**基于 Web 标准构建意味着真正的可移植性**。

Hono 完全基于以下 Web 标准 API 构建：
- **Request** - Web API 标准请求对象
- **Response** - Web API 标准响应对象
- **Fetch API** - 统一的 HTTP 客户端接口
- **URL Pattern** - 路由匹配
- **Headers** - HTTP 头部处理

这意味着什么？**你写一次代码，可以在任何地方运行**。让我用一个实际例子展示：

```typescript
// 你的代码可以在任何地方运行
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  // 使用标准 Response
  return new Response('Hello World')

  // 或使用 Hono 的便捷方法
  return c.text('Hello World')
})

// Cloudflare Workers
export default app

// Node.js
// import { serve } from '@hono/node-server'
// serve(app)

// Deno
// Deno.serve(app.fetch)

// Bun
// export default { fetch: app.fetch }
```

### 零依赖设计：小而美的哲学

在现代前端开发中，`node_modules` 文件夹动辄上百 MB 已经见怪不怪。但 Hono 选择了不同的道路——**完全零依赖**：

```json
{
  "name": "hono",
  "dependencies": {}  // 完全零依赖！
}
```

**这带来了什么好处？**

- **体积极小**: 核心代码不到 14KB，冷启动飞快
- **安全可靠**: 没有依赖链，就没有供应链攻击的风险
- **安装迅速**: `npm install hono` 几乎是瞬间完成
- **代码可控**: 你可以轻松阅读整个框架的源码

我在 Cloudflare Workers 上部署的一个项目，使用 Hono 后整个 bundle 大小从 200KB+ 降到了不到 30KB。这在边缘计算环境中意义重大。

### 预设系统：按需选择最佳性能

Hono 的一个巧妙设计是提供了三种预设，针对不同场景优化。这让你可以根据实际需求在**体积和性能之间取得平衡**：

```typescript
// 默认预设 - 平衡性能和功能
import { Hono } from 'hono'

// Quick 预设 - 优化冷启动（Serverless）
import { Hono } from 'hono/quick'

// Tiny 预设 - 极致轻量（< 12KB）
import { Hono } from 'hono/tiny'
```

**预设对比**：

| 预设 | 路由器 | 体积 | 适用场景 |
|-----|--------|------|---------|
| **默认** | SmartRouter (RegExpRouter + TrieRouter) | ~20KB | 长期运行的服务器 |
| **quick** | LinearRouter | ~14KB | Serverless/冷启动场景 |
| **tiny** | PatternRouter | < 12KB | 边缘计算/极致轻量 |

💡 **我的建议**: 对于 Serverless 场景（AWS Lambda、Cloudflare Workers），使用 `quick` 预设；对于长期运行的 Node.js 服务器，使用默认预设即可。

---

## 第二部分：深入 Context API

Context（简称 `c`）是 Hono 的灵魂。如果你用过 Koa，会发现它们有相似之处，但 Hono 的 Context 设计得更加优雅和类型安全。

### Context 的生命周期

```typescript
app.use('*', async (c, next) => {
  // 1. 请求开始 - Context 被创建
  console.log('Request started')

  // 2. Context 在整个请求周期内存活
  await next()

  // 3. 响应发送后 - Context 被销毁
  console.log('Request ended')
})
```

### 请求信息获取

#### 基础请求信息

```typescript
app.get('/user/:id', (c) => {
  // URL 参数
  const id = c.req.param('id')

  // 查询参数
  const page = c.req.query('page')           // 单个值
  const tags = c.req.queries('tag')          // 多个值数组

  // 请求头
  const auth = c.req.header('Authorization')
  const userAgent = c.req.header('User-Agent')

  // 请求方法和路径
  const method = c.req.method  // GET, POST, etc.
  const path = c.req.path      // /user/123
  const url = c.req.url        // https://example.com/user/123

  return c.json({ id, page, tags })
})
```

#### 请求体解析

```typescript
app.post('/api/data', async (c) => {
  // JSON 解析
  const json = await c.req.json()

  // 表单数据
  const formData = await c.req.formData()
  const name = formData.get('name')

  // 纯文本
  const text = await c.req.text()

  // 二进制数据
  const blob = await c.req.blob()
  const arrayBuffer = await c.req.arrayBuffer()

  return c.json({ received: json })
})
```

#### 高级请求解析

```typescript
app.post('/upload', async (c) => {
  // 解析多部分表单（文件上传）
  const body = await c.req.parseBody()

  // body 结构：
  // {
  //   file: File,
  //   name: string,
  //   description: string
  // }

  const file = body.file as File

  if (file) {
    console.log('File name:', file.name)
    console.log('File size:', file.size)
    console.log('File type:', file.type)

    // 读取文件内容
    const content = await file.arrayBuffer()
  }

  return c.json({ success: true })
})
```

### 响应生成

#### 各种响应类型

```typescript
app.get('/responses', (c) => {
  // JSON 响应
  return c.json({ message: 'Hello' })

  // JSON 带状态码
  return c.json({ error: 'Not Found' }, 404)

  // 文本响应
  return c.text('Hello World')

  // HTML 响应
  return c.html('<h1>Hello</h1>')

  // 重定向
  return c.redirect('/new-path')
  return c.redirect('/new-path', 301)  // 永久重定向

  // 自定义响应
  return c.body('Custom Body', 201, {
    'X-Custom-Header': 'value'
  })

  // 直接返回 Response 对象
  return new Response('Hello', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  })
})
```

#### 设置响应头

```typescript
app.get('/headers', (c) => {
  // 设置单个头部
  c.header('X-Custom-Header', 'value')

  // 设置多个头部
  c.header('X-Powered-By', 'Hono')
  c.header('X-Version', '1.0.0')

  // 设置状态码
  c.status(201)

  return c.json({ created: true })
})
```

### Context 存储（c.set / c.get）

Context 存储允许在中间件和路由处理器之间共享数据。

#### 基础用法

```typescript
// 中间件设置数据
app.use('*', async (c, next) => {
  const startTime = Date.now()
  c.set('startTime', startTime)

  await next()

  const endTime = Date.now()
  console.log(`Request took ${endTime - startTime}ms`)
})

// 路由处理器获取数据
app.get('/', (c) => {
  const startTime = c.get('startTime')
  return c.json({ startTime })
})
```

#### 类型安全的 Context 存储

```typescript
// 定义变量类型
type Variables = {
  user: {
    id: string
    name: string
    role: 'admin' | 'user'
  }
  requestId: string
  startTime: number
}

// 创建类型化的应用
const app = new Hono<{ Variables: Variables }>()

// 中间件：类型安全的 set
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID())
  c.set('startTime', Date.now())
  await next()
})

// 路由：类型安全的 get
app.get('/profile', (c) => {
  const user = c.get('user')       // 类型: { id: string, name: string, role: 'admin' | 'user' }
  const requestId = c.get('requestId')  // 类型: string

  return c.json({ user, requestId })
})
```

### 环境变量和绑定

#### Cloudflare Workers 绑定

```typescript
// 定义绑定类型
type Bindings = {
  DB: D1Database           // D1 数据库
  KV: KVNamespace          // KV 存储
  BUCKET: R2Bucket         // R2 对象存储
  API_KEY: string          // 环境变量
  QUEUE: Queue             // 队列
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/data', async (c) => {
  // 访问绑定
  const db = c.env.DB
  const kv = c.env.KV
  const bucket = c.env.BUCKET
  const apiKey = c.env.API_KEY

  // 使用 D1
  const users = await db.prepare('SELECT * FROM users').all()

  // 使用 KV
  const cache = await kv.get('cache-key')

  // 使用 R2
  const object = await bucket.get('file.pdf')

  return c.json({ users, cache })
})
```

#### Node.js 环境变量

```typescript
app.get('/config', (c) => {
  // 注意：Node.js 中需要通过 process.env 访问
  const apiKey = process.env.API_KEY
  const dbUrl = process.env.DATABASE_URL

  // 或者通过 c.env（需要在启动时传入）
  return c.json({ apiKey })
})
```

### Context 的完整类型定义

```typescript
type Env = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
  }
  Variables: {
    user: User
    requestId: string
  }
}

const app = new Hono<Env>()

app.use('*', async (c, next) => {
  // c.env 的类型是 Env['Bindings']
  const db = c.env.DB

  // c.set/get 的类型是 Env['Variables']
  c.set('requestId', '123')

  await next()
})
```

---

## 第三部分：中间件系统深度解析

### 洋葱模型：理解中间件执行流程

Hono 采用了**洋葱模型**（Onion Model）的中间件架构，这和 Koa 如出一辙。如果你之前没接触过这个概念，让我用一个形象的比喻来解释：

想象请求是从洋葱外层一层层穿过核心，然后响应再从核心一层层返回外层。每个中间件就是洋葱的一层。

### 洋葱模型原理

```typescript
app.use('*', async (c, next) => {
  console.log('1. 外层中间件 - 请求阶段')

  await next()  // 进入下一层

  console.log('4. 外层中间件 - 响应阶段')
})

app.use('*', async (c, next) => {
  console.log('2. 内层中间件 - 请求阶段')

  await next()  // 进入路由处理器

  console.log('3. 内层中间件 - 响应阶段')
})

app.get('/', (c) => {
  console.log('路由处理器')
  return c.text('Hello')
})

// 输出顺序：
// 1. 外层中间件 - 请求阶段
// 2. 内层中间件 - 请求阶段
// 路由处理器
// 3. 内层中间件 - 响应阶段
// 4. 外层中间件 - 响应阶段
```

### 全局中间件

```typescript
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

const app = new Hono()

// 1. 日志中间件（第一个）
app.use('*', logger())

// 2. 安全头部
app.use('*', secureHeaders())

// 3. CORS
app.use('*', cors({
  origin: ['https://example.com', 'https://app.example.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// 4. 请求 ID
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID())
  await next()
})
```

### 路径特定中间件

```typescript
// 只应用于 /api/* 路径
app.use('/api/*', async (c, next) => {
  console.log('API middleware')
  await next()
})

// 多路径中间件
app.use(['/admin/*', '/dashboard/*'], async (c, next) => {
  // 只应用于 admin 和 dashboard
  await next()
})
```

### 创建自定义中间件

#### 基础中间件

```typescript
import { createMiddleware } from 'hono/factory'

// 计时中间件
const timing = createMiddleware(async (c, next) => {
  const start = Date.now()

  await next()

  const end = Date.now()
  c.header('X-Response-Time', `${end - start}ms`)
})

app.use('*', timing)
```

#### 带参数的中间件

```typescript
import { createMiddleware } from 'hono/factory'

// 限流中间件
const rateLimit = (options: {
  max: number        // 最大请求数
  window: number     // 时间窗口（ms）
}) => {
  const requests = new Map<string, number[]>()

  return createMiddleware(async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') || 'unknown'
    const now = Date.now()

    // 获取该 IP 的请求记录
    let timestamps = requests.get(ip) || []

    // 清理过期记录
    timestamps = timestamps.filter(t => now - t < options.window)

    // 检查是否超限
    if (timestamps.length >= options.max) {
      return c.json({ error: 'Too Many Requests' }, 429)
    }

    // 记录本次请求
    timestamps.push(now)
    requests.set(ip, timestamps)

    await next()
  })
}

// 使用
app.use('/api/*', rateLimit({
  max: 100,
  window: 60 * 1000  // 1 分钟
}))
```

#### 类型安全的中间件

```typescript
import { createMiddleware } from 'hono/factory'

// 定义中间件添加的变量
type AuthVariables = {
  user: {
    id: string
    email: string
    role: 'admin' | 'user'
  }
}

// 创建类型安全的中间件
const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    // 验证 token
    const user = await verifyToken(token)

    if (!user) {
      return c.json({ error: 'Invalid token' }, 401)
    }

    // 设置用户信息（类型安全）
    c.set('user', user)

    await next()
  }
)

// 在类型化的应用中使用
const app = new Hono<{ Variables: AuthVariables }>()

app.use('/api/*', authMiddleware)

app.get('/api/profile', (c) => {
  // TypeScript 知道 user 的类型！
  const user = c.get('user')
  return c.json({ user })
})
```

### 常用内置中间件

#### 1. Logger（日志）

```typescript
import { logger } from 'hono/logger'

app.use('*', logger())

// 自定义日志格式
app.use('*', logger((message) => {
  console.log(`[${new Date().toISOString()}] ${message}`)
}))
```

#### 2. CORS（跨域）

```typescript
import { cors } from 'hono/cors'

// 允许所有来源
app.use('*', cors())

// 自定义配置
app.use('*', cors({
  origin: 'https://example.com',
  allowMethods: ['GET', 'POST'],
  allowHeaders: ['Content-Type'],
  exposeHeaders: ['X-Total-Count'],
  maxAge: 3600,
  credentials: true,
}))

// 动态来源
app.use('*', cors({
  origin: (origin) => {
    return origin.endsWith('.example.com') ? origin : 'https://example.com'
  }
}))
```

#### 3. JWT 认证

```typescript
import { jwt } from 'hono/jwt'

app.use('/api/*', jwt({
  secret: 'your-secret-key',
}))

// 访问 JWT payload
app.get('/api/me', (c) => {
  const payload = c.get('jwtPayload')
  return c.json({ user: payload })
})
```

#### 4. Bearer Auth

```typescript
import { bearerAuth } from 'hono/bearer-auth'

app.use('/admin/*', bearerAuth({
  token: 'your-secret-token',
}))

// 动态验证
app.use('/admin/*', bearerAuth({
  verifyToken: async (token, c) => {
    return token === await getValidToken()
  }
}))
```

#### 5. Basic Auth

```typescript
import { basicAuth } from 'hono/basic-auth'

app.use('/admin/*', basicAuth({
  username: 'admin',
  password: 'secret',
}))

// 动态验证
app.use('/admin/*', basicAuth({
  verifyUser: async (username, password, c) => {
    return await checkCredentials(username, password)
  }
}))
```

#### 6. Compression（压缩）

```typescript
import { compress } from 'hono/compress'

// 默认配置（gzip 优先）
app.use('*', compress())

// 自定义配置
app.use('*', compress({
  threshold: 1024,  // 最小压缩大小（字节）
  encoding: 'gzip', // 'gzip' | 'deflate'
}))
```

#### 7. Cache（缓存）

```typescript
import { cache } from 'hono/cache'

app.get('/static/*', cache({
  cacheName: 'static-assets',
  cacheControl: 'max-age=31536000', // 1 年
}))

// 条件缓存
app.get('/api/data', cache({
  cacheName: 'api-cache',
  cacheControl: 'max-age=60',
  wait: true,
}))
```

#### 8. ETag

```typescript
import { etag } from 'hono/etag'

app.use('*', etag())

// 弱 ETag
app.use('*', etag({ weak: true }))
```

#### 9. Pretty JSON

```typescript
import { prettyJSON } from 'hono/pretty-json'

app.use('*', prettyJSON())

// 只在开发环境启用
if (process.env.NODE_ENV === 'development') {
  app.use('*', prettyJSON())
}
```

#### 10. Secure Headers

```typescript
import { secureHeaders } from 'hono/secure-headers'

app.use('*', secureHeaders())

// 自定义配置
app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
  },
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
}))
```

---

## 第四部分：路由系统与性能优化

### 基础路由

```typescript
const app = new Hono()

// HTTP 方法
app.get('/', (c) => c.text('GET'))
app.post('/', (c) => c.text('POST'))
app.put('/', (c) => c.text('PUT'))
app.delete('/', (c) => c.text('DELETE'))
app.patch('/', (c) => c.text('PATCH'))
app.options('/', (c) => c.text('OPTIONS'))

// 所有方法
app.all('/', (c) => c.text('Any method'))

// 自定义方法
app.on('PURGE', '/', (c) => c.text('PURGE'))
```

### 路由参数

```typescript
// 命名参数
app.get('/users/:id', (c) => {
  const id = c.req.param('id')
  return c.json({ id })
})

// 多个参数
app.get('/posts/:category/:slug', (c) => {
  const category = c.req.param('category')
  const slug = c.req.param('slug')
  return c.json({ category, slug })
})

// 可选参数
app.get('/posts/:id?', (c) => {
  const id = c.req.param('id')  // 可能是 undefined
  return c.json({ id: id || 'all' })
})

// 通配符
app.get('/files/*', (c) => {
  const path = c.req.param('*')  // 捕获所有路径
  return c.text(`File: ${path}`)
})
```

### 正则表达式路由

```typescript
// 数字 ID
app.get('/users/:id{[0-9]+}', (c) => {
  const id = c.req.param('id')  // 只匹配数字
  return c.json({ id })
})

// UUID
app.get('/items/:uuid{[0-9a-f-]{36}}', (c) => {
  const uuid = c.req.param('uuid')
  return c.json({ uuid })
})

// 自定义正则
app.get('/slugs/:slug{[a-z0-9-]+}', (c) => {
  const slug = c.req.param('slug')
  return c.json({ slug })
})
```

### 路由分组

```typescript
// 使用 Hono 实例分组
const api = new Hono()

api.get('/users', (c) => c.json([]))
api.get('/users/:id', (c) => c.json({}))
api.post('/users', (c) => c.json({}))

// 挂载到主应用
app.route('/api/v1', api)

// 结果：
// GET  /api/v1/users
// GET  /api/v1/users/:id
// POST /api/v1/users
```

### 路由链式调用

```typescript
app
  .get('/chain', (c) => c.text('GET'))
  .post('/chain', (c) => c.text('POST'))
  .put('/chain', (c) => c.text('PUT'))

// 或者使用 route()
app.route('/users')
  .get((c) => c.json([]))
  .post((c) => c.json({}))
```

### 路由器性能优化

#### 选择合适的预设

```typescript
// 长期运行的服务器（默认）
import { Hono } from 'hono'
const app = new Hono()
// 使用 SmartRouter: RegExpRouter + TrieRouter

// Serverless/冷启动优化
import { Hono } from 'hono/quick'
const app = new Hono()
// 使用 LinearRouter，注册路由更快

// 极致轻量
import { Hono } from 'hono/tiny'
const app = new Hono()
// 使用 PatternRouter，最小体积
```

#### 路由优化技巧

**1. 避免过多动态路由**

```typescript
// 不推荐：过多动态路由
app.get('/:a/:b/:c/:d/:e', handler)

// 推荐：合理使用静态前缀
app.get('/api/v1/users/:id/posts/:postId', handler)
```

**2. 静态路由优先**

```typescript
// RegExpRouter 会优先匹配静态路由
app.get('/users/me', handlerMe)      // 静态，优先匹配
app.get('/users/:id', handlerId)     // 动态，次优先
```

**3. 路由分组减少匹配次数**

```typescript
// 不推荐：平铺所有路由
app.get('/api/users', handler)
app.get('/api/posts', handler)
app.get('/api/comments', handler)

// 推荐：按前缀分组
const api = new Hono()
api.get('/users', handler)
api.get('/posts', handler)
api.get('/comments', handler)

app.route('/api', api)
```

---

## 第五部分：类型安全与数据验证

### 为什么类型安全如此重要

在我的实践中，**类型安全是提高代码质量最有效的手段之一**。Hono 与 Zod 的结合堪称完美，让你在运行时和编译时都能获得类型保障。

### Zod 验证器：端到端的类型安全

Zod 是 Hono 官方推荐的验证库，也是我强烈推荐的选择。

#### 安装

```bash
npm install zod @hono/zod-validator
```

#### 基础用法

```typescript
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

// 定义 schema
const userSchema = z.object({
  name: z.string().min(3).max(50),
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
  role: z.enum(['admin', 'user']).default('user'),
})

// 应用验证
app.post('/users', zValidator('json', userSchema), async (c) => {
  // 类型安全！data 的类型自动推导
  const data = c.req.valid('json')
  // data: { name: string, email: string, age: number, role: 'admin' | 'user' }

  const user = await db.createUser(data)
  return c.json(user, 201)
})
```

#### 多种验证目标

```typescript
// JSON body
app.post('/json', zValidator('json', schema), (c) => {
  const data = c.req.valid('json')
  return c.json(data)
})

// 查询参数
const querySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number),
  limit: z.string().regex(/^\d+$/).transform(Number),
})

app.get('/list', zValidator('query', querySchema), (c) => {
  const { page, limit } = c.req.valid('query')
  // page 和 limit 是 number 类型！
  return c.json({ page, limit })
})

// 表单数据
app.post('/form', zValidator('form', schema), (c) => {
  const data = c.req.valid('form')
  return c.json(data)
})

// 路由参数
const paramSchema = z.object({
  id: z.string().uuid(),
})

app.get('/users/:id', zValidator('param', paramSchema), (c) => {
  const { id } = c.req.valid('param')
  return c.json({ id })
})

// 请求头
const headerSchema = z.object({
  'x-api-key': z.string().min(32),
})

app.get('/protected', zValidator('header', headerSchema), (c) => {
  const headers = c.req.valid('header')
  return c.json({ authenticated: true })
})
```

#### 自定义错误处理

```typescript
app.post(
  '/users',
  zValidator('json', userSchema, (result, c) => {
    if (!result.success) {
      return c.json({
        error: 'Validation failed',
        details: result.error.flatten(),
      }, 400)
    }
  }),
  (c) => {
    const data = c.req.valid('json')
    return c.json({ success: true, data })
  }
)
```

#### 复杂验证示例

```typescript
import { z } from 'zod'

// 嵌套对象
const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zipCode: z.string().regex(/^\d{5}$/),
  country: z.string().length(2),
})

const createUserSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  address: addressSchema,
  tags: z.array(z.string()).min(1).max(10),
  metadata: z.record(z.string(), z.any()).optional(),
})

app.post('/users', zValidator('json', createUserSchema), async (c) => {
  const data = c.req.valid('json')
  // 完全类型安全的数据
  return c.json({ success: true })
})
```

#### 验证转换

```typescript
// 字符串转数字
const paginationSchema = z.object({
  page: z.string().transform(Number),
  limit: z.string().transform(Number).default('10'),
})

app.get('/items', zValidator('query', paginationSchema), (c) => {
  const { page, limit } = c.req.valid('query')
  // page 和 limit 是 number 类型
  return c.json({ page, limit })
})

// 自定义转换
const dateSchema = z.object({
  date: z.string().transform((val) => new Date(val)),
})

app.get('/events', zValidator('query', dateSchema), (c) => {
  const { date } = c.req.valid('query')
  // date 是 Date 对象
  return c.json({ date: date.toISOString() })
})
```

### 其他验证器

#### Valibot

```typescript
import { vValidator } from '@hono/valibot-validator'
import * as v from 'valibot'

const schema = v.object({
  name: v.string([v.minLength(3)]),
  email: v.string([v.email()]),
})

app.post('/users', vValidator('json', schema), (c) => {
  const data = c.req.valid('json')
  return c.json(data)
})
```

#### TypeBox

```typescript
import { tbValidator } from '@hono/typebox-validator'
import { Type } from '@sinclair/typebox'

const schema = Type.Object({
  name: Type.String({ minLength: 3 }),
  email: Type.String({ format: 'email' }),
})

app.post('/users', tbValidator('json', schema), (c) => {
  const data = c.req.valid('json')
  return c.json(data)
})
```

---

## 第六部分：RPC 模式 - 类型安全的 API 调用

### Hono 的杀手级特性

如果要我选出 Hono 最让我惊艳的特性，**RPC 模式**绝对排在前三。它实现了真正的**端到端类型安全** —— 从服务端到客户端，TypeScript 的类型推导无缝衔接。

这意味着什么？**在客户端调用 API 时，你能获得完整的类型提示和自动补全，就像调用本地函数一样**。

### 服务端设置

```typescript
// server.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const app = new Hono()

// 定义 API 路由
const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
})

const routes = app
  .get('/users', (c) => {
    return c.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])
  })
  .get('/users/:id', (c) => {
    const id = c.req.param('id')
    return c.json({ id, name: 'Alice' })
  })
  .post('/users', zValidator('json', userSchema), async (c) => {
    const data = c.req.valid('json')
    return c.json({ id: 3, ...data }, 201)
  })
  .delete('/users/:id', (c) => {
    const id = c.req.param('id')
    return c.json({ success: true }, 200)
  })

// 导出类型
export type AppType = typeof routes

export default app
```

### 客户端使用

```typescript
// client.ts
import { hc } from 'hono/client'
import type { AppType } from './server'

// 创建客户端
const client = hc<AppType>('http://localhost:3000')

// 完全类型安全的 API 调用！

// GET /users
const usersRes = await client.users.$get()
const users = await usersRes.json()
// users 的类型：{ id: number, name: string }[]

// GET /users/:id
const userRes = await client.users[':id'].$get({
  param: { id: '1' }
})
const user = await userRes.json()
// user 的类型：{ id: string, name: string }

// POST /users
const createRes = await client.users.$post({
  json: {
    name: 'Charlie',
    email: 'charlie@example.com'
  }
})
const newUser = await createRes.json()
// newUser 的类型：{ id: number, name: string, email: string }

// DELETE /users/:id
const deleteRes = await client.users[':id'].$delete({
  param: { id: '1' }
})
const result = await deleteRes.json()
// result 的类型：{ success: boolean }
```

### 状态码类型推断

```typescript
// server.ts
app.get('/status', (c) => {
  const random = Math.random()

  if (random > 0.5) {
    return c.json({ status: 'ok' }, 200)
  } else {
    return c.json({ error: 'Bad request' }, 400)
  }
})

// client.ts
const res = await client.status.$get()

if (res.status === 200) {
  const data = await res.json()
  // data 的类型：{ status: string }
} else if (res.status === 400) {
  const error = await res.json()
  // error 的类型：{ error: string }
}
```

### 高级 RPC 模式

#### 带认证的 RPC

```typescript
// server.ts
const api = new Hono()
  .use('*', jwt({ secret: 'secret' }))
  .get('/profile', (c) => {
    const payload = c.get('jwtPayload')
    return c.json({ user: payload })
  })

export type ApiType = typeof api

// client.ts
const client = hc<ApiType>('http://localhost:3000', {
  headers: {
    Authorization: 'Bearer your-token'
  }
})

const res = await client.profile.$get()
const profile = await res.json()
```

#### 自定义 Fetch 配置

```typescript
const client = hc<AppType>('http://localhost:3000', {
  fetch: (input, init) => {
    // 自定义 fetch 逻辑
    console.log('Fetching:', input)
    return fetch(input, {
      ...init,
      headers: {
        ...init?.headers,
        'X-Custom-Header': 'value'
      }
    })
  }
})
```

### RPC 最佳实践

1. **分离路由定义**

```typescript
// routes/users.ts
export const usersRoute = new Hono()
  .get('/', listUsers)
  .post('/', createUser)
  .get('/:id', getUser)

// routes/posts.ts
export const postsRoute = new Hono()
  .get('/', listPosts)
  .post('/', createPost)

// app.ts
import { usersRoute } from './routes/users'
import { postsRoute } from './routes/posts'

const app = new Hono()
  .route('/users', usersRoute)
  .route('/posts', postsRoute)

export type AppType = typeof app
```

2. **版本化 API**

```typescript
// server.ts
const v1 = new Hono()
  .get('/users', handlerV1)

const v2 = new Hono()
  .get('/users', handlerV2)

const app = new Hono()
  .route('/v1', v1)
  .route('/v2', v2)

export type AppType = typeof app

// client.ts
const clientV1 = hc<AppType>('http://localhost:3000/v1')
const clientV2 = hc<AppType>('http://localhost:3000/v2')
```

---

## 第七部分：优雅的错误处理

### 全局错误处理

```typescript
app.onError((err, c) => {
  console.error(`Error: ${err.message}`)

  // 自定义错误响应
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
  }, 500)
})
```

### HTTPException

Hono 提供了 `HTTPException` 类用于抛出 HTTP 错误。

```typescript
import { HTTPException } from 'hono/http-exception'

app.get('/users/:id', async (c) => {
  const id = c.req.param('id')
  const user = await db.getUser(id)

  if (!user) {
    // 抛出 404 错误
    throw new HTTPException(404, {
      message: 'User not found'
    })
  }

  return c.json(user)
})
```

### 自定义错误类

```typescript
class ValidationError extends HTTPException {
  constructor(message: string, details?: any) {
    super(400, {
      message,
      res: Response.json({
        error: 'Validation Error',
        message,
        details
      }, { status: 400 })
    })
  }
}

class UnauthorizedError extends HTTPException {
  constructor(message = 'Unauthorized') {
    super(401, { message })
  }
}

class ForbiddenError extends HTTPException {
  constructor(message = 'Forbidden') {
    super(403, { message })
  }
}

// 使用
app.post('/admin/users', async (c) => {
  const user = c.get('user')

  if (!user) {
    throw new UnauthorizedError()
  }

  if (user.role !== 'admin') {
    throw new ForbiddenError('Admin access required')
  }

  // 继续处理...
})
```

### 结构化错误处理

```typescript
// 错误类型定义
type ErrorType =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'

interface AppError {
  type: ErrorType
  message: string
  details?: any
}

// 全局错误处理器
app.onError((err, c) => {
  console.error(err)

  // HTTPException
  if (err instanceof HTTPException) {
    const response = err.getResponse()
    return response
  }

  // Zod 验证错误
  if (err.name === 'ZodError') {
    return c.json({
      type: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: err.errors
    }, 400)
  }

  // 数据库错误
  if (err.message.includes('UNIQUE constraint')) {
    return c.json({
      type: 'VALIDATION_ERROR',
      message: 'Resource already exists'
    }, 409)
  }

  // 默认错误
  return c.json({
    type: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  }, 500)
})
```

### 中间件级错误处理

```typescript
const errorHandler = createMiddleware(async (c, next) => {
  try {
    await next()
  } catch (err) {
    console.error('Caught error in middleware:', err)

    if (err instanceof HTTPException) {
      return err.getResponse()
    }

    return c.json({
      error: 'Something went wrong'
    }, 500)
  }
})

app.use('*', errorHandler)
```

### 404 处理

```typescript
// 自定义 404
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    path: c.req.path,
    message: 'The requested resource was not found'
  }, 404)
})
```

---

## 第八部分：认证与授权实战

### JWT 认证

#### 基础 JWT

```typescript
import { jwt, sign } from 'hono/jwt'

const app = new Hono()

// 登录路由
app.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json()

  // 验证凭证
  const user = await verifyCredentials(email, password)

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // 生成 JWT
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 小时
  }

  const token = await sign(payload, 'your-secret-key')

  return c.json({ token })
})

// 保护的路由
app.use('/api/*', jwt({
  secret: 'your-secret-key',
}))

app.get('/api/profile', (c) => {
  const payload = c.get('jwtPayload')
  return c.json({
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role
    }
  })
})
```

#### 高级 JWT 配置

```typescript
import { jwt } from 'hono/jwt'

app.use('/api/*', jwt({
  secret: 'your-secret-key',
  cookie: 'auth-token',  // 从 cookie 读取
  alg: 'HS256',
}))

// 刷新 token
app.post('/auth/refresh', jwt({ secret: 'your-secret-key' }), async (c) => {
  const oldPayload = c.get('jwtPayload')

  const newPayload = {
    ...oldPayload,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  }

  const newToken = await sign(newPayload, 'your-secret-key')

  return c.json({ token: newToken })
})
```

### 自定义认证中间件

```typescript
import { createMiddleware } from 'hono/factory'

type User = {
  id: string
  email: string
  role: 'admin' | 'user'
}

const authMiddleware = createMiddleware<{
  Variables: { user: User }
}>(async (c, next) => {
  // 1. 获取 token
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, {
      message: 'Missing or invalid authorization header'
    })
  }

  const token = authHeader.substring(7)

  // 2. 验证 token
  const user = await verifyToken(token)

  if (!user) {
    throw new HTTPException(401, {
      message: 'Invalid or expired token'
    })
  }

  // 3. 检查用户状态
  if (user.status === 'banned') {
    throw new HTTPException(403, {
      message: 'Account has been banned'
    })
  }

  // 4. 设置用户信息
  c.set('user', user)

  await next()
})

// 使用
app.use('/api/*', authMiddleware)

app.get('/api/profile', (c) => {
  const user = c.get('user')  // 类型安全！
  return c.json({ user })
})
```

### 基于角色的访问控制（RBAC）

```typescript
type Role = 'admin' | 'editor' | 'user'

const requireRole = (...allowedRoles: Role[]) => {
  return createMiddleware<{
    Variables: { user: User }
  }>(async (c, next) => {
    const user = c.get('user')

    if (!allowedRoles.includes(user.role)) {
      throw new HTTPException(403, {
        message: `Required role: ${allowedRoles.join(' or ')}`
      })
    }

    await next()
  })
}

// 使用
app.delete(
  '/api/users/:id',
  authMiddleware,
  requireRole('admin'),  // 只有 admin 可以删除用户
  async (c) => {
    const id = c.req.param('id')
    await db.deleteUser(id)
    return c.json({ success: true })
  }
)

app.put(
  '/api/posts/:id',
  authMiddleware,
  requireRole('admin', 'editor'),  // admin 和 editor 可以编辑
  async (c) => {
    // ...
  }
)
```

### 权限检查

```typescript
type Permission = 'read' | 'write' | 'delete' | 'manage'

const requirePermission = (resource: string, permission: Permission) => {
  return createMiddleware<{
    Variables: { user: User }
  }>(async (c, next) => {
    const user = c.get('user')

    const hasPermission = await checkPermission(user.id, resource, permission)

    if (!hasPermission) {
      throw new HTTPException(403, {
        message: `Permission denied: ${permission} on ${resource}`
      })
    }

    await next()
  })
}

// 使用
app.delete(
  '/api/documents/:id',
  authMiddleware,
  requirePermission('documents', 'delete'),
  async (c) => {
    // ...
  }
)
```

### Session 认证

```typescript
import { getCookie, setCookie } from 'hono/cookie'

// 登录
app.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json()

  const user = await verifyCredentials(email, password)

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // 创建 session
  const sessionId = crypto.randomUUID()
  await saveSession(sessionId, user)

  // 设置 cookie
  setCookie(c, 'session_id', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 7,  // 7 天
  })

  return c.json({ success: true })
})

// Session 中间件
const sessionMiddleware = createMiddleware(async (c, next) => {
  const sessionId = getCookie(c, 'session_id')

  if (!sessionId) {
    throw new HTTPException(401, { message: 'Not authenticated' })
  }

  const user = await getSession(sessionId)

  if (!user) {
    throw new HTTPException(401, { message: 'Invalid session' })
  }

  c.set('user', user)

  await next()
})

// 登出
app.post('/auth/logout', sessionMiddleware, async (c) => {
  const sessionId = getCookie(c, 'session_id')
  await deleteSession(sessionId!)

  setCookie(c, 'session_id', '', {
    maxAge: 0  // 删除 cookie
  })

  return c.json({ success: true })
})
```

---

## 第九部分：JSX 和服务端渲染

### 无需 React 的 JSX

很多人可能不知道，Hono 内置了 JSX 支持，而且**完全不需要 React**。这对于需要 SSR 但不想引入 React 的项目来说是个绝佳选择。

### 基础 JSX

```typescript
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.html(
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>
        <h1>Hello from Hono JSX!</h1>
      </body>
    </html>
  )
})
```

### JSX 配置

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  }
}
```

### 组件化

```typescript
// components/Layout.tsx
export const Layout = ({ children, title }: { children: any, title: string }) => {
  return (
    <html>
      <head>
        <title>{title}</title>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="/static/style.css" />
      </head>
      <body>
        <header>
          <nav>
            <a href="/">Home</a>
            <a href="/about">About</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>&copy; 2026 My App</p>
        </footer>
      </body>
    </html>
  )
}

// routes/index.tsx
import { Layout } from '../components/Layout'

app.get('/', (c) => {
  return c.html(
    <Layout title="Home">
      <h1>Welcome to my app!</h1>
      <p>This is the home page.</p>
    </Layout>
  )
})
```

### Async Components

```typescript
const UserProfile = async ({ userId }: { userId: string }) => {
  // 异步获取数据
  const user = await db.getUser(userId)

  return (
    <div class="profile">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  )
}

app.get('/users/:id', async (c) => {
  const id = c.req.param('id')

  return c.html(
    <Layout title="User Profile">
      <UserProfile userId={id} />
    </Layout>
  )
})
```

### JSX Renderer 中间件

```typescript
import { jsxRenderer } from 'hono/jsx-renderer'

// 设置全局布局
app.use('*', jsxRenderer(({ children, title }) => {
  return (
    <html>
      <head>
        <title>{title || 'My App'}</title>
      </head>
      <body>
        <div id="app">{children}</div>
      </body>
    </html>
  )
}))

// 使用
app.get('/', (c) => {
  return c.render(
    <div>
      <h1>Home</h1>
    </div>,
    { title: 'Home Page' }
  )
})
```

### 流式 SSR

```typescript
import { jsxRenderer } from 'hono/jsx-renderer'

app.use('*', jsxRenderer(({ children }) => {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}, { stream: true }))  // 启用流式渲染

app.get('/', (c) => {
  return c.render(
    <div>
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncContent />
      </Suspense>
    </div>
  )
})
```

---

## 第十部分：实时通信方案

### WebSocket

Hono 支持 WebSocket，但需要使用特定平台的适配器。

#### Bun WebSocket

```typescript
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'

const app = new Hono()

const { upgradeWebSocket, websocket } = createBunWebSocket()

app.get('/ws', upgradeWebSocket((c) => {
  return {
    onOpen(evt, ws) {
      console.log('Connection opened')
      ws.send('Welcome!')
    },
    onMessage(evt, ws) {
      console.log(`Received: ${evt.data}`)
      ws.send(`Echo: ${evt.data}`)
    },
    onClose(evt, ws) {
      console.log('Connection closed')
    },
    onError(evt, ws) {
      console.error('Error:', evt)
    }
  }
}))

export default {
  fetch: app.fetch,
  websocket,
}
```

#### Cloudflare Durable Objects WebSocket

```typescript
import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/cloudflare-workers'

const app = new Hono()

app.get('/ws', upgradeWebSocket((c) => {
  return {
    onOpen(evt, ws) {
      console.log('Connected')
    },
    onMessage(evt, ws) {
      const data = evt.data
      // 广播给所有连接
      ws.send(data)
    }
  }
}))
```

#### 聊天室示例

```typescript
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'

const app = new Hono()
const { upgradeWebSocket, websocket } = createBunWebSocket()

// 存储所有连接的客户端
const clients = new Set<any>()

app.get('/chat', upgradeWebSocket((c) => {
  return {
    onOpen(evt, ws) {
      clients.add(ws)

      // 通知其他人有新用户加入
      broadcast({ type: 'join', count: clients.size })
    },

    onMessage(evt, ws) {
      const message = JSON.parse(evt.data as string)

      // 广播消息给所有客户端
      broadcast({
        type: 'message',
        user: message.user,
        text: message.text,
        timestamp: Date.now()
      })
    },

    onClose(evt, ws) {
      clients.delete(ws)

      // 通知有用户离开
      broadcast({ type: 'leave', count: clients.size })
    }
  }
}))

function broadcast(data: any) {
  const message = JSON.stringify(data)
  for (const client of clients) {
    try {
      client.send(message)
    } catch (err) {
      console.error('Failed to send to client:', err)
      clients.delete(client)
    }
  }
}

export default {
  fetch: app.fetch,
  websocket,
}
```

### Server-Sent Events (SSE)

```typescript
import { streamSSE } from 'hono/streaming'

// 基础 SSE
app.get('/sse', (c) => {
  return streamSSE(c, async (stream) => {
    let id = 0

    while (true) {
      const message = `Message ${id++}`

      await stream.writeSSE({
        data: message,
        event: 'message',
        id: String(id),
      })

      await stream.sleep(1000)  // 每秒发送一次
    }
  })
})

// 实时日志流
app.get('/logs', (c) => {
  return streamSSE(c, async (stream) => {
    // 订阅日志事件
    const unsubscribe = subscribeToLogs((log) => {
      stream.writeSSE({
        data: JSON.stringify(log),
        event: 'log',
      })
    })

    // 清理
    stream.onAbort(() => {
      unsubscribe()
    })
  })
})

// 实时股票价格
app.get('/stock/:symbol', (c) => {
  const symbol = c.req.param('symbol')

  return streamSSE(c, async (stream) => {
    while (true) {
      const price = await fetchStockPrice(symbol)

      await stream.writeSSE({
        data: JSON.stringify({ symbol, price }),
        event: 'price-update',
      })

      await stream.sleep(5000)  // 每 5 秒更新
    }
  })
})
```

### 流式响应

```typescript
import { stream } from 'hono/streaming'

// 大文件下载
app.get('/download/:file', (c) => {
  const filename = c.req.param('file')

  c.header('Content-Type', 'application/octet-stream')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)

  return stream(c, async (stream) => {
    const file = await openFile(filename)
    const reader = file.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      await stream.write(value)
    }
  })
})

// 流式 JSON
app.get('/stream-data', (c) => {
  return stream(c, async (stream) => {
    await stream.write('[')

    const items = await fetchLargeDataset()

    for (let i = 0; i < items.length; i++) {
      await stream.write(JSON.stringify(items[i]))

      if (i < items.length - 1) {
        await stream.write(',')
      }
    }

    await stream.write(']')
  })
})
```

---

## 第十一部分：测试策略与实践

### 基础测试设置

```bash
npm install --save-dev vitest @cloudflare/vitest-pool-workers
```

**vitest.config.ts**:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

### 测试基础路由

```typescript
// app.test.ts
import { describe, it, expect } from 'vitest'
import app from './app'

describe('App', () => {
  it('GET /', async () => {
    const res = await app.request('/')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello Hono!')
  })

  it('GET /json', async () => {
    const res = await app.request('/json')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/)

    const data = await res.json()
    expect(data).toEqual({ message: 'Hello' })
  })

  it('POST /users', async () => {
    const res = await app.request('/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Alice',
        email: 'alice@example.com'
      })
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data).toHaveProperty('id')
    expect(data.name).toBe('Alice')
  })
})
```

### 测试路由参数

```typescript
describe('User routes', () => {
  it('GET /users/:id', async () => {
    const res = await app.request('/users/123')

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe('123')
  })

  it('GET /users/:id - not found', async () => {
    const res = await app.request('/users/999')

    expect(res.status).toBe(404)
  })
})
```

### 测试认证

```typescript
describe('Authentication', () => {
  let token: string

  it('POST /auth/login', async () => {
    const res = await app.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('token')

    token = data.token
  })

  it('GET /api/profile - without token', async () => {
    const res = await app.request('/api/profile')

    expect(res.status).toBe(401)
  })

  it('GET /api/profile - with token', async () => {
    const res = await app.request('/api/profile', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    expect(res.status).toBe(200)
  })
})
```

### Mock 环境变量和绑定

```typescript
describe('Cloudflare bindings', () => {
  it('Uses KV storage', async () => {
    // Mock KV
    const mockKV = {
      get: vi.fn().mockResolvedValue('cached-value'),
      put: vi.fn(),
    }

    const res = await app.request('/cache', {
      method: 'GET',
    }, {
      KV: mockKV  // 传入 mock 绑定
    })

    expect(res.status).toBe(200)
    expect(mockKV.get).toHaveBeenCalledWith('key')
  })
})
```

### 测试中间件

```typescript
describe('Middleware', () => {
  it('Adds request ID', async () => {
    const res = await app.request('/')

    const requestId = res.headers.get('X-Request-ID')
    expect(requestId).toBeDefined()
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)  // UUID
  })

  it('CORS headers', async () => {
    const res = await app.request('/', {
      headers: {
        Origin: 'https://example.com'
      }
    })

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
  })
})
```

### 集成测试

```typescript
describe('Full user flow', () => {
  it('Register, login, and fetch profile', async () => {
    // 1. 注册
    const registerRes = await app.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(registerRes.status).toBe(201)

    // 2. 登录
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(loginRes.status).toBe(200)
    const { token } = await loginRes.json()

    // 3. 获取个人资料
    const profileRes = await app.request('/api/profile', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    expect(profileRes.status).toBe(200)
    const profile = await profileRes.json()
    expect(profile.email).toBe('test@example.com')
  })
})
```

---

## 第十二部分：多平台部署指南

### Cloudflare Workers

#### 安装和配置

```bash
npm install -D wrangler
npx wrangler init
```

**wrangler.toml**:
```toml
name = "my-hono-app"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# KV 绑定
[[kv_namespaces]]
binding = "KV"
id = "your-kv-id"

# D1 数据库
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "your-db-id"

# 环境变量
[vars]
ENVIRONMENT = "production"
```

#### 代码示例

```typescript
// src/index.ts
import { Hono } from 'hono'

type Bindings = {
  KV: KVNamespace
  DB: D1Database
  ENVIRONMENT: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  // 使用 KV
  const cached = await c.env.KV.get('key')

  // 使用 D1
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM users'
  ).all()

  return c.json({
    env: c.env.ENVIRONMENT,
    cached,
    users: results
  })
})

export default app
```

#### 部署

```bash
# 开发环境
npm run dev

# 部署到生产
npx wrangler deploy
```

### Node.js

#### 安装适配器

```bash
npm install @hono/node-server
```

#### 代码示例

```typescript
// src/index.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello from Node.js!')
})

const port = 3000
console.log(`Server is running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
```

#### PM2 配置

**ecosystem.config.js**:
```javascript
module.exports = {
  apps: [{
    name: 'hono-app',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
```

部署：
```bash
# 构建
npm run build

# 启动
pm2 start ecosystem.config.js

# 重启
pm2 reload hono-app
```

### Deno

```typescript
// main.ts
import { Hono } from 'https://deno.land/x/hono/mod.ts'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello from Deno!')
})

Deno.serve(app.fetch)
```

部署到 Deno Deploy:
```bash
deployctl deploy --project=my-project main.ts
```

### Bun

```typescript
// index.ts
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello from Bun!')
})

export default {
  port: 3000,
  fetch: app.fetch,
}
```

运行：
```bash
bun run index.ts
```

### Vercel

**vercel.json**:
```json
{
  "buildCommand": "npm run build",
  "framework": null,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index"
    }
  ]
}
```

**api/index.ts**:
```typescript
import { Hono } from 'hono'
import { handle } from 'hono/vercel'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello from Vercel!')
})

export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
```

---

## 第十三部分：性能优化技巧

### 1. 使用合适的预设

```typescript
// 长期运行服务器 - 默认
import { Hono } from 'hono'

// Serverless/冷启动 - Quick
import { Hono } from 'hono/quick'

// 边缘计算/极致轻量 - Tiny
import { Hono } from 'hono/tiny'
```

### 2. 启用压缩

```typescript
import { compress } from 'hono/compress'

app.use('*', compress({
  threshold: 1024,
  encoding: 'gzip'
}))
```

### 3. 使用缓存

```typescript
import { cache } from 'hono/cache'

// 静态资源
app.get('/static/*', cache({
  cacheName: 'static',
  cacheControl: 'max-age=31536000',
}))

// API 缓存
app.get('/api/data', cache({
  cacheName: 'api',
  cacheControl: 'max-age=60',
}))
```

### 4. ETag 支持

```typescript
import { etag } from 'hono/etag'

app.use('*', etag())
```

### 5. 减少中间件开销

```typescript
// 不好：所有路径都应用认证
app.use('*', authMiddleware)

// 好：只在需要的路径应用
app.use('/api/*', authMiddleware)
```

### 6. 流式响应大文件

```typescript
import { stream } from 'hono/streaming'

app.get('/large-file', (c) => {
  return stream(c, async (stream) => {
    // 流式发送，而不是一次性加载到内存
    const chunks = await getLargeData()
    for (const chunk of chunks) {
      await stream.write(chunk)
    }
  })
})
```

### 7. 数据库连接池

```typescript
// 使用连接池
const pool = createPool({
  host: 'localhost',
  database: 'mydb',
  max: 10,  // 最大连接数
})

app.get('/users', async (c) => {
  const connection = await pool.getConnection()
  try {
    const users = await connection.query('SELECT * FROM users')
    return c.json(users)
  } finally {
    connection.release()
  }
})
```

### 8. 避免阻塞操作

```typescript
// 不好：同步操作
app.get('/sync', (c) => {
  const data = fs.readFileSync('data.json', 'utf-8')
  return c.text(data)
})

// 好：异步操作
app.get('/async', async (c) => {
  const data = await fs.promises.readFile('data.json', 'utf-8')
  return c.text(data)
})
```

---

## 第十四部分：生产环境最佳实践

### 1. 环境配置

```typescript
// config.ts
export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000'),
  database: {
    url: process.env.DATABASE_URL!,
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: '24h',
  },
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  }
}

// 验证配置
function validateConfig() {
  if (!config.jwt.secret) {
    throw new Error('JWT_SECRET is required')
  }
  if (!config.database.url) {
    throw new Error('DATABASE_URL is required')
  }
}

validateConfig()
```

### 2. 结构化日志

```typescript
import { logger } from 'hono/logger'

// 自定义日志格式
const customLogger = logger((message, ...rest) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    message,
    ...rest
  }))
})

app.use('*', customLogger)

// 错误日志
app.onError((err, c) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  }))

  return c.json({ error: 'Internal Server Error' }, 500)
})
```

### 3. 健康检查

```typescript
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
  })
})

app.get('/ready', async (c) => {
  // 检查数据库连接
  const dbOk = await checkDatabase()

  // 检查其他依赖
  const redisOk = await checkRedis()

  if (!dbOk || !redisOk) {
    return c.json({
      status: 'not ready',
      checks: { dbOk, redisOk }
    }, 503)
  }

  return c.json({ status: 'ready' })
})
```

### 4. 请求 ID

```typescript
app.use('*', async (c, next) => {
  const requestId = c.req.header('X-Request-ID') || crypto.randomUUID()
  c.set('requestId', requestId)
  c.header('X-Request-ID', requestId)
  await next()
})
```

### 5. 速率限制

```typescript
const rateLimit = (max: number, windowMs: number) => {
  const requests = new Map<string, number[]>()

  return createMiddleware(async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') || 'unknown'
    const now = Date.now()

    let timestamps = requests.get(ip) || []
    timestamps = timestamps.filter(t => now - t < windowMs)

    if (timestamps.length >= max) {
      return c.json({
        error: 'Too Many Requests',
        retryAfter: Math.ceil((timestamps[0] + windowMs - now) / 1000)
      }, 429)
    }

    timestamps.push(now)
    requests.set(ip, timestamps)

    await next()
  })
}

app.use('/api/*', rateLimit(100, 60 * 1000))  // 100 请求/分钟
```

### 6. 安全头部

```typescript
import { secureHeaders } from 'hono/secure-headers'

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
  },
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
}))
```

### 7. 优雅关闭

```typescript
// Node.js
import { serve } from '@hono/node-server'

const server = serve({
  fetch: app.fetch,
  port: 3000
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})
```

---

## 第十五部分：真实项目实战案例

### 案例 1：RESTful API

完整的 CRUD API 实现。

```typescript
// types.ts
export type User = {
  id: string
  name: string
  email: string
  createdAt: Date
}

// db.ts
import { drizzle } from 'drizzle-orm/d1'
import { users } from './schema'

export function createDB(d1: D1Database) {
  return drizzle(d1)
}

// routes/users.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const userSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
})

type Bindings = {
  DB: D1Database
}

export const usersRoute = new Hono<{ Bindings: Bindings }>()
  // 列表
  .get('/', async (c) => {
    const db = createDB(c.env.DB)
    const allUsers = await db.select().from(users).all()
    return c.json(allUsers)
  })

  // 详情
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    const db = createDB(c.env.DB)
    const user = await db.select().from(users).where(eq(users.id, id)).get()

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json(user)
  })

  // 创建
  .post('/', zValidator('json', userSchema), async (c) => {
    const data = c.req.valid('json')
    const db = createDB(c.env.DB)

    const newUser = await db.insert(users).values({
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
    }).returning().get()

    return c.json(newUser, 201)
  })

  // 更新
  .put('/:id', zValidator('json', userSchema.partial()), async (c) => {
    const id = c.req.param('id')
    const data = c.req.valid('json')
    const db = createDB(c.env.DB)

    const updated = await db.update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning()
      .get()

    if (!updated) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json(updated)
  })

  // 删除
  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    const db = createDB(c.env.DB)

    await db.delete(users).where(eq(users.id, id))

    return c.json({ success: true })
  })

// app.ts
const app = new Hono()
app.route('/users', usersRoute)

export type AppType = typeof app
export default app
```

### 案例 2：认证系统

```typescript
// auth.ts
import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { hash, compare } from 'bcrypt'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

const registerSchema = loginSchema.extend({
  name: z.string().min(3),
})

export const authRoute = new Hono()
  // 注册
  .post('/register', zValidator('json', registerSchema), async (c) => {
    const { name, email, password } = c.req.valid('json')

    // 检查用户是否存在
    const existing = await db.getUserByEmail(email)
    if (existing) {
      return c.json({ error: 'Email already exists' }, 409)
    }

    // 哈希密码
    const hashedPassword = await hash(password, 10)

    // 创建用户
    const user = await db.createUser({
      name,
      email,
      password: hashedPassword,
    })

    // 生成 JWT
    const token = await sign({
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    }, process.env.JWT_SECRET!)

    return c.json({ token, user: { id: user.id, name, email } }, 201)
  })

  // 登录
  .post('/login', zValidator('json', loginSchema), async (c) => {
    const { email, password } = c.req.valid('json')

    // 查找用户
    const user = await db.getUserByEmail(email)
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    // 验证密码
    const valid = await compare(password, user.password)
    if (!valid) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    // 生成 JWT
    const token = await sign({
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    }, process.env.JWT_SECRET!)

    return c.json({
      token,
      user: { id: user.id, name: user.name, email: user.email }
    })
  })

  // 刷新 token
  .post('/refresh', async (c) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ error: 'Missing token' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')

    try {
      const payload = await verify(token, process.env.JWT_SECRET!)

      // 生成新 token
      const newToken = await sign({
        sub: payload.sub,
        email: payload.email,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      }, process.env.JWT_SECRET!)

      return c.json({ token: newToken })
    } catch {
      return c.json({ error: 'Invalid token' }, 401)
    }
  })
```

### 案例 3：文件上传

```typescript
app.post('/upload', async (c) => {
  const body = await c.req.parseBody()
  const file = body.file as File

  if (!file) {
    return c.json({ error: 'No file provided' }, 400)
  }

  // 验证文件类型
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'Invalid file type' }, 400)
  }

  // 验证文件大小（5MB）
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    return c.json({ error: 'File too large' }, 400)
  }

  // 生成唯一文件名
  const ext = file.name.split('.').pop()
  const filename = `${crypto.randomUUID()}.${ext}`

  // 上传到 R2（Cloudflare）
  const bucket = c.env.BUCKET
  await bucket.put(filename, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type,
    },
  })

  // 返回 URL
  const url = `https://cdn.example.com/${filename}`

  return c.json({ url }, 201)
})
```

---

## 写在最后：我的 Hono 之路

从 Express 迁移到 Hono，这是我在 2025 年做出的最正确的技术决策之一。

### 我为什么选择 Hono

**性能方面**：在我的一个高并发 API 项目中，从 Express 迁移到 Hono 后，响应时间平均降低了 40%，内存占用减少了 30%。

**开发体验**：RPC 模式让前后端协作变得异常顺畅。再也不用手写 API 类型定义，也不用担心前后端类型不一致的问题。

**部署灵活性**：同一套代码，我可以选择部署到 Cloudflare Workers（边缘计算）、Vercel（Serverless）或者传统的 Node.js 服务器。这种灵活性在之前是难以想象的。

### Hono 的核心优势总结

✅ **Web 标准优先** - 真正的跨运行时，一次编写到处运行
✅ **零依赖设计** - 14KB 的极致轻量，秒级安装
✅ **极致性能** - JavaScript 世界最快的路由器之一
✅ **端到端类型安全** - 从数据库到 API 再到客户端的完整类型推导
✅ **优秀的开发体验** - 简洁的 API，平缓的学习曲线
✅ **RPC 模式** - 像调用本地函数一样调用远程 API
✅ **多平台支持** - 8+ 运行时环境随心选择

### 最适合 Hono 的场景

🎯 **RESTful API 开发** - 快速构建类型安全的 API
🎯 **边缘计算应用** - Cloudflare Workers、Deno Deploy
🎯 **Serverless 函数** - AWS Lambda、Vercel Functions
🎯 **微服务架构** - 轻量级、高性能的独立服务
🎯 **全栈应用** - 配合 JSX 实现服务端渲染
🎯 **BFF 层** - 作为前端和后端服务之间的聚合层

### 给初学者的建议

如果你刚开始学习 Hono，我建议按照这个路径：

1. **第一周**：掌握 Context API、基础路由和中间件
2. **第二周**：学习 Zod 验证、RPC 模式和错误处理
3. **第三周**：实战项目 - 构建一个完整的 RESTful API
4. **第四周**：深入学习认证授权、性能优化和部署

### 开始你的 Hono 之旅

```bash
# 创建你的第一个 Hono 项目
npm create hono@latest my-app

# 选择你喜欢的运行时
cd my-app
npm install
npm run dev
```

**Hono 不仅仅是一个框架，它代表了 Web 开发的未来方向** —— 基于标准、追求性能、注重体验。

如果这篇文章对你有帮助，欢迎分享给更多的开发者。也期待在评论区看到你使用 Hono 的心得体会！

---

## 参考资源与延伸阅读

### 官方资源

- 📚 [Hono 官方文档](https://hono.dev/docs/) - 最权威的学习资料
- 🐙 [Hono GitHub](https://github.com/honojs/hono) - 源码和 Issue 讨论
- 💬 [Hono Discord](https://discord.gg/hono) - 社区支持和交流

### 深入学习指南

- [RPC 模式完整指南](https://hono.dev/docs/guides/rpc)
- [数据验证最佳实践](https://hono.dev/docs/guides/validation)
- [JSX 服务端渲染](https://hono.dev/docs/guides/jsx)
- [中间件开发文档](https://hono.dev/docs/guides/middleware)
- [测试策略指南](https://hono.dev/docs/guides/testing)
- 
---

<div align="center">

*本文撰写于 2026 年 1 月 20 日，基于 Hono 最新版本。*
*Hono 持续快速发展中，建议关注官方文档获取最新信息。*

</div>
