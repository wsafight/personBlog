# 从 await-to-js 到 try-run-js

之前在做 code review 时候发现有同学使用 try catch 包装了一堆一步代码，于是我就觉得很奇怪，难道不应该只 catch
住可能出问题的代码吗？他告诉我 try catch 太细就是会出现内外作用域不一致，要提前声明变量。如

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

的确，一方面开发者不应该大范围包裹代码，另一方面提前声明变量会让代码不连贯同时也会打断思路。其中一个方式是直接使用原生 Promie 而不是 async。

```ts
fetchData().then((res) => {
}).catch((err) => {
});
```

这样对于单个异步请求当然没有任何问题，如果是具有依赖性的异步请求。虽然可以再 Promise 中返回另外的 Promise 请求，但是 catch
却只能有一个。

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

于是我开始找一些方法来帮助我们解决这个问题。

## await-to-js

[await-to-js](https://github.com/scopsy/await-to-js) 是一个辅助用户的处理异步错误的库。我们先来看看该库是如何解决我们问题的。

```ts
import to from 'await-to-js';

const [fetch1Err, fetch1Result]  = await to(fetchData());
if (fetch1Err) {
  // 错误操作或者终止
  // return
}

const [fetch2Err, fetch1Result]  = await to(fetchData2(fetch1Result));
if (fetch2Err) {
  // 错误操作或者终止
  // return
}
```



## 使用 try-run-js

## 解析 try-run-js 源码
