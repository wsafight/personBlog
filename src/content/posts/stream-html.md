---
title: 流式 HTML：从 htmx 片段装配到浏览器原生增量渲染
published: 2026-06-18
description: 探讨流式 HTML 在 AI 搜索、智能问答和内容生成场景中的价值，介绍 htmx 的片段级渐进交付、标准 Streams API 的字节级增量渲染，以及相关工程边界和安全约束。
tags: [流式 HTML, htmx, SSE, Streams API, 前端工程]
category: 前端开发
draft: false
---


过去十多年，Web 前端最常见的分工是：**后端返回 JSON，前端负责状态、渲染和交互**。这套模式支撑了大量复杂应用，也把许多内容型页面推向了不必要的复杂度：一个只需要标题、段落和按钮的结果块，也要先设计 JSON 协议，再穿过前端组件树，最后才落成 HTML。

在传统 CRUD 场景里，这层成本通常还能接受。但 AI 搜索、智能问答、数据分析和报告生成改变了前提：**结果不是瞬间产生的，用户也不该对着空白页等到最后一刻**。系统可以先交付已经就绪的部分，再持续补齐后续内容。

这就是流式 HTML 重新重要起来的背景。不过，"流式 HTML"并不是单一能力，它至少包含两个经常被混在一起的粒度：

- **片段级流式**：界面由多个块组成，块陆续到达、各自归位，例如搜索结果卡片一张张出现。**htmx** 已经很擅长这件事。
- **字节级流式**：单个块内部随字节增量渲染，例如一段长答案逐字出现。今天通常要用 **`fetch` + `ReadableStream` + `TextDecoderStream`** 手写；Chrome 正在实验 `streamHTML()` / `streamHTMLUnsafe()` 等原生 API。

这篇文章会把两条线拆开讲：先用 htmx 解决"界面由哪些块组成、何时到位"，再用标准 Streams API 和实验性 DOM streaming API 解决"单个块内部如何增量渲染"。前者今天就能上生产；后者的标准 Streams API 已经可用，DOM 级 streaming API 仍处于实验阶段。只有先分清职责，才能在 AI 这类"逐步生成"的场景里选对工具。

如果只记住一个判断框架：

- **htmx 管"块"**：哪个区域发请求、哪个片段到达、插到页面哪里。
- **Streams API 管"块内部"**：同一段答案如何随字节到达逐步显示。
- **实验性 DOM streaming API 管未来**：浏览器原生把 HTML 字节流解析进 DOM，方向明确，但今天还不能当稳定依赖。

## 1. 从"等待完整结果"到"持续交付界面"

大多数 Web 应用至今仍沿用这套交付模型：

```text
用户发起请求 → 后端完成所有计算 → 返回完整 JSON
→ 前端解析 → 更新状态 → 渲染界面 → 用户看到结果
```

数据返回够快时，这套模型没有明显问题。但只要一次请求跨多个系统、数据库、模型或外部接口，用户就会经历一段完全不可见的等待。

流式 HTML 改变的是交付节奏：

```text
用户发起请求 → 服务端先返回页面骨架
→ 第一批内容完成立即发送 → 第二批继续发送
→ 慢任务完成后补齐剩余区域 → 页面逐步变得完整
```

总耗时也许相同，但用户感受到的速度完全不同。**传统模式下，用户在等待最终答案；流式模式下，用户能看到答案逐步成形。**

这对 AI 产品尤其关键。AI 体验的目标不只是把接口耗时压到最短，更是让用户尽早感到系统正在工作、尽早拿到可判断的信息。一个逐步浮现的答案，比一个长时间静止的 loading 更容易建立信任。

## 2. 它优化的不是后端耗时，而是体验延迟

讨论流式技术时，第一个问题往往是：它能让接口更快吗？

严格说，不能。数据库查询、模型推理、外部 API 调用该花多久还是多久。**流式真正缩短的是用户看到第一个有意义结果的时间，也就是体验延迟。**

"总完成时间"和"首次有意义反馈时间"是两件事。同样一个 8 秒完成的任务，两种交付节奏给人的感受截然不同：

- **静默等待**：前 7 秒空白，第 8 秒一次性出现结果，用户觉得慢。
- **持续交付**：第 1 秒出现结构，第 2 秒出现摘要，第 4 秒出现证据，第 8 秒完整收尾，用户觉得系统是活的。

