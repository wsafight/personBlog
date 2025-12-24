---
title: 从 await-to-js 到 try-run-js
published: 2022-12-18
description: 探讨了 try-catch 包裹异步代码时的作用域问题，介绍了 await-to-js 的解决方案以及作者编写的 try-run-js 库，提供更优雅的异步错误处理方式。
tags: [JavaScript, 工具开发]
category: 工程实践
draft: false
---

之前在做 code review 时候发现有同事使用 try catch 包装了一堆异步代码，于是个人就觉得很奇怪，难道不应该只 catch 可能出问题的代码吗？同事告诉我说 try catch 太细的话会出现内外作用域不一致，需要提前声明变量。

```ts
let res: Data[] = [];

try {
  res = await fetchData();
} catch (err) {
  // 错误操作或者终止
  // return
}

// 继续执行正常逻辑
```

的确，一方面开发者不应该大范围包裹非异常代码，另一方面提前声明变量会让代码不连贯同时也会打断思路。其中一个方式是直接使用原生 Promie 而不是 async。

```ts
fetchData().then((res) => {
}).catch((err) => {
});
```

这样对于单个异步请求当然没有任何问题，如果是具有依赖性的异步请求。虽然可以再 Promise 中返回另外的 Promise 请求，但是这样处理 catch 却只能有一个。

```ts
fetchData().then((res) => {
  // 业务处理
  return fetchData2(res);
}).then((res) => {
  // 业务处理
}).catch((err) => {
  // 只能做一个通用的错误处理了
});
```

如果需要多个 catch 处理，我们就需要这样写。

```ts
fetchData().then((res) => {
  // 业务处理
  return fetchData2(res);
}).catch((err) => {
  // 错误处理并且返回 null
  return null;
}).then((res) => {
  if (res === null) {
    return;
  }
  // 业务处理
}).catch((err) => {
  // 错误处理
});
```

这时候开发者也要考虑 fetchData2 会不会返回 null 的问题。于是个人开始找一些方法来帮助我们解决这个问题。

## await-to-js

