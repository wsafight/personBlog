# 使用 better-queue 管理复杂的任务

队列，在数据结构中是一种线性表，其限制为从一端插入，然后从另一端删除数据。但今天重点不是如何实现该数据结构，我们来看一看如何借助队列管理复杂的任务。

队列在实际开发中应用的场景非常广泛。因为在一个复杂的系统中，总是会有一些非常耗时的处理。在这种时候开发者不能要求系统提供实时处理、实时响应的能力。开发者需要考虑使用队列来解决此类问题。

开发者可以在队列内部生成唯一值（进行跟踪），根据当前处理能力不断的从队列取出数据进行业务处理，以此来增强系统的处理能力。

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

我们开始看一看 better-queue 如何使用。

### 代码风格

```ts
import BetterQueue from "better-queue";

// 创建队列并且提供任务处理的回调函数
const q = new BetterQueue(function (input, cb) {
  // 业务处理...
  const result = 'xxxx'
  // 如果成功则调用回调并且返回结果
  try {
    cb(null, result);
    // 否则返回错误
  } catch (err) {
    cb(err)
  }
})
 
q.push(1)
q.push({ x: 1 })
```

我们可以看到，该库的回调风格还是采用了 Node 老版本的回调风格，如果在执行期间发生了错误，会把错误作为回调的第一个参数传递到回调函数中。类似于：

```ts
fs.readFile(filePath, (err, data) => {
  if (err) {
    console.log(err)
    return
  }
  console.log(data)
})
```

### 队列生成

某些情况下系统需要大量请求同一个 api，这时候我们就可以使用队列。

首先我们可以构建存储结构和请求的数据结构 job。

```ts
interface Job<T> {
  // 任务的唯一值
  id: string;
  // 当前任务的状态：等待中，已成功，已失败  
  status: 'waiting' | 'succeeded' | 'failed';  
  // 任务的请求参数，可以是 id，也可以是其他数据
  queryArgs?: any;
  // 任务的返回结果
  result: T;
  // 任务错误信息
  err: Error
}
```

然后开发队列的回调函数以及新建任务队列:

```ts
async function queryXXXApi<T>(job: Job<T>, cb: Function) {
  const req = job.queryArgs || job.id
  try {
    // await 异步请求 api
    const result = await query('/xxx/xxx', req)
    cb(null, result)
  } catch (error) {
    cb(error)
  }
}

// 创建队列
const betterQueue = new BetterQueue(queryXXXApi) 
const jobMap = new Map()

// 创建队列数据
for (let i = 0; i < 10000;i++) {
  const queryJob: Job = {
    id: i,
    queryArgs: {},
    status: 'waiting'  
  }
  // 存储 job，queue 仅仅只是一个任务队列，不包括数据的存储
  jobMap.set(job.id, job)
    
  betterQueue.push(queryJob)
    // 取出数据并且完成请求后调用 cb(null, result) 会进入这里
    .on('finish', (result) => {
      job.status = 'succeeded'
      job.result = result
    })
    // 失败调用 cb(err) 会进入这里 
    .on('failed', (error: Error) => {
      job.status = 'failed'
      job.err = error
    })
}
```

当然，该库不仅仅可以服务于前端，服务端可以根据当前任务 jobId 以及 status 来决定当前返回 job。



### 并发处理

此时队列就会一个一个依次处理，在上一个请求完成（成功或者失败）后进行下一个请求。
如果是这样的话就太慢了，我们需要加大请求。这时候我们直接添加配置项 concurrent：

```ts
// 创建队列
const betterQueue = new BetterQueue(queryXXXApi, {
  concurrent: 10
}) 
```

这样的话，我们就可以同时处理多条数据，大大提升了速度。

### 任务状态

我们还可以通过 getStats() 获取当前任务状态：

```ts
 interface QueueStats {
  total: number; // 任务完成数量
  average: number; // 平均处理时间
  successRate: number; // 成功率，在 0 和 1 之间 
  peak: number; // 处理的总项目数量
}
```

```ts
function cb () {
  // 获取当前队列的状态并打印
  const stats = betterQueue.getStats()
  console.log(`${stats.total}/${stats.peak}`)
}

betterQueue.push(queryJob)
  // 取出数据并且完成请求后调用 cb(null, result) 会进入这里
  .on('finish', (result) => {
    job.result = result
    cb()
  })
  // 失败调用 cb(err) 会进入这里 
  .on('failed', (error: Error) => {
    job.err = error
    cb()
  })
```

### 队列控制

在不断驱动任务运行的过程中，我们也需要能够深入的控制队列。

我们可以通过任务 id 直接取消某一个任务。

```ts
betterQueue.cancel(jobId)
```

我们还可以通过 cancelIfRunning 设置为 true 来控制之前队列中之前的任务取消。

```ts
// 创建队列
const betterQueue = new BetterQueue(queryXXXApi, {
  concurrent: 10,
  cancelIfRunning: true
})

betterQueue.push({ id: '/path/to/file.pdf' });
// 如果之前的 id 在队列中，取消前一个任务，执行后一个任务
betterQueue.push({ id: '/path/to/file.pdf' });
```

我们也可以轻松的控制队列暂停、恢复以及销毁。

```ts
// 暂停运行
betterQueue.pause()

// 恢复运行
betterQueue.resume()

// 销毁队列，清理数据
betterQueue.resume()
```

同时，开发者也可以通过回调时候传出一个对象来自行控制。如：

```ts
const betterQueue = new BetterQueue(function (file, cb) {
  
  var worker = someLongProcess(file);
 
  return {
    cancel: function () {
      // Cancel the file upload
    },
    pause: function () {
      // Pause the file upload
    },
    resume: function () {
      // Resume the file upload
    }
  }
})
betterQueue.push('/path/to/file.pdf')
betterQueue.pause()
betterQueue.resume()
```

### 重试与超时

我们可以设置任务重试以及超时：

```ts
const betterQueue = new BetterQueue(queryXXXApi, {
  // 当前任务失败了可以重新请求，最大为 10 次
  maxRetries: 10, 
  // 重试等待时间 1s
  retryDelay: 1000,
  // 超时时间 5s，当前任务处理超过 5s 则认为任务失败
  maxTimeout: 5000,
}) 
```

### 持久化

当前任务队列默认存储到内存中，但在开发 node 过程中有需要的话，我们可以通过传入 store 来持久化存储。

```ts
const betterQueue = new BetterQueue(queryXXXApi, {
  store: {
    type: 'sql',
    dialect: 'sqlite',
    path: '/path/to/sqlite/file'
  }
})

// 或者
betterQueue.use({
  type: 'sql',
  dialect: 'sqlite',
  path: '/path/to/sqlite/file'
})

```

该库也提供了定制支持:

```ts
betterQueue.use({
  connect: function (cb) {
    // Connect to your db
  },
  getTask: function (taskId, cb) {
    // Retrieves a task
  },
  putTask: function (taskId, task, priority, cb) {
    // Save task with given priority
  },
  takeFirstN: function (n, cb) {
    // Removes the first N items (sorted by priority and age)
  },
  takeLastN: function (n, cb) {
    // Removes the last N items (sorted by priority and recency)
  }
})
```

## 其他功能

该库还支持了批处理，前置函数等功能，大家可以自行按照需求来学习和使用。