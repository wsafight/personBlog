---
title: 浏览器预加载基础：link rel、prefetch 与 prerender
published: 2026-05-31
description: 梳理浏览器 speculative loading 的基础能力，包括 dns-prefetch、preconnect、preload、modulepreload、prefetch、prerender、fetchpriority 和 Speculation Rules API，帮助理解 Quicklink、instant.page 与框架预取背后的技术原理。
tags: [性能优化, Web性能, 预加载, HTML, 浏览器]
category: 前端
draft: false
---

## 写在前面

Web 性能优化里有一组很容易混淆的能力：预解析、预连接、预加载、预取、预渲染。

它们都在「提前做事」，但提前做的事情完全不同。有的只是解析 DNS，有的会建立连接，有的会下载当前页资源，有的会提前拿下一页 HTML，还有的会让未来页面在后台执行到接近可见状态。

浏览器提供的基础能力主要包括：

- `<link rel="dns-prefetch">`
- `<link rel="preconnect">`
- `<link rel="preload">`
- `<link rel="modulepreload">`
- `<link rel="prefetch">`
- `<link rel="prerender">`（已废弃，现代浏览器改用 Speculation Rules API）
- `fetchpriority`
- Speculation Rules API

这些能力经常被混在一起讨论，但它们解决的问题并不一样。

一句话概括：

> `preload` 优化当前页，`prefetch` 优化未来页，`prerender` 让未来页提前执行到接近可见状态。

理解这些能力，才能判断一个性能优化方案到底是在优化当前页，还是在优化下一次导航。

---

## 从网络瀑布看预加载

浏览器加载资源，大致会经历这些阶段：

```text
DNS 查询
  ↓
TCP 连接
  ↓
TLS 握手
  ↓
HTTP 请求
  ↓
下载资源
  ↓
解析 / 编译 / 执行 / 渲染
```

不同预加载能力切入的位置不同：

| 能力 | 提前做什么 | 典型用途 |
|:--|:--|:--|
| `dns-prefetch` | DNS 查询 | 提前解析第三方域名 |
| `preconnect` | DNS + TCP + TLS | 提前建立关键跨域连接 |
| `preload` | 当前页关键资源下载 | LCP 图片、关键字体、关键 CSS/JS |
| `modulepreload` | 模块脚本下载、解析、编译 | ESM 入口和依赖模块 |
| `prefetch` | 未来可能需要的资源或文档 | 下一页 HTML、下一路由 chunk |
| `prerender` | 未来页面的加载、执行、渲染 | 高确定性的下一步页面 |
| `fetchpriority` | 调整资源相对优先级 | 提升 LCP 图片，降低非关键资源 |

所以不要把它们都理解成「提前下载」。有些只是提前连线，有些会下载但不执行，有些甚至会让页面在后台运行。

---

## dns-prefetch：只提前做 DNS

`dns-prefetch` 是最轻的提示：

```html
<link rel="dns-prefetch" href="https://cdn.example.com">
```

它只告诉浏览器：这个域名后面可能会用到，可以先做 DNS 解析。

适合：

- 第三方 CDN
- 统计脚本域名
- 字体服务域名
- 后续页面大概率会请求的外部 origin

不适合：

- 同源资源，因为当前页面通常已经有连接
- 大量第三方域名，因为浏览器和网络栈也有成本

`dns-prefetch` 的收益不大，但成本也低。对不确定是否要真正连接的第三方域名，它比 `preconnect` 更保守。

---

## preconnect：提前完成连接握手

`preconnect` 比 `dns-prefetch` 更进一步：

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

它会提示浏览器提前完成连接准备。对于 HTTPS 请求，通常包括：

- DNS
- TCP
- TLS

这能省掉首次跨域请求前的一段等待时间。

适合：

- 首屏必定使用的字体源
- 首屏关键图片所在 CDN
- 首屏必须请求的 API origin

要注意：

- 不要对很多第三方域名都 `preconnect`
- 后续请求如果会走 CORS 模式，`preconnect` 也要匹配 `crossorigin`，典型例子是字体、`fetch`、module script，或显式带 `crossorigin` 的图片
- 如果资源不一定会用到，`preconnect` 可能浪费连接槽和电量

经验上，`preconnect` 应该只给最关键的 1-3 个外部 origin。

---

## preload：当前页马上要用的资源

`preload` 是当前页优化工具，不是下一页预取工具。

```html
<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>
```

它告诉浏览器：这个资源当前页很快就要用，请提前下载。

常见场景：

