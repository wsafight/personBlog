---
title: Chrome DevTools Protocol 深度解读：从协议规格到工程实践
published: 2026-05-22
description: 从 Target、Domain、Method、Event 四个概念拆解 CDP，梳理 Remote Debugging Port、chrome.debugger、Puppeteer/Playwright 与 WebDriver BiDi 的取舍，并给出浏览器自动化常见任务和工程避坑清单。
tags: [Chrome, CDP, 浏览器自动化, Puppeteer, 前端工程]
category: 前端工程
draft: true
---

> 如果你写过 Puppeteer、Playwright、Chrome 扩展、浏览器录制回放工具，或者正在做能操作网页的 LLM Agent，那么你迟早会绕回同一个问题：浏览器底层到底是怎么被驱动的？

答案大概率就是 **Chrome DevTools Protocol**，简称 CDP。

CDP 是 Chrome DevTools、Puppeteer、Playwright、Headless Chrome、浏览器自动化扩展和很多 Agent 工具共同依赖的底层协议。把它理解清楚之后，很多过去看起来像“框架魔法”的能力都会变成明确的协议调用：

- 导航是 `Page.navigate`
- 截图是 `Page.captureScreenshot`
- 点击是 `Input.dispatchMouseEvent`
- 页面执行 JS 是 `Runtime.evaluate`
- 拦截请求是 `Fetch.requestPaused` + `Fetch.continueRequest`

这篇文章不打算把协议文档逐条翻译一遍。官方文档已经列出了所有 Domain、Method 和 Event，但它更像电话簿。本文更关注三个问题：

1. CDP 的协议模型到底是什么；
2. 面对一个浏览器自动化需求，应该先看哪个 Domain；
3. 什么时候应该直接写 CDP，什么时候应该继续用 Puppeteer / Playwright / WebDriver BiDi。

## 一、CDP 到底是什么

CDP 的全称是 **Chrome DevTools Protocol**。它最早是 Chrome DevTools 前端和浏览器后端之间的通信协议。

DevTools 看起来像浏览器的一部分，但它本质上是一个客户端。你打开 Elements、Network、Console、Performance 面板时，DevTools 前端会不断向浏览器后端发送命令，并接收浏览器推回来的事件：

```txt
DevTools UI  <---- JSON message ---->  Chromium backend
```

后来大家发现，既然 DevTools 可以靠这套协议检查 DOM、执行 JS、抓网络请求、打断点、模拟输入，那么任何程序也可以接入这套协议。于是 Headless Chrome、Puppeteer、Playwright、Chrome 扩展 debugger API 和很多自动化工具都站在了 CDP 之上。

CDP 的传输通常是 WebSocket，消息是 JSON 对象。它很像 JSON-RPC，但不要把它当作严格的 JSON-RPC 2.0 协议。一个典型请求长这样：

```json
{
  "id": 1,
  "method": "Page.navigate",
  "params": {
    "url": "https://example.com"
  }
}
```

浏览器会返回：

```json
{
  "id": 1,
  "result": {
    "frameId": "..."
  }
}
```

如果浏览器主动推送事件，则没有 `id`：

```json
{
  "method": "Runtime.consoleAPICalled",
  "params": {
    "type": "log",
    "args": []
  }
}
```

这就是 CDP 最核心的模型：**你发命令，浏览器回结果；浏览器发生状态变化时，再主动推事件。**

### 版本边界

CDP 不是 W3C 标准，它是 Chromium 事实标准。

官方协议站点同时提供 tip-of-tree 和 stable 1.3 两类文档。tip-of-tree 能看到最新能力，但会变化；stable 1.3 是 Chrome 64 时代的稳定子集，能力少很多。实际工程里不要只看网页文档，还要看当前浏览器真正暴露的协议：

```txt
http://localhost:9222/json/protocol
```

这个接口返回的是当前 Chrome 实例实际支持的协议 schema。做 SDK、扩展或长期维护的工具时，最好以它为准。

## 二、四个核心概念：Target / Session / Domain / Event

CDP 看起来方法很多，但真正需要先理解的概念只有四个。

### 2.1 Target：你到底在控制谁

Target 是 CDP 可以控制的对象。常见 Target 类型有：

| Target 类型 | 含义 |
|---|---|
| `page` | 一个普通 tab |
| `iframe` | 跨进程 iframe，常见于 OOPIF |
| `worker` | Web Worker |
| `service_worker` | Service Worker |
| `shared_worker` | Shared Worker |
| `browser` | 浏览器进程级 Target |

