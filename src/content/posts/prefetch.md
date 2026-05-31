---
title: 下一页预取方案选型：从轻量脚本到框架内置能力
published: 2026-05-31
description: 对比 Quicklink、instant.page、ForesightJS、swup、Guess.js、Astro、Next.js、Nuxt、React Router 和 Speculation Rules API，梳理下一页预取的触发策略、适用场景与生产风险。
tags: [性能优化, 前端, 预取, Web性能, 技术选型]
category: 前端
draft: false
---

## 写在前面

网页性能优化里有一类问题很容易被忽略：**当前页已经很快了，但用户点到下一页时仍然要等**。

对于内容站、电商列表页、文档站、活动页这类多页面应用，用户的下一步通常不是完全随机的。文章列表里的详情页、商品列表里的商品页、文档侧边栏里的下一篇，都是可以被提前猜到的导航目标。

围绕这个问题，前端生态里出现过不少方案：

- [Quicklink](https://getquick.link/)：链接进入视口后，在浏览器空闲时预取
- [instant.page](https://instant.page/)：用户 hover 或 touchstart 时预加载 HTML
- [ForesightJS](https://foresightjs.com/)：根据鼠标轨迹、键盘、触摸等信号判断交互意图
- swup Preload Plugin：给 swup/PJAX 站点提前填充页面缓存
- Guess.js：基于 analytics 数据预测下一条路由
- Astro、Next.js、Nuxt、React Router/Remix：框架内置路由预取
- Speculation Rules API：浏览器原生的 document prefetch/prerender

这篇文章不只介绍某一个库，而是把这些方案放在一起，看它们分别回答了三个问题：

- **什么时候预取**：看到链接、即将点击、路由渲染、还是由浏览器规则判断
- **预取什么**：HTML、route module、loader data、JS chunk，还是完整预渲染页面
- **如何控制风险**：省流量、慢网络、敏感链接、query string、服务器压力

---

## 下一页预取解决了什么

常见的页面性能指标，比如首屏渲染、LCP、交互延迟，大多关注「当前页面如何更快」。但用户在站内浏览时，体验是连续的：

```text
打开列表页 -> 浏览内容 -> 点击某个链接 -> 等详情页加载
```

如果详情页 HTML 可以在用户点击前就被放进缓存，那么这次导航就会明显更快。尤其在这些场景里收益会更稳定：

- **内容列表页**：博客、新闻、文档目录
- **电商列表页**：商品卡片进入视口后预取详情页
- **营销活动页**：首屏 CTA 或下一步页面路径固定
- **服务端渲染的多页面站点**：HTML 响应时间占比较高
- **边缘网络之外的动态页面**：后端响应有固定延迟

下一页预取的目标不是把全站链接都提前下载，而是只对「更可能被点击」的链接下手。不同方案对「更可能」的定义不一样：

- Quicklink 认为：**用户已经看到了这个链接**
- instant.page 认为：**用户已经 hover 或触摸这个链接**
- ForesightJS 认为：**用户的鼠标、键盘或触摸轨迹显示出交互意图**
- 框架内置预取认为：**框架知道这个链接对应哪些 route、data 和 chunk**
- Speculation Rules API 认为：**页面给浏览器声明了哪些目标可以预取或预渲染**

---

## 常见触发策略

下一页预取通常有四种触发策略：

| 策略 | 代表方案 | 优点 | 风险 |
|:--|:--|:--|:--|
| 视口触发 | Quicklink、Astro/Nuxt viewport | 提前量大，适合列表页 | 链接多时容易误请求 |
| 点击意图触发 | instant.page、ForesightJS、swup preload | 更接近真实点击，额外请求少 | 触发晚，慢后端收益有限 |
| 框架路由触发 | Next.js、Nuxt、React Router、Remix | 知道 route、data、chunk 关系 | 绑定框架，不能直接用于普通 MPA |
| 浏览器规则触发 | Speculation Rules API | 原生能力，可 prefetch/prerender | 兼容性和副作用要谨慎评估 |

以 Quicklink 这类视口触发方案为例，流程通常是：

```text
链接进入视口
    ↓
浏览器进入空闲时间
    ↓
检查网络状态与省流量设置
    ↓
发起低优先级预取
```

对应到浏览器能力上，大致是：

| 步骤 | 使用的能力 | 作用 |
|:--|:--|:--|
| 发现链接 | IntersectionObserver | 判断哪些链接进入视口 |
| 等待时机 | requestIdleCallback | 避免抢占首屏和交互资源 |
| 判断网络 | Network Information API | 避开慢连接和省流量模式 |
| 预取资源 | link rel=prefetch / XHR / fetch | 把目标 URL 提前放入缓存 |

而 instant.page 这类点击意图触发方案，流程更短：

```text
用户 hover / touchstart
    ↓
预加载目标 HTML
    ↓
用户完成点击
```

两者没有绝对高下。视口触发赢在提前量，点击意图触发赢在克制。框架预取则更进一步：它知道路由与代码分割结构，通常能比通用脚本预取得更准。

---

## 轻量脚本如何接入

如果只是给普通多页面站点加上预取能力，轻量脚本是最直接的入口。

Quicklink 适合「用户看到链接后就提前准备」：

```html
<script defer src="https://cdn.jsdelivr.net/npm/quicklink@3.0.1/dist/quicklink.umd.js"></script>
<script>
  window.addEventListener('load', () => {
    quicklink.listen()
  })
</script>
```

instant.page 适合「用户表现出点击意图后再准备」：

```html
<script src="https://instant.page/5.2.0" type="module" integrity="sha384-jnZyxPjiipYXnSU0ygqeac2q7CVYMbh84q0uHVRRxEtvFPiQYbXWUorga2aqZJ0z"></script>
```

无论选哪个脚本，都有两个细节值得保留：

1. 用 `defer` 或 `type="module"` 加载脚本，避免阻塞 HTML 解析。
2. 在 `load` 之后启动，让首屏资源和关键交互先完成。

第二点主要针对 Quicklink 这类需要主动初始化的脚本；instant.page 是 module 脚本，官方建议放在 `</body>` 前，加载后会自动绑定事件。生产环境如果从第三方地址加载，最好保留 `integrity`。

如果项目走 npm 包管理，Quicklink 可以这样导入：

```bash
npm install quicklink
```

然后在模块里导入：

```ts
import { listen } from 'quicklink'

window.addEventListener('load', () => {
  listen()
})
```

对于 Astro、Hugo、Jekyll、Rails、Laravel 这类服务端渲染或静态站点，通常只需要把初始化脚本放进全局布局即可。

---

## 控制范围比接入更重要

Quicklink 默认会观察 `document.body` 里的可视区链接。这很方便，但生产环境里我更建议缩小观察范围。

比如一个博客首页可以只观察正文列表：

```ts
quicklink.listen({
  el: document.getElementById('post-list'),
})
```

或者只观察某些链接：

```ts
quicklink.listen({
  el: document.querySelectorAll('a[data-prefetch]'),
})
```

这样做有三个好处：

- 不会预取导航栏、页脚、登录入口等低价值链接
- 降低移动端额外流量
- 让预取行为更容易解释和调试

如果页面链接很多，可以再加 `limit` 和 `throttle`：

```ts
quicklink.listen({
  el: document.getElementById('post-list'),
  limit: 6,
  throttle: 2,
})
```

`limit` 控制本轮最多预取多少个链接，`throttle` 控制并发数。对于列表页，这两个参数非常实用。

instant.page 则更适合用 HTML 属性控制：

```html
<body data-instant-whitelist>
  <a href="/posts/prefetch" data-instant>值得预加载的文章</a>
  <a href="/logout" data-no-instant>退出登录</a>
</body>
```

大型站点里，我更倾向显式标记高价值链接，而不是让脚本自动处理全页面所有链接。

---

## 该忽略哪些链接

预取不是免费的。它会消耗带宽、服务器资源，也可能触发不希望提前发生的副作用。

生产环境至少应该忽略这些 URL：

- 登录、退出、注册、支付、下单
- API、文件下载、压缩包、大媒体文件
- 带有一次性 token 或时间戳的链接
- 广告链接和统计跳转链接
- 只用于当前页锚点跳转的 hash 链接

Quicklink 的 `ignores` 支持字符串、正则和函数：

```ts
quicklink.listen({
  ignores: [
    /\/api\//,
    /\/logout/,
    /\/checkout/,
    uri => uri.includes('.zip'),
    uri => uri.includes('#'),
    (uri, elem) => elem.hasAttribute('data-no-prefetch'),
  ],
})
```

然后在模板里给敏感链接加标记：

```html
<a href="/logout" data-no-prefetch>退出登录</a>
```

我的经验是：**预取白名单比黑名单更适合大型站点**。也就是说，先只给高价值链接加 `data-prefetch`，等指标确认收益后再扩大范围。

---

## 单页面应用怎么用

通用预取脚本对多页面站点最自然。到了 SPA 里，预取最好接到路由层，因为框架通常更清楚一个页面需要哪些 JS chunk、loader data 和接口。

常见方式有三种：

1. 用框架自己的 `<Link>` 或 router prefetch
2. 每次路由切换完成后重新扫描当前页面链接
3. 对明确的下一步路由做程序化预取

如果选择第二种，记得保存 `quicklink.listen()` 返回的 reset 函数。SPA 路由切换后应该先清理旧的 `IntersectionObserver` 和已预取 URL 缓存，再对新页面 DOM 重新监听。

比如使用 Quicklink 时，你已经知道用户下一步大概率会进入某几个页面：

```ts
import { prefetch } from 'quicklink'

prefetch(['/settings', '/billing']).catch(error => {
  console.warn('prefetch failed', error)
})
```

如果使用 Next.js、Nuxt、React Router 或 Remix，优先使用框架内置预取。它们不只是抓 HTML，还能预取 route module、loader data、payload 或 RSC 数据。

如果想自己判断交互意图，可以把 ForesightJS 接到 `router.prefetch()`。这类组合比「全页面自动扫链接」更适合复杂 Web App。

---

## prefetch 与 prerender 的区别

大多数轻量脚本默认做的是 `prefetch`：提前请求资源，让后续导航尽量从缓存里拿。

部分方案也支持 `prerender`。比如 Quicklink 的 `prerender()` 会优先使用 Speculation Rules API：

```ts
quicklink.listen({
  prerender: true,
})
```

`prerender` 更激进，浏览器可能提前加载并渲染目标页面。它的收益更大，但成本也更高，更适合非常确定的下一步，比如：

- 登录后的固定落地页
- 多步骤表单的下一步
- 活动页唯一的主 CTA

如果只是普通列表页，不建议一上来就开 `prerender`。先用默认的低优先级 `prefetch`，确认指标和服务器压力之后再考虑更激进的策略。

---

## 与其他预取方案对比

提到下一页预取，Quicklink 不是唯一选择。前面「常见触发策略」一节已经把这些方案分成视口、点击意图、框架路由、浏览器规则四类。

这几类目标相同，都是让下一次导航更快；差异在于**触发时机、预取内容、误请求成本和控制粒度**。下面从源码和适用场景两个角度展开。

### 源码视角：Quicklink vs instant.page

先看最容易混淆的两类库：Quicklink 和 [instant.page](https://instant.page/)。

我对比了 `quicklink@3.0.1` 的 UMD 产物和 `instant.page@5.2.0` 的源码。两者并不是同一种策略。

| 维度 | Quicklink 3.0.1 | instant.page 5.2.0 |
|:--|:--|:--|
| 默认触发 | `IntersectionObserver` 观察进入视口的链接 | `mouseover` 延迟 65ms、`touchstart` |
| 启动时机 | `requestIdleCallback`，默认 timeout 2000ms | 用户事件触发后立即处理 |
| 预取实现 | 优先 `<link rel="prefetch">`，不支持时 fallback 到 `fetch/XHR` | 主要通过 `<link rel="prefetch">` 预取目标 HTML |
| 请求优先级 | `priority` 选项控制，默认偏低 | hover/touch 触发时设置 `fetchPriority="high"` |
| 网络保护 | 每次 `prefetch/prerender` 都检查 `Save-Data` 和 `2g` | 默认 hover/touch 不检查；viewport 模式才检查 |
| query string | 默认不特殊过滤，需要用 `ignores` 自己控制 | 默认不预取，除非显式允许 |
| 外链 | 默认同 hostname，可通过 `origins` 扩展 | 默认不预取，需显式允许 |
| 去重 | 内部 `Set` 记录已预取 URL | 内部 `Set` 记录已预取 URL |
| 并发与数量 | 支持 `limit`、`throttle`、`delay` | 没有显式并发/数量控制 |
| prerender | 支持 Speculation Rules API，不支持时 fallback 到 prefetch | 源码里没有 prerender，只做 prefetch |

Quicklink 的默认策略更像「提前准备」：

```text
用户看到链接 -> 浏览器空闲 -> 预取
```

instant.page 的默认策略更像「临门一脚」：

```text
用户悬停或触摸链接 -> 预加载 HTML -> 用户松开完成点击
```

所以两者的取舍很明确：

- Quicklink 更早、更主动，适合列表页、文档目录、文章推荐区
- instant.page 更克制、更接近真实点击意图，适合全站低成本增强

如果页面里有大量可视链接，Quicklink 必须靠 `el`、`limit`、`throttle`、`ignores` 控制范围。否则会产生很多用户最终不会访问的请求。

如果后端 HTML 响应比较慢，instant.page 默认的 65ms 悬停窗口可能不够。它更适合「HTML 本来就不慢，只想减少点击后的等待感」。

### 其他值得知道的方案

除了 Quicklink 和 instant.page，还有几类方案值得放进选型表。

| 方案 | 触发策略 | 预取内容 | 适合场景 | 注意点 |
|:--|:--|:--|:--|:--|
| **Quicklink** | viewport + idle | 页面 URL，可 prefetch/prerender | 内容站、文档站、列表页 | 主动性强，要控制范围 |
| **instant.page** | mouseover 65ms / touchstart / 可选 viewport | HTML document | 全站轻量增强、转化页 | 默认触发晚，不管 JS chunk |
| **ForesightJS** | 鼠标轨迹、键盘、触摸、滚动等意图预测 | 不直接限定，由你在 callback 中执行 | React/Vue/SPA 中精细控制预取 | 更像意图检测器，不是即插即用脚本 |
| **swup Preload Plugin** | hover、touch、focus、显式 preload | swup 页面缓存 | 已使用 swup 的 MPA/PJAX 站点 | 绑定 swup 生态，不适合普通页面直接用 |
| **Guess.js** | 基于 analytics 的路由概率预测 | 路由相关 bundle/chunk | 大型 SPA、已有访问数据的站点 | 构建和数据接入成本高，项目活跃度要评估 |
| **Astro prefetch** | tap、hover、viewport、load | 页面链接 | Astro 站点 | 已在框架内，通常优先于再接 Quicklink |
| **Next.js Link** | 视口内自动预取，hover 可提升优先级 | route、RSC payload、code/data | Next.js 应用 | 只在生产中生效，可用 `prefetch={false}` 控制 |
| **NuxtLink** | 默认 visibility，也支持 interaction | component、payload、middleware | Nuxt 应用 | 框架已处理网络状态和离线判断 |
| **React Router / Remix Link** | `none`、`intent`、`render`、`viewport` | route module 和 loader data | React Router/Remix 应用 | 根据路由数据模型工作，不是通用 MPA 脚本 |
| **Speculation Rules API** | 浏览器规则，支持 list/document rules | document prefetch 或 prerender | Chrome/Edge 等现代浏览器的渐进增强 | 原生能力强，但兼容性和副作用控制要评估 |

### ForesightJS：把「意图判断」拆出来

Quicklink 和 instant.page 自己负责发起预取；[ForesightJS](https://foresightjs.com/) 更像一个「用户意图检测器」。它根据鼠标轨迹、键盘导航、触摸、滚动等信号判断某个元素是否可能被交互，然后触发你传入的 callback：

```ts
import { ForesightManager } from 'js.foresight'

ForesightManager.instance.register({
  element: linkElement,
  callback: () => router.prefetch('/dashboard'),
})
```

它只回答「什么时候该预取」，预取什么由应用决定，因此适合知道「链接对应哪些 chunk、loader、接口」的 SPA。普通静态博客用它偏重；复杂 Web App 里它比纯 hover 预取更可控。

### swup Preload Plugin：PJAX 站点的配套选择

[swup](https://swup.js.org/) 是页面切换和 PJAX 导航库，它的 [Preload Plugin](https://swup.js.org/plugins/preload-plugin/) 把页面提前放进 swup cache。和 Quicklink 不同，它不是只缓存 HTML，而是服务于 swup 自己的导航生命周期，能理解 cache、动画、页面替换流程。

所以站点已经用 swup 做页面切换时，直接用它更自然；如果没用 swup，没必要只为预取引入整套 PJAX 导航。

### Guess.js：用访问数据预测下一页

[Guess.js](https://guess-js.github.io/) 更激进：它结合 analytics 数据预测用户从当前路由下一步可能访问哪里，再在构建或运行时安排预取。这类方案适合大型 SPA：

- 路由很多
- bundle/code splitting 很细
- 有足够的真实访问数据
- 构建系统能把路由和 chunk 映射起来

但接入成本也更高。对普通内容站来说，用 analytics 做预测往往比问题本身更复杂。

### 框架内置预取：能用就优先用

如果你在用现代框架，第一选择通常不是 Quicklink，而是框架自带的预取能力。

Astro 提供 `prefetch`，启用后可以通过 `data-astro-prefetch` 控制链接预取策略。策略包括 `tap`、`hover`、`viewport`、`load`，默认策略是 `hover`。这对当前这类 Astro 博客尤其相关：如果只是给站内文章链接加速，优先评估 Astro 自带方案，避免重复引入 Quicklink。

Next.js 的 `<Link>` 在生产环境会自动预取进入视口的路由，并根据静态/动态路由选择完整或部分预取。它知道 RSC payload、路由段、loading boundary，比通用脚本更了解 Next 应用结构。

Nuxt 的 `<NuxtLink>` 默认会在链接进入视口时预取，也可以切到 interaction。它还会避开离线、2g 和省流量等情况。

React Router 和 Remix 的 `<Link>` 有 `prefetch` 选项，常见值包括 `intent`、`render`、`viewport`。这类预取不是简单抓 HTML，而是围绕 route module 和 loader data 工作。

所以在框架应用里，选型原则很简单：

```text
框架知道路由和 chunk -> 优先框架内置预取
框架不知道或是普通 MPA -> 再考虑 Quicklink / instant.page
需要原生 prerender -> 评估 Speculation Rules API
```

### Speculation Rules API：未来的原生底座

[Speculation Rules API](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API) 是浏览器原生的文档预取和预渲染机制。它通过 JSON 规则告诉浏览器哪些页面可以提前 `prefetch` 或 `prerender`。

例如：

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

如果站点配置了 CSP，内联 `<script type="speculationrules">` 也要被允许。可以在 `script-src` 中加入 `'inline-speculation-rules'`，也可以用 hash / nonce；另一种方式是通过 `Speculation-Rules` 响应头引用外部 JSON 规则文件，并用 `application/speculationrules+json` 返回。

Quicklink 3.0.1 的 `prerender()` 已经会使用这个 API；如果浏览器不支持，它会 fallback 到 prefetch。

它的优势是原生、潜在收益高，尤其是 `prerender` 可以让下一页接近瞬开。但它也更危险：预渲染页面会执行更多生命周期逻辑，必须保证目标页面没有支付、退出登录、打点污染、状态变更等副作用。

因此 Speculation Rules 更适合确定性很强的路径，而不是全站无差别开启。

### 选型建议

可以用这个顺序做判断：

| 场景 | 推荐 |
|:--|:--|
| 静态博客、文档站、内容列表页 | Quicklink 或 Astro/Nuxt viewport 预取 |
| 想全站低成本增强，不想维护复杂规则 | instant.page |
| 已使用 Astro/Next/Nuxt/React Router/Remix | 优先框架内置预取 |
| 已使用 swup 做 PJAX 页面切换 | swup Preload Plugin |
| SPA 里想根据鼠标轨迹或键盘意图预取 | ForesightJS |
| 大型 SPA，有 analytics 数据和复杂 code splitting | Guess.js |
| 只有一个非常确定的下一步页面 | Speculation Rules API prerender |

我的倾向是：**先用框架内置能力，其次用 instant.page 做低风险增强，再用 Quicklink 处理高价值内容区**。

其中 Quicklink 的优势在于「提前量」和「可控性」。当你能明确指出页面里哪些链接值得预取时，它比 hover 型方案更容易拿到稳定收益。

---

## 如何验证它真的有效

接入任何预取方案后，都不要只看「感觉变快了」。至少做一次前后对比。

### Chrome DevTools

打开 Network 面板后，可以观察两件事：

- 是否出现 `prefetch`、`fetch`、Speculation Rules 或框架预取请求
- 点击链接后，目标页面是否命中 prefetch cache

官方测量示例中，一个未优化的商品详情页加载约 2.5 秒；接入 Quicklink 后，命中预取缓存的请求约 3ms。这里的 3ms 是从缓存读取文档的时间，不是页面完整可交互时间，但足以说明导航前预取的收益。

### WebPageTest

如果要更接近真实设备，可以用 WebPageTest 脚本模拟：

```text
logData 0
navigate https://example.com/
logData 1
execAndWait document.querySelector('a').click()
```

第一步不记录首页指标，只记录点击进入下一页后的指标。这样才能测到预取对「下一次导航」的影响。

### RUM

真实用户监控里，可以关注：

- 下一页的 FCP / LCP 是否下降
- HTML 文档响应时间是否下降
- 站内连续访问的页面是否更快
- 移动网络下额外流量是否可接受

实验室工具适合确认机制是否生效，RUM 才能回答「对真实用户是否值得」。

---

## 适用边界

下一页预取不是万能性能药。它只是把未来可能需要的资源提前下载或预渲染，前提是你能相对准确地判断用户下一步。

这些场景适合使用：

- 用户路径相对明确
- 页面之间以真实 URL 导航
- 目标页面可以被缓存
- 服务器能承受额外预取请求
- 页面内容不依赖一次性参数

这些场景要谨慎：

- 用户行为高度随机
- 链接指向大量第三方站点
- 页面会触发计费、状态变更或统计副作用
- 站点靠广告点击计费
- 大量链接都包含临时 session、timestamp、签名参数

还有一个浏览器层面的现实问题：现代浏览器正在推进 double-keyed HTTP cache。它会按顶层站点隔离缓存，减少跨站缓存复用带来的隐私风险。这意味着同源导航收益最稳定，跨源预取的收益不能过度期待。

所以，最稳妥的落点仍然是：**同站内、可缓存、可预测的下一页导航**。

---

## 生产配置模板：保守优先

下面是一份 Quicklink 的保守配置，适合作为内容站或文档站的起点：

```ts
window.addEventListener('load', () => {
  const container = document.querySelector('[data-prefetch-root]')

  if (!container) return

  quicklink.listen({
    el: container,
    limit: 8,
    throttle: 2,
    timeout: 2500,
    ignores: [
      /\/api\//,
      /\/login/,
      /\/logout/,
      /\/admin/,
      /\/checkout/,
      uri => uri.includes('#'),
      uri => /\.(zip|pdf|mp4|mov|png|jpe?g|webp|avif)$/i.test(uri),
      (uri, elem) => elem.hasAttribute('data-no-prefetch'),
    ],
  })
})
```

页面模板里只包住值得预取的区域：

```html
<main data-prefetch-root>
  <article>
    <a href="/posts/prefetch">下一页预取方案选型</a>
  </article>
</main>
```

如果想更严格，可以用前面「控制范围」一节提到的白名单做法：Quicklink 只观察 `a[data-prefetch]`，instant.page 用 `data-instant-whitelist` 模式。核心原则一样：先只处理高价值、可缓存、无副作用的链接，确认收益后再扩大范围。

---

## 总结

下一页预取的关键不是某个库的 API 多复杂，而是你是否选对了触发时机：

- 视口触发：提前量大，适合内容列表，但要控制请求数量
- 点击意图触发：更克制，适合全站增强，但对慢后端帮助有限
- 框架路由触发：最懂 chunk 和 data，框架应用应优先使用
- 原生预渲染：收益最大，风险也最高，只适合确定性路径

在这些方案里，Quicklink 的定位是：**在普通 MPA 里，用可视区和空闲时间提前准备用户可能点击的下一页**。

它最适合放在多页面站点、内容站、文档站、电商列表页这类「下一步可预测」的地方。

我的建议是：如果框架已经有内置预取，先用框架能力；如果只是想全站轻量增强，先试 instant.page；如果有明确的高价值内容区，再用 Quicklink 控制范围、数量和并发；如果下一步路径极其确定，再评估 Speculation Rules API 的 prerender。

预取的本质是用一点点空闲资源，换取下一次点击的确定性。技术选型越贴近用户真实路径，收益越稳定。

## 参考资料

- [Quicklink 官网](https://getquick.link/)
- [Quicklink API](https://getquick.link/api/)
- [Quicklink Approach](https://getquick.link/approach/)
- [Measuring impact of Quicklink in sites](https://getquick.link/measure/)
- [Quicklink 3.0.1 UMD 源码](https://cdn.jsdelivr.net/npm/quicklink@3.0.1/dist/quicklink.umd.js)
- [instant.page 官网](https://instant.page/)
- [instant.page 5.2.0 源码](https://instant.page/5.2.0)
- [instant.page Intensity](https://instant.page/intensity)
- [instant.page Pages not preloaded](https://instant.page/blacklist)
- [instant.page Technical details](https://instant.page/tech)
- [ForesightJS](https://foresightjs.com/)
- [swup Preload Plugin](https://swup.js.org/plugins/preload-plugin/)
- [Guess.js](https://guess-js.github.io/)
- [Astro Prefetch](https://docs.astro.build/en/guides/prefetch/)
- [Next.js Prefetching](https://nextjs.org/docs/app/guides/prefetching)
- [NuxtLink Prefetch](https://nuxt.com/docs/4.x/api/components/nuxt-link#prefetch-links)
- [React Router Link prefetch](https://reactrouter.com/api/components/Link#prefetch)
- [Speculation Rules API](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API)
