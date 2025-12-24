---
title: 从 UX 与 DX 来谈一谈 React SWR
published: 2019-11-23
description: 从用户体验(UX)和开发者体验(DX)两个角度，分析 React SWR 这个数据获取 Hook 库的设计理念，探讨它如何简化错误处理、加载状态管理和数据同步。
tags: [React, 用户体验]
category: 前端框架
draft: false
---

自从 9102 年初 react 推出了 Hook 之后，我就开始在私人项目中先行了。不得不说的是，react Hook 的确足够“跨时代”。大量的文章研读以及伴随着项目中组件的改造，对Hook 的优点，缺点，以及本身的机制也有一定的了解。

如果你是 Hook 初学者，建议先阅读 [ https://usehooks.com/]( https://usehooks.com/ )  以及 [Dan Abramov 的个人博客](  https://overreacted.io/ )。

伴随着 Hook 时代的带来，react 社区也是到来了无 Hook 不欢的时代。 如火如荼的封装。包括 axios 以及 immer 等库都未能“幸免”，被 Hook 包裹了一层而变成了 [axios-hooks](https://github.com/simoneb/axios-hooks) 以及 [use-immer](https://github.com/immerjs/use-immer)。但是却始终没有一个杀手级应用。

在我今天阅读 [精读《Hooks 取数 - swr 源码》]( https://juejin.im/post/5dc8d5b06fb9a04a81716be9 ) 时候，了解到这个 12天就拿到4000+ star 的杀手级应用 [swr]( https://github.com/zeit/swr )。既然大牛已经从 swr 源码来展开。那我就从 UX(用户体验) 以及 DX(开发者体验) 来聊一聊。

## 基础数据加载

作为一个开发者而言，始终面临着一个问题，究竟当前数据是否应该放入 状态管理库或者仅仅只在组件中使用？就个人开发而言，始终秉承着一个思想，如果一个数据，不会被两个及以上的不能直接通信的祖先组件使用。那么它就不配使用状态管理，用完便直接抛弃。不要因为多写一些代码而放弃简单性。

用  SWR  最基础的功能如下所示:

```jsx
import useSWR from 'swr'

function Profile () {
    
  const { data, error } = useSWR('/api/user', fetch)
  
  // 保镖模式（the Bouncer Pattern）， 后面处理正确业务逻辑
  if (error) return <div>failed to load</div>
  
  // 没有错误，且没有数据 只有可能是正常业务流程中的等待取数据
  if (!data) return <div>loading...</div>
  
  // 没有错误有数据，进行渲染
  return <div>hello {data.name}!</div>
}
```

所以我觉得如上代码十分切合 DX 的设计与思想。在取数据之前，取数据是一个 UI  展示，发生错误也是一个 UI  展示。仅仅 4 行代码，就囊括了 error, loading 以及正常业务的所有 UI  切换。在 数据没有获取之前，data 与 error 都是 undefined。进行 loading。在数据获取之后， data 与 error 两者必居其一。

如果你写过 Go 语言，一定对这种代码不陌生。

```go
val, err := myFunction( args... );

if err != nil {
  // handle error
  return
} 
// success

```

由于 Go 中有大量此类代码的处理，所以在 Go2 中有新的草案提出，这里就不进行深入讨论。不过对于任何语言和业务而言，错误处理设计都是非常重要的。这种代码在需要大量书写的 Go 语言中,是一种负担。但是，对于当前  SWR  而言，反而并不繁琐，具有更加清晰的状态切换。

## 自定义数据提取

对于用户而言，并不关心我们如何取得数据，但是对于开发者来说，形形色色的需求使得自定义配置不会是可选的，而是必需的。大到 vue, react 的平台(Weex, react native ) 适配。小到我们提供给他人的基础功能模块，都是需要对他人负责的。

例如，如果需要提供功能代码给别人用，通常就会这样写。

```js
const DEFAULT_CONFIG = {
  // 基础配置
  // ...
}

// 利用 Object.assign 后面配置来覆盖
const config = Object.assign({}, DEFAULT_CONFIG, config)

```

而在 SWR 中，在其中追加了全局配置:

```ts
  config = Object.assign(
    {},
    // 默认配置
    defaultConfig,
    // 全局配置  
    useContext(SWRConfigContext),
    // 当前组件配置
    config
  )
```

这里我们来介绍一下 fetcher 函数，接受传入的  key 值，返回一个 promise 或者数据。中间也可以结合各种库来进行数据处理。

```ts
import fetch from 'unfetch'

const fetcher = url => fetch(url).then(r => r.json())

function App () {
  const { data } = useSWR('/api/data', fetcher)
  // ...
}
```

```ts
import { request } from 'graphql-request'

const API = 'https://api.graph.cool/simple/v1/movies'
const fetcher = query => request(API, query)

function App () {
  const { data, error } = useSWR(
    `{
      Movie(title: "Inception") {
        releaseDate
        actors {
          name
        }
      }
    }`,
    fetcher
  )
  // ...
}
```

当时看到这里之前，我一度不能理解 useSWR 函数第一个参数叫 key 的原因。当使用 GraphQL时候，我终于知道，我还是 So young So simple。毕竟对 GraphQL 缺乏实战经验，所以往往会对不熟悉的技术产生遗漏。当然了，如果你参考过其他关于 api 的缓存的开源代码一定可以立即想到，缓存工作一定围绕着当前的 key 值。

如果你并不需要特殊处理，直接略过 fetcher 这个参数即可，就像基础功能版。当看到这里时，基本上我们可以判断在实际使用过程中，即使遇到了无法预料的业务情景，我们也可以通过我们的代码来解决掉问题。

## 多窗口同步功能

在使用  SWR  之后，如果我们在当前应用打开多个窗口或者选项卡。重新聚焦当前页面时候，无需手动或者在代码中重新刷新。SWR 会自动取得数据然后基于 React diff 进行渲染。

基于 DX 而言，这帮我们解决了一个痛点。在很多情况下，用户或基于两个数据页面的比对。或者 To C 应用，我们需要打开多个窗口或选项卡。而窗口或者 tab 切换时候，是否能够基于业务进行处理是值得思考的。

以下代码是判断当前文档是否可见，代码风格依然是保镖模式（the Bouncer Pattern）。

```ts
export default function isDocumentVisible(): boolean {
  if (
    typeof document !== 'undefined' &&
    typeof document.visibilityState !== 'undefined'
  ) {
    return document.visibilityState !== 'hidden'
  }
  // always assume it's visible
  return true
}

```

当然了，我们可以通过配置来决定是否使用该功能。

```tsx
// revalidateOnFocus = true：窗口聚焦时自动重新验证
const { data } = useSWR('dynamic-6', () => value++, {
  revalidateOnFocus: false
})

// 或者全局配置
function App () {
  return (
    <SWRConfig 
      value={{
        refreshInterval: 3000,
        fetcher: (...args) => fetch(...args).then(res => res.json()),
            revalidateOnFocus: false
      }}
    >
      <Dashboard />
    </SWRConfig>
  )
}
```

同时，值得一提的是，在多个窗口或者选项卡中，我们也可以配置间隔刷新来进行多窗口同步，不过这需要更多的网络资源。

## 快速导航(cache-then-network )

 在开发 web 应用程序时，性能都是必不可少的话题。  而事实上，缓存一定是提升web应用程序最有效有效方法之一，尤其是用户受限于网速的情况下。提升系统的响应能力，降低网络的消耗。当然，内容越接近于用户，则缓存的速度就会越快，缓存的有效性则会越高。 之前，我曾经写过 [前端 api 请求缓存方案](https://segmentfault.com/a/1190000018940422)。

但是如果使用 SWR,我们如果在系统内部进行导航或者按下后退按钮，我们直接会取得缓存版本数据。然后系统为了一致性，呈现了数据之后，会继续请求服务端，重新拉去数据。看到这里，我不禁要说一句，这很 ServiceWorker。类似于 cache-then-network 机制。

如果想要仔细研究 ServiceWorker 来帮助开发离线应用程序，可以学习 [The offline cookbook]( https://jakearchibald.com/2014/offline-cookbook/#cache-then-network ) 以及 [workbox 文档](  https://developers.google.com/web/tools/workbox )。

## 条件与依赖获取

如果一个语言（库）不能给你带来思想上的扩展，那么就不要学习它。SWR 在获取数据方面的确有他特殊之处。一方面是条件获取。

```js
// 条件获取
const { data } = useSWR(shouldFetch ? '/api/data' : null, fetcher)

// 条件获取获得 fetcher
const { data } = useSWR(() => shouldFetch ? '/api/data' : null, fetcher)

```

如果当前 shouldFetch 是 falsy,那么如果 useSWR 则不会进行请求。那么依赖获取则更加有趣。SWR 为了性能而确保了最大的并行性。按照代码解析如下

```js
import useSWR from 'swr'

function MyProjects () {
  const { data: user } = useSWR('/api/user')
  const { data: projects } = useSWR(
    () => '/api/projects?uid=' + user.id
  )

  if (!projects) return 'loading...'
  return 'You have ' + projects.length + ' projects'
}
```

如果按照平时书写代码的逻辑，如果后一个请求依赖前一个请求的响应，是需要promise 或者 async 与 await。但是在当前 SWR 框架中，却仅仅只需要把顺序写好。

由于 SWR 不是一个与编译结合的依赖库，所以不要想像的太过复杂，仅仅只是因为错误重试。当执行到 user.id 时候，因为 user 并不是一个对象，所以在当前请求之前会发生错误。然后再继续重试请求。等到第一次请求 user 取到之后，项目才会真正的向后端进行请求。

请求时机以 2 的指数性增长，代码如下:

```js
  const count = Math.min(opts.retryCount || 0, 8)
  const timeout =
    ~~((Math.random() + 0.5) * (1 << count)) * config.errorRetryInterval
  setTimeout(revalidate, timeout, opts)
```

上述也是带有随机性质的 [截断指数退避算法]( [https://baike.baidu.com/item/%E6%88%AA%E6%96%AD%E4%BA%8C%E8%BF%9B%E5%88%B6%E6%8C%87%E6%95%B0%E9%80%80%E9%81%BF%E7%AE%97%E6%B3%95](https://baike.baidu.com/item/截断二进制指数退避算法) )，当使用这种策略时候，客户端不断增加重试的延迟时间，而不是固定的延时。这样的话会更加符合现实世界的逻辑。当然我们也是可以控制重试的。

```js
useSWR(key, fetcher, {
  onErrorRetry: (error, key, option, revalidate, { retryCount }) => {
    if (retryCount >= 10) return
    if (error.status === 404) return

    // retry after 5 seconds
    setTimeout(() => revalidate({ retryCount: retryCount + 1 }), 5000)
  }
})
```

这种决策非常有趣，类似于全部的请求都是 promise.all 。我个人虽然认可这种模式，但是在极端情况下，会出现前置依赖仅仅延迟一点，后置请求延迟一轮的情况。即使在不那么极端的情况中，也有一定的时间损耗。

如果在可以商议的情况下，将多个取数 api 结合为一个多参数的 api 也不失为一种可行的解决方案。是否采用 SWR 依赖取数，这取决于项目是否能够接受这种时间损耗。

## 局部突变

 使用 mutate，您可以通过编程方式更新本地数据，同时重新验证并最终用最新数据替换它。 

```js
import useSWR, { mutate } from 'swr'

function Profile () {
  const { data } = useSWR('/api/user', fetcher)

  return (
    <div>
      <h1>My name is {data.name}.</h1>
      <button onClick={async () => {
        const newName = data.name.toUpperCase()
        // 请求更新名称
        await requestUpdateUsername(newName)
        // 先更新名称，后重新拉去数据验证
        mutate('/api/user', { ...data, name: newName })
      }}>Uppercase my name!</button>
    </div>
  )
}

// requestUpdateUsername 返回 200 无需验证。填写 new User
// 不过该方案仅仅只能修改无乐观锁的数据
mutate('/api/user', newUser, false)

// promise 返回更新的 user。直接更新
mutate('/api/user', requestUpdateUsername(newUser)) 

// 也可以返回 id 与乐观锁
const modifiedUser =  requestUpdateUsername(newUser).then(res => {
   return Object.assign({}, newUser, res)
})
// promise 返回更新的 user。直接更新
mutate('/api/user', modifiedUser) 
```

而是为当前的取数服务提供了修改的功能，使得 SWR 不单单是一个单纯的取数框架。如此以来，修改列表，编辑页面便都实现。（ 在没有仔细看该功能的情况下，我一度以为该功能类似 Meteor (Meteor 是一个实时框架， 在客户端也自带数据库，查询与更新都是先针对客户端数据库，后面再交由服务端来允许与拒绝，也就是失败补偿)但是后面却发现，该功能并不是我预想的）。

## 结语 

对比自身书写的 Hook 方法，不得不说的是，SWR 的确够硬核，作者虽然只解决了取数这一方面，但是无不彰显出作者的代码和业务的设计功底。在这个仅仅只有 4kb 的小库中，真正深度运用了 Hook，同时也给与了用户很大的便利。同时，我也相信该库一定对任何想要深入学习 Hook 的人有所帮助。

## 参考文档

[SWR]( https://swr.now.sh/ )

[精读《Hooks 取数 - swr 源码》]( https://juejin.im/post/5dc8d5b06fb9a04a81716be9)