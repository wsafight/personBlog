# 页面进入动画问题分析

## 背景

当前项目是 Astro + Svelte，页面通过 `@swup/astro` 做站内无刷新切换，同时组件上大量使用 `onload-animation` 做首屏入场动画。

观察到的问题是：刷新页面或进入页面时，正文区域会出现两次“往上”的动画效果。这个现象不是组件被挂载两次导致的，更像是动画职责没有分层，多个层级同时对同一块视觉区域做位移动画。

## 快速结论

推荐把动画分成两类，并且不要混用：

1. 页面切换动画：只交给 Swup 容器，例如 `main#swup-container.transition-swup-fade`。
2. 首屏入场动画：只放在真正的内容子项上，例如文章卡片、文章标题、封面、正文区块、侧栏卡片。

不要再给正文总外壳 `#content-wrapper` 加 `onload-animation`。它是正文区域的布局容器，不应该和内部卡片/文章内容一起做 `translateY`。

## 当前相关文件

- `astro.config.mjs`
  - 配置了 `@swup/astro`。
  - `containers: ["main", "#toc"]` 表示站内跳转时会替换 `main` 和 `#toc`。
  - `animationClass: "transition-swup-"` 表示 Swup 相关动画类前缀是 `transition-swup-`。

- `src/layouts/MainGridLayout.astro`
  - 页面主体布局。
  - `main#swup-container` 使用 `transition-swup-fade`。
  - `#content-wrapper` 又使用了 `onload-animation`。
  - `SideBar` 外层也使用了 `onload-animation`。

- `src/styles/transition.css`
  - 定义了 Swup 页面切换动画。
  - 定义了 `.onload-animation` 的首屏入场动画。
  - `.onload-animation` 默认执行 `fade-in-up`，也就是从 `translateY(2rem)` 到 `translateY(0)`。

- `src/components/PostPage.astro`
  - 列表页每个 `PostCard` 都有 `onload-animation`。

- `src/pages/posts/[...slug].astro`
  - 文章页里阅读时间、标题、元信息、封面、正文、License 都有 `onload-animation`。

- `src/components/widget/SideBar.astro`
  - `Categories` 和 `Tags` 子组件有 `onload-animation`。

## 具体问题

### 1. 正文外壳和正文子项都在做入场动画

当前结构可以简化为：

```astro
<main id="swup-container" class="transition-swup-fade">
  <div id="content-wrapper" class="onload-animation">
    <slot />
  </div>
</main>
```

列表页内容又类似：

```astro
<PostCard class:list="onload-animation" />
<PostCard class:list="onload-animation" />
<PostCard class:list="onload-animation" />
```

这会导致：

1. `#content-wrapper` 整体从下往上移动一次。
2. 每个 `PostCard` 自己再从下往上移动一次。

视觉上就是“正文往上了两次”。

文章页也有类似问题。当前 `transition.css` 中并没有针对 `#post-container .onload-animation` 覆盖 `animation-name` 的规则，只有 `#post-container :nth-child(n)` 设置了 `animation-delay`。这意味着文章页内部元素仍然使用 `fade-in-up`（带 `translateY`），与外层 `#content-wrapper` 的 `translateY` 叠加，双重位移问题同样存在。

### 2. Swup 页面切换和首屏入场动画职责重叠

Swup 动画定义：

```css
html.is-changing .transition-swup-fade {
  transition: all 200ms;
}

html.is-animating .transition-swup-fade {
  opacity: 0;
  transform: translateY(1rem);
}
```

首屏入场动画定义：

```css
.onload-animation {
  opacity: 0;
  animation: 300ms fade-in-up;
  animation-fill-mode: forwards;
}
```

站内跳转时，Swup 会让 `main#swup-container` 做切换动画。新内容替换进来后，里面的 `onload-animation` 又会开始执行。于是一次导航里同时存在：

1. 页面容器级 Swup 动画。
2. 新内容子项的首屏入场动画。

如果两者都带 `translateY`，就会出现重复位移。

### 3. 侧栏也存在嵌套入场动画

`MainGridLayout.astro` 里：

```astro
<SideBar class="... onload-animation" />
```

`SideBar.astro` 里：

```astro
<Categories class="onload-animation" />
<Tag class="onload-animation" />
```

这和正文区域的问题一致：外层侧栏整体动一次，里面分类和标签再各自动一次。

### 4. 全局样式入口不完整

当前 `Layout.astro` 只导入了：

```ts
import '../styles/main.css'
```

但项目中这些样式文件没有被任何地方显式导入：

- `src/styles/transition.css`
- `src/styles/markdown.css`
- `src/styles/scrollbar.css`
- `src/styles/photoswipe.css`

这些文件内部使用了 `@reference "tailwindcss"` 来获取 Tailwind 的 `@apply` 能力，但 `@reference` 只是类型引用，不会让文件被包含到构建产物中。`main.css` 中的 `@source` 指令也只扫描模板文件提取类名，不会自动导入独立 CSS 文件。

