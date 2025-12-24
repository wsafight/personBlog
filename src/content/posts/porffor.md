---
title: Porffor：用 JavaScript 写的 JavaScript AOT 编译器
published: 2025-12-24
description: Porffor 是一个实验性的 JavaScript AOT 编译器，能将 JS/TS 代码编译为 WebAssembly 和原生二进制文件。文章介绍了其 100% AOT 编译、极简运行时的核心特点以及三个自研子引擎。
tags: [性能优化, 编译器]
category: 性能优化
draft: false
---

> 发音：/ˈpɔrfɔr/（威尔士语中"紫色"的意思）

如果你写过 JavaScript，你可能习惯了它的动态类型、即时编译（JIT）和无处不在的运行时。但有没有想过，如果把 JavaScript 提前编译成机器码会发生什么？

这就是 **Porffor** 想要回答的问题。

---

## 什么是 Porffor？

Porffor 是一个实验性的 **AOT（Ahead-of-Time）JavaScript/TypeScript 编译器**，由开发者 Oliver Medhurst 从零构建。它能将 JS/TS 代码编译为 WebAssembly 和原生二进制文件。

听起来不太特别？让我们看看它的核心特点：

- **100% AOT 编译** - 没有 JIT，编译一次，到处运行
- **极简运行时** - 无常量运行时或预置代码，最小化 Wasm imports
- **自身编写** - 用 JavaScript 写 JavaScript 引擎，避免内存安全漏洞
- **原生支持 TypeScript** - 无需额外构建步骤

目前项目仍处于 **pre-alpha** 阶段，但已经通过了 61% 的 Test262 测试（ECMAScript 官方兼容性测试套件）。

---

## 它是如何工作的？

传统 JavaScript 引擎使用解释器或多层 JIT 编译器。代码在运行时被解析、编译和优化。这意味着：

1. 冷启动慢（需要预热）
2. 运行时占用内存大（JIT 代码缓存）
3. 需要完整的运行时环境

Porffor 采用了不同的方式：

```
JavaScript/TypeScript
        │
        ▼
   WebAssembly / C 代码
        │
        ▼
   原生二进制文件
```

这种 AOT 方式让你在开发时编译，在生产环境直接运行已编译的代码——无需预热，最小开销。

### 三个自研子引擎

为了实现这个目标，Porffor 包含三个自研的子引擎：

| 子引擎 | 作用 |
|-------|------|
| **Asur** | 自研 Wasm 引擎，简单的解释器实现 |
| **Rhemyn** | 自研正则表达式引擎，将正则编译为 Wasm 字节码 |
| **2c** | Wasm → C 转译器，用于生成原生二进制 |

---

## 快速开始

### 安装

```bash
npm install -g porffor@latest
```

### 基本用法

```bash
# 交互式 REPL
porf

# 直接运行 JS 文件
porf script.js

# 编译为 WebAssembly
porf wasm script.js out.wasm

# 编译为原生二进制
porf native script.js out

# 编译为 C 代码
porf c script.js out.c
```

### 编译选项

```bash
--parser=acorn|@babel/parser|meriyah|hermes-parser|oxc-parser   # 选择解析器
--parse-types                                                   # 解析 TypeScript
--opt-types                                                     # 使用类型注解优化
--valtype=i32|i64|f64                                         # 值类型（默认：f64）
-O0, -O1, -O2                                                 # 优化级别
```

---

## 谁需要 Porffor？

### 编译为 WebAssembly

Porffor 的 Wasm 输出比现有 JS→Wasm 项目小 **10-30 倍**，性能也快 **10-30 倍**（相比打包解释器的方案）。

这意味着：

- **安全的服务端 JS 托管** - Wasm 沙箱化执行，无需额外隔离
- **边缘计算运行时** - 快速冷启动，低内存占用
- **代码保护** - 编译后的代码比混淆更难逆向

### 编译为原生二进制

Porffor 生成的二进制文件比传统方案小 **1000 倍**（从 ~90MB 到 <100KB）。

这使得以下场景成为可能：

- **嵌入式系统** - 在资源受限设备上运行 JS
- **游戏机开发** - 任何支持 C 的地方都可以用 JS
- **微型 CLI 工具** - 用 JS 写 <1MB 的可执行文件

### 安全特性

- 用 JavaScript（内存安全语言）编写引擎本身
- 不支持 `eval`，防止动态代码执行
- Wasm 沙箱化环境

---

## 当然，它也有局限性

作为实验性项目，Porffor 目前还有一些限制：

| 限制 | 说明 |
|-----|------|
| 异步支持有限 | `Promise` 和 `await` 支持有限 |
| 作用域限制 | 不支持跨作用域变量（除参数和全局变量） |
| 无动态执行 | 不支持 `eval()`、`Function()` 等（AOT 特性） |
| JS 特性支持不完整 | Test262 通过率约 61% |

---

## 与其他 JS 引擎对比

### 架构差异

