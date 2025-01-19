# 手写一个同步服务端时间的小工具

在前端开发的过程中，开发者经常会用到 new Date() 来获取当前时间，但是 new Date() 是获取的当前操作系统的时间，由于用户可以修改当前电脑时间，所以它是不准确的。

大部分情况下，用户修改当前电脑时间都没有什么问题，但是当我们需要根据服务端传递的数据时间与当前时间进行计算时，前端展示就会出错。同时，需要过期时间的数据（时间）存入前端缓存（ localStorage, IndexedDB ）中也是会出现问题。

这时候我们考虑使用服务器提供的时间，而不是前端时间。服务器每次进行数据交互时都会在响应头提供时间数据。我们可以通过该数据修正前端时间。

![sync-time](https://raw.githubusercontent.com/wsafight/personBlog/master/handwriting-tools/sync-time.png)

于是个人写了一个小工具 [sync-time](https://github.com/wsafight/sync-time) 。以 fetch 为例子:

```ts
import { sync, time, date } from 'sync-time'

async function getJSON() {
  let url = 'https://www.npmjs.com/search?q=';
  let response
  try {
    response = await fetch(url);

    // 响应头部通常会有 date 数据
    console.log(response.headers.get('date'))

    // 把响应头时间作为服务器时间，调用 sync 同步数据
    sync(response.headers.get('date'))
  } catch (error) {
  }
  return response.body
}

getJson()

// => 返回数字，即修正好的毫秒 getTime
time()
// 1670345143730

// 返回 Date，new Date(time())
date()
// Wed Dec 07 2022 00:46:47 GMT+0800 (中国标准时间)
```

源代码如下所示：

```ts
let diffMillisecond: number = 0

// 获取前端时间
const getCurrentTime = (): number => (new Date()).getTime();

// 同步时间
const sync = (time: Date | string): void => {
  // 没有传递时间，直接使用前端时间
  if (!time) {
    diffMillisecond = 0
    return
  }

  // 获取 UNIX 时间戳
  const syncTime = time instanceof Date ? time.getTime() : Date.parse(time)
  
  // 当前是 NaN，直接返回
  if (Number.isNaN(syncTime)) {
    return
  }

  // 获取两个时间的差值
  diffMillisecond = syncTime - getCurrentTime()
}

// 补差值并获取 UNIX 时间戳
const time = (): number => getCurrentTime() + diffMillisecond

const date = (): Date => new Date(time())

export {
  sync,
  time,
  date
}
```