这正是 ChatGPT 这类产品普遍采用流式输出的原因。即使完整答案需要较长时间，用户依然可以在生成过程中阅读、判断、停止或调整问题。流式 HTML 把这种体验从纯文本扩展到完整界面：不只流式输出文字，也能流式输出卡片、表格、引用、按钮、状态提示乃至局部错误。

体验延迟的收益还有一层心理基础：人对"有进展的等待"的容忍度远高于"无反馈的等待"。同样 8 秒，看得见阶段推进的等待感觉更短，这也是进度条通常比转圈动画更让人安心的原因。流式 HTML 把这种"可见的进展"推进到了内容粒度。

## 3. 为什么是 HTML，而不只是 JSON

JSON 是机器友好的数据格式，HTML 是用户界面的表达格式。过去很多系统默认返回 JSON，是因为前端承担了主要渲染职责。但在大量内容型、结果型页面里，后端其实早就知道某段内容该如何展示。

以一张搜索结果卡片为例，后端通常已经握有标题、摘要、来源、时间、标签、链接。前端拿到 JSON 后，往往只是把它们映射成一段几乎不变的 DOM：

```html
<article>
  <h2>标题</h2>
  <p>摘要</p>
  <a href="...">查看来源</a>
</article>
```

如果这个结构已经足够稳定，让服务端直接返回 HTML 片段，反而省掉了一轮协议设计和一层重复映射。后端定义字段、前端定义对应组件、两边再为字段增减保持同步，这层"协议税"在结构稳定的页面上几乎是纯损耗。

把 HTML 作为流式载荷有几个天然优势：

- **天然可被浏览器渐进解析。** 浏览器不需要等完整文档到达就能开始工作，这是 HTML 解析器与生俱来的能力。
- **它就是最终展示形态。** JSON 只是中间态，HTML 才是用户真正看到的界面。少一次转换，就少一处出错的可能。
- **它能表达更丰富的内容结构。** 标题、列表、表格、引用、代码块、链接、按钮都能直接进入流。
- **它降低了前端状态管理成本。** 只是把服务端结果展示出来的区域，不需要复杂的客户端状态机。

这并不是说 JSON 没价值。需要复杂客户端交互、离线编辑、本地缓存、多人协作的场景里，结构化数据依然不可替代。真正的分界线是：**这块内容的展示逻辑主要在服务端还是客户端？** 在服务端，就让它流 HTML；在客户端，就保留 JSON。流式 HTML 的价值在于多一个选择，而不是替代所有选择。

## 4. 为什么是 htmx：把理念落成工程

到这里，流式 HTML 还只是一个方向。真正落地时你会发现：要让"卡片一个个冒出来"，得手写大量样板代码——发起 `fetch`、读取 `response.body`、用 `TextDecoderStream` 解码、定位目标节点、把片段插进 DOM、处理乱序到达、管理请求取消。每个项目都重写一遍，最后很容易长出各自的私有协议。

**htmx 解决的正是这件事。** 它的核心主张和流式 HTML 同源：用 HTML 当传输格式，让服务端决定怎么展示，前端只负责把片段放到正确位置。大量手写逻辑被收敛成几条声明式属性：

| 工程需求 | 原生写法 | htmx 写法 |
| --- | --- | --- |
| 发起请求并替换内容 | `fetch` + 手动 DOM 操作 | `hx-get` / `hx-post` + `hx-target` |
| 监听服务端事件流 | 手写 `EventSource` + 解析 | `hx-ext="sse"` + `sse-swap` |
| 片段插到指定位置 | 手动 `querySelector` 定位 | `hx-swap-oob="true"` |
| 取消旧请求、控制并发 | 手动管理 `AbortController` | `hx-sync` |

换句话说，**htmx 是把流式 HTML 落地时最顺手的工程载体之一**，尤其适合不想引入重前端框架的内容型页面。它只有十几 KB，零构建步骤，一个 `<script>` 标签即可引入。

但有两个关键边界必须讲清：

**第一，htmx 默认不做边收边渲染。** 普通 `hx-get` 要等响应**完全结束**才一次性 swap。这意味着即使服务端用 chunked transfer 一段段地 `res.write`，htmx 仍然会等完整响应体收完再处理。要做到真正的逐块渲染，通常走它的 **SSE 扩展**（每个事件对应一个完整片段）；如果坚持用裸 chunked response，就要在 htmx 之外手写流式解析和 DOM 更新。第 6 节会展开这件事。