- LCP 图片
- 关键字体
- 首屏必需 CSS
- 稍后由 JS 动态插入、但当前页一定会用的脚本或资源

`preload` 必须认真写 `as`：

```html
<link rel="preload" href="/hero.webp" as="image" fetchpriority="high">
<link rel="preload" href="/app.css" as="style">
<link rel="preload" href="/api/config" as="fetch" crossorigin>
```

`as` 的作用不只是描述资源类型。它会影响：

- 请求优先级
- 缓存匹配
- Content Security Policy
- Accept 请求头

`preload` 最常见的问题是滥用。你以为是在加速，实际可能是在和浏览器调度器抢资源。

不要 preload：

- 不一定会用到的资源
- 很晚才用到的资源
- 大量图片
- 已经会被浏览器很早发现的 CSS/JS

如果 preload 后几秒内没有被使用，浏览器通常会在 DevTools 里给出警告。

---

## modulepreload：ESM 时代的脚本预热

如果你要预加载 JavaScript module，优先考虑 `modulepreload`：

```html
<link rel="modulepreload" href="/assets/app.js">
```

它和普通 `preload as="script"` 的差异在于：浏览器知道这是一个模块脚本，可以提前处理模块相关工作。

这通常包括：

- 下载 module script
- 按模块脚本规则处理
- 可能继续获取依赖模块
- 提前解析、编译

依赖模块自动预取是浏览器优化，不应该当成所有浏览器里的强保证。如果你要确保依赖也被提前准备，应该为依赖模块分别声明 `modulepreload`。构建工具和框架经常自动生成这些标签，比如 Vite、Rollup、现代 SSR 框架等。手写时要谨慎，因为模块图经常由构建产物决定。

如果你发现页面里有：

```html
<link rel="modulepreload" crossorigin href="/_astro/client.xxxxx.js">
```

这通常是框架或构建工具在帮你提前准备客户端入口。

---

## prefetch：未来可能需要的资源

`prefetch` 针对未来，而不是当前页关键路径。

```html
<link rel="prefetch" href="/posts/prefetch">
```

它告诉浏览器：这个资源可能会在之后用到，请在合适的时候低优先级获取。

适合：

- 下一页 HTML
- 下一路由 JS chunk
- 用户 hover 后大概率进入的页面
- 多步骤流程的下一步资源

不适合：

- 当前页首屏关键资源
- 可能触发状态变更的 URL
- 大量低概率链接
- 带一次性 token 的 URL

`prefetch` 的关键是「低优先级」和「未来可能」。如果你已经确定当前页马上要用，那应该考虑 `preload`，不是 `prefetch`。

很多库做的事情，本质上就是动态插入：

```js
const link = document.createElement('link')
link.rel = 'prefetch'
link.href = '/next-page'
document.head.appendChild(link)
```

instant.page 在 hover 或 touchstart 后插入类似的 `<link rel="prefetch">`。Quicklink 则在链接进入视口、浏览器空闲后插入或 fallback 到 `fetch/XHR`。

和 `preload` 不同，`prefetch` 的 `as` 不是关键配置；不要把它理解成和 `preload as="..."` 一样的缓存匹配和优先级声明。

---

## prerender：提前把页面跑起来

`prerender` 比 `prefetch` 激进得多。

`prefetch` 更像「提前下载」。`prerender` 更像「提前打开一个隐藏页面」。

这意味着它可能会：

- 下载 HTML
- 下载子资源
- 解析 CSS/JS
- 执行 JavaScript
- 构建 DOM
- 渲染页面
- 等用户真正导航时直接激活

如果用户真的进入目标页面，体验会非常快。但风险也很明显：

- 统计代码可能提前上报
- 登录态逻辑可能提前执行
- WebSocket、音视频、定时器等副作用要处理
- 页面可能提前占用 CPU、内存、网络
- 不适合支付、退出登录、删除、下单等路径

老的写法是：

```html
<link rel="prerender" href="/checkout/step-2">
```

但 `rel="prerender"` 已经废弃：Chrome 早已停止支持传统全页预渲染，会把它降级为 NoState Prefetch 或直接忽略，其他浏览器也基本不再实现。现代做法是使用 Speculation Rules API。

---

## Speculation Rules API：现代文档预取与预渲染

Speculation Rules API 用 JSON 规则声明哪些文档可以被 `prefetch` 或 `prerender`。

最简单的 list 规则：

```html
<script type="speculationrules">
{
  "prefetch": [
    {
      "source": "list",
      "urls": ["/posts/prefetch", "/archive"]
    }
  ]
}
</script>
```

