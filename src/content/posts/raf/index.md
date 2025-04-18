---
title: 聊聊游戏开发与动画利器 raf
published: 2020-06-01
description: 探讨了游戏开发中的动画利器raf，介绍了其原理、优势以及使用方式，帮助开发者更好地利用raf提升动画性能，优化用户体验。
tags: [动画, 游戏]
category: 游戏开发
draft: false
---
今年下半年打算正式撸一撸小游戏，正好这些天整理一下有关游戏的一些知识，当然了，目前还是打算使用浏览器网页进行游戏开发。 

## 网页游戏开发的优势与未来

如果使用其他语言开发游戏，无论游戏本身大小与否，我们都需要游戏引擎来帮助我们构建开发，而对于浏览器来说，我们在开发小游戏时候，利用浏览器本身提供的组件和 api 就可以直接进行业务处理，我们也可以更加高效的学习与实践游戏逻辑。同时网页游戏的构建与发布也非常简单。

例如像 [**Js13kGames** ](http://js13kgames.com/) (Js13kGames是一个针对 HTML5游戏开发者的 JavaScript 编码竞赛,该竞赛的有趣之处在于将文件大小限制设置为13 kb ) 这样的限制代码量的游戏开发竞赛。对于非网页游戏开发来说，这基本上是不可能完成的，因为它们不具备有像浏览器这种量级的通用型的工具。

随着时间的发展，浏览器的功能，性能也在不断提升。通过 WebGL, WebAssembly 各种层出不穷的技术。让很多之前想都不敢想的功能在浏览器上实现。同时,伴随着 5G 到来，网速的提升，在浏览器上开发游戏充满了无限的可能。

当然了，事实上，不同的游戏需要不同的组件，其中包括数学库，随机算法，碰撞及物理引擎，音频，资源管理，AI机制等等等等，不过在浏览器环境下，这些组件都可以做到按需引用。

## 游戏循环架构与风格

游戏本身是基于动画的。不知道大家在小学的时候有没有买果或者玩过翻纸动画？如果你没有了解过，也可以看一看bilibili 中的视频。

 [高中生自制的翻纸动画短片]( https://www.bilibili.com/video/av24463374/?p=2)
 
 视频中通过快速翻动纸张来实现两个火彩人打架的精彩动画。事实上，我们的电脑，手机设备能够展示动画都是基于此原理。

所谓动画，就是不间断，基于时间和逻辑不断更新数据以及重绘界面。其核心一定会有至少一个循环。这里我介绍几种常见架构。

### 视窗消息泵

在 Windows 平台中，游戏除了需要对自身进行服务外，还需要处理来自于 Windows 系统本身的消息，因此，Windows中有游戏都会有一段被称为**消息泵**的代码。其原理是先处理 Windows 的消息，之后再处理游戏循环逻辑。

```c
// 不断循环处理
while (true) {
  MSG msg;
  
  // 如果当前消息队列中有消息，取出消息
  while(PeekMessage(&msg, NULL, 0, 0) > 0) {
    TranslateMessage(&msg);
    DispatchMessage(&msg)
  }
  
  // 执行游戏循环，类似于更新与重绘
  RunGame()  
}
```

以上代码的副作用在于默认设置了游戏处理消息的的优先级，循环中先处理了 Windows  内部消息。如果游戏在调整界面或者移动视窗时候，游戏就会卡住不动。

### 回调与事件驱动

很多游戏框架(包括浏览器)已经在内部实现了主游戏循环，我们无法直接介入内部循环机制，我们只能够填充框架中空缺的自定义部分。通过编写回调函数或者覆盖框架预设行为来实行。

例如一些游戏渲染引擎是这样实现的:

```c++
while(true) {
  // 渲染前执行（游戏子系统逻辑）  
  for(each frameListener) {
    // 回调函数
    frameListener.frameStarted()
  }
  
  // 渲染  
  renderCurrentScene()
  
  // 场景渲染后执行    
  for(each frameListener) {
    // 回调函数  
    frameListener.frameEnded()
  }  
  
  // 结束场景与交换缓冲区
  finalizeSceneAndSwapBuffers()  
}
```

 而另一种回调是基于事件驱动，实现方式为：事件系统会将事件置于不同的队列之中，然后在合适的时机从队列中取出事件进行处理。这种方式也就是浏览器的处理方式，利用消息队列和事件循环来让网页动起来。

```c++
while(true) {
  // 从任务队列中取出任务  
  Task task = task_queue.takeTask(); 
    
  // 执行任务
  ProcessTask(task);
  // 执行各种其他任务 Process...  
}
```

而浏览器提供的回调就包括 **setTimeout**(延迟执行) 与 **setInterval **(间隔执行) **requestAnimationFrame**(动画渲染)  **requestIdleCallback **(低优先级任务)。前两者执行时机由用户指定时机执行，后两者是由浏览器控制执行。

setTimeout 是一个定时器，用来指定某个函数在多少毫秒之后执行。他会返回一个编号，表示当前定时器的编号，同时你也可通过 clearTimeout 加入编号来取消定时器的执行。

```js
// 注册 10 ms 后打印 hello world
const id = setTimeout(() => {
  console.log('hello world')
}, 10)

clearTimeout(id)
```

结合上面的事件驱动模型，可以看出该回调函数就是在**循环**中不断执行任务,当发现延迟任务队列中的某个任务超过了当前的时间节点(通过发起时间和设定的延迟时间来计算)，就直接取出任务执行调用。等到期的任务都执行完成后，在进行下一个循环过程，通过这样的方式，一个完整的定时器就实现了。浏览器取消定时器则是通过 id 查找到对应的任务，直接将任务从队列中删除。

我们也可以通过 setTimout 回调函数内再次执行 setTimout 来实现 setInterval 函数的功能，看起来也类似于间隔执行，其实还是会有一定的区别。

```js
// 在回调函数完成后才去设置定时器，时间会超过 16 ms
setTimeout(function render(){
  // 执行需要 6 ms
  // 定时 16ms 后
  console.log(+ new Date())
  setTimeout(render, 500);
}, 500)

// 尝试每 16 ms 执行一次，不管内部回调函数耗时
setInterval(function render(){
   console.log(+ new Date())
}, 16)
```

重点在于，JavaScript 本身是单线程的，同时基于上面的事件驱动代码，我们只能依赖任务加入顺序依次处理任务，无法切断当前任务的执行，我们只能够控制定时器任务何时能够加入队列，却无法控制何时执行，如果其他任务执行的时间过久的话，定时器任务就必须延后执行，开发者没有任何办法。 当然了，社区的力量也是无穷的，facebook 的 React Fiber 就是实现了在渲染更新过程中断当前任务，执行优先级更高的任务的功能。

不过像使用浏览器的系统(包括游戏等)都是软实时系统。所谓软实时系统，就是即使错过限定期限也不会造成灾难性后果——错过了当前帧数，现实世界不会因此造成灾难性后果，与此相比，航空电子，核能发电等系统都属于是硬实时系统，错过期限会有严重的后果。不过就算如此，谁会喜欢一个经常卡顿的系统呢？所以实际业务开发中的性能优化还是重中之重。

当然了， requestAnimationFrame 本身也是回调函数，那么这个函数究竟有什么过人之处可以提升动画性能呢?在此之前，我们先介绍一下屏幕刷新率与 Fps 的区别。

## 屏幕刷新率与 FPS

屏幕刷新率即图像在屏幕上更新的速度，也即屏幕上的图像每秒钟出现的次数，它的单位是赫兹(Hz)。 对于一般笔记本电脑，这个频率大概是 60Hz，在  Window 10 上 可以通过桌面上**右键->显示设置->高级显示设置** 中查看和设置。屏幕刷新率表示显示器的物理刷新速度。

![image-20200512223617840.png](./1.png)

对于我的电脑来说，无论我目前是在浏览网页还是在挂机状态，当前显示器都以 1 秒刷新 165 次当前界面，该数值取决于显示器。我们也可以通过修改**适配器属性->监视器**来调整屏幕刷新率,一般来说，我们只要调整到眼睛舒适即可。

事实上，仅仅靠显示屏的刷新率是没有用的，就像上面的循环机制,如果 GPU 处理当前任务的耗时大于当前屏幕刷新的间隔时段。就无法按时提供图像。该特性也就是我们所说的 FPS 每秒传输帧数(Frames Per Second)。而对帧数起到决定性的是电脑中的显卡，显卡性能越强，帧数也就越高。

即 **FPS 帧数是由显卡决定，刷新率是由显示器决定**。如果显卡输出 FPS 低于显示屏的刷新率，则在显示屏刷新中将会复用同一张画面。反过来，显示器也会丢弃提供过多的图像。

## requestAnimationFrame (Raf) 使用与机制

下面我们就谈一谈 raf 函数对比其他定时器回调的优点。

首先，raf 函数本身并不是一个新特性，就连 IE 10 都提供了支持，所以这里不再介绍兼容。设置这个 API 的目的是为了让各种网页动画效果（DOM动画、Canvas动画、SVG动画、WebGL动画）能够有一个统一的刷新机制，从而节省系统资源，提高系统性能，改善视觉效果。使用方式如下:

```js
let start = null;
let element = document.getElementById('SomeElementYouWantToAnimate');
element.style.position = 'absolute';

function step(timestamp) {
  if (!start) start = timestamp;
  var progress = timestamp - start;
  element.style.left = Math.min(progress / 10, 200) + 'px';
  if (progress < 2000) {
    window.requestAnimationFrame(step);
  }
}

window.requestAnimationFrame(step);
```

可以看到，其实函数使用方式和 setTimeout 基本一致，只不过不需要提供第二个参数。

那么在没有第二个参数的情况下，函数究竟多久执行一次呢？raf 充分利用显示器的刷新机制，执行频率和显示屏的刷新频率保持同步，利用这个刷新频率进行页面重绘。也就是说在我的电脑上，raf 函数每秒执行 165 次。也就是  6 ms 执行一次，如果其他任务执行事件过长的话，该函数顺延到合适的时机。也就是其他任务执行时间大于 6 ms，函数就会在 12 ms 时候第二次执行，如果大于 12 ms,则会在 18 ms 时候第二次执行。

当看到 raf 函数和屏幕刷新率一致时候，大家也能大致的猜测出，浏览器为什么要提供 raf 函数了。因为显示器和 GPU 属于两个不同的系统，两者很难协调的运行，即使两者周期一致，也是很难同步起来。

所以当显示器将一帧画面绘制完成后，并在准备读取下一帧之前，显示器会发出一个垂直同步信号（vertical synchronization）给 GPU，简称 VSync。这时候浏览器就会利用 VSync 信号来对 raf 进行调用。

CSS 动画是由浏览器渲染进程自动处理的，所以浏览器直接让 css 动画于 VSync 的时钟保持一致。但是 js 中 setTimout 和 setInterval  由开发者控制，调用时机基本不可能和 VSync  保持一致。所以浏览器为 js 提供了raf 函数，用来和 VSync 的时钟周期同步执行。

针对于 VSync，大家可以参考 [理解 VSync](https://blog.csdn.net/zhaizu/article/details/51882768) 这篇文章。

## 扩展

注意: 浏览器为了优化后台页面的加载损耗以及降低耗电量，会让没有激活的浏览器标签 setTimeout 执行间隔大于 1s。requestAnimationFrame 执行速率会不断下降，同理 requestIdleCallback 也是如此。

同时，相信浏览器后面也会函数调度提供更加方便的支持，大家感兴趣也可以了解一下 [isInputPending](https://wicg.github.io/is-input-pending/#introduction)，不过该提案还处于起草阶段，工作组尚未批准，更不用说投入生产中了。

### 参考资料

[《游戏引擎架构》](https://book.douban.com/subject/25815142/)

[深入理解 requestAnimationFrame](https://blog.csdn.net/vhwfr2u02q/article/details/79492303)

[理解 VSync](https://blog.csdn.net/zhaizu/article/details/51882768) 