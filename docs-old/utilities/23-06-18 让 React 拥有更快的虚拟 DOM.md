# 让 React 拥有更快的虚拟 DOM

[Million.js](https://million.dev/) 是一个非常快速和轻量级的 ( <4kb) 虚拟 DOM。框架可以通过包装 React 组件来提升性能（该框架目前版本只兼容 React 18 及以上版本）。

先说结论：Million.js 适应的场景极其有限，但在特定场景下也大放异彩。

## 如何使用

Million.js 集成 React 中使用非常简单。先进行安装和编译器配置。

### 安装与配置

```bash
npm install million
```

当前是 webpack 的配置文件。如果有使用其他的构建工具，可以自行参考 [安装 Million.js](https://million.dev/docs/install)。

```js
const million = require('million/compiler');

module.exports = {
  plugins: [
    million.webpack(),
  ],
}
```

### 使用 block 和 For 组件

```tsx
import { block as quickBlock } from "million/react";

// million block 是一个 HOC
const LionQuickBlock = quickBlock(function Lion() {
  return <img src="https://million.dev/lion.svg" />;
});

// 直接使用
export default function App() {
  return (
    <div>
      <h1>mil + LION = million</h1>
      <LionQuickBlock />
    </div>
  );
}
```

当前是数组的情况下

```tsx
import { block as quickBlock, For } from "million/react";

const RowBlock = quickBlock(function Row({ name, age, phone }) {
  return (
    <tr>
      <td>{name}</td>
      <td>{age}</td>
      <td>{phone}</td>
    </tr>
  );
});

// 使用 For 组件优化
export default function App() {
  return (
    <div>
      <For each={data}>
        {({ adjective, color, noun }) => (
          <RowBlock 
            adjective={adjective}
            color={color} 
            noun={noun} 
          />
        )}
      </For>
    </div>
  );
}
```

## Block Virtual DOM

Million.js 引入了 Block Virtual DOM 来进行优化。

Block Virtual DOM 采用不同的方法进行比较，可以分为两部分：

- 静态分析（分析虚拟 DOM 以将 DOM 动态部分搜集起来，放入 Edit Map 或者 edits（列表） 中去）
- 脏检查（比较状态（不是虚拟 DOM 树）来确定发生了什么变化。如果状态发生变化，DOM 将直接通过 Edit Map 进行更新）

这种方式大部分情况下要比 React 的虚拟 DOM 要快，因为它比较数据而并非 DOM，将树遍历从 O(tree) 变为 Edit Map O(1)。同时我们也可以看出 Million.js 也会通过编译器对原本的 React 组件进行修改。

## 适用场景

但所有的事情都不是绝对的，Block Virtual DOM 在某些情况下甚至要比虚拟 DOM 要慢。

### 静态内容多，动态内容少

block virtual DOM 会跳过 virtual DOM 的静态部分。

```tsx
// ✅ Good
<div>
  <div>{dynamic}</div>
  Lots and lots of static content...
</div>

// ❌ Bad
<div>
  <div>{dynamic}</div>
  <div>{dynamic}</div>
  <div>{dynamic}</div>
  <div>{dynamic}</div>
  <div>{dynamic}</div>
</div>
```

### 稳定的 UI 树

因为 Edit Map 只创建一次，不需要在每次渲染时都重新创建。所以稳定的 UI 树是很重要的。

```tsx
// ✅ Good
return <div>{dynamic}</div>

// ❌ Bad
return Math.random() > 0.5 ? <div>{dynamic}</div> : <p>sad</p>;
```

### 细粒度使用

初学者犯的最大错误之一是到处使用 Block virtual DOM。这是个坏主意，因为它不是灵丹妙药。开发者应该识别块虚拟 DOM 更快的某些模式，并仅在这些情况下使用它。

## 规则
以下是一些要遵循的一般准则

- 嵌套数据：块非常适合呈现嵌套数据。Million.js 将树遍历从O(tree)变为O(1)，允许快速访问和更改。

- 使用 For 组件而不是 Array.map：For 组件会做针对性优化

- 使用前需要先声明：编译器需要进行分析，没有申明将无法进行分析
    ```tsx
    // ✅ Good
    const Block = block(<div />)

    // ❌ Bad
    console.log(block(<div />))
    export default block(<div />)
    ```

- 传递组件而不是 JSX
    ```tsx
    // ✅ Good
    const GoodBlock = block(App)

    // ❌ Bad
    const BadBlock = block(<Component />)
    ```

- 确定的返回值：返回必须是“确定性的”，这意味着在返回稳定树的块末尾只能有一个返回语句（组件库，Spread attributes 都有可能造成不确定的返回值而导致性能下降）

## 其他

million 源码中有非常多的缓存优化。同时在它最开始就拆分传入的 dom 节点，将其分成多个可变量，放入数组，patch 和 mount 时仅遍历数组数据对比（这也是需要确定的返回值原因），较为新颖。源代码也较为简单明了。大家可以自行阅读源码学习。
- [million react/block.ts](https://github.com/aidenybai/million/blob/main/packages/react/block.ts)
- [million template.ts](https://github.com/aidenybai/million/blob/main/packages/million/template.ts)
- [million block.ts](https://github.com/aidenybai/million/blob/main/packages/million/block.ts) .


million 的 Block Virtual DOM 的思路来源于 [blockdom](https://github.com/ged-odoo/blockdom), blockdom 是一个较低级别的抽象层。这个框架同时提供了制作框架的教程 [制作自己的框架](https://github.com/ged-odoo/blockdom/blob/main/doc/make_your_own_framework/readme.md)。


# 参考资料

[Million.js](https://million.dev/)

[blockdom](https://github.com/ged-odoo/blockdom)