**第二，htmx 的流式粒度是"片段级"，不是"字节级"。** 它的最小操作单位是一个**完整 HTML 片段**：服务端发一个 `<article>...</article>`，htmx 收齐后整段插入。这对"一张张卡片冒出来"很合适，但**单个片段内部仍是一次性出现的**。如果你要的是"一段长文逐字打出来"——AI 生成最常见的形态——htmx 这一层就不够了，需要第 7 节的标准 Streams API 或实验性 DOM streaming API。

先记住这条分界：**htmx 负责装配块，原生流式 API 负责块内增量渲染。** 它们是协作关系，不是替代关系。

## 5. 最适合落地的产品场景

流式 HTML 最适合"内容逐步可用"的场景。判断标准不是页面复杂不复杂，而是**结果能不能分阶段产生、分阶段展示**。

- **AI 搜索和研究助手。** 问题理解、关键词扩展、召回、重排、摘要、引用构建本身就是阶段化流程。可以先展示搜索状态，再逐步铺出候选资料、核心结论和引用来源，让搜索过程变得可见。
- **数据分析和经营报表。** 看板由多个区块组成，查询复杂度参差不齐。核心指标先出，趋势图随后，异常解释最后补齐，业务用户不必被最慢的模块拖住整页。
- **报告、文章和长内容生成。** AI 生成报告、纪要、复盘时，内容通常逐段产出。直接流式输出 HTML，标题就是标题，表格就是表格，用户可以边看边滚、提前中止或修改。
- **企业内部详情页。** 商家、用户、工单、审批、告警详情背后通常涉及多个系统。主体信息先到，权限、画像、风控标签、操作日志陆续补齐。
- **电商和内容平台的局部补齐。** 页面主干快速展示，库存、推荐、评论、相似商品延后到达，避免整页被最慢模块拖住。

这些场景共享一个特征：**用户从早到达的部分就能拿到价值，而内容结构相对稳定、服务端清楚该如何展示**。这正是 htmx + 流式 HTML 的甜区。反过来也成立：如果一个页面无论怎么拆都只能"全有或全无"地呈现，流式带来的就只有复杂度，没有收益。

## 6. htmx 实战：三种渐进交付模式

下面给出三种用 htmx 实现渐进交付的模式：前两种是真正的事件流，第三种是更轻量的异步补齐。服务端示例使用 Node.js 原生 HTTP 模块，目的是讲清机制，不是替代生产框架。示例采用 CommonJS 写法，**Node 18+ 可直接运行**；前端依赖只有 htmx 和 SSE 扩展，通过 CDN 引入。

先看选型：

| 你要的效果 | 优先选 | 适合场景 |
| --- | --- | --- |
| 结果一条条到达并追加 | SSE 扩展 | AI 答案、搜索结果、日志流 |
| 多个慢模块乱序完成，各自归位 | SSE + OOB swap | 看板、详情页、分区块报告 |
| 页面主干先出，慢模块稍后加载 | `hx-trigger="load"` | 推荐、评论、库存、局部补齐 |

引入 htmx 只需在页面加上两行：

```html
<script src="https://unpkg.com/htmx.org@2"></script>
<script src="https://unpkg.com/htmx-ext-sse@2"></script>
```