如果下一步非常确定，可以使用 `prerender`：

```html
<script type="speculationrules">
{
  "prerender": [
    {
      "source": "list",
      "urls": ["/checkout/step-2"],
      "eagerness": "moderate"
    }
  ]
}
</script>
```

`prefetch` 与 `prerender` 的差异很关键：

| 能力 | 做到哪一步 | 风险 |
|:--|:--|:--|
| `prefetch` | 提前获取文档 | 主要是流量和服务器压力 |
| `prerender` | 提前加载、执行、渲染文档 | 可能触发 JS 副作用 |

Speculation Rules API 适合 MPA 导航，因为它面向 document URL，而不是某个子资源文件。SPA 路由里的 chunk、loader data，通常还是交给框架更准确。

需要注意的是：MDN 当前仍把 Speculation Rules API 标为实验性、非 Baseline。生产环境使用时要做渐进增强。

如果站点配置了 CSP，还要允许规则脚本。内联 `<script type="speculationrules">` 需要在 `script-src` 里放行 `'inline-speculation-rules'`，或者使用 hash / nonce。另一种做法是通过 `Speculation-Rules` 响应头引用外部 JSON 规则文件，并用 `application/speculationrules+json` 返回。

---

## 如何识别 prerender 状态

如果页面可能被 prerender，就要避免「页面还没真正展示就执行副作用」。

浏览器提供了检测方式：

```js
if (document.prerendering) {
  document.addEventListener('prerenderingchange', () => {
    startAnalytics()
  }, { once: true })
} else {
  startAnalytics()
}
```

也可以用性能数据观察激活时间。被预渲染的文档，其 `activationStart` 记录的是从开始预渲染到真正激活的间隔，因此大于 0：

```js
const nav = performance.getEntriesByType('navigation')[0]

if (nav.activationStart > 0) {
  console.log('This page was prerendered')
}
```

服务端也可以识别推测加载请求。Speculation Rules 发出的请求会带上相关请求头，例如用于表明 prefetch/prerender 目的的 `Sec-Purpose`：

```http
Sec-Purpose: prefetch
Sec-Purpose: prefetch;prerender
```

服务端可以据此调整日志、缓存策略或直接拒绝不适合推测加载的响应。普通 `<link rel="prefetch">` 请求也可能带 `Sec-Purpose: prefetch`，所以服务端判断时最好把它当成「这是推测加载请求」，不要只绑定到某一个前端 API。

这里的原则很简单：

- 页面展示前不要记一次真实 PV
- 页面展示前不要发业务关键请求
- 页面展示前不要打开不可逆连接
- 页面激活后再执行用户可见副作用

---

## fetchpriority：优先级提示，不是预加载

`fetchpriority` 经常和 preload 一起出现：

```html
<link rel="preload" href="/hero.webp" as="image" fetchpriority="high">
<img src="/hero.webp" fetchpriority="high" alt="">
```

它不是新的加载方式，而是给浏览器一个优先级提示。

可选值：

- `high`
- `low`
- `auto`

适合：

- 提升真正的 LCP 图片
- 降低非关键图片或脚本
- 配合 preload 表达「这个资源不只是要提前下，还很重要」

不适合：

- 所有图片都加 `high`
- 所有 preload 都加 `high`
- 用它修复错误的资源发现顺序

MDN 也提醒，`fetchpriority` 应该谨慎使用。浏览器本来就有复杂的优先级调度，过度干预反而可能拖慢页面。

---

## HTML link 与 HTTP Link Header

这些提示不一定只能写在 HTML 里。很多 `link rel` 也可以通过 HTTP `Link` 响应头发送：

```http
Link: <https://cdn.example.com>; rel="preconnect"
```

这种方式适合：

- CDN 边缘注入
- 服务端统一下发资源提示
- HTML 不方便改，但响应头可控

但也有代价：

- 规则离页面模板更远，维护成本更高
- 需要确保路径、资源版本和页面实际使用保持一致
- CDN、代理、框架可能对 Header 有自己的处理逻辑

我的建议是：页面级、业务相关的提示写在模板里；全站固定的跨域连接提示可以考虑响应头。

---

## 这些能力如何支撑上层库

理解这些基础能力后，再看上层库就很清楚了。

Quicklink 做的是：

```text
IntersectionObserver 找到可视区链接
  ↓
requestIdleCallback 等浏览器空闲
  ↓
Network Information API 避开慢网络和省流量
  ↓
link rel=prefetch / fetch / XHR 发起预取
```

instant.page 做的是：

