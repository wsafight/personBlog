---
title: Pavex：把 Rust Web 框架从运行时库变成编译期生成器
published: 2026-05-27
description: 介绍 Pavex 如何通过编译期代码生成重新定义 Rust Web 框架，将依赖图、生命周期和错误处理提前到构建阶段检查，对比 axum 和 Loco 的设计取舍。
tags: [Rust, Web, Pavex]
category: 后端工程
draft: false
---

大多数 Rust Web 框架的心智模型很直接：写 handler、注册路由、配置中间件，然后把框架作为运行时库链接进最终二进制。axum、actix-web、rocket、warp 都属于这个范式。

Pavex 走了另一条路：先用 Blueprint 描述应用结构，Pavex 在构建阶段分析蓝图，生成专属于当前应用的 Rust crate（如 `server_sdk`），再交给编译器完成最终构建。

这让 Pavex 更像一个"Web 应用代码生成器"，而非传统框架——大量工作发生在构建阶段，而非请求到来时。

**版本说明**：本文基于 `pavex 0.2.10` / `pavex_cli 0.2.10` / `cargo-px 0.1.20`（2026-05-27）。当前版本以 `#[get]`、`#[PathParams]`、`Blueprint::routes(from![crate])` 这套 attribute-based API 为主。Pavex 仍处于 beta，完整 `pavex new` 流程需要 activation key。

---

## 先看一个最小应用

先不讲概念，直接看 Pavex 应用的核心代码。通常放在 `app/src/lib.rs`：

```rust
use pavex::blueprint::from;
use pavex::http::StatusCode;
use pavex::request::path::PathParams;
use pavex::{get, Blueprint, Response};

#[get(path = "/ping")]
pub fn ping() -> StatusCode {
    StatusCode::OK
}

#[PathParams]
pub struct GreetParams {
    pub name: String,
}

#[get(path = "/greet/{name}")]
pub fn greet(params: PathParams<GreetParams>) -> Response {
    let GreetParams { name } = params.0;
    Response::ok().set_typed_body(format!("Hello, {name}!"))
}

pub fn blueprint() -> Blueprint {
    let mut bp = Blueprint::new();
    bp.import(from![pavex]);
    bp.prefix("/api").routes(from![crate]);
    bp
}
```

这段代码有两个关键点。

第一，路由不在运行时手动拼 router，而是通过 `#[get]` 标记 handler，再由 `Blueprint` 批量导入。`bp.prefix("/api").routes(from![crate])` 的意思是：从当前 crate 找到被 Pavex 标记的路由，挂到 `/api` 前缀下。

第二，`Blueprint` 是 Pavex 的入口。它不是简单的配置对象，而是后续代码生成的输入。Pavex 根据这份蓝图生成 `server_sdk`，最终二进制再依赖这份生成代码。

`#[PathParams]` 宏展开会引用 `serde`，需要显式声明：

```toml
[dependencies]
pavex = "0.2.10"
serde = { version = "1", features = ["derive"] }
```

要完整跑起来，quickstart 流程大致是：

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://pavex.dev/install.sh | sh

pavex self setup
# 按 Pavex console 的引导完成激活，或提供 activation key：
pavex self activate "$PAVEX_ACTIVATION_KEY"

pavex new hello_pavex --template quickstart
cd hello_pavex

cargo px run
```

不用安装脚本的话，也可以把工具装到临时目录：

```bash
cargo install --locked --root temp/pavex-tools cargo-px pavex_cli
```

`pavex new` 生成的 workspace 通常会包含这几个核心目录：

```text
hello_pavex/
├── app/           # 你写 Blueprint、handler、constructor 的地方
├── server_sdk/    # Pavex 生成的 SDK，不建议手改
├── server/        # 最终 binary 入口，依赖 server_sdk
├── configuration/ # 配置
└── Cargo.toml     # workspace
```

这里最重要的细节是：不能只跑 `cargo run`。需要通过 `cargo px run` 触发 Pavex 的代码生成步骤，再构建并运行最终服务。

---

## Pavex 到底在做什么

[Pavex](https://pavex.dev/) 是 Luca Palmieri（《Zero to Production in Rust》作者）发起的 Rust Web 框架，目前仍处于 beta。

官方描述：

> A framework to build APIs in Rust, with a focus on developer productivity, type safety, and runtime performance.

从使用方式看，Pavex 的特别之处可以概括成一句话：

> 你不是把路由和依赖塞进运行时 router，而是先描述应用蓝图，再让 Pavex 为这份蓝图生成 server 代码。

它的核心工作流是：

```text
┌────────────────────────┐
│   你写的 Blueprint     │   声明路由、构造函数、中间件、错误处理器
└──────────┬─────────────┘
           │ pavex generate / cargo px
           ▼
