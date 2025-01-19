# 读 《HTML5 揭秘》有感

最近在补一些 HTML 的书籍，偶尔读到这本书，虽然这本书已经是10年以前的书籍了，不过其中有些有趣的知识点与观点被我提取了出来。

## 标准创建与技术实现冲突

作者在开始就提出了 Mozilla 开发人员关于标准与实现之间的冲突的一个观点:

> 一份技术规范和他的具体实现必须要做到步调一致。实现先于规范完成不是什么好事情，因为人们会开始依赖这些已实现的细节，这样会对规范造成制约。然而，你也不希望在规范已经完成时还没有任何相关的具体实现与实践经验，因为这样规范就得不到任何反馈。这里面如果存在着无法避免的冲突，而我们也需要硬着头皮去克服了。

事实上，对于前端开发而言，具体实现早于技术规范的制定已经是一种常态了。但与其他领域不同的是:前端的新标准非必要条件下是不可以破坏之前的实现。

在这里，我可以举几个兼容性的例子:

大家可能都使用过 String.prototype.includes 来判断一个字符串是否包含在另一个字符串中。但是实际上，在 Firefox 18 - 39中，这个方法的名称叫 `contains()`。由于在Firefox 17上，一些使用 [MooTools](http://mootools.net/) 1.2的网站会崩溃掉。当年由于各个框架为了能够更简单的使用函数，在各自的代码库中修改内置对象的 prototype，同时框架也考虑到了未来标准可能会实现，为了兼容以后的标准，他们对 prototype 进行判断，然后如果对象当前 prototype  上没有函数实现，就使用当前自己定制的函数，如果有函数实现的话，就使用浏览器所提供的函数。虽然他们考虑到了兼容标准，但是他们却没能考虑到标准是会发生改变的。可能在若干年后，标准实现后，函数已经与当前大相径庭。所使用的代码就会发生错误。所以，无奈之下，该函数被重命名为 `includes()` 。事实上我们可以看出，contains 命名要比 includes 好得多。 

在最新的提案之一就是在类中添加私有变量方法，标准将使用 `#` 符号来表示类的私有变量。

```js
class Count {
  #a = 1;
  getCount() {
    return this.#a  
  }
}
const count1 = new Count()

count1.getCount()
// 1

console.log(count1)
// Uncaught SyntaxError: Private field '#a' must be declared in an enclosing class
```

emmm...,美丑大家自行鉴别。也正是因为前端之前没有所谓的私有变量，所以大家都会“约定” ` _` 就是私有变量，但是事实上，任何约定都只会防君子不防小人。一定会有大量的代码直接进行调用。一旦浏览器支持后，必然会影响大量网页。 所以我们也只能硬着头皮去克服了。

受到影响的不仅仅是 JavaScript，同时也有 Css。 Css 变量为了能够在 Sass(变量用了 $ ) 和 Less(变量用了 @) 中使用，也是不得不去使用 --。可以看到这样进行 Css 变量定义也是不那么美观的。

```css
:root {
  --main-bg-color: brown;
}
```

## 交付出东西的人才是赢家

该书也讨论了为什么会存在 <img> 这个元素标签。为什么它是 img,而不是 include，image(事实上，貌似 image 元素标签也是存在在浏览器中的，可以看这一篇 blog [Having fun with <image>](https://jakearchibald.com/2013/having-fun-with-image/))？

答案以 93 年一群大佬的精彩的对话为主线，其中可以看到一些真知灼见，也有一些前瞻性很强的言论。众口难调是必然的。很多时候，协议的制定本身就不是一个技术问题，很难有对错而言。但是为什么一定是 <img>,答案很简单，因为提议者马克·安德里森在对话后直接发布了代码来处理这个元素。

这并不是说给出代码实现的就一定是赢家，但是这是赢家的必要条件,不是吗？讨论当然重要，是一种思想的交流，但是当我们不能从道理上说服别人的时候，就只能用其他的方案来表明自己的态度。

## 过于超前就会死亡

该书也讨论了当年 WHAT 小组和 W3C HTML 小组之间对于 HTML 发展的不同思考和见解，开始时候，两个小组之间各自为政，无视对方存在。WHAT 小组针对 Web 表单和新的特性进行工作，而另一组忙于制定 XHTML 2.0 版本，但可惜的事情是: 没有浏览器为之提供实现。

XHTML 是和 HTML 不兼容的，这意味者不但浏览器开发者要做大量的工作，还需要让前端开发者一下子切换到 XML，完全书写良好的规范 — 这是行不通的。而 WHAT 小组采用宽容的错误处理，把重点放在新特性上。

无论从观念还是互联网产品，过于超前的结局其实都不是太好。当然，这从侧面也印证了一个道理，选择比努力更重要的不是一句空话。

## 难以消失的浏览器兼容技术

最后，我们来聊一下技术吧。

新的功能已经到来，但是我们要等到什么时候才可以采用它？这个问题不但出现在 10 年前，同时也会在现在。优秀的开发者总是希望使用最新的特性来提升用户体验。当然了，我们现在可以依赖 [Can I use](https://www.caniuse.com/) 来判断浏览器支持情况。

很早之前，我们用 <noscript> 来处理不使用脚本的网页。

再然后，我们通过浏览器特性检测来进行兼容处理。例如 [Modernizr](https://github.com/Modernizr/Modernizr) 库来检查浏览器是否支持 HTML5 以及 css3。利用 polyfill 来升级不支持特性的浏览器。

即使在今天，这些问题依然没有被解决。当然我们利用更加先进的技术来支持罢了。

### Polyfill.io 根据不同的浏览器确立不同的 polyfill

如果进行过前端开发，就不可能没有使用过 polyfill。polyfill你可以理解为“腻子”，就是装修的时候，可以把缺损的地方填充抹平。针对于各个浏览器的把差异化抹平。由于各个浏览器版本不同，所需要的 polyfill 也不同，

[Polyfill.io](https://polyfill.io/v3/url-builder/)是一项服务，可通过选择性地填充浏览器所需的内容来减少 Web 开发的烦恼。Polyfill.io读取每个请求的User-Agent 标头，并返回适合于请求浏览器的polyfill。

如果是最新的浏览器且具有 Array.prototype.filter

```
https://polyfill.io/v3/polyfill.min.js?features=Array.prototype.filter

/* Disable minification (remove `.min` from URL path) for more info */
```

但是如果当前浏览器没有此函数，就会在 正文下面添加有关的 polyfill。

国内的阿里巴巴也搭建了一个服务，可以考虑使用,网址为 [polyfill.alicdn.com/polyfill.mi…](https://polyfill.alicdn.com/polyfill.min.js)

### type='module' 辅助打包与部署 es2015+ 代码

使用新的 DOM API，可以有条件地加载 polyfill，因为可以在运行时检测。但是，使用新的 JavaScript 语法，这会非常棘手，因为任何未知的语法都会导致解析错误，然后所有代码都不会运行。

该问题的解决方法是

```
<script type="module">。
```

早在 2017 年，我便知道 type=module 可以直接在浏览器原生支持模块的功能。具体可以参考 [JavaScript modules 模块](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Modules) 以及 [ECMAScript modules in browsers](https://jakearchibald.com/2017/es-modules-in-browsers/)。但是当时感觉只是这个功能很强大，并没有对这个功能产生什么解读。但是却没有想到可以利用该功能识别你的浏览器是否支持 ES2015。

每个支持 type="module" 的浏览器都支持你所熟知的大部分 ES2015+ 语法!!!!!

例如

- async await 函数原生支持
- 箭头函数 原生支持
- Promises Map Set 等语法原生支持

因此，利用该特性，完全可以去做优雅降级。在支持 type=module 提供所属的 js，而在 不支持的情况下 提供另一个js。具体可以参考 [Phillip Walton 精彩的博文](https://philipwalton.com/articles/deploying-es2015-code-in-production-today/),这里也有翻译版本 [【译】如何在生产环境中部署ES2015+](https://jdc.jd.com/archives/4911)。

如果当前项目已经开始从 webpack 阵营转到 Vue CLI 阵营的话，那么恭喜你，上述解决方案已经被内置到 Vue CLI 当中去了。只需要使用如下指令，项目便会产生两个版本的包。

```
vue-cli-service build --modern
```

具体可以参考 [Vue CLI 现代模式](https://cli.vuejs.org/zh/guide/browser-compatibility.html#现代模式)。

不得不说的是: 目前也有开发者把  ESM  module 已经作为主流浏览器的功能来思考。还提供了 10 倍打包速度的 [Snowpack](https://www.snowpack.dev/)。虽然目前距离生产环境还有一定差距，不过如果下次需要开发小型个人项目，我会尝试使用该工具。


## 参考资料

[ECMAScript modules in browsers](https://jakearchibald.com/2017/es-modules-in-browsers/)

[Vue CLI 现代模式](https://cli.vuejs.org/zh/guide/browser-compatibility.html#现代模式)

 [【译】如何在生产环境中部署ES2015+](https://jdc.jd.com/archives/4911)