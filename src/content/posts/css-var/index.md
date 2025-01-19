---
title: 玩转 CSS 变量
published: 2020-08-20
description: 探讨了CSS变量的基础用法、实现默认配置、Space Toggle逻辑切换以及新式媒体查询等内容，展示了 CSS 变量在前端开发中的强大功能和应用场景。
tags: [工程实践]
category: 工程实践
draft: false
---
如果当年的 CSS  预处理器变量对于初入前端的我来说是开启了新世界的大门，那么 CSS 变量对于我来说无疑就是晴天霹雳。其功能不但可以优雅的处理之前 js 不好处理或不适合的业务需求。更在创造力无穷的前端开发者手中大放异彩。

## 基础用法

在前端的领域中，标准的实现总是比社区的约定要慢的多，前端框架最喜欢的 $ 被 Sass 变量用掉了。而最常用的 @ 也被 Less 用掉了。官方为了让 CSS 变量也能够在 Sass 及 Less 中使用，无奈只能妥协的使用 --。

```html
<style>
  /* 在 body 选择器中声明了两个变量  */ 
  body {
    --primary-color: red;
    /* 变量名大小写敏感，--primary-color 和 --PRIMARY-COLOR 是两个不同变量 */  
    --PRIMARY-COLOR: initial;  
  }

  /** 同一个 CSS 变量，可以在多个选择器内声明。优先级高的会替换优先级低的 */
  main {
    --primary-color: blue;
  }
    
  /** 使用 CSS 变量 */
  .text-primary {
    /* var() 函数用于读取变量。 */  
    color: var(--primary-color)
  }
<style>
    
<!-- 呈现红色字体,body 选择器的颜色  -->    
<div class="text-primary">red</div> 
    
<!-- 呈现蓝色字体，main 选择器定义的颜色  -->    
<main class="text-primary">blue</main>
    
<!-- 呈现紫色字体，当前内联样式表的定义  --> 
<div style='--primary-color: purple" class="text-primary">purple</main>    
```

这里我们可以看到针对同一个 CSS 变量，可以在多个选择器内声明。读取的时候，优先级最高的声明生效。这与 CSS 的"层叠"（cascade）规则是一致的。

由于这个原因，全局的变量通常放在根元素`:root`里面，确保任何选择器都可以读取它们。

```css
:root {
  --primary-color: #06c;
}
```

同时， CSS 变量提供了 JavaScript 与 CSS 通信的方法。就是利用 js 操作 css 变量。我们可以使用：

```html
<style>
  /* ...和上面 CSS 一致 */  
</style>    

<!-- 呈现黄色字体  -->    
<div class="text-primary">red</div> 
    
<!-- 呈现蓝色字体，main 选择器定义的颜色  -->    
<main id='primary' class="text-primary">blue</main>
    
<!-- 呈现紫色字体，当前内联样式表的定义  --> 
<div id="secondary" style='--primary-color: purple" class="text-primary">purple</main>    

<script>
// 设置变量
document.body.style.setProperty('--primary-color', 'yellow');
                                                           
// 设置变量，js DOM 元素 ID 就是全局变量，所以直接设置 main 即可
// 变为 红色
primary.style.setProperty('--primary-color', 'red');    

// 变为 黄色，因为当前样式被移除了，使用 body 上面样式
secondary.style.removeProperty('--primary-color');

// 通过动态计算获取变量值
getComputedStyle(document.body).getPropertyValue('--primary-color')

</script>

```

