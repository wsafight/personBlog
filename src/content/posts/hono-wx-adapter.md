---
title: Hono RPC 适配微信小程序：wx.request 与 WebSocket 落地指南
published: 2026-05-27
description: 详解如何将 Hono RPC 客户端适配到微信小程序，用 wxFetch 包装 wx.request 保留端到端类型安全，用 WxWebSocket 包装 wx.connectSocket 连接 Hono 服务端 WebSocket，并覆盖 polyfill、坑点与生产级封装。
tags: [Hono, 微信小程序, RPC, TypeScript, WebSocket]
category: 前端
draft: false
---

## 写在前面

Hono 是当下很优雅的"端到端类型安全"Web 框架，它的 `hc` RPC 客户端可以让前后端共享类型。但问题来了：`hc` 默认基于浏览器/Node 的 Web API 设计，依赖 `fetch`、`Headers`、`URLSearchParams`、`URL` 与 `WebSocket`；而微信小程序的网络入口是 `wx.request` 和 `wx.connectSocket`。

**本文方案：**
- HTTP RPC：用 `hc + wxFetch` 保留类型安全
- WebSocket：服务端用 Hono，客户端用 `WxWebSocket` 包装 `wx.connectSocket`

这套方案已实测跑通，可减少小程序 Web API polyfill 的兼容成本。

---

## 一、Hono RPC 工作原理

### 基本用法

```ts
// 服务端
const route = new Hono().get('/users/:id', (c) => c.json({ id: 1 }))
export type AppType = typeof route

// 客户端
import { hc } from 'hono/client'
const client = hc<AppType>('https://api.example.com')
const res = await client.users[':id'].$get({ param: { id: '1' } })
const data = await res.json()
```

### 核心机制

1. `hc` 默认调用**全局 `fetch`** 发送请求
2. 返回标准 `Response` 对象（含 `.json()` / `.text()` / `.headers`）
3. 支持自定义 `fetch`：`hc(url, { fetch: customFetch })` —— **这是适配小程序的核心钩子**

### 适配要点

`customFetch` 只能替换发请求的步骤。Hono 客户端在构造请求时还会用到：

- `Headers` 和 `URLSearchParams`（构造请求）
- `URL`（`$url()` / `$ws()` 方法）

所以小程序需要：

1. 用 `wx.request` 实现 fetch-like 函数，注入给 `hc`
2. 在入口补齐 `Headers`、`URLSearchParams`、`URL` 等 polyfill
3. WebSocket 服务端用 Hono，客户端直接用 `WxWebSocket` 连接

---

## 二、小程序与浏览器的 API 差异

| 能力 | 浏览器 | 微信小程序 |
| --- | --- | --- |
| HTTP 请求 | `fetch` / `XMLHttpRequest` | `wx.request` |
| WebSocket | 原生 `WebSocket` | `wx.connectSocket` |
| URL / URLSearchParams | 原生支持 | 需要 polyfill |
| Cookie | 浏览器自动维护 | 不会自动维护 |
| Headers 类 | 原生支持 | 需要 polyfill |
| 文件上传 | `FormData` / `fetch` | `wx.uploadFile` |
| AbortController | ✅ | 部分支持（`requestTask.abort`） |

**核心结论：** 不是只补一个 fetch 就结束了，Hono 客户端依赖的几个 Web API 也要一起考虑。

### 本文覆盖范围

**支持的场景：**
- Hono RPC 的 JSON API：`json`、`query`、`param`、`header`
- Bearer Token 等显式鉴权
- 普通 JSON / text 响应
- Hono 服务端 WebSocket 与小程序端 `wx.connectSocket` 连接

**不包含的场景：**
- 文件上传、`multipart/form-data`、`File`、`Blob` → 用 `wx.uploadFile` 单独封装
- 流式响应、`ReadableStream`、SSE → 微信小程序网络模型不同，需单独设计
- 完整 Fetch 标准 → 这里只做 Hono RPC 可用的最小兼容层

---

## 三、wxFetch：把 wx.request 包装成 fetch

### 1. 入口先补必要 polyfill

