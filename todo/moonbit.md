# MoonBit 入门 —— 一门为 WASM 而生的语言

### 极小产物、毫秒冷启动、ML 系类型安全

> *阅读时长约 10 分钟 · 适合对 WASM、边缘计算、浏览器插件、AI 沙箱选型有兴趣的工程师*

---

## TL;DR

- **MoonBit 是什么**：一门 WASM-first 的多范式语言，由 IDEA 研究院（ReScript 核心团队）主导。
- **核心卖点**：默认配置下 WASM 产物比 Rust 小一到两个数量级、冷启动毫秒级、ML 系类型系统（无所有权心智负担）、多后端（WASM/JS/Native/RISC-V）。
- **适合谁**：在做边缘函数、浏览器扩展 MV3、小程序 WASM、AI 插件沙箱、嵌入式 WASM 的工程师。
- **不适合谁**：追求成熟生态 / 海量第三方库 / 招人友好度的团队，以及不在意冷启动和体积的纯服务端场景。

---

## 先看 MoonBit 是什么

MoonBit 是由 IDEA 研究院（张宏波团队，也是 BuckleScript/ReScript 的核心作者）主导的一门**为 WebAssembly（WASM）优化的多范式语言**，核心定位可以用一句话概括：

> **WASM-first、minimal runtime、ML 系类型系统、多运行时后端。**

> 「ML 系类型系统」指源自 OCaml / Haskell / ReScript 这一脉的类型系统：以代数数据类型（ADT）+ 模式匹配 + 强类型推断为核心，不需要写所有权或借用。

它在做的事情，本质上是把过去十年函数式语言（OCaml/Haskell/ReScript）在「类型安全 + 编译器优化」上的积累，重新对准「WASM + 边缘计算 + AI 沙箱」时代的新场景。

---

## 为什么是 MoonBit，而不是 Rust / Go / AssemblyScript？

| 语言               | WASM 大小           | 启动     | 类型安全          | 学习曲线 | 适用场景                                |
|---|---|---|---|---|---|
| **Rust**           | 几百 KB ~ MB        | 较慢     | 强 + 所有权       | 陡       | 极致性能 + 成熟生态（系统编程）         |
| **Go (TinyGo)**    | 几百 KB             | 中       | 中                | 平       | WebAssembly 的 Go 业务逻辑迁移          |
| **AssemblyScript** | 几十 KB             | 快       | TS-like           | 平       | 简单 WASM 计算、已有 TypeScript 团队    |
| **MoonBit**        | **几 KB ~ 几十 KB** | **极快** | 强（ADT + Trait） | 中       | **WASM-first 的所有体积/冷启动敏感场景** |

> 表中体积区间为各语言**默认配置下**编译一个含 JSON 解析的中等业务模块的经验值。Rust 通过 `no_std + wee_alloc + wasm-opt -Oz` 等手动调优可压到几 KB（详见附录 A.4）；MoonBit 则是默认就在这个量级。具体复现方式可参考 MoonBit 官方 benchmark 与各社区最小项目模板。

下面把 MoonBit 的差异化优势分四块展开。

### 极小 WASM 产物

`hello world` 只有几百字节，一个中等业务模块通常只在 **几 KB ~ 几十 KB** 量级，比 Rust 默认产物小一到两个数量级。

为什么能做到这一点（minimal runtime / WASM-GC / 自写优化器，以及与 Rust 的逐项对比）放在**附录 A**展开，本节不再重复。

### 编译速度极快，迭代体验接近 JS/TS

- 不依赖 LLVM，全链路自己实现 IR 与 codegen
- 增量编译（IDE 内）通常 **< 100ms**
- 全量构建中等项目通常**秒级**
- IDE 插件是 day-1 级别体验：类型提示、跳转定义、重构、格式化、文档生成都内置

> 注：「比 Rust 快一个数量级」这种说法在小项目和 IDE 增量场景下成立；大项目全量编译的差距没那么夸张，但仍然显著。

### ML 系类型安全，没有所有权的心智负担

既有 Rust 的强类型安全（ADT + 模式匹配 + Trait），又不用学生命周期和借用检查，学习曲线显著平缓。

下面是一段典型的 MoonBit 代码，写过 Rust / OCaml / Swift 的应该都能秒读：

