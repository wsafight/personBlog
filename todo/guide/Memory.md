# Node.js、Bun 和 Deno 内存管理完全指南

本文档详细介绍了在 Node.js、Bun 和 Deno 三种 JavaScript 运行时中如何获取和扩大 heap size limit。

## 目录

- [获取 Heap Size Limit](#获取-heap-size-limit)
- [扩大 Heap Size Limit](#扩大-heap-size-limit)
- [对比总结](#对比总结)
- [最佳实践](#最佳实践)

---

## 获取 Heap Size Limit

### Node.js

Node.js 使用 V8 引擎，可以通过 `v8.getHeapStatistics()` 获取堆内存统计信息。

```javascript
const v8 = require('v8');

const heapStats = v8.getHeapStatistics();
console.log('Heap Size Limit:', heapStats.heap_size_limit);
console.log('Total Heap Size:', heapStats.total_heap_size);
console.log('Used Heap Size:', heapStats.used_heap_size);

// 输出示例：
// Heap Size Limit: 4144332800 (约 3.86 GB)
// Total Heap Size: 7315456
// Used Heap Size: 4376864
```

### Bun

Bun 使用 JavaScriptCore 引擎，但为了兼容性也支持 Node.js 的 v8 API。同时，Bun 提供了原生的 JSC API。

#### 方法 1：使用 Node.js 兼容 API（推荐）

```javascript
import v8 from 'v8';

const heapStats = v8.getHeapStatistics();
console.log('Heap Size Limit:', heapStats.heap_size_limit);
```

#### 方法 2：使用 Bun 原生 API

```javascript
import { heapStats } from "bun:jsc";

const stats = heapStats();
console.log('Heap Capacity:', stats.heapCapacity);
console.log('Heap Size:', stats.heapSize);
console.log('Extra Memory Size:', stats.extraMemorySize);
console.log('Object Count:', stats.objectCount);

// 返回的对象包含：
// {
//   heapSize: number,
//   heapCapacity: number,  // 类似于 V8 的 heap_size_limit
//   extraMemorySize: number,
//   objectCount: number,
//   protectedObjectCount: number,
//   globalObjectCount: number,
//   protectedGlobalObjectCount: number,
//   objectTypeCounts: {...}
// }
```

**注意**：Bun 有两个独立的堆 - 一个用于 JavaScript 运行时，另一个用于其他所有内容。这与 Node.js 的单一堆架构不同。

### Deno

Deno 使用 V8 引擎，支持通过 Node.js 兼容模块访问 v8 API。

#### 方法 1：使用 Node.js 兼容 API（推荐）

```javascript
import v8 from "node:v8";

const heapStats = v8.getHeapStatistics();
console.log('Heap Size Limit:', heapStats.heap_size_limit);
```

#### 方法 2：使用 Deno 原生 API

```javascript
const memUsage = Deno.memoryUsage();
console.log('RSS:', memUsage.rss);
console.log('Heap Total:', memUsage.heapTotal);
console.log('Heap Used:', memUsage.heapUsed);
console.log('External:', memUsage.external);

// 返回的对象包含：
// {
//   rss: number,        // 进程常驻集大小
//   heapTotal: number,  // V8 堆的总大小
//   heapUsed: number,   // V8 堆已使用的大小
//   external: number    // 绑定到 V8 管理的 JS 对象的 C++ 对象的内存使用
// }
```

**注意**：`Deno.memoryUsage()` 不提供 `heap_size_limit`，如果需要获取此信息，请使用 `node:v8` 模块。

---

## 扩大 Heap Size Limit

### Node.js

Node.js 支持通过命令行参数设置 V8 内存限制。

#### 基本用法

```bash
# 设置最大老生代内存为 4096 MB (4 GB)
node --max-old-space-size=4096 script.js

# 设置最大新生代半区内存为 128 MB
node --max-semi-space-size=128 script.js

# 组合使用多个参数
node --max-old-space-size=4096 --max-semi-space-size=128 script.js
```

#### 在 package.json 中配置

```json
{
  "scripts": {
    "start": "node --max-old-space-size=4096 index.js",
    "dev": "node --max-old-space-size=8192 --max-semi-space-size=128 server.js"
  }
}
```

#### 在 PM2 中配置

```json
{
  "apps": [{
    "name": "my-app",
    "script": "./app.js",
    "node_args": "--max-old-space-size=4096"
  }]
}
```

#### 在 Docker 中配置

```dockerfile
FROM node:20

# 设置环境变量
ENV NODE_OPTIONS="--max-old-space-size=4096"

COPY . .
RUN npm install

CMD ["node", "index.js"]
```

#### 常用内存参数

| 参数 | 说明 | 默认值 | 推荐值 |
|------|------|--------|--------|
| `--max-old-space-size` | 老生代最大内存（MB） | 32位: ~512MB<br>64位: ~1400-2GB | 根据需求：2048-8192 |
| `--max-semi-space-size` | 新生代半区最大内存（MB） | 自动 | 大内存应用：64-128 |
| `--max-heap-size` | 总堆最大内存（MB） | 自动 | 一般使用 max-old-space-size 即可 |

**注意**：Node.js 20+ 版本在容器中运行时会自动感知 cgroup 限制，根据容器的内存限制调整堆大小。

---

### Bun

**重要：Bun 目前不支持手动设置 heap size limit！**

#### 为什么不支持？

- Bun 使用 **JavaScriptCore (JSC)** 引擎，而不是 V8
- JSC 不支持类似 V8 的 `--max-old-space-size` 参数
- Node.js 的内存配置参数在 Bun 中**完全无效**

#### Bun 的内存管理机制

Bun 采用自动内存管理策略：

1. **自动检测系统资源**
   - 检测系统报告的可用内存
   - 监控当前内存使用情况

2. **动态触发垃圾回收**
   - 当内存使用达到系统可用内存的 **80%** 时
   - 自动触发更激进的垃圾回收策略
   - 无需手动配置

3. **双堆架构**
   - JavaScript 运行时使用一个堆
   - 其他所有内容使用另一个堆
   - 这与 Node.js 的单堆架构不同

#### 如何应对 Bun 的内存限制？

如果在 Bun 中遇到内存问题，可以考虑以下方案：

1. **优化代码**
   ```javascript
   // 不好的做法：一次性加载大量数据
   const data = await readFile('large-file.json');
   const parsed = JSON.parse(data);

   // 好的做法：流式处理
   const stream = file('large-file.json').stream();
   for await (const chunk of stream) {
     processChunk(chunk);
   }
   ```

2. **分批处理**
   ```javascript
   // 不好的做法：一次处理所有项
   const results = items.map(heavyOperation);

   // 好的做法：分批处理
   const batchSize = 100;
   for (let i = 0; i < items.length; i += batchSize) {
     const batch = items.slice(i, i + batchSize);
     const batchResults = batch.map(heavyOperation);
     await processBatch(batchResults);
   }
   ```

3. **手动触发垃圾回收（调试用）**
   ```javascript
   // 在 Bun 中，可以使用 bun:jsc 模块
   import { gc } from "bun:jsc";

   // 处理大量数据后
   processLargeData();
   gc(); // 手动触发垃圾回收
   ```

4. **切换到 Node.js 或 Deno**
   - 如果应用确实需要大内存且需要精确控制
   - 考虑使用 Node.js 或 Deno 作为运行时

---

### Deno

Deno 使用 V8 引擎，支持通过 `--v8-flags` 参数传递 V8 配置。

#### 基本用法

```bash
# 设置最大老生代内存为 4096 MB (4 GB)
deno run --v8-flags=--max-old-space-size=4096 script.ts

# 新版 Deno 语法：多个参数用逗号分隔
deno run --v8-flags=--max-heap-size=4096,--max-old-space-size=4096 script.ts

# 配合其他 Deno 权限
deno run --v8-flags=--max-old-space-size=8000 \
  --allow-read --allow-write --allow-net \
  script.ts
```

#### 使用环境变量

```bash
# 设置环境变量
export V8_FLAGS="--max-heap-size=4096,--max-old-space-size=4096"

# 运行脚本
deno run --v8-flags="${V8_FLAGS}" script.ts
```

#### 在 deno.json 中配置

```json
{
  "tasks": {
    "start": "deno run --v8-flags=--max-old-space-size=4096 main.ts",
    "dev": "deno run --watch --v8-flags=--max-old-space-size=8192 main.ts"
  }
}
```

然后运行：
```bash
deno task start
```

#### 在 Docker 中配置

```dockerfile
FROM denoland/deno:1.40.0

WORKDIR /app
COPY . .

# 使用环境变量
ENV DENO_V8_FLAGS="--max-old-space-size=4096"

CMD ["deno", "run", "--v8-flags=${DENO_V8_FLAGS}", "--allow-all", "main.ts"]
```

或者直接在 CMD 中指定：

```dockerfile
CMD ["deno", "run", "--v8-flags=--max-old-space-size=4096", "--allow-all", "main.ts"]
```

#### 常用 V8 参数

| 参数 | 说明 | 示例值 |
|------|------|--------|
| `--max-old-space-size` | 老生代最大内存（MB） | 4096 |
| `--max-heap-size` | 总堆最大内存（MB） | 4096 |
| `--max-semi-space-size` | 新生代半区最大内存（MB） | 128 |
| `--initial-old-space-size` | 老生代初始内存（MB） | 1024 |

#### 注意事项

1. **版本差异**
   - 旧版 Deno 可能只支持单个 V8 flag
   - 新版 Deno (1.30+) 支持用逗号分隔的多个 flags

2. **权限要求**
   - V8 flags 不需要额外的 Deno 权限
   - 但脚本本身可能需要 `--allow-read`、`--allow-write` 等权限

3. **调试和监控**
   ```typescript
   // 监控内存使用
   import v8 from "node:v8";

   setInterval(() => {
     const stats = v8.getHeapStatistics();
     const usedMB = (stats.used_heap_size / 1024 / 1024).toFixed(2);
     const limitMB = (stats.heap_size_limit / 1024 / 1024).toFixed(2);
     console.log(`Memory: ${usedMB} MB / ${limitMB} MB`);
   }, 5000);
   ```

---

## 对比总结

### 获取 Heap Size Limit

| 运行时 | 引擎 | 推荐方法 | 备注 |
|--------|------|----------|------|
| **Node.js** | V8 | `v8.getHeapStatistics()` | 原生 API，最全面 |
| **Bun** | JSC | `v8.getHeapStatistics()` 或 `heapStats()` from `bun:jsc` | 兼容 Node.js API，也可用原生 JSC API |
| **Deno** | V8 | `v8.getHeapStatistics()` from `node:v8` | 需要导入 Node 兼容模块 |

### 扩大 Heap Size Limit

| 运行时 | 是否支持 | 方法 | 说明 |
|--------|---------|------|------|
| **Node.js** | ✅ 完全支持 | `node --max-old-space-size=4096 script.js` | V8 引擎，配置灵活 |
| **Bun** | ❌ 不支持 | 无法手动配置 | JSC 引擎，自动管理内存（80% 触发 GC） |
| **Deno** | ✅ 完全支持 | `deno run --v8-flags=--max-old-space-size=4096 script.ts` | V8 引擎，通过 v8-flags 传递 |

### 跨运行时兼容性

如果需要编写跨运行时的代码，推荐：

```javascript
// 获取 heap size limit（兼容所有运行时）
let heapLimit;

if (typeof Bun !== 'undefined') {
  // Bun 环境
  const v8 = await import('v8');
  heapLimit = v8.getHeapStatistics().heap_size_limit;
} else if (typeof Deno !== 'undefined') {
  // Deno 环境
  const v8 = await import('node:v8');
  heapLimit = v8.getHeapStatistics().heap_size_limit;
} else {
  // Node.js 环境
  const v8 = require('v8');
  heapLimit = v8.getHeapStatistics().heap_size_limit;
}

console.log('Heap Size Limit:', (heapLimit / 1024 / 1024).toFixed(2), 'MB');
```

---

## 最佳实践

### 1. 选择合适的运行时

#### Node.js 适合：
- ✅ 需要精确控制内存的应用
- ✅ 大型企业级应用
- ✅ 内存密集型数据处理
- ✅ 需要稳定性和成熟生态的项目

#### Bun 适合：
- ✅ 开发环境和工具链
- ✅ 一般 Web 应用
- ✅ 追求启动速度的场景
- ❌ 不适合需要大内存配置的应用

#### Deno 适合：
- ✅ 现代化的新项目
- ✅ 需要安全性的应用
- ✅ TypeScript 优先的项目
- ✅ 需要内存控制的应用

### 2. 内存配置指南

#### 开发环境

##### 根据开发机器内存配置

**16GB 内存的开发机器**

遵循原则：为 Node.js 进程分配 **20-30%** 的系统内存，保留足够内存给 IDE、浏览器等工具。

```bash
# 小型项目（3-4GB heap）
node --max-old-space-size=3072 app.js

# 中型项目（4-5GB heap）- 推荐配置
node --max-old-space-size=4096 app.js

# 大型项目（5-6GB heap）- 接近上限
node --max-old-space-size=5120 app.js
```

**注意**：
- 16GB 机器不建议超过 6GB，否则可能影响系统稳定性
- 如果同时运行多个 Node 进程，需要相应减少单进程内存
- 建议关闭不必要的应用以释放内存

**32GB 内存的开发机器**

遵循原则：为 Node.js 进程分配 **25-35%** 的系统内存。

```bash
# 小型项目（4GB heap）
node --max-old-space-size=4096 app.js

# 中型项目（6-8GB heap）- 推荐配置
node --max-old-space-size=6144 app.js
node --max-old-space-size=8192 app.js

# 大型项目（10-12GB heap）
node --max-old-space-size=10240 app.js
node --max-old-space-size=12288 app.js
```

**注意**：
- 32GB 是较为理想的开发环境配置
- 可以同时运行多个 8GB 内存的 Node 进程
- 适合大型前端项目构建和复杂的全栈开发

**64GB 内存的开发机器**

遵循原则：为 Node.js 进程分配 **30-40%** 的系统内存。

```bash
# 小型项目（8GB heap）
node --max-old-space-size=8192 app.js

# 中型项目（12-16GB heap）
node --max-old-space-size=12288 app.js
node --max-old-space-size=16384 app.js

# 大型项目（20-24GB heap）- 推荐配置
node --max-old-space-size=20480 app.js
node --max-old-space-size=24576 app.js

# 超大型项目（28-32GB heap）
node --max-old-space-size=28672 app.js
node --max-old-space-size=32768 app.js
```

**注意**：
- 64GB 适合超大型项目和多任务开发
- 可以同时运行多个大内存 Node 进程
- 适合需要编译大型 monorepo 或处理海量数据的场景

##### 大型项目配置建议

当项目规模较大时（如 monorepo、大型企业应用），除了增加 heap size，还需要考虑：

**package.json 配置示例**

```json
{
  "scripts": {
    "// 16GB 机器配置": "",
    "dev:16g": "node --max-old-space-size=4096 scripts/dev.js",
    "build:16g": "node --max-old-space-size=5120 scripts/build.js",

    "// 32GB 机器配置": "",
    "dev:32g": "node --max-old-space-size=8192 scripts/dev.js",
    "build:32g": "node --max-old-space-size=10240 scripts/build.js",

    "// 64GB 机器配置": "",
    "dev:64g": "node --max-old-space-size=16384 scripts/dev.js",
    "build:64g": "node --max-old-space-size=20480 scripts/build.js",

    "// 通用配置（自动检测）": "",
    "dev": "node --max-old-space-size=8192 scripts/dev.js",
    "build": "node --max-old-space-size=12288 scripts/build.js"
  }
}
```

**使用环境变量动态配置**

```bash
# .env.development
# 根据团队成员机器配置设置
NODE_OPTIONS=--max-old-space-size=8192

# .env.development.local（个人配置，不提交到版本控制）
# 16GB 机器开发者
NODE_OPTIONS=--max-old-space-size=4096

# 32GB 机器开发者
NODE_OPTIONS=--max-old-space-size=8192

# 64GB 机器开发者
NODE_OPTIONS=--max-old-space-size=16384
```

**Webpack/Vite 等构建工具配置**

```javascript
// webpack.config.js
module.exports = {
  // 其他配置...

  // 根据可用内存优化并行度
  parallelism: process.env.CI
    ? 2  // CI 环境保守配置
    : getOptimalParallelism(),

  optimization: {
    // 大型项目建议关闭或限制
    minimize: process.env.NODE_ENV === 'production',

    // 代码分割策略
    splitChunks: {
      chunks: 'all',
      maxSize: 244 * 1024, // 244KB
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          priority: -10
        }
      }
    }
  }
};

function getOptimalParallelism() {
  const totalMemGB = require('os').totalmem() / (1024 ** 3);

  if (totalMemGB >= 64) return 8;
  if (totalMemGB >= 32) return 4;
  if (totalMemGB >= 16) return 2;
  return 1;
}
```

**TypeScript 项目配置**

```json
// tsconfig.json
{
  "compilerOptions": {
    // 大型项目优化选项
    "incremental": true,
    "tsBuildInfoFile": "./.tsbuildinfo",

    // 跳过库文件类型检查以节省内存
    "skipLibCheck": true,

    // 使用项目引用分割大型项目
    "composite": true
  },

  // 对于超大型项目，考虑使用项目引用
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/utils" }
  ]
}
```

**推荐的内存配置对照表**

| 机器内存 | 小型项目 | 中型项目 | 大型项目 | 超大型项目 | 同时运行进程数 |
|---------|---------|---------|---------|-----------|--------------|
| **16GB** | 2-3GB | 4GB | 5-6GB | 不推荐 | 1-2 |
| **32GB** | 4GB | 6-8GB | 10-12GB | 12-16GB | 2-3 |
| **64GB** | 8GB | 12-16GB | 20-24GB | 28-32GB | 4-6 |

**项目规模判断标准**

- **小型项目**：< 100 个模块，< 50MB 代码，构建时间 < 1 分钟
- **中型项目**：100-500 个模块，50-200MB 代码，构建时间 1-5 分钟
- **大型项目**：500-2000 个模块，200-500MB 代码，构建时间 5-15 分钟
- **超大型项目**：> 2000 个模块，> 500MB 代码，构建时间 > 15 分钟

##### 通用开发配置
```bash
# 一般开发（2GB）
--max-old-space-size=2048

# 大型项目开发（4GB）
--max-old-space-size=4096
```

#### 生产环境
```bash
# 小型应用（1-2GB）
--max-old-space-size=1024

# 中型应用（4GB）
--max-old-space-size=4096

# 大型应用（8GB+）
--max-old-space-size=8192
```

#### 容器环境

遵循容器内存的 **50-75%** 原则：

```yaml
# Docker Compose 示例
services:
  app:
    image: node:20
    environment:
      - NODE_OPTIONS=--max-old-space-size=3072
    deploy:
      resources:
        limits:
          memory: 4G  # 容器总内存 4GB，Node.js 使用 3GB
```

### 3. 监控和调试

#### 监控内存使用

```javascript
const v8 = require('v8');

function logMemoryUsage() {
  const stats = v8.getHeapStatistics();
  const usage = process.memoryUsage();

  console.log({
    heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    heapLimit: `${(stats.heap_size_limit / 1024 / 1024).toFixed(2)} MB`,
    external: `${(usage.external / 1024 / 1024).toFixed(2)} MB`,
    rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
    usagePercent: `${((usage.heapUsed / stats.heap_size_limit) * 100).toFixed(2)}%`
  });
}

// 定期监控
setInterval(logMemoryUsage, 10000);

// 内存警告
const warningThreshold = 0.85; // 85%
setInterval(() => {
  const stats = v8.getHeapStatistics();
  const usage = process.memoryUsage();
  const usageRatio = usage.heapUsed / stats.heap_size_limit;

  if (usageRatio > warningThreshold) {
    console.warn(`⚠️ Memory usage high: ${(usageRatio * 100).toFixed(2)}%`);
  }
}, 5000);
```

#### 检测内存泄漏

```javascript
// 使用 heapdump 生成堆快照
const heapdump = require('heapdump');
const path = require('path');

// 定期生成快照
setInterval(() => {
  const filename = path.join('/tmp', `heapdump-${Date.now()}.heapsnapshot`);
  heapdump.writeSnapshot(filename, (err, filename) => {
    if (err) console.error(err);
    else console.log('Heap snapshot written to', filename);
  });
}, 3600000); // 每小时一次
```

### 4. 内存优化技巧

#### 使用流式处理

```javascript
// ❌ 不好：一次性加载整个文件
const fs = require('fs');
const data = fs.readFileSync('large-file.json', 'utf8');
const parsed = JSON.parse(data); // 内存占用大

// ✅ 好：流式处理
const { pipeline } = require('stream/promises');
const { createReadStream } = require('fs');
const { Transform } = require('stream');

await pipeline(
  createReadStream('large-file.json'),
  new Transform({
    transform(chunk, encoding, callback) {
      // 处理每个 chunk
      callback(null, processChunk(chunk));
    }
  }),
  createWriteStream('output.json')
);
```

#### 及时释放大对象

```javascript
function processLargeData() {
  let largeArray = new Array(1000000).fill({});

  // 处理数据
  const result = largeArray.map(item => transform(item));

  // 及时释放
  largeArray = null;

  return result;
}
```

#### 使用 WeakMap 和 WeakSet

```javascript
// ❌ 不好：Map 会阻止对象被垃圾回收
const cache = new Map();
cache.set(obj, data); // obj 永远不会被 GC

// ✅ 好：WeakMap 允许对象被垃圾回收
const cache = new WeakMap();
cache.set(obj, data); // obj 可以被 GC
```

#### 限制并发

```javascript
// ❌ 不好：无限并发
const promises = items.map(item => processItem(item));
await Promise.all(promises); // 可能耗尽内存

// ✅ 好：限制并发数
async function processWithLimit(items, limit = 10) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(
      batch.map(item => processItem(item))
    );
    results.push(...batchResults);
  }
  return results;
}
```

### 5. 常见问题排查

#### OOM (Out of Memory) 错误

```bash
# 错误信息示例
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**解决方案：**

1. **增加内存限制**
   ```bash
   node --max-old-space-size=4096 app.js
   ```

2. **检查是否有内存泄漏**
   - 使用 Chrome DevTools 分析堆快照
   - 使用 `clinic` 或 `0x` 进行性能分析

3. **优化代码**
   - 避免全局变量
   - 使用流式处理
   - 及时清理定时器和事件监听器

#### 垃圾回收频繁

如果 GC 过于频繁，可以调整新生代大小：

```bash
node --max-semi-space-size=128 app.js
```

#### 内存使用持续增长

可能是内存泄漏，常见原因：

1. 未清理的定时器
   ```javascript
   // ❌ 不好
   setInterval(() => {}, 1000);

   // ✅ 好
   const timer = setInterval(() => {}, 1000);
   // 在适当时机清理
   clearInterval(timer);
   ```

2. 事件监听器未移除
   ```javascript
   // ❌ 不好
   emitter.on('event', handler);

   // ✅ 好
   emitter.on('event', handler);
   // 在适当时机清理
   emitter.off('event', handler);
   ```

3. 闭包引用
   ```javascript
   // ❌ 不好：闭包持有大对象
   function createClosure() {
     const largeData = new Array(1000000);
     return function() {
       console.log(largeData[0]);
     };
   }

   // ✅ 好：只保留需要的数据
   function createClosure() {
     const largeData = new Array(1000000);
     const firstItem = largeData[0];
     return function() {
       console.log(firstItem);
     };
   }
   ```

---

## 总结

1. **获取内存信息**：三个运行时都支持 `v8.getHeapStatistics()`，推荐使用此方法实现跨平台兼容

2. **扩大内存限制**：
   - Node.js 和 Deno 支持手动配置（推荐用于生产环境）
   - Bun 不支持手动配置，依赖自动管理（适合一般应用）

3. **选择运行时**：
   - 需要精确内存控制 → Node.js 或 Deno
   - 追求开发体验和速度 → Bun（但注意内存限制）

4. **最佳实践**：
   - 合理设置内存限制（容器内存的 50-75%）
   - 持续监控内存使用
   - 优化代码减少内存占用
   - 及时排查和修复内存泄漏

---

## 参考资源

- [Node.js V8 Documentation](https://nodejs.org/api/v8.html)
- [Bun Documentation](https://bun.sh/docs)
- [Deno Documentation](https://docs.deno.com/)
- [V8 Heap Statistics](https://v8.dev/blog/trash-talk)
- [JavaScriptCore Documentation](https://developer.apple.com/documentation/javascriptcore)