`fetch` 注入只解决"怎么发请求"。Hono 客户端在构造请求时还会使用 `Headers`、`URLSearchParams`、`URL`，所以建议在小程序入口最早处补齐这些全局对象。

**注意：** 小程序里不能只判断 `typeof globalThis.URL !== 'undefined'`。实测可能存在一个不可 `new` 的 `URL`，导致 Hono 客户端内部触发 `URL is not a constructor`。更稳妥的做法是确认它能被构造：

```ts
const canConstruct = (value: unknown, sample: string) => {
  if (typeof value !== 'function') return false

  try {
    new (value as new (input: string) => unknown)(sample)
    return true
  } catch {
    return false
  }
}

export const installWebPolyfills = () => {
  const target = globalThis as any

  if (!canConstruct(target.Headers, 'x-test=1')) {
    target.Headers = MiniHeaders
  }

  if (!canConstruct(target.URLSearchParams, 'a=1')) {
    target.URLSearchParams = MiniURLSearchParams
  }

  if (!canConstruct(target.URL, 'http://example.test')) {
    target.URL = MiniURL
  }
}
```

`MiniHeaders`、`MiniURLSearchParams`、`MiniURL` 不需要实现完整 Web 标准，只要覆盖 Hono RPC 用到的 `.set()`、`.append()`、`.forEach()`、`.toString()`、`.searchParams` 等能力即可。如果构建链能稳定打包成熟 polyfill，也可以直接使用第三方包。

### 2. 类型对齐

```ts
type FetchLike = typeof fetch
```

如果 `tsconfig` 没有启用 DOM 类型，也可以在本地定义一个更窄的类型，并在传给 `hc` 时做类型断言。运行时重点不是类型名，而是这个函数要返回带 `.json()` / `.text()` / `.headers.get()` 的 Response-like 对象。

### 3. JSON API 最小实现

```ts
type HeaderMap = Record<string, string>

const normalizeHeaders = (source?: HeadersInit): HeaderMap => {
  const headers: HeaderMap = {}
  if (!source) return headers

  if (typeof Headers !== 'undefined' && source instanceof Headers) {
    source.forEach((value, key) => {
      headers[key.toLowerCase()] = value
    })
    return headers
  }

  if (Array.isArray(source)) {
    source.forEach(([key, value]) => {
      headers[key.toLowerCase()] = String(value)
    })
    return headers
  }

  Object.entries(source).forEach(([key, value]) => {
    headers[key.toLowerCase()] = String(value)
  })
  return headers
}

const setHeaderIfMissing = (
  headers: HeaderMap,
  key: string,
  value: string
) => {
  const lowerKey = key.toLowerCase()
  if (!headers[lowerKey]) headers[lowerKey] = value
}

/**
 * 将 wx.request 适配为 Hono RPC 可用的 fetch-like 接口
 * 覆盖 JSON / text API；文件上传请用 wx.uploadFile 单独封装
 */
export const wxFetch: FetchLike = (input, init = {}) => {
  return new Promise((resolve, reject) => {
    const url =
      typeof input === 'string'
        ? input
        : typeof URL !== 'undefined' && input instanceof URL
          ? input.toString()
          : 'url' in input
            ? input.url
            : String(input)
    if (!url) {
      reject(new TypeError('wxFetch only supports string URL or Request-like input'))
      return
    }

    const method = (init.method || 'GET').toUpperCase()

    const headers = normalizeHeaders(init.headers)

    let data: any = init.body

    if (
      typeof FormData !== 'undefined' &&
      data instanceof FormData
    ) {
      reject(new TypeError('wxFetch does not support FormData. Use wx.uploadFile instead.'))
      return
    }

    if (
      typeof URLSearchParams !== 'undefined' &&
      data instanceof URLSearchParams
    ) {
      data = data.toString()
      setHeaderIfMissing(headers, 'content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
    } else if (
      data &&
      typeof data === 'object' &&
      !(data instanceof ArrayBuffer)
    ) {
      data = JSON.stringify(data)
      setHeaderIfMissing(headers, 'content-type', 'application/json')
    }

    const task = wx.request({
      url,
      method,
      header: headers,
      data,
      // 不让 wx.request 自动 JSON.parse，保持 Response.json() 的行为边界
      dataType: '其他',
      responseType: 'text',
      success: (res) => {
        const body =
          typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        const responseHeaders = normalizeHeaders(res.header as Record<string, string>)

        const response = {
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: '',
          headers: {
            get: (key: string) => responseHeaders[key.toLowerCase()] ?? null,
            forEach: (cb: (v: string, k: string) => void) =>
              Object.entries(responseHeaders).forEach(([k, v]) => cb(v, k)),
            has: (key: string) => responseHeaders[key.toLowerCase()] !== undefined,
          },
          json: async () => JSON.parse(body),
          text: async () => body,
          arrayBuffer: async () => new TextEncoder().encode(body).buffer,
          clone() {
            return response
          },
        } as unknown as Response

        resolve(response)
      },
      fail: (err) => reject(new Error(err.errMsg || 'wx.request failed')),
    })

    if (init.signal) {
      if (init.signal.aborted) {
        task.abort()
        reject(new DOMException('The operation was aborted.', 'AbortError'))
        return
      }

      init.signal.addEventListener(
        'abort',
        () => {
          task.abort()
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        },
        { once: true },
      )
    }
  })
}
```