```moonbit
/// 二叉树节点：用代数数据类型 (ADT) 描述
enum Tree[T] {
  Leaf
  Node(Tree[T], T, Tree[T])
}

/// 把元素插入二叉搜索树。要求 T 实现 Compare trait。
fn insert[T : Compare](self : Tree[T], x : T) -> Tree[T] {
  match self {
    Leaf => Node(Leaf, x, Leaf)
    Node(l, v, r) =>
      match x.compare(v) {
        0 => self
        n if n < 0 => Node(l.insert(x), v, r)
        _ => Node(l, v, r.insert(x))
      }
  }
}
```

特点速览：

- **ADT + 模式匹配**：编译器做穷尽性检查（漏一个分支就编译失败）
- **类型推断**：函数参数和返回值需要写，函数体内通常不用
- **Trait / Type Class**：类似 Rust trait，但更接近 Haskell type class
- **错误处理走 `Result` / `Option`**：没有 `null`，没有异常
- **方法语法 `obj.method()`**：接近 OO 习惯
- **管道符 `|>`**：链式调用友好
- **显式 `mut`**：默认不可变，安全

#### 一个更贴近真实业务的例子：边缘函数 JSON 校验

下面这段代码模拟一个跑在 Cloudflare Workers / Vercel Edge 上的 handler：解析请求体里的用户信息、做基本校验、返回 `Result`。能直观看到 ADT、模式匹配、`Result` 串联和管道符在真实场景里如何协作。

```moonbit
/// 用户注册请求体
struct SignupReq {
  email : String
  age : Int
}

/// 业务错误用 ADT 穷尽列出，编译器会确保 caller 处理所有分支
enum SignupError {
  InvalidEmail
  Underage(Int)        // 携带当前年龄，方便上层日志
  MalformedJson(String)
}

/// 校验一个已经解析好的请求；返回 Result 而不是抛异常
fn validate(req : SignupReq) -> Result[SignupReq, SignupError] {
  if not(req.email.contains("@")) {
    Err(InvalidEmail)
  } else if req.age < 18 {
    Err(Underage(req.age))
  } else {
    Ok(req)
  }
}

/// 边缘函数入口：把 JSON 字节流 → 解析 → 校验串成一条管道
pub fn handle_signup(body : String) -> Result[SignupReq, SignupError] {
  parse_json[SignupReq](body)
    .map_err(fn(e) { MalformedJson(e) })
    |> Result::and_then(validate)
}
```

读下来三件事会变直观：错误类型本身就是一份 API 文档（`SignupError` 的每个分支都是潜在错误）；`|>` 让"解析 → 校验"的流水线一眼看清楚；编译器会在你忘了处理某个 `SignupError` 分支时直接报错。

### 多后端，一份代码跑在多个运行时

MoonBit 不止能编 WASM，目标后端覆盖：

| 后端                     | 生产可用性     | 典型场景                                  |
|---|---|---|
| **WASM (GC)**            | 主推 / 稳定    | 现代浏览器、Cloudflare Workers、新版 Node |
| **WASM (linear memory)** | 稳定           | 兼容老浏览器、嵌入式 WASM、无 GC 环境     |
| **JavaScript**           | 稳定           | 直接给前端、Node.js、不支持 WASM 的环境   |
| **Native (LLVM)**        | 实验性 / 开发中 | 服务端高性能、CLI 工具                    |
| **RISC-V**               | 实验性 / Demo  | 嵌入式、IoT                               |

实际意义：**一份业务逻辑同时产出 `.wasm` 和 `.js`，前端代码可以直接 `import`，边缘函数也能直接部署**——不用像 Rust 那样维护 `wasm-bindgen` 的 JS 胶水 + `napi-rs` 的 Native 绑定两套链路。

---

## MoonBit 适合做什么？

结合上面的核心特性（极小 WASM、冷启动极快、类型安全、沙盒友好、多后端），下面几个场景是它的天然甜区：