> 生产环境建议把链接固定到具体小版本，并配上 SRI 哈希（[jsdelivr 提供生成工具](https://www.jsdelivr.com/?docs=sri)），避免 CDN 在不告知的情况下推送了不兼容的新版本。下面所有示例为了可读直接用 unpkg 的 latest tag。

### 模式一：SSE 扩展（最常用）

这是 AI 答案、搜索结果这类"事件逐个到达"场景的首选。服务端用 Server-Sent Events 持续推送事件，htmx 的 `sse` 扩展自动接收并插入页面，无需手写 `EventSource`。

页面侧：

```html
<div hx-ext="sse" sse-connect="/events" sse-close="done">
  <p id="status">正在分析...</p>
  <section id="results" sse-swap="result" hx-swap="beforeend"></section>
  <p sse-swap="done" hx-swap="innerHTML"></p>
</div>
```

`sse-connect` 建立连接，`sse-swap="result"` 表示"每收到一个 `result` 事件，就按 `beforeend` 把它的内容追加到 `#results`"。整段交互不需要一行 JavaScript。

服务端按 SSE 协议推送 HTML 片段，**`data` 字段直接放可插入的 HTML**，动态数据必须先做转义。下面的服务端同时托管页面，存盘后执行 `node sse-server.js`，访问 `http://localhost:3000` 即可看到效果。

如果只看机制，重点看三处：

- `sendSse()`：把事件名和 HTML 片段写成合法 SSE 格式。
- `/events` 响应头：声明 `text/event-stream`，并尽量关闭中间层缓冲。
- `done` 事件：告诉 htmx 这是一个有限任务，可以关闭连接。

```js
// sse-server.js（需要 Node 18+）
const { createServer } = require("node:http");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function card(title, summary) {
  return `<article class="result-card"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(summary)}</p></article>`;
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  // SSE 规范：完全没有 data 行的事件会被浏览器忽略——所以即使数据为空也至少写一行 data:
  const lines = String(data).split(/\r?\n/);
  if (lines.length === 1 && lines[0] === "") {
    res.write("data:\n");
  } else {
    for (const line of lines) res.write(`data: ${line}\n`);
  }
  res.write("\n");
}

const PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>SSE demo</title>
<script src="https://unpkg.com/htmx.org@2"></script>
<script src="https://unpkg.com/htmx-ext-sse@2"></script>
</head><body>
<div hx-ext="sse" sse-connect="/events" sse-close="done">
  <p id="status">正在分析...</p>
  <section id="results" sse-swap="result" hx-swap="beforeend"></section>
  <p sse-swap="done" hx-swap="innerHTML"></p>
</div>
</body></html>`;

createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }

  if (req.url !== "/events") {
    res.writeHead(404).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no" // 关键：让 Nginx 不缓冲
  });
  res.flushHeaders?.(); // 主动 flush headers，防止上游代理在拿到第一块 body 之前不转发

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const steps = [
    card("第一批结果", "核心摘要优先返回，让用户尽早判断方向。"),
    card("第二批结果", "较慢的数据源完成后，再补充证据。"),
    card("最终建议", "所有任务结束后，输出结论和引用来源。")
  ];

  for (const html of steps) {
    await sleep(800);
    if (closed) return;
    sendSse(res, "result", html);
  }

  if (closed) return;
  sendSse(res, "done", "生成完成");
  res.end();
}).listen(3000, () => console.log("http://localhost:3000"));
```

每次 `sendSse` 推一个事件，htmx 收到后立刻把卡片追加进页面。`sse-close="done"` 让 htmx 在收到 `done` 事件后正常关闭这条 EventSource，避免有限任务结束后按浏览器默认行为自动重连，导致看起来已经"完成"的页面仍在后台发请求。

要注意三点：

- **`sse-close` 关闭的是整条连接**——它会同时取消该容器内所有 `sse-swap` 的监听。要再次连接，需要重新挂载这个容器（典型做法是让外层 `hx-target` 重新 swap 一份骨架）。
- **完成态和异常态要分开处理。** 正常收到 `sse-close` 指定的事件后，可以监听 htmx 的 `htmx:sseClose` 做收尾；网络断开、服务端异常结束或解析失败这类情况才应该走 `htmx:sseError`。不要把 error 当成"生成完成"，否则真实故障会被吞掉。
- **中途断线会触发重连。** EventSource 默认会自动重连；如果这是一个有限任务，要么像上面一样发送明确的 `done` 事件并关闭连接，要么在协议里带上 job id、事件序号或 SSE 的 `id:` 字段，让服务端能按 `Last-Event-ID` 恢复，避免重连后从头 replay 导致重复追加。

用户离开页面或相关节点被替换时，`EventSource` 也会关闭；服务端仍要监听 `req.close`，在这里停掉昂贵任务。

> 这个 demo 只跑几秒钟，不需要心跳。但生产里如果一段时间没有业务事件可发——比如等模型推理超过 30 秒——服务端要周期性发一行 `: keep-alive\n\n` 注释行，否则中间层很可能把"看似空闲"的连接掐掉。详见第 8 节"基础设施可能破坏流式效果"。

SSE 还有一个容易写错的细节：事件由空行分隔，HTML 里的换行会破坏单行 `data:` 字段。处理办法有两种：要么给每一行内容都补上 `data:`（浏览器会把连续 `data:` 合并成一条消息）；要么把片段压成单行再发。后者适合简单演示，但会改变 `<pre>`、`textarea`、代码块等内容的空白语义。更稳的默认选择，是像上面的 `sendSse` 那样逐行写 `data:`。无论哪种，都不要直接把带换行的 HTML 拼进 ``data: ${html}`` 一行。

### 模式二：SSE 包裹的 OOB swap（声明式局部更新）

文章开头提到过"内容声明自己的目标位置，慢模块乱序返回也能各自归位"。htmx 的 **out-of-band swap** 已经能做到，但有一个容易踩的坑必须先讲清：

> **htmx 默认基于 XHR，普通 `hx-get` 会等响应 `end` 后才一次性 swap。** 即使服务端用 chunked transfer 一段段地 `res.write`，htmx 仍会收完整段后再处理 OOB。也就是说，"逐块到位"不会自动发生。要真正让每个片段一到就归位，最稳的方法是把 OOB 片段放进 SSE 事件里。

页面先给出带 `id` 的占位骨架，并连上同一条 SSE：

```html
<main hx-ext="sse" sse-connect="/dashboard" sse-close="done">
  <div id="summary">摘要加载中...</div>
  <div id="chart">趋势图加载中...</div>
  <div id="anomaly">异常分析加载中...</div>

  <!-- 任何带 hx-swap-oob 的片段送到这里都会被分发到对应 id -->
  <div sse-swap="patch" hx-swap="none"></div>
