---
title: 玩转 AbortController 控制器
published: 2022-06-18
description: 介绍了如何使用AbortController来管理异步操作，包括取消请求、移除绑定事件等，还展示了如何封装AbortController以实现更复杂的功能。
tags: [JavaScript, Web API]
category: 工程实践
draft: false
---

绝大部分情况，网络请求都是先请求先响应。但是某些情况下，由于未知的一些问题，可能会导致先请求的 api 后返回。最简单的解决方案就是添加 loading 状态，在所有请求都完成后才能进行下一次请求。

但不是所有的业务都可以采用这种方式。这时候开发者就需要对其进行处理以避免渲染错误数据。

## 使用“版本号”

我们可以使用版本号来决策业务处理以及数据渲染:

```ts
const invariant = (condition: boolean, errorMsg: string) => {
    if (condition) {
        throw new Error(errorMsg)
    }
}

let versionForXXXQuery = 0;

const checkVersionForXXXQuery = (currentVersion: number) => {
    // 版本不匹配，就抛出错误
    invariant(currentVersion !== versionForXXXQuery, 'The current version is wrong')
}

const XXXQuery = async () => {
    // 此处只能使用 ++versionForXXXQuery 而不能使用 versionForXXXQuery++
    // 否则版本永远不对应
    const queryVersion = ++versionForXXXQuery;

    // 业务请求
    checkVersion(queryVersion)
    // 业务处理
    // ？界面渲染


    // 业务请求
    checkVersion(queryVersion)
    // 业务处理
    // ？界面渲染
}
```

如此，先请求的 api 后返回就会被错误中止执行，但最终渲染到界面上的只有最新版本的请求。但是该方案对业务的侵入性太强。虽然我们可以利用 class 和 AOP 来简代码和逻辑。但对于开发来说依旧不友好。这时候我们可以使用 AbortController。

## 使用 AbortController

### AbortController 取消之前请求

话不多说，先使用 AbortController 完成上面相同的功能。

```ts
let abortControllerForXXXQuery: AbortController | null = null

const XXXQuery = async () => {
    // 当前有中止控制器,直接把上一次取消
    if (abortControllerForXXXQuery) {
        abortControllerForXXXQuery.abort()
    }

    // 新建控制器
    abortControllerForXXXQuery = new AbortController();

    // 获取信号
    const { signal } = abortControllerForXXXQuery
    
    const resA = await fetch('xxxA', { signal });
    // 业务处理
    // ？界面渲染

    const resB = await fetch('xxxB', { signal });
    // 业务处理
    // ？界面渲染
}
```

我们可以看到：代码非常简单，同时得到了性能增强，浏览器将提前停止获取数据（注：服务器依旧会处理多次请求，只能通过 loading 来降低服务器压力）。

### AbortController 移除绑定事件

虽然代码很简单，但是为什么需要这样添加一个 AbortController 类而不是直接通过添加 api 来进行中止网络请求操作呢？这样不是增加了复杂度吗？笔者开始也是这样认为的。到后面才发现。AbortController 类虽然较为复杂了，但是它是通用的，因此 AbortController 可以被其他 Web 标准和 JavaScript 库使用。

```ts
const controller = new AbortController()
const { signal } = controller

// 添加事件并传递 signal
window.addEventListener('click', () => {
    console.log('can abort')
}, { signal })

window.addEventListener('click', () => {
    console.log('click')
});

// 开始请求并且添加 signal
fetch('xxxA', { signal })

// 移除第一个 click 事件同时中止未完成的请求
controller.abort()
```

### 通用的 AbortController 

既然它是通用的，那是不是也可以终止业务方法呢。答案是肯定的。先来看看 AbortController 到底为啥能够通用呢？

AbortController 提供了一个信号量 signal 和中止 abort 方法,通过这个信号量可以获取状态以及绑定事件。

```ts
const controller = new AbortController();

// 获取信号量
const { signal } = controller;

// 获取当前是否已经执行过 abort，目前返回 false
signal.aborted

// 添加事件
signal.addEventListener('abort', () => {
    console.log('触发 abort')
})

// 添加事件
signal.addEventListener('abort', () => {
    console.log('触发 abort2')
})


// 中止 (不可以解构直接执行 abort，有 this 指向问题)
// 控制台打印 触发 abort，触发 abort2
controller.abort()

// 当前是否已经执行过 abort,返回 ture
signal.aborted

// 控制台无反应
controller.abort();
```

无疑，上述的事件添加了 abort 事件的监听。综上，笔者简单封装了一下 AbortController。Helper 类如下所示：

```ts
class AbortControllerHelper {
    private readonly signal: AbortSignal 

    constructor(signal: AbortSignal) {
        this.signal = signal
        signal.addEventListener('abort', () => this.abort())
    }

    /**
     * 执行调用方法，只需要 signal 状态的话则无需在子类实现
     */
    abort = (): void => {} 

    /**
     * 检查当前是否可以执行
     * @param useBoolean 是否使用布尔值返回
     * @returns 
     */
    checkCanExecution = (useBoolean: boolean = false): boolean => {
        const { aborted } = this.signal
        // 如果使用布尔值，返回是否可以继续执行
        if (useBoolean) {
            return !aborted
        }
        // 直接抛出异常
        if (aborted) {
            throw new Error('abort has already triggered');
        }
        return true
    }
}
```

如此，开发者可以添加子类继承 AbortControllerHelper 并放入 signal。然后通过一个 AbortController 中止多个乃至多种不同事件。

## 参考资料

[AbortController MDN](https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController)