┌────────────────────────┐
│  生成 server_sdk/      │   针对当前应用定制的 Rust 代码
└──────────┬─────────────┘
           │ cargo build
           ▼
┌────────────────────────┐
│      最终二进制        │   普通 Rust binary
└────────────────────────┘
```

所以 Pavex 的”框架能力”分成两部分：一部分是代码里依赖的普通 Rust API，另一部分是构建阶段运行的分析和生成工具。它试图把传统 Web 框架在运行时才处理的问题，提前到构建阶段解决。

---

## 它在 Rust Web 生态里的位置

Rust 后端生态已经有不少成熟选择：

| 层级 | 代表项目 | 核心关注点 |
| --- | --- | --- |
| 异步运行时 | tokio、async-std | 任务调度、I/O |
| HTTP 库 | hyper、h2 | 协议实现 |
| 轻量 Web 框架 | axum、actix-web、rocket、warp | 路由、extractor、中间件 |
| 应用框架 | Loco、cot | 项目结构、生成器、常见后端能力 |
| 编译期生成框架 | Pavex | 依赖图分析、代码生成、编译期检查 |

axum 的优势是轻、稳、生态好，特别适合直接组合 tower、hyper 和 Rust 类型系统。Loco 的优势是更接近 Rails / Django 的体验，帮你把项目结构、数据库、任务、邮件等应用层能力组织起来。

Pavex 关注的问题不一样。它不是想提供全家桶，也不是只做轻量 router。它真正想解决的是：**一个 Rust Web 应用的依赖关系、生命周期和错误处理，能不能被框架在构建阶段完整理解，然后生成更直接、更可检查的代码？**

这个方向很有 Rust 味道：能静态分析的，就尽量不要留到运行时碰运气。

---

## 核心价值一：依赖图进入编译期

Rust Web 服务里常见的依赖包括配置、数据库连接池、缓存客户端、认证信息、trace span 等。传统写法通常靠 `State<T>`、`Extension`、闭包捕获、layer 或手写初始化代码来传递。

Pavex 的做法是把依赖写在函数签名里，再用 constructor attribute 告诉框架这些类型如何构造：

```rust
use pavex::request::path::PathParams;
use pavex::{get, request_scoped, singleton, Response};

#[singleton]
pub fn build_db_pool(config: &Config) -> DbPool {
    // ...
}

#[request_scoped]
pub fn extract_user(head: &RequestHead) -> User {
    // ...
}

#[get(path = "/users/{id}")]
pub async fn get_user(
    pool: &DbPool,
    user: &User,
    params: PathParams<GetUserParams>,
) -> Response {
    // ...
}
```

Pavex 会分析这几件事：

1. `get_user` 需要 `&DbPool`、`&User` 和路径参数；
2. `DbPool` 可以通过 `build_db_pool` 构造；
3. `build_db_pool` 又需要 `&Config`；
4. `User` 是 request-scoped 依赖，每个请求构造一次；
5. 最终生成一条合法的调用链。

这类检查的价值不在于”让业务逻辑永远正确”，而在于把一类具体的集成问题提前暴露：缺 constructor、依赖无法构造、生命周期不匹配、依赖图存在环等。

如果你写过 Spring Boot 或 NestJS，会觉得这是熟悉的 DI 体验。但 Pavex 没有依赖运行时反射，也不需要把依赖塞进 `Any` 容器再取出来。它的方向是：在构建阶段把依赖关系算清楚，然后生成普通 Rust 调用代码。

---

## 核心价值二：错误更早暴露

在运行时框架里，有些问题只有请求打进来才会暴露。比如用 axum 的 `Extension` 传递共享依赖，却忘了挂载对应 layer，问题通常在运行时才出现。axum 的 `State` 已经比 `Extension` 更类型安全，但中间件组合、`Extension`、手写初始化流程里仍可能留下运行时集成错误。

Pavex 希望把这类问题尽量前移：

| 问题 | 传统运行时组合里常见的暴露时机 | Pavex 的目标 |
| --- | --- | --- |
| handler 需要的依赖没有构造方式 | 运行时请求路径触发，或靠测试覆盖 | 生成阶段失败 |
| constructor 之间形成循环依赖 | 初始化或运行时才发现 | 生成阶段失败 |
| request-scoped 依赖被错误地用于 singleton | 手写约定，容易漏 | 生成阶段失败 |
| 路由或中间件声明不一致 | 依赖框架行为和测试覆盖 | 尽量在生成阶段诊断 |

这里需要克制一点：Pavex 不能保证”编译过就不会出运行时错误”。数据库会断、配置可能错、业务分支仍然会有 bug。它真正减少的是框架集成层面的不确定性。

这个卖点对长期维护的服务尤其有吸引力。项目越大，隐式依赖和初始化顺序越容易变成负担；框架能把依赖图作为编译期对象来检查，维护成本会更可控。

---

## 核心价值三：生成代码仍然是 Rust

很多 DI 框架的问题是”看不见”：你知道某个对象会被注入，但不一定知道它从哪里来、什么时候构造、失败时怎么诊断。

Pavex 的路线相对显式。Blueprint 里能看到应用的结构：

```rust
let mut bp = Blueprint::new();
bp.import(from![crate, pavex]);
bp.prefix("/api").routes(from![crate]);
```

constructor 也不是凭空扫描出来的。需要用 `#[singleton]`、`#[request_scoped]`、`#[transient]` 标记，并通过 `bp.import(from![crate])` 导入；或者用 `bp.constructor(...)` 逐个注册。

