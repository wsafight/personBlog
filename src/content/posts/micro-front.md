---
title: 从微前端聊聊架构演进
published: 2020-02-03
description: 探讨微前端架构的发展历程。从单项目应用到多项目分离，再到微前端，详细分析了不同阶段的特点和需求，以及微前端在遗留系统中增量升级的优势。
tags: [架构演进]
category: 架构演进
draft: false
---

就目前来看，微前端已经不是一个新话题了。随着越来越多的公司的深入研究，当前也提出了很多的解决方案。不过本文不是想要来介绍微前端，更想介绍项目如何一步步到达微前端架构的实际需求。

当然，也不排除有些项目在初期就需要微前端这样的架构，不过我一直相信，任何架构模式都是根据实际需求来构建的。为什么很多大公司投入那么多的精力去做这样一件事，更多的也是因为他们真正需要这样一种架构，甚至达到了不用会影响业务开发的可能。不过对于大部分企业，不太需要关注这一点。

事实上，无论是什么架构形式,都是为了项目能够更快的进行开发。 所以不难得出，ETC 原则 (Easier To Change ，易于修改) 贯穿始终。

对于 ToC 端应用而言，可能生存期只有 2，3 年就会结束或者重写。但是对于 ToB 端应用基本上是公司不关门之前都会持续开发和使用下去。当然很多 ToC 端应用提供的更多是服务而不是业务，他们更多的关注重点放在服务上而并非业务范畴。

## 单项目应用

对于后端开发而言，都是由单体应用开始的，但是对于前端开发，所谓单体应用的说法并不合适，所以我在这里把它叫做单项目应用。

对于一个刚刚开始的创业公司，是没有足够的人力储备以及代码实践。此时我们要做的就是利用脚手架开启项目进行开发。我们需要做的是做好代码规范，把代码写好。更多的考虑前端组件化与服务分离。

### 依赖注入

