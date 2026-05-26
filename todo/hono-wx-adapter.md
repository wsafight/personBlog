# Hono RPC 适配微信小程序：wx.request 与 WebSocket 落地指南

> 写在前面：Hono 是当下很优雅的"端到端类型安全"Web 框架之一，它的 `hc` RPC 客户端可以让前后端共享类型，写起来很顺。但问题来了：`hc` 默认按浏览器 / Node 的 Web API 设计，运行时会用到 `fetch`、`Headers`、`URLSearchParams`、`URL` 与 `WebSocket`；微信小程序的网络入口则是 `wx.request` 和 `wx.connectSocket`。本文给出一套可落地的适配方案：把小程序 API 包装成 Hono 客户端能使用的 fetch / WebSocket，同时补齐必要的 Web API polyfill，让小程序也能保留 Hono 的端到端类型安全。

---

## 一、Hono RPC 工作原理（先理清）

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

关键点：

1. `hc` 默认会调用 **全局 `fetch`** 来发请求；
2. 返回的是标准 `Response` 对象（含 `.json()` / `.text()` / `.headers`）；
3. 支持自定义 `fetch` 函数：`hc(url, { fetch: customFetch })` —— **这是适配小程序的核心钩子**。

但要注意：`customFetch` 只能替换最终发请求的那一步。Hono 客户端在构造请求时还会用到 `Headers` 和 `URLSearchParams`，`$url()` / `$ws()` 还会用到 `URL`。所以小程序里要同时处理两件事：

- 用 `wx.request` 实现一个 fetch-like 函数；
- 在入口处补齐 `Headers`、`URLSearchParams`、`URL` 等必要 polyfill。

---

## 二、小程序与浏览器的 API 差异

| 能力 | 浏览器 | 微信小程序 |
| --- | --- | --- |
| HTTP 请求 | `fetch` / `XMLHttpRequest` | `wx.request` |
| WebSocket | 原生 `WebSocket` | `wx.connectSocket` |
| URL / URLSearchParams | 原生支持 | 需要 polyfill |
| Cookie | 浏览器自动维护 | 不会像浏览器一样自动维护 |
| Headers 类 | 原生支持 | 需要 polyfill，或避免直接依赖 |
| 文件上传 | `FormData` / `fetch` | `wx.uploadFile` |
| AbortController | ✅ | 部分支持（`requestTask.abort`） |

简单说：**不是只补一个 fetch 就结束了，Hono 客户端依赖的几个 Web API 也要一起考虑。**

### 适用范围

本文代码主要覆盖这类场景：

- Hono RPC 的 JSON API：`json`、`query`、`param`、`header`；
- Bearer Token 这类显式鉴权；
- 普通 JSON / text 响应；
- Hono WebSocket helper 的 `$ws()` 客户端连接。

本文不把下面这些内容塞进同一个 `wxFetch`：

- 文件上传、`multipart/form-data`、`File`、`Blob`：用 `wx.uploadFile` 单独封装；
- 流式响应、`ReadableStream`、SSE：微信小程序网络模型和浏览器 Fetch 不一样，单独设计；
- 完整 Fetch 标准：这里做的是 Hono RPC 可用的最小兼容层。

---

## 三、wxFetch：把 wx.request 包装成 fetch

### 1. 入口先补必要 polyfill

`fetch` 注入只解决"怎么发请求"。Hono 客户端在构造请求时还会使用 `Headers`，在 `$url()` / `$ws()` 等路径上还可能使用 `URL` 和 `URLSearchParams`。所以建议在小程序入口最早处补齐这些全局对象：

```ts
// app.ts
// 下面是示意：具体 polyfill 包要选你的小程序构建链能正常打包的版本。
import { Headers } from 'headers-polyfill'
import 'url-polyfill'

if (typeof globalThis.Headers === 'undefined') {
  ;(globalThis as any).Headers = Headers
}
```

如果你的框架或基础库已经提供了 `URL` / `URLSearchParams` / `Headers`，这一步可以只做存在性检查，不要重复覆盖。

### 2. 类型对齐

```ts
type FetchLike = typeof fetch
```

如果你的 `tsconfig` 没有启用 DOM 类型，也可以在本地定义一个更窄的类型，并在传给 `hc` 时做一次类型断言。运行时重点不是类型名，而是这个函数要返回带 `.json()` / `.text()` / `.headers.get()` 的 Response-like 对象。

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
 * 将 wx.request 适配为 Hono RPC 可用的 fetch-like 接口。
 * 这版覆盖 JSON / text API；文件上传请用 wx.uploadFile 单独封装。
 */