| 引擎 | 类型 | 编译策略 | 输出 |
|------|------|---------|------|
| **Porffor** | AOT | JS → Wasm/Native | Wasm/二进制 |
| **V8** | JIT | 解释器 + 多层 JIT | 机器码 |
| **QuickJS** | 字节码 | JS → 字节码 | 字节码 |

### 性能对比

| 场景 | Porffor | JIT 引擎 | 字节码引擎 |
|------|---------|---------|-----------|
| **冷启动** | 最快 | 慢（需预热） | 中等 |
| **峰值性能** | 中等 | 最快 | 慢 |
| **内存占用** | 低 | 高 | 中等 |
| **二进制大小** | 极小 | N/A | 小 |

### 什么时候选择什么？

```
Porffor 最适合：
├── 需要极小二进制体积的场景
├── 需要快速冷启动的场景（如 Serverless）
├── 需要安全沙箱执行的场景
└── 嵌入式/游戏机等非传统 JS 平台

V8/SpiderMonkey 最适合：
├── 通用 Web 应用
├── Node.js 服务端应用
└── 需要完整 JS 特性支持的场景

QuickJS/JerryScript 最适合：
├── 嵌入式设备
├── 资源受限环境
└── 不需要极致性能的场景
```

---

## 动手试试

让我们写一个素数计算器来看看 Porffor 的实际效果：

```javascript
// 检查一个数是否为素数
function isPrime(n) {
  if (n < 2) return 0;
  if (n === 2) return 1;
  if (n % 2 === 0) return 0;

  const sqrtN = Math.sqrt(n);
  for (let i = 3; i <= sqrtN; i += 2) {
    if (n % i === 0) return 0;
  }
  return 1;
}

// 查找指定范围内的所有素数
function findPrimes(start, end) {
  const primes = [];
  let count = 0;

  for (let i = start; i <= end; i++) {
    if (isPrime(i)) {
      primes[count] = i;
      count++;
    }
  }

  primes.length = count;
  return primes;
}

// 主程序
function main() {
  const START_NUM = 1;
  const END_NUM = 100;

  console.log('=== Porffor Prime Calculator ===');
  console.log('Range:', START_NUM, 'to', END_NUM);

  const primes = findPrimes(START_NUM, END_NUM);
  console.log('Found', primes.length, 'primes');

  let sum = 0;
  for (let i = 0; i < primes.length; i++) {
    sum += primes[i];
  }

  console.log('Sum:', sum);
  console.log('Average:', sum / primes.length);

  return 'Done!';
}

main();
```

### 直接运行

```bash
porf prime.js
```

输出：
```
=== Porffor Prime Calculator ===
Range: 1 to 100
Found 25 primes
Sum: 1060
Average: 42.4
Done!
```

### 编译为 WebAssembly

```bash
porf wasm prime.js prime.wasm
```

编译输出：
```
parsed: 5ms
generated wasm: 40ms
optimized: 7ms
assembled: 5ms
[108ms] compiled prime.js -> prime.wasm (36.5KB)
```

### 编译为原生二进制

```bash
porf native prime.js prime
```

编译输出：
```
parsed: 5ms
generated wasm: 38ms
optimized: 7ms
assembled: 4ms
compiled Wasm to C: 18ms
compiled C to native: 959ms
[1080ms] compiled prime.js -> prime (106.6KB)
```

### 输出格式对比

| 格式 | 文件大小 | 编译时间 | 运行方式 |
|------|---------|---------|---------|
| 源 JS | 2.4KB | - | `porf file.js` |
| Wasm | 36KB | ~100ms | 需 Wasm 运行时 |
| C 代码 | 356KB | ~130ms | 需 C 编译 |
| Native | 106KB | ~1100ms | 独立运行 |

---

## 生成的 C 代码是什么样的？

你可能会好奇，Porffor 生成的 C 代码长什么样？让我们对比一下手写版本和自动生成的版本。

### 手写 C 版本（96 行，2.3KB）

```c
#include <stdio.h>
#include <math.h>
#include <stdbool.h>

bool isPrime(int n) {
    if (n < 2) return false;
    if (n == 2) return true;
    if (n % 2 == 0) return false;

    int sqrtN = (int)sqrt(n);
    for (int i = 3; i <= sqrtN; i += 2) {
        if (n % i == 0) return false;
    }
    return true;
}

int main() {
    int primes[100];
    int primeCount = findPrimes(1, 100, primes);

    printf("Found %d primes:\n", primeCount);
    for (int i = 0; i < primeCount; i++) {
        printf("%d%s", primes[i], i < primeCount - 1 ? ", " : "\n");
    }

    return 0;
}
```

### Porffor 生成的版本（12,880 行，353KB）