每个 Target 都有 `targetId`。CDP 命令必须发到正确的 Target，否则你会遇到很典型的错误：明明页面上有这个元素，命令却找不到；明明 worker 打了日志，`Runtime.consoleAPICalled` 却没有收到。

这里有一个容易误解的点：**frame 和 Target 不是一一对应的。**

同进程 iframe 通常共享主页面 Target，只是有不同的 execution context；跨进程 iframe 可能会变成新的 Target。Chrome 扩展的 `chrome.debugger` 文档也明确强调了这一点。工程上如果要覆盖所有 frame，需要同时处理：

- `Runtime.executionContextCreated`，用来发现同进程 frame 的执行上下文；
- `Target.setAutoAttach`，用来接住 OOPIF、worker 等子 Target。

### 2.2 Session：一次 attach 之后的通道

Target 是对象，Session 是你和这个对象之间建立起来的调试通道。

在 Remote Debugging Port 模式里，你通常会直接拿到某个 Target 的 WebSocket URL。连接之后，这条 WebSocket 就是你的会话。

在 `chrome.debugger` 里，情况更明显：

```ts
await chrome.debugger.attach({ tabId }, "1.3");
await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
```

Chrome 125 之后，`chrome.debugger` 支持 flat session。你可以在同一个 root debugger session 下，通过 `sessionId` 向子 Target 发命令：

```ts
await chrome.debugger.sendCommand({ tabId }, "Target.setAutoAttach", {
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true,
  filter: [{ type: "iframe", exclude: false }],
});
```

这对处理 OOPIF 很关键。否则你只 attach 了主页面，却漏掉真正承载业务 DOM 的跨域 iframe。

### 2.3 Domain：按职责拆开的命名空间

CDP 不是一个扁平 RPC 列表，而是按职责拆成了很多 Domain：

```txt
Domain.Method  ->  你主动发的命令
Domain.Event   ->  浏览器主动推的事件
```

举几个例子：

| 名称 | 类型 | 含义 |
|---|---|---|
| `Page.navigate` | Method | 导航到指定 URL |
| `Page.loadEventFired` | Event | 页面触发 load 事件 |
| `Input.dispatchMouseEvent` | Method | 合成鼠标事件 |
| `Runtime.consoleAPICalled` | Event | 页面调用了 console API |
| `Fetch.requestPaused` | Event | 请求被 Fetch 拦截暂停 |

学习 CDP 不应该从背 Method 开始，而应该先记住常用 Domain 的边界。

| Domain | 负责什么 | 常用 Method / Event |
|---|---|---|
| `Page` | 页面生命周期、导航、截图、frame tree | `navigate`、`reload`、`captureScreenshot`、`getLayoutMetrics`、`loadEventFired` |
| `Runtime` | 执行 JS、管理 RemoteObject、监听 console | `evaluate`、`callFunctionOn`、`getProperties`、`releaseObject`、`consoleAPICalled` |
| `DOM` | DOM 节点查询、描述、坐标盒模型 | `getDocument`、`querySelector`、`describeNode`、`getBoxModel`、`resolveNode` |
| `DOMSnapshot` | 一次性序列化 DOM、layout、部分 style | `captureSnapshot` |
| `Accessibility` | 可访问性树，适合拿 role/name | `getFullAXTree`、`getPartialAXTree` |
| `Input` | 合成键盘、鼠标、触摸、文本输入 | `dispatchMouseEvent`、`dispatchKeyEvent`、`insertText`、`dispatchTouchEvent` |
| `Network` | 网络观测、响应体、cookie、缓存 | `enable`、`getResponseBody`、`getCookies`、`requestWillBeSent` |
| `Fetch` | 请求拦截、改包、mock 响应 | `enable`、`continueRequest`、`failRequest`、`fulfillRequest`、`requestPaused` |
| `Target` | Target 发现、attach、子 Target 管理 | `getTargets`、`attachToTarget`、`setAutoAttach` |
| `Emulation` | 模拟视口、UA、地理位置、媒体特性、焦点 | `setDeviceMetricsOverride`、`setUserAgentOverride`、`setFocusEmulationEnabled` |
| `Debugger` | JS 断点、暂停、恢复、调用栈 | `enable`、`setBreakpoint`、`pause`、`resume` |

