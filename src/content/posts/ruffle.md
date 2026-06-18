---
title: 为了重玩金庸群侠传，我研究了一下 Ruffle 怎么复活 Flash
published: 2026-06-19
description: 从重玩金庸群侠传 Flash 版开始，先讲普通用户怎么打开老 SWF，再结合源码拆解 Ruffle 如何用 Rust、WebAssembly、SWF 解析器、AVM1/AVM2 虚拟机和渲染后端重新实现 Flash Player。
tags: [Flash, Ruffle, WebAssembly, Rust, 游戏]
category: 前端
draft: false
---

最近突然想重温一下《金庸群侠传》。不是 Steam 上的重制版，也不是 DOSBox 里跑的老版本，而是很多年前网页上流传的那个 Flash 游戏版本。结果点开才发现：文件还在，情怀还在，浏览器不认了。

这就是 Flash 时代结束后最尴尬的地方。很多小游戏、动画、课件、交互页面并没有真正消失，它们只是被封在一个 `.swf` 文件里。过去浏览器有 Flash Player 插件，点开就能运行；如今插件体系变了，Adobe Flash Player 也早已停止支持，原来的运行环境没了。

于是我找到了 [Ruffle](https://ruffle.rs/)——一个用 Rust 写的 Flash Player 模拟器，可以编译成 WebAssembly 在现代浏览器里运行，也可以作为桌面程序直接打开 SWF 文件。它不是旧版 Flash Player 的破解版，也不是回到旧浏览器的补丁。

> 它做的事情是：**在现代系统和浏览器的安全边界里，重新实现一个足够像 Flash Player 的运行时。**

这篇文章分两层读：

- 只想重玩老游戏，看前两节就够：怎么打开、打不开怎么排查。
- 对实现感兴趣，再往后看 Ruffle 如何解析 SWF、推进时间轴、执行 ActionScript、渲染画面，以及它凭什么比旧 Flash Player 更值得装。

翻完源码我最大的感受是：有意思的地方不只是“Rust + Wasm”。Ruffle 真正在复刻的，是 Flash Player 的一整套世界——SWF 文件格式、时间轴、显示列表、ActionScript 虚拟机、字体、音频、视频、滤镜、沙箱、网络、浏览器嵌入方式，甚至连 Flash 那套带历史包袱的字符串行为都还原了。

下面就从“一个 SWF 到底是什么”开始拆。

## 先把游戏跑起来

先不谈源码。落到“我就想打开那个游戏”，优先级其实很清楚：

| 你的情况 | 推荐方式 | 为什么 |
|----------|----------|--------|
| 老游戏还挂在原网页里 | Chrome / Firefox 扩展 | 装好扩展再打开页面，Ruffle 会自动接管 `<object>` 和 `<embed>` 里的 Flash 内容 |
| 手里已经有 `.swf` 文件 | Ruffle 桌面版 | 直接打开本地文件，能避开老网页里的跨域、插件检测和旧 JS 脚本 |
| 想长期保存或分享给别人 | 自托管 Ruffle | 把 self-hosted 包放到自己的网站，访客不需要额外安装 Flash 插件 |

打不开时，排查顺序也很顺：

```text
扩展接管失败
  ↓ 把 SWF 下载到本地，用桌面版打开
桌面版也跑不起来？
  → 多半是 SWF 依赖了尚未兼容的 API、外部资源、视频/滤镜或网络能力
桌面版能跑，只有网页跑不起来？
  → 优先查 MIME、文件路径、跨域、allowScriptAccess、renderer 和浏览器限制
```

一句话：先分清问题出在 **SWF 本身的兼容性**，还是 **网页嵌入环境**。这个判断能省掉大量无效折腾。

## SWF 不是视频文件

我们平时说“Flash 游戏”，交付物通常就是一个 `.swf` 文件。很多人会下意识把它当成“一段视频”或“一个动画”，但这低估了它的复杂度。

SWF 容器里可能有：

- 矢量图形、位图、字体、音频、视频；
- 舞台尺寸、帧率、背景色；
- 一条按帧推进的时间轴；
- 每一帧要放置、移动、删除哪些对象；
- 用户点击、键盘输入后要执行的 ActionScript 代码；
- 网络请求、本地存档、跨域策略等运行时行为。

所以 Flash Player 本质上不只是一个“播放器”。它更像一个塞在浏览器里的小型运行时：

```text
SWF 文件
  ↓
解析 header / tag / 资源 / 字节码
  ↓
建立舞台、时间轴和显示列表
  ↓
执行 ActionScript
  ↓
处理输入、音频、视频、网络、存储
  ↓
把显示列表渲染到屏幕
```

如果只是播放一段线性动画，事情还算简单；游戏就完全不同了：要响应键鼠、跑脚本逻辑、做碰撞检测、写存档，还要每帧更新画面。浏览器如今不内置这套运行时，自然也没法直接理解 SWF。

这正是 Ruffle 工作量的来源——它不能只把 SWF “解包”出来，还得把当年 Flash Player 承担的整个运行环境重新补上。

## 再看 Ruffle 的全局地图

有了这个背景，再看 Ruffle 仓库就好理解多了。它的顶层结构很直白，README 里也把几个核心 crate 列了出来：

| 目录 | 作用 |
|------|------|
| `swf` | 读写 SWF 文件，解析 tag、资源和 ActionScript 字节码结构 |
| `core` | 模拟器核心：时间轴、显示对象、AVM1/AVM2、事件、加载器、存储等 |
| `render` | 渲染抽象和后端实现，包括 `wgpu`、`webgl`、`canvas` |
| `web` | WebAssembly 版本和浏览器扩展入口，通过 `wasm-bindgen` 暴露给 JS |
| `desktop` | 桌面客户端，默认走 `wgpu` |
| `video` / `flv` | 视频解码和 FLV 容器解析 |
| `wstr` | Flash 兼容字符串实现 |
| `scanner` / `exporter` | 批量扫描 SWF、导出截图等工具 |

它不是“把 SWF 转成 HTML”，也不是“把 ActionScript 转成 JavaScript 后交给浏览器”。Ruffle 更接近传统模拟器：自己解析 SWF，自己维护 Flash 运行时状态，自己执行字节码，再通过不同宿主平台的渲染和音频能力输出结果。

数据流大致是这样：

```text
                 .swf
                  |
                  v
           swf crate：解压、读 header、读 tag
                  |
                  v
        core：Player / Stage / MovieClip / Library
                  |
        +---------+----------+
        |                    |
        v                    v
   AVM1 / AVM2          显示列表与帧生命周期
        |                    |
        +---------+----------+
                  |
                  v
        RenderBackend / Audio / Video / Storage / Navigator
                  |
        +---------+----------+
        |                    |
        v                    v
      Web/Wasm             Desktop
```

这一节记住一句话就够：**`swf` 负责读文件，`core` 负责跑 Flash 世界，`render` 负责把结果画出来。**

落到代码上，第一站就是“读文件”。`swf/src/read.rs` 里有 `decompress_swf` 和 `parse_swf`：前者读 SWF 头部，处理未压缩、Zlib、LZMA 三种情况，拿到舞台大小、帧率、帧数、背景色；后者再把文件拆成 tag 列表。

但 tag 只是原材料。`core/src/tag_utils.rs` 里还有一层通用的 `decode_tags` 循环，按顺序切出每个 tag，把处理权交给调用方传入的 callback。真正负责注册形状、位图、字体、声音、按钮、Sprite、帧动作等资源的，是 `MovieClip` 预加载和帧推进这些更上层的逻辑。

## Player 才是那台“虚拟 Flash Player”

读完文件还不够。SWF 里的资源和脚本需要一个地方被组织起来、按帧推进、接收输入、发出声音、画到屏幕上。这个角色就是 `core/src/player.rs` 里的 `Player`。

`Player` 里塞了大量 Flash Player 当年需要维护的东西，粗略分四类：

- **舞台和资源**：`Stage`、`Library`、显示对象、字体、位图、声音；
- **脚本运行时**：AVM1、AVM2、Action 队列、事件分发；
- **宿主能力**：输入、音频、视频、网络、存储、Socket、ExternalInterface；
- **播放器状态**：帧率、计时器、加载管理、菜单、渲染器。

也就是说，Ruffle 不是在“播放一个文件”，而是在维护一个运行中的 Flash 世界。

它的帧推进逻辑很像游戏循环：`Player::tick` 根据 SWF 帧率累积时间，时间够了就调用 `run_frame`——处理预加载、执行 AVM2 帧生命周期、执行 AVM1 帧逻辑、更新声音和本地连接，最后标记需要渲染。

简化之后大概是这样：

```text
tick(dt)
  ↓
累计时间
  ↓
到了下一帧？
  ↓
run_frame()
  ├─ preload()
  ├─ run_all_phases_avm2()
  ├─ Avm1::run_frame()
  ├─ AudioManager::update_sounds()
  └─ 标记 needs_render
```

渲染则是另一条线：`Player::render` 从 `Stage` 递归生成绘制命令，放进 `CommandList`，最后交给具体的 `RenderBackend::submit_frame`。

这就是为什么 Ruffle 能同时支持桌面和浏览器——核心只关心“我要画这些东西”，具体怎么画由后端决定。

## ActionScript 是兼容性的核心

到这里，画面和时间轴只是外壳。Flash 游戏能不能真正玩起来，关键不在图片显不显示，而在 ActionScript 能不能跑。

Flash 历史上有两代虚拟机：

- **AVM1**（ActionScript 1 / 2）：早期 Flash 动画和小游戏非常常见，和时间轴、MovieClip 的关系非常紧；
- **AVM2**（ActionScript 3）：Flash Player 9 之后引入，有 ABC 字节码、类、命名空间、验证、异常、事件模型和庞大的 `flash.*` API，模型更接近现代虚拟机。

源码里也能看到这条分界线：`core/src/avm1` 和 `core/src/avm2` 是两套独立实现，`swf/src/avm1`、`swf/src/avm2` 则负责读取对应的字节码结构。Ruffle 为 AVM2 还要构建 `playerglobal`，也就是 Flash 内建类库的那套东西。

一个按钮点下去触发什么？角色每帧怎么移动？血量怎么扣？战斗结算怎么写进存档？这些全藏在 ActionScript 里。Ruffle 必须把 Flash Player 当年的对象模型、事件分发、内置 API 和一堆历史行为都模拟出来。

> 能显示画面，不等于游戏逻辑完整。Flash 游戏真正难兼容的地方，往往在脚本和 API 行为。

所以“能打开”和“能正常玩”之间有很大差别。一个 SWF 可能能显示标题画面，但进战斗时报错；也可能动画正常，存档或联网接口失效。这通常不是播放器没启动，而是某个 Flash API、滤镜、视频编码、网络行为或脚本边界还没完全兼容。

## 渲染：不是把图片贴上去那么简单

脚本跑完，还得把这一帧画出来。Flash 的画面以矢量图形和显示列表为核心：舞台 `Stage` 里有 `MovieClip`、`Shape`、`Bitmap`、`TextField`、`Button`、`Video`，每个对象还可能带着矩阵变换、颜色变换、混合模式、遮罩、滤镜、可见性和深度关系。

Ruffle 的 `render` crate 先定义了一套 `RenderBackend` trait。它不只是 `drawImage` 这种简单能力，还包括：注册形状和位图、离屏渲染、应用滤镜、提交一帧的 `CommandList`、创建 3D 上下文、编译执行 Pixel Bender shader、更新纹理、设置渲染质量。

后端实现则分成几类：

| 后端 | 用途 |
|------|------|
| `render/wgpu` | 桌面端主要路径，也可服务 WebGPU / wgpu-webgl |
| `render/webgl` | 浏览器 WebGL 后端 |
| `render/canvas` | 浏览器 Canvas fallback |
| `render/naga-agal` | 处理 AGAL shader 转换，和 Stage3D 兼容有关 |
| `render/pixel_bender` | 处理 Flash 的 Pixel Bender shader |

Web 端的 renderer 选择在 `web/src/builder.rs` 里：按 `wgpu-webgl`、`webgpu`、`webgl`、`canvas` 的顺序尝试创建后端。如果用户配置了 `preferredRenderer`，就把指定后端挪到最前面；创建失败就继续 fallback。

这解释了为什么 Ruffle 在不同机器上表现不一样：同一个 SWF，可能在一台机器上走 WebGL，另一台因为 WebGL 被禁用而走 Canvas。**能跑，不代表每个滤镜、混合模式、性能表现都一样。** 渲染层不是“把图片贴上去”，而是在尽量复刻 Flash 当年的绘制模型。

## 为什么用 Rust 和 WebAssembly

Flash Player 当年最大的问题之一就是安全。它是浏览器里的原生插件，历史上积累过大量内存安全和沙箱逃逸问题。一个网页嵌入 SWF，就可能让浏览器加载一大块复杂的原生运行时，这在今天已经很难接受。

Ruffle 换了一个方向：

- 核心逻辑用 Rust 写，降低常见内存安全问题；
- Web 版本编译成 WebAssembly，运行在现代浏览器沙箱里；
- 不需要安装旧版 Flash Player，也不需要打开浏览器的老插件接口；
- Web 侧只通过 JS 包装层创建播放器、加载 SWF、接收 DOM 输入。

WebAssembly 在这里不是为了炫技，而是刚好适合这种场景：性能比纯 JS 更稳定，Rust 写的核心可以同时给桌面版和 Web 版复用，同时仍然受浏览器安全模型约束。`web` 目录里也明确分成两层——Rust 部分是真正的 Flash player，TypeScript/JavaScript 部分负责自托管包、扩展、polyfill、Web Component 和公开 API。

## Ruffle 安全吗

和“继续安装旧版 Adobe Flash Player”相比，Ruffle 是明显更合理的选择。

Adobe 已在 2020 年 12 月 31 日停止支持 Flash Player，之后不再提供安全补丁，并从 2021 年 1 月 12 日起阻止 Flash 内容在 Flash Player 里运行，官方也建议用户卸载。原因很简单：一个停止维护、又长期暴露在浏览器里的原生插件，只要再发现漏洞，普通用户基本没有补丁可等。

Flash 的风险主要集中在这几件事：

- 它是浏览器里的原生插件，历史上容易出现缓冲区溢出、use-after-free 这类内存安全漏洞；
- 它要解析图片、音频、视频、字体、脚本字节码，攻击面很大；
- 它既能跑脚本，又能访问网络、存储、摄像头、麦克风，沙箱边界复杂；
- 它已停止维护，第三方下载站提供的“可用 Flash”还可能夹带恶意软件。

Ruffle 的安全性来自另一套边界：核心用 Rust 写，Web 版本编译成 WebAssembly，运行在现代浏览器沙箱里。它不是把旧 Flash 插件重新塞回浏览器，而是在新的安全模型里模拟 SWF。

但这不等于“任何 SWF 都可以放心点”：

- 从 Chrome Web Store、Firefox Add-ons、Ruffle 官网或 GitHub 获取，不要装来路不明的“Flash 修复包”；
- 不要把陌生 SWF 当成本地可信程序，它仍可能诱导点击、发网络请求、占用大量 CPU，或碰到 Ruffle / 浏览器本身的漏洞；
- 怀旧玩老站点，浏览器扩展通常够用；要长期托管，最好自托管 Ruffle，并限制资源来源和页面权限。

> Ruffle 是“比旧 Flash Player 安全得多的兼容方案”，不是“让所有 Flash 内容天然无害”的魔法罩。

## Web 端怎么接管 Flash

如果要让网站重新支持旧 Flash 内容，可以把 Ruffle 当成 polyfill 用。老页面里可能有这样的嵌入：

```html
<object>
  <embed src="/games/jinyong.swf" width="800" height="600" />
</object>
```

自托管 Ruffle 后，只要引入脚本，它就会扫描页面里的 `<object>` 和 `<embed>`，把可识别的 Flash 元素替换成 Ruffle 自己的播放器元素：

```html
<script src="/ruffle/ruffle.js"></script>
```

源码里对应的是 `web/packages/core/src/polyfills.ts`：先处理 `<object>`，再处理 `<embed>`，还会尝试把 Ruffle 注入 frame/iframe。这个过程不是万能的——如果页面自己的 JS 太早拿到了原始 Flash 元素，或 iframe 有跨域限制，自托管版本就可能接管失败。浏览器扩展因为权限更高，通常更容易处理老站点。

如果想精确控制播放器，也可以用公开 JS API：

```html
<div id="container"></div>

<script>
  window.RufflePlayer = window.RufflePlayer || {};

  window.addEventListener("DOMContentLoaded", () => {
    const ruffle = window.RufflePlayer.newest();
    const player = ruffle.createPlayer();

    player.style.width = "800px";
    player.style.height = "600px";

    document.getElementById("container").appendChild(player);
    player.ruffle().load("/games/jinyong.swf");
  });
</script>
<script src="/ruffle/ruffle.js"></script>
```

`window.RufflePlayer.newest().createPlayer()` 这个 API 在 TypeScript 侧创建的是一个自定义 DOM 元素。真正的播放器会进一步调用 Wasm 侧的 builder，把 renderer、audio、navigator、storage、UI、video backend 全部接到 `core::Player` 上。

## 那些很“Flash”的边角

Ruffle 源码里有一些模块特别能说明它的工程量。

**`wstr`——字符串。** 现代 Web 开发里我们几乎默认字符串是 Unicode/UTF-8/UTF-16 模型。但 Flash 字符串有自己的历史行为：AVM 里可能出现 1 字节或 2 字节 code unit，可能包含 null byte 或未配对 surrogate，还要匹配 Flash 当年的长度限制和转换规则。Ruffle 专门做了一个 `no_std` 字符串库来贴近这些行为。

**`SharedObject`——本地存档。** 很多老 Flash 游戏的存档靠它实现。Ruffle 不能把这个 API 写成空函数，否则游戏能跑但存不了进度。Web 版本里会通过 storage backend 接到浏览器 `localStorage`，不可用时再退回内存存储。

**`ExternalInterface`——和宿主 JS 互调的通道。** Ruffle 默认不会无条件打开它，Web builder 里会根据 `allowScriptAccess` 和 networking 配置决定是否接入 JavaScript interface——这是兼容性和安全性之间的取舍。

**`flv` / `video`——视频包袱。** Web 侧还会创建带 WebCodecs 能力的 external video backend，因为很多 SWF 不只是小游戏，也可能嵌 FLV 视频、H.264 或更老的视频编码。

这些东西解释了为什么 Flash 模拟比“解析一个二进制格式”复杂得多。Flash Player 曾经是一整套应用平台，Ruffle 要复刻的是平台，不是文件后缀。

## 它不是万能修复器

Ruffle 解决的是“现代环境没有 Flash Player”这个最大问题，但它不保证所有老内容 100% 复活。真遇到问题时，可以先按现象排查：

| 现象 | 常见原因 | 优先检查 |
|------|----------|----------|
| 能看到标题画面，但点按钮或进战斗报错 | SWF 使用了尚未完整实现的 ActionScript API | Ruffle 控制台日志、[兼容性页面](https://ruffle.rs/compatibility)、对应游戏的 issue |
| 桌面版能跑，网页里跑不起来 | 嵌入页面限制、路径错误、MIME、跨域或旧插件检测脚本 | SWF 路径、Network 面板、`allowScriptAccess`、iframe/frame 限制 |
| 画面缺素材、黑屏或卡在加载 | 主 SWF 还依赖外部图片、声音、XML、子 SWF | 原网页目录结构、Network 面板里的 404、跨域策略 |
| 画面能动，但存不了档 | `SharedObject`、浏览器存储或隐私设置有问题 | localStorage 是否可用、站点权限、桌面版是否正常 |
| 视频、滤镜或 3D 效果异常 | 视频解码、Pixel Bender、Stage3D 或渲染后端兼容差异 | WebGL/WebGPU/Canvas 后端、浏览器硬件加速、Ruffle 版本 |
| 排行榜、登录、联网存档失效 | 当年的后端接口已经关闭 | 请求地址是否还存在、是否可以替换为本地逻辑 |
| 中文字体、输入法、右键菜单不一致 | Flash 旧行为和现代浏览器/系统能力不完全对应 | 字体资源、编码、输入法和宿主平台差异 |

这和主机模拟器很像：能复刻大量硬件行为，但具体到某个游戏总会有边角。区别是 Flash 的边角不只是 CPU 指令，还有浏览器、网络、字体、音频、视频、脚本 API、DOM 嵌入方式这些历史包袱。

## 为什么这件事值得做

Flash 被淘汰是必然的。它的安全模型、性能模型、移动端体验都跟不上现代 Web。

但 Flash 内容不应该因此全部消失。

很多中文互联网早期的小游戏、动画、教程、交互作品都存在 SWF 里。它们可能不是什么商业大作，却承载了一代人的网页记忆。对我来说，想重新打开《金庸群侠传》只是一个入口；真正有意思的是，Ruffle 用现代工程方式给旧内容留了一条可运行的路。

它没有复活 Flash Player。

它复活的是那些被 Flash Player 绑定住的内容。

## 参考资料

- [Ruffle 官网](https://ruffle.rs/)
- [Ruffle 下载页面](https://ruffle.rs/downloads)
- [Ruffle GitHub 仓库](https://github.com/ruffle-rs/ruffle)
- [Ruffle ActionScript Compatibility](https://ruffle.rs/compatibility)
- [Using Ruffle Wiki](https://github.com/ruffle-rs/ruffle/wiki/Using-Ruffle)
- [Adobe Flash Player End of Life](https://www.adobe.com/products/flashplayer/end-of-life-alternative.html)