如果不考虑项目中基于业务的各种依赖库以及其中的设计模式，那么依赖注入必然是打造一个易于修改与扩展的项目不可或缺的设计模式。控制反转和依赖注入可以参考 [控制反转和依赖注入的理解(通俗易懂)](https://blog.csdn.net/sinat_21843047/article/details/80297951)。

但很可惜，在众多的前端框架中仅仅只有 Angular 内置该功能，且仅有 Angular 有服务类(独立文件)的概念(不同框架关注点不同)。可以通过 [Angular 中的依赖注入](https://angular.cn/guide/dependency-injection) 进行学习。事实上，在开发较为复杂的业务时，对拉取以及处理数据的代码作为独立文件是不错的处理方式。这样其实也符合 react 和 vue 只做界面渲染层的需求，把功能服务提取出来，这样界面端框架切换就不太会影响服务的提供，就像公司在今年年中计划升级 vue3 这类的大的框架接口改动，出错的可能也会减少。

以小程序请求服务为依赖诸如的例子，开始时候我们注入了自己开发的请求类服务。后面发现了可以自带登陆管理的网络请求组件 [weRequest](https://github.com/IvinWu/weRequest) (如果你有此需求，也可以看看我之前写的 [从 weRequest登陆态管理来聊聊业务代码](https://github.com/wsafight/personBlog/issues/11) 这篇博客)。此时，我们要替换之前的请求服务，只需要对 weRequest 再包装一层，提供与之前服务相等的接口就不需要大幅度修改与业务相关的代码，这样修改基本上也不会出现 bug。诸如此类还有缓存服务等，只要接口不变，究竟存储在 sessionStorage 还是内存,又或者 LRU (Least recently used)  还是 LFU (Least frequently used),这只取决于服务是如何提供的。

个人认为如果想要开发一个持续迭代的应用，一定要在 ETC 上下足了功夫。创业公司更是如此。否则，如果在开发中需要增加一个新的需求或者修改当前需求，却发现当前的服务难以使用乃至于需要重写整个服务，这个在业务开发中是无法接受的。同时，初创公司的需求修改是最为常见的。不过，过度设计也是程序员的通病。

## 多项目分离

随着项目的慢慢变大，虽然我们可以依靠 Webpack 按需加载，但项目的编译与构建时间却不断增长。同时遇到某一个局部 bug 也需要全量编译与发布。项目在开发阶段遇到了巨大的阻力。

### 组件与服务提取

分离出不易变化的共通代码，独立作为项目发布与部署是可行的方法。就像我们会使用 [Webpack externals](https://webpack.docschina.org/configuration/externals) 来导入外部依赖一样，我们把项目中不易变化的代码分离出去。就像我们会使用开源库来协助开发一样，不可避免的会因为自身需求与开源库不相符合，同时又因为业务需求没那么通用所以不适合提炼出来，只能自己修改。包括很多的服务以及组件。我这里叫做业务型组件。因为这一类基于业务从基础组件中开发出来，但在稳定后改动性也不大。

当然，这里的话，可以采用的是单项目多程序包，类似于 [lerna](https://lerna.js.org/) 这种模式，也可以采用多项目模式。当然，对于目前初创公司而言，不太可能有几个产品同时在开发，所以可能类似 [lerna](https://lerna.js.org/) 解决方案会更好。但是如果可以提取几个产品的共通服务，倒是可以作为公司的基础库来维护。因为不太容易改变，所以让两个开发人员在有需求的时候去维护也绰绰有余，毕竟不像开源项目那样，需要服务的是各种各样的公司，千奇百怪的需求。当然，提炼出来的业务一定要非常基础。因为比不提取共同代码更难接受的就是一有需求就要改动依赖库的代码。与业务紧密相关的组件或者服务还是放在主项目中，以便于修改。

### widget 开发

微件（Web Widget)，中文可译作：小部件、小工具、微件、挂件等，是一小块可以在任意一个基于HTML的网页上执行代码构成的小部件，它的表现形式可能是视频、地图、新闻或小游戏等等。我们在 ToC 应用经常会使用，例如在网页中插入百度地图，或者百度商桥(在线客服网页插件)等网页 wediget。

在持续工作与开发的过程中，我们有一些业务是与当前业务关系不是那么大，例如登陆业务，很多时候，登陆是独立于我们当前业务之外的业务。例如像阿里很多登陆都会有钉钉登陆，支付宝登陆等模式，把整个登陆界面作为单独的项目然后用 iframe 进行登陆业务开发。如果做的好的话，我们多个产品就可以使用同一个登陆项目。这个对于小公司可以节省不少开发时间。

我们在开发中遇到的报表等无强业务相关的代码都可以提出来作为单独项目进行开发。如果有需求的情况下，也可以开发浏览器插件来辅助业务开发。

### 多页面业务拆分

伴随着代码的进一步扩展，我们开始基于不同的业务来拆分我们的项目。当然，事实上基于业务的多页面拆分并不意味真正的需要多个项目。在当前人手不够的情况下，不拆分为多个项目更好。当然此时各个单页面需要都需要加载共同的控制台头部(参考阿里云控制台)。当然，事实上，在单项目应用时期，我们就可以按照多页面拆分。但是当前如果没有做过上述几个操作，项目的编译和构建在开发中将会是一个灾难。同时，我们如果可以按照单页面拆分整个项目，就可以减少全局状态，减少各个业务间的全局状态也在一定程度上规避 bug。

可以看到，到达这一步，初创公司从零开发的产品可能已经开发了 2-3 年。如果当前的公司没有特别大的资金介入，可能在未来的几年内还是以这种形态进行开发。

## 微前端

> Techniques, strategies and recipes for building a **modern web app** with **multiple teams** that can **ship features independently**. -- [Micro Frontends](https://micro-frontends.org/)

上面是微前端的定义，首先第一个关键词就是多团队，多团队代表涉及的业务和人员有一定的基数，如果人员团队不够多，实在没必要上微前端。同时，微前端不会限制技术栈。某些特定场景下可能特定的技术栈有更好的生态。

当然，我认为微前端的最大的作用就是在遗留系统中做增量升级。面对已经上线几年的老项目，我们不可能一步到位就升级现有系统的技术栈。微前端是我已知实现渐进式重构的最好方案。

上述基于业务拆分虽然也可以解决状态隔离和独立开发部署等功能，但是由于需要加载同一个控制台头部，所以不能简单的做到各业务技术栈无关(可以做，但是目前需要双方协同)。不过个人目前也遇不到此类需求。

简而言之，微前端就是将大而恐怖的东西切成更小，更易于管理的部分，然后明确地表明它们之间的依赖性。各自团队的技术选择，代码库，发布流程都应该能够彼此独立地运行和扩展。无需过多的协调，让各个团队之间高内聚而低耦合。更自由灵活的使用 ETC 原则。

因为公司目前在创业阶段，没有微前端的需求。所以对微前端更多的是概念解读，而并非落地实践。当然，对于需求微服务的团队来说，实际上想要落地，还是需要做非常多的工作的，个人也没有什么技术实践和经验，就不再继续再写下去了。关于业界实践，大家可以看一看D2 中关于微前端专场的资料 [d2forum 14th](https://github.com/d2forum/14th) 与 [视频](https://list.youku.com/albumlist/show/id_52355444?spm=a2h9p.12366999.app.SECTION~MAIN~SECTION~MAIN~5~5!2~5~5~5~5~A)，也可以关注 [qiankun](https://qiankun.umijs.org/) 和 [alibabacloud-console-os](https://github.com/aliyun/alibabacloud-console-os)。后面我也会多研究这两个开源库来提升自己。

## 参考资料

[易于修改原则](https://blog.codingnow.com/2019/11/etc.html)

[micro-frontends](https://micro-frontends.org/)

[d2forum 14th](https://github.com/d2forum/14th)

[qiankun](https://qiankun.umijs.org/) 

[alibabacloud-console-os](https://github.com/aliyun/alibabacloud-console-os)