一旦你知道“这件事归哪个 Domain 管”，剩下的问题只是查具体参数。

## 三、接入 CDP 的四条路径

同样是 CDP，不同接入方式的约束差异很大。

### 3.1 Remote Debugging Port：外部程序驱动浏览器

启动 Chrome 时打开调试端口：

```bash
google-chrome --remote-debugging-port=9222
```

然后访问：

```txt
http://localhost:9222/json
```

可以拿到当前 Target 列表和对应的 WebSocket URL：

```json
[
  {
    "id": "DAB7FB...",
    "type": "page",
    "url": "https://example.com",
    "webSocketDebuggerUrl": "ws://localhost:9222/devtools/page/DAB7FB..."
  }
]
```

随后用 WebSocket 发送命令：

```ts
const ws = new WebSocket("ws://localhost:9222/devtools/page/<targetId>");

ws.send(JSON.stringify({
  id: 1,
  method: "Page.navigate",
  params: { url: "https://example.com" },
}));
```

这条路径适合写独立程序、CLI、爬虫、测试框架和内部自动化平台。

它的优点是跨语言、跨进程、协议透明；缺点是通常需要控制 Chrome 的启动参数。你不能随便接管一个普通方式启动、没有打开 remote debugging port 的用户浏览器。

### 3.2 chrome.debugger：扩展内驱动真实用户浏览器

Chrome 扩展可以通过 `chrome.debugger` 使用 CDP：

```ts
await chrome.debugger.attach({ tabId }, "1.3");
await chrome.debugger.sendCommand({ tabId }, "Page.navigate", { url });

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === "Runtime.consoleAPICalled") {
    console.log(source, params);
  }
});
```

它和 Remote Debugging Port 的最大区别是：**它运行在用户已经打开的 Chrome 里。**

所以它适合做：

- 智能填表
- 浏览器录制回放
- 用户真实会话里的网页 Agent
- 需要复用用户 cookie、登录态、扩展环境的自动化工具

但这条路径也有强约束：

- 扩展必须声明 `"debugger"` 权限；
- 用户会看到调试提示；
- 出于安全原因，`chrome.debugger` 不能访问所有 CDP Domain；
- 对同一个 tab 打开 DevTools 时，会终止扩展的调试连接；
- 复杂页面需要处理同进程 frame 和 OOPIF 两套机制。

如果你要在 MV3 扩展里做浏览器自动化，`chrome.debugger` 基本就是绕不开的底层能力。

### 3.3 Puppeteer / Playwright：高层封装

Puppeteer 和 Playwright 本质上是“CDP + 高层语义 + 自动等待 + 选择器系统”的封装。

你写：

```ts
await page.goto("https://example.com");
await page.click("#submit");
```

底层会被拆成一组协议操作：导航、等待生命周期、解析选择器、计算元素盒模型、滚动到可见区域、发送鼠标事件等。

这也是为什么理解 CDP 会帮助你调试 Puppeteer / Playwright 的奇怪问题。比如：

- click 为什么落空；
- screenshot 为什么缺一段；
- navigation 为什么已经返回但页面还没稳定；
- worker 里的 console 为什么没被监听到；
- 某个 CDP 参数框架没有暴露出来怎么办。

不过，只要你的目标是 E2E 测试或常规爬取，优先使用 Playwright / Puppeteer 仍然是更现实的选择。它们解决了大量“等待”和“选择器”细节，裸 CDP 不会替你做这些。

### 3.4 WebDriver BiDi：标准化方向

WebDriver BiDi 是 W3C 正在推进的双向浏览器自动化协议。它希望统一 Chrome、Firefox、Safari 等浏览器的自动化能力。

它的方向是对的：跨浏览器、标准化、双向事件。但在 Chromium 生态里，CDP 仍然是能力最细、暴露最多、更新最快的协议。尤其是调试、性能、Tracing、Fetch 拦截、细粒度输入模拟这些能力，CDP 仍然更直接。

所以可以粗略这样判断：

- 要跨浏览器标准化，关注 WebDriver BiDi；
- 要吃满 Chromium 能力，直接看 CDP；
- 要写测试，优先 Playwright；
- 要写 Chrome 扩展里的自动化，关注 `chrome.debugger` + CDP。

## 四、常见任务速查

下面按“我要做 X，该调哪个命令”的方式整理。

### 4.1 导航到一个 URL，并等待加载

最小命令是：