export const wxFetch: FetchLike = (input, init = {}) => {
  return new Promise((resolve, reject) => {
    const url =
      typeof input === 'string'
        ? input
        : 'url' in input
        ? input.url
        : String(input)
    if (!url) {
      reject(new TypeError('wxFetch only supports string URL or Request-like input'))
      return
    }

    const method = (init.method || 'GET').toUpperCase() as
      | 'GET'
      | 'POST'
      | 'PUT'
      | 'PATCH'
      | 'DELETE'
      | 'OPTIONS'
      | 'HEAD'

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
      // 不让 wx.request 自动 JSON.parse，保持 Response.json() 的行为边界。
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
          },
          json: async () => JSON.parse(body),
          text: async () => body,
          arrayBuffer: async () => {
            throw new Error('arrayBuffer not supported in wxFetch')
          },
          clone() {
            return response
          },
        } as unknown as Response

        resolve(response)
      },
      fail: (err) => reject(new Error(err.errMsg || 'wx.request failed')),
    })

    if (init.signal) {
      init.signal.addEventListener('abort', () => task.abort())
    }
  })
}
```

这段代码刻意没有支持 `FormData`、`Blob`、流式响应和二进制响应。把它写窄，反而更不容易在生产里误用。

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

✅ 类型安全
✅ 复用服务端类型
✅ JSON RPC 业务代码基本不用关心小程序网络 API

---

## 四、wxFetch 的实战坑点

### 坑 1：`Content-Type` 大小写敏感
HTTP header 名本来就应该大小写不敏感，但现实里有些自写服务端代码会写出 `headers['Content-Type']` 这种大小写敏感逻辑。适配层建议统一转成小写，服务端也应该用框架提供的 header API 读取：

```ts
const normalize = (h: Record<string, string>) =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))
```

### 坑 2：URL 拼接
不要假设小程序运行时一定有浏览器完整的 `URL` / `URLSearchParams`。Hono 客户端的 `$url()`、`$ws()` 以及查询参数处理都可能触达这些 API，稳妥做法是在入口处做 polyfill：

```ts
// 在小程序入口最早处
if (typeof globalThis.URL === 'undefined') {
  // 注入你项目选用的 URL polyfill
}
if (typeof globalThis.URLSearchParams === 'undefined') {
  // 注入 URLSearchParams polyfill
}
```

### 坑 3：域名白名单
`request合法域名` 必须在公众平台后台配置，**自定义 fetch 改变不了这一限制**。开发期可勾选"不校验合法域名"，但真机和线上环境仍要按微信规则配置 HTTPS 域名。

### 坑 4：超时 & 取消
`wx.request` 默认 60 秒，可通过 `wx.request({ timeout })` 控制。
要支持 fetch 的 `AbortController`，必须保留 `requestTask`，监听 `signal` 的 abort 事件并调用 `task.abort()`（上方代码已实现）。

### 坑 5：Cookie 与跨端鉴权
小程序不会像浏览器一样自动维护站点 Cookie。可以手动保存 `Set-Cookie` 再透传 `Cookie` header，但跨端 API 更推荐统一成 **`Authorization: Bearer xxx`** 的 token 模式，把 token 存在 `wx.getStorageSync` 里。

---

## 五、WxWebSocket：把 wx.connectSocket 包装成 WebSocket-like

Hono 提供了 WebSocket helper（`hono/ws`），客户端常用 `hc(...).ws.$ws()` 拿到一个 `WebSocket`。但小程序的 WebSocket 是**回调式 `SocketTask`**，连接数、后台保活和域名配置都受微信平台限制，跟标准浏览器 WebSocket 接口差异较大。

我们需要写一个 **`WxWebSocket`** 类，让它符合 Hono 客户端需要的 WebSocket 最小接口，再传给 `hc`。

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
 *
 * 把 wx.connectSocket / SocketTask 包装成 WebSocket-like 接口，
 * 让 Hono 的 hc.$ws() 可以直接使用。
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

  private listeners: Record<string, Set<Function>> = {}
  private task: WechatMiniprogram.SocketTask

  /**
   * 构造一个 WxWebSocket 实例，自动建立连接
   *
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
   * 发送消息。尽量保持 WebSocket 原语义，业务层自己决定是否 JSON.stringify。
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
  close() {
    this.readyState = WxWebSocket.CLOSING
    this.task.close({})
  }

  /**
   * 事件订阅接口（兼容 ws.addEventListener('message', ...) 写法）
   */
  addEventListener(type: string, listener: Function) {
    ;(this.listeners[type] ||= new Set()).add(listener)
  }

  removeEventListener(type: string, listener: Function) {
    this.listeners[type]?.delete(listener)
  }

  /**
   * 内部分发事件给 onXxx 回调与 addEventListener 注册的监听器
   */
  private dispatch(type: string, ev: any) {
    const handler = (this as any)[`on${type}`]
    handler?.(ev)
    this.listeners[type]?.forEach((fn) => fn(ev))
  }
}
```

