# DOM 终于能当 GPU 纹理了：HTML-in-Canvas 为什么重要

> 2026-06-23 | 关键词：HTML-in-Canvas, Canvas, WebGL, WebGPU, Web 平台, 渲染架构

想象一个登录表单：用户能输入，能 Tab 切换焦点，IME 正常工作，浏览器能自动填充，屏幕阅读器能读出 label。这是 DOM 擅长的事。

再想象提交之后，整个表单像玻璃一样碎裂成粒子，每一片都经过 shader 扭曲、3D 翻转、辉光后处理，再飞散到场景深处。这是 Canvas、WebGL、WebGPU 擅长的事。

过去很长一段时间，这两件事很难发生在同一个对象上。表单如果留在 DOM 里，它就很难被你的 GPU 管线任意处理；表单如果被画进 Canvas，它就退化成一张图，输入、选区、焦点、无障碍能力都要自己补。

HTML-in-Canvas 要补的正是这个缺口：让一个真实 DOM 子树参与浏览器布局、命中测试和无障碍树，同时又能把它的渲染结果画进 2D Canvas，或上传成 WebGL/WebGPU 可用的纹理。

先把边界说清楚：截至 2026-06，这仍是实验中的 Web 平台能力。Chrome 已经把它放进 origin trial，Chromium 也能通过 `chrome://flags/#canvas-draw-element` 试用；它值得关注，但还不是一个可以无脑投产的跨浏览器标准。

这篇文章想回答一个问题：**为什么 Web 平台等到今天才开始打通 DOM 和 GPU，而这件事一旦成立，会改变哪些产品形态。**

---

## 1. DOM 和 Canvas 的分工一直太硬

DOM 是浏览器的应用层 UI 系统。它有语义、布局、字体、输入法、选区、复制粘贴、焦点管理、表单控件、自动填充、浏览器翻译、查找、无障碍树和扩展生态。你写一个 `<input>`，背后不是一个矩形和几行事件监听，而是一整套浏览器能力。

Canvas 则是另一种模型：一块像素网格，一条命令式绘制管线。它适合游戏、图形编辑器、数据可视化、视频合成、3D 场景和 shader 效果。它给你的是自由，但你也要自己承担 UI 系统原本替你做掉的事。

这个分工在简单页面里没问题，但一到复杂产品就会刺痛：

- 游戏 UI 想要原生输入框和 IME，又想要 shader 转场。
- 设计工具想把真实网页放进无限画布，再对它旋转、缩放、加滤镜。
- WebXR 想在 3D 空间里显示一个可交互的 HTML 面板。
- 直播工具想把网页、字幕、摄像头和特效都放进同一条 GPU 合成管线。

开发者真正想要的不是“把网页截图快一点”，而是一个更底层的原语：**DOM 继续是 DOM，但它的视觉结果也能成为 Canvas/GPU 世界的一等输入。**

---

## 2. 浏览器明明已经在用 GPU 合成 DOM，为什么不给开发者？

现代浏览器内部早就在做合成层：页面里的 DOM、动画元素、视频、Canvas 都可能被分到不同 layer，再由 compositor 合成为屏幕上的一帧。

所以直觉上会觉得：既然浏览器内部已经把很多东西变成 GPU 可合成的表面，为什么不直接把某个 `<div>` 的纹理给 JavaScript？

难点不在“能不能画”，而在三个边界。

第一是安全与隐私。DOM 里可能包含跨域 iframe、跨域图片、被访问过的链接状态、拼写检查标记、系统主题、自动填充候选、用户偏好等信息。如果一个 API 允许把任意 DOM 像素读回 JavaScript，它就可能变成跨域信息泄露和指纹识别通道。

第二是渲染时序。DOM 的布局、绘制、滚动、CSS 动画和 Canvas 的绘制命令不是同一个抽象层。要把 DOM 的某一帧稳定地交给 Canvas，浏览器必须定义“什么时候快照”“什么时候触发更新”“主线程脚本和浏览器自己的绘制如何同步”。

第三是命中测试和无障碍。元素如果被画进 Canvas，但用户实际点击的是 Canvas 上的某个像素，浏览器要知道这个点击如何对应回真实 DOM；屏幕阅读器也要能理解画出来的东西不是一张死图，而是背后有语义元素。

HTML-in-Canvas 的设计基本都在围绕这三件事收边界：不是开放“任意 DOM 截图”，而是开放“Canvas 直接子元素的受控绘制”。

---

## 3. 旧方案为什么都差一口气