```ts
await sendCommand("Page.navigate", {
  url: "https://example.com",
});
```

但 `Page.navigate` 返回不代表页面已经加载完成，它只代表导航已经被发起。要等待页面生命周期，需要先启用 Page Domain 并监听事件：

```ts
await sendCommand("Page.enable");

const done = waitForEvent("Page.loadEventFired");

await sendCommand("Page.navigate", {
  url: "https://example.com",
});

await done;
```

如果你关心 SPA、XHR、渲染稳定，`loadEventFired` 仍然不够。那时需要组合 `Page.lifecycleEvent`、`Network.loadingFinished`、`Runtime.evaluate` 自定义探测，或者回到 Playwright 的 auto waiting。

### 4.2 截网页截图

固定视口截图：

```ts
await sendCommand("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  mobile: false,
});

const { data } = await sendCommand("Page.captureScreenshot", {
  format: "png",
});
```

整页截图：

```ts
const { data } = await sendCommand("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true,
});
```

返回的 `data` 是 base64。工程上要注意三件事：

1. 先设置 viewport，再导航或截图；
2. 高 DPR 会显著放大图片体积；
3. 页面里有懒加载图片时，只靠 `captureBeyondViewport` 不一定能触发所有资源加载。

### 4.3 拿 DOM、样式和语义信息

CDP 没有一个“给我完整页面状态”的万能命令。不同需求要组合不同 Domain。

| 方法 | 适合 | 不适合 |
|---|---|---|
| `DOM.getDocument` + `DOM.querySelector` | 精确查节点、后续继续操作节点 | 一次性拉整页大 DOM |
| `DOMSnapshot.captureSnapshot` | 批量拿 DOM、layout、computed style | 拿节点 handle 做交互 |
| `Accessibility.getFullAXTree` | 给 Agent / LLM 提供语义树 | 拿布局和 CSS |
| `Page.getLayoutMetrics` | 拿 viewport、content size、滚动相关信息 | 替代 DOM 查询 |

如果你要给 LLM Agent 提供页面上下文，通常需要并发取三类信息：

```ts
const [snapshot, axTree, metrics] = await Promise.all([
  sendCommand("DOMSnapshot.captureSnapshot", {
    computedStyles: ["display", "visibility", "opacity", "pointer-events"],
  }),
  sendCommand("Accessibility.getFullAXTree"),
  sendCommand("Page.getLayoutMetrics"),
]);
```

然后在客户端侧把 DOM、layout 和 AXTree join 起来。CDP 的设计偏“小而正交”，复杂状态要靠组合，而不是指望一个 Method 返回所有东西。

### 4.4 模拟点击

点击不是一个命令，而是一组输入事件：

```ts
await sendCommand("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x,
  y,
  button: "none",
});

await sendCommand("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x,
  y,
  button: "left",
  clickCount: 1,
});

await sendCommand("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x,
  y,
  button: "left",
  clickCount: 1,
});
```

几个细节很关键：

- `mousePressed` 和 `mouseReleased` 要成对；
- `clickCount: 2` 才是双击语义；
- `modifiers` 是 bitmask：Alt=1、Ctrl=2、Meta/Command=4、Shift=8；
- 坐标是 CSS 像素，不是物理像素；
- 坐标相对 viewport 左上角，不是文档左上角；
- 点击前最好用 `DOM.getBoxModel` 或 `Runtime.evaluate(getBoundingClientRect)` 重新计算位置。

点击落空通常不是 Input Domain 的问题，而是坐标、滚动、布局时机或 Target 发错了。

### 4.5 输入文字：键盘事件和文本插入不是一回事

`Input.dispatchKeyEvent` 更像“按键盘”：

```ts
await sendCommand("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "a",
  code: "KeyA",
  text: "a",
});

await sendCommand("Input.dispatchKeyEvent", {
  type: "keyUp",
  key: "a",
  code: "KeyA",
});
```

它适合需要触发 `keydown` / `keyup` 监听器的场景，比如快捷键、游戏、富文本编辑器的部分交互。

`Input.insertText` 更像“输入法提交了一段文本”：

```ts
await sendCommand("Input.insertText", {
  text: "你好，CDP",
});
```

它适合中文、emoji、长文本填充。官方文档也把它描述为模拟来自 IME 或 emoji keyboard 的文本插入。代价是它不等价于逐个键盘事件，不要指望它触发完整的 keydown 流程。

