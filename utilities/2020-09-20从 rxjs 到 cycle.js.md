# 函数响应式框架—从 rx 到 cycle

距离我上一次学习 Rx.js 已经一年之久了，我终于又一次打开了 Rx 的官网。

源于在一场面试中，面试官和我讨论 Promise 中问道: 什么情况下，Promise 没有回调好用？答案是十分开放的，但是在此期间，我们顺势讨论到了 “事件” 这一概念。回到家里复盘的时候我脑海中突然出现了 Rx.js。这时候，我把 Rx 看成了事件流管理而并非高级 Promise。

这是一个非常强大的抽象！我们不必要把时间视为需要管理的东西，事件流将同步和异步处理统一到一个通用的，方便的 api 中去。



```angular2
a := b + c 
```

你可以想象是 Excel，如果一个单元格包含一个公式，该公式引用了第二个单元格，那么当第二个单元格发生变化时，也会导致第一个单元格发生变化，这些值随着他们所使用的值变化而变化。

很明显，事件也可以用来在代码中触发响应，不过我们要引入流的概念。流让我们把事件当作数据集合来对待。这就好像我们有一个事件列表，当新的事件到达时候，列表变长了。他的美妙之处在于，我们可以线对待任何其他集合一样对待流，变化，合并，过滤。我们可以把事件流和常规集合组合在一起。流可以是异步的，这意味着你的代码有机会按照事件到来的方式回应事件。

能用 Rx 解决的

事件无处不在，一次按钮点击，一个计时器到期，但是，无论事件源是什么，围绕事件编写的代码比对应线性代码更容易响应，解耦效果要好得多。

我一直觉得当前的编程方式是非正确，取决于你在编码的过程中是否越来越爽。

## Cycle.js

Cycle 是一个可预测代码的函数式和反应式 JavaScript 框架。

```js
import {run} from '@cycle/run'
import {div, label, input, hr, h1, makeDOMDriver} from '@cycle/dom'

function main(sources) {
  const input$ = sources.DOM.select('.field').events('input')

  const name$ = input$.map(ev => ev.target.value).startWith('')

  const vdom$ = name$.map(name =>
    div([
      label('Name:'),
      input('.field', {attrs: {type: 'text'}}),
      hr(),
      h1('Hello ' + name),
    ])
  )

  return { DOM: vdom$ }
}

run(main, { DOM: makeDOMDriver('#app-container') })
```

### MVI

对于开发模式而言，从 mvc 到安卓的 mvp。后面再有 mvvm，于是谷歌提出 mvw。

```jsx
 const changeWeight$ = sources.DOM.select('.weight')
    .events('input')
    .map(ev => ev.target.value);

  const changeHeight$ = sources.DOM.select('.height')
    .events('input')
    .map(ev => ev.target.value);

  const weight$ = changeWeight$.startWith(70);
  const height$ = changeHeight$.startWith(170);

  const state$ = xs.combine(weight$, height$)
    .map(([weight, height]) => {
      const heightMeters = height * 0.01;
      const bmi = Math.round(weight / (heightMeters * heightMeters));
      return {weight, height, bmi};
    });

```



###  Jsx？ hook?

```jsx
function main(sources) {
  const sinks = {
    DOM: sources.DOM.select('input').events('click')
      .map(ev => ev.target.checked)
      .startWith(false)
      .map(toggled =>
        <div>
          <input type="checkbox" /> Toggle me
          <p>{toggled ? 'ON' : 'off'}</p>
        </div>
      )
  };
  return sinks;
}
```



在看到这种代码，你的脑海里会浮现什么呢？

抽象来看，该代码结构居然与 hook 如此相似。而它的出现要比 hook 早好几年。

反向思考，如果当年我能够结合 rxjs，说不定设计出 hooks 的就是在下了。



## 其他

如果你能看到现在，我非常感谢！！！这里也是一些我最近得出的一些结论。

### vue 和 react 区别

本质上来说，抛开性能和思想， 能否迅速的解决客户的问题。vue Element ？或者来说，他能否迅速解决当前公司的需求。

在知乎上，往往会有人说 Vue 都是，没有，甚至量状态管理都有很多种实现，对比。究竟是。

vue 的重点。再使用 vue 的三年中，我更多的时间也是在思考用户的行为习惯，变量名的构建，有很多人。

在我看来，他们两个与项目构建无关，都可以做出大型项目。而 vue 的维护对团队核心提出更高的要求，同时 vue 可以给予你更快的开发速度？

切到 React 时候，才真正体会到 redux。函数式开发的便利性。

双方的价值体系不同，最终你会得到你想要的。如果我没有重度使用 react ，可能我不会迅速领会到响应式。如果没有重度。

### 自顶向下与自下而上之争



## 参考资料

[rxjs 官网](https://rxjs.dev/)

[cycle 官网](https://cycle.js.org/)