在这个 API 出现之前，开发者一直在绕路。

### 3.1 `html2canvas`：用 JavaScript 重写半个浏览器

`html2canvas` 的思路是解析 DOM 和 CSS，然后用 JavaScript 自己把它们画到 Canvas。

这个方向工程上很顽强，但注定很难完美。CSS 规范太大，字体度量、emoji、subpixel 抗锯齿、滤镜、阴影、混合模式、滚动容器、伪元素、浏览器默认样式，每一个细节都可能和真实页面有偏差。

它能解决“生成一张大致可用的图”，但解决不了“把浏览器真实渲染结果作为实时纹理”。

### 3.2 SVG `<foreignObject>`：借浏览器渲染，但只能做快照

另一个常见技巧是把 HTML 序列化进 SVG 的 `<foreignObject>`，再把 SVG 当图片画进 Canvas。

它的优点是能借用浏览器自己的 HTML/CSS 渲染能力，保真度比纯 JS 重写更有希望。但它仍然是一次性快照：样式作用域、字体、跨域资源、浏览器兼容性都会出问题，输入框和光标也不会以真实 DOM 的方式继续工作。

这条路适合做静态图，不适合做活的 UI。

### 3.3 CSS3DRenderer / iframe：保住交互，但进不了你的 GPU 管线

Three.js 生态里常见的 CSS3DRenderer，本质是让 DOM 用 CSS transform 伪装成 3D，再让 WebGL 场景匹配同一套相机参数。

这可以保住 DOM 交互，但它不是同一个渲染管线。DOM 仍然由浏览器合成器处理，WebGL 仍然在 Canvas 里处理；两边的 z-order、遮挡、后处理、shader、抗锯齿和刷新节奏都可能对不上。

iframe 也类似：它能显示活网页，但它是一个独立的浏览器嵌入上下文。跨域通信受限，Canvas 拿不到它的像素，和 3D 场景的深度关系也很难自然统一。

### 3.4 Canvas 自研 UI：自由度最高，债也最大

很多游戏和图形编辑器最终会在 Canvas 里自己实现按钮、文本、输入框和面板。

这能完全进入 GPU 管线，但代价是重新实现一个 UI 平台。文本选择、IME、可访问性、表单校验、移动端键盘、屏幕阅读器、浏览器缩放、复制粘贴，每一项都不是小活。

所以旧方案的共同问题是：**要么保留 DOM 能力，要么获得 GPU 自由，很难同时拿到。**

---

## 4. HTML-in-Canvas 到底提供了什么

WICG explainer 里的核心设计有三个部分：

1. `layoutsubtree`：让 `<canvas>` 的直接子元素参与布局、命中测试和无障碍相关流程，但它们不会像普通 DOM 那样直接显示出来，除非被显式画进 Canvas。
2. 绘制/上传方法：2D Canvas 使用 `drawElementImage()`；WebGL 使用 `texElementImage2D()`；WebGPU 使用 `copyElementImageToTexture()`。
3. `paint` 事件：当 Canvas 子元素的渲染发生变化时，浏览器通知开发者，让 Canvas 有机会同步更新。

一个接近底层 API 的概念化例子大概是这样：

```html
<canvas id="stage" layoutsubtree></canvas>

<script>
const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d");

const form = document.createElement("form");
form.innerHTML = `
  <label>
    Email
    <input value="still editable" />
  </label>
`;

canvas.appendChild(form);

canvas.addEventListener("paint", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawElementImage(form, 40, 40);
});
</script>
```

真实业务里，多数开发者不会直接碰这些底层方法，而是通过渲染框架使用。PixiJS v8.19 已经提供了 `pixi.js/html-source` 子路径：

```js
import { Application, Sprite } from "pixi.js";
import { HTMLSource } from "pixi.js/html-source";

const app = new Application();
await app.init({ resizeTo: window });
document.body.appendChild(app.canvas);

const form = document.createElement("form");
form.innerHTML = '<input value="still editable" />';

app.canvas.appendChild(form); // 必须是 Pixi canvas 的直接子元素

const sprite = Sprite.from(
  new HTMLSource({ resource: form, autoUpdate: true }),
);

app.stage.addChild(sprite);
```

这里最关键的是：`form` 仍然是 DOM，输入框仍然能编辑；同时它又以 PixiJS texture 的形式进入场景，可以被当成 sprite 做缩放、旋转、滤镜、mask、shader 和后处理。