另外要注意，`Input.insertText` 在 CDP 里仍标记为实验能力。面向长期维护的 SDK 时，最好先确认目标 Chrome 版本实际暴露了这个 Method。

实践里的判断很简单：

- 填普通文本框：优先 `insertText`；
- 测快捷键或键盘监听：用 `dispatchKeyEvent`；
- 操作复杂富文本：两者都可能要试，必要时退回页面内 JS。

### 4.6 在页面里执行 JS

`Runtime.evaluate` 是最常用的 CDP Method 之一：

```ts
const result = await sendCommand("Runtime.evaluate", {
  expression: "document.querySelector('#submit')?.getBoundingClientRect()",
  returnByValue: true,
});
```

`returnByValue` 决定返回方式：

| 模式 | 行为 | 适合场景 |
|---|---|---|
| `returnByValue: true` | 把结果序列化成 JSON 返回 | plain object、string、number、boolean |
| `returnByValue: false` | 返回 `RemoteObject`，带 `objectId` | 后续继续操作对象或 DOM 节点 |

典型链路是：

```txt
Runtime.evaluate(returnByValue: false)
  -> 拿到 RemoteObject.objectId
DOM.getBoxModel({ objectId })
  -> 拿到坐标
Input.dispatchMouseEvent
  -> 点击
Runtime.releaseObject({ objectId })
  -> 回收远程对象
```

只要拿到了 `objectId`，就要记得释放：

```ts
let objectId: string | undefined;

try {
  const { result } = await sendCommand("Runtime.evaluate", {
    expression: "document.querySelector('#submit')",
    returnByValue: false,
  });

  objectId = result.objectId;

  if (!objectId) return;

  const box = await sendCommand("DOM.getBoxModel", { objectId });
  // ... use box ...
} finally {
  if (objectId) {
    await sendCommand("Runtime.releaseObject", { objectId });
  }
}
```

Puppeteer 的 `ElementHandle.dispose()` 本质上就是在帮你做这类资源释放。

### 4.7 拦截和修改网络请求

观测网络用 `Network`，拦截网络优先看 `Fetch`。

```ts
await sendCommand("Network.enable");
await sendCommand("Fetch.enable", {
  patterns: [
    { urlPattern: "*", requestStage: "Request" },
  ],
});

onEvent("Fetch.requestPaused", async ({ requestId, request }) => {
  if (shouldBlock(request.url)) {
    await sendCommand("Fetch.failRequest", {
      requestId,
      errorReason: "BlockedByClient",
    });
    return;
  }

  await sendCommand("Fetch.continueRequest", { requestId });
});
```

`Fetch.requestPaused` 触发后，请求会暂停，直到你调用：

- `Fetch.continueRequest`
- `Fetch.failRequest`
- `Fetch.fulfillRequest`
- `Fetch.continueWithAuth`

所以这里最常见的事故是：某个分支忘了 continue，页面请求就会永远 pending。

如果你要 mock 响应，可以用 `Fetch.fulfillRequest`：

```ts
await sendCommand("Fetch.fulfillRequest", {
  requestId,
  responseCode: 200,
  responseHeaders: [
    { name: "Content-Type", value: "application/json" },
  ],
  body: btoa(JSON.stringify({ ok: true })),
});
```

### 4.8 给后台 tab 模拟焦点

后台 tab 会受到 Chrome 节流影响：`requestAnimationFrame` 变慢、timer 被合并、部分输入行为不稳定。

CDP 提供了一个实验能力：

```ts
await sendCommand("Emulation.setFocusEmulationEnabled", {
  enabled: true,
});
```

它模拟页面层面的焦点状态，但不会改变操作系统窗口焦点，也不等价于把 tab 真正切到前台。适合自动化工具减少后台执行时的页面状态差异，但不能把它当万能解法。

## 五、写 CDP 代码的工程直觉

CDP 的 API 不难，难的是状态管理。下面这些经验比背 Method 更有用。

### 5.1 每个 sendCommand 都可能失败

失败原因可能是：

- Target 已关闭；
- session 已 detach；
- frame 导航后 execution context 被销毁；
- DevTools 抢占了调试连接；
- OOPIF 还没 attach；
- 页面 crash；
- 协议版本不支持某个 Method 或参数。

不要把 CDP 调用写成普通业务 RPC。至少要区分“可以重试”和“必须放弃”：

```ts
function isDetachedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /detached|not attached|target closed|target crashed|No target/i.test(msg);
}
```

