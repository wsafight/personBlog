---
title: 用官方模板理解 Decky 插件：一次从模板到架构的速览
published: 2026-02-09
description: 以官方 decky-plugin-template 为索引，拆解 Steam Deck 插件的前端 React 组件、Python 后端、Decky Loader 运行时与开发部署流程
tags: [Decky, Steam Deck, 插件开发, React, Python, SteamOS, CEF, 开源]
category: 插件开发
draft: false
---

> 面向第一次接触 Steam Deck 插件开发的读者。本文以官方仓库 [decky-plugin-template](https://github.com/SteamDeckHomebrew/decky-plugin-template) 为索引，逐个文件讲清它们为什么存在、如何协作，并给出模板之外、上线前必遇的几个坑。

## TL;DR

- 一个 Decky 插件 = **Steam CEF 里的 React 组件** + **SteamOS 上的 Python 进程**，两者通过 Decky Loader 提供的 `callable` / `emit` 通信；
- 前端入口固定是 `src/index.tsx` 的 `definePlugin(factory)`，后端入口固定是 `main.py` 里的 `class Plugin`，方法必须 `async`、参数必须 JSON-safe；
- 路径、日志、配置全部走 `decky.DECKY_PLUGIN_*` 常量，**不要**硬编码 `~/homebrew/...`；
- 开发流程靠 `.vscode/` 下一套 shell 脚本闭环（build → rsync → 重启 plugin_loader），不用 VS Code 也能复刻；
- 需要 root 就加 `_root` flag，但能用精确 `sudo` 解决的就别加——商店审核不喜欢。

## Decky 插件到底是什么

Steam Deck 的游戏模式并不是一个独立 UI，而是 Steam 客户端内部的一组 CEF（Chromium Embedded Framework）页面。Valve 没有公开扩展 API，于是社区做了一个注入框架 —— [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)。它做三件事：

1. **注入 UI**：在游戏模式的侧边栏挂一个入口，加载第三方插件的 React 组件；
2. **管理后端**：为每个插件拉起一个独立的 Python 进程，提供生命周期钩子与 RPC 通道；
3. **约定目录**：给每个插件划拨固定的配置、运行时、日志目录，写在 `decky.DECKY_PLUGIN_*` 这一组环境变量里。

所以一个 Decky 插件的最小认知是：

> 一个跑在 Steam 客户端 CEF 里的 React 组件 + 一个跑在 SteamOS 上的 Python 小后端，两者通过 Decky Loader 的 RPC/事件总线通信。

下文以官方模板作为参照，逐个文件拆开看。

## 模板长什么样

克隆官方模板后，目录结构大致如下（无关文件省略）：

```
decky-plugin-template/
├── plugin.json              # 插件元数据
├── main.py                  # Python 后端入口，类名必须是 Plugin
├── package.json             # 前端依赖（pnpm 管理）
├── rollup.config.js         # 使用 @decky/rollup 官方 preset
├── tsconfig.json
├── decky.pyi                # decky 运行时模块的类型存根，供 IDE 用
├── src/
│   ├── index.tsx            # 前端入口，默认导出 definePlugin(...)
│   └── types.d.ts           # 让 TS 识别 *.png / *.svg / *.jpg 资源
├── assets/
│   └── logo.png             # 插件图标/资源
├── defaults/
│   └── defaults.txt         # 会被打进插件根目录的静态文件
├── py_modules/              # 第三方 Python 依赖放这里（vendored）
├── backend/                 # 原生后端（可选），用 Docker + Make 构建
│   ├── Dockerfile
│   ├── Makefile
│   ├── entrypoint.sh
│   └── src/main.c
└── .vscode/                 # 一键 setup/build/deploy 任务
    ├── tasks.json
    ├── setup.sh
    ├── build.sh
    ├── config.sh
    └── defsettings.json
```

这个结构看似很多，但按职责其实只有四组：**插件声明**（`plugin.json`、`package.json`）、**前端运行时**（`src/`、`rollup.config.js`、`tsconfig.json`）、**后端运行时**（`main.py`、`py_modules/`、`backend/`、`defaults/`）、**开发工作流**（`.vscode/` 下的脚本与任务）。下面每一节就按这四组展开。

运行时的调用链可以用一张图收拢：

```
        Steam Client (CEF)                    SteamOS (userland)
+-----------------------------------+   +-----------------------------------+
|  Steam UI                         |   |  Decky Loader (systemd service)   |
|  (hosts shared React, external'd) |   |     |                             |
|     |                             |   |     +--> python main.py           |
|     +--> dist/index.js            |   |          (class Plugin, 1 proc)   |
|          (ESM, injected by Loader)|   |               ^                   |
|               ^                   |   |               | async def xxx     |
|               | definePlugin()    |   |               |                   |
|               |                   |   |               |                   |
|          callable("xxx", args) ---+---+---> RPC ----->|                   |
|                                   |   |                                   |
|          addEventListener <-------+---+---- decky.emit("evt", ...)        |
+-----------------------------------+   +-----------------------------------+
```

前端 ESM bundle 和后端 Python 进程物理上互不知晓，唯一的桥是 Decky Loader 提供的一对原语：`callable` / `emit`。后面每一节本质上都在讲这张图里某一块的细节。

## 插件声明：`plugin.json` 与 `package.json`

`plugin.json` 是 Decky Loader 在加载插件时第一个读到的文件。官方模板里长这样：

```json
{
  "name": "Example Plugin",
  "author": "John Doe",
  "flags": ["debug", "_root"],
  "api_version": 1,
  "publish": {
    "tags": ["template", "root"],
    "description": "Decky example plugin.",
    "image": "https://opengraph.githubassets.com/1/SteamDeckHomebrew/PluginLoader"
  }
}
```

几处容易被忽略的细节：

- **`name` 是展示名，不是插件目录名**：
  - 它是环境变量 `DECKY_PLUGIN_NAME`，也是菜单/商店里显示给用户的名字；
  - 真正的插件目录由安装时的 zip 顶层目录/安装路径决定，Decky Loader 源码里 `plugin.json.name` 和实际的 `plugin_directory` 是两个独立概念——配置、日志、运行时目录用的是"目录名"，不是这里的展示名；
  - 模板 `.vscode/defsettings.json` 里的 `pluginname` 只是部署脚本的变量，它决定 `rsync` 到 Deck 上的目标目录叫什么，并不是一种"绑定关系"，只是多数人习惯让两者保持一致；
  - **不要**据此手拼 `~/homebrew/settings/<name>/` 这类配置目录，真实的设置、运行时、日志路径请统一读 `decky.DECKY_PLUGIN_*_DIR` 常量。改过插件目录名、包名或历史配置路径时，用 `_migration` 钩子迁移旧数据（下文讲）。
- **`flags`** 是权限/行为声明，目前 Decky Loader 实际消费的是下面这两个：
  - `_root` / `root`：含义是让后端以 root 身份运行，能访问 `/usr/` 下的系统文件。历史上模板里的 key 与 Loader 源码中判断的 key 存在过命名不一致（`_root` vs `root`），近期有所统一——**提交前请以当前 `SteamDeckHomebrew/decky-loader` 源码及 `decky-plugin-database` CI 的校验结果为准**，不要把任何一侧当作权威；
  - `debug`：在开发期打开额外日志。
  - 模板默认开着 `_root` 只是为了演示能力，**真实插件通常不要主动开 `_root`**——能用 `subprocess` + 精确 `sudo` 命令解决的事，就不要让整个后端进程都带特权。社区经验上，带 `_root` 的插件在商店审核时也更容易被打回。其他 `flags` 值 Loader 当前会忽略，不要依赖未文档化的行为。
- **`api_version` 目前固定是 `1`**，未来协议升级时会变。
- **`publish`** 段仅用于 [decky-plugin-database](https://github.com/SteamDeckHomebrew/decky-plugin-database) 上架，开发期不写也能跑。

`package.json` 则声明前端依赖。完整版里还会包含仓库元数据、`test` 占位脚本等——下面列出与构建/运行直接相关的字段：

```json
{
  "type": "module",
  "scripts": {
    "build": "rollup -c",
    "watch": "rollup -c -w"
  },
  "devDependencies": {
    "@decky/rollup": "^1.0.2",
    "@decky/ui": "^4.11.0",
    "@rollup/rollup-linux-x64-musl": "^4.53.3",
    "@types/react": "19.1.1",
    "@types/react-dom": "19.1.1",
    "@types/webpack": "^5.28.5",
    "rollup": "^4.53.3",
    "typescript": "^5.6.2"
  },
  "dependencies": {
    "@decky/api": "^1.1.3",
    "react-icons": "^5.3.0",
    "tslib": "^2.7.0"
  },
  "pnpm": {
    "peerDependencyRules": {
      "ignoreMissing": ["react", "react-dom"]
    }
  }
}
```

`@rollup/rollup-linux-x64-musl` 是模板显式声明的依赖，用来兜底 Rollup 在某些构建环境里加载不到对应 native binding 的情况——少了它 Rollup 可能直接报 "Cannot find module" 而终止。注意：SteamOS 3 / Holo 本身是 **Arch 系 glibc** 发行版，并不是 musl 发行版，这里加这个依赖是为了让 Rollup 的原生 binding 解析更稳，不要把它理解成"holo 镜像基于 musl"。

这里有两条"反直觉"的点一定要记住：

- **不要自己安装 `react` / `react-dom` 作为运行时依赖**：Decky Loader 在 Steam CEF 里已经提供了一份共享的 React 实例，你再打进一份，hook 很容易因为运行时实例不一致而报错。`@decky/ui` 声明了 `react` / `react-dom` 作为 peerDependency，模板里的 `pnpm.peerDependencyRules.ignoreMissing` 就是在告诉 pnpm："别警告，这俩由宿主环境在运行时提供"。顺带两条补充：
  - **`@types/react` 的大版本要跟 Steam 客户端 CEF 里的 React 对齐**（当前是 19.x），否则 hook 签名 / JSX 类型会在编译期就报错；
  - **包管理器建议锁定 pnpm**：`@decky/rollup` 与 `ignoreMissing` 规则都默认按 pnpm 的 hoist 行为设计，`npm i` / `yarn` 可能会把 `react` 拉成直接依赖一起打进 bundle，绕过 external。
- **`@decky/ui` 必须跟 Decky Loader 的版本同步**：官方在 tasks 里专门准备了 `updatefrontendlib` 任务（即 `pnpm update @decky/ui --latest`），构建前一刻强制升级一次，避免把过期的类型定义带进商店审核。

## 前端运行时：`src/`、Rollup 与 `definePlugin`

### 构建：为什么是 Rollup 而不是 Vite

`rollup.config.js` 只有三行：

```js
import deckyPlugin from "@decky/rollup";

export default deckyPlugin({
  // Add your extra Rollup options here
});
```

`@decky/rollup` 预置了插件需要的一切 —— TypeScript、JSX、资源处理（由 preset 内部的资源插件把 `import` 重写成 Decky 提供的本地资源 URL）、external React、以 `format: "esm"` 输出到 `dist/index.js`。Decky Loader 加载插件时，会把这个单文件读成字符串注入到 Steam CEF，所以：

- **不要分包、不要动态 `import()`**：最终必须是一个文件；
- **不要引入 Tailwind / CSS-in-JS 运行时**：包体积会快速膨胀，而且可能和 Steam 原生样式冲突，更推荐直接在组件里内嵌 `<style>{...}</style>`；
- **资源由 preset 内置的资源处理插件接管**：模板里给了一份 `src/types.d.ts`，声明 `*.png`、`*.svg`、`*.jpg` 为 string 模块。`import logo from "../assets/logo.png"` 拿到的不是 base64 data URL，而是由 preset 注入、指向 Decky 本地资源服务的相对 URL——运行时由 Loader 从插件目录里真实读取文件。这样既不会把图片塞进 bundle 撑大体积，也保留了缓存能力（具体插件名在 `@decky/rollup` 各版本间有变动，以实际 `pnpm list` 为准）。

`tsconfig.json` 开了 `strict`、`noUnusedLocals`、`noUnusedParameters` 等一揽子严格选项，`jsx: "react-jsx"` 保证 JSX 编译到共享 React 运行时。新建插件时建议原样保留 —— Decky Loader 本身不强制，但严格模式能帮你避开大量运行时惊喜。

### 入口：`definePlugin` 的返回值就是插件

下面是基于模板 `src/index.tsx` 的**精简改写版**——删掉了原文件里注释掉的 router / logo 示例，把随机数范围从 `Math.random()` 换成 `Math.floor(Math.random() * 100)` 便于演示，骨架和 API 用法与模板一致：

```tsx
// src/index.tsx
import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
} from "@decky/ui";
import {
  addEventListener,
  removeEventListener,
  callable,
  definePlugin,
  toaster,
} from "@decky/api";
import { useState } from "react";
import { FaShip } from "react-icons/fa";

// 前端 RPC 代理：对应 Python 端的 Plugin.add(left, right) -> int
const add = callable<[first: number, second: number], number>("add");
// 触发一个耗时 15s 的后端任务，完成后通过事件回传
const startTimer = callable<[], void>("start_timer");

/** 侧边栏面板的主体内容 */
function Content() {
  const [result, setResult] = useState<number | undefined>();

  /** 点击按钮时调用后端 add 并展示结果 */
  const onClick = async () => {
    const sum = await add(
      Math.floor(Math.random() * 100),
      Math.floor(Math.random() * 100),
    );
    setResult(sum);
  };

  return (
    <PanelSection title="Panel Section">
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={onClick}>
          {result ?? "Add two numbers via Python"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => startTimer()}>
          Start Python timer
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

export default definePlugin(() => {
  // 订阅后端通过 decky.emit 发出的事件
  const listener = addEventListener<[string, boolean, number]>(
    "timer_event",
    (a, b, c) => {
      toaster.toast({ title: "timer_event", body: `${a}, ${b}, ${c}` });
    },
  );

  return {
    name: "Test Plugin",
    titleView: <div className={staticClasses.Title}>Decky Example Plugin</div>,
    content: <Content />,
    icon: <FaShip />,
    onDismount() {
      // 插件可以热重载，必须在卸载时注销监听/路由/补丁
      removeEventListener("timer_event", listener);
    },
  };
});
```

关键心智模型：

1. **`definePlugin(factory)` 返回的对象就是插件的形状**。最常用的四个字段：`titleView`、`content`、`icon`、`onDismount`。如果你还要注册自定义路由，就在 factory 里调 `routerHook.addRoute(...)`，并在 `onDismount` 里对应地 `removeRoute`。
2. **交互控件优先来自 `@decky/ui`**：`PanelSection`、`PanelSectionRow`、`ButtonItem`、`ToggleField`、`Focusable`、`SidebarNavigation` 等等。这些组件已经处理好了手柄聚焦、主题色跟随、与 Steam CSS 的兼容性。展示型 `<div>` 可以用，但可点击、可选择、可滚动的自定义元素要包进 `Focusable`，否则手柄模式下很容易失焦。
3. **通信只有两种形态**：
   - **前端 → 后端**：`callable<[Args], Ret>(name)` 生成一个强类型 RPC 代理；
   - **后端 → 前端**：Python 里 `await decky.emit("event_name", ...)`，前端用 `addEventListener` 订阅。
4. **`onDismount` 是热重载的保命符**。Decky Loader 允许在设置里单独重载某个插件，不清理监听会残留"幽灵事件"，页面一刷新就会看到重复 toast。要意识到 Decky 的"热重载"只重启 Python 后端进程并重新注入前端 bundle，**CEF 全局状态（`window.*`、定时器、React Portal）不会被清理**——所以不光要 `removeEventListener`，凡是你挂到全局对象上的字段、注册的 `setInterval`、`routerHook.addRoute` 的路由，全都要在 `onDismount` 里显式回收。

> 💡 语法细节：`callable<[first: number, second: number], number>(...)` 里的 `[first: number, second: number]` 是 TypeScript 4.0+ 引入的**带标签元组**类型，只影响 IDE 提示（参数名悬浮），不是 Decky 特殊 DSL，也不参与运行时。如果你觉得啰嗦，写成 `callable<[number, number], number>(...)` 完全等价。

## 后端运行时：`main.py`、`decky.pyi` 与目录约定

### Python 入口

模板的 `main.py` 展示了后端的所有骨架：

```python
# main.py
import os
import asyncio
import decky


class Plugin:
    """Decky Loader 通过反射加载这个固定名字的类。"""

    async def add(self, left: int, right: int) -> int:
        """简单的同步风格 RPC：返回两数之和。"""
        return left + right

    async def long_running(self):
        """演示：异步任务 + 通过事件向前端回传结果。"""
        await asyncio.sleep(15)
        await decky.emit("timer_event", "Hello from the backend!", True, 2)

    async def start_timer(self):
        """被前端通过 callable('start_timer') 触发。"""
        self.loop.create_task(self.long_running())

    async def _main(self):
        """插件进入时调用一次，适合做初始化/读配置。"""
        self.loop = asyncio.get_event_loop()
        decky.logger.info("Hello World!")

    async def _unload(self):
        """被停用/热重载时调用，清理资源但保留设置。"""
        decky.logger.info("Goodnight World!")

    async def _uninstall(self):
        """彻底卸载时调用，做最终清理。"""
        decky.logger.info("Goodbye World!")

    async def _migration(self):
        """迁移历史目录/配置；由 Loader 在 `_main` 之前自动调用一次。"""
        decky.migrate_logs(os.path.join(
            decky.DECKY_USER_HOME, ".config", "decky-template", "template.log"))
        decky.migrate_settings(
            os.path.join(decky.DECKY_HOME, "settings", "template.json"),
            os.path.join(decky.DECKY_USER_HOME, ".config", "decky-template"))
        decky.migrate_runtime(
            os.path.join(decky.DECKY_HOME, "template"),
            os.path.join(decky.DECKY_USER_HOME, ".local", "share", "decky-template"))
```

提炼几条容易踩的坑：

- **类名必须叫 `Plugin`**，Decky Loader 通过字符串反射拿它，改了就起不来。
- **所有对外方法都必须是 `async`**，哪怕是同步操作。Decky Loader 会 `await` 每一次 RPC。
- **方法参数和返回值必须是 JSON-safe**（基本类型、`dict`、`list`）。想要类型提示就用 `TypedDict`。
- **生命周期钩子**有 `_main`、`_unload`、`_uninstall`、`_migration` 四个，命名固定、全部可选。其中 `_migration` 由 Decky Loader 在 `_main` 之前自动调用一次，不需要（也不应该）在 `_main` 里再手动调用。模板里把这些都写全了，可以作为"要不要支持这个行为"的 checklist。
- **`_migration` 的幂等原则**：不要靠版本号，而是**看目标字段/目录是否已经存在**，用户可能跨多个版本升级。

### `decky` 模块：一个"受约束的标准库"

模板里附带一份 `decky.pyi` —— 它是 Decky Loader 注入到 Python 进程里的 `decky` 模块的类型存根。读它等于读了一份后端能用的 API 清单。

> 📌 **常量 vs 环境变量**：下表中以 `DECKY_` 开头的项同时以 `decky.XXX` 常量和 `os.environ["XXX"]` 环境变量两种形式存在。二者内容一致，但在你自己 `subprocess.Popen` 启动的子进程（例如 C/Rust 编出来的后端）里 **只能** 通过环境变量拿到——`decky` 模块不会被自动继承下去。

| 常量 / 函数 | 含义 |
| --- | --- |
| `decky.HOME` / `decky.USER` | 当前进程的 HOME 与用户名（受 `_root` 影响） |
| `decky.DECKY_USER_HOME` | 真正的 deck 用户家目录，`/home/deck` |
| `decky.DECKY_HOME` | `~/homebrew`，Decky 自己的根目录 |
| `decky.DECKY_PLUGIN_DIR` | 当前插件解压后的根目录 |
| `decky.DECKY_PLUGIN_NAME` | 当前插件名，来自 `plugin.json` |
| `decky.DECKY_PLUGIN_VERSION` / `DECKY_PLUGIN_AUTHOR` | 版本号、作者；上报遥测或日志时比硬编码好 |
| `decky.DECKY_VERSION` | Decky Loader 自身版本，做兼容性判断用 |
| `decky.DECKY_PLUGIN_SETTINGS_DIR` | **推荐写配置的位置**，已由 loader 自动创建 |
| `decky.DECKY_PLUGIN_RUNTIME_DIR` | **推荐写运行时数据**（缓存、临时文件） |
| `decky.DECKY_PLUGIN_LOG_DIR` | **推荐写持久日志** |
| `decky.DECKY_PLUGIN_LOG` | 主日志文件路径 |
| `decky.logger` | 已绑定到上面日志文件的 `logging.Logger` |
| `decky.emit(event, *args)` | 向前端推事件 |
| `decky.migrate_settings / _runtime / _logs` | 分别迁移配置/运行时/日志到约定目录 |
| `decky.migrate_any(target_dir, *sources)` | 上面三者的通用版：把任意旧路径搬到指定目标目录，用于不属于三类标准目录的数据 |

一条很关键的规则：**不要往 `DECKY_HOME` 之外写任何东西**。写 `/etc`、`/usr/local` 这类路径即使拿到了 `_root` 也会被商店审核打回来，而且 SteamOS 下次更新会把只读分区整个覆盖掉。

### 带原生后端：`backend/` 目录

如果你需要 C/C++/Rust/Go 编出的二进制（例如调用底层驱动），就把源码放进 `backend/src/`，再写一个 `Makefile` 把产物丢进 `backend/out/`。模板里的 `backend/Makefile` 简化到极致：

```make
all: hello

hello:
	mkdir -p ./out
	gcc -o ./out/hello ./src/main.c

.PHONY: clean
clean:
	rm -f hello
```

> ⚠️ **模板 `backend/Makefile` 的 `clean` 规则与实际产物路径不一致**：`rm -f hello` 想删的是 `backend/hello`，但产物实际在 `backend/out/hello`——这条规则在模板里是个 no-op。套到实际项目时，改成 `rm -rf ./out` 或精确删除 `./out/<binary>`。

`Dockerfile` 使用官方提供的 holo 基础镜像（还有 `holo-toolchain-rust` / `holo-toolchain-go` 变体），`entrypoint.sh` 里只做一件事：`cd /backend && make`。Decky CLI 在构建插件时会 `docker run` 这个镜像，得到的 `backend/out/*` 会被拷贝到最终 zip 的 `bin/` 下，插件运行时通过 `os.path.join(decky.DECKY_PLUGIN_DIR, "bin", "hello")` 调用。

这么做的好处是**构建环境和 Steam Deck 完全一致**，避免了"在 Ubuntu 编出来扔到 Deck 上找不到 glibc"的经典问题。

### 第三方依赖：`py_modules/`

SteamOS 的 `/usr` 是只读的，你没法 `pip install` 到系统 Python。社区约定的做法是：**把第三方 Python 包 vendored 进 `py_modules/`**，Decky Loader 会自动把这个目录加入 `sys.path`。模板里留了一个 `.keep` 占位，开发时你只需要 `pip install --target=py_modules xxx` 即可。

### 静态文件：`defaults/`

`defaults/defaults.txt` 的注释里说得很清楚：**这个目录里的内容会被原样打进插件根目录**。常见用途：默认 CSS 主题、种子配置、离线资源。注意它**不能把文件铺到任意路径**，只能放在插件目录内部。

## 开发工作流：`.vscode/` 的一套"远程开发套件"

这是很多教程一笔带过、但对日常体验最友好的部分。模板的 `.vscode/` 目录里是一套把"本地改代码"连接到"Steam Deck 上重载运行"的脚本。核心文件：

| 文件 | 作用 |
| --- | --- |
| `tasks.json` | 声明 VS Code 任务：setup / build / deploy / builddeploy / restartdecky |
| `setup.sh` | 首次初始化：检测 pnpm、Docker，下载 [Decky CLI](https://github.com/SteamDeckHomebrew/cli) |
| `config.sh` | 校验是否已有 `.vscode/settings.json`，没有就复制 `defsettings.json` |
| `build.sh` | 调用 Decky CLI 把当前目录打成符合商店规范的 zip |
| `defsettings.json` | Deck 的 IP / 用户名 / 密码 / 插件名等默认值 |

### 首次设置

打开 VS Code 后运行 `setup` 任务，它会按顺序：

1. 执行 `setup.sh`，检查 pnpm 与 Docker——Docker 只会检测是否存在并给出安装提示（不会替你装），pnpm / Decky CLI 则是辅助安装或下载缺失文件；
2. 执行 `pnpm i`；
3. 执行 `updatefrontendlib`，把 `@decky/ui` 升到最新。

然后 `config.sh` 会拷贝 `defsettings.json` 生成 `.vscode/settings.json`。

> ⚠️ **先看这里再复制**：模板里的 `deckpass: "ssap"` 只是占位值，**不要**把真实密码写进生成的 `.vscode/settings.json` 再提交到仓库。推荐的做法是生成一对 SSH key（`ssh-keygen` 然后 `ssh-copy-id deck@steamdeck.local`），把 `deckpass` 留空，靠 `deckkey` 指定的私钥免密登录；部署脚本里的 `sudo -S` 几处确实还需要密码，但至少 ssh 本身不再依赖明文。模板 `.gitignore` 默认忽略了 `.vscode/settings.json`，但很多人会"一不小心" `git add -f` 上去——养成 `git diff --cached` 再提交的习惯。

```json
{
    "deckip":     "steamdeck.local",
    "deckport":   "22",
    "deckuser":   "deck",
    "deckpass":   "",
    "deckkey":    "-i ${env:HOME}/.ssh/id_rsa",
    "deckdir":    "/home/deck",
    "pluginname": "Example Plugin",
    "python.analysis.extraPaths": ["./py_modules"]
}
```

把前几项改成你自己的 Deck 配置。首次连接前需要在桌面模式用 `passwd` 给 deck 用户设个密码（SteamOS 默认无密码），然后 `ssh-copy-id` 推公钥上去，之后就可以把 `deckpass` 清空了。

### 一条命令从代码到 Deck

`build` 任务会：

1. 跑完上面的 `setup` + `settingscheck`；
2. 执行 `build.sh`，里头只有一行核心：

   ```bash
   sudo -E $CLI_LOCATION/decky plugin build $(pwd)
   ```

   Decky CLI 会读 `plugin.json`，跑 `backend/Dockerfile` 编原生后端，再把 `dist/`、`main.py`、`plugin.json` 等打成 zip 塞进 `out/`。

`deploy` 任务负责把 zip 传到 Deck：

1. `chmodplugins`：在 Deck 上 `chown` 插件目录，避免 rsync 时因为只读报错；
2. `copyzip`：`rsync` 把 `out/*.zip` 上传；
3. `extractzip`：在 Deck 上 `bsdtar -xzpf` 解压到 `~/homebrew/plugins/<pluginname>/`。

组合任务 `builddeploy` 一键完成编译 + 上传 + 解压，再配上 `restartdecky`（`sudo systemctl restart plugin_loader`）就完成了"改代码 → 一个快捷键 → Deck 上看效果"的闭环。

> 如果你不用 VS Code，其实只要直接调用 `pnpm run build` + Decky CLI + rsync 就能复刻同样的流程。整套脚本真正的价值在于**把开发者常用的远程操作做成了自包含、幂等的 shell 脚本**，可读性很高，推荐逐字读一遍。

## 打包与分发：插件 zip 的目录结构

上面 `.vscode/` 那套脚本本质上就是 CI 流水线的"本地版"——跑的都是同一条 `decky plugin build`。搞懂本地产物长什么样，再把同一段 shell 搬到 GitHub Actions 里就是 CI。当你准备把插件交给用户或提交到 [decky-plugin-database](https://github.com/SteamDeckHomebrew/decky-plugin-database) 时，zip 的结构是有严格约束的：

```
pluginname-v1.0.0.zip
└── pluginname/
    ├── bin/              (可选，原生后端的产物)
    │   └── <binary>
    ├── dist/
    │   └── index.js      (必需)
    ├── package.json      (必需)
    ├── plugin.json       (必需)
    ├── main.py           (必需，如果用了 Python 后端)
    ├── README.md         (建议)
    └── LICENSE(.md)      (提交商店时必需)
```

几条硬性规则：

- **LICENSE 随包分发**：插件商店（decky-plugin-database）的 README 重点在于"如果许可证要求随源码/二进制一起分发，商店不会接受缺少许可证的提交"——换言之，是否必需取决于你选的许可证本身。官方 zip 目录结构列表把它标为 required，最保险的做法仍是把 LICENSE 放仓库根目录，由打包流程自动复制进 zip；
- **zip 内有且仅有一个同名顶层目录**，Decky Loader 就是靠这个目录名识别插件；
- **`dist/index.js` 是唯一入口**，所有前端代码都必须打进这一个文件；
- **`bin/` 下的二进制要可执行**，打包脚本会自动 `chmod`，但你本地 `rsync` 调试时得注意权限。

用户侧安装需要先在 Decky Loader 的设置里打开 **Developer Mode**，之后会多出两个安装入口：

- **Install Plugin from URL**：粘贴一个指向 zip 的公开直链即可，Loader 会自行下载并解压。CI 产物最常见的做法是配合 [nightly.link](https://nightly.link) 暴露 GitHub Actions artifact，用户一行地址就能装上最新开发版；
- **Install Plugin from ZIP File**：把本地 zip 丢进去，适合离线分发或内部测试。

如果非要手动处理文件，不是把 zip 原样丢进 `~/homebrew/plugins`，而是把它解压成 `~/homebrew/plugins/<plugin-dir>/` 这种目录结构后再重启 loader。

### 提交商店前的最小自检

正式向 decky-plugin-database 提交 PR 前，建议过一遍这份 checklist，能挡住绝大多数一眼驳回：

- [ ] zip 内的顶层目录名未与 `decky-plugin-database` 已收录的插件目录冲突；
- [ ] 未启用 `_root` / `root`，或在 PR 描述里解释必要性；
- [ ] LICENSE 文件随 zip 分发，且与仓库实际许可证一致；
- [ ] CI 产物能通过 [nightly.link](https://nightly.link) 公开直链下载（方便审核者复现）；
- [ ] README 标明了支持的 Decky Loader 版本下限；
- [ ] zip 内**只有一个**与 `pluginname` 一致的顶层目录，没有多余 dotfile（`.DS_Store` / `.git/` / `node_modules/`）。

## 调试与排错

插件一旦跑起来就很容易"卡在某一层"——前端白屏、按钮点了没反应、后端一启动就崩。按照数据流向从上到下排查最省时间。

### 前端：CEF DevTools

Steam Deck 开启开发者模式后，Steam 客户端会把 CEF 的远程调试端口开在 `http://<deck-ip>:8081`（Decky Loader 自带的 `scripts/deckdebug.sh` 就是这么约定的）。用桌面 Chrome 访问这个地址，找到对应的 Steam UI 页面点进去，就是熟悉的 DevTools：断点、Console、Network、React DevTools 都能用。

几个高频场景：

- **`callable(...)` 调用没反应**：在 DevTools 里 `await` 那个代理函数看返回值——后端抛异常时 `callable` 返回的 Promise 会 reject，必须 `try/catch`，否则 UI 只会静默失败；
- **`addEventListener` 收不到事件**：事件名是字符串匹配，前后端拼写必须完全一致；同时确认后端的 `decky.emit` 是在 `_main` 之后被调用的，`_main` 之前 emit 会丢；
- **白屏但没报错**：多半是 `definePlugin` 的 factory 里同步抛了异常，Loader 只会静默跳过。把 factory 内容用 `try/catch` 包一层，错误写进 `console.error`。

### 后端：日志与直接运行

后端的 `print` 会写到 Decky Loader 的主日志，混在所有插件输出里很难找。**用 `decky.logger` 代替 `print`**：它已经绑定到 `DECKY_PLUGIN_LOG` 指向的文件。需要注意的是，Decky Loader 每次启动插件时会按时间戳**新开**一份 `.log` 文件，`DECKY_PLUGIN_LOG` 常量指向的就是"本次启动的那一份"（而不是固定的 `plugin.log`），`decky.logger` 也写入这同一个文件。所以查看时要按修改时间排序拿最新一份。常用方式：

```bash
# 1. SSH 到 Deck 上，按修改时间挑最新一份 tail
ssh deck@steamdeck.local \
  "LOG=\$(ls -t ~/homebrew/logs/<plugin-dir>/*.log | head -n1) && tail -f \"\$LOG\""

# 2. Decky Loader 设置 → Developer → Plugin Logs 里点插件名
```

如果插件根本起不来（UI 侧边栏里看不到图标），走这个顺序：

1. 看 `~/homebrew/services/PluginLoader/PluginLoader.log`，Loader 加载插件失败的 traceback 在这里；
2. 本地先用 `python3 -m py_compile main.py` 做一次语法检查；真正的运行期问题（尤其是 `import decky` 立刻失败）**不能**靠 `ssh` 到 Deck 上直接跑 `python3 main.py` 复现——`decky` 模块是 Loader 在启动插件进程时注入到 `sys.modules` 的，裸跑会立刻在 import 阶段就失败，误导排查。要么看 Loader 自身和插件日志，要么自己写一个 harness 预先把 `decky` 环境伪造进 `sys.modules` 再跑；
3. `sudo systemctl status plugin_loader` 看 Loader 自身是否健康，偶尔 SteamOS 更新会把 service 搞挂。

### 常见"看起来很诡异"的故障

- **Steam 客户端更新后插件白屏**：大概率是你劫持的内部 React 组件换了结构或 CSS 类名变了。先看 `console.error`，再用 React DevTools 对比 DOM 结构；长期方案是避开 `afterPatch` 深层注入，改用 `@decky/ui` 官方组件；
- **改代码后 Deck 上没变化**：检查 `builddeploy` 是否真的跑完、`restartdecky` 是否执行；有时候 `rsync` 被 Deck 上只读文件系统拦下来，表现为静默失败；
- **原生后端 exec 报 `Permission denied`**：`bin/` 里的二进制丢了可执行位，`chmod +x` 或重新 `builddeploy` 一次。

## 模板没覆盖、但很快会遇到的事

读完这套模板，你已经具备一个可运行的"Hello World"。真正做产品化还有几个常见话题：

1. **国际化**：Decky 并没有官方 i18n 方案，社区做法是在 `src/data/i18n/*.json` 下放翻译，封装一个 `t(key, fallback)`，第一次使用时读 `window.LocalizationManager` 拿当前 UI 语言。
2. **持久化配置**：官方早期插件普遍依赖一个叫 `settings.py` 的小库（可以从其它插件仓库里复制一份到 `py_modules/settings.py`），它把 JSON 配置落到 `DECKY_PLUGIN_SETTINGS_DIR`，两行代码搞定读写。
3. **调用 Steam 内部 API**：`SteamClient.*` 是 Steam 客户端在 CEF 里挂的全局对象，能拿到游戏列表、启动参数、好友状态等。没有官方文档，类型定义主要散落在 `@decky/ui` 以及社区反向工程的仓库里，写的时候务必做 `undefined` 判断。
4. **打补丁 / 注入 UI**：`@decky/ui` 导出了 `afterPatch`、`findInReactTree`、`findModuleByExport` 等工具，用来劫持 Steam 自己的 React 组件（例如在游戏右键菜单加一项）。这类代码对 Steam 客户端版本非常敏感，最好写好 `try/catch` 和 fallback，一次更新就可能失效。
5. **调用原生二进制**：想在 Python 后端里调 `backend/out/` 编出的程序，用 `asyncio.create_subprocess_exec` 比 `subprocess.run` 更合适——不阻塞事件循环，能 `await proc.communicate()` 拿 stdout/stderr；路径用 `os.path.join(decky.DECKY_PLUGIN_DIR, "bin", "<name>")` 拼，别写死。
6. **长任务取消**：`asyncio.create_task` 返回的 Task 存起来，前端要中止时通过一个 `cancel_*` RPC 调 `task.cancel()`；任务里用 `try/except asyncio.CancelledError` 做清理。
7. **并发共享状态**：多个前端 RPC 可能并发进来（手柄连点、多个面板同时打开）。改共享状态前套 `asyncio.Lock`，比事后 debug 竞态快得多。配置落盘同理，建议用 `tempfile.NamedTemporaryFile` 写完后 `os.replace` 原子替换，而不是直接 `open(path, 'w')`——Steam Deck 电量耗尽的一瞬间，`json.dump` 写了一半会留下一个损坏的配置文件，下次启动插件就直接炸了。
8. **CI 发布**：`GitHub Actions` + `softprops/action-gh-release` 是社区常用方案：push 到 `main` 打一个 artifact（可以用 [nightly.link](https://nightly.link) 给用户分发开发版），打 tag 时自动生成 Release 和 zip。

## 写在最后

从一个模板出发理解 Decky，其实就是记住这四层：

1. **`plugin.json` 与 `package.json`** 声明"我是谁"；
2. **`src/index.tsx` + `definePlugin`** 提供嵌入 Steam 的 UI；
3. **`main.py` + `decky` 模块**提供受约束的后端能力；
4. **`.vscode/`、`backend/`、Decky CLI** 把开发到发布的流程串起来。

等这四层在你脑子里跑通了，就可以大胆扔掉模板、按自己的审美重组代码 —— 你做的事情本质上只是在 Steam 客户端里塞一个 React 组件，以及在 Deck 上跑一个 Python 小服务。

> 参考资源：
> - 官方模板：<https://github.com/SteamDeckHomebrew/decky-plugin-template>
> - Decky Loader：<https://github.com/SteamDeckHomebrew/decky-loader>
> - Decky CLI：<https://github.com/SteamDeckHomebrew/cli>
> - 插件商店与审核流程：<https://github.com/SteamDeckHomebrew/decky-plugin-database>
> - 社区 Wiki：<https://wiki.deckbrew.xyz/en/user-guide/home#plugin-development>
