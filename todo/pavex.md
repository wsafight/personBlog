# Pavex：把 Rust Web 框架从"运行时库"变成"编译期代码生成器"

> 写在前面：Rust 的后端生态过去几年涌现了 axum、actix-web、rocket、Loco 等一批优秀的 Web 框架。但它们大多还停留在"运行时框架"的范式——路由、依赖注入、中间件都在运行期解析。**Pavex 的出现，把这条路彻底走向了另一个方向：用编译期分析 + 代码生成，做出一个"为你这个应用量身定制"的 server。** 本文系统梳理 Pavex 的设计哲学、核心好处、代价，以及它在 Rust 生态中的位置。

---

## 一、Pavex 是什么？

[Pavex](https://pavex.dev/) 是 **Luca Palmieri**（《Zero to Production in Rust》作者）发起的一个 Rust Web 框架，目前处于 Beta 阶段。

它的官方定义里有一句关键词非常重要：

> **"A framework to build APIs in Rust, with a focus on developer productivity, type safety, and runtime performance."**

但比这句话更准确的描述是：

> **Pavex 不是一个运行时 Web 框架，而是一个 Rust 代码生成器（code generator）。**

它把你写的"应用蓝图（Blueprint）"在编译期分析、构造依赖图、生成一份**只属于你这个项目的、零抽象成本的 server crate**，再交给 cargo 编译。

---

## 二、Rust Web 生态里 Pavex 的位置

要理解 Pavex 的价值，先看一张生态地图：

| 层级 | 代表项目 | 核心关注点 |
| --- | --- | --- |
| 运行时 | tokio、async-std | 异步调度 |
| HTTP 库 | hyper、h2 | 协议实现 |
| **轻薄 Web 框架** | axum、actix-web、rocket、warp | 路由 + 中间件，不管业务 |
| **全栈应用框架** | Loco、cot | Rails / Django 风格，开箱即用 |
| **编译期生成框架** | **Pavex** | 编译期 DI + 零成本抽象 |

**Pavex 开辟了第三条路：既不是"轻薄路由库"，也不是"全栈应用框架"，而是把"框架本身"作为编译产物来生成。**

---

## 三、核心心智模型：Blueprint → Generate → Build

Pavex 的工作流可以一图说清：

```
┌────────────────────────┐
│   你写的 Blueprint     │   声明：路由、构造函数、中间件、错误处理器
└──────────┬─────────────┘
           │ pavex generate
           ▼
┌────────────────────────┐
│  生成 server/ crate    │   一份针对你应用定制的 Rust 代码
└──────────┬─────────────┘
           │ cargo build
           ▼
┌────────────────────────┐
│      最终二进制        │   零反射、零 dyn Trait、性能逼近手写
└────────────────────────┘
```

举个最小例子：

```rust
use pavex::blueprint::{Blueprint, router::GET};
use pavex::f;

pub fn blueprint() -> Blueprint {
    let mut bp = Blueprint::new();

    bp.constructor(f!(crate::config::load), Lifecycle::Singleton);
    bp.constructor(f!(crate::db::build_pool), Lifecycle::Singleton);
    bp.constructor(f!(crate::auth::extract_user), Lifecycle::RequestScoped);

    bp.route(GET, "/users/{id}", f!(crate::handlers::get_user));
    bp
}
```

然后跑：
```bash
cargo px generate
cargo run --bin api
```

它就会**自动算出 `get_user` 需要哪些依赖、按什么顺序构造、谁是 Singleton、谁是 RequestScoped**，并生成对应的零成本调用代码。

---

## 四、Pavex 的七大好处

### 好处 1：编译期依赖注入（最大杀招）

Rust 生态最痛的一点——没有像 Spring 那样好用的 DI 容器，因为反射几乎不可用。

Pavex 用编译期 DI 解决了这个问题：

```rust
fn build_db_pool(config: &Config) -> DbPool { ... }

async fn get_user(pool: &DbPool, id: PathParam<u64>) -> Json<User> {
    pool.fetch_user(id.0).await
}
```

Pavex 会在编译期：
1. 分析 `get_user` 需要 `&DbPool`；
2. 知道 `DbPool` 需要 `&Config`；
3. 自动生成正确的"调用链"代码。

✅ 没有 trait object、没有 Box、没有 `Arc<dyn Any>`
✅ 缺依赖、循环依赖、生命周期不匹配在 **编译期** 就能被发现
✅ 性能等同于手写最优代码

> 这是目前 Rust Web 生态里**唯一能做到编译期校验完整 DI 图**的框架。

---

### 好处 2：编译期错误检查 = "如果能编译，运行时几乎不出错"

axum 有一个常见痛点：你忘了注册某个 `State`，结果运行时 panic：

```
missing extension: AppState
```

Pavex 把这种问题全部前移到编译期：

| 错误类型 | axum 表现 | Pavex 表现 |
| --- | --- | --- |
| 忘了注册依赖 | 运行时 panic | **编译失败** |
| 中间件依赖不存在 | 运行时报错 | **编译失败** |
| handler 签名错了 | 运行时报错 | **编译失败** |
| 路由冲突 | 运行时报错 | **编译失败** |

而且报错信息是 Rust 编译器风格 + Pavex 自定义诊断，会告诉你"哪个 handler 缺了哪个依赖"，体验非常友好。

> 接近 **Elm / Haskell 那种"一次编译过，跑起来就对"** 的感觉。

---

### 好处 3：零成本抽象，性能逼近手写

因为生成的代码是"为你这个应用量身定做的"：

- 没有运行时类型擦除
- 没有 `Arc<dyn Trait>`
- 没有 HashMap state 查表（直接以局部变量传）
- 没有动态分发的中间件链

Luca 在 benchmark 里展示过：**Pavex 生成的代码性能与手写 axum 几乎相同，部分场景更优**（因为 axum 的中间件机制使用了 Box+dyn）。

---

### 好处 4：显式而非魔法

很多 DI 框架（Spring、NestJS）都有"看不见的魔法"，你不知道某个东西从哪里来。Pavex 走的是**显式**路线：

```rust
let mut bp = Blueprint::new();
bp.constructor(f!(crate::build_db_pool), Lifecycle::Singleton);
bp.constructor(f!(crate::extract_user_id), Lifecycle::RequestScoped);
bp.route(GET, "/user/{id}", f!(crate::get_user));
```

你能很清楚看到：
- 谁在什么生命周期被构造
- 哪些路由被注册
- 哪些中间件被挂载到哪些路由组

而生成的代码是**纯 Rust**，可读、可调试、可审查。

---

### 好处 5：清晰的生命周期模型

| 生命周期 | 含义 | 典型用途 |
| --- | --- | --- |
| **Singleton** | 整个应用只构造一次 | DB 连接池、配置 |
| **RequestScoped** | 每个 HTTP 请求构造一次 | 用户身份、trace span |
| **Transient** | 每次注入构造一次 | 临时 helper |

Pavex 会在编译期自动**计算最优的构造顺序和共享策略**，避免重复创建对象。这种功能在其他 Rust 框架里通常需要你手写 `Arc + OnceCell + Mutex`。

---

### 好处 6：API-First 体验

Pavex 的设计天然契合"先定义 API、后写实现"：

- Blueprint 就是路由的"事实清单"；
- 类型严格，自动可生成 OpenAPI Schema（roadmap 中）；
- 输入参数有专门类型：`PathParam`、`QueryParam`、`JsonBody`。

适合做"严格 API 契约"的服务：金融、支付、企业内部服务。

---

### 好处 7：类型化错误处理

Pavex 设计了一套**类型化错误 + 错误处理器**机制：

```rust
fn handle_db_error(e: &DbError) -> Response { ... }
bp.error_handler(f!(crate::handle_db_error));
```

任何 handler 抛出的 `DbError`，都会被自动路由到对应的 handler。

✅ 不需要 `Result<Response, ApiError>` 到处写
✅ 不需要在每个 handler 里手动 `.map_err(...)`
✅ 错误处理是否完备，**编译期校验**

---

## 五、Pavex 的代价（要诚实讲）

任何选型都有 trade-off，Pavex 也不是银弹：

| 代价 | 说明 |
| --- | --- |
| **不成熟** | 目前是 **Beta**，API 仍在演化，未到 1.0 |
| **生态小** | 没有 Loco 那种内置的鉴权 / 队列 / 邮件 |
| **学习曲线** | Blueprint + 编译期 DI 心智模型需要适应 |
| **额外构建步骤** | 需要先 `cargo px generate` 再 `cargo build` |
| **调试链略长** | 出问题时要分清是"你的代码"还是"生成的代码" |
| **冷编译时间** | 编译期分析会让首次构建稍慢 |

> Pavex 不适合"今天就要上线"的项目。但对长期维护、对正确性和性能都有要求的服务，会是非常好的投资。

---

## 六、Pavex vs Loco vs axum 对比

| 维度 | axum | Loco | **Pavex** |
| --- | --- | --- | --- |
| 路由 / HTTP | ✅ | ✅（基于 axum） | ✅（自研 + 编译期生成） |
| 依赖注入 | ❌ 手写 | 部分（State） | ✅ **编译期 DI** |
| 编译期错误检查 | 一般 | 一般 | ✅ **极强** |
| 性能 | 高 | 高 | **极高** |
| 开箱即用功能 | 无 | ✅ 多 | ❌ 少 |
| 学习曲线 | 平缓 | 平缓 | 中等 |
| 成熟度 | 高 | 中 | 低（Beta） |
| 适合场景 | 通用 API | 快速 SaaS | 长期维护、强契约服务 |

---

## 七、什么人最该试 Pavex？

✅ 写过 Spring Boot / NestJS，怀念那种 DI 体验，但又想用 Rust
✅ 受够了 axum 的 `State<T>` 运行时 panic
✅ 在做一个**长期、严肃**的后端服务，愿意承担早期风险换取长期收益
✅ 认同"编译器是最好的同事"这种工程哲学
✅ 喜欢看 Luca Palmieri 的博客和《Zero to Production in Rust》

---

## 八、一个最小可运行示例

完整跑一个 "Hello, Pavex" 大致是这样的流程：

```bash
cargo install --locked cargo-px
cargo install --locked pavex_cli

pavex new hello_pavex
cd hello_pavex

cargo px run
```

代码里你只会看到几个关键文件：

```
hello_pavex/
├── app/        # 你写的 Blueprint + handler（"框架的输入"）
├── server/     # Pavex 生成（不要手改）
└── server_sdk/ # 由 server 生成的 SDK
```

修改 `app/src/lib.rs` 中的 Blueprint，重新跑 `cargo px run`，Pavex 就会重新生成 server 代码并启动服务——所有错误都会在 `cargo px generate` 阶段或编译阶段抛出。

---

## 九、写在最后：Pavex 的意义不止于"又一个 Rust 框架"

Rust 后端社区在过去几年完成了一次"从能用到好用"的进化：
- **能用**：actix-web 时代，性能有了，但开发体验粗糙；
- **好用**：axum 把"async + tower"打磨到了极致，写 API 不再痛苦；
- **像样**：Loco 让你能像写 Rails 一样写后台。

而 **Pavex 想推进的，是再下一个阶段——"像 Rust 该有的样子"**：

> **能在编译期解决的问题，绝不留到运行时。**

它把"框架"这个概念本身，从一段链接进二进制的运行时库，变成了一个**生成器**。如果这条路走通，未来 Rust 后端的"工程范式"会被重塑——你写的不再是"调用框架的代码"，而是"描述应用的蓝图"，然后让编译器为你打造一个最优的 server。

如果说 Loco 是"让 Rust 变得像 Rails 一样好用"，
那 Pavex 就是"让 Rust Web 框架变成 Rust 该有的样子"。

> 想关注它的演化，建议订阅 [Luca Palmieri 的博客](https://www.lpalmieri.com/) 和 [Pavex 官方文档](https://pavex.dev/)。下一个版本号迈到 1.0 的那天，可能就是 Rust 后端进入"编译期框架时代"的起点。