工程里最好有统一的 `sendCommand` wrapper，负责打日志、加 timeout、归类错误、处理 session 状态。

### 5.2 enable 之后要知道在哪里 disable

很多 Domain 需要先 enable 才会推事件：

- `Page.enable`
- `Runtime.enable`
- `Network.enable`
- `Fetch.enable`
- `Debugger.enable`

enable 之后，浏览器会持续向客户端推事件。尤其是 `Network` 和 `Fetch`，事件量很大。长期运行的 Agent 或扩展如果忘了 disable，很容易出现 CPU、内存和消息队列堆积。

实践建议：

- 只在需要事件时 enable；
- 任务完成后 disable；
- 长会话里做引用计数，避免多个模块互相关闭对方需要的 Domain；
- `Fetch.enable` 要格外谨慎，因为它会真的暂停请求。

### 5.3 RemoteObject 是浏览器里的引用，不是普通 JSON

只要 `Runtime.evaluate` 返回了 `objectId`，浏览器就会保留一个远程对象引用。你不 release，它就可能在 V8 堆里一直活着。

如果一次任务会抓很多元素，优先使用 `objectGroup`：

```ts
await sendCommand("Runtime.evaluate", {
  expression: "document.querySelectorAll('button')",
  returnByValue: false,
  objectGroup: "agent-scan",
});

await sendCommand("Runtime.releaseObjectGroup", {
  objectGroup: "agent-scan",
});
```

批量扫描页面时，`releaseObjectGroup` 比逐个 release 更稳。

### 5.4 先确认 Target，再谈 DOM

很多 CDP bug 表面上是“找不到元素”，实际是命令发错了 Target 或 execution context。

排查顺序应该是：

1. 当前命令发给了哪个 Target；
2. 这个 Target 对应哪个 frame / worker；
3. 目标 DOM 是否在 OOPIF 里；
4. 当前 JS 是否跑在正确的 execution context；
5. 页面是否刚刚导航导致 context 失效。

如果页面里有跨域 iframe，不处理 `Target.setAutoAttach` 基本一定会踩坑。

### 5.5 Input 前先建立一个布局屏障

导航结束不代表 layout 已经稳定。元素可能刚插入 DOM，样式还没计算完，图片还在撑开布局，前端框架还在下一轮 microtask 里改位置。

不要靠固定 sleep 解决点击落空。更稳的做法是，在 Input 前调用一个会读取布局的命令：

```ts
const box = await sendCommand("DOM.getBoxModel", { objectId });
```

或者：

```ts
const rect = await sendCommand("Runtime.callFunctionOn", {
  objectId,
  functionDeclaration: "function() { return this.getBoundingClientRect().toJSON(); }",
  returnByValue: true,
});
```

读取布局本身会迫使浏览器把一部分 layout 状态算出来。它不能保证页面永远不再变化，但比“等 500ms”更可解释。

### 5.6 attach 要做并发去重

自动化工具经常从多个入口触发 attach：

- tab activated；
- target created；
- 用户点击开始录制；
- 后台任务恢复；
- OOPIF attached。

如果两个流程同时 attach 同一个 tab，状态机很容易乱。用 in-flight promise 做去重：

```ts
const attaching = new Map<number, Promise<Session>>();

async function attachOnce(tabId: number): Promise<Session> {
  const existed = attaching.get(tabId);
  if (existed) return existed;

  const promise = (async () => {
    await chrome.debugger.attach({ tabId }, "1.3");
    return { tabId };
  })();

  attaching.set(tabId, promise);

  try {
    return await promise;
  } finally {
    attaching.delete(tabId);
  }
}
```

这种 promise dedup 不只适合 CDP。任何昂贵、可重入、并发会撞车的初始化逻辑都该这么写。

### 5.7 不要迷信“页面内 JS”

很多事可以用 `Runtime.evaluate` 在页面里完成，比如 querySelector、读文本、点按钮：

```ts
document.querySelector("#submit")?.click();
```

但它和真实输入不是一回事。

页面内 JS 触发的是 DOM API；`Input.dispatchMouseEvent` 走的是浏览器输入管线。区别会体现在：

- `isTrusted`；
- hover / pointer / mouse 事件顺序；
- focus 行为；
- 复杂控件；
- 反自动化检测；
- canvas / WebGL / 游戏类页面。

经验上：