这段代码刻意不支持 `FormData`、`Blob`、流式响应和二进制响应。把它写窄，反而更不容易在生产里误用。

### 4. 注入到 hc

```ts
import { hc } from 'hono/client'
import type { AppType } from '../../server/src/index' // 服务端导出的类型
import { wxFetch } from './wx-fetch'

export const api = hc<AppType>('https://api.example.com', {
  fetch: wxFetch,
  // 可选：统一注入 token / 公共 header
  headers: () => ({
    Authorization: `Bearer ${wx.getStorageSync('token')}`,
  }),
})
```

之后 JSON RPC 业务代码基本可以和浏览器侧保持一致：

```ts
const res = await api.users[':id'].$get({ param: { id: '1' } })
const user = await res.json()
```

**优势：**
- ✅ 类型安全
- ✅ 复用服务端类型
- ✅ JSON RPC 业务代码基本不用关心小程序网络 API

---

## 四、wxFetch 的实战坑点

### 坑 1：`Content-Type` 大小写敏感

HTTP header 名本来应该大小写不敏感，但现实里有些自写服务端代码会写出 `headers['Content-Type']` 这种大小写敏感逻辑。

**解决方案：** 适配层统一转成小写，服务端用框架提供的 header API 读取：

```ts
const normalize = (h: Record<string, string>) =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))
```

### 坑 2：URL 拼接

不要假设小程序运行时一定有浏览器完整的 `URL` / `URLSearchParams`。Hono 客户端的 `$url()` 以及查询参数处理都可能触达这些 API。

**解决方案：** 在入口处做 polyfill，并确认它真的可以被构造：

```ts
const target = globalThis as any

try {
  new target.URL('http://example.test')
} catch {
  target.URL = MiniURL
}
```

WebSocket 如果走 `hc().$ws()` 也会触达 `new URL(...)`。为了减少这类兼容点，小程序端更推荐直接 `new WxWebSocket(wsUrl)`。

### 坑 3：域名白名单

`request合法域名` 必须在公众平台后台配置，**自定义 fetch 改变不了这一限制**。

- 开发期：可勾选"不校验合法域名"
- 真机和线上：仍要按微信规则配置 HTTPS 域名

### 坑 4：超时 & 取消

- `wx.request` 默认 60 秒，可通过 `wx.request({ timeout })` 控制
- 要支持 fetch 的 `AbortController`，必须保留 `requestTask`，监听 `signal` 的 abort 事件并调用 `task.abort()`（上方代码已实现）

### 坑 5：Cookie 与跨端鉴权

小程序不会像浏览器一样自动维护站点 Cookie。可以手动保存 `Set-Cookie` 再透传 `Cookie` header，但跨端 API 更推荐统一成 **`Authorization: Bearer xxx`** 的 token 模式，把 token 存在 `wx.getStorageSync` 里。

