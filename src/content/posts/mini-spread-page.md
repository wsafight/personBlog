---
title: 小程序跨页面交互的作用与方法
published: 2020-01-07
description: 介绍了小程序开发中跨页面交互的多种技巧，包括利用 Promise 缓存优化页面跳转加载体验、使用全局事件总线通信等方法，解决 B 端小程序开发的复杂交互问题。
tags: [小程序]
category: 移动开发
draft: false
---

去年年末，微信小程序的分包大小已经到达了 12M 大小,一方面说明小程序的确逐步为开发者放开更大的权限，另一方面也说明了对于某些小程序 8M 的大小已经不够用了。我个人今年也是在开发一个 to B 小程序应用。这里列举一些跨页面交互的场景。

对于 B 端应用的业务需求来说，小程序开发的复杂度相对比网页开发要复杂一些。一个是双线程的处理机制问题，另一个是页面栈之间交互问题。

注: 笔者目前只需要开发微信小程序，为了在小程序页面中可以使用 properties  behaviors observers 等新功能，已经使用 Component 构造器来构造页面。具体可以参考[微信小程序 Component 构造器](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/component.html)。如果你也没有多端开发的需求，建议尝试使用，可以得到不错的体验。

## 性能优化类

对于小程序在页面中点击触发 wx.navigateTo 跳转其他页面，中间会有一段时间的空白加载期(对于分包出去的页面，空白期则会更长)，但是这是小程序内部机制，没有办法进行优化。我们只能眼睁睁的等待这段没有意思的空白期过去。

