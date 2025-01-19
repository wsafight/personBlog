---
title: 谈谈前端工程化 js加载
published: 2019-05-03
description: 回顾当年前端工程化尚未普及的时代，探讨那时 JavaScript 的加载方式及其局限性
tags: [js 加载, 性能优化]
category: 工程实践
draft: false
---
## 当年的 js 加载
在没有 前端工程化之前，基本上是我们是代码一把梭，把所需要的库和自己的代码堆砌在一起，然后自上往下的引用就可以了。  
那个时代我们没有公用的cdn，也没有什么特别好的方法来优化加载js的速度。最多用以下几个方案。

### 可用的性能方案
+ 可以在代码某些需要js的时候去使用 loadjs 来动态加载 js 库。这样就不会出现开始时候加载大量js文件。
+ 再大点的项目可能用一下 Nginx [ngx_http_concat_module](http://tengine.taobao.org/document_cn/http_concat_cn.html) 模块来合并多个文件在一个响应报文中。也就是再加载多个小型 js 文件时候合并为一个 js 文件。
+ BigPipe 技术也是可以对页面分块来进行优化的，但是因为与本文关系不大，方案也没有通用化和规范化，加上本人其实没有深入了解所不进行深入介绍，如果先了解可以参考 [新版卖家中心 Bigpipe 实践（一）](http://taobaofed.org/blog/2015/12/17/seller-bigpipe/) 以及 [新版卖家中心 Bigpipe 实践（二）](http://taobaofed.org/blog/2016/03/25/seller-bigpipe-coding/)。 

当然那个时期的代码也没有像现在的前端的代码量和复杂度那么高。

## Webpack 之后的js加载
与其说 Webpack 是一个模块打包器，倒不如说 Webpack 是一份前端规范。

### 需要库没有被大量使用情况
对于我们代码中所需要的代码库没有大量使用，比如说某种组件库我们仅仅只使用了 2、3个组件的情况下。我们更多需要按需加载功能。    
比方说在 [MATERIAL-UI](https://next.material-ui.com/) 我们可以用
```
import TextField from '@material-ui/core/TextField';
import Popper from '@material-ui/core/Popper';
import Paper from '@material-ui/core/Paper';
import MenuItem from '@material-ui/core/MenuItem';
import Chip from '@material-ui/core/Chip';
```
代替
```
import {
  TextField,
  Popper,
  Paper,
  MenuItem,
  Chip
} from '@material-ui'

```
这样就实现了按需加载，而不是动辄需要整个组件库。但是这样的代码中这样代码并不好书写。我们就需要一个帮助我们转换代码的库。这可以参考 [Babel 插件手册](https://github.com/jamiebuilds/babel-handbook/blob/master/translations/zh-Hans/plugin-handbook.md) 以及 [简单实现项目代码按需加载](https://github.com/airuikun/Weekly-FE-Interview/issues/9) 来实现我们的需求。

### 需要库大量被使用情况

如果我们的库被当前的项目大量使用了，按需加载其实就未必是最好的方法了，如果我们的服务器不是特别好的情况下我们可以使用 Webpack 的 externals 配置来优化项目的js。就简单的对 externals 配置简单说明一下。externals其实是在全局中的得到库文件。
```
  // 页面中使用 cdn，这样的话，我们就会在 window 中得到 jQuery
  // 也就是 global.JQuery 浏览器中 global === window
  <script
    src="https://code.jquery.com/jquery-3.1.0.js"
    integrity="sha256-slogkvB1K3VOkzAI8QITxV3VzpOnkeNVsKvtkYLMjfk="
    crossorigin="anonymous">
  </script>

  // 在项目中导入 jquery 使用
  import $ from 'jquery';

  // 配置中 左边是 配置的 jquery 告诉 Webpack 不需要导入
  // 配置中 右边是 配置的 JQuery 告诉 Webpack 记载 jquery 时候使用 global.JQuery
  externals: {
    jquery: 'jQuery'
  }
```

但是使用 externals 曾遇到这样的情况。我在使用 material-ui 组件库时候发现该库在全局导出的代码是 material-ui。  
也就是:
```
  externals: {
    '@material-ui/core': 'material-ui'
  }
```
此时会发生导入错误，错误原因为: window.material-ui。   
本来我是想要引入material-ui，却 - 符号变为了减号。   
本来想要利用用 ['material-ui'] 来替换，却发现行不通: windows.['material-ui']  
解决方法:
```
  externals: {
    '@material-ui/core': "window['material-ui']"
  }
```
因为 window 对象有自己引用自己，所以 window === window.window.window。所以代码为 window.window['material-ui']。可以参考 [MDN Window.window](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/window)

## 上文中的性能优化方案依然可用
### loadjs 动态加载
在当前所需要 js 文件不需要大量使用同时需要的 js 文件是不需要开始时加载(如 React, React-Router 一类)的时候我们依然可以使用loadjs来加载(比如说 图标库一类，只在某一些页面使用)。   
### 合并多个小型 js
对于在 HTTP2 中合并多个 小js文件未必好。因为在 HTTP2 中，HTTP 请求是廉价的，合并便不再显得有优势。   
### BigPipe 方案
当然了,BigPipe 方案不是针对单页面应用程序。而且对于前后端的技术要求较高，所以对于项目未必是最有效的方案。

## 其他
现如今也可以使用一些其他的方法。例如 Service Worker,Wasm 等一系列方案。不知道还有什么其他方法，也可以介绍给我。


## 参考文档
[新版卖家中心 Bigpipe 实践（一）](http://taobaofed.org/blog/2015/12/17/seller-bigpipe/)   
[新版卖家中心 Bigpipe 实践（二）](http://taobaofed.org/blog/2016/03/25/seller-bigpipe-coding/)   
[Babel 插件手册](https://github.com/jamiebuilds/babel-handbook/blob/master/translations/zh-Hans/plugin-handbook.md)   
[简单实现项目代码按需加载](https://github.com/airuikun/Weekly-FE-Interview/issues/9)   
[MDN Window.window](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/window)