如果当前环境中动画确实生效，说明存在某种隐式加载路径（可能是 Vite/Astro 的 CSS 自动发现机制），但从源码层面看没有显式的导入链。后续修动画时应该一并整理全局样式入口，将这些文件显式导入到 `Layout.astro` 或 `main.css` 中，否则不同构建环境可能表现不一致。

## 推荐改法

### 方案 A：推荐，容器不做首屏入场，子项负责入场

核心规则：

1. `main#swup-container` 保留 `transition-swup-fade`，专门负责 Swup 页面切换。
2. 移除 `#content-wrapper` 上的 `onload-animation`。
3. 移除 `SideBar` 外层的 `onload-animation`。
4. 保留列表页 `PostCard` 的 `onload-animation`，继续做卡片 stagger 动画。
5. 保留文章页内部区块的 `onload-animation`，但文章正文内部只淡入，不做上移。
6. Swup 导航后的新内容可以只做 Swup 动画，不再重复跑首屏入场动画。

优点：

- 保留现有列表卡片逐个出现的效果。
- 彻底消除外层和内层同时 `translateY` 的问题。
- 改动集中，认知成本低。

建议调整点：

```astro
<!-- src/layouts/MainGridLayout.astro -->
<SideBar class="..." />

<main id="swup-container" class="transition-swup-fade ...">
  <div id="content-wrapper">
    <slot />
  </div>
</main>
```

然后在 CSS 层补一个 Swup 后禁用首屏动画的状态，例如：

```css
html.has-swup-visit .onload-animation {
  opacity: 1;
  animation: none;
}
```

并在 Swup 第一次 `visit:start` 时给 `html` 加上 `has-swup-visit`。这样刷新页面仍然有首屏动画，站内跳转只用 Swup 动画。

### 方案 B：保留外层动画，去掉内部动画

核心规则：

1. `#content-wrapper` 保留 `onload-animation`。
2. 去掉列表页 `PostCard`、文章页标题/正文/封面等内部 `onload-animation`。

优点是改法直观，所有页面统一整体淡入上移。缺点是列表页会失去卡片 stagger 效果，文章页层次也更平。

不太推荐这个方案，因为当前项目已经在很多子项上设计了延迟动画，说明更接近“子项入场”的视觉方向。

### 方案 C：全部只淡入，不再上移

把 `.onload-animation` 改成只使用 `fade-in`：

```css
.onload-animation {
  opacity: 0;
  animation: 300ms fade-in;
  animation-fill-mode: forwards;
}
```

优点是最稳，不会再有位移叠加。缺点是动效会变弱，首页列表的进入感会少一些。

这个方案适合希望博客整体更安静、更少动效时采用。

## 建议实施顺序

1. 先整理全局样式入口。
   - 在 `Layout.astro` 或 `main.css` 中统一导入全局样式。
   - 推荐入口只保留一个，避免后续不知道样式从哪里进来。

2. 去掉布局外壳上的首屏入场动画。
   - 移除 `#content-wrapper` 的 `onload-animation`。
   - 移除 `SideBar` 外层的 `onload-animation`。

3. 明确 Swup 后的动画策略。
   - 首屏刷新：允许 `.onload-animation`。
   - 站内跳转：只使用 Swup 容器动画，禁用新内容里的 `.onload-animation`。

4. 检查文章页内部动画。
   - 保持文章内部只淡入是合理的。
   - 如果要更安静，可以让文章页标题、meta、封面、正文统一只淡入。

5. 再看侧栏动画。
   - `Profile`、`Categories`、`Tags` 可以作为三个叶子卡片 stagger。
   - 不要让整个 `SideBar` 外层和内部卡片同时动。

## 验证方式

建议验证以下场景：

1. 直接刷新首页。
   - 期望：Navbar、侧栏卡片、文章卡片按延迟出现。
   - 不应出现正文整体先上移、卡片再上移的双重位移。

2. 直接刷新文章页。
   - 期望：文章卡片区域稳定，标题/正文可以淡入。
   - 不应出现正文整体从下往上推一遍。

3. 从首页点击文章进入详情。
   - 期望：只看到 Swup 页面切换动画。
   - 不应看到新文章内容再次执行一轮首屏 stagger。

4. 从文章详情返回首页。
   - 期望：页面切换流畅，列表不重复上移。

5. 开启系统 `prefers-reduced-motion: reduce`。
   - 期望：所有首屏动画关闭，内容直接可见。

## 额外发现

当前本地验证存在两个阻塞点：

1. `bun run build` 失败，原因是当时 `node_modules` 中缺少 `@astrojs/rss`（`package.json` 中已声明该依赖，重新安装即可解决）。
2. `bun run dev -- --host 127.0.0.1` 监听 `127.0.0.1:4321` 时返回 `EPERM`。

这两个问题和动画根因无关，但会影响后续运行时验证。正式改代码前建议先恢复依赖和本地 dev server。

## 最终建议

采用方案 A。

也就是：Swup 管页面切换，内容子项管首屏入场，布局容器不参与首屏位移动画。这样既保留当前博客的视觉层次，也能消除“两次正文往上”的根因。