```text
mouseover / touchstart 判断点击意图
  ↓
动态插入 link rel=prefetch
```

框架内置预取做的是：

```text
框架知道路由
  ↓
框架知道 chunk、loader、payload
  ↓
按路由模型预取最小必要资源
```

Speculation Rules 做的是：

```text
页面声明候选 URL
  ↓
浏览器按规则和自身策略执行 prefetch / prerender
```

所以，不同方案的差异不是「会不会预取」，而是：

- 什么时候触发
- 触发后用哪个底层能力
- 预取 HTML 还是资源图
- 谁负责判断网络、缓存和副作用

如果要进一步比较 Quicklink、instant.page、ForesightJS、框架内置预取和 Speculation Rules 的选型，可以继续看 [下一页预取方案选型](../prefetch/)。但这篇文章本身先把底层机制讲完整：知道底层能力的边界，才能判断上层方案到底适不适合自己的页面。

---

## 实战选择表

| 目标 | 优先考虑 |
|:--|:--|
| 提前解析第三方域名 | `dns-prefetch` |
| 首屏必定请求的第三方 origin | `preconnect` |
| 当前页关键字体、LCP 图片 | `preload` + 必要时 `fetchpriority` |
| 当前页 ESM 入口或模块图 | `modulepreload` |
| 用户可能进入的下一页 HTML | `prefetch` |
| 确定性非常强的下一步页面 | Speculation Rules `prerender` |
| SPA 路由跳转 | 框架内置 prefetch |
| MPA 内容列表页 | Quicklink / Speculation Rules prefetch |
| 全站轻量增强 | instant.page |

再简单一点：

```text
当前页要用 -> preload / modulepreload
下一页可能用 -> prefetch
下一页几乎确定会用 -> prerender
第三方连接慢 -> dns-prefetch / preconnect
资源优先级不对 -> fetchpriority
```

---

## 常见错误

### 把 preload 当 prefetch

`preload` 是当前页关键路径工具。拿它预加载下一页资源，通常会和当前页资源抢带宽。

下一页资源应该优先考虑 `prefetch`。

### 给太多域名 preconnect

`preconnect` 会提前占用连接资源。对所有第三方域名都加，不一定更快。

更稳妥的策略是：

- 最关键的跨域 origin 用 `preconnect`
- 低确定性的外部域名用 `dns-prefetch`

### prerender 页面有副作用

`prerender` 可能提前执行 JavaScript。任何会改变业务状态的逻辑都要推迟到页面激活后。

这类页面不要 prerender：

- 退出登录
- 删除资源
- 下单支付
- 消耗优惠券
- 写入真实访问记录

### 只看单页指标

预取优化的是下一次导航，不是当前页面首屏。

如果只看当前页 LCP，很可能看不到收益，甚至会因为额外请求看到轻微变差。应该单独测：

- 点击后下一页 TTFB
- 下一页 FCP/LCP
- prefetch cache 命中情况
- 额外流量和服务器请求数

---

## 总结

浏览器的预加载能力可以分成三层：

第一层是连接准备：`dns-prefetch` 和 `preconnect`。

第二层是资源获取与优先级提示：`preload`、`modulepreload`、`prefetch`、`fetchpriority`。

第三层是页面准备：Speculation Rules API 的 `prefetch` 和 `prerender`。

上层的 Quicklink、instant.page、ForesightJS 和框架预取，本质上都在组合这些能力：它们真正的价值不只是「发起预取」，而是判断何时预取、预取什么、如何避开风险。

我的实践原则是：

- 当前页关键资源，用 `preload`，少而准
- 第三方关键连接，用 `preconnect`，不要铺满
- 下一页低风险资源，用 `prefetch`
- 高确定性页面才考虑 `prerender`
- 框架应用优先用框架内置预取
- 所有推测加载都要验证真实收益和额外成本

预加载不是越多越好。它是在浏览器、网络和服务器之间借一部分空闲资源，换下一次导航更确定的响应速度。

## 参考资料

- [MDN: Speculative loading](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Speculative_loading)
- [MDN: Speculation Rules API](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API)
- [MDN: rel="preload"](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preload)
- [MDN: fetchpriority](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/fetchpriority)
- [MDN: dns-prefetch](https://developer.mozilla.org/docs/Web/Performance/Guides/dns-prefetch)
- [MDN: Link header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Link)
- [web.dev: Prefetching, prerendering, and service worker precaching](https://web.dev/learn/performance/prefetching-prerendering-precaching)
- [web.dev: Optimize resource loading with the Fetch Priority API](https://web.dev/articles/fetch-priority)
