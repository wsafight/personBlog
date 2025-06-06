---
title: 记一次小程序样式优化重构
published: 2020-03-24
description: 介绍了如何通过优化小程序的样式开发来减少代码量并增强功能。文章探讨了全局样式开发、组件样式隔离以及使用CSS var定制主题等技术，以提高小程序的可维护性和可定制性。
tags: [项目重构, 小程序]
category: 小程序
draft: false
---

上周花了 3 天的时间和老大一起重构了一下小程序的样式开发，虽然说在开发的过程中遇到了一些问题，但是最终减少了不少样式代码，同时功能上也更加强大。进一步来说，如果在后面我们的小程序用户想要自己定制化主题，也可以很快的实现。

## 全局样式开发

之前的小程序开发中，我们全方面使用了 [Component](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/component.html) 构造小程序组件以及页面(页面也可以使用 Component 构造器来编写)。当然一方面是因为小程序 Component  的开发体验非常好，拥有类似于 Vue mixin, watch 的 [behaviors](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/behaviors.html) 和 [observers](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/observer.html)，比 Page 构造器强大了很多。另一方面，对于业务较重的小程序来说, Component 也有性能优势。可以参照 [滴滴开源小程序框架Mpx](https://juejin.im/post/5c0f693ef265da61542d78c6) 中的 *Page与Component setData性能对照*。

在开发过程中，有很多样式是可以复用的。如果在之前开发中经常使用 [Bootstrap](https://getbootstrap.com/) 之类的 ui 库，那么你就会习惯使用这种库的 [utilities](https://getbootstrap.com/docs/4.4/utilities/borders/) 类。但是默认情况下，自定义组件的样式只受到自定义组件 wxss 的影响。不会受到全局样式 app.wxss 的影响。所以我们只能通过增加 [@import](https://my.oschina.net/u/3201731) 语法来辅助各个组件进行开发。

```css
@import "xxx.css";
```

如果你使用 CSS 预处理器来辅助小程序开发的话，可能就需要通过 [gulp-insert](https://www.npmjs.com/package/gulp-insert) 为编译出来的 wxss 文件前置添加该语句。请注意: 之所以 [@import](https://my.oschina.net/u/3201731) 需要前置，是因为 [@import](https://my.oschina.net/u/3201731) 语法会把引入的样式按照导入的位置来生效，也就是说，按照 CSS 同等权重看先后的规则来说，如果把 [@import](https://my.oschina.net/u/3201731) 放在中间位置，前面位置定义的样式可能会被 [@import](https://my.oschina.net/u/3201731) 给覆盖掉。

### 小程序全局样式

当然，小程序基础库版本在 2.2.3 以上就支持了addGlobalClass 配置项,即在 Component 的 options 中设置 `addGlobalClass: true` 。

```js
Component({
  options: {
    addGlobalClass: true
  }
})
```

该配置项目表示页面级别的 wxss 样式将影响到自定义组件，但自定义组件 wxss 中指定的样式不会影响页面。也就是说我们可以用该配置替代之前的每个组件的 @import。只要在 app.wxss 上导入 CSS 样式即可，同时我们可以在页面上对组件内部的样式进行修改。不过需要说明的是: 该配置并不影响父子组件间的样式。各个子组件只受到 app.wxss 和页面的样式的侵入。小程序开发基本上以页面为单位，所以这个配置是非常适合开发的。不过在之前的开发中并没有在意过这个配置。

### 组件样式隔离

当然了，在后面的版本 2.6.5 中，微信小程序也提供了更为详细的隔离选项 `styleIsolation` 。

```js
Component({
  options: {
    styleIsolation: 'isolated'
  }
})
```

- `isolated` 表示启用样式隔离，在自定义组件内外，使用 class 指定的样式将不会相互影响（一般情况下的默认值）。
- `apply-shared` 表示页面 wxss 样式将影响到自定义组件，但自定义组件 wxss 中指定的样式不会影响页面。
- `shared` 表示页面 wxss 样式将影响到自定义组件，自定义组件 wxss 中指定的样式也会影响页面和其他设置了 `apply-shared` 或 `shared` 的自定义组件。（这个选项在插件中不可用）。

#### styleIsolation 浅析

如果大家不想了解太多，只想使用的话, 简短来说: 

大家在组件中直接使用 `apply-shared`，如果当前的 Component 构造器应用于页面，那么不要配置隔离选项即可。其余的隔离选项都是基本没什么用的。

#### styleIsolation 详解

`isolated`  等同于什么都不干，设置不设置一般没有区别，所以可以当该配置项目不存在。

`apply-shared` 等同于`addGlobalClass: true`，也是最有用的配置项 。

`shared` 最复杂，在子组件设置了样式，不但会影响自身和页面（同时包括了其他设置了`apply-shared` 或 `shared` 的自定义组件），同时呢，又会被页面样式和其他设置了 `shared`  的组件样式影响。在我使用该功能的过程中，我认为，这个配置项千万不要在组件中去使用，除非你“疯了”。

但是不介绍这个配置项目又不行，因为当你使用 Component 去构建页面时候，该页面的配置项目默认就是 `shared`。这是因为页面又需要全局样式，又需要影响其他设置了`apply-shared` 或 `shared` 的自定义组件。

不过可以放心的是: 小程序样式隔离是以页面为单位，不会影响全局样式，即使当前页面你有组件使用了以 `shared`  影响了当前页面。跳转到下一个页面中，不会出现问题。所以我们基本上按照上面的设置即可。

针对于页面级别的 Component 还有几个额外的样式隔离选项可用：

- `page-isolated` 表示在这个页面禁用 app.wxss ，同时，页面的 wxss 不会影响到其他自定义组件；
- `page-apply-shared` 表示在这个页面禁用 app.wxss ，同时，页面 wxss 样式不会影响到其他自定义组件，但设为 `shared` 的自定义组件会影响到页面；
- `page-shared` 表示在这个页面禁用 app.wxss ，同时，页面 wxss 样式会影响到其他设为 `apply-shared` 或 `shared` 的自定义组件，也会受到设为 `shared` 的自定义组件的影响。

基本上这些配置都会让页面上禁用 app.wxss，所以在开发中并不使用。大家如果有需求，可以自行研究。

从小程序基础库版本 [2.10.1](https://developers.weixin.qq.com/miniprogram/dev/framework/compatibility.html) 开始，也可以在页面或自定义组件的 json 文件中配置 `styleIsolation` （这样就不需在 js 文件的 `options` 中再配置）。例如：

```json
{
  "styleIsolation": "isolated"
}
```

### 其他样式配置功能

诸如 [外部样式类]([https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html#%E5%A4%96%E9%83%A8%E6%A0%B7%E5%BC%8F%E7%B1%BB](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html#外部样式类))  和 [引用页面或父组件的样式]([https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html#%E5%BC%95%E7%94%A8%E9%A1%B5%E9%9D%A2%E6%88%96%E7%88%B6%E7%BB%84%E4%BB%B6%E7%9A%84%E6%A0%B7%E5%BC%8F](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html#引用页面或父组件的样式)) 这些功能,大家也可酌情学习使用。不过有了组件样式隔离之后,这些功能可能就有些鸡肋，我可以直接通过页面的样式控制组件内部的样式。而且外部样式类功能需要父组件直接提供样式，不会被 app.wxss 所影响。

在样式隔离功能使用的情况下，我们可以大幅度减少各个组件的代码。并且让整个小程序内部更加干净整洁，可重用性更高。同时我们的主题色等全局配置都可以通过修改 app.wxss 来修改。

## CSS var 定制主题

### var 功能简单描述

如果当年 CSS 预处理器变量对于我来说是开启了新世界的大门，那么 CSS 变量这个功能对于无疑就是晴天霹雳。

```css
// 在 body 选择器中声明了两个变量
body {
  --primary-color: #7F583F;
  --secondary-color: #F7EFD2;
}

/** 同一个 CSS 变量，可以在多个选择器内声明。优先级高的会替换优先级低的 */
.a {
  --primary-color: #FFF;
  --secondary-color: #F4F4F4;
}

/** 使用 CSS 变量 */
.btn-primary {
  color: var(--primary-color)
}
```

在前端的领域中，标准的实现总是比社区的约定要慢的多，前端框架最喜欢的 $ 被 Sass  变量用掉了。而最常用的 @ 也被 Less 用掉了。官方为了让 CSS 变量也能够在 Sass 及 Less 中使用，无奈只能妥协的使用 --。

当然，我们也可以通过 JS 来操作 CSS 变量。如此，CSS 变量可以动态的修改。

```js

// 设置变量
document.body.style.setProperty('--primary', '#7F583F');

// 读取变量
document.body.style.getPropertyValue('--primary').trim();
// '#7F583F'

// 删除变量
document.body.style.removeProperty('--primary');
```

### var 默认配置

事实上，var() 函数还可以使用第二个参数，表示变量的默认值。如果该变量此前没有定义，就会使用这个默认值。如果让我来思考，我肯定无法想象出结合 Less 和  CSS 变量便可以实现小程序样式的默认配置。这里我们参考了有赞的 [Vant Weapp](https://youzan.github.io/vant-weapp/#/theme) 的做法。有赞代码 [**theme.less**](https://github.com/youzan/vant-weapp/blob/v1.1.0/packages/common/style/theme.less) 如下所示:

```less
// 先导入所有 less 变量
@import (reference) './var.less';

// 利用正则去替换变量
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

// => 编译之后

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

我们可以看到每调用一次 Less 函数将会被编译成两个属性。第一个属性的设定对于不支持 CSS 变量的设备可以直接使用，如果当前设备支持 CSS 变量，则会使用 CSS 变量，但是由于当前 css 变量未定义，就会使用变量的默认值。

经过这种函数的修改，我们就可以完成定制主题。详细请参考 [Vant Weapp 定制主题](https://youzan.github.io/vant-weapp/#/theme)。

```wxml
// component.wxml
<van-button class="my-button">
  默认按钮
</van-button>

// component.wxss

.my-button {
  --button-border-radius: 10px;
  --button-default-color: #f2f3f5;
}
```

大家可能有时候会想，这样的话，不是有更多的代码了吗？其实未必，事实上我们可以直接直接在页面内部定义变量样式。其他组件直接通过样式隔离去使用页面内的变量。当然了，事实上书写的代码多少，重点在于想要控制默认样式的粒度大小。粒度越小，则需要在各个组件内部书写的变量越多，粒度大，我们也就不必考虑太多。

当然了，我们可以基于用户机型提供默认和适合当前机型修改的的样式配置，这样的话。即使用户想要自己定义，也不会出现样式特别怪异的状况。


## 参考资料

[小程序 组件模板和样式](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html)

[CSS 变量教程](http://www.ruanyifeng.com/blog/2017/05/css-variables.html)

[Vant Weapp 样式覆盖](https://youzan.github.io/vant-weapp/#/custom-style)
