# 用 Web Animations  构建 CSS 动画

我之前在一篇博客 [聊聊游戏开发与动画利器 raf ](https://github.com/wsafight/personBlog/issues/23) 中介绍过。  CSS 动画是由浏览器渲染进程自动处理的，所以浏览器直接让 css 动画于 VSync 的时钟保持一致。但是由于浏览器中 setTimout 和 setInterval 由开发者控制，调用时机基本不可能和 VSync 保持一致。所以浏览器为 js 提供了**requestAnimationFrame** 函数，用来和 VSync 的时钟周期同步执行。所以如果当前情景下能够使用 CSS  动画的最好都使用 CSS 来完成动画，除非遇到难以完成的功能。 

### 交互复杂



### 配置复杂





##  Web Animations 发展

![Web动画API最早在2014年7月的第36版中出现在Chromium中。现在该规范将在2020年7月发布的第84版中完成。](https://webdev.imgix.net/web-animations/waapi-timeline.png)

### 交互与配置问题

### 动画序列问题

### 性能优化



## useWebAnimations





## 进一步阅读

https://web.dev/web-animations/

https://use-web-animations.netlify.app/

https://www.w3.org/TR/web-animations-1/

https://www.w3.org/TR/css-animation-worklet-1/#relationship-to-web-animations