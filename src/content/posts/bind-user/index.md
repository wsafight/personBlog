---
title: 小程序绑定用户方案 优化
published: 2019-05-15
description: 探讨了小程序中用户绑定的优化方案，旨在提升用户体验和应用性能。文章详细介绍了预先绑定类和惰性绑定类两种小程序类型，并分别阐述了它们的功能特点和技术要点。
tags: [用户体验]
category: 用户体验
draft: false
---

在做过一系列小程序之后，对小程序的登陆鉴权的流程也有一定的理解，类似于 B 端小程序自不必说，要用户信息手机号地址可以一把梭，做一个引导页面进行判断然后要求用户给与绑定，用户自然不会多说什么，毕竟这是企业级别应用。但是当涉及到 C 端小程序时候。想让用户进行绑定，就势必要给与用户便利。这里我列出一些我觉得较为不错的小程序应用方案以供参考。

## 预先绑定类

该类小程序在使用之前就需要绑定用户信息。常见于线下门店类功能性小程序。线下操作时有大量的优惠活动来支持小程序的流量。

### 功能介绍
例如 便利蜂。之前在上海经常使用，价格和优惠都非常不错，这类小程序属于线下功能类小程序，内部有抽奖，付款等一系列功能。该小程序第一次打开就先用户直接要求用户绑定信息和地址，考虑到线下门店都会有一定的店员辅助。所以该小程序的绑定操作实际上用户都是可以接受的。图片如下所示。

![便利蜂首次进入](./bind-user.webp)


### 技术要点
- 技术1： 使用自定义导航栏让头部可以配置  

全局配置

```js
"window": {
  "navigationStyle": "custom"
}
```

如果微信 app 的版本在 7.0.0之上，我们就可以使用页面级别的配置了。

```json
{
  "usingComponents": {},
  "navigationStyle": "custom"
}
```

该配置默认时default，当使用custom时候可以自定义导航，可以在头部配置 loading。

第二种这个需要 app 版本，所以如果是想简化，反而在全局下定义，再使用微信官方的组件 [avigation-bar](https://github.com/wechat-miniprogram/navigation-bar) 即可。

- 技术2：使用小程序骨架屏  

骨架屏方案在后端不能很快给与前端数据时候采用这种方案，亦或者前端可以使用 Service Worker 把上次缓存数据返回到前端，等到从后端获取数据之后刷新页面也是一种方案，但是因为这是第一次打开小程序，所以采用骨架屏是一个很好的方法。   

采用 [小程序骨架屏](https://github.com/jayZOU/skeleton) 组件，如果不需要骨架屏动画效果，可以试试直接加载图片作为骨架屏。



## 惰性绑定类

该类小程序在展示时无需绑定用户信息，但是当用户进行操作时在询问绑定。常用于线上商城等一系列无需专人引导的用户项目。

### 功能介绍

基本上线上大部分 c 端小程序都采用此做法，功能上倒是没什么可以介绍的，但是实践上却有不同做法。

### 实践方式
- 方式 1: 页面跳转 (京东购物)

在每个需要绑定的按钮上添加跳转逻辑，如果当前小程序没有绑定，可以跳转到另外一个页面上确认授权。

- 方式2: 按钮控制 (华为商城+)

在每个需要绑定按钮上添加 open-type='getuserinfo'，后续可以根据状态变化，切换掉按钮(也可以不切换，因为第二次绑定数据不会跳出组件)。

- 方式3: 遮罩层拦截 (抽奖助手)

在需要绑定的页面添加一个 透明模态框，增加以整个页面大小的button。用fixed布局，还可以向下滚动。无论在当前页面点击任何地方都会出现需要绑定选项。  

组件代码：

```html
// wxml
<view style="z-index: {{zIndex}}" class="mask">
  <button open-type="{{ openType }}"
          bindtap="onClick"
          bindgetuserinfo="bindGetUserInfo"
          bindgetphonenumber="bindGetPhoneNumber"
          bindopensetting="bindOpenSetting"
          binderror="bindError"
          class="mask"/>
</view>

// wxss
.mask{
  position: fixed;
  top: 0;
  bottom:0;
  left:0;
  right:0;
  background-color: inherit;
  opacity: 0;
}
```

然后在绑定后令 mask 消失。该方案初看起来不是那么的合适，但是仔细想想却也没什么问题，因为用户99%可能点击所需求的按钮，就算点击到按钮之间的空隙之处跳出要求绑定也没有什么问题。

上面方式实际上都没有太大的问题，需要在不同场景下做最合适的选择。


## 结语

人机交互功能是决定计算机系统“友善性”的一个重要因素。读书学习时候要先把书读厚，再把书读薄，做程序也是一样，如何把系统做的复杂而更加复杂，如何让用户的体验简单而更为简单都不是那么容易的一件事。 