---

## 五、WebSocket：后端用 Hono，前端用 WxWebSocket

Hono 服务端可以继续使用自己的 WebSocket helper，例如 Bun 运行时下的 `upgradeWebSocket`。小程序端则建议直接用一个 **`WxWebSocket`** 类包装 `wx.connectSocket`，业务层拿到的仍然是接近浏览器 `WebSocket` 的对象。

**为什么不用 `hc(...).xxx.$ws()`？**

Hono 客户端的 `$ws()` 内部会构造 `new URL(...)`，而微信小程序运行时的 `URL` / `URLSearchParams` 兼容性并不总是可靠。HTTP RPC 走 `hc + wxFetch` 的收益很大；WebSocket 本质上还是一条消息通道，直接 `new WxWebSocket(url)` 更稳，用户和大部分业务代码无感。

### 1. WebSocket-like 类的最小子集

```ts
interface StandardWS {
  readyState: number
  send(data: string | ArrayBufferLike | ArrayBufferView): void
  close(): void
  onopen: ((ev: any) => void) | null
  onmessage: ((ev: any) => void) | null
  onerror: ((ev: any) => void) | null
  onclose: ((ev: any) => void) | null
  addEventListener(type: string, listener: any): void
  removeEventListener(type: string, listener: any): void
}
```

### 2. 最小实现

```ts
/**
 * 微信小程序 WebSocket 适配类
 * 把 wx.connectSocket / SocketTask 包装成 WebSocket-like 接口
 * 用来连接 Hono 服务端暴露的 ws:// / wss:// 地址
 */
export class WxWebSocket implements StandardWS {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = WxWebSocket.CONNECTING
  onopen: ((ev: any) => void) | null = null
  onmessage: ((ev: any) => void) | null = null
  onerror: ((ev: any) => void) | null = null
  onclose: ((ev: any) => void) | null = null

  private listeners: Partial<Record<'open' | 'message' | 'error' | 'close', Set<Function>>> = {}
  private task: WechatMiniprogram.SocketTask

  /**
   * 构造一个 WxWebSocket 实例，自动建立连接
   * @param url       WebSocket 完整地址；线上必须是 wss://，且要配置 socket 合法域名
   * @param protocols 子协议（可选）
   */
  constructor(url: string, protocols?: string | string[]) {
    this.task = wx.connectSocket({
      url,
      protocols: Array.isArray(protocols)
        ? protocols
        : protocols
        ? [protocols]
        : undefined,
    })

    this.task.onOpen(() => {
      this.readyState = WxWebSocket.OPEN
      this.dispatch('open', {})
    })

    this.task.onMessage((res) => {
      this.dispatch('message', { data: res.data })
    })

    this.task.onError((err) => {
      this.dispatch('error', { message: err.errMsg })
    })

    this.task.onClose((res) => {
      this.readyState = WxWebSocket.CLOSED
      this.dispatch('close', { code: res.code, reason: res.reason })
    })
  }

  /**
   * 发送消息。尽量保持 WebSocket 原语义，业务层自己决定是否 JSON.stringify
   */
  send(data: string | ArrayBufferLike | ArrayBufferView) {
    if (this.readyState !== WxWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    this.task.send({ data: data as any })
  }

  /**
   * 主动关闭连接
   */
  close(code?: number, reason?: string) {
    this.readyState = WxWebSocket.CLOSING
    this.task.close({ code, reason })
  }

  /**
   * 事件订阅接口（兼容 ws.addEventListener('message', ...) 写法）
   */
  addEventListener(type: string, listener: Function) {
    if (!this.isKnownType(type)) return
    ;(this.listeners[type] ||= new Set()).add(listener)
  }

  removeEventListener(type: string, listener: Function) {
    if (!this.isKnownType(type)) return
    this.listeners[type]?.delete(listener)
  }

  /**
   * 内部分发事件给 onXxx 回调与 addEventListener 注册的监听器
   */
  private dispatch(type: string, ev: any) {
    const handler = (this as any)[`on${type}`]
    handler?.(ev)
    if (this.isKnownType(type)) {
      this.listeners[type]?.forEach((fn) => fn(ev))
    }
  }

  private isKnownType(type: string): type is 'open' | 'message' | 'error' | 'close' {
    return type === 'open' || type === 'message' || type === 'error' || type === 'close'
  }
}
```

