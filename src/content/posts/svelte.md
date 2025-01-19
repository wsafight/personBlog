---
title: 谈谈魔法消失UI框架 Svelte
published: 2020-01-04
description: 探讨了 Svelte 这个编译型前端组件框架，分析了它与其他框架的不同之处，如减少应用代码量、按需提供功能、提升性能等，并通过代码示例展示了其编译后的原生JS操作DOM的方式。
tags: [前端框架]
category: 前端框架
draft: false
---

最近基于公司业务需求，可能会要开发一款浏览器插件，调查后发现插件UI开发本质上就是开发页面。于是我便开始寻找一个非常小又非常快的新玩具(工具)。毕竟前端 3 大框架无论哪一个去开发浏览器插件都无异于大炮打蚊子。至于开发效率极低的 Dom 操作我也不想去碰了。于是我就找到了这个已经在国外非常火热的魔法消失 UI 框架 —— [Svelte](https://svelte.dev/)。

### Svelte是什么

[Svelte](https://svelte.dev/) 是一个编译型的前端组件框架。该框架没有使用虚拟 dom，而是通过编译在应用状态发生改变时提供异步响应。

## 编译型框架

任何前端框架都是有运行时的，(以 Vue 为例) 该框架至少需要在浏览器携带虚拟dom 以及 diff 算法。如果在页面中直接引入 Vue 脚本，还需要追加 Vue 前端编译器代码。可以参考[Vue 对不同构建版本的解释](https://cn.vuejs.org/v2/guide/installation.html#对不同构建版本的解释)。

Svelte 则不同，它从开始就决定把其他框架在浏览器所完成的大部分工作转换到构建中的编译步骤,以便于减少应用代码量。它通过静态分析来做到按需提供功能(完全不需要引入)，同时它也可以分析得出根据你当前的修改精准更新 dom的代码来提升性能。

我们以最简单的代码为例子。

```svelte
// App.svelte
<h1>Hello world!</h1>

// main.js
import App from './App.svelte';

const app = new App({
	target: document.body
});

export default app;
```

实际上开发版会被编译为(为了简化，只分析部分,不分析全部代码)

```js
// IIFE 立即执行函数表达式
var app = (function () {
  'use strict';
  // 空函数，用于某些需要提供函数的代码
  function noop() { }  
  // 当前 元素所在的行 列 前面有多少字符等信息，开发版存在
  function add_location(element, 
                        file, 
                        line, 
                        column, 
                        char) {
    element.__svelte_meta = {
      loc: { file, line, column, char }
     };
  }
  //   
  // 操作dom辅助函数,减少代码量...(相当于运行时)  
  function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
  }
  function detach(node) {
    node.parentNode.removeChild(node);
  }
  function element(name) {
    return document.createElement(name);
  }
  function children(element) {
    return Array.from(element.childNodes);
  }
  // 异步处理修改过的组件
  // (实际上这些代码在当前场景下不需要，可以去除，但没必要）
  const dirty_components = [];
  const binding_callbacks = [];
  const render_callbacks = [];
  const flush_callbacks = [];
  const resolved_promise = Promise.resolve();
  let update_scheduled = false;
  function schedule_update() {
    // ... 
  }
  function add_render_callback(fn) {
    // ...    
  }
  function flush() {
   // ...  
  }
  function update($$) {
  }
 
  // 当前文件，开发版
  const file = "src\\App.svelte";
  
  function create_fragment(ctx) {
    let h1;

    const block = {
      // 创建  
      c: function create() {
    	h1 = element("h1");
    	h1.textContent = "Hello world!";
    	add_location(h1, file, 1, 9, 10);
      },
      // 挂载刚才创建的元素
      m: function mount(target, anchor) {
        // 上面的 target 是 document.body  
    	insert_dev(target, h1, anchor);
      },
      // 修改，脏组件在上述 update 中被调用 
      p: noop,
      // 删除  
      d: function destroy(detaching) {
    	if (detaching) detach_dev(h1);
      }
    };

    dispatch_dev("SvelteRegisterBlock", {
      block,
      id: create_fragment.name,
      type: "component",
    	source: "",
    	ctx
    });
    return block;
  }  
}());
```

可以看到，在开发版本编译完成后，你所写的所有代码都变成了原生的 js 操作Dom。同时具有很高的可读性(这点非常重要)。我在我的另一篇 blog [优化 web 应用程序性能方案总结](https://segmentfault.com/a/1190000020672868) 也表明了，提升代码的覆盖率是所有优化机制中收益是最高的。这意味着可以加载更少的代码，执行更少的代码，消耗更少的资源,缓存更少的资源。同时在 Vue 3 中也会又静态分析而进行的按需提供优化。

值得一提的是，因为 Svelte 是编译型框架，无论是开发还是生产环境，都会在相同文件夹诞生同样的文件(至少在笔者开始写时候是这样的结果，于2020-1-4)。如果前端没有使用构建部署工具又或者像我这样仅仅想要开发一个浏览器插件的情况下，可能会造成因为文件夹已经存在而忘记进行构建命令,从而错误的使用开发版所产生的代码。

同时，Svelte  直接支持各种编译配置项目。只要在组件中添加 options 即可:

```html
<svelte:options option={value}/>
```

- immmutable 当你确认了当前已经使用不可变数据结构，编译器会执行简单的引用相等(而不是对象属性)来确定值是否更改，以便获得更高的性能优化，默认为 false。当此选项设置为true时，如果父组件修改了子组件的对象属性，则子组件将不会检测到更改并且也不会重新渲染。

  ```html
  <svelte:options immmutable={true}/>
  ```

- tag 可以将手写的组件编译成 Web Components 而让其他框架使用。根据如下就可以使用。至于 Web Components 则可以参考阮一峰的 [Web Components 入门实例教程](http://www.ruanyifeng.com/blog/2019/08/web_components.html)。这也是新框架不可或缺的功能点。

  ```html
  <svelte:options tag="my-custom-element"/>
  ```

- accessors 可以为组件的 props 添加 getter 和 setter，默认为false。

- namespace 是将要使用该组件的命名空间，一种用途是为 SVG 指定命名空间。

> 当一门语言的能力不足，而用户的运行环境又不支持其它选择的时候，这门语言就会沦为 “编译目标” 语言

几年前的 js 便是这样的语言,当时有表现力更强的 coffeeScript,也有限制性更强的 Typescript。随着时间的推移,前端的想要编译的不再局限于编程语言层面上,而在框架层面也想做的更多。

自从 2018 年末，前端框架更多的往编译型发展 。一种是为了更强大的表现能力和性能增益,如同 Svelte 一般, 另一种则是为了抹平多个平台的差距, 例如 国内的各个小程序框架 [Taro](https://taro.aotu.io/)(React 系，适合新项目), [Mpx](https://didi.github.io/mpx/)(微信小程序,适合老项目)等。

## 更高的表现力

对比同类型的 [Elm](https://elm-lang.org/) [Imba](https://www.imba.io/) 以及 [ClojureScript](https://github.com/clojure/clojurescript) 这些编译型框架，无论是工具链还是语法表现力, Svelte 的对于前端小伙伴们友好度是最高的。如果想要学习 Svelte,可以去看官网提供的 [tutorial 模块](https://svelte.dev/tutorial/basics),Svelte 官网对于新手的友好度也是非常棒的。下面则介绍一些特定的语法。

### 状态与双向数据绑定

利用 let 可以设置状态,利用bind:value可以进行数据绑定。

```svelte
<script>
  // 直接使用 数据
  let name = 'world';
  // 配置项,可以直接传入 input
  const inputAttrs = {
    // input 类型为 text  
    type: 'text',
    // 最大长度
    maxlength: 10
  };
</script>

<!-- 名字, 同时传递属性可以利用 ...语法来进行优化 -->
<input {...inputAttrs} bind:value={name} />
<hr/>
Hello {name} 
```

可以看到, 上述代码很容易进行了双向数据绑定,以及非常强大的代码表现能力。

### 属性的使用

父组件:

```svelte
	
<script>
  import Hello from './Hello.svelte';
</script>
 
<Hello name="Mark" />
```

Hello 组件:

```
	
<script>
  // 这样便是可以被外部接受,但是name也可以被内部修改
  export let name = 'World';
  // 计算属性,name 修改了,doubleName 发生改变
  $: doubleName = name + name
</script>
 
<div>
  Hello, {name}!
</div>
<hr/>
{doubleName}
```

### 同组件直接的交互

这个功能就是最吸引我的地方,我用过很多组件框架。但对于同组件之间的交互都是要写到父组件中作为业务类型组件。例如地址之间的交互(默认地址),复杂表单之间的交互,  代码如下所示:

Input 组件

```svelte
<!-- 模块 -->
<script context="module">
    // 组件全局 Map
    const map = new Map();
    
    // 清楚所有的输入数据,导出函数
    export function clearAll() {
		map.forEach(clearfun => {
			clearfun()
		});
	}
</script>

<script>
	import { onMount } from 'svelte';
	// 记录的标签
    export let index;
    let value = ''

    // 挂载时候把当前组件的标签和函数放入map
	onMount(() => {
		map.set(index, clear);
	});

    // 把当前 input 元素的数值清空
	function clear  ()  {
        value = ''
    }

    // 输入时候把其他的数据清除
    function clearOthers() {
		map.forEach((clearfun, key) => {
			if (key !== index) clearfun();
		});
	}
</script>


<div>
<button on:click={clear}>清楚当前输入数据</button>
 <input on:input={clearOthers} type="text" bind:value={value}>
 {value}
</div>
```

App 组件:

```svelte
<script>
	import Input, { clearAll } from './Input.svelte'
</script>
<div>
  // 可以清楚子组件输入的全部数据
  <button on:click={clearAll}>清楚全部数据</button>
  <Input index='1'/>
  <Input index='2'/>
  <Input index='3'/>
  <Input index='4'/>
  <Input index='5'/>
</div>
```

如此,同组件内之间的交互便完成了,非常的简单,但是又是因为 module 全局性的,无论是否在同一父组件内,所有的子组件都会有全局的功能。如果有两个以上的模块在同一页面中,又需要添加多余的属性来为辅助开发。所以这个功能是一把可能会伤到自己的利器。

### 其他

Svelte 有许多简单好用的语法以及动画,这里就不一一介绍了。因为实在是太简单了,如果你使用过其他类型的框架,可能不到几小时就可以上手写业务代码了。当然,如果在开发插件过程中遇到一些不可避免的问题,我也会记录下来再写一篇 blog 。

## 无可避免的缺点

Svelte 已经开发到 3.0 版本后了,大致上来看,一些开发上的问题可能没有,但是毕竟没有大公司支持,所以可能还是会有一些不可避免的缺陷。

- 不支持 TypeScript

- 生态环境不够好

- 单组件文件后缀名为 svelte,过于冗长

- 暂时没有构建工具

- if 判断 for 循环 不好用(为了编译)

  ```svelte
  
  {#if user.loggedIn}
  	<button on:click={toggle}>
  		Log out
  	</button>
  {/if}
  
  {#if !user.loggedIn}
  	<button on:click={toggle}>
  		Log in
  	</button>
  {/if}
  
  {#each cats as { id, name }, i}
    <li>
      <a target="_blank" href="https://www.youtube.com/watch?v={id}">
  	  {i + 1}: {name}
  	</a>
    </li>
  {/each}
  ```

## 参考文档

[Svelte 官网](https://svelte.dev/)