| 场景                                                              | 为什么适合                                                                  | 主要替代方案           |
|---|---|---|
| **边缘函数**（Cloudflare Workers / Vercel Edge / Fastly Compute） | 产物小 → 冷启动快（按毫秒计费），沙盒安全，编译快迭代快                     | Rust、JS/TS、AssemblyScript |
| **浏览器插件 / Chrome MV3 Service Worker**                        | MV3 SW 频繁被 kill，冷启动是核心痛点；产物小 + 启动快直接转化为体验差距     | Rust、TS               |
| **小程序 / 快应用的 WASM 业务逻辑**                                | 产物严格限 MB 级，冷启动是核心体验指标，类型安全防线上崩溃                  | AssemblyScript、C/C++、Rust |
| **IoT 嵌入式设备的 WASM 沙箱业务**                                 | 极小 RAM 占用、RISC-V 后端可用、沙箱隔离防崩溃                              | C/C++、Rust、MicroPython |
| **AI 助手的用户自定义插件 / DSL 沙箱**                             | WASM 天然沙箱 + 类型安全防崩溃，纯函数倾向方便审计，体积小方便下发          | QuickJS、V8 isolate、用户手写 JS |
| **前端 Monorepo 的共享业务逻辑**                                   | 多后端（JS + WASM）→ 一份代码同时跑 Web Worker / Node.js / 浏览器扩展      | TypeScript、Rust       |
| **游戏引擎 / 实时渲染的轻量业务逻辑**                              | 极小 RAM、冷启动快、纯函数式编程适合游戏规则                                | Lua、Rust、AssemblyScript |
| **WASM 组件模型（Component Model）的组件**                         | 类型系统天生贴合组件模型的类型契约，体积小适合分发，编译快迭代快            | Rust、C/C++            |

一句话：**所有对「WASM 产物大小、冷启动速度、沙盒安全、编译迭代速度」敏感的场景，都是 MoonBit 的潜在舞台**。

---

## 什么时候不要选 MoonBit？

MoonBit 是新语言，下面这些场景**目前不推荐**用它，避免踩坑：

- **依赖海量第三方库的项目**：`serde` / `tokio` / `axum` / `react` 这种生态级别的库 MoonBit 还没有，自己造轮子的成本远大于 WASM 体积带来的收益。
- **纯服务端 / 不在乎冷启动的场景**：常驻进程的服务端 API、批处理 ETL、数据科学计算，MoonBit 的核心卖点（冷启动 + 体积）几乎用不上，Rust / Go / Java 更稳。
- **需要稳定 ABI / FFI 的库**：MoonBit 的 ABI 和 Native 后端还在演化，跨语言绑定（被 C / Python / Java 调用）暂时不如 Rust 成熟。
- **大团队招人 / 长期维护的核心系统**：会写 MoonBit 的工程师还很少，社区文档、Stack Overflow、AI 训练数据都不足，新人 onboarding 成本高。
- **强调「成熟稳定」高于一切的传统业务**：语言本身、标准库、IDE、构建系统都还在快速演进，每个月升级可能带来小幅 breaking change。
- **商业化 / 闭源场景**：注意 MoonBit 当前的许可证条款，把它放进商业产品前先确认与你的发布需要兼容（见官网最新声明）。

如果你的核心需求落在上面任一条里，**先观望，等生态进一步成熟**。

---

## 快速上手

想立刻动手，三行命令搞定：

```bash
# 1. 安装（macOS / Linux）
curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash

# 2. 创建项目
moon new hello && cd hello

# 3. 运行
moon run src/main
```

