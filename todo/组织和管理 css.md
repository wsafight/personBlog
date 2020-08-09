# 组织和管理 CSS

在项目开发的过程中，基于有限的时间内保质保量的完成开发任务无疑是一场挑战。在这场挑战中我们不但要快速处理自己的问题，还需要与别人协同合作，以避免两者之间的冲突。

针对于大型项目的开发，CSS 如何组织和管理才能让我们用更少的时间。这篇文章来表述一些我对 CSS 组织和管理的理解。当然，对于 TOC 应用，出于细节和动画的把控，有一些 节日页面。同时生命周期较短，往往复用性较差，但是针对于 TOB 应用，统一风格往往会赢得客户的青睐，行列间距，主题样式等都应该结合统一，而不是每个页面不同设计。基于此。

## BEM命名约定

BEM 是一种相当知名的命名约定，BEM 的意思就是块（block）、元素（element）、修饰符（modifier）,是由[Yandex](http://yandex.ru/)团队提出的一种前端命名方法论。这种巧妙的命名方法让你的CSS类对其他开发者来说更加透明而且更有意义。BEM 命名约定更加严格，而且包含更多的信息，它们用于一个团队开发一个耗时的大项目。

如 我们在书写伙伴卡片组件 代码风格如下:

```css
.partner-card {
}
.partner-card__name {
}
.partner-card__content {
}
.partner-card__content {
}
.partner-card__content--md {
}
```

当然，我们可以利用 less, Sass 这些辅助开发，这里不再赘述。

由于 CSS 解析规则是逆向解析，所以基于 HTML 结构的后代选择器都会有一丢丢的性能消耗。在使用BEM 后，大概也只会在掩盖组件样式时候使用后代选择器来进行覆盖。

如：

- 如果规则正向解析，例如「div div p em」，我们首先就要检查当前元素到 html 的整条路径，找到最上层的 div，再往下找，如果遇到不匹配就必须回到最上层那个 div，往下再去匹配选择器中的第一个 div，**回溯**若干次才能确定匹配与否，效率很低。
- 逆向匹配则不同，如果当前的 DOM 元素是 div，而不是 selector 最后的 em，那只要**一步**就能排除。只有在匹配时，才会不断向上找父节点进行验证与过滤。

基于上述，在项目协作中，我们需要一套命名规则来决定我们如何书写 CSS 命名以便于大家可以。

计算科学中最难的两件事之一就是命名，日常开发中我们也遇到自己的样式被其他人覆盖了，大部分原因出在命名冲突，BEM 恰恰解决了这一痛点,我们只需要外层样式名是一个有意义且独立唯一，就无需考虑太多。

与 BEM 相对应的还有 OOCSS SMACSS。而这两种不是直接可见的命名约定，而是提供了一系列的目标规则。这里不再详细阐述，大家如果想要了解，可以去看一看 [值得参考的css理论：OOCSS、SMACSS与BEM](https://blog.csdn.net/hby_00/article/details/42400375)。

当然了，真正的组织与管理必然也离不开这些目标规则。

## Atomic CSS

ACSS 表示的是原子化 CSS（Atomic CSS），是 Yahoo 提出来的一种独特的 CSS 代码组织方式，应用在 Yahoo 首页和其他产品中。ACSS 的独特性在于它的理念与一般开发人员的理解有很大的不同，并挑战了传统意义上编写 CSS 的最佳实践，也就是关注点分离原则。ACSS 认为关注点分离原则会导致冗余、繁琐和难以维护的 CSS 代码。

代码风格如下所示:

```css
<div>
   <div class="Bgc(#0280ae.5) H(90px) IbBox W(50%) foo_W(100%)"></div><!--
--><div class="Bgc(#0280ae) H(90px) IbBox W(50%) foo_W(100%)"></div>
</div>
<hr>
<div class="foo">
   <div class="Bgc(#0280ae.5) H(90px) IbBox W(50%) foo_W(100%)"></div><!--
--><div class="Bgc(#0280ae) H(90px) IbBox W(50%) foo_W(100%)"></div>
</div>
```



计算科学中最难的两件事之一就是命名，而 Atomic CSS 直接舍弃了命名。一个类只做一件事。yahoo 利用这种方案减轻了很多代码。

有很多人抗拒在于一堆的类名的话，感觉会看起来比较乱。但是事实上，你不需要考虑它的结构等因素，而是它需要什么样式就直接提供好了。把脑力运动变成机械的体力运动。

原子 CSS 的优势的确有很多：

- 变化是可以预见的由于单一职责原则（一个类==一种样式），很容易预测删除或添加一个类会做什么。

- CSS是精益的，几乎没有冗余，也没有自重（所有样式都与项目相关）。
- 范围有限,不依赖于后代/上下文选择器-样式是在“ [特异性层](https://acss.io/thinking-in-atomic.html#style-sheets-organization) ” 内部完成的。
- 初学者友好，原子 CSS 在设计好的情况下，甚至不需要编写样式表。 对于 css 不够擅长的开发人员更友好（这个也不一定是一件好事，css 学习是必需的）
- 越大型的系统，越熟练的开发人员，编写代码的时间和代码量就会越少。

如果一件事情只有利好而没有弊病那也是不可能的：

- 需要记住一堆没有意义的原子类，对于不同的团队，类名难以重用。
- 对于初学者
- 没有结合设计意图，原子类太细。

### tailwind

如果 Atomic CSS 不可接受，那么谈到最近刚刚拿到 200w 投资的风头更甚的 tailwind 框架我是真的喜欢。

```html
<div class="md:flex bg-white rounded-lg p-6">
  <img class="h-16 w-16 md:h-24 md:w-24 rounded-full mx-auto md:mx-0 md:mr-6" src="avatar.jpg">
  <div class="text-center md:text-left">
    <h2 class="text-lg">Erin Lindford</h2>
    <div class="text-purple-500">Product Engineer</div>
    <div class="text-gray-600">erinlindford@example.com</div>
    <div class="text-gray-600">(555) 765-4321</div>
  </div>
</div>
```

如果你重度使用 Bootstrap，那么我认为上手 tailwind 没有什么问题。 对比于 BootStrap，他做的更少，不会提供组件，仅仅提供样式。

- 自适应前置，我们在书写 自适应前端王爷时候，往往会携带 -md -xs 诸如此类的类。而 Tailwind 则以 md:text-left  lg:bg-teal-500 开头布局响应式风格。在书写时候，让代码更加自然。

- 代码量可控，虽然 Tailwind CSS 的开发版本未压缩为1680.1K，但是它可以轻易与 webpack 结合剔出没有使用的 css，

- 结合设计意图，

  ```js
  // tailwind.config.js
  module.exports = {
    theme: {
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
      },
      fontFamily: {
        display: ['Gilroy', 'sans-serif'],
        body: ['Graphik', 'sans-serif'],
      },
      borderWidth: {
        default: '1px',
        '0': '0',
        '2': '2px',
        '4': '4px',
      },
      extend: {
        colors: {
          cyan: '#9cdbff',
        },
        spacing: {
          '96': '24rem',
          '128': '32rem',
        }
      }
    }
  }
  ```

如果将来某一天我要编写自己的组件库，我一定会使用它。相信他会给我带来不同体验。

## MVP.css

他是一个简约的 HTML 元素样式表库，它应该不属于 css 组织与管理，因为这个库会把 ，最小可行化产品，当我们面对

这个 css  库结合 css 变量化处理。如果上述的 有很多前端同学可能认为它是一种模式。如果有一天，我们需要和设计人员结合开发，我认为它是很好的一种方案。同时，它提供了 reset.css 的功能，我们也可以很简单的对这种方案进行修改，因为样式写在元素上边。

```
:root {
    --border-radius: 5px;
    --box-shadow: 2px 2px 10px;
    --color: #118bee;
    --color-accent: #118bee0b;
    --color-bg: #fff;
    --color-bg-secondary: #e9e9e9;
    --color-secondary: #920de9;
    --color-secondary-accent: #920de90b;
    --color-shadow: #f4f4f4;
    --color-text: #000;
    --color-text-secondary: #999;
    --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    --hover-brightness: 1.2;
    --justify-important: center;
    --justify-normal: left;
    --line-height: 150%;
    --width-card: 285px;
    --width-card-medium: 460px;
    --width-card-wide: 800px;
    --width-content: 1080px;
}
```

## 工程实践

个人既不愿意细粒度的结合原子 css，又不可能粗力度的使用 MVP.css。我们必须想到一种方便而快捷的方式制定属于自己的规则。针对于体系化设计。

针对于布局

### 设计意图结合

不要仅仅只限于你手头上要做的东西，要考虑和你有关的东西。不要从页面开始，要看全部。

```



```



### css 变量结合

 当 CSS 变量成为主题， 我们可以使用 CSS 变量，对于不支持 CSS 变量 的设备，定制主题将不会生效，不过不必担心，默认样式仍会生效。





### 反组件化模式

因为需要结合外部 css，可能任何一个组件都无法单独拿出来使用。不过在

不过这个在业务项目中是否能够



## 其他

**团队合作永远是统一高于一切**



针对于项目团队，任何一样东西能生存，都有其自己的优势，当然万物有得就必有失。这是相互的，至于我们前端人员，或者一个团队如何取舍，还是需要从自已或团队力量出发，有利用之，无利就不用了。我认为我最近看的一篇博客 [《程序员修炼之道》中的一段废稿](https://blog.codingnow.com/2020/05/tpp_manuscript.html) 可以表述正交性问题，事实上，无论式团队还是一段代码，正交性越差就越难以治理。