</main>
```

服务端按事件推送 OOB 片段，每个片段靠自己的 `id` 找到目标位置。`hx-swap-oob="true"` 默认是 **`outerHTML`** 替换——也就是用新片段整个换掉目标元素，**新片段必须自己保留 id**，否则下一次 OOB 就找不到目标了。下面只展示 `/dashboard` 处理函数里的关键部分，并继续复用上面的 `sendSse`：

```js
let closed = false;
req.on("close", () => { closed = true; });

res.writeHead(200, {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no"
});
res.flushHeaders?.();

await sleep(300);
if (closed) return;
// 实际接业务数据时，文本部分仍要走 escapeHtml；下面三段为保持示例简洁，写死了字符串
sendSse(res, "patch", `<div id="summary" hx-swap-oob="true">核心指标：营收 +12%</div>`);

await sleep(900);
if (closed) return;
sendSse(res, "patch", `<div id="chart" hx-swap-oob="true">[趋势图已渲染]</div>`);

await sleep(1500);
if (closed) return;
sendSse(res, "patch", `<div id="anomaly" hx-swap-oob="true">异常：华东区退款率偏高</div>`);

sendSse(res, "done", "ok");
res.end();
```

哪个区域先算完就先发，htmx 一收到事件就按 `id` 把它放回正确位置。这就是"可逐步补齐的文档"：骨架先到，慢模块乱序返回，各自归位。

如果 OOB 片段是 `<tr>`、`<td>`、`<li>` 这类不能独立解析的元素，要用 `<template>` 包起来；如果更新的是 SVG 内部元素，还要注意 SVG 命名空间。否则片段在进入 DOM 之前就可能被浏览器解析坏。

> 题外话：如果不要求"逐块到位"，只要"几个慢模块整体一起更新"，裸的 chunked HTML + OOB 也能用。只是用户会看到一段静默等待，然后所有区域同时刷新。这种情况通常用模式三的懒加载更直白。

### 模式三：懒加载补齐慢模块（最简单）

如果只是"页面主干先出，个别慢模块随后补齐"，连流都不用。htmx 的 `hx-trigger="load"` 可以让某个区块自己拉数据：

```html
<!-- 主干随页面一起返回，慢模块占位后自动加载 -->
<div hx-get="/recommendations" hx-trigger="load" hx-swap="outerHTML">
  <p>推荐内容加载中...</p>