或者直接用浏览器试 → [try.moonbitlang.com](https://try.moonbitlang.com/)（无需安装）。

VS Code 用户额外装一个 [MoonBit 官方插件](https://marketplace.visualstudio.com/items?itemName=moonbit.moonbit-lang)，类型提示、跳转、格式化全都有。

---

## 一句话总结

> **MoonBit 不是来替代 Rust 或 JavaScript 的——它是来填「WASM-first，极致体积/冷启动，类型安全」这个空白的。**
>
> 如果你正在做边缘函数、浏览器插件、小程序 WASM、AI 沙箱、嵌入式 WASM，或者只是想写一份代码同时跑在多个 WASM/JS/Native 运行时上，那么在做技术选型时，值得把 MoonBit 放进评估清单里。

---

## 附录 A：为什么 Rust 编译出来的 WASM 比 MoonBit 大这么多？

这是 MoonBit 入门最容易引发好奇的问题。Rust 的 WASM 大小问题不是「天生就慢」，而是**几个默认设计决策 + 可选优化的门槛**共同导致的，下面拆开讲透。

### A.1 自带胖 std 运行时，静态链接进 WASM

Rust 标准库（`std`）是默认静态链接的——哪怕你只写了一句 `println!("hello")`，链接器也会把：

- 格式化字符串引擎
- 字符串 / 集合分配器链（`Box<[u8]>` / `Vec` / `String`）
- Unicode 处理
- Panic 处理（堆栈打印、unwind 捕获）
- 错误格式化（`Debug` / `Display` trait）
- 沙箱里没用的存根代码（文件 I/O 等）

这些东西攒在一起就是 **几十 KB 打底**，稍微用点复杂功能（如 `serde` 反序列化）分分钟破 **100KB ~ 200KB**。

相比之下，**MoonBit 是整程序优化（WPO）优先 + minimal runtime**，没用的函数会被彻底消除（包括整个字符串分配器链），真正做到「用多少编多少」。

### A.2 不默认用 WASM-GC，得自己带内存分配器

Chrome 119+ 才支持 `wasm-gc`，此前（以及现在很多兼容老浏览器的项目），Rust 必须把**自己的内存分配器**也编进 WASM：

- 默认是 [`dlmalloc`](https://github.com/alexcrichton/dlmalloc-rs)（几十 KB）
- 换成 [`wee_alloc`](https://github.com/rustwasm/wee_alloc) 能减到几 KB，但性能会下降
- 还是得手写 `#[global_allocator]`、自己处理 free list 和内存碎片

**MoonBit 从第一天就默认用 WASM-GC 当主要后端**，根本不需要把内存管理链编进产物——WASM 虚拟机帮你做 GC，这几十 KB 直接省了。

### A.3 LLVM 是通用后端，没默认做 WASM 特化的激进优化

Rust 的后端是 **LLVM**——这货是为 x86 / ARM 写的通用编译器，不是为 WASM 特化的。默认配置下：

- 内联（inlining）做不到极致（LLVM 保守，怕破坏调试体验）
- 泛型单态化有时会过度重复代码
- 符号表、调试信息默认可能还留个尾巴
- 没默认开启 `wasm-opt`（`binaryen` 工具链）这类后处理工具

**MoonBit 自己写了一套专门针对 WASM 的 IR 和优化管线**，从设计上就把「极致体积」放在优先级上。

### A.4 Rust 能不能变小？当然能！但你要手动做 6 件事

Rust WASM 大是**默认配置的问题**，不是能力问题——如果你愿意花时间调优，能把 `hello world` 压到 **几 KB**，但门槛不低：

| 步骤 | 说明 |
|---|---|
| 1 | 把 `std` 换成 `#![no_std]` + 自己造轮子（字符串、集合、错误处理全得自己写） |
| 2 | 在 `Cargo.toml` 里开启 `opt-level = "z"`、`lto = true`、`strip = true` |
| 3 | 把 `panic` 设为 `panic = "abort"`，移除整个 unwinding 栈 |
| 4 | 自己配 `wee_alloc` / `lol_alloc` 当全局分配器 |
| 5 | 手动跑 `wasm-opt -Oz` 后处理一遍 |
| 6 | 把 `wasm-bindgen` 的胶水代码也优化一遍 |

一套下来，**确实能和 MoonBit 差不多小**——但代价是：

- 学习成本陡增（`no_std` 生态和标准库生态完全是两个世界）
- 维护成本翻倍
- 用不了 `serde` / `reqwest` 这类你依赖的标准库生态

### A.5 一句话对比

| 维度            | Rust 默认配置             | MoonBit 默认配置                  |
|---|---|---|
| **std/runtime** | 胖 std，静态链接          | minimal runtime，WPO 激进消除     |
| **内存管理**    | 自带 `dlmalloc` 进 WASM   | 用 WASM-GC，不编进去              |
| **优化后端**    | LLVM（通用，保守）        | 自写 IR，专门给 WASM 特化         |
| **后处理**      | 不默认开 `wasm-opt`       | 内置 `wasm-opt` 级别优化          |
| **符号/debug**  | 可能留尾巴                | 激进 strip + 最小化 debug info    |

> **Rust 是「默认安全、默认完整、性能第一，体积让用户自己调」；**
> **MoonBit 是「默认极简、默认针对 WASM 特化、冷启动 / 体积第一」。**
>
> 这两种设计哲学没有对错——看你的场景是「要极致性能 + 成熟生态」还是「要极致体积 + 冷启动速度」。

---

## 参考资源

- 官网：[moonbitlang.com](https://www.moonbitlang.com/)
- 在线 Playground：[try.moonbitlang.com](https://try.moonbitlang.com/)
- 官方文档：[moonbitlang.com/docs](https://www.moonbitlang.com/docs/)
- GitHub：[moonbitlang/core](https://github.com/moonbitlang/core)（标准库）
- VS Code 插件：[MoonBit Language](https://marketplace.visualstudio.com/items?itemName=moonbit.moonbit-lang)

> 想加入中文社区或查看官方博客 / Roadmap，请直接通过上面官网首页的导航跳转——这些链接随官方调整变化较快，本文不再单独固化。本文中的体积、冷启动数字均建议读者结合官方 benchmark 自行复现。
