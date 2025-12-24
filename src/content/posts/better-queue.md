---
title: 使用 better-queue 管理复杂的任务
published: 2021-08-24
description: 介绍了如何使用better-queue库来管理复杂的任务队列。通过示例代码和详细的解释，读者将了解如何创建、控制和优化任务队列，以提高系统的处理能力和性能。
tags: [JavaScript, 后端]
category: Web服务
draft: false
---

队列，在数据结构中是一种线性表，其特性为必须从一端插入，然后从另一端删除数据。但笔者今天重点不是如何实现该数据结构，我们可以看一看如何借助队列管理复杂的任务。

队列在实际开发中应用的场景非常广泛。因为在一个复杂的系统中，总是会有一些非常耗时的处理。在这种时候开发者不能要求系统提供实时处理、实时响应的能力。这时候我们就可以通过队列来解决此类问题。

开发者可以不停地往队列塞入数据，并为其生成唯一值（进行跟踪），同时根据当前系统的处理能力不断的从队列取出数据进行业务处理，以此来减轻在同一时间内进行大量复杂业务处理，以便增强系统的处理能力。

服务端通常可以借助队列来进行异步处理、系统解耦、数据同步以及流量削峰。

如果需求较为简单，开发者可以直接借助数组来进行处理。对于较为复杂的需求，可以使用 [better-queue](https://github.com/diamondio/better-queue) 来解决问题。

better-queue 进一步扩展了队列，让其有很多好用的功能。诸如：

- 并行化处理
- 持久(和可扩展)存储
- 批处理
- 优先队列
- 合并、过滤任务
- 任务统计

## 使用方法

让我们开始看一看 better-queue 如何使用。

### 代码风格

```ts
import BetterQueue from "better-queue";

// 创建队列并且提供任务处理的回调函数
// 当调用回调意味该数据已经从队列中删除
// 然后从队列中取出下一条数据继续处理
const q = new BetterQueue(function (input, cb) {
  // 从队列中取出数据并进行处理...
  const result = 'xxxx'
  try {
    // 如果成功则调用回调并且返回结果
    cb(null, result);
  } catch (err) {
    // 否则返回错误
    cb(err)
  }
})

q.push(1)
q.push({x: 1})
```

我们可以看到，该库的代码风格还是采用了 Node 早期版本的回调风格，如果在执行期间发生了错误，会把错误作为回调的第一个参数传递到回调函数中。类似于：

```ts
fs.readFile(filePath, (err, data) => {
  if (err) {
    console.log(err)
    return
  }
  console.log(data)
})
```

### 队列生成与使用

首先我们可以构建存储结构和请求的数据结构 Job。

```ts
// 任务数据
interface Job<T> {
  // 任务的唯一值，唯一确定当前任务
  id: string;
  // 当前任务的状态：等待中，已成功，已失败  
  status: 'waiting' | 'succeeded' | 'failed';
  // 任务的请求参数，可以是 id，也可以是其他数据
  queryArgs?: any;
  // 任务的返回结果
  result: T;
  // 任务错误信息
  err: Error;
}
```

然后开发队列的回调函数以及新建任务队列:

```ts
// 异步处理逻辑
async function asyncProcess<T>(job: Job<T>, cb: Function) {
  const req = job.queryArgs || job.id
  try {
    // await 异步请求处理，数据库访问，或者生成文件等耗时任务
    const result = await query('/xxx/xxx', req)
    cb(null, result)
  } catch (error) {
    // 生成错误
    cb(error)
  }
}

// 创建队列
const betterQueue = new BetterQueue(asyncProcess)

// 对象存储，因为队列只会进行任务处理，并不包括数据的存储
// 也可以使用 map
const jobById = {}

// 创建队列数据
for (let i = 0; i < 10000; i++) {
  // 建立 job
  const asyncJob: Job = {
    id: `${id}`,
    queryArgs: {},
    status: 'waiting'
  }
  // 存储 job,通过 id 追踪数据
  jobById[asyncJob.id] = asyncJob

  betterQueue.push(asyncJob)
    // 取出数据并且完成请求后调用 cb(null, result) 会进入这里
    .on('finish', (result) => {
      // 修改任务状态，并存储任务结果
      job.status = 'succeeded'
      job.result = result
    })
    // 失败调用 cb(err) 会进入这里 
    .on('failed', (error: Error) => {
      // 修改任务状态，并存储错误信息
      job.status = 'failed'
      job.err = error
    })
}

// 获取任务，如果队列没有处理，会返回 wait 状态
// 队列已经处理，会返回 succeeded 或者 failed
function getJob(id: string) {
  return jobById[id]
}
```

在存储完任务之后，我们可以在前端或者服务端根据 id 来获取整个任务信息。

### 并发处理

此时任务队列就会一个接一个进行业务处理，在上一个异步任务完成（成功或者失败）后进行下一个任务。但这样就太慢了。同时也没有发挥出系统应有的处理能力。这时候我们可以直接添加配置项 concurrent。

```ts
// 创建队列
const betterQueue = new BetterQueue(asyncProcess, {
  concurrent: 10
}) 
```

这样的话，系统可以依次且同时处理多条任务。大大减少了所有任务的处理时长。

### 任务状态

我们还可以通过 getStats() 获取当前任务状态，这是 getStats 返回的信息：

```ts
 interface QueueStats {
  total: number; // 处理的任务总数
  average: number; // 平均处理时间
  successRate: number; // 成功率，在 0 和 1 之间 
  peak: number; // 大多数任务在任何给定时间点排队
}
```

```ts
function cb() {
  // 获取当前队列的状态并打印完成数据对比。
  // 如: 1/10 2/10
  const stats = betterQueue.getStats()
  console.log(`${stats.total}/10000`)
}

betterQueue.push(asyncJob)
  .on('finish', (result) => {
    // ...
    // 完成时候进行回调
    cb()
  })
  .on('failed', (error: Error) => {
    // ...
    // 完成时候进行回调
    cb()
  })
```

这时候我们可以借助 getStats 向前端展示当前任务状态。

### 队列控制

better-queue 提供了强大的队列控制能力。

我们可以通过任务 id 直接取消某一个任务。

```ts
// 直接取消任务
betterQueue.cancel(jobId)
```

我们还可以通过 cancelIfRunning 设置为 true 来控制之前队列中之前的任务取消。

```ts
// 创建队列
const betterQueue = new BetterQueue(asyncProcess, {
  cancelIfRunning: true
})

betterQueue.push({id: 'xxx'});
// 如果之前的 id 在队列中，取消前一个任务，执行后一个任务
betterQueue.push({id: 'xxx'});
```

我们也可以轻松控制队列暂停、恢复以及销毁。

```ts
// 暂停队列运行
betterQueue.pause()

// 恢复队列运行
betterQueue.resume()

// 销毁队列，清理数据
betterQueue.destroy()
```

同时，开发者也可以通过新建队列的回调函数中传出一个对象来自行控制。如：

```ts
const betterQueue = new BetterQueue(function (file: File, cb: Function) {

  var worker = someLongProcess(file);

  return {
    cancel: function () {
      // 取消文件上传
    },
    pause: function () {
      // 暂停文件处理
    },
    resume: function () {
      // 恢复文件上传
    }
  }
})
betterQueue.push('/path/to/file.pdf')
betterQueue.pause()
betterQueue.resume()
```

### 重试与超时

对于异步任务来说，如果出现了执行失败，better-queue 也提供了重试机制。

```ts
const betterQueue = new BetterQueue(asyncProcess, {
  // 当前任务失败了可以重新请求，最大为 10 次，超过 10 次宣告任务失败
  maxRetries: 10,
  // 重试等待时间 1s
  retryDelay: 1000,
  // 超时时间 5s，当前异步任务处理超过 5s 则认为任务失败
  maxTimeout: 5000,
}) 
```

### 持久化

当前任务队列存储到内存中，但在开发服务端时候，仅放入内存可能不是那么安全，我们可以通过传入 store 配置项来持久化队列数据。

```ts
// 此时队列的插入和删除都会和数据库进行交互
const betterQueue = new BetterQueue(asyncProcess, {
  store: {
    type: 'sql',
    dialect: 'sqlite',
    path: '/path/to/sqlite/file'
  }
})

// 或者使用 use
betterQueue.use({
  type: 'sql',
  dialect: 'sqlite',
  path: '/path/to/sqlite/file'
})

```

该库目前支持 SQLite 和 PostgreSQL，同时项目也提供了定制支持。

```ts
betterQueue.use({
  connect: function (cb) {
    // 连接你的数据库
  },
  getTask: function (taskId, cb) {
    // 查询任务
  },
  putTask: function (taskId, task, priority, cb) {
    // 保存任务同时携带优先级
  },
  takeFirstN: function (n, cb) {
    // 删除前 n 项（根据优先级和传入顺序排序）
  },
  takeLastN: function (n, cb) {
    // 删除后 n 项（根据优先级和传入顺序排序）
  }
})
```

### 先进后出

better-queue 不仅仅提供了先进先出的逻辑，甚至提供了先进后出的逻辑，只需要在配置中添加 filo。

```ts
// 创建队列
const betterQueue = new BetterQueue(asyncProcess, {
  filo: true
})
```

### 任务过滤、合并以及调整优先级

我们可以在业务处理中过滤某些任务，只需要添加 filter 函数。

```ts
const betterQueue = new BetterQueue(asyncProcess, {
  // 在推送任务前执行过滤
  filter: async function (job: Job, cb: Function) {
    // 在执行业务处理前预处理，验证数据，数据库查找等较为有用
    // 异步处理验证失败
    if (filterFail) {
      cb('not_allowed')
      return
    }
    // 为 job 前置处理
    cb(null, job)
  }
})
```


对于有相同 id 的任务，better-queue 提供了合并函数：

```ts
const betterQueue = new BetterQueue(function (task, cb) {
  console.log("I have %d %ss.", task.count, task.id);
  cb();
}, {
  merge: function (oldTask, newTask, cb) {
    oldTask.count += newTask.count;
    cb(null, oldTask);
  }
})

betterQueue.push({ id: 'apple', count: 2 })
betterQueue.push({ id: 'apple', count: 1 })
betterQueue.push({ id: 'orange', count: 1 })
betterQueue.push({ id: 'orange', count: 1 })
 
// 这时候会打印出 
// I have 3 apples.  
// I have 2 oranges.

// 而不是

// I have 1 apples.
// I have 1 oranges.
```

优先级对于队列也是非常重要的配置。

```ts
const betterQueue = new BetterQueue(asyncProcess, {
  // 决定先处理那些任务
  priority: function (job: Job, cb: Function) {
    if (job.queryArgs === 'xxxxx') {
      cb(null, 10)
      return
    } 
    if (job.queryArgs === 'xxx'){
      cb(null, 5)
      return
    }
    cb(null, 1);
  }
})
```

### 批处理与批处理前置

批处理同样也可以增强系统处理能力。使用批处理不会立即处理任务，而是将多个任务合并为一个任务处理。

批处理不同于 concurrent，该配置是当前队列内存储的数据达到批处理配置后才会进行数据处理。

```ts
const betterQueue = new BetterQueue<(function (batch, cb) {
  // batch 中是一个数组，最多为 3 个
  // [job1, job2, job3]
  cb()
}, {
  // 批处理大小
  batchSize: 3,
  // 5 秒内等待队列拥有 3 个项目，或者 3 秒内没有添加新的任务
  // 直接处理队列
  batchDelay: 5000,
  batchDelayTimeout: 3000
})

// 当前也会触发，不过要等 3 秒没有添加新任务
// 如开始时放入 1 条数据，等待 2.5 s 后放入第二条数据，则在 5s 后也会执行
betterQueue.push(job1)
betterQueue.push(job2)

// 在 1s 内推入第三条数据到队列中
// 队列数据达到 3 了，开始处理
betterQueue.push(job3)
```

我们也可以通过添加前置条件判断是否执行下一个批处理。

```ts
const betterQueue = new BetterQueue<(function (batch, cb) {
  // batch 中是一个数组，最多为 3 个
  // [job1, job2, job3]
  cb()
}, {
  precondition: function (cb) {
    // 当前是否是联网状态
    isOnline(function (err, ok) {
      if (ok) {
        // 返回 true，进行下一次批处理
        cb(null, true);
      } else {
        // 继续执行直到为 true
        cb(null, false);
      }
    })
  },
  // 每 10 秒执行一次 precondition 函数
  preconditionRetryTimeout: 10 * 1000
})
```

当然，better-queue 提供了更多的参数与配置，我们可以进一步学习，以便基于现有业务管理复杂的任务。让负责的任务变得更加可控。同时也可以提升系统处理业务的能力。

## 参考资料

[better-queue](https://www.npmjs.com/package/better-queue)