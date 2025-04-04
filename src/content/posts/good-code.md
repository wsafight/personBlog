---
title: 2020年 我要这样写代码
published: 2019-12-19
description: 探讨了提升代码质量的方法。文章强调了利用开源代码减轻业务压力、统一代码风格、化繁为简、权责对等、专注单一任务以及重视命名与注释等方面的重要性。
tags: [工程实践]
category: 工程实践
draft: false
---

在 9102 年年初，一位室友问我一个问题，如何才能够提升写代码的能力?

可惜的是: 当时仅仅回复了一些自己的想法，如多看开源代码，多读书，多学习，多关注业界的动向与实践，同时也列了一些原则。但是这些并没有所总结，又或者说没有例子的语言始终是空泛的。所以在今年年底之际，对应着今年中遇到的形形色色的代码问题来一一讲解一下。

## 好代码的用处

> 实际上本书建立在一个相当不可靠的前提之上：好的代码是有意义的。我见过太多丑陋的代码给他们的主人赚着大把钞票，所以在我看来，软件要取得商业成功或者广泛使用，“好的代码质量”既不必要也不充分。即使如此，我仍然相信，尽管代码质量不能保证美好的未来，他仍然有其意义：有了质量良好的代码以后，业务需求能够被充满信心的开发和交付，软件用户能够及时调整方向以便应对机遇和竞争，开发团队能够再挑战和挫折面前保持高昂的斗志。总而言之，比起质量低劣，错误重重的代码，好的代码更有可能帮助用户取得业务上的成功。

以上文字摘抄于《实现模式》的前言，距离本书翻译已经时隔 10 年了，但是这本书仍旧有着很大的价值。同时对于上述言论，我并不持否认意见。但是我认为，坏代码比好代码更加的费财(嗯，没打错，我确定)。对于相同的业务需求，坏代码需要投入的精力，时间更多，产出反而会更少。同时根据破窗理论( 此理论认为环境中的不良现象如果被放任存在，会诱使人们仿效，甚至变本加厉 )，坏代码会产生更坏的代码。这是一个恶性循环，如果不加以控制，完成需求的时间会慢慢失去控制。需要完成需求的人也会失落离开。

也就是说，好代码可以实现多赢，能够让用户爽，能够让老板爽，能够让开发者爽。总之，大家爽才是真的爽。

## 怎么写出好代码

### 少即使多

利用开源出来的设计与代码来减轻来自于业务线的时间压力。

> The best way to write secure and reliable applications. Write nothing; deploy nowhere.

