---
title: 聊聊前端框架的未来 Signals
published: 2023-10-07
description: 探讨了前端框架的未来发展趋势，特别是聚焦于 Signals 在前端框架中的应用。Signals 是一种新的状态管理机制，它提供了一种高效、灵活且可预测的方式来处理前端应用中的状态变化。
tags: [性能优化, 框架]
category: 前端框架
draft: false
---

> Signals 在目前前端框架的选型中遥遥领先！

国庆节前最后一周在 Code Review 新同学的 React 代码，发现他想通过 memo 和 useCallback 只渲染被修改的子组件部分。事实上该功能在 React 中是难以做到的。因为 React 状态变化后，会重新执行 render 函数。也就是在组件中调用 setState 之后，整个函数将会重新执行一次。

React 本身做不到。但是基于 Signals 的框架却不会这样，它通过自动状态绑定和依赖跟踪使得当前状态变化后仅仅只会重新执行用到该状态代码块。

个人当时没有过多的解释这个问题，只是匆匆解释了一下 React 的渲染机制。在这里做一个 Signals 的梳理。

## 优势

对比 React，基于 Signals 的框架状态响应粒度非常细。这里以 Solid 为例：

```js
import { createSignal, onCleanup } from "solid-js";

const CountingComponent = () => {
  // 创建一个 signal
  const [count, setCount] = createSignal(0);

  // 创建一个 signal
  const [count2] = createSignal(666);

  // 每一秒递增 1
  const interval = setInterval(() => {
    setCount((c) => c + 1);
  }, 1000);

  // 组件销毁时清除定时器
  onCleanup(() => clearInterval(interval));

  return (
    <div>
      <div>
        count: {count()}
        {console.log("count is", count())}
      </div>
      <div>
        count2: {count2()}
        {console.log("count2 is", count2())}
      </div>
    </div>
  );
};
```

上面这段代码在 count 单独变化时，只会打印 count，压根不会打印 count2 数据。

控制台打印如下所示：

- count is 0
- count2 is 666
- count is 1
- count is 2
- ...

从打印结果来看，Solid 只会在最开始执行一次渲染函数，后续仅仅只会渲染更改过的 DOM 节点。这在 React 中是不可能做到的，React 是基于视图驱动的，状态改变会重新执行整个渲染函数，并且 React 完全无法识别状态是如何被使用的，开发者甚至可以通过下面的代码来实现 React 的重新渲染。

```js
const [, forceRender] = useReducer((s) => s + 1, 0);
```

除了更新粒度细之外，使用 Signals 的框架心智模型也更加简单。其中最大的特点是：开发者完全不必在意状态在哪定义，也不在意对应状态在哪渲染。如下所示：

```js
import { createSignal } from "solid-js";

// 把状态从过组件中提取出来
const [count, setCount] = createSignal(0);
const [count2] = createSignal(666);

setInterval(() => {
  setCount((c) => c + 1);
}, 1000);

// 子组件依然可以使用 count 函数
const SubCountingComponent = () => {
  return <div>{count()}</div>;
};

const CountingComponent = () => {
  return (
    <div>
      <div>
        count: {count()}
        {console.log("count is", count())}
      </div>
      <div>
        count2: {count2()}
        {console.log("count2 is", count2())}
      </div>
      <SubCountingComponent />
    </div>
  );
};
```

上述代码依然可以正常运行。因为它是基于状态驱动的。开发者在组件内使用 Signal 是本地状态，在组件外定义 Signal 就是全局状态。

Signals 本身不是那么有价值，但结合派生状态以及副作用就不一样了。代码如下所示：

```js
import {
  createSignal,
  onCleanup,
  createMemo,
  createEffect,
  onMount,
} from "solid-js";

const [count, setCount] = createSignal(0);

setInterval(() => {
  setCount((c) => c + 1);
}, 1000);

// 计算缓存
const doubleCount = createMemo(() => count() * 2);

// 基于当前缓存
const quadrupleCount = createMemo(() => doubleCount() * 2);

// 副作用
createEffect(() => {
  // 在 count 变化时重新执行 fetch
  fetch(`/api/${count()}`);
});

const CountingComponent = () => {
  // 挂载组件时执行
  onMount(() => {
    console.log("start");
  });

  // 销毁组件时执行
  onCleanup(() => {
    console.log("end");
  });

  return (
    <div>
      <div>Count value is {count()}</div>
      <div>doubleCount value is {doubleCount()}</div>
      <div>quadrupleCount value is {quadrupleCount()}</div>
    </div>
  );
};
```

