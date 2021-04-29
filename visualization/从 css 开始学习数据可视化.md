# 从 css 开始学习数据可视化

> 一图胜千言

可视化领域是目前（泛）前端中最火热的分支之一。无论是面向普通用户的可视化大屏展示数据信息，还是企业服务中数据统计概览或者调度服务，乃至于国家大力推动的智慧建设（智慧大脑，智慧城市）等项目，都重度使用了数据可视化。

以下图片来自于 [**前端搞可视化**](https://www.yuque.com/zaotalk/conf/ot7ia8) 菜鸟体验体验技术 其歌 的分享 《如何融合数据可视化与物理世界》。可视化结合硬件也有很大的用武之地。

![C12-1 其歌-如何融合数据可视化与物理世界.012.jpeg](https://cdn.nlark.com/yuque/0/2020/jpeg/276138/1597038998877-e78452fa-2dda-404f-afea-16b9c2436950.jpeg?x-oss-process=image%2Fresize%2Cw_1300)

## 可视化是什么

当然，我曾经一度认为可视化就是绘制各种图表，学习可视化就是学习 echarts, D3 等库，然后利用这些工具绘制饼图、折线图、柱状图这类图表。然而，大部分情况下，我们可以借助这些库来进行可视化。但这些库是通用的解决方案。特定条件下，如在短时间内同时渲染大量元素，通用的解决方案就无法使用，此时我们就需要选择更加复杂的技术（如利用 WebGL 自行控制 GPU 渲染图像）。

可视化的源头是数据。我们需要拿到有用的数据，然后通过转化以及整合数据生成用户所需要的结构，最终以图形的方式展现出来。可视化一定是与当前业务高度结合的。可视化工程师需要根据当前的业务以及产品需求，选择合适的技术栈并生成对用户有用的图像。

数据可视化也有三个分支：科学可视化、信息可视化、可视分析。

- 科学可视化主要关注是三维现象的可视化，如建筑学、气象学、医学或生物学方面的各种系统。重点在于体、面以及光源等等的逼真渲染，甚至包括动态成分。
- 信息可视化是一种将数据与设计结合起来的图片，有利于个人或者组织简短有效的向受众传播信息的数据表现形式。
- 可视化分析学被定义为由可视交互界面为基础的分析推理科学，将图形学、数据挖掘、人机交互等技术融合在一起，形成人脑智能和机器智能优势互补和相互提升。



可视化的目的是提升用户对数据的认知能力，解放用户的大脑，从而让数据更有价值。

## 用 css 做数据可视化

通常来说，我们都会根据当前交互和计算量来确定使用 SVG 或者 Canvas 。如果遇到大量像素计算，甚至还需要深入 GPU 编程 。

但如果我们做官网首页的图表呢？如果当前的图表很简单，不需要变化呢？我们还需要引入 ECharts 这种库？或者说手动写一个简单的图表。

实际上，随着浏览器的发展，CSS 的表现能力愈发强大，完全可以实现常规的图表。如柱状图和饼图等。







在没有遇到 [Charts.css](https://chartscss.org/) 之前，我是如此认为的。但看到该库时候，我也是非常的欣喜。**Charts.css** 是一个 CSS 框架。它使用 CSS3 将 HTML 元素设置为图表样式。

CSS 虽然不像 JavaScript 是通用编程语言，但 CSS 变量是一个桥梁，让其拥有了一定的编程能力。你也可以参考我之前的文章 [玩转 CSS 变量](https://github.com/wsafight/personBlog/issues/25) 和 [CSS 扫雷游戏](https://propjockey.github.io/css-sweeper/) 。

我们拿出最简单的表格：

```html
<table border="1">
    <caption> Front End Developer Salary </caption>
    <tbody>
    <tr>
        <td > $40K </td>
    </tr>
    <tr>
        <td > $60K </td>
    </tr>
    <tr>
        <td > $75K </td>
    </tr>
    <tr>
        <td > $90K </td>
    </tr>
    <tr>
        <td > $100K </td>
    </tr>
    </tbody>
</table>
```



如图所显：

![image-20210428000546653](C:\Users\wsa\AppData\Roaming\Typora\typora-user-images\image-20210428000546653.png) 使用 Chart.css 之后:

```html
<table style="width: 400px;height: 400px" class="charts-css column">
  <caption> Front End Developer Salary </caption>
  <tbody>
    <tr>
      <td style="--size: calc( 40 / 100 )"> $40K </td>
    </tr>
    <tr>
      <td style="--size: calc( 60 / 100 )"> $60K </td>
    </tr>
    <tr>
      <td style="--size: calc( 75 / 100 )"> $75K </td>
    </tr>
    <tr>
      <td style="--size: calc( 90 / 100 )"> $90K </td>
    </tr>
    <tr>
      <td style="--size: calc( 100 / 100 )"> $100K </td>
    </tr>
  </tbody>
</table>   
```

![image-20210428000851714](C:\Users\wsa\AppData\Roaming\Typora\typora-user-images\image-20210428000851714.png)非常棒！



## 玩转 css



视化项目，尤其是 PC 端的可视化大屏展现，不只是使用 HTML 与 CSS 相对较少，而且使用方式也不太一样。于是，有些同学就会认为，可视化只能使用 SVG、Canvas 这些方式，不能使用 HTML 与 CSS。当然了，这个想法是不对。具体的原因是什么呢？我一起来看看。，比如，我们常见的柱状图、饼图和折线图。虽然我们后面的课程会主要使用 Canvas 和 WebGL 绘图，少数会涉及部分 CSS。但是，你可不要觉得它不重要。为啥呢？理由有两个：一些简单的可视化图表，用 CSS 来实现很有好处，既能简化开发，又不需要引入额外的库，可以节省资源，提高网页打开的速度。理解 CSS 的绘图思想对于可视化也是很有帮助的，比如，CSS 的很多理论就和视觉相关，可视化中都可以拿来借鉴。所以呢，这一节里我们多讲一点，你一定要好好听。接下来，我们就来说一说，CSS 是如何实现常规图表的。



**Charts.css**是用于数据可视化的新的开源框架。它用**CSS框架**代替了传统的JS图表库。

数据可视化可以改善用户体验，因为数据的图形表示通常更容易理解。如果可视化帮助最终用户理解数据，则**Charts.css**可以帮助前端开发人员使用简单的**CSS类**将其数据转换为精美的图形。

现代**CSS框架**（如引导程序）使用预定义的CSS实用程序类来样式化HTML元素。这些CSS框架专注于布局，而**Charts.css**仅专注于数据可视化



用 CSS 实现柱状图其实很简单，原理就是使用网格布局（Grid Layout）加上线性渐变（Linear-gradient），我就不多说了，你可以直接看我这里给出的 CSS 代码。

```css
/**
   dataset = {
     current: [15, 11, 17, 25, 37],
     total: [25, 26, 40, 45, 68],
   }
 */
.bargraph {
  display: grid;
  width: 150px;
  height: 100px;
  padding: 10px;
  transform: scaleY(3);
  grid-template-columns: repeat(5, 20%);
}
.bargraph div {
  margin: 0 2px;
}
.bargraph div:nth-child(1) {
 background: linear-gradient(to bottom, transparent 75%, #37c 0, #37c 85%, #3c7 0);
}
.bargraph div:nth-child(2) {
 background: linear-gradient(to bottom, transparent 74%, #37c 0, #37c 89%, #3c7 0);
}
.bargraph div:nth-child(3) {
 background: linear-gradient(to bottom, transparent 60%, #37c 0, #37c 83%, #3c7 0);
}
.bargraph div:nth-child(4) {
 background: linear-gradient(to bottom, transparent 55%, #37c 0, #37c 75%, #3c7 0);
}
.bargraph div:nth-child(5) {
 background: linear-gradient(to bottom, transparent 32%, #37c 0, #37c 63%, #3c7 0);
}
```



而要实现饼图，我们可以使用圆锥渐变，方法也很简单，你直接看代码就可以理解。

```css
.piegraph {
  display: inline-block;
  width: 250px;
  height: 250px;
  border-radius: 50%;
  background-image: conic-gradient(#37c 30deg, #3c7 30deg, #3c7 65deg, orange 65deg, orange 110deg, #f73 110deg, #f73 200deg, #ccc 200deg);
}
```

我们可以用高度很小的 Div 元素来模拟线段，然后用 transform 改变角度和位置，这样就能拼成折线图了。



首先，HTML 和 CSS 主要还是为网页布局而创造的，使用它们虽然能绘制可视化图表，但是绘制的方式并不简洁。这是因为，从 CSS 代码里，我们很难看出数据与图形的对应关系，有很多换算也需要开发人员自己来做。这样一来，一旦图表或数据发生改动，就需要我们重新计算，维护起来会很麻烦。其次，HTML 和 CSS 作为浏览器渲染引擎的一部分，为了完成页面渲染的工作，除了绘制图形外，还要做很多额外的工作。比如说，浏览器的渲染引擎在工作时，要先解析 HTML、SVG、CSS，构建 DOM 树、RenderObject 树和 RenderLayer 树，然后用 HTML（或 SVG）绘图。当图形发生变化时，我们很可能要重新执行全部的工作，这样的性能开销是非常大的。而且传统的 Web 开发，因为涉及 UI 构建和内容组织，所以这些额外的解析和构建工作都是必须做的。而可视化与传统网页不同，它不太需要复杂的布局，更多的工作是在绘图和数据计算。所以，对于可视化来说，这些额外的工作反而相当于白白消耗了性能。因此，相比于 HTML 和 CSS，Canvas2D 和 WebGL 更适合去做可视化这一领域的绘图工作。它们的绘图 API 能够直接操作绘图上下文，一般不涉及引擎的其他部分，在重绘图像时，也不会发生重新解析文档和构建结构的过程，开销要小很多。

 您只需要一个简单的图表即可显示数据。