</div>
```

页面一渲染，这个 div 就自动请求 `/recommendations`，拿到结果后替换自己。多个慢模块各自独立加载，互不阻塞。这是"局部补齐"类需求里最轻量的实现，**适合不需要真正流式、只需要异步并行的场景**。

这三种模式的关键区别不是代码复杂度，而是用户是否真的需要看到内容连续到达。模式一和模式二处理的是事件流；模式三处理的是独立异步请求，只是它经常已经足够解决"慢模块不要拖累整页"的问题。

但别忘了第 4 节那条边界：这三种模式都是**片段级**的。它们决定"哪个块何时出现"，单个块内部仍是整段插入的。当你需要"块内增量渲染"时，就要换工具了。

## 7. 字节级流式：标准 Streams 与实验性 streamHTML

设想一个典型 AI 场景：模型生成一段 500 字的结论，token 一个个吐出来，你希望它像打字机一样逐字落到页面上。

用 htmx 怎么做？两条路都别扭：

- **等整段生成完再发**：丢掉了"边生成边看"，又退回到 loading 转圈。
- **每几个 token 拆成一个 SSE 事件 + 一次 OOB 更新**：协议变重，DOM 操作粒度也偏粗；用替换容易闪烁，用追加则要自己处理 HTML 边界、安全策略和高频更新节奏。

根本原因第 4 节已经点明：htmx 的操作单位是**完整片段**，它不擅长"同一个元素内部持续追加字符"。这正是标准 Streams API 和浏览器实验性 HTML streaming API 要解决的问题。

### 当下可用：先流文本，再考虑 HTML

这里容易混淆，先拆开两件事：

1. **字节到文本**：用 `ReadableStream` + `TextDecoderStream` 把响应体持续解码出字符串块。
2. **文本到 DOM**：决定这些内容是当纯文本追加，还是作为 HTML 解析后插入。

生产环境里，跨浏览器更稳的做法仍然是先把 `fetch` 返回的字节流解码成字符串块，再把这些块追加到目标节点。下面是最小化示意：**这一版只追加纯文本**，目的是先把"流式读取 + 增量插入"这条管道打通：

```js
// 演示：把字节流当作纯文本追加。
// 服务端发的 <p>...</p> 在这里会被字面化展示，不会形成 DOM 节点。
// 生产里要配合 AbortController，在用户离开或重新搜索时调用 controller.abort()
// 及时停掉请求——否则慢的服务端会继续写、客户端继续读，浪费两端资源。
const target = document.getElementById("answer");
const controller = new AbortController();
const response = await fetch("/partial.html", { signal: controller.signal });

const reader = response.body
  .pipeThrough(new TextDecoderStream())
  .getReader();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  target.append(value);
}
```

如果服务端发的就是要被解析成 DOM 的 HTML 片段，这种"追加为文本"的写法显然不够。你需要自己处理 HTML 边界、安全策略和插入位置；不可信内容更不能直接 `innerHTML` 或 `insertAdjacentHTML`。这正是下面这组实验性 API 想包办的事：把字节流直接交给浏览器的 HTML 解析器，而不是拼字符串再插入：

```js
const target = document.getElementById("answer");
const response = await fetch("/partial.html");

// 浏览器没开旗标时，target.streamHTMLUnsafe 是 undefined——
// 调用前先做特性检测，不支持就回退到上一节的 TextDecoderStream + 自己处理插入
if (typeof target.streamHTMLUnsafe !== "function") {
  // ...回退逻辑
  return;
}

await response.body
  .pipeThrough(new TextDecoderStream())
  .pipeTo(target.streamHTMLUnsafe());
```

这类 API 属于 Chrome "Declarative Partial Updates" 方向的一部分，配套有 `streamHTML()`、`streamAppendHTML()`、`streamReplaceWithHTML()` 等不同插入位置的变体，也有 `Unsafe` 版本。

安全版本可以通过 Sanitizer API 配置清洗策略，并和 Trusted Types 等机制配合；`Unsafe` 版本默认不启用 sanitizer，虽然默认也不会运行脚本，但仍只应该用于服务端可信模板输出，不能直接喂用户输入、第三方内容或模型原文。

截至 2026 年 6 月，这组 API 仍属于 Chrome 的实验能力。Chrome 148+ 可以通过 `chrome://flags/#enable-experimental-web-platform-features` 开启开发测试，但标准化和跨浏览器支持都未完成。Chrome 团队也提供了 polyfill，但它主要兼容 API 形状，不能真正流式解析，仍会缓冲后再应用。

