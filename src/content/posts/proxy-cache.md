---
title: 手写一个基于 Proxy 的缓存库
published: 2021-02-17
description: 探讨了如何使用Proxy来创建一个高效的缓存库。通过 Proxy 的拦截机制，可以实现对对象属性的访问控制和缓存管理，从而提高代码的性能和可维护性。
tags: [缓存, 性能优化]
category: 性能优化
draft: false
---
两年前，我写了一篇关于业务缓存的博客 [前端 api 请求缓存方案](../api-cache/),  这篇博客反响还不错，其中介绍了如何缓存数据，Promise 以及如何超时删除（也包括如何构建修饰器）。如果对此不够了解，可以阅读博客进行学习。

但之前的代码和方案终归还是简单了些，而且对业务有很大的侵入性。这样不好，于是笔者开始重新学习与思考代理器 Proxy。

Proxy 可以理解成，在目标对象之前架设一层“拦截”，外界对该对象的访问，都必须先通过这层拦截，因此提供了一种机制，可以对外界的访问进行过滤和改写。Proxy 这个词的原意是代理，用在这里表示由它来“代理”某些操作，可以译为“代理器”。关于 Proxy 的介绍与使用，建议大家还是看阮一峰大神的 [ECMAScript 6 入门 代理篇](https://es6.ruanyifeng.com/#docs/proxy)。

## 项目演进

任何项目都不是一触而就的，下面是关于 Proxy 缓存库的编写思路。希望能对大家有一些帮助。

### proxy handler 添加缓存

当然，其实代理器中的 handler 参数也是一个对象，那么既然是对象，当然可以添加数据项，如此，我们便可以基于 Map 缓存编写 memoize 函数用来提升算法递归性能。

```ts
type TargetFun<V> = (...args: any[]) => V

function memoize<V>(fn: TargetFun<V>) {
  return new Proxy(fn, {
    // 此处目前只能略过 或者 添加一个中间层集成 Proxy 和 对象。
    // 在对象中添加 cache
    // @ts-ignore
    cache: new Map<string, V>(),
    apply(target, thisArg, argsList) {
      // 获取当前的 cache
      const currentCache = (this as any).cache
      
      // 根据数据参数直接生成 Map 的 key
      let cacheKey = argsList.toString();
      
      // 当前没有被缓存，执行调用，添加缓存
      if (!currentCache.has(cacheKey)) {
        currentCache.set(cacheKey, target.apply(thisArg, argsList));
      }
      
      // 返回被缓存的数据
      return currentCache.get(cacheKey);
    }
  });
}
  
```

我们可以尝试 memoize fibonacci 函数，经过了代理器的函数有非常大的性能提升（肉眼可见）：

```ts
const fibonacci = (n: number): number => (n <= 1 ? 1 : fibonacci(n - 1) + fibonacci(n - 2));
const memoizedFibonacci = memoize<number>(fibonacci);

for (let i = 0; i < 100; i++) fibonacci(30); // ~5000ms
for (let i = 0; i < 100; i++) memoizedFibonacci(30); // ~50ms
```

### 自定义函数参数

我们仍旧可以利用之前博客介绍的的函数生成唯一值，只不过我们不再需要函数名了：

```ts
const generateKeyError = new Error("Can't generate key from function argument")

// 基于函数参数生成唯一值
export default function generateKey(argument: any[]): string {
  try{
    return `${Array.from(argument).join(',')}`
  }catch(_) {
    throw generateKeyError
  }
}
```

虽然库本身可以基于函数参数提供唯一值，但是针对形形色色的不同业务来说，这肯定是不够用的，需要提供用户可以自定义参数序列化。

```ts
// 如果配置中有 normalizer 函数，直接使用，否则使用默认函数
const normalizer = options?.normalizer ?? generateKey

return new Proxy<any>(fn, {
  // @ts-ignore
  cache,
  apply(target, thisArg, argsList: any[]) {
    const cache: Map<string, any> = (this as any).cache
    
    // 根据格式化函数生成唯一数值
    const cacheKey: string = normalizer(argsList);
    
    if (!cache.has(cacheKey))
      cache.set(cacheKey, target.apply(thisArg, argsList));
    return cache.get(cacheKey);
  }
});
```

### 添加 Promise 缓存

在之前的博客中，提到缓存数据的弊端。同一时刻多次调用，会因为请求未返回而进行多次请求。所以我们也需要添加关于 Promise  的缓存。

```ts
if (!currentCache.has(cacheKey)){
  let result = target.apply(thisArg, argsList)
  
  // 如果是 promise 则缓存 promise，简单判断！ 
  // 如果当前函数有 then 则是 Promise
  if (result?.then) {
    result = Promise.resolve(result).catch(error => {
      // 发生错误，删除当前 promise，否则会引发二次错误
      // 由于异步，所以当前 delete 调用一定在 set 之后，
      currentCache.delete(cacheKey)
    
      // 把错误衍生出去
      return Promise.reject(error)
    })
  }
  currentCache.set(cacheKey, result);
}
return currentCache.get(cacheKey);
```

此时，我们不但可以缓存数据，还可以缓存 Promise 数据请求。

### 添加过期删除功能

我们可以在数据中添加当前缓存时的时间戳，在生成数据时候添加。

```ts
// 缓存项
export default class ExpiredCacheItem<V> {
  data: V;
  cacheTime: number;

  constructor(data: V) {
    this.data = data
    // 添加系统时间戳
    this.cacheTime = (new Date()).getTime()
  }
}

// 编辑 Map 缓存中间层，判断是否过期
isOverTime(name: string) {
  const data = this.cacheMap.get(name)

  // 没有数据(因为当前保存的数据是 ExpiredCacheItem)，所以我们统一看成功超时
  if (!data) return true

  // 获取系统当前时间戳
  const currentTime = (new Date()).getTime()

  // 获取当前时间与存储时间的过去的秒数
  const overTime = currentTime - data.cacheTime

  // 如果过去的秒数大于当前的超时时间，也返回 null 让其去服务端取数据
  if (Math.abs(overTime) > this.timeout) {
    // 此代码可以没有，不会出现问题，但是如果有此代码，再次进入该方法就可以减少判断。
    this.cacheMap.delete(name)
    return true
  }

  // 不超时
  return false
}

// cache 函数有数据
has(name: string) {
  // 直接判断在 cache 中是否超时
  return !this.isOverTime(name)
}
```

到达这一步，我们可以做到之前博客所描述的所有功能。不过，如果到这里就结束的话，太不过瘾了。我们继续学习其他库的功能来优化我的功能库。

### 添加手动管理

通常来说，这些缓存库都会有手动管理的功能，所以这里我也提供了手动管理缓存以便业务管理。这里我们使用 Proxy get 方法来拦截属性读取。

```ts
 return new Proxy(fn, {
  // @ts-ignore
  cache,
  get: (target: TargetFun<V>, property: string) => {
    
    // 如果配置了手动管理
    if (options?.manual) {
      const manualTarget = getManualActionObjFormCache<V>(cache)
      
      // 如果当前调用的函数在当前对象中，直接调用，没有的话访问原对象
      // 即使当前函数有该属性或者方法也不考虑，谁让你配置了手动管理呢。
      if (property in manualTarget) {
        return manualTarget[property]
      }
    }
   
    // 当前没有配置手动管理，直接访问原对象
    return target[property]
  },
}


export default function getManualActionObjFormCache<V>(
  cache: MemoizeCache<V>
): CacheMap<string | object, V> {
  const manualTarget = Object.create(null)
  
  // 通过闭包添加 set get delete clear 等 cache 操作
  manualTarget.set = (key: string | object, val: V) => cache.set(key, val)
  manualTarget.get = (key: string | object) => cache.get(key)
  manualTarget.delete = (key: string | object) => cache.delete(key)
  manualTarget.clear = () => cache.clear!()
  
  return manualTarget
}
```

当前情况并不复杂，我们可以直接调用，复杂的情况下还是建议使用 [Reflect](https://es6.ruanyifeng.com/#docs/reflect) 。

### 添加 WeakMap 

我们在使用 cache 时候，我们同时也可以提供 WeakMap ( WeakMap 没有 clear 和 size 方法),这里我提取了 BaseCache 基类。

```ts
export default class BaseCache<V> {
  readonly weak: boolean;
  cacheMap: MemoizeCache<V>

  constructor(weak: boolean = false) {
    // 是否使用 weakMap
    this.weak = weak
    this.cacheMap = this.getMapOrWeakMapByOption()
  }

  // 根据配置获取 Map 或者 WeakMap
  getMapOrWeakMapByOption<T>(): Map<string, T> | WeakMap<object, T>  {
    return this.weak ? new WeakMap<object, T>() : new Map<string, T>()
  }
}
```

之后，我添加各种类型的缓存类都以此为基类。

### 添加清理函数

在缓存进行删除时候需要对值进行清理，需要用户提供 dispose 函数。该类继承 BaseCache 同时提供 dispose 调用。

```ts
export const defaultDispose: DisposeFun<any> = () => void 0

export default class BaseCacheWithDispose<V, WrapperV> extends BaseCache<WrapperV> {
  readonly weak: boolean
  readonly dispose: DisposeFun<V>

  constructor(weak: boolean = false, dispose: DisposeFun<V> = defaultDispose) {
    super(weak)
    this.weak = weak
    this.dispose = dispose
  }

  // 清理单个值(调用 delete 前调用)
  disposeValue(value: V | undefined): void {
    if (value) {
      this.dispose(value)
    }
  }

  // 清理所有值(调用 clear 方法前调用，如果当前 Map 具有迭代器)
  disposeAllValue<V>(cacheMap: MemoizeCache<V>): void {
    for (let mapValue of (cacheMap as any)) {
      this.disposeValue(mapValue?.[1])
    }
  }
}
```

当前的缓存如果是 WeakMap，是没有 clear 方法和迭代器的。个人想要添加中间层来完成这一切(还在考虑，目前没有做)。如果 WeakMap 调用 clear 方法时，我是直接提供新的 WeakMap 。

```ts
clear() {
  if (this.weak) {
    this.cacheMap = this.getMapOrWeakMapByOption()
  } else {
    this.disposeAllValue(this.cacheMap)
    this.cacheMap.clear!()
  }
}
```

### 添加计数引用

在学习其他库 [memoizee](https://github.com/medikoo/memoizee) 的过程中，我看到了如下用法:

```js
memoized = memoize(fn, { refCounter: true });

memoized("foo", 3); // refs: 1
memoized("foo", 3); // Cache hit, refs: 2
memoized("foo", 3); // Cache hit, refs: 3
memoized.deleteRef("foo", 3); // refs: 2
memoized.deleteRef("foo", 3); // refs: 1
memoized.deleteRef("foo", 3); // refs: 0,清除 foo 的缓存
memoized("foo", 3); // Re-executed, refs: 1
```

于是我有样学样，也添加了 RefCache。

```ts
export default class RefCache<V> extends BaseCacheWithDispose<V, V> implements CacheMap<string | object, V> {
	// 添加 ref 计数
  cacheRef: MemoizeCache<number>

  constructor(weak: boolean = false, dispose: DisposeFun<V> = () => void 0) {
    super(weak, dispose)
    // 根据配置生成 WeakMap 或者 Map
    this.cacheRef = this.getMapOrWeakMapByOption<number>()
  }
  

  // get has clear 等相同。不列出
  
  delete(key: string | object): boolean {
    this.disposeValue(this.get(key))
    this.cacheRef.delete(key)
    this.cacheMap.delete(key)
    return true;
  }


  set(key: string | object, value: V): this {
    this.cacheMap.set(key, value)
    // set 的同时添加 ref
    this.addRef(key)
    return this
  }

  // 也可以手动添加计数
  addRef(key: string | object) {
    if (!this.cacheMap.has(key)) {
      return
    }
    const refCount: number | undefined = this.cacheRef.get(key)
    this.cacheRef.set(key, (refCount ?? 0) + 1)
  }

  getRefCount(key: string | object) {
    return this.cacheRef.get(key) ?? 0
  }

  deleteRef(key: string | object): boolean {
    if (!this.cacheMap.has(key)) {
      return false
    }

    const refCount: number = this.getRefCount(key)

    if (refCount <= 0) {
      return false
    }

    const currentRefCount = refCount - 1
    
    // 如果当前 refCount 大于 0, 设置，否则清除
    if (currentRefCount > 0) {
      this.cacheRef.set(key, currentRefCount)
    } else {
      this.cacheRef.delete(key)
      this.cacheMap.delete(key)
    }
    return true
  }
}
```

同时修改 proxy 主函数:

```ts
if (!currentCache.has(cacheKey)) {
  let result = target.apply(thisArg, argsList)

  if (result?.then) {
    result = Promise.resolve(result).catch(error => {
      currentCache.delete(cacheKey)
      return Promise.reject(error)
    })
  }
  currentCache.set(cacheKey, result);

  // 当前配置了 refCounter
} else if (options?.refCounter) {
  // 如果被再次调用且当前已经缓存过了，直接增加       
  currentCache.addRef?.(cacheKey)
}

```

### 添加 LRU 

LRU 的英文全称是 Least Recently Used，也即最不经常使用。相比于其他的数据结构进行缓存，LRU  无疑更加有效。

这里考虑在添加 maxAge 的同时也添加 max 值 (这里我利用两个 Map 来做 LRU，虽然会增加一定的内存消耗，但是性能更好)。

如果当前的此时保存的数据项等于 max ，我们直接把当前 cacheMap 设为 oldCacheMap，并重新 new cacheMap。

```ts
set(key: string | object, value: V) {
  const itemCache = new ExpiredCacheItem<V>(value)
  // 如果之前有值，直接修改
  this.cacheMap.has(key) ? this.cacheMap.set(key, itemCache) : this._set(key, itemCache);
  return this
}

private _set(key: string | object, value: ExpiredCacheItem<V>) {
  this.cacheMap.set(key, value);
  this.size++;

  if (this.size >= this.max) {
    this.size = 0;
    this.oldCacheMap = this.cacheMap;
    this.cacheMap = this.getMapOrWeakMapByOption()
  }
}
```

重点在与获取数据时候，如果当前的 cacheMap 中有值且没有过期，直接返回，如果没有，就去 oldCacheMap 查找，如果有，删除老数据并放入新数据(使用 _set 方法)，如果都没有，返回 undefined.

```ts
get(key: string | object): V | undefined {
  // 如果 cacheMap 有，返回 value
  if (this.cacheMap.has(key)) {
    const item = this.cacheMap.get(key);
    return this.getItemValue(key, item!);
  }

  // 如果 oldCacheMap 里面有
  if (this.oldCacheMap.has(key)) {
    const item = this.oldCacheMap.get(key);
    // 没有过期
    if (!this.deleteIfExpired(key, item!)) {
      // 移动到新的数据中并删除老数据
      this.moveToRecent(key, item!);
      return item!.data as V;
    }
  }
  return undefined
}


private moveToRecent(key: string | object, item: ExpiredCacheItem<V>) {
  // 老数据删除
  this.oldCacheMap.delete(key);
  
  // 新数据设定，重点！！！！如果当前设定的数据等于 max，清空 oldCacheMap，如此，数据不会超过 max
  this._set(key, item);
}

private getItemValue(key: string | object, item: ExpiredCacheItem<V>): V | undefined {
  // 如果当前设定了 maxAge 就查询，否则直接返回
  return this.maxAge ? this.getOrDeleteIfExpired(key, item) : item?.data;
}
  
  
private getOrDeleteIfExpired(key: string | object, item: ExpiredCacheItem<V>): V | undefined {
  const deleted = this.deleteIfExpired(key, item);
  return !deleted ? item.data : undefined;
}
  
private deleteIfExpired(key: string | object, item: ExpiredCacheItem<V>) {
  if (this.isOverTime(item)) {
    return this.delete(key);
  }
  return false;
}  
```

### 整理 memoize 函数

事情到了这一步，我们就可以从之前的代码细节中解放出来了，看看基于这些功能所做出的接口与主函数。

```ts
// 面向接口，无论后面还会不会增加其他类型的缓存类
export interface BaseCacheMap<K, V> {
  delete(key: K): boolean;

  get(key: K): V | undefined;

  has(key: K): boolean;

  set(key: K, value: V): this;

  clear?(): void;

  addRef?(key: K): void;

  deleteRef?(key: K): boolean;
}

// 缓存配置
export interface MemoizeOptions<V> {
  /** 序列化参数 */
  normalizer?: (args: any[]) => string;
  /** 是否使用 WeakMap */
  weak?: boolean;
  /** 最大毫秒数，过时删除 */
  maxAge?: number;
  /** 最大项数，超过删除  */
  max?: number;
  /** 手动管理内存 */
  manual?: boolean;
  /** 是否使用引用计数  */
  refCounter?: boolean;
  /** 缓存删除数据时期的回调 */
  dispose?: DisposeFun<V>;
}

// 返回的函数(携带一系列方法)
export interface ResultFun<V> extends Function {
  delete?(key: string | object): boolean;

  get?(key: string | object): V | undefined;

  has?(key: string | object): boolean;

  set?(key: string | object, value: V): this;

  clear?(): void;

  deleteRef?(): void
}

```

最终的 memoize 函数其实和最开始的函数差不多，只做了 3 件事

- 检查参数并抛出错误
- 根据参数获取合适的缓存
- 返回代理

```ts
export default function memoize<V>(fn: TargetFun<V>, options?: MemoizeOptions<V>): ResultFun<V> {
  // 检查参数并抛出错误
  checkOptionsThenThrowError<V>(options)

  // 修正序列化函数
  const normalizer = options?.normalizer ?? generateKey

  let cache: MemoizeCache<V> = getCacheByOptions<V>(options)

  // 返回代理
  return new Proxy(fn, {
    // @ts-ignore
    cache,
    get: (target: TargetFun<V>, property: string) => {
      // 添加手动管理
      if (options?.manual) {
        const manualTarget = getManualActionObjFormCache<V>(cache)
        if (property in manualTarget) {
          return manualTarget[property]
        }
      }
      return target[property]
    },
    apply(target, thisArg, argsList: any[]): V {

      const currentCache: MemoizeCache<V> = (this as any).cache

      const cacheKey: string | object = getKeyFromArguments(argsList, normalizer, options?.weak)

      if (!currentCache.has(cacheKey)) {
        let result = target.apply(thisArg, argsList)

      
        if (result?.then) {
          result = Promise.resolve(result).catch(error => {
            currentCache.delete(cacheKey)
            return Promise.reject(error)
          })
        }
        currentCache.set(cacheKey, result);
      } else if (options?.refCounter) {
        currentCache.addRef?.(cacheKey)
      }
      return currentCache.get(cacheKey) as V;
    }
  }) as any
}
```

完整代码在 [memoizee-proxy](https://github.com/wsafight/memoizee-proxy) 中。大家自行操作与把玩。

## 下一步

### 测试

测试覆盖率不代表一切，但是在实现库的过程中，[JEST](https://www.jestjs.cn/) 测试库给我提供了大量的帮助，它帮助我重新思考每一个类以及每一个函数应该具有的功能与参数校验。之前的代码我总是在项目的主入口进行校验，对于每个类或者函数的参数没有深入思考。事实上，这个健壮性是不够的。因为你不能决定用户怎么使用你的库。

### Proxy 深入

事实上，代理的应用场景是不可限量的。这一点，ruby 已经验证过了（可以去学习《ruby 元编程》）。

开发者使用它可以创建出各种编码模式，比如(但远远不限于)跟踪属性访问、隐藏属性、阻止修改或删除属性、函数参数验证、构造函数参数验证、数据绑定，以及可观察对象。

当然，Proxy 虽然来自于  ES6 ，但该 API 仍需要较高的浏览器版本，虽然有 [proxy-pollfill](https://github.com/GoogleChrome/proxy-polyfill) ，但毕竟提供功能有限。不过已经 2021，相信深入学习 Proxy 也是时机了。

### 深入缓存

缓存是有害的！这一点毋庸置疑。但是它实在太快了！所以我们要更加理解业务，哪些数据需要缓存，理解那些数据可以使用缓存。

当前书写的缓存仅仅只是针对与一个方法，之后写的项目是否可以更细粒度的结合返回数据？还是更往上思考，写出一套缓存层？

### 小步开发

在开发该项目的过程中，我采用小步快跑的方式，不断返工。最开始的代码，也仅仅只到了添加过期删除功能那一步。 

但是当我每次完成一个新的功能后，重新开始整理库的逻辑与流程，争取每一次的代码都足够优雅。同时因为我不具备第一次编写就能通盘考虑的能力。不过希望在今后的工作中，不断进步。这样也能减少代码的返工。

## 其他

### 函数创建

事实上，我在为当前库添加手动管理时候，考虑过直接复制函数，因为函数本身是一个对象。同时为当前函数添加 set 等方法。但是没有办法把作用域链拷贝过去。

虽然没能成功，但是也学到了一些知识，这里也提供两个创建函数的代码。

我们在创建函数时候基本上会利用 new Function 创建函数，但是浏览器没有提供可以直接创建异步函数的构造器，我们需要手动获取。

```ts
AsyncFunction = (async x => x).constructor

foo = new AsyncFunction('x, y, p', 'return x + y + await p')

foo(1,2, Promise.resolve(3)).then(console.log) // 6
```

对于全局函数，我们也可以直接  fn.toString() 来创建函数，这时候异步函数也可以直接构造的。

```ts
function cloneFunction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
  return new Function('return '+ fn.toString())();
}
```

## 参考资料

[前端 api 请求缓存方案](https://github.com/wsafight/personBlog/issues/2)

[ECMAScript 6 入门 代理篇](https://es6.ruanyifeng.com/#docs/proxy)

[memoizee](https://github.com/medikoo/memoizee) 

[memoizee-proxy](https://github.com/wsafight/memoizee-proxy) 