从上述代码可以看到，派生状态和副作用都不需要像 React 一样填写依赖项，同时也将副作用与生命周期分开(代码更好阅读)。

## 实现机制

细粒度，高性能，同时还没有什么限制。不愧被誉为前端框架的未来。那么它究竟是如何实现的呢？

本质上，Signals 是一个在访问时跟踪依赖、在变更时触发副作用的值容器。

这种基于响应性基础类型的范式在前端领域并不是一个特别新的概念：它可以追溯到十多年前的 Knockout observables 和 Meteor Tracker 等实现。Vue 的选项式 API 也是同样的原则，只不过将基础类型这部分隐藏在了对象属性背后。依靠这种范式，Vue2 基本不需要优化就有非常不错的性能。

### 依赖收集

React useState 返回当前状态和设置值函数，而 Solid 的 createSignal 返回两个函数。即：

```TypeScript
type useState = (initial: any) => [state, setter];

type createSignal = (initial: any) => [getter, setter];
```

为什么 createSignal 要传递 getter 方法而不是直接传递对应的 state 值呢？这是因为框架为了具备响应能力，Signal 必须要收集谁对它的值感兴趣。仅仅传递状态是无法提供 Signal 任何信息的。而 getter 方法不但返回对应的数值，同时执行时创建一个订阅，以便收集所有依赖信息。

### 模版编译

要保证 Signals 框架的高性能，就不得不结合模版编译实现该功能，框架开发者通过模版编译实现动静分离，配合依赖收集，就可以做到状态变量变化时点对点的 DOM 更新。所以目前主流的 Signals 框架没有使用虚拟 DOM。而基于虚拟 DOM 的 Vue 目前依靠编译器来实现类似的优化。

下面我们先看看 Solid 的模版编译：

```js
const CountingComponent = () => {
  const [count, setCount] = createSignal(0);
  const interval = setInterval(() => {
    setCount((c) => c + 1);
  }, 1000);

  onCleanup(() => clearInterval(interval));
  return <div>Count value is {count()}</div>;
};
```

对应编译后的的组件代码。

```js
const _tmpl$ = /*#__PURE__*/ _$template(`<div>Count value is `);

const CountingComponent = () => {
  const [count, setCount] = createSignal(0);
  const interval = setInterval(() => {
    setCount((c) => c + 1);
  }, 1000);

  onCleanup(() => clearInterval(interval));
  return (() => {
    const _el$ = _tmpl$(),
      _el$2 = _el$.firstChild;
    _$insert(_el$, count, null);
    return _el$;
  })();
};
```

- 执行 \_tmpl$ 函数，获取对应组件的静态模版
- 提取组件中的 count 函数，通过 \_$insert 将状态函数和对应模版位置进行绑定
- 调用 setCount 函数更新时，比对一下对应的 count，然后修改对应的 \_el$ 对应数据

## 其他

大家可以看一看使用 Signals 的主流框架：

- [Vue Ref](https://cn.vuejs.org/api/reactivity-core.html#ref)
- [Angular Signals](https://angular.io/guide/signals)
- [Preact Signals](https://preactjs.com/guide/v10/signals/)
- [Solid Signals](https://www.solidjs.com/docs/latest/api#createsignal)
- [Qwik Signals](https://qwik.builder.io/docs/components/state/#usesignal)
- [Svelte 5(即将推出)](https://svelte.dev/blog/runes)

不过目前来看 React 团队可能不会使用 Signals。

- Signals 性能很好，但不是编写 UI 代码的好方式
- 计划通过编译器来提升性能
- 可能会添加类似 Signals 的原语

PREACT 作者编写了 [@preact/signals-react](https://www.npmjs.com/package/@preact/signals-react) 为 React 提供了 Signals。不过个人不建议在生产环境使用。

篇幅有限，后续个人会解读 [@preact/signals-core](https://www.npmjs.com/package/@preact/signals-core) 的源码。

## 参考资料

- [精读《SolidJS》](https://juejin.cn/post/7137100589208436743?searchId=2023100323265799EF4CF92C95049F6276)

- [Solid.js](https://www.solidjs.com/)

- [Introducing runes](https://svelte.dev/blog/runes)