```c
// generated by porffor 0.61.2
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <math.h>
#include <string.h>

// Wasm 类型定义
typedef uint8_t u8;
typedef int32_t i32;
typedef double f64;

// JS 值结构体（数字或对象）
struct ReturnValue {
  f64 value;
  i32 type;  // 类型标签
};

// Wasm 线性内存模拟
char* _memory;
u32 _memoryPages = 5;

// Wasm 指令模拟函数
i32 i32_load(i32 align, i32 offset, i32 pointer);
void f64_store(i32 align, i32 offset, i32 pointer, f64 value);

// JS 内置函数实现
struct ReturnValue __ecma262_ToString(...);
f64 __Math_sqrt(f64 l0);
void __Porffor_printString(...);
// ... 数百个内置函数

// 用户函数（从 JS 转换）
struct ReturnValue isPrime(...);
struct ReturnValue findPrimes(...);

int main() {
    _memory = (char*)malloc(65536 * _memoryPages);
    const struct ReturnValue _0 = _main(0, 0, 0, 0);
    return 0;
}
```

### 对比数据

| 指标 | 手写 C | Porffor 生成 | 差异 |
|------|--------|-------------|------|
| 源代码行数 | 96 行 | 12,880 行 | **134x** |
| 源文件大小 | 2.3KB | 353KB | **153x** |
| 二进制大小 | 33KB | 104KB | **3.15x** |
| 编译时间 | ~10ms | ~1080ms | **108x** |

### 为什么 Porffor 生成的代码这么大？

| 原因 | 说明 |
|------|------|
| **Wasm 模拟层** | 需要模拟所有 Wasm 指令（load/store 等） |
| **JS 类型系统** | JS 值可以是数字、字符串、对象，需要统一的 `ReturnValue` 结构 |
| **内置函数库** | 实现 `Math.*`、`console.log`、`Array.*` 等数百个函数 |
| **内存管理** | Wasm 线性内存 + JS 对象内存的双重管理 |
| **字符串处理** | JS 字符串是 UTF-16，需要复杂的转换逻辑 |

这是 JavaScript 的灵活性带来的代价——Porffor 需要模拟整个 JS 运行时。

---

## 实际应用建议

| 场景 | 推荐方案 |
|------|----------|
| 追求极致性能 | 手写 C / Rust |
| 快速原型开发 | Porffor（直接写 JS） |
| 已有 JS 代码移植 | Porffor（无需重写） |
| 需要跨平台 | Porffor（一次编译，多平台运行） |
| 学习/研究 | Porffor（了解 JS→Wasm→C 的转换过程） |

---

## 版本号的秘密

Porffor 使用独特的版本号格式：`0.61.2`

- **0** - Major 版本，始终为 0（项目未成熟）
- **61** - Minor 版本，**Test262 通过率百分比**（向下取整）
- **2** - Micro 版本，该 Minor 下的构建号

版本号直接告诉你这个项目对 ECMAScript 标准的支持程度！

---

## WebAssembly 提案支持

Porffor 只使用广泛实现的 Wasm 提案，确保最大兼容性：

| 提案 | 状态 | 说明 |
|------|------|------|
| Multi-value | 必需 | 多返回值 |
| Non-trapping float-to-int | 必需 | 安全的浮点转整数 |
| Bulk memory operations | 可选 | 批量内存操作 |
| Exception handling | 可选 | 异常处理 |
| Tail calls | 可选（默认关闭） | 尾调用优化 |

值得注意的是，Porffor 有意避免使用尚未广泛实现的提案（如 GC 提案）。

---

## 项目状态与资源

### 当前状态

- **开发阶段**: Pre-alpha
- **最新版本**: 0.61.2（2025-11-26 发布）
- **Test262 通过率**: ~61%
- **建议用途**: 研究、实验，不建议生产使用

### 官方资源

- **官网**: https://porffor.dev/
- **GitHub**: https://github.com/CanadaHonk/porffor
- **作者**: Oliver Medhurst (@CanadaHonk)

### 学习资源

- [DevTools.fm Episode #157](https://www.devtools.fm/episode/157) - 播客访谈
- [London Web Standards 演讲](https://londonwebstandards.org/talks/compiling-javaScript-ahead-of-time/)
- [Hacker News 讨论](https://news.ycombinator.com/item?id=41112854)

---

## 为什么叫 Porffor？

"Purple"（紫色）的威尔士语就是 "porffor"。

选择紫色的原因很简单：
- 没有其他 JS 引擎使用紫色作为主题色
- 紫色代表"雄心"（ambition），恰如其分地描述了这个项目

---

## 总结

Porffor 是一个极具实验性的项目。它通过独特的架构设计，尝试解决传统 JS 引擎在以下方面的问题：

1. **冷启动性能** - AOT 编译无需预热
2. **输出体积** - 极小的 Wasm 和原生二进制
3. **安全性** - 沙箱化执行 + 内存安全语言编写
4. **新平台** - 将 JavaScript 带到嵌入式和游戏机等新领域

虽然目前仍处于早期阶段，JS 特性支持不完整，但其创新的架构为 JavaScript 的未来应用提供了新的可能性。

也许某一天，你真的可以用 JavaScript 写一个只有 100KB 的 CLI 工具，然后编译到任何平台上运行。那将会是怎样的体验？

---

> "Purple is pretty cool. And it apparently represents 'ambition', which is one word to describe this project." — Oliver Medhurst