### 3. Hono 服务端写法

Bun 运行时可以直接使用 `hono/bun` 的 `upgradeWebSocket` 和 `websocket`：

```ts
// server/app.ts
import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'

export const app = new Hono().get(
  '/ws',
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      ws.send(JSON.stringify({ type: 'open', message: 'connected' }))
    },
    onMessage(event, ws) {
      ws.send(
        JSON.stringify({
          type: 'echo',
          message: typeof event.data === 'string' ? event.data : '[binary]',
        }),
      )
    },
  })),
)
```

```ts
// server/index.ts
import { websocket } from 'hono/bun'
import { app } from './app'

Bun.serve({
  port: 8787,
  fetch: app.fetch,
  websocket,
})
```

### 4. 小程序端连接

```ts
import { WxWebSocket } from './wx-ws'

const ws = new WxWebSocket('ws://127.0.0.1:8787/ws')

ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello' })))
ws.addEventListener('message', (e) => console.log('recv', e.data))
```

如果确实希望小程序端也写成 `api.chat.$ws()`，理论上可以给 `hc` 注入 `webSocket` option。但这条路要求小程序端有可靠的 `URL` / `URLSearchParams` polyfill。实测里更推荐直接创建 `WxWebSocket`，少一个兼容层。

**注意：** WebSocket 线上还要配置 `socket合法域名`。开发者工具里关闭域名校验只能解决本地调试，不能代表真机和线上环境。

---

## 六、生产级别封装（推荐项目结构）

```
src/
├── api/
│   ├── client.ts        # 导出 api 实例
│   ├── wx-fetch.ts      # 适配 wx.request
│   └── wx-ws.ts         # 适配 wx.connectSocket
└── pages/
    └── home/index.ts
```

`client.ts`：

```ts
import { hc } from 'hono/client'
import type { AppType } from '@server/index'
import { wxFetch } from './wx-fetch'
import { WxWebSocket } from './wx-ws'

const BASE_URL = __DEV__
  ? 'https://dev-api.example.test'
  : 'https://api.example.com'

export const api = hc<AppType>(BASE_URL, {
  fetch: wxFetch,
  headers: () => ({
    Authorization: `Bearer ${wx.getStorageSync('token') || ''}`,
    'X-App-Version': wx.getAccountInfoSync().miniProgram.version,
  }),
})

export const createSocket = (path = '/ws') => {
  const wsBaseUrl = BASE_URL.replace(/^http/, 'ws')
  return new WxWebSocket(`${wsBaseUrl}${path}`)
}
```

**注意：** 这里没有直接写 `http://localhost:8787`，因为真机里的 `localhost` 指的是手机自己，不是你的电脑。开发期可以用局域网 IP、内网穿透、反向代理，或者只在微信开发者工具里配合"不校验合法域名"调试。

---

## 七、进阶：自动重连 + 心跳 + Token 刷新

### 1. WebSocket 自动重连封装

```ts
/**
 * 带自动重连和心跳的 WebSocket 包装器
 * 适合长连接业务（IM、订单状态推送）
 */
export class ReconnectingWxWS {
  private ws?: WxWebSocket
  private retry = 0
  private heartbeatTimer?: number
  private closedByUser = false

  constructor(private url: string) {
    this.connect()
  }

  /**
   * 建立连接并注册自动重连逻辑
   */
  private connect() {
    this.ws = new WxWebSocket(this.url)
    this.ws.onopen = () => {
      this.retry = 0
      this.startHeartbeat()
    }
    this.ws.onclose = () => {
      this.stopHeartbeat()
      if (this.closedByUser) return
      const delay = Math.min(1000 * 2 ** this.retry++, 30000)
      setTimeout(() => this.connect(), delay)
    }
  }

  /**
   * 每 25 秒发一次心跳，保持 NAT 表项与服务端可达性
   */
  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.ws?.send(JSON.stringify({ type: 'ping' }))
    }, 25000) as unknown as number
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
  }

  send(data: object) {
    this.ws?.send(JSON.stringify(data))
  }

  close() {
    this.closedByUser = true
    this.stopHeartbeat()
    this.ws?.close()
  }
}
```