[await-to-js](https://github.com/scopsy/await-to-js) 是一个辅助开发者处理异步错误的库。我们先来看看该库是如何解决我们问题的。

```ts
import to from "await-to-js";

const [fetch1Err, fetch1Result] = await to(fetchData());
if (fetch1Err) {
  // 错误操作或者终止
  // return
}

const [fetch2Err, fetch1Result] = await to(fetchData2(fetch1Result));
if (fetch2Err) {
  // 错误操作或者终止
  // return
}
```

源码非常简单。

```js
export function to(
  promise,
  errorExt,
) {
  return promise
    .then((data) => [null, data])
    .catch((err) => {
      if (errorExt) {
        const parsedError = Object.assign({}, err, errorExt);
        return [parsedError, undefined];
      }
      return [err, undefined];
    });
}
```

## 使用 try-run-js

看到 await-to-js 将错误作为正常流程的一部分，于是个人想到是不是能通过 try catch 解决一些异步代码问题呢？

我立刻想到了需要获取 DOM 节点的需求。现有框架都使用了数据驱动的思路，但是 DOM 具体什么时候渲染是未知的，于是个人想到之前代码，Vue 需要获取 ref 并进行回调处理。

```ts
function resolveRef(refName, callback, time: number = 1) {
  // 超过 10 次跳出递归
  if (time > 10) throw new Error(`cannot find ref: ${refName}`);
  // 
  const self = this;
  // 获取 ref 节点
  const ref = this.$refs[refName];
  if (ref) {
    callback(ref);
  } else {
    // 没有节点就下一次
    this.$nextTick(() => {
      resolveRef.call(self, refName, callback, time + 1);
    });
  }
}
```

当然了，上述代码的确可以解决此类的问题，在处理此类问题时候我们可以替换 ref 和 nextTick 的代码。于是 await-to-js 的逻辑下，个人开发了 [try-run-js](https://github.com/wsafight/try-run-js) 库。我们先看一下该库如何使用。

```ts
import tryRun from "try-run-js";

tryRun(() => {
  // 直接尝试使用正常逻辑代码
  // 千万不要添加 ?.
  // 代码不会出错而不会重试
  this.$refs.navTree.setCurrentKey("xxx");
}, {
  // 重试次数
  retryTime: 10,
  // 下次操作前需要的延迟时间
  timeout: () => {
    new Promise((resolve) => {
      this.$nextTick(resolve);
    });
  },
});
```

我们也可以获取错误数据和结果。

```ts
import tryRun from "try-run-js";

const getDomStyle = async () => {
  // 获取一步的
  const { error: domErr, result: domStyle } = await tryRun(() => {
    // 返回 dom 节点样式，不用管是否存在 ppt
    // 千万不要添加 ?.
    // 代码不会出错而返回 undefined
    return document.getElementById("domId").style;
  }, {
    // 重试次数
    retryTime: 3,
    // 返回数字的话，函数会使用 setTimeout
    // 参数为当前重试的次数，第一次重试 100 ms，第二次 200
    timeout: (time) => time * 100,
    // 还可以直接返回数字，不传递默认为 333
    // timeout: 333
  });

  if (domErr) {
    return {};
  }

  return domStyle;
};
```

当然了，该库也是支持返回元组以及 await-to-js 的 Promise 错误处理的功能的。

```ts
import { tryRunForTuple } from "try-run-js";

const [error, result] = await tryRunForTuple(fetchData());
```

## try-run-js 项目演进

try-run-js 核心在于 try catch 的处理，下面是关于 try-run-js 的编写思路。希望能对大家有一些帮助

### 支持 await-to-js

```ts
const isObject = (val: any): val is Object =>
  val !== null &&
  (typeof val === "object" || typeof val === "function");

const isPromise = <T>(val: any): val is Promise<T> => {
  // 继承了 Promise
  // 拥有 then 和 catch 函数，对应手写的 Promise
  return val instanceof Promise || (
    isObject(val) &&
    typeof val.then === "function" &&
    typeof val.catch === "function"
  );
};

const tryRun = async <T>(
  // 函数或者 promise
  promiseOrFun: Promise<T> | Function,
  // 配置项目
  options?: TryRunOptions,
): Promise<TryRunResultRecord<T>> => {
  // 当前参数是否为 Promise
  const runParamIsPromise = isPromise(promiseOrFun);
  const runParamIsFun = typeof promiseOrFun === "function";

  // 既不是函数也不是 Promise 直接返回错误
  if (!runParamIsFun && !runParamIsPromise) {
    const paramsError = new Error("first params must is a function or promise");
    return { error: paramsError } as TryRunResultRecord<T>;
  }

  if (runParamIsPromise) {
    // 直接使用 await-to-js 代码
    return runPromise(promiseOrFun as Promise<T>);
  }
};
```

### 执行错误重试

接下来我们开始利用 try catch 捕获函数的错误并且重试。

```ts
// 默认 timeout
const DEFAULT_TIMEOUT: number = 333

// 异步等待
const sleep = (timeOut: number) => {
  return new Promise<void>(resolve => {
    setTimeout(() => {
      resolve()
    }, timeOut)
  })
}

const tryRun = async <T>(
  promiseOrFun: Promise<T> | Function,
  options?: TryRunOptions,
): Promise<TryRunResultRecord<T>> => {
  const { retryTime = 0, timeout = DEFAULT_TIMEOUT } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // 当前第几次重试
  let currentTime: number = 0;
  // 是否成功
  let isSuccess: boolean = false;

  let result;
  let error: Error;

  while (currentTime <= retryTime && !isSuccess) {
    try {
      result = await promiseOrFun();
      // 执行完并获取结果后认为当前是成功的
      isSuccess = true;
    } catch (err) {
      error = err as Error;
      // 尝试次数加一
      currentTime++;

      // 注意这里，笔者在这里犯了一些错误
      // 如果没有处理好就会执行不需要处理的 await
      // 1.如果当前不需要重新请求（重试次数为 0），直接跳过
      // 2.最后一次也失败了(重试完了)也是要跳过的
      if (retryTime > 0 && currentTime <= retryTime) {
        // 获取时间
        let finalTimeout: number | Promise<any> = typeof timeout === "number"
          ? timeout
          : DEFAULT_TIMEOUT;
        
        // 如果是函数执行函数
        if (typeof timeout === "function") {
          finalTimeout = timeout(currentTime);
        }

        // 当前返回 Promise 直接等待
        if (isPromise(finalTimeout)) {
          await finalTimeout;
        } else {
          // 如果最终结果不是 number，改为默认数据
          if (typeof finalTimeout !== "number") {
            finalTimeout = DEFAULT_TIMEOUT;
          }
          // 这里我尝试使用了 NaN、 -Infinity、Infinity 
          // 发现 setTimeout 都进行了处理,下面是浏览器的处理方式
          // If timeout is an Infinity value, a Not-a-Number (NaN) value, or negative, let timeout be zero.
          // 负数，无穷大以及 NaN 都会变成 0
          await sleep(finalTimeout);
        }
      }
    }
  }

  // 成功或者失败的返回
  if (isSuccess) {
    return { result, error: null };
  }

  return { error: error!, result: undefined };
};
```

这样，我们基本完成了 try-run-js.

### 添加 tryRunForTuple 函数

这个就很简单了，直接直接 tryRun 并改造其结果：

```ts
const tryRunForTuple = <T>(
  promiseOrFun: Promise<T> | Function,
  options?: TryRunOptions): Promise<TryRunResultTuple<T>> => {
  return tryRun<T>(promiseOrFun, options).then(res => {
    const { result, error } = res
    if (error) {
      return [error, undefined] as [any, undefined]
    }
    return [null, result] as [null, T]
  })
}
```

代码都在 [try-run-js](https://github.com/wsafight/try-run-js) 中，大家还会在什么情况下使用 try-run-js 呢？同时也欢迎各位提交 issue 以及 pr。

## 参考资料

[await-to-js](https://github.com/scopsy/await-to-js)

[try-run-js](https://github.com/wsafight/try-run-js)