当考虑到跳转页面后的第一件事情便是取数逻辑，那么我们是否能够进行优化呢？答案是肯定的。我们没有办法直接在当前页面取得数据之后再进行跳转操作(这样操作更不好)，但是我们却可以利用缓存当前的请求，详情可以参考我之前的博客文章 ——[Promise对象 3 种妙用](https://github.com/wsafight/personBlog/issues/13)。

代码如下:

```js
const promiseCache = new Map()

export function setCachePromise(key, promise) {
  promiseCache.set(key, promise)
}

export function getCachePromise(key) {
  // 根据key获取当前的数据  
  const promise = promiseCache.get(key)
  // 用完删除，目前只做中转用途，也可以添加其他用途
  promiseCache.delete(key)
  return promise  
}
```

做一份全局的 Map,然后利用 Map 缓存 promise 对象，在跳转之前代码为:

```js
// 导入 setCachePromise 函数

Component({
  methods: {
    getBookData(id) {
      const promise = // promise 请求
        setCachePromise(`xxx:${id}`, promise)      
    },  
    handleBookDetailShow(e) {
      const id = e.detail
      this.getBookData(id)
       wx.navigateTo({url: `xx/xx/x?id=${id}`})
    }
  }
})
```

而跳转之后的代码也如下所示:

```js
// 导入 getCachePromise 函数

Component({
    properties: {
      id: Number  
    },
    lifetimes: {
      attached () {
        const id = this.data.id  
        // 取得全局缓存的promise
        const bookPromise = getCachePromise(`xxx:${id}`)
        bookPromise.then((res) => {
          // 业务处理
        }).catch(error => {
          // 错误处理  
        })
      }
    },
    methods: {
      getBook() {
        // 获取数据，以便于 错误处理 上拉刷新 等操作  
      }  
    }
})
```

如此便可以同时处理取数和页面加载的逻辑，当然，这个对于页面有耦合性，不利于后续的删除与修改。但考虑如果仅仅加在分包跳转之间可能会有不错的效果。

想要无侵入式，可以进一步学习研究 [微信小程序之提高应用速度小技巧](https://wetest.qq.com/lab/view/294.html?from=content_qcloud) 以及 [wxpage](https://github.com/tvfe/wxpage) 框架，同时考虑到无论是 ToC 还是 ToC 用户，都有可能存在硬件以及网络环境等问题，该优化还是非常值得的。

当然微信小程序为了减少冷启动时间，提供了[周期性更新](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/background-fetch.html) [数据预拉取](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/pre-fetch.html) 功能。

注: 上面的 promiseCache 只作为中转的用途，不作为缓存的用途，如果你考虑添加缓存，可以参考我之前的博客文章—— [前端 api 请求缓存方案](https://github.com/wsafight/personBlog/issues/2)。

## 通知类

如果是 pc 端中进行交互，对于数据的 CRUD。例如在详情页面进行了数据的修改和删除，返回列表时候就直接调取之前存储的列表查询条件再次查询即可，而对于移动端这种下拉滚动的设计，就没有办法直接调用之前的查询条件来进行搜索。

如果从列表页面进入详情页面后，在详情页面只会进行添加或者修改操作。然后返回列表页面。此时可以提示用户数据已经进行了修改，请用户自行决定是否进行刷新操作。

如在编辑页面修改了数据:

```js
const app = getApp()

component({
  methods: {
    async handleSave() {
      //...
      app.globalData.xxxChanged = true
      //...  
    }
  }
})
```

列表界面:

```js
const app = getApp()

component({
  pageLifetimes: {
    show() {
      this.confirmThenRefresh()
    }    
  },
  methods: {
    confirmThenRefresh() {
      // 检查 globalData，如果当前没有进行修改，直接返回 
      if(!app.globalData.xxxChanged) return
      wx.showModal({
        // ...
        complete: () => {
          // 无论确认刷新与否，都把数据置为 false 
          app.globalData.xxxChanged = false  
        }  
      })  
    }
  }  
})
```

当然了，我们也可以利用 wx.setStorage 或者 getCurrentPage 获取前面的页面 setData 来进行数据通知,以便用户进行页面刷新。

## 订阅发布类

如果仅仅只涉及到修改数据的前提下，我们可以选择让用户进行刷新操作，但是如果针对于删除操作而言，如果用户选择不进行刷新，然后用户又不小心点击到了已经被删除的数据，就会发生错误。所以如果有删除的需求，我们最好在返回列表页面前就进行列表的修改，以免造成错误。

###  mitt

github 上有很多的 pub/sub 开源库，如果没有什么特定的需求，找到代码量最少的就是 [mitt](https://github.com/developit/mitt) 这个库了,作者是喜欢开发微型库的 [developit](https://github.com/developit) 大佬,著名的 [preact](https://preactjs.com/) 也是出于这位大佬之手。 这里就不做过多的介绍，非常简单。大家可能都能看明白，代码如下(除去 flow 工具的检查):

```js
export default function mitt(all) {
  all = all || Object.create(null);

  return {
    on(type, handler) {
      (all[type] || (all[type] = [])).push(handler);
    },

    off(type, handler) {
      if (all[type]) {
        all[type].splice(all[type].indexOf(handler) >>> 0, 1);
      }
    },
    emit(type, evt) {
      (all[type] || []).slice().map((handler) => { handler(evt); });
      (all['*'] || []).slice().map((handler) => { handler(type, evt); });
    }
  };
}
```

仅仅只有3个方法，on emit以及 off。

只要在多个页面导入 生成的 mitt() 函数生成的对象即可(或者直接放入 app.globalData 中也可)。

```js
Component({
  lifetimes: {
    attached: function() {
      // 页面创建时执行
      const changeData = (type, data) => {
        // 处理传递过来的类型与数据
      }
      this._changed = changeData
      bus.on('xxxchanged', this._changed)
    },
    detached: function() {
      // 页面销毁时执行
      bus.off('xxxchanged', this._changed)
    }
  }
})
```

这里mitt可以有多个页面进行绑定事件，如果需求仅仅只涉及到两个页面之间，我们就可以使用 wx.navigateTo 中的 EventChannel (页面间事件信息通道)。可以参考[微信小程序wx.navigateTo方法里的events参数使用详情及场景](https://blog.csdn.net/gongyan12345/article/details/99679847),该方案的利好在于，传递到下一个页面的参数也可以通过 EventChannel  来通知，以便于解决 properties  传递数据不宜过大的问题。

注: 一个页面展示很多信息的时候，会造成小程序页面的卡顿以及白屏。小程序官方也有长列表组件 [recycle-view](https://developers.weixin.qq.com/miniprogram/dev/extended/component-plus/recycle-view.html)。有需求的情况下可以自行研究，这个不在这里详述。

## 参考文档

[微信小程序 Component 构造器](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/component.html)

[微信小程序之提高应用速度小技巧](https://wetest.qq.com/lab/view/294.html?from=content_qcloud)

[wxpage](https://github.com/tvfe/wxpage) 

[mitt](https://github.com/developit/mitt) 

[Promise对象 3 种妙用](https://github.com/wsafight/personBlog/issues/13)

[前端 api 请求缓存方案](https://github.com/wsafight/personBlog/issues/2)