顺带一提，社区里偶尔会看到 `response.textStream()` 这种"省掉 `TextDecoderStream`"的便利写法。目前这只是讨论中的提案，没有任何稳定 Chrome 提供，先不要依赖。换言之，`streamHTML()` / `streamHTMLUnsafe()` 代表的是"块内 HTML 增量渲染"未来会被浏览器原生抽象掉的方向，但今天上生产仍要回到上一节的标准 Streams 方案。

和 htmx 不同，这里没有"完整片段再 swap"的概念：字符串块进来多少，页面就有机会渲染多少。但实际展示节奏仍受网络分包、浏览器解析和绘制调度影响，不应承诺严格的"每个字符一帧"。

## 8. 工程约束：让流式真正能跑起来

htmx 简化了客户端，但流式 HTML 的工程约束并不会消失。忽视这些约束，体验优化就会变成维护风险。

可以先把风险分成四类：**插入 HTML 的安全边界、端到端链路是否真的 flush、流式过程中的错误和取消、内容不断变化时的可访问性与布局稳定性**。

### 安全边界必须清晰

只要涉及 HTML 插入，就必须严肃处理 XSS。**htmx 会直接把响应当 HTML 注入 DOM**，所以服务端转义和可信边界一个都不能少。用户输入、第三方内容、模型输出都不能未经处理就拼进 HTML。

AI 场景里尤其要警惕：模型输出不应被天然视为可信 HTML。它可能产出脚本、事件属性、危险链接或伪造 UI。对不可信内容应使用成熟的 sanitizer。htmx 也提供 `hx-disable` 等手段限制某些区域的行为，但**安全策略必须由系统控制，不能交给模型自由决定**。

更具体地说，如果模型输出的是 Markdown，常见做法是先用受控的 Markdown parser 转成 HTML，再经过 sanitizer allowlist，只允许有限标签、属性和链接协议。不要让模型直接决定 `hx-*` 属性、事件属性、`javascript:` 链接或表单提交目标；这些交互能力应该由服务端模板显式生成。

### 基础设施可能破坏流式效果

流式能不能成立，不只取决于代码。代理、网关、CDN、压缩层都可能缓冲响应。只要中间层非要攒够一定大小才发，用户看到的就仍是一次性返回。常见检查点：

- 响应是否使用分块传输（SSE/chunked），而不是等 buffer 满
- HTTP/1.1 下浏览器对同域 SSE 连接数有限，多个模块不要轻易各开一条连接；优先复用一条事件流，或确认链路已经走 HTTP/2
- Nginx 是否关了 `proxy_buffering`（或响应头带 `X-Accel-Buffering: no`）
- CDN 是否缓存或合并了小块响应
- gzip 是否让内容迟迟不 flush
- 长时间没有业务事件时，服务端是否周期性发送 `: keep-alive\n\n` 这类 SSE 注释行，避免空闲连接被中间层断开
- 服务端框架是否自动聚合响应体

落地时必须端到端验证：服务端何时写出第一块，浏览器何时收到第一块。

### 错误处理要局部化

流式响应一旦开始发送，HTTP 状态码就已经发出，后续步骤失败时不能再简单换成 500。每个区块都要能独立表达失败。在 SSE + OOB swap 模式下，失败的区块可以发一个带错误提示和重试按钮的片段：

```js
sendSse(res, "patch", `<div id="chart" hx-swap-oob="true">
  加载失败 <button hx-get="/chart" hx-target="#chart">重试</button>
</div>`);
```

也就是说，服务端不只输出内容，也要输出状态。

### 取消和并发

用户可能重复点击、切换筛选、关闭页面。htmx 的 `hx-sync` 能声明式处理并发（例如 `hx-sync="this:replace"` 用新请求取消旧请求），SSE 连接也会在页面卸载时自动关闭。但**服务端要主动监听连接关闭并停掉昂贵任务**。AI 生成或大查询都不便宜，用户不需要时就该尽快停下来。

### 测试要覆盖过程

流式界面是一个过程，不是一张静态结果图。除了断言最终页面，还要覆盖过程中的关键断点：

- 首块是否足够早出现
- 后续片段是否按预期插入
- 慢区块是否阻塞了快区块
- 取消后是否真的停止更新
- 局部失败是否正确展示
- 重复请求是否交叉污染了页面

### 可访问性和交互节奏