以上取自 github 上最火的项目之一 [nocode](%20https://github.com/kelseyhightower/nocode%20)。懒惰是程序员的美德之一。所以学习业务，理解业务，拒绝不必要的需求也是一个程序员的必修功课。详情可以参考[如何杜绝一句话需求？](%20https://mp.weixin.qq.com/s/65pyUN7z8_MpiXk8kJTSqg%20) 这一篇 blog，当然，在大部分场景下，我们是不具备对需求说不的能力与权力的，但是无论如何，深度的理解业务，对客户有同理心是对程序员的更高要求。解决问题才是一个程序员需要做的事情。能够理解好题意才能解决问题。

对于软件开发而言，时间一定是最宝贵，最有价值的资源。相应的，尽量把时间耗费在解决新的问题，而不是对已经存在确切解决方案的问题老调重弹。所以，尽量不要自己写代码，而是借用别人的设计与实现。而在事实上，你也很难在极短的时间压力下设计并完成比开源更加合适的代码。

当然，开源作者一定是想让他的产品有更多的受众，所以从设计上而言，会采用较为通用的设计，如果你的需求较为特殊并且你觉得不能说服作者帮你“免费打工”(或者作者拒绝了)，那么你也只需要在特定之处进行包装与改写,但是要比完全重写要简单太多了。

当然，调研新的技术方案并且使用到项目中是一种能力，但是千万不要因为一个小功能添加一个非常大的项目。

笔者在之前就遇到过其他小伙伴因为无法使用数字四舍五入。说 fixed 方法有问题而使用 math.js 的小伙伴。

```js
(11.545).toFixed(2);
// "11.54"
```

如果想要了解 fixed 方法为何有问题的，可以参考 [为什么(2.55).toFixed(1)等于 2.5？](https://zhuanlan.zhihu.com/p/31202697) 作者以 v8 源码来解释为何会有这样的问题，以及提供了部分修正 fixed 的方案。

事实上如果没有很大的精度需求，前端完完全全利用一个函数便可以解决的问题，完全不需要复杂的 math 这种高精度库。

```js
function round(number, precision) {
  return Math.round(+number + "e" + precision) / Math.pow(10, precision);
}
```

当然，也有小伙伴来找我询问大量数据的表格优化，我第一反应就是 [React Infinite](https://github.com/seatgeek/react-infinite) 或者 [vue-infinite-scroll](https://github.com/ElemeFE/vue-infinite-scroll) 此类解决方案。但是对方能够多提供一些信息包括上下文，采用的技术栈，当前数据量大小，未来可能需要达到的大小，当前表格是否需要修改等。得到了这些信息，结合业务来看，相比于增加一个库，是否如下方式更为便捷与快速。

```js
// 因为 vue 模型的原因，使用 Object.freeze 性能可以有很大增益
this.xxx = Object.freeze(xxx);
```

随着堆积业务，代码的增长。管理复杂度的成本与日俱增，把依赖降低。 利用开源代码使得任务更容易实现。时间就是成本。关键是让收益可以最大化。

学习更多是为了做的更少。

### 统一

不同的人由于编码经验和编码偏好不同，项目中同一个功能的实现代码可能千差万别。但是如果不加以约束，让每一个人都按照自己的偏好写自己的模块，恐怕就会变成灾难。

所以每次在学习一些新技术的时候，我总是想多看看作者的实例代码，作者是如何理解的，社区又是如何理解的。以求实现起来代码风格不至于偏离社区太多，这样的话可以提高沟通与协作的效率。类似于 《阿里巴巴 Java 开发手册》 或者 [vue 风格指南](https://cn.vuejs.org/v2/style-guide/) 这种取自大公司或社区的经验之谈，要多读几遍。因为他们所遇到的问题和业务更加复杂。

对于公司内部开发来说，写一个组件时候，生命周期的代码放在文件上面还是放在最下面，如何把代码的一个功能点集中放置。通用型代码的修改。代码行数的限制。能够列出统一的方案，多利而少害。

### 化繁为简（抽象）

抽象是指从具体事物抽出、概括出它们共同的方面、本质属性与关系等，而将个别的、非本质的方面、属性与关系舍弃的思维过程。

如果你面对一个较大的系统，你会发现重构并不能解决根本问题，它仅仅只能减少少许的代码的复杂度以及代码行数，只有抽象才可以解决实质性问题。

无论是数据库设计，架构设计，业务设计，代码设计，但凡设计都离不开抽象。抽象能力强的所面临的困难会比能力弱的少很多。

或者说抽象能力弱一些的小伙伴遇到一些问题甚至需要重新推翻然后再设计，这个是在时间和业务开发中是不能被接受的。

这里就谈谈代码，以下也举个例子,如 [axios](https://github.com/axios/axios) 库中有拦截器与本身业务，在没有看到源码之前，我一直认为他是分 3 阶段处理:

- 请求拦截
- 业务处理
- 响应拦截

但如果你去看源码,你就会发现其实在作者看来，这 3 个阶段其实都是在处理一个 Promise 队列而已。

```js
// 业务处理
var chain = [dispatchRequest, undefined];
var promise = Promise.resolve(config);
​
this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    // 前置请求拦截
 chain.unshift(interceptor.fulfilled, interceptor.rejected);
 });
this.interceptors.response.forEach(function     pushResponseInterceptors(interceptor) {
 // 后置响应拦截
 chain.push(interceptor.fulfilled, interceptor.rejected);
 });
​
 while (chain.length) {
 promise = promise.then(chain.shift(), chain.shift());
 }
​
 return promise;
```

这就是一种代码抽象能力。让自己的代码可以适应更多的场景是程序员需要思考的。代码不是给机器看的，是给人看的，更高的要求是: 代码不仅仅是给人看的，更是给人用的。需要考虑到协作的人与事，灵活的配置也是必须要考虑到的。就拿前端的 虚拟 dom 来说。能够适配更多的平台。

当然了，抽象能力需要时间，需要经验，需要学习大量的设计。

注意!:不要过早的抽象业务代码，甚至不要抽象业务代码。多写一点代码无所谓，千万别给自己找事做。 在业务上尽量保持简单和愚蠢。除非你是业务专家，确认当前业务不太会产生变化。

### 权责对等(拆分与合并)

责任与义务本质上就是对等的，且越对等的就越稳定。这几年，微服务架构，中台，微前端理论层出不穷，本质上就是为了权责对等，对于更加基础的服务，更有产出的业务投入更高的人力与物力以保证更稳定的运行是很正常的一件事。而不是之前的大锅饭(单体应用)。

从代码上来看，某个模块是否承担了它不应该做的事情，或者某个模块过于简单，徒增复杂度。

当然，事实上有些东西目前是做不到的让所有人都觉得满意，增一分则肥,减一分则瘦,刚刚好很难界定。就像 Dan Abramov 说的那样:

> Flux libraries are like glasses: you’ll know when you need them.

### 只做一件事

Unix 哲学，这个很好理解，就像我今年想做的事情太多，反而什么都没有做(或者说都做了,但都不好)。

代码上来看，不要因为一点点性能的原因，把几件事合在一起去做。例如在一次 for 循环中解决所有问题，或者将所有代码写在一个函数中，例如:

```js
created() {
    const {a,b,c,d} = this.data
    // ... 三件事情彼此有交互同时需要 a,b,c,d

    // 完成之后的逻辑
}
```

改造后:

```js
created() {
 const axx = doA()
 doB()
 const cxx =  doC()
 // 完成之后的逻辑
}
​
// 分离出3个函数
doA() {
 const {a,b,c} = this.data
 // ... 三件事情彼此有交互同时需要 a,b,c,d

 // 完成之后的逻辑
}
// 其他代码
```

相比于第一个只需要一次取数，一次 setData，第二个性能无疑更低，但是可维护性变高了，3 件事情都被拆分出来，后面修改代码时候，我可以追加一个 doD 而不是再次把第一份代码中逻辑整理清楚再小心翼翼的修改代码。

### 命名与注释

> There are only two hard things in Computer Science: cache invalidation and naming things.

命名与缓存失效是两大难题，今年讲了不少缓存问题，同时，命名的确是很困难的一件事情。通过一句话来解释你们在做什么事情，通过一句话来解释一件事的意图。

不说在程序世界中，在现实世界中也是如此。例如: 《震惊!xxx 居然 xxx》等新闻,虽然说看完后都会想要骂一句，但是，正如这样的名字才能吸引人家点击进入，让人情不自禁的被骗一次又一次。所以在项目没有发布前，要取一个简单而又好记的名字。

但在程序内部，我们不需要“骗取”人家的点击量，反而是要务实点，不要欺骗另外的同伴，比如说写了一个简单的名字，结果内部却封装了很多的业务代码。同时我认为这也是函数越写越短的理由，因为大家难以通过命名来解释那一大坨代码的意图。所以，需要编写可以自我解释的代码，而这种代码最佳实践就是好的命名。

对于开源代码，你往往会发现，这些文件开头都会有一系列注释，这个注释告诉我们了这个模块的意图与目的。让你无需看代码就可以进行开发。

对于业务开发而言，仅在你不能通过代码清晰解释其含义的地方，才写注释。在多个条件下都无法解释你的代码。

- 项目名
- 模块名
- 文件名(类名)
- 函数名(方法名)

这并不是让你不写注释。但是我觉得更多的注释应该放在数据结构而不是代码逻辑上。聪明的数据结构和笨拙的代码要比相反的搭配工作的更好。更多的时候，看数据结构我能了解业务是如何运行的，但是仅仅看到代码并不能实际想象出来。

实际上，随着时间的推移，代码做出了许多改动，但注释并没有随之修改，这是一个很大的问题。注释反而变得更有欺骗性。

这里也提供一篇 [export default 有害](https://jkchao.github.io/typescript-book-chinese/tips/avoidExportDefault.html) 的文章。我觉得 export default 导出一个可以随意命名的模块就是一种欺骗性代码(随着时间的推移，该模块的意图会发生变化)。

### 考虑场景

没有放眼四海皆准的方案，所以我们必须要考虑到场景的问题，我们总是说可修改性，可读性是第一位的(往往可读，可修改的代码性能都不差)。但是如果是急切需求性能的场景下，有些事情是需要再考虑的。

if 是业务处理中最常用的，在每次使用前要考虑以下，哪个更适合作为主体，哪个更适合放在前面进行判断。如果有两个维度上的参数，一个是角色，一个是事件。一定是会先判断角色参数，然后再去判断事件参数，反之则一定不好。因为前者更符合人的思维模式。在同一维度下，至于哪个放前面，一定是更多被使用的参数放在前面更好，因为更符合机器的执行过程。

就像在 if 中你究竟是使用 else 还是 return。大部分情况下处理业务逻辑互斥使用 else,处理错误使用 return。因为这样的代码最符合人的思维逻辑。

但是在这里我也要举出来自《代码之美》的例子，在第五章中，作者 Elliotte Rusty Harold 设计了一个 xml 验证器，其中有一段在验证数字字符:

```java
public static boolean isXMLDigit(char c) {
 if (c >= 0x0030 && c <= 0x0039) return true;
 if (c >= 0x0660 && c <= 0x0669) return true;
 if (c >= 0x06F0 && c <= 0x06F9) return true;
 // ...
 return false
}
```

这个优化之后如下:

```java
public static boolean isXMLDigit(char c) {
 if (c < 0x0030) return false; if (c <= 0x0039) return true;
 if (c < 0x0660) return false; if (c <= 0x0669) return true;
 if (c < 0x06F0) return false; if (c <= 0x06F0) return true;
 // ...
 return false
}
```

### 全局思考，善于交流

软件开发已经不是一个人打天下的时代了，你要不停的触达边界。在前后端分离的时代，前端可以不知道数据库如何优化，后端也可以不清楚浏览器的渲染机制，但是却不能不明白对方在做什么。否则等于鸡同鸭讲，也会浪费时间。在开发时候，把一段逻辑放在那一端取决安全的思考以及简化逻辑。

善于交流是一种能力，在与别人交流时给与足够的上下文，让你的 leader 沟通，让她知道你的难处。和小伙伴沟通，说服他人按照你的想法推进，同时，善于聆听才能不断进步。

### 算法

我不是一个算法达人( leetcode 中等题目都费劲 )，但这个没什么可说的，你拿你的 O(n\*\*3) 算法去对战人家 O(n \* logn) 算法就是费财。所以，知道自己某方面不够好去努力就行了。

## 辅助工具

### TypeScript

虽然早就接触和实践过，但是以往都是 AnyScript。今年也算重度使用了。才体会到该工具的利好。一个好的开发工具并不是让你少写那一点点代码，而是让你在交付代码时候能够更加自信。

TypeScript 最大的好处就是让你在写代码前先思考，先做设计。就像之前说的。聪明的数据结构和笨拙的代码要比相反的搭配工作的更好。

TypeScript 同时也可以让大部分运行时错误变为编译时，并且可以减少使用中的防御性编程(信任但是仍要验证)。你不是一个人在写代码，协作优先。

在开发中，如果你接触过复杂性数据结构，并且还要在模块中不断进行数据转化，你就会不断的遇到：我的数据呢？到底在那一步丢失了？并且即使是代码对的，你仍旧害怕，仍旧怀疑。我已经过了那个“写 bug 是因为想的不够多，不够彻底”的年龄。

### 函数式思维

js 是有函数式的血统的，当年一直听说，函数是一等公民，只是当时完全不能理解。

纯函数，数据不可变以及代码即数据这三点是我认为是函数式思维对代码能力提升最大的三点。

这个我不想展开去聊，因为我没有熟练掌握过任何一门纯函数式语言。但是我的代码一定有函数式的影子，并且它的确让我的代码更优美。

### 其他

单元测试，代码审查，安全等等都没有讲到，这个我也需要足够的学习才能有所输出。不过这里列出一些资料供大家学习与了解:

[谷歌代码审查指南](https://jimmysong.io/eng-practices/docs/review/)

[SaaS 型初创企业安全 101](https://github.com/forter/security-101-for-saas-startups/blob/chinese/readme.md)

## 有理有据就是好代码

工作在别人遗留的糟糕代码上是常有的事情，同时面对开发需求实际表，为了兼容，我们也不得不写出一些不那么好的代码。但是面对他人的疑问，我们需要给与别人这样做的理由，也就是你的每一行代码写下去一定有充分的理由和依据。

## 结语

明显不等于简单，上述都是很明显的事情，但是要做好都需要很长时间的学习与经验。

所以如何才能写好代码呢？那就是多看开源代码，多读书，多学习，多关注业界的动向与实践。不断学习，不断进化的代码才是好代码。

最近有一些小伙伴(无中生友)问我的名字为什么要叫 jump_jump。我是为了让自己以及看到我的小伙伴们牢记多锻炼，闲下来的时候多跳一跳。对身体有好处。
