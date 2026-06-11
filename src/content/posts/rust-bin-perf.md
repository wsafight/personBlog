---
title: 把 Rust 二进制文件压到极致：基于 Rust 1.96 的实测瘦身指南
published: 2026-06-11
description: 在 Rust 1.96 上逐条实测的二进制瘦身指南，涵盖 release/strip、profile 全家桶、nightly build-std、no_main/no_std 与 UPX，讲清每一步的原理、收益与代价。
tags: [Rust, 性能优化, 二进制体积, 编译优化, 嵌入式]
category: Rust
draft: false
---


Rust 编译出来的可执行文件常常让人意外地大——一个空的 "Hello, world!" 默认 release 构建就有几百 KB。对于嵌入式设备、容器镜像、WASM 等对体积敏感的场景，这就成了问题。

本文整理自 [min-sized-rust](https://github.com/johnthagen/min-sized-rust)，并在 **Rust 1.96.0（2026-05-25，aarch64-apple-darwin / Apple Silicon）** 上逐条实测。所有命令和数字都来自本机真实运行，按"收益从大到小、改动从小到大"排列。

> **实测基准**：`cargo new` 出来的空项目，`cargo build --release` 后约 **421KB**。下面的每一步都在这个基准上叠加。

> **太长不看 · 三句话选档**
> - **绝大多数项目**：只用第二节那套稳定 profile，零代码改动砍掉约 1/3（421KB → 279KB），就此打住。
> - **体积极度敏感**（WASM / 嵌入式 / 镜像）：再上第三节 nightly 的 build-std，能干到 84KB。
> - **追求极限**（裸机 / 几 KB）：才考虑第四节 `no_std`，但要写大量 `unsafe`。
>
> 越往后收益越大、代价也越大。先吃免费午餐，按需加码即可。

---

## 一、零改动就能拿到的收益

### 1. Release 模式编译

最基础的一步。Debug 构建因为关闭了优化，体积往往要大 30% 以上。

```bash
cargo build --release
```

> **原理**：Debug 默认 `opt-level = 0`，编译器几乎不做优化，保留冗余指令、不内联、不消除死代码。Release 默认 `opt-level = 3`，开启内联、死代码消除、常量折叠，机器码更紧凑——体积变小是代码优化的副产品。

### 2. 去除符号表（strip）

Rust 1.59 起已稳定，直接在 `Cargo.toml` 里配置即可（1.96 当然支持）：

```toml
[profile.release]
strip = true
```

旧版本可手动执行 `strip target/release/your_binary`。

> **原理**：产物里除了机器码，还有**符号表**（函数/变量名）和调试信息（DWARF），它们只供调试器和栈回溯使用，对运行无影响。`strip` 让链接器删掉这些段。Rust 符号经过 mangling 后名字很长，符号表往往占比可观，所以收益明显。代价：崩溃时拿不到带符号的栈回溯。

---

## 二、调优编译参数（稳定特性，强烈推荐）— 421KB → 279KB

下面这些都写在 `Cargo.toml` 的 `[profile.release]` 段，组合使用效果最好。这套"全家桶"在 Rust 1.96 上完全稳定：

```toml
[profile.release]
opt-level = "z"      # 以体积为优化目标，也可试 "s"
lto = true           # 链接时优化，跨 crate 消除死代码
codegen-units = 1    # 单一代码生成单元，牺牲编译速度换更彻底的优化
panic = "abort"      # 去掉栈展开代码，代价是 panic 后直接终止
strip = true         # 去符号表
```

> **本机实测**：套用以上配置后，421KB → **279KB**（缩小约 34%），零代码改动、纯稳定特性。这是绝大多数项目应该止步的地方。

各项说明：

- **`opt-level = "z"`**：`3` 为性能优化，会激进内联、循环展开、向量化，这些都**增大**代码；`"s"` 关掉这些膨胀型优化，`"z"` 更狠（连为速度做的循环向量化也禁掉）。谁更小取决于项目里"展开换速度"的代码占比，两个都测一下。代价：放弃了为速度做的优化，**热点路径可能变慢**（CPU 密集型程序尤其明显），换体积前先确认性能可接受。
- **`lto = true`**：默认每个 crate 单独优化，**跨 crate 边界**的死代码和可内联函数处理不到。LTO 在链接阶段把所有中间代码（LLVM IR）汇总再做一轮全局优化，跨 crate 消除未调用函数、内联小函数。代价：处理全量 IR，编译变慢、吃内存。
- **`codegen-units = 1`**：为并行编译，Rust 默认把一个 crate 切成 16 个代码生成单元，但切分会形成优化边界（跨单元无法内联/去重）。降到 1 让整个 crate 作为整体优化，重复代码更少。代价：失去并行，编译更慢。
- **`panic = "abort"`**：默认 panic 策略是 **unwind**（栈展开），需要在每个可能 panic 的函数里生成清理用的 landing pad 和异常表（支持 `catch_unwind` 和析构）。这些"展开骨架"散布全程序，体积不小。改成 `abort` 后 panic 直接终止，无需生成展开代码。代价：不能 `catch_unwind`，panic 时栈上对象不再析构。

---

## 三、Nightly 进阶手段（截至 1.96 仍未稳定）— 279KB → 84KB

以下需要 nightly 工具链。注意：min-sized-rust README 用的是 `x86_64-apple-darwin`，**Apple Silicon 机器要改成 `aarch64-apple-darwin`**（用 `rustc -vV` 看自己的 host）。

### 3. 去掉 panic 位置信息 / Debug 格式化

```bash
RUSTFLAGS="-Zlocation-detail=none -Zfmt-debug=none" cargo +nightly build --release
```

`-Zlocation-detail=none` 剥离 panic 里的文件名/行号；`-Zfmt-debug=none` 让 `#[derive(Debug)]` 失效，`dbg!()`、`unwrap()` 等会受影响，谨慎使用。

> **原理**：每次 `panic!`、`unwrap()` 都会嵌入一个 `&Location`（文件名字符串 + 行号 + 列号），unwrap 越多这些字面量累积越多；`location-detail=none` 把它们替换成占位空值。`fmt-debug=none` 则让 `derive(Debug)` 生成的 `fmt` 变成空操作，省掉格式化代码和字段名字符串。代价：报错信息和 `{:?}` 输出全失真。

### 4. 用 build-std 重新编译标准库 ⭐

把标准库本身也按体积优化重新编译，这是 nightly 路线收益最大的一步：

```bash
rustup component add rust-src --toolchain nightly

RUSTFLAGS="-Zlocation-detail=none -Zfmt-debug=none" cargo +nightly build \
  -Z build-std=std,panic_abort \
  -Z build-std-features="optimize_for_size" \
  --target aarch64-apple-darwin --release
```

> **本机实测**：在已套用第二节"全家桶"profile 的前提下，build-std + `optimize_for_size` 把体积干到 **84KB**（相比稳定版 279KB 再缩小约 70%，相比原始 421KB 缩小 80%）。

> **原理**：收益巨大的根源在于——**标准库是预编译分发的**，用的是官方默认 profile（偏性能、`opt-level=3`、unwind 版），并已链接进你的二进制，普通 profile 配置**管不到它**。`-Z build-std` 让 cargo 用你自己的 RUSTFLAGS / profile 从源码重新编译 std，于是 `opt-level=z`、`panic=abort`、location-detail 等终于作用到标准库；`optimize_for_size` 进一步让 std 内部选用体积优先（稍慢但更小）的算法实现。这解释了为何能从 279KB 直接掉到 84KB：之前所有优化都够不着的那部分 std 代码现在一起被压了。

注意 `optimize_for_size`（[tracking #125612](https://github.com/rust-lang/rust/issues/125612)）和 `build-std`（[cargo #15146](https://github.com/rust-lang/cargo/issues/15146)）截至 Rust 1.96 仍是 nightly 特性，命令可用但接口可能变动。

### 5. immediate-abort：连 panic 字符串都不要

```bash
RUSTFLAGS="-Zunstable-options -Cpanic=immediate-abort" cargo +nightly build \
  -Z build-std=std,panic_abort \
  -Z build-std-features= \
  --target aarch64-apple-darwin --release
```

进一步移除 panic 字符串格式化，理论上还能再压一截。比 `panic="abort"` 更激进——panic 时立即 abort，无任何信息输出。仍是 nightly。

> **原理**：即便 `panic=abort`，panic 路径仍要构造并格式化消息字符串（如 "index out of bounds: ..."），这套格式化机制和消息字面量也占体积。`immediate-abort` 让 panic 点直接生成一条 abort/trap 指令，连消息构造代码都不生成。代价：panic 时零信息。

---

## 四、极限玩法（伤可维护性，按需取用）— 84KB → ~8KB

### 6. `#![no_main]`：去掉 pre-main 的格式化代码

手动接管 stdio 和 C 入口点，选择性使用 libstd，可压到约 **8KB**，但需要写 `unsafe` 并仔细分析依赖。

> **原理**：正常程序在你的 `main` 之前有一段 Rust 运行时的"pre-main"启动代码——安装 panic hook、解析参数、初始化 stdio、设置栈溢出保护等，都带格式化/初始化代码。`no_main` 让你手写 C 风格入口跳过这层运行时，只保留真正用到的部分。

### 7. `#![no_std]`：彻底抛弃标准库

只依赖 libc：

```rust
#![no_std]
#![no_main]

extern crate libc;

#[no_mangle]
pub extern "C" fn main(_argc: isize, _argv: *const *const u8) -> isize {
    const HELLO: &'static str = "Hello, world!\n\0";
    unsafe {
        libc::printf(HELLO.as_ptr() as *const _);
    }
    0
}

#[panic_handler]
fn my_panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}
```

体积同样在 **8KB** 量级，需要大量 `unsafe`，适合嵌入式 / 裸机场景。

> **原理**：体积大头其实是**标准库**（分配器、IO、格式化、集合、panic 基础设施等）。`no_std` 彻底不链接 std，只用 `core`（无分配、无 IO 的最小子集）再直接调 libc，于是几乎所有 std 体积消失。代价：没有 `String`/`Vec`/IO，必须自己提供 `#[panic_handler]`、分配器等。

---

## 五、构建后再压一层

### 8. UPX 压缩

```bash
upx --best --lzma target/release/your_binary
```

号称能再减 50–70%。注意：UPX 加壳可能触发杀毒软件的启发式误报，也会增加启动解压开销。

> **原理**：与编译无关，是纯**可执行文件壳压缩**。UPX 用 LZMA 等算法压缩二进制，并注入一段解压 stub；运行时 stub 先把真实代码解压到内存再执行。所以**磁盘体积**变小，但**内存占用不变**，且自解压特征常被杀软误判。

---

## 辅助工具

定位体积来源时，这些工具很有用：

- **cargo-bloat** — 按函数 / crate 统计占用，告诉你"砍谁最值"
- **cargo-llvm-lines** — 泛型每实例化一种类型就生成一份代码（单态化膨胀），它统计哪个泛型实例化最多
- **cargo-unused-features** — 依赖的 feature 常默认全开会带进无用代码，它帮你裁剪
- **momo** — 把泛型函数体抽成非泛型内层函数，减少单态化副本
- **Twiggy** — WASM 代码体积分析

---

## 小结（基于 Rust 1.96 的实测路线）

| 步骤 | 手段 | 本机体积 | 稳定性 |
|------|------|---------|--------|
| 基准 | `cargo build --release` | 421KB | 稳定 |
| 推荐 | profile 全家桶（opt-z/lto/cu1/abort/strip） | **279KB** | ✅ 稳定 |
| 进阶 | + nightly build-std + optimize_for_size | **84KB** | nightly |
| 极限 | immediate-abort / no_std | ~8KB 量级 | nightly / unsafe |

这条阶梯的核心仍是开头那句——"**先吃免费午餐，再逐步加码**"：稳定 profile 零成本拿走 1/3，是几乎所有项目都该做的；越往下走收益越大，但要拿性能、可调试性、可维护性去换（详见下方代价速查）。

两点提醒：

- **每一步都实测复核**。上面的数字来自空项目，真实项目里各手段的收益差别很大（尤其 `"z"` vs `"s"`、LTO 的效果），改完务必量一下再决定是否保留。
- **别为省几 KB 牺牲不该牺牲的东西**。服务端程序通常不值得为体积放弃 panic 信息或运行性能；体积红线主要出现在 WASM、嵌入式、镜像分发这类场景。

> **一条主线**：所有手段本质都在做三件事——① 删掉运行时用不到的元数据（strip、location-detail、fmt-debug）；② 让优化器更彻底地消除冗余（opt-z、lto、codegen-units=1）；③ 移除整块不需要的功能/基础设施（panic=abort、build-std 重编 std、no_std）。收益越大的手段，往往是动到了普通配置够不着的 std，或直接砍掉整块功能，代价也越大——这正是本文从上到下的排序逻辑。

### 各手段的代价速查

体积不是免费的，每一步都在拿别的东西交换。下表汇总各手段的代价类型，方便对照取舍：

| 手段 | 代价类型 | 具体影响 |
|------|---------|---------|
| `strip` | 可调试性 | 崩溃时无带符号的栈回溯，线上排错变难 |
| `opt-level = "z"/"s"` | **运行时性能** | 放弃为速度做的优化，热点路径可能变慢 |
| `lto = true` | 编译耗时 | 处理全量 IR，编译变慢、吃内存 |
| `codegen-units = 1` | 编译耗时 | 失去并行编译，构建更慢 |
| `panic = "abort"` | 行为变化 | 不能 `catch_unwind`，panic 时栈上对象不析构 |
| `location-detail/fmt-debug=none` | 可调试性 | 报错信息、`{:?}` 输出失真，难定位问题 |
| build-std | 工具链 + 编译耗时 | 需 nightly + rust-src，每次都重编整个 std，构建显著变慢 |
| `immediate-abort` | 可调试性 | panic 时零信息输出，只剩一条 trap 指令 |
| `no_main` | 可维护性 | 需手写 `unsafe` 入口，自行管理 stdio/参数 |
| `no_std` | 功能 + 可维护性 | 失去 `String`/`Vec`/IO，须自备 panic handler、分配器，大量 `unsafe` |
| UPX | 启动 + 内存 + 误报 | 启动多一次解压、内存占用不变、易被杀软误判 |

取舍原则：稳定 profile 那几项代价基本只是"编译变慢 / 调试稍难"，可放心常开；而 opt-z 的**性能损失**、no_std 的**功能缺失**、UPX 的**运行期副作用**才是真正需要权衡的红线。

---

*实测环境：rustc/cargo 1.96.0 (2026-05-25)，aarch64-apple-darwin，edition 2024。x86 机器请将 `--target` 换成 `x86_64-apple-darwin` 或对应 triple。*
