---
title: 前端 api 请求缓存方案 
published: 2019-04-21
description: 利用各种数据缓存的方案，让你的前端应用程序性能更上一层楼
tags: [缓存, 性能优化]
category: 性能优化
draft: false
---

在开发 web 应用程序时，性能都是必不可少的话题。对于webpack打包的单页面应用程序而言，我们可以采用很多方式来对性能进行优化，比方说 tree-shaking、模块懒加载、利用 extrens 网络cdn 加速这些常规的优化。甚至在vue-cli 项目中我们可以使用 --modern 指令生成新旧两份浏览器代码来对程序进行优化。   

而事实上，缓存一定是提升web应用程序有效方法之一，尤其是用户受限于网速的情况下。提升系统的响应能力，降低网络的消耗。当然，内容越接近于用户，则缓存的速度就会越快，缓存的有效性则会越高。   

以客户端而言，我们有很多缓存数据与资源的方法，例如 标准的浏览器缓存 以及 目前火热的 Service worker。但是，他们更适合静态内容的缓存。例如 html，js，css以及图片等文件。而缓存系统数据，我采用另外的方案。   

那我现在就对我应用到项目中的各种 api 请求缓存方案，从简单到复杂依次介绍一下。

## 方案一 数据缓存
简单的 数据 缓存，第一次请求时候获取数据，之后便使用数据，不再请求后端api。  
代码如下：
```
const dataCache = new Map()

async getWares() {
    let key = 'wares'
    // 从data 缓存中获取 数据
    let data = dataCache.get(key)
    if (!data) {
        // 没有数据请求服务器
        const res = await request.get('/getWares')
        
        // 其他操作
        ...
        data = ...

        // 设置数据缓存
        dataCache.set(key, data)

    }
    return data
} 
```
第一行代码 使用了 es6以上的 Map，如果对map不是很理解的情况下，你可以参考
[ECMAScript 6 入门 Set 和 Map](https://es6.ruanyifeng.com/#docs/set-map) 或者 [Exploring ES6](http://exploringjs.com/es6/ch_maps-sets.html) 关于 map 和 set的介绍，此处可以理解为一个键值对存储结构。

之后 代码 使用 了 async 函数，可以将异步操作变得更为方便。 你可以参考[ECMAScript 6 入门 async函数](https://es6.ruanyifeng.com/#docs/async)来进行学习或者巩固知识。  


代码本身很容易理解，是利用 Map 对象对数据进行缓存，之后调用从 Map 对象来取数据。对于及其简单的业务场景，直接利用此代码即可。   

调用方式：
```
getWares().then( ... )
// 第二次调用 取得先前的data
getWares().then( ... )
```  


## 方案二 promise缓存
方案一本身是不足的。因为如果考虑同时两个以上的调用此 api，会因为请求未返回而进行第二次请求api。当然，如果你在系统中添加类似于 vuex、redux这样的单一数据源框架，这样的问题不太会遇到，但是有时候我们想在各个复杂组件分别调用api，而不想对组件进行组件通信数据时候，便会遇到此场景。
```
const promiseCache = new Map()

getWares() {
    const key = 'wares'
    let promise = promiseCache.get(key);
    // 当前promise缓存中没有 该promise
    if (!promise) {
        promise = request.get('/getWares').then(res => {
            // 对res 进行操作
            ...
        }).catch(error => {
            // 在请求回来后，如果出现问题，把promise从cache中删除 以避免第二次请求继续出错S
            promiseCache.delete(key)
            return Promise.reject(error)
        })
    }
    // 返回promise
    return promise
}
```
该代码避免了方案一的同一时间多次请求的问题。同时也在后端出错的情况下对promise进行了删除，不会出现缓存了错误的promise就一直出错的问题。   

调用方式:
```
getWares().then( ... )
// 第二次调用 取得先前的promise
getWares().then( ... )
```   

## 方案三 多promise 缓存
该方案是同时需要 一个以上 的api请求的情况下，对数据同时返回，如果某一个api发生错误的情况下。均不返回正确数据。
```
const querys ={
    wares: 'getWares',
    skus: 'getSku'
}
const promiseCache = new Map()

async queryAll(queryApiName) {
    // 判断传入的数据是否是数组
    const queryIsArray = Array.isArray(queryApiName)
    // 统一化处理数据，无论是字符串还是数组均视为数组
    const apis = queryIsArray ? queryApiName : [queryApiName]
    
    // 获取所有的 请求服务
    const promiseApi = []

    apis.forEach(api => {
        // 利用promise 
        let promise = promiseCache.get(api)

        if (promise) {
            // 如果 缓存中有，直接push
            promiseApi.push(promise)
        } else {
             promise = request.get(querys[api]).then(res => {
                // 对res 进行操作
                ...
                }).catch(error => {
                // 在请求回来后，如果出现问题，把promise从cache中删除
                promiseCache.delete(api)
                return Promise.reject(error)
            })
            promiseCache.set(api, promise)
            promiseApi.push(promise)
        }
    })
    return Promise.all(promiseApi).then(res => {
        // 根据传入的 是字符串还是数组来返回数据，因为本身都是数组操作
        // 如果传入的是字符串，则需要取出操作
        return queryIsArray ? res : res[0]
    })
}

```
该方案是同时获取多个服务器数据的方式。可以同时获得多个数据进行操作，不会因为单个数据出现问题而发生错误。   

调用方式
```
queryAll('wares').then( ... )
// 第二次调用 不会去取 wares，只会去skus
queryAll(['wares', 'skus']).then( ... )
```


## 方案四 添加时间有关的缓存
往往缓存是有危害的，如果我们在知道修改了数据的情况下，直接把 cache 删除即可，此时我们调用方法就可以向服务器进行请求。这样我们规避了前端显示旧的的数据。但是我们可能一段时间没有对数据进行操作，那么此时旧的数据就一直存在，那么我们最好规定个时间来去除数据。    
该方案是采用了 类 持久化数据来做数据缓存，同时添加了过期时长数据以及参数化。    
代码如下：
首先定义持久化类,该类可以存储 promise 或者 data
```
class ItemCache() {
    construct(data, timeout) {
        this.data = data
        // 设定超时时间，设定为多少秒
        this.timeout = timeout
        // 创建对象时候的时间，大约设定为数据获得的时间
        this.cacheTime = (new Date()).getTime()
    }
}
```

然后我们定义该数据缓存。我们采用Map 基本相同的api
```js
class ExpiredCache {
    // 定义静态数据map来作为缓存池
    static cacheMap =  new Map()

    // 数据是否超时
    static isOverTime(name) {
        const data = ExpiredCache.cacheMap.get(name)

        // 没有数据 一定超时
        if (!data) return true

        // 获取系统当前时间戳
        const currentTime = (new Date()).getTime()

        // 获取当前时间与存储时间的过去的秒数
        const overTime = (currentTime - data.cacheTime) / 1000

        // 如果过去的秒数大于当前的超时时间，也返回null让其去服务端取数据
        if (Math.abs(overTime) > data.timeout) {
            // 此代码可以没有，不会出现问题，但是如果有此代码，再次进入该方法就可以减少判断。
            ExpiredCache.cacheMap.delete(name)
            return true
        }

        // 不超时
        return false
    }

    // 当前data在 cache 中是否超时
    static has(name) {
        return !ExpiredCache.isOverTime(name)
    }

    // 删除 cache 中的 data
    static delete(name) {
        return ExpiredCache.cacheMap.delete(name)
    }

    // 获取
    static get(name) {
        const isDataOverTime = ExpiredCache.isOverTime(name)
        //如果 数据超时，返回null，但是没有超时，返回数据，而不是 ItemCache 对象
        return isDataOverTime ? null : ExpiredCache.cacheMap.get(name).data
    }

    // 默认存储20分钟
    static set(name, data, timeout = 1200) {
        // 设置 itemCache
        const itemCache = new ItemCache(data, timeout)
        //缓存
        ExpiredCache.cacheMap.set(name, itemCache)
    }
}
```

此时数据类以及操作类 都已经定义好,我们可以在api层这样定义
```
// 生成key值错误
const generateKeyError = new Error("Can't generate key from name and argument")

// 生成key值
function generateKey(name, argument) {
    // 从arguments 中取得数据然后变为数组
    const params = Array.from(argument).join(',')
    
    try{
        // 返回 字符串，函数名 + 函数参数
        return `${name}:${params}`
    }catch(_) {
        // 返回生成key错误
        return generateKeyError
    }
}

async getWare(params1, params2) {
    // 生成key
    const key = generateKey('getWare', [params1, params2]) 
    // 获得数据
    let data = ExpiredCache.get(key)
    if (!data) {
        const res = await request('/getWares', {params1, params2})
        // 使用 10s 缓存，10s之后再次get就会 获取null 而从服务端继续请求
        ExpiredCache.set(key, res, 10)
    }
    return data
}
```
该方案使用了 过期时间 和 api 参数不同而进行 缓存的方式。已经可以满足绝大部分的业务场景。

调用方式
```
getWares(1,2).then( ... )
// 第二次调用 取得先前的promise
getWares(1,2).then( ... )
// 不同的参数，不取先前promise
getWares(1,3).then( ... )
```   

## 方案五 基于修饰器的方案四
和方案四是的解法一致的，但是是基于修饰器来做。
代码如下：
```
// 生成key值错误
const generateKeyError = new Error("Can't generate key from name and argument")

// 生成key值
function generateKey(name, argument) {
    // 从arguments 中取得数据然后变为数组
    const params = Array.from(argument).join(',')
    try{
        // 返回 字符串
        return `${name}:${params}`
    }catch(_) {
        return generateKeyError
    }
}

function decorate(handleDescription, entryArgs) {
    // 判断 当前 最后数据是否是descriptor，如果是descriptor,直接 使用
    // 例如 log 这样的修饰器
    if (isDescriptor(entryArgs[entryArgs.length - 1])) {
        return handleDescription(...entryArgs, [])
    } else {
        // 如果不是
        // 例如 add(1) plus(20) 这样的修饰器
        return function() {
            return handleDescription(...Array.protptype.slice.call(arguments), entryArgs)
        }
    }
}

function handleApiCache(target, name, descriptor, ...config) {
    // 拿到函数体并保存
    const fn = descriptor.value
    // 修改函数体
    descriptor.value = function () { 
        const key =  generateKey(name, arguments)
        // key无法生成，直接请求 服务端数据
        if (key === generateKeyError)  {
            // 利用刚才保存的函数体进行请求
            return fn.apply(null, arguments)
        }
        let promise = ExpiredCache.get(key)
        if (!promise) {
            // 设定promise
            promise = fn.apply(null, arguments).catch(error => {
                 // 在请求回来后，如果出现问题，把promise从cache中删除
                ExpiredCache.delete(key)
                // 返回错误
                return Promise.reject(error)
            })
            // 使用 10s 缓存，10s之后再次get就会 获取null 而从服务端继续请求
            ExpiredCache.set(key, promise, config[0])
        }
        return promise 
    }
    return descriptor;
}

// 制定 修饰器
function ApiCache(...args) {
    return decorate(handleApiCache, args)
}
```

此时 我们就会使用 类来对api进行缓存
```
class Api {
    // 缓存10s
    @ApiCache(10)
    // 此时不要使用默认值，因为当前 修饰器 取不到
    getWare(params1, params2) {
        return request.get('/getWares')
    }
}
```
因为函数存在函数提升，所以没有办法利用函数来做 修饰器  
例如:

```
var counter = 0;

var add = function () {
  counter++;
};

@add
function foo() {
}
```

该代码意图是执行后counter等于 1，但是实际上结果是counter等于 0。因为函数提升，使得实际执行的代码是下面这样
```
@add
function foo() {
}

var counter;
var add;

counter = 0;

add = function () {
  counter++;
};
```
所以没有 办法在函数上用修饰器。具体参考[ECMAScript 6 入门 Decorator](https://es6.ruanyifeng.com/#docs/decorator)  
此方式写法简单且对业务层没有太多影响。但是不可以动态修改 缓存时间

调用方式
```
getWares(1,2).then( ... )
// 第二次调用 取得先前的promise
getWares(1,2).then( ... )
// 不同的参数，不取先前promise
getWares(1,3).then( ... )
```   

## 总结
api的缓存机制与场景在这里也基本上介绍了，基本上能够完成绝大多数的数据业务缓存，在这里我也想请教教大家，有没有什么更好的解决方案，或者这篇博客中有什么不对的地方，欢迎指正，在这里感谢各位了。   
同时这里也有很多没有做完的工作，可能会在后面的博客中继续完善。
