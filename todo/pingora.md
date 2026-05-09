# 用 Pingora 造一个类 Kong 的网关：从零到能跑

## 为什么是 Pingora

[Pingora](https://github.com/cloudflare/pingora) 是 Cloudflare 开源的 Rust 异步 HTTP 代理框架，承载着 Cloudflare 自家每秒 4000 万+ 请求的流量，是他们用来替换 Nginx 的那套东西。到 2026 年 5 月，Cloudflare 还把自家 Cache 的新代理迁到了 Pingora 上，说明它不只是一个实验性项目，而是已经进入 Cloudflare 更核心的数据面。

做网关绕不开几个问题：性能、稳定性、可扩展性、热重启。Pingora 在这几点上都有明确答案：

- **性能**：基于 tokio 的多线程异步运行时。在 Cloudflare 自己的生产负载下，Pingora 相比原来的 Nginx 方案节省了 70% 的 CPU 和 67% 的内存。这个数字不代表任何业务迁过去都会原样复现，但足以说明它的设计目标不是玩具级反代。
- **内存安全**：Rust 的所有权模型让 Nginx 那类 C 代码里常见的 UAF、越界访问从根上消失。
- **模块化**：官方把代理、负载均衡、缓存、超时、限流这些做成了独立 crate，可以按需拼装。
- **优雅升级**：内置 zero downtime graceful upgrade 机制，新老进程通过 Unix socket 传递 listen fd，现有连接继续在老进程处理完，新连接进新进程——这是 Kong/Nginx 级别网关的必备能力。

这里顺手提醒一个版本问题：Pingora 早期版本已经暴露过面向 ingress proxy 场景的 HTTP/1.x request smuggling 漏洞，Cloudflare 在 2026-03-02 发布的 `0.8.0` 修复了相关问题。新项目不要照着旧文章锁 `0.4`、`0.5` 这类版本，至少应该从 `0.8` 起步，并把网关依赖纳入常规安全升级流程。

和 Kong 的关系怎么看？Kong 是 `OpenResty (Nginx + Lua) + 控制面 + 插件生态`。Pingora 对标的只是最底层的 `OpenResty` 那一层——**数据面**。上面的控制面、Admin API、插件市场，都得自己搭。所以用 Pingora 做 Kong 替代，省掉的是 Nginx 的技术债，要补的是 Kong 这些年积累的生态。

## 核心抽象：ProxyHttp trait

Pingora 把一次代理请求的生命周期拆成若干个 hook，你通过实现 `ProxyHttp` trait 往里填逻辑：

```
Client --> [request_filter] --> [upstream_peer] --> Upstream
                                       |
                                       v
                              [upstream_request_filter]
                                       |
                                       v
                              [response_filter] <-- Upstream
                                       |
                                       v
                              [logging]
Client <---
```

最少只需要实现一个方法——`upstream_peer`，告诉 Pingora 这个请求转发到哪里。剩下的 hook 全部可选。

## 动手搭一个最小网关

### 初始化项目

```bash
cargo new pingora-gw
cd pingora-gw
```

`Cargo.toml`：

```toml
[package]
name = "pingora-gw"
version = "0.1.0"
edition = "2024"

[dependencies]
async-trait = "0.1"
pingora = { version = "0.8", features = ["lb", "openssl"] }
pingora-core = { version = "0.8", features = ["openssl"] }
pingora-proxy = { version = "0.8", features = ["openssl"] }
pingora-load-balancing = { version = "0.8", features = ["openssl"] }
pingora-limits = "0.8"
tokio = { version = "1", features = ["full"] }
log = "0.4"
env_logger = "0.11"
once_cell = "1"
```

上面用 `openssl` 是因为第一个 demo 会连 HTTPS 上游。如果只做明文 HTTP 代理，可以按需拿掉 TLS 相关 feature。

### 一个转发到固定上游的代理

`src/main.rs`：

```rust
use async_trait::async_trait;
use pingora_core::server::Server;
use pingora_core::upstreams::peer::HttpPeer;
use pingora_core::Result;
use pingora_proxy::{ProxyHttp, Session};

pub struct Gateway;

#[async_trait]
impl ProxyHttp for Gateway {
    type CTX = ();
    fn new_ctx(&self) -> Self::CTX {}

    async fn upstream_peer(
        &self,
        _session: &mut Session,
        _ctx: &mut Self::CTX,
    ) -> Result<Box<HttpPeer>> {
        let peer = HttpPeer::new(
            ("1.1.1.1", 443),
            true,                 // use_tls
            "one.one.one.one".to_string(),
        );
        Ok(Box::new(peer))
    }
}

fn main() {
    env_logger::init();
    let mut server = Server::new(None).unwrap();
    server.bootstrap();

    let mut proxy = pingora_proxy::http_proxy_service(&server.configuration, Gateway);
    proxy.add_tcp("0.0.0.0:8080");
    server.add_service(proxy);
    server.run_forever();
}
```

跑起来：

```bash
RUST_LOG=info cargo run
curl -H "Host: one.one.one.one" http://127.0.0.1:8080/
```

30 行代码，一个 HTTPS 反向代理就出来了。

### 加上路由和负载均衡

真实网关要做的第一件事是路由——根据 Host、Path 挑上游集群。

```rust
use pingora_load_balancing::{selection::RoundRobin, LoadBalancer};
use std::sync::Arc;

pub struct Gateway {
    api_cluster: Arc<LoadBalancer<RoundRobin>>,
    web_cluster: Arc<LoadBalancer<RoundRobin>>,
}

#[async_trait]
impl ProxyHttp for Gateway {
    type CTX = ();
    fn new_ctx(&self) -> Self::CTX {}

    async fn upstream_peer(
        &self,
        session: &mut Session,
        _ctx: &mut Self::CTX,
    ) -> Result<Box<HttpPeer>> {
        let path = session.req_header().uri.path();
        let cluster = if path.starts_with("/api/") {
            &self.api_cluster
        } else {
            &self.web_cluster
        };

        let upstream = cluster
            .select(b"", 256)
            .ok_or_else(|| pingora::Error::new_str("no upstream available"))?;

        // Backend -> SocketAddr
        Ok(Box::new(HttpPeer::new(upstream.addr, false, String::new())))
    }
}

fn main() {
    env_logger::init();
    let mut server = Server::new(None).unwrap();
    server.bootstrap();

    let api_lb = LoadBalancer::try_from_iter(["10.0.0.1:8000", "10.0.0.2:8000"]).unwrap();
    let web_lb = LoadBalancer::try_from_iter(["10.0.1.1:80", "10.0.1.2:80"]).unwrap();

    let gateway = Gateway {
        api_cluster: Arc::new(api_lb),
        web_cluster: Arc::new(web_lb),
    };

    let mut proxy = pingora_proxy::http_proxy_service(&server.configuration, gateway);
    proxy.add_tcp("0.0.0.0:8080");
    server.add_service(proxy);
    server.run_forever();
}
```

`LoadBalancer` 支持 `RoundRobin`、`Random`、`FNVHash`、`Consistent`（一致性哈希）等选择算法，换个泛型参数就行。注意上面的 `LoadBalancer` 还没挂健康检查——所有节点都会被当成健康节点轮询，下一节补上。

### 健康检查

没有健康检查的负载均衡只能算轮询转发。Pingora 把健康检查做成 `BackgroundService`：

```rust
use pingora_core::services::background::background_service;
use pingora_load_balancing::health_check::TcpHealthCheck;
use std::time::Duration;

let mut api_lb = LoadBalancer::try_from_iter(["10.0.0.1:8000", "10.0.0.2:8000"]).unwrap();
api_lb.set_health_check(TcpHealthCheck::new());
api_lb.health_check_frequency = Some(Duration::from_secs(1));

let api_bg = background_service("api_health_check", api_lb);
let api_cluster = api_bg.task();  // Arc<LoadBalancer<_>>
server.add_service(api_bg);
```

要做 HTTP 层健康检查（比如探测 `/healthz` 并校验 200），用 `HttpHealthCheck` 即可。

### 插件化：请求过滤 hook

Kong 插件的本质就是在请求生命周期上挂函数。Pingora 的等价物是重写几个 hook：

```rust
async fn request_filter(
    &self,
    session: &mut Session,
    _ctx: &mut Self::CTX,
) -> Result<bool> {
    // 鉴权插件
    let token = session
        .req_header()
        .headers
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    if token != Some("Bearer secret") {
        let _ = session.respond_error(401).await;
        return Ok(true);  // true = 已响应，终止后续
    }
    Ok(false)
}

async fn upstream_request_filter(
    &self,
    _session: &mut Session,
    req: &mut pingora::http::RequestHeader,
    _ctx: &mut Self::CTX,
) -> Result<()> {
    // 改写发给上游的头
    req.insert_header("x-gateway", "pingora-gw")?;
    Ok(())
}

async fn response_filter(
    &self,
    _session: &mut Session,
    resp: &mut pingora::http::ResponseHeader,
    _ctx: &mut Self::CTX,
) -> Result<()> {
    resp.insert_header("x-served-by", "pingora-gw")?;
    Ok(())
}
```

把这些 hook 封装成独立的 `trait Plugin`，再在 `Gateway` 里持有 `Vec<Box<dyn Plugin + Send + Sync>>` 按顺序执行，就是一个极简的插件系统。

不过真要往 Kong 插件模型靠，还得把几个边界先定义清楚：

- **执行顺序**：全局插件、路由插件、服务插件如果都存在，谁先执行。
- **短路语义**：鉴权、限流这类插件可以提前响应，后续插件是否继续执行。
- **错误处理**：插件返回错误时是直接 500、转成 4xx，还是进入统一错误页。
- **上下文传递**：一次请求里鉴权结果、租户 ID、trace ID 要放进 `CTX`，不能靠全局变量传。
- **流式 body**：只看 header 很简单；一旦要改写请求体/响应体，就要处理 backpressure、大小限制和超时。

如果插件都是内部团队写的，Rust trait 静态编译最简单，性能也最好。如果要开放给业务方动态扩展，WASM 会更合适，但要额外处理 ABI、沙箱权限、执行超时、内存上限和冷启动成本。

### 限流

`pingora-limits` 提供的是高效的事件计数和频率估算能力。`Rate` 可以估算某个 key 在一个时间窗口内的事件速率；`Estimator` 底层是 Count-Min Sketch，用来做近似频率统计。它不是一个完整的、强一致的分布式限流系统。

在单进程 demo 里，可以直接在 `request_filter` 里卡一下：

```rust
use pingora_limits::rate::Rate;
use once_cell::sync::Lazy;
use std::time::Duration;

static RATE: Lazy<Rate> = Lazy::new(|| Rate::new(Duration::from_secs(1)));

// request_filter 里：
let client_ip = session
    .client_addr()
    .and_then(|a| a.as_inet().map(|s| s.ip().to_string()))
    .unwrap_or_default();
let curr = RATE.observe(&client_ip, 1);
if curr > 100 {
    let _ = session.respond_error(429).await;
    return Ok(true);
}
```

这个写法适合“单机、近似、保护性”的限流，比如防止某个 IP 在当前进程里打爆服务。生产里如果要做租户级配额、跨节点全局限流、按 route/service/plugin 组合限流，通常还得接 Redis、etcd、专门的 quota service，或者把限流状态下沉到统一控制面。

## 热重启

这是 Pingora 对比很多 Rust 网关的关键优势，但流程要说准确：旧进程和新进程需要先约定同一个 `upgrade_sock`，新进程用 `--upgrade` 启动，然后旧进程收到 `SIGQUIT` 后把监听 socket 交给新进程。

先在配置里放上 upgrade socket：

```yaml
---
version: 1
pid_file: /run/pingora-gw.pid
upgrade_sock: /tmp/pingora-gw-upgrade.sock
daemon: true
```

首次启动不需要 `--upgrade`：

```bash
./pingora-gw -c gateway.yaml
```

注意，前面的最小 demo 为了少写几行用了 `Server::new(None)`。如果要让 `-c`、`--upgrade` 这些参数生效，入口要改成读取 Pingora 的启动参数：

```rust
use pingora_core::server::configuration::Opt;

fn main() {
    env_logger::init();

    let opt = Opt::parse_args();
    let mut server = Server::new(Some(opt)).unwrap();
    server.bootstrap();

    // add_service...
    server.run_forever();
}
```

发布新版本时：

```bash
OLD_PID=$(cat /run/pingora-gw.pid)
./pingora-gw -c gateway.yaml --upgrade
kill -QUIT "$OLD_PID"
```

新进程先等着从旧进程接收监听 socket；旧进程收到 `SIGQUIT` 后开始交接，随后进入 graceful shutdown：停止接新连接，把在途请求处理完再退出。配合 systemd 的 `ExecReload` 和 `daemon_wait_for_ready`，可以做到发布时不拒绝新连接。

## 从 Demo 到生产还差什么

到这里，代码已经能说明 Pingora 适合做网关数据面，但离“类 Kong”还有一段产品化距离。最容易被低估的是这些部分：

1. **路由模型**：不能只有 `path.starts_with("/api/")`。至少要支持 Host、Path、Method、Header、Query 的组合匹配，还要定义优先级、通配符、正则、strip_path、preserve_host、重定向和默认 404 行为。
2. **上游治理**：健康检查之外，还要有超时、重试、熔断、慢启动、连接池大小、最大空闲时间、失败节点恢复策略，以及上游 TLS 校验和 SNI 配置。
3. **请求边界**：网关必须明确限制 header/body 大小、body 读取超时、上传流式转发、WebSocket/gRPC 行为、HTTP/1 与 HTTP/2 转换边界，否则很容易在大包、慢连接和协议歧义上踩坑。
4. **安全默认值**：要处理 `X-Forwarded-For` 信任链、真实客户端 IP、Host 头校验、非法 Content-Length、Transfer-Encoding 歧义、CONNECT/Upgrade 策略，以及请求走到上游前的统一规范化。
5. **配置热更新**：路由、上游、插件配置不能跟代码一起发版。常见做法是控制面产出不可变配置快照，数据面用 `arc-swap` 这类原子指针切换，失败时继续用旧配置。
6. **可观测性**：至少要有结构化访问日志、错误日志、Prometheus 指标、OpenTelemetry trace 注入、按路由/上游/插件维度打标签，以及高基数标签的保护策略。
7. **缓存**：Pingora 有缓存相关 crate，Cloudflare 自己的 Cache 也已经迁到 Pingora 新代理上。但开源 README 仍然提醒 proxy cache 集成偏实验，缓存 key、Vary、Set-Cookie、认证请求和租户隔离都要自己审慎设计。

这些不是 Pingora 不能做，而是 Pingora 不替你做产品决策。它给的是一把非常锋利的数据面工具，控制面、配置模型、插件治理和运维体验还是要自己补。

## 和 Kong 的对比打分

| 能力 | Kong | 用 Pingora 自造 |
|---|---|---|
| 数据面性能 | 够用，基于 OpenResty | 强，适合深度定制数据面 |
| 路由/负载均衡/健康检查 | 产品级开箱即用 | 基础库支持，需要自建模型 |
| 插件生态 | 庞大，Lua 热加载 | 需要自建，Rust 静态编译或 WASM |
| 控制面/Admin API | 成熟 | 从零 |
| 声明式配置 | 有（DB-less 模式） | 自己设计 |
| 可观测性 | Prometheus/Zipkin/OpenTelemetry 插件齐全 | 要自己接，并定义标签体系 |
| 热重启 | 有 | 有 |
| 安全默认值 | 成熟网关产品默认策略多 | 需要自己审协议和边界 |
| 运维心智负担 | 低 | 高 |

结论：**追求极致性能、插件种类可控的场景**（内部网关、边缘代理、特定领域 API 网关），Pingora 非常合适；**追求开箱即用、插件市场、快速迭代**的通用 API 网关产品，Kong 的性价比依然更高——除非你愿意投入团队补齐那层生态。

## 接下来可以做什么

如果沿着这篇继续写成一个系列，可以按这个顺序推进：

1. **声明式配置**：把 route、service、upstream、plugin 拆成配置对象，先支持 YAML，再考虑 etcd/DB。
2. **配置热更新**：单独起 Admin API，用版本号 + 校验 + `arc-swap` 替换运行时配置。
3. **插件系统**：先做 Rust trait 插件，跑通鉴权、限流、header 改写；确实需要业务方扩展时，再引入 WASM。
4. **可观测性**：接 Pingora 自带的 Prometheus HTTP service、`prometheus` crate 和 OpenTelemetry，把 route、upstream、status、latency、error source 这些关键维度打出来。
5. **TLS 终端 + SNI 路由**：接证书管理、ACME 自动续签、上游 TLS 校验和 mTLS。

把这些补齐，才真正接近一个能长期运维的内部网关。

## 参考

- Pingora 仓库：https://github.com/cloudflare/pingora
- Pingora 官方 user guide：https://github.com/cloudflare/pingora/blob/main/docs/user_guide/intro.md
- Cloudflare 发布博客：https://blog.cloudflare.com/pingora-open-source/
- Pingora 0.8.0 release：https://github.com/cloudflare/pingora/releases/tag/0.8.0
- Pingora request smuggling 修复说明：https://blog.cloudflare.com/pingora-oss-smuggling-vulnerabilities/
- Pingora graceful upgrade 文档：https://github.com/cloudflare/pingora/blob/main/docs/user_guide/graceful.md
- Pingora 配置文档：https://github.com/cloudflare/pingora/blob/main/docs/user_guide/conf.md
- Pingora RateLimiter quickstart：https://github.com/cloudflare/pingora/blob/main/docs/user_guide/rate_limiter.md
- Cloudflare Cache 迁移到 Pingora：https://developers.cloudflare.com/changelog/post/2026-05-04-pingora-powers-cache/