生成结果也是 Rust 代码，可以直接读、审查，在必要时顺着生成代码理解 Pavex 为应用组织了怎样的调用链。

当然，这也带来新的调试成本：出问题时需要判断错误来自自己的代码、Blueprint 声明、Pavex 生成逻辑，还是最终 Rust 编译阶段。Pavex 把一部分运行时复杂度换成了构建期复杂度。

---

## 生命周期模型

Pavex 的依赖有明确生命周期：

| 生命周期 | 含义 | 典型用途 |
| --- | --- | --- |
| `Singleton` | 整个应用只构造一次 | 配置、数据库连接池、HTTP client |
| `RequestScoped` | 每个 HTTP 请求构造一次 | 当前用户、request id、trace span |
| `Transient` | 每次注入时构造一次 | 临时 helper、轻量值对象 |

这套模型本身不新鲜，Spring、NestJS、ASP.NET Core 都有类似概念。Pavex 的区别在于把生命周期也纳入静态分析范围，生成时就计算依赖如何复用、什么时候构造、能不能安全地被注入。

对 Rust 项目来说，这比到处手写 `Arc`、`OnceCell`、`Mutex`、closure capture 更有结构感。代价是必须先接受 Pavex 的应用组织方式。

---

## 错误处理和 API 契约

Pavex 还提供类型化错误处理机制。你可以为特定错误类型注册 error handler：

```rust
use pavex::{error_handler, Response};

#[error_handler]
fn handle_db_error(e: &DbError) -> Response {
    // ...
}
```

然后通过 Blueprint 导入或注册它。Pavex 会把 handler 可能产生的错误和对应错误处理器关联起来，尽量在生成阶段检查错误处理链是否完整。

这个设计的方向很清楚：不要让每个 handler 都手写重复的 `.map_err(...)`，而是把错误转换规则集中声明，再交给框架生成调用路径。

不过这一节也不应该被理解成”Pavex 已经解决了 API 契约的一切问题”。OpenAPI 生成更适合被看作设计上自然延伸的方向，而非当前选型时可以完全依赖的稳定能力。对今天的项目来说，Pavex 比较明确的价值仍然是依赖图、生命周期和错误处理的编译期建模。

---

## 需要付出的代价

Pavex 的方向很有意思，但它不是”换个 crate 就能无痛迁移”的框架。
| 代价 | 说明 |
| --- | --- |
| Beta 状态 | API 仍可能变化，项目要接受升级成本 |
| activation 门槛 | 当前完整 `pavex new` / `pavex generate` 流程需要 beta activation key |
| 额外构建步骤 | 日常开发要通过 `cargo-px` 触发代码生成 |
| 心智模型不同 | 需要理解 Blueprint、constructor、生命周期和生成代码之间的关系 |
| 生态较小 | 没有 Loco 那类开箱即用的鉴权、队列、邮件、后台脚手架 |
| 调试链更长 | 错误可能来自应用代码、Blueprint、生成阶段或最终编译阶段 |
| 冷构建成本 | 代码生成和额外 crate 会增加首次构建成本 |

这也是为什么 Pavex 目前更适合”关注和试点”，而不是直接替代 axum 成为所有项目的默认选择。