### 2. wxFetch 拦截器（401 自动刷新 token）

```ts
export const authFetch: FetchLike = async (input, init) => {
  const res = await wxFetch(input, init)
  if (res.status === 401) {
    await refreshToken()
    return wxFetch(input, init) // 重试一次
  }
  return res
}
```

---

## 八、常见问题速查

| 问题 | 原因 | 解决 |
| --- | --- | --- |
| 请求报 `URL is not defined` | `$url()` 或 query 处理触达了 URL API | 在入口注入 `URL` / `URLSearchParams` polyfill |
| WebSocket 报 `URL is not a constructor` | 小程序运行时的 `URL` 不完整，而 `hc().$ws()` 内部会 `new URL(...)` | 小程序端直接用 `new WxWebSocket(wsUrl)`，或换成可靠 URL polyfill |
| 请求报 `Headers is not defined` | Hono 客户端构造请求时用了 `Headers` | 在入口注入 `Headers` polyfill |
| 类型推导丢失 | 服务端没 `export type AppType` | 服务端用 `typeof app` 导出 |
| header 大小写问题 | 小程序自动小写 | 适配层统一小写 |
| 文件上传失败 | wx.request 不支持 multipart | 改用 `wx.uploadFile` 单独包装 |
| WebSocket 连接被拒 | 未配置 `socket合法域名` 或协议不是 `wss://` | 在公众平台后台配置 socket 域名 |
| WebSocket 后台断开 | 小程序后台生命周期限制 | 监听 `App.onShow` 后按业务需要重连 |
| Cookie 不生效 | 小程序不会自动维护浏览器式 Cookie | 优先用 token + storage，必要时手动转发 Cookie |
| 真机访问不了 `localhost` | 真机的 localhost 是手机自己 | 用局域网 IP、代理、内网穿透或开发者工具调试 |
| 开发期请求被拦 | 域名未配置白名单 | 公众平台后台配置或开发工具勾选不校验 |

---

## 九、Taro / uni-app 适配差异

如果你用的是 **Taro / uni-app**，原理一致，只是 API 名字不同：

| 框架 | HTTP | WebSocket |
| --- | --- | --- |
| 原生小程序 | `wx.request` | `wx.connectSocket` |
| Taro | `Taro.request` | `Taro.connectSocket` |
| uni-app | `uni.request` | `uni.connectSocket` |

把上面 `wxFetch` / `WxWebSocket` 中的 `wx.xxx` 换成对应平台 API 后，主体思路不变。但不同框架对请求返回值、取消任务、WebSocket 事件对象的封装略有差异，适配层还是要单独测一遍。

**服务端类型和大部分 `hc` 调用代码可以复用。** 这正是适配层的价值。

---

## 十、总结

> **Hono RPC 适配小程序的本质 = HTTP 用 `hc + wxFetch` 保留类型安全，WebSocket 服务端继续用 Hono，小程序端用 `WxWebSocket` 包装 `wx.connectSocket` 直连。**

只要这些边界处理好：

- ✅ JSON RPC 业务代码可以和浏览器侧高度一致
- ✅ 端到端类型安全可以保留
- ✅ WebSocket 服务端仍然留在 Hono 路由体系里
- ✅ 后续切换到 Taro / uni-app 时主要改适配层
- ✅ 可叠加重连、心跳、token 刷新等生产级能力

如果你正在用 Hono 写后端，又有小程序入口，可以优先按这套结构落地：HTTP API 最大化复用 Hono RPC 类型能力，WebSocket 选择更贴近小程序运行时的直连方式，再按实际业务补上传、流式响应、鉴权刷新等专项能力。