PixiJS 还提供 `ElementImageSource`，适合把某一刻的元素渲染结果冻结成不可变快照，用于碎裂、拖影、转场这类不需要持续交互的效果。

---

## 5. 新 API 真正不一样的地方

HTML-in-Canvas 的价值不只是“更快截图”。它改变的是责任分配。

| 问题 | 旧方案 | HTML-in-Canvas |
|---|---|---|
| CSS 保真度 | JS 重写或 SVG hack，容易偏 | 浏览器自己渲染自己的 DOM |
| 输入和焦点 | 截图后丢失，Canvas 内要重写 | 源元素仍是 DOM，浏览器继续处理 |
| IME/选区/复制 | 大量自研逻辑 | 复用浏览器行为 |
| 无障碍 | Canvas fallback 很难和视觉同步 | 绘制内容和对应 DOM 元素有明确关系 |
| GPU 效果 | DOM 层难以接入 shader | 渲染结果可进入 Canvas/WebGL/WebGPU |
| 实时更新 | 多为手动快照 | 浏览器通过 `paint` 事件暴露更新时机 |

这让一种过去很尴尬的 UI 变得合理：**用 DOM 写交互和语义，用 GPU 处理视觉和合成。**

---

## 6. 它可能打开哪些产品形态

### 6.1 Web 游戏 UI

游戏 UI 长期在两条路之间摇摆：用 HTML 浮在 Canvas 上方，或者在游戏引擎里重写控件。

前者交互正确，但很难融入游戏画面；后者视觉统一，但输入框、可访问性和移动端输入会迅速变成工程债。

HTML-in-Canvas 提供第三条路：登录框、聊天框、设置面板仍然用真实 HTML 写，但它们的视觉结果可以作为 texture 进入游戏场景。菜单可以被 3D 翻转，按钮可以被 shader 扭曲，表单提交时可以粒子化，同时输入和焦点仍然由浏览器处理。

### 6.2 设计工具和无限画布

Figma、Miro、tldraw 这类产品的核心体验是“万物皆可放进画布”。如果画布里能放同源或受控的活 HTML 面板，设计稿、文档块、数据看板、组件预览就不一定要退化成截图。

这不等于可以任意抓取别人网站的像素，但对产品内部的可控内容已经足够有价值：真实表单、真实组件、真实预览，可以和其他图形对象一样被缩放、旋转、遮挡和加效果。

### 6.3 视频会议、教学和直播合成

WebCodecs、WebRTC 和 WebGPU 已经让浏览器具备越来越强的媒体处理能力，缺的常常是“HTML UI 如何高质量进入合成管线”。

HTML-in-Canvas 可以让课件、字幕、聊天、网页面板、摄像头画面和品牌包装在同一条 GPU 管线上合成。对轻量直播工具、在线课堂、产品演示和浏览器版 OBS 来说，这个方向很自然。

### 6.4 WebXR 和 3D 应用

WebXR 里一直需要“空间中的网页面板”。过去把 HTML 截图贴到 3D 面上会失去交互；用 DOM/CSS 叠在外面又很难和 WebGL 场景的光照、遮挡、深度关系统一。

如果 HTML 能成为 3D 场景里的纹理，面板就可以被放在空间里、被几何体遮挡、被 shader 处理，同时背后的控件仍然有 DOM 语义。这对浏览器里的 3D 工具、虚拟工作台和空间计算界面都很关键。

### 6.5 IDE 和组件预览

StackBlitz、CodeSandbox、VS Code Web、设计系统文档站都大量使用 iframe 预览。iframe 很好用，但它和编辑器主画布之间仍然有明显边界。

HTML-in-Canvas 让“预览”有机会变成可编排的视觉图层：多个设备尺寸并排、3D 倾斜展示、转场动画、像素级对比、录制输出，都可以在一个 Canvas 场景中完成。

---

## 7. 容易误读的地方

### 7.1 它不是任意网页截图 API

这个 API 的安全模型不是“你想画什么就画什么”。WICG explainer 明确把跨域嵌入内容、跨域图片、被污染的 Canvas、系统主题、拼写标记、visited link 信息、未公开的自动填充信息等列为敏感信息，并要求绘制和失效通知不能泄露这些内容。

换句话说，它的目标是让可控 DOM 更好地进入 Canvas，而不是绕过同源策略。

### 7.2 它不是零成本

一个活的 HTML surface 需要布局、绘制、上传、同步和显存。少量大型富交互区域很适合；把页面里几百上千个小组件都做成 HTML texture，通常会把性能和内存推向错误方向。