流式内容会不断改变页面，不能只看"能不能插进去"。状态区可以使用 `aria-live="polite"` 让辅助技术知道内容正在更新；正在输入或聚焦的控件不要被 OOB swap 直接替换；结果卡片、图表和表格最好预留稳定空间，避免连续插入造成布局跳动。AI 生成类页面还应该给用户明确的停止入口，并在停止后让服务端真正取消后续任务。

## 9. 它和现代前端框架如何共存

htmx + 流式 HTML 经常被误解成"反前端框架"。更合理的架构不是二选一，而是按职责分层：

- **服务端适合**：数据获取、权限判断、业务规则、模板渲染、内容排序、渐进输出。
- **htmx / 浏览器适合**：发起请求、局部替换、事件流接收、请求取消、局部错误提示、对已到达内容的增强。
- **重前端框架适合**：复杂状态管理、编辑器、拖拽看板、多步骤表单、客户端路由、离线缓存。

成熟系统完全可以混用：**页面主体由服务端流式输出，htmx 负责装配，真正复杂的交互区域再交给 React/Vue 组件接管**。htmx 可以和这些框架共存于同一页面：内容型区域用 htmx，重交互孤岛用框架。

这种思路和 Islands Architecture、Server Components、Turbo Streams 同源：不要默认把所有 UI 都做成重客户端应用，而是按实际复杂度选择渲染位置。htmx 在这个谱系里代表"尽量留在 HTML 层"的一端，React 代表"尽量留在客户端"的一端，大多数真实项目落在两者之间。选择依据不是技术偏好，而是每块 UI 的状态复杂度。这也呼应了第 3 节那条分界线。

## 10. 什么时候不该用

流式 HTML + htmx 不是银弹，也不该被当成默认方案。出现以下情况要谨慎：

- **页面高度依赖复杂本地状态**，比如在线表格、设计器、流程编排、代码编辑器、多人协作画布——前端框架配结构化数据仍然更合适。
- **内容必须完整校验后才能展示**，比如金融交易确认、合规审批结果、强一致性报表——不太适合边生成边展示。
- **团队缺乏 HTML 安全经验，或基础设施无法保证真实的流式传输**——贸然引入只会增加风险。

更务实的策略是从低风险、高收益的页面开始：搜索结果、AI 答案、报告生成、内部详情页、慢模块补齐。这些场景收益明显，失败影响也相对可控。

## 11. 一个判断标准

是否该用流式 HTML，可以用三个问题判断：

1. **页面结果是否可以分阶段产生？**
2. **用户是否能从早到达的部分中获得价值？**
3. **服务端是否比前端更清楚这些内容应该如何展示？**

三个答案都是"是"，流式 HTML 就值得考虑，而 htmx 通常是把它落地的最短路径。

反过来，如果页面必须等所有数据完成才有意义，或者核心价值在复杂交互而非内容展示，那么收益就有限。

## 结语

流式 HTML 的价值，不在于它有多新，而在于它重新提醒我们：**Web 本来就是流式的，HTML 本来就是界面的语言，浏览器本来就擅长渐进渲染**。

单页应用浪潮把大量渲染责任搬到了客户端，这在很多场景下合理，但也把一些简单问题做复杂了。AI、搜索、数据分析和内容生成的兴起，让"逐步交付界面"重新成为高价值能力。

htmx 的意义，是把这套范式从"手写一堆流处理样板"变成"几个声明式属性"。它让工程师不必在"重前端框架"和"从零写流式逻辑"之间二选一：内容型页面可以留在 HTML 层，用较低的代价拿到流式体验。

未来的 Web 应用很可能既不是纯服务端，也不是纯客户端，而是更细粒度的混合形态：确定的内容由服务端快速交付，复杂的交互交给客户端框架，耗时的生成过程通过流式持续呈现。流式 HTML + htmx，正是这条路径上务实的起点。

## 参考资料

- [htmx 官方文档](https://htmx.org/docs/)
- [htmx SSE 扩展](https://htmx.org/extensions/sse/)
- [htmx Out of Band Swaps](https://htmx.org/attributes/hx-swap-oob/)
- [MDN Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
- [MDN Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [WHATWG Streams Standard](https://streams.spec.whatwg.org/)
- [Chrome Developers - Declarative partial updates](https://developer.chrome.com/blog/declarative-partial-updates)