我们可以在业务项目中定义以及替换 CSS 变量,大家可以参考 [mvp.css](https://andybrewer.github.io/mvp/)。该库大量使用了 CSS 变量并且让你去根据自己需求修改它。

```css
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

我们可以看到基于 CSS 变量，可以更友好的和设计师的设计意图结合在一起。也易于修改，在业务项目中合理使用无疑可以事半功倍。

## 实现默认配置

如果让我来思考，我肯定无法想象出结合 CSS 预处理器 + CSS 变量便可以实现组件样式的默认配置。这里我先介绍两个关于该功能的前置知识点:

事实上，CSS 变量的 var() 函数还可以使用第二个参数，表示变量的默认值。如果该变量此前没有定义或者是无效值，就会使用这个默认值。

```css
/* 没有设置过 --primary-color，颜色默认使用 #7F583F */
color: var(--primary-color, #7F583F);
```

虽然目前 CSS 变量不是新的属性，但终究不是所有的浏览器都支持 CSS 变量的，这里我们还是要考虑一下优雅降级。

```css
/* 对于不支持 CSS 变量的浏览器，可以采用下面的写法。*/
a {
 /* 颜色默认值 */
  color: #7F583F;
  /* 不支持则不识别该条规则 */  
  color: var(--primary);
}
```

结合 CSS 处理器 + CSS 变量便可以实现组件样式的默认配置。这里参考了有赞的 [Vant Weapp](https://youzan.github.io/vant-weapp/#/theme) 的做法。有赞代码 [**theme.less**](https://github.com/youzan/vant-weapp/blob/v1.1.0/packages/common/style/theme.less) 如下所示:

```less
// 先导入所有 Less 变量
@import (reference) './var.less';

// 利用正则去替换 Less 变量 为 CSS 变量
.theme(@property, @imp) {
  @{property}: e(replace(@imp, '@([^() ]+)', '@{$1}', 'ig'));
  @{property}: e(replace(@imp, '@([^() ]+)', 'var(--$1, @{$1})', 'ig'));
}
```

函数效果如下所示:

```less
@import '../common/style/theme.less';

.van-button {
  // ... 其他省略
  .theme(height, '@button-default-height');
    
  .theme(line-height, '@button-line-height');
    
  .theme(font-size, '@button-default-font-size');
}

// => less 编译之后生成

.van-button{
   // ... 其他省略
  height:44px;
  height:var(--button-default-height,44px);
    
  line-height:20px;
  line-height:var(--button-line-height,20px);
    
  font-size:16px;
  font-size:var(--button-default-font-size,16px);
}
```

我们可以看到每调用一次 Less 函数将会被编译成两个属性。第一个属性的设定对于不支持 CSS 变量的设备可以直接使用，如果当前设备支持 CSS 变量，则会使用 CSS 变量，但是由于当前 CSS 变量未定义，就会使用变量的默认值。虽然 '@button-default-height 虽然也是一个变量，但是该变量仅仅只是 less 变量，最终生成的代码中并没有 --button-default-height 这样的变量。此时我们就可以在使用样式的位置或者 :root 中添加变量 --button-default-height。

这种方式更适合组件开发，因为该方案不声明任何 css 变量，只是预留的 css 变量名称和默认属性。这样的话，无论开发者的选择器优先度有多低，代码都可以很容易的覆盖默认属性。因为我们仅仅使用 css 的默认值。

大家可能有时候会想，这样的话，我们不是有更多的代码了吗？其实未必，事实上我们可以直接直接在页面内部定义变量样式。其他组件直接通过 style 去使用页面内的变量。当然了，事实上书写的代码多少，重点在于想要控制默认样式的粒度大小。粒度越小，则需要在各个组件内部书写的变量越多，粒度大，我们也就不必考虑太多。

## Space Toggle 逻辑切换

CSS 没有逻辑切换似乎是一种共识，但是我们可以利用选框(单选与多选)和 CSS 变量来实现判断逻辑。我们先来看看如何使用 CSS 变量。

```html
<style>
  .red-box {
    --toggler: ;
    --red-if-toggler: var(--toggler) red;
    background: var(--red-if-toggler, green); /* will be red! */
  }
  .green-box {
    --toggler: initial;
    --red-if-toggler: var(--toggler) red;
    background: var(--red-if-toggler, green); /* will be green! */
  }

</style>
<!-- 宽度高度为 100px 的 红色盒子 -->
<div 
  style="height: 100px; width: 100px" 
  class="red-box"
></div> 
<!-- 宽度高度为 100px 的 绿色盒子 -->
<div 
  style="height: 100px; width: 100px" 
  class="green-box"
></div> 
```
这里因为一个变量 --toggler 使用空格 或者 initial 而产生了不同的结果，基于这样的结果我们不难想象我们可以触发变量的修改而产生不同的结果。

他不是一个 bug，也不是一个 hack。他的原理完完全全的在 [CSS Custom Properties 规范](https://drafts.csswg.org/css-variables/#guaranteed-invalid) 中。

> This value serializes as the empty string, but actually writing an empty value into a custom property, like --foo: ;, is a valid (empty) value, not the guaranteed-invalid value. If, for whatever reason, one wants to manually reset a variable to the guaranteed-invalid value, using the keyword initial will do this.

解释如下，事实上 -foo: ; 这个变量并不是一个无效值，它是一个空值。initial 才是 CSS 变量的无效值。其实这也可以理解，css 没有所谓的空字符串，空白也不代表着无效，只能使用特定值来表示该变量无效。这个时候，我们再回头来看原来的 CSS 代码。

```css
.red-box {
  /* 当前为空值 */
  --toggler: ;

  /* 因为 var(--toggler) 得到了空,所以得到结果 为 --red-if-toggler:  red */
  --red-if-toggler: var(--toggler) red;
  /** 变量是 red, 不会使用 green */
  background: var(--red-if-toggler, green); /* will be red! */
}
.green-box {
  /** 当前为无效值 */
  --toggler: initial;
  /** 仍旧无效数据，因为 var 只会在参数不是 initial 时候进行替换 */
  --red-if-toggler: var(--toggler) red;
  /** 最终无效值没用，得到绿色 */
  background: var(--red-if-toggler, green); /* will be green! */

  /* 根据当前的功能，我们甚至可以做到 and 和 or 的逻辑 
   * --tog1 --tog2 --tog3 同时为 空值时是 红色
   */
  --red-if-togglersalltrue: var(--tog1) var(--tog2) var(--tog3) red;

 /*
  * --tog1 --tog2 --tog3 任意为 空值时是 红色
  */ 
  --red-if-anytogglertrue: var(--tog1, var(--tog2, var(--tog3))) red;
}
```

## 新式媒体查询

当我们需要开发响应式网站的时候，我们必须要使用媒体查询 @media。先看一下用传统的方式编写这个基本的响应式 CSS：

```css
.breakpoints-demo > * {
  width: 100%;
  background: red;
}

@media (min-width: 37.5em) and (max-width: 56.249em) {
  .breakpoints-demo > * {
    width: 49%;
  }
}

@media (min-width: 56.25em) and (max-width: 74.99em) {
  .breakpoints-demo > * {
    width: 32%;
  }
}

@media (min-width: 56.25em) {
  .breakpoints-demo > * {
    background: green;
  }
}

@media (min-width: 75em) {
  .breakpoints-demo > * {
    width: 24%;
  }
}
```

同样，我们可以利用 css 变量来优化代码结构，我们可以写出这样的代码：

```css
/** 移动优先的样式规则 */
.breakpoints-demo > * {
  /** 小于 37.5em, 宽度 100%  */
  --xs-width: var(--media-xs) 100%;

  /** 小于 56.249em, 宽度 49%  */
  --sm-width: var(--media-sm) 49%;

  --md-width: var(--media-md) 32%;
  --lg-width: var(--media-gte-lg) 24%;
  

  width: var(--xs-width, var(--sm-width, var(--md-width, var(--lg-width))));

  --sm-and-down-bg: var(--media-lte-sm) red;
  --md-and-up-bg: var(--media-gte-md) green;
  background: var(--sm-and-down-bg, var(--md-and-up-bg));
}
```

可以看出，第二种 CSS 代码非常清晰，数据和逻辑保持在一个 CSS 规则中，而不是被 @media 切割到多个区块中。这样，不但更容易编写，也更加容易开发者读。详情可以参考 [css-media-vars](https://propjockey.github.io/css-media-vars/)。该代码库仅仅只有 3kb 大小，但是却是把整个编写代码的风格修改的完全不同。原理如下所示:

```css
  
/**
 * css-media-vars
 * BSD 2-Clause License
 * Copyright (c) James0x57, PropJockey, 2020
 */

html {
  --media-print: initial;
  --media-screen: initial;
  --media-speech: initial;
  --media-xs: initial;
  --media-sm: initial;
  --media-md: initial;
  --media-lg: initial;
  --media-xl: initial;
  /* ... */
  --media-pointer-fine: initial;
  --media-pointer-none: initial;
}

/* 把当前变量变为空值 */
@media print {
  html { --media-print: ; }
}

@media screen {
  html { --media-screen: ; }
}

@media speech {
  html { --media-speech: ; }
}

/* 把当前变量变为空值 */
@media (max-width: 37.499em) {
  html {
    --media-xs: ;
    --media-lte-sm: ;
    --media-lte-md: ;
    --media-lte-lg: ;
  }
}

```

## 其他

继 [CSS 键盘记录器](https://github.com/maxchehab/CSS-Keylogging) 暴露了 CSS 安全性问题之后，CSS 变量又一次让我看到了玩技术是怎么样的。CSS Space Toggle 技术不但可以应用于上面的功能，甚至还可以编写 UI 库 [augmented-ui](http://augmented-ui.com/) 以及  [扫雷](https://github.com/propjockey/css-sweeper) 游戏。这简直让我眼界大开。在我有限的开发生涯中，难找到第二种类似于 css 这种设计意图和使用方式差异如此之大的技术。

CSS 是很有趣的，而 CSS 的有趣之处就在于最终呈现出来的技能强弱与你自身的思维方式，创造力是密切相关的。上文只是介绍了 CSS 变量的一些玩法，也许有更多有意思的玩法，不过这就需要大家的创造力了。

## 参考资料

[augmented-ui](https://github.com/propjockey/augmented-ui)

[css-media-vars](https://github.com/propjockey/css-media-vars)

[css-sweeper](https://github.com/propjockey/css-sweeper)