- 读状态：优先 `Runtime.evaluate`；
- 操作真实 UI：优先 `Input`；
- 表单填充：`insertText` 和页面内赋值都可以，但要确认目标框架是否监听 input/change；
- canvas、富文本、复杂拖拽：尽量走真实输入链路。

## 六、什么时候用裸 CDP

抽象层没有绝对好坏，只有适不适合。

| 目标 | 推荐选择 | 原因 |
|---|---|---|
| 写稳定 E2E 测试 | Playwright | 选择器、断言、auto waiting、trace 都成熟 |
| 写普通 Chromium 爬虫 | Puppeteer / Playwright | API 简洁，生态完善 |
| 写 Chrome 扩展里的自动化 | `chrome.debugger` + CDP | 扩展内不能直接跑 Puppeteer，且要复用用户真实会话 |
| 写网络录制、mock、回放 | CDP `Fetch` + `Network` | 协议能力更细 |
| 写浏览器 Agent | CDP + 自己的状态模型 | 每一步都需要拿页面中间状态，高层等待反而可能碍事 |
| 做跨浏览器自动化 | Playwright / WebDriver BiDi | CDP 主要服务 Chromium |
| 做性能、Tracing、调试器 | CDP | 能力最完整 |

我的判断标准是：

1. 如果你需要的是“像用户一样完成一个测试流程”，用 Playwright；
2. 如果你需要的是“精确控制 Chromium 的内部能力”，用 CDP；
3. 如果你需要的是“控制用户当前 Chrome”，用 `chrome.debugger`；
4. 如果你需要的是“跨浏览器协议一致性”，看 WebDriver BiDi。

很多人遇到 Puppeteer 不支持某个参数时，第一反应是换库。其实更直接的办法往往是开一个 CDP session：

```ts
const client = await page.target().createCDPSession();

await client.send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
});
```

高层框架和裸 CDP 不是二选一。最实用的方式是：大部分流程用 Playwright / Puppeteer，少数框架没暴露的能力直接下探 CDP。

## 七、学习路线

CDP 不复杂，但它很广。学习时不要试图一次读完所有 Domain。

建议按这个顺序来：

1. 先理解 `Target`、`Session`、`Domain`、`Method`、`Event`；
2. 记住 `Page`、`Runtime`、`DOM`、`Input`、`Network`、`Fetch`、`Target` 这几个 Domain 的边界；
3. 用 Remote Debugging Port 自己写一个最小 CDP client；
4. 实现五个任务：导航、截图、读 DOM、点击、拦截请求；
5. 再去看 Puppeteer / Playwright 里对应 API 是怎么封装 CDP 的；
6. 真正做工程时，把错误处理、资源释放、Target 管理、并发 attach 当成核心模块设计。

最小 CDP client 不需要多少代码：

```ts
let id = 0;
const callbacks = new Map<number, (value: unknown) => void>();

function send(method: string, params?: Record<string, unknown>) {
  const messageId = ++id;

  ws.send(JSON.stringify({
    id: messageId,
    method,
    params,
  }));

  return new Promise((resolve) => {
    callbacks.set(messageId, resolve);
  });
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.id) {
    callbacks.get(message.id)?.(message.result);
    callbacks.delete(message.id);
    return;
  }

  console.log("event", message.method, message.params);
};
```

写完这个小东西，再回头看 Puppeteer / Playwright，你会发现它们不再神秘。它们做的事情主要是：把协议调用组合成更符合人类直觉的 API，并补上自动等待、选择器、错误恢复和跨浏览器差异。

## 八、收官

CDP 是理解 Chromium 自动化的地基。

它不是一个适合所有人的高层框架，而是一套低层、直接、能力很强的协议。它的价值不在于替代 Puppeteer 或 Playwright，而在于让你知道浏览器到底能做什么，以及当高层框架够不到时，应该往哪里下探。

如果只记住一句话，那就是：

> 先用 Domain 判断职责，再用 Method 解决问题；先确认 Target，再怀疑代码。

## 参考资料

- [Chrome DevTools Protocol 官方文档](https://chromedevtools.github.io/devtools-protocol/)
- [CDP Page Domain](https://chromedevtools.github.io/devtools-protocol/tot/Page/)
- [CDP Input Domain](https://chromedevtools.github.io/devtools-protocol/tot/Input/)
- [CDP Fetch Domain](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/)
- [Chrome extension chrome.debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [W3C WebDriver BiDi](https://w3c.github.io/webdriver-bidi/)