合理用法更像“给 Canvas 场景嵌入几个复杂 UI 面板”，而不是“把整棵 React 组件树全部镜像成纹理”。

### 7.3 它有明确的结构限制

当前提案要求源元素必须是 Canvas 的直接子元素，并且最近一次渲染更新里要生成布局盒子（generated boxes），也就是不能是 `display: none`。这不是随手加的限制，而是为了让浏览器能明确计算布局、绘制、命中测试和更新通知。

另外，源元素自己的 CSS transform 在绘制时会被忽略，但仍然会影响命中测试和无障碍相关行为。这类细节意味着真实项目需要仔细做几何同步，而不能把它当成普通截图函数。

### 7.4 它还远没到跨浏览器稳定

截至 2026-06，Chromium 侧在实验和 origin trial 阶段；Blink intent 里也能看到 Firefox/Gecko 和 WebKit 仍有标准立场与实现信号上的不确定性。

因此，现阶段更适合 demo、内部工具、受控 Chrome 环境、渲染框架实验和未来架构验证。生产系统要做 feature detection 和 fallback。

---

## 8. 放进 Web 渲染演进史里看

Web 渲染能力大致沿着这条线往前走：

```text
HTML/CSS          声明式文档和应用 UI
Canvas 2D         命令式像素绘制
WebGL             可编程 GPU 图形管线进入浏览器
OffscreenCanvas   Canvas 绘制脱离主线程
WebGPU            更现代的 GPU 计算和图形接口
HTML-in-Canvas    DOM 渲染结果进入 Canvas/GPU 管线
```

这不是某个框架的小功能，而是 Web 平台的一次边界调整。

过去的默认分工是：

- DOM 负责语义、交互、可访问性。
- Canvas/GPU 负责自由绘制、shader、后处理和合成。

HTML-in-Canvas 让这两边第一次有了更直接的交换方式。它不取消分工，而是让分工后的结果可以重新组合。

原生平台早就有类似思想：Android 有 `SurfaceTexture`，Apple 平台有 `IOSurface` / Metal 相关 surface 共享，Flutter 有 texture 嵌入机制。Web 缺的不是 shader，也不是 DOM，而是两者之间受控、可同步、可解释的桥。

HTML-in-Canvas 正是在补这座桥。

---

## 9. 短中长期判断

短期看，它会先出现在 PixiJS 这类渲染框架的 demo、教程和内部实验里。因为只有少数开发者愿意要求用户打开实验 flag 或注册 origin trial。

中期看，如果标准形态稳定、浏览器厂商逐步达成共识，Web 游戏 UI、设计工具预览、无限画布、可视化编辑器、在线直播合成会最先受益。这些场景都有同一个特点：它们需要 DOM 的正确性，也需要 GPU 管线的表现力。

长期看，HTML-in-Canvas 会成为“Web 作为一等媒体与创作平台”的一块拼图。它不会让 Native 失去意义，但会让更多复杂界面不再必须离开浏览器。

---

## 10. 结语

写过 `html2canvas` 相关逻辑的人都知道，重写浏览器渲染器是一条没有尽头的路。

写过 CSS3DRenderer、iframe overlay 或 Canvas 自研 UI 的人也知道，两套渲染体系并排运行时，总会在交互、遮挡、性能或无障碍上露出代价。

HTML-in-Canvas 的重要性就在这里：它不是又一个截图库，而是浏览器开始承认一个现实需求：

> DOM 应该继续负责它最擅长的语义和交互；GPU 也应该能够处理 DOM 的视觉结果。

这个 API 很小，但背后是 Web 渲染架构里一条很长的裂缝。

裂缝一旦补上，很多过去只能 hack 的产品体验，就会变成平台能力。

---

## 参考与延伸

- [Chrome for Developers: Introducing the HTML-in-Canvas API origin trial](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
- [WICG HTML-in-Canvas explainer](https://github.com/WICG/html-in-canvas)
- [Blink-dev: Intent to Experiment: HTML-in-canvas](https://groups.google.com/a/chromium.org/g/blink-dev/c/t_nGEmJ_v4s)
- [PixiJS Update - June 2026: HTML-in-Canvas textures](https://pixijs.com/blog/june-2026)

*作者立场提示：本文从 Web 平台架构演进角度做分析，不构成任何具体框架或产品的技术选型建议。HTML-in-Canvas 当前仍处在实验阶段，生产可用性请以浏览器厂商和框架官方文档为准。*