如果服务今天就要上线，团队也不想承担 beta 工具链和 API 演化成本，Pavex 不是合适选择。axum 或 actix-web 会更稳，Loco 这类应用框架会更快交付。

但如果你在做一个生命周期很长、接口契约严格、依赖关系复杂的内部 API 服务，Pavex 的方向值得认真观察。它不是在帮你少写几个 router 调用，而是在尝试重新定义 Rust Web 应用的组织方式。

---

## Pavex、axum、Loco 怎么选

更公平的比较不是”谁更强”，而是它们分别把复杂度放在哪里。
| 维度 | axum | Loco | Pavex |
| --- | --- | --- | --- |
| 定位 | 轻量 Web 框架 | 应用框架 | 编译期生成型 Web 框架 |
| 核心抽象 | router、extractor、tower layer | MVC / Rails-like 项目结构 | Blueprint、constructor、生成代码 |
| 依赖管理 | `State`、extractor、layer、手写组合 | 基于框架约定和 axum 生态 | 编译期依赖图 |
| 错误暴露时机 | 大量问题可由类型系统发现，部分组合问题仍靠测试和运行时 | 框架约定减少重复，但仍偏运行时应用框架 | 尽量在生成阶段诊断依赖和声明问题 |
| 生态成熟度 | 高 | 中 | 低，仍是 beta |
| 开箱即用能力 | 少，需要自己组合 | 多，适合快速搭应用 | 少，重点不在全栈脚手架 |
| 适合场景 | 通用 API、需要生态稳定性 | 快速 SaaS、CRUD 后台、Rails-like 团队 | 长期维护、强类型契约、复杂依赖图的 API 服务 |

如果需要的是稳定、生态、文档和大量现成 tower middleware，axum 仍然是最稳的选择。

如果想快速做一个业务后台，想要项目结构、数据库、任务、邮件这类东西都有人帮你组织，Loco 更符合直觉。

如果最关心的是依赖关系能不能被静态检查、框架集成错误能不能尽早暴露、生成代码能不能贴近手写结构，Pavex 才开始显出它的价值。

---

## 谁最该试 Pavex

我会把 Pavex 推荐给这几类人：

- 已经熟悉 axum / actix-web，但在大型项目里被依赖传递和初始化顺序折磨过；
- 用过 Spring Boot、NestJS 或 ASP.NET Core，喜欢 DI 容器的组织能力，但不想把 Rust 服务变成运行时反射系统；
- 正在做长期维护的内部 API、支付、金融、B2B 平台等强契约服务；
- 愿意接受 beta 工具链，并能把 Pavex 先放在非关键路径项目里试点；
- 读过 Luca Palmieri 的文章或《Zero to Production in Rust》，认同他偏工程化、类型安全、可维护性的设计取向。

不太适合的场景也很明确：

- 今天就要上线；
- 团队没有时间处理 beta API 变化；
- 项目需要大量开箱即用的鉴权、队列、邮件、后台管理能力；
- 服务很小，手写 axum router 已经足够清晰；
- 团队不想把代码生成纳入日常开发流程。
---

## Pavex 真正有意思的地方

Pavex 的意义不只是”Rust 又多了一个 Web 框架”。它更像是在问一个框架设计问题：

> 既然 Rust 已经有强类型系统和强编译器，Web 框架能不能把更多应用结构提前交给编译期处理？

过去几年，Rust Web 生态已经从”能跑”走到了”好用”。actix-web 证明了性能，axum 把 tower 和 extractor 组合得很自然，Loco 开始补上 Rails-like 应用框架体验。

Pavex 往前推的是另一个方向：框架不只是运行时库，而是一套能理解应用结构、生成应用代码的构建系统。

这条路不一定会成为主流。它有工具链门槛，有 beta 风险，也会让项目结构更依赖 Pavex 自己的设计。但它确实提出了一个值得关注的方向：在 Rust 里，Web 框架不一定只能在运行时组织请求，也可以在编译期先理解应用。

如果这个方向走通，Pavex 的价值不会只是性能更好一点，或者少写几行 boilerplate。它真正可能改变的是 Rust 后端项目的维护方式：从”靠约定和测试保证依赖都接好了”，变成”让框架在生成阶段先把依赖图检查一遍”。

这也是我认为 Pavex 值得关注的原因。不是因为它现在已经成熟到可以直接作为默认选择，而是因为它在认真探索 Rust Web 框架下一步可能长成什么样。

想跟进它的演化，可以关注 [Pavex 官方文档](https://pavex.dev/) 和 [Luca Palmieri 的博客](https://www.lpalmieri.com/)。
