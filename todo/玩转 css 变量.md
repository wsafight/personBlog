# 玩转 CSS 变量

如果当年的 CSS  预处理器变量对于初入前端的我来说是开启了新世界的大门，那么 CSS 变量对于我来说无疑就是晴天霹雳。其功能不但可以优雅的处理之前 js 不好处理的业务需求。更在创造力无穷的前端开发者手中大放异彩。

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

</script>

```

我们可以在业务项目中定义以及替换 CSS 变量,大家可以参考 [mvp.css]()。大量使用了 CSS 变量并且让你去修改它。

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

我们可以看到基于 CSS 变量，可以更友好的和设计意图结合在一起。同时易于修改，在业务项目中合理使用可以事半功倍。

## 实现默认配置

如果让我来思考，我肯定无法想象出结合 CSS 处理器 + CSS 变量便可以实现组件样式的默认配置。这里先介绍两个前置知识点:

事实上，var() 函数还可以使用第二个参数，表示变量的默认值。如果该变量此前没有定义，就会使用这个默认值。

```css
/* 没有设置过 --primary-color，颜色默认使用 #7F583F */
color: var(--primary-color, #7F583F);
```

虽然目前 CSS 变量不是新的属性，但是不是所有的浏览器都支持 CSS 变量的，还是要考虑一下优雅降级。

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

我们可以看到每调用一次 Less 函数将会被编译成两个属性。第一个属性的设定对于不支持 CSS 变量的设备可以直接使用，如果当前设备支持 CSS 变量，则会使用 CSS 变量，但是由于当前 CSS 变量未定义，就会使用变量的默认值。虽然 '@button-default-height 看起来很像变量，但是该变量仅仅只是 less 变量，最终生成的代码中并没有 --button-default-height 这样的变量。

这种方式更适合组件开发，因为该方案不声明任何 css 变量，只是预留的 css 变量名称和默认属性。这样的话，无论开发者的选择器优先度有多低，代码都可以很容易的覆盖默认属性。因为我们仅仅使用 css 的默认值。

大家可能有时候会想，这样的话，不是有更多的代码了吗？其实未必，事实上我们可以直接直接在页面内部定义变量样式。其他组件直接通过 style 去使用页面内的变量。当然了，事实上书写的代码多少，重点在于想要控制默认样式的粒度大小。粒度越小，则需要在各个组件内部书写的变量越多，粒度大，我们也就不必考虑太多。

## Space Toggle 逻辑切换

CSS 没有逻辑切换似乎是一种共识，但是我们可以利用选框(单选与多选)和 CSS 变量来实现判断逻辑。我们先来看看效果。

```

```



## 新式媒体查询

##  变量 UI 库

## 其他

继 [CSS 键盘记录器](https://github.com/maxchehab/CSS-Keylogging) 之后，CSS 变量又一次让我看到了玩技术是怎么样的。CSS Space Toggle 技术不但可以应用于上面的功能，甚至还可以编写 [扫雷](https://github.com/propjockey/css-sweeper) 游戏。这简直让我眼界大开。在我有限的开发生涯中，很难找到类似于 css 这种设计意图和使用方式差异如此之大的技术。

CSS 是很有趣的，而 CSS 的有趣之处就在于最终呈现出来的技能强弱与你自身的思维方式，创造力是密切相关的。上文只是介绍了 CSS 变量的一些玩法，也许有更多有意思的玩法，不过这就需要大家的创造力了。

## 参考资料

[augmented-ui](https://github.com/propjockey/augmented-ui)

[css-media-vars](https://github.com/propjockey/css-media-vars)

[css-sweeper](https://github.com/propjockey/css-sweeper)

## 鼓励一下

如果你觉得这篇文章不错，希望可以给与我一些鼓励，在我的 github 博客下帮忙 star 一下。
[博客地址](https://github.com/wsafight/personBlog)