### 3. 注入到 hc

如果你使用的 Hono 版本支持 `webSocket` option，优先显式注入，不要污染全局：

```ts
import { hc } from 'hono/client'
import type { AppType } from '@server/index'
import { wxFetch } from './wx-fetch'
import { WxWebSocket } from './wx-ws'

export const api = hc<AppType>('https://api.example.com', {
  fetch: wxFetch,
  webSocket: (url, protocols) =>
    new WxWebSocket(url, protocols) as unknown as WebSocket,
})
```

如果你的 Hono 版本没有 `webSocket` option，再退回全局 polyfill：

```ts
// app.ts，小程序入口最早处
import { WxWebSocket } from './utils/wx-ws'

if (typeof globalThis.WebSocket === 'undefined') {
  ;(globalThis as any).WebSocket = WxWebSocket
}
```

之后业务代码：

```ts
const ws = api.chat.$ws()
ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello' })))
ws.addEventListener('message', (e) => console.log('recv', e.data))
```

WebSocket 线上还要配置 `socket合法域名`。开发者工具里关闭域名校验只能解决本地调试，不能代表真机和线上环境。

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
/**
 * 全局唯一的 API 客户端实例
 * - fetch: 小程序适配层
 * - webSocket: 小程序 SocketTask 适配层
 * - headers: 请求级动态注入 token、版本号
 */
export const api = hc<AppType>(BASE_URL, {
  fetch: wxFetch,
  webSocket: (url, protocols) =>
    new WxWebSocket(url, protocols) as unknown as WebSocket,
  headers: () => ({
    Authorization: `Bearer ${wx.getStorageSync('token') || ''}`,
    'X-App-Version': wx.getAccountInfoSync().miniProgram.version,
  }),
})
```

这里没有直接写 `http://localhost:8787`，因为真机里的 `localhost` 指的是手机自己，不是你的电脑。开发期可以用局域网 IP、内网穿透、反向代理，或者只在微信开发者工具里配合"不校验合法域名"调试。

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
/**
 * 包装 wxFetch，加入 401 自动刷新 token 的拦截逻辑
 */
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
| 请求报 `URL is not defined` | `$url()` / `$ws()` 或 query 处理触达了 URL API | 在入口注入 `URL` / `URLSearchParams` polyfill |
| 请求报 `Headers is not defined` | Hono 客户端构造请求时用了 `Headers` | 在入口注入 `Headers` polyfill |
| 类型推导丢失 | 服务端没 `export type AppType` | 服务端用 `typeof app` 导出 |
| header 大小写问题 | 小程序自动小写 | 适配层统一小写 |
| 文件上传失败 | wx.request 不支持 multipart | 改用 `wx.uploadFile` 单独包装 |
| WebSocket 连接被拒 | 未配置 `socket合法域名` 或协议不是 `wss://` | 在公众平台后台配置 socket 域名 |
| `webSocket` option 类型报错 | Hono 版本较旧或类型定义不包含该 option | 升级 Hono，或先用全局 `WebSocket` polyfill |
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

## 十、一句话总结

> **Hono RPC 适配小程序的本质 = 补齐必要 Web API polyfill，把 `wx.request` 包装成 fetch-like，把 `wx.connectSocket` 包装成 WebSocket-like，再注入给 `hc`。**

只要这些边界处理好：

✅ JSON RPC 业务代码可以和浏览器侧高度一致
✅ 端到端类型安全可以保留
✅ 后续切换到 Taro / uni-app 时主要改适配层
✅ 可叠加重连、心跳、token 刷新等生产级能力

这是我认为比较干净、可维护的小程序请求层方案。如果你正在用 Hono 写后端，又有小程序入口，可以优先按这套结构落地，再按实际业务补上传、流式响应、鉴权刷新等专项能力。

> 后续我会继续写 "Hono + Cloudflare Workers + 小程序全栈实战"，把鉴权、推送、文件上传、灰度发布等都串起来，敬请期待。
