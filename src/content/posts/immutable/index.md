---
title: 聊聊不可变数据结构
published: 2021-01-25
description: 回顾当年前端工程化尚未普及的时代，探讨那时 JavaScript 的加载方式及其局限性
tags: [数据结构, 性能优化]
category: 工程实践
draft: false
---

三年前，我接触了 [Immutable](https://github.com/immutable-js/immutable-js) 库，体会到了不可变数据结构的利好。

Immutable 库具有两个最大的优势: 不可修改以及结构共享。

* 不可修改(容易回溯，易于观察。减少错误的发生)

```ts
let obj = { a: 1 };

handleChange(obj);

// 由于上面有 handleChange，无法确认 obj 此时的状态
console.log(obj)
```

* 结构共享( 复用内存，节省空间,也就意味着数据修改可以直接记录完整数据，其内存压力也不大，这样对于开发复杂交互项目的重做等功能很有用)

当然，由于当时还在重度使用 Vue 进行开发，而且 受益于 Vue 本身的优化以及业务抽象和系统的合理架构，项目一直保持着良好的性能。同时该库的侵入性和难度都很大，贸然引入项目也未必是一件好事。

虽然 Immutable 库没有带来直接的收益，但从中学到一些思路和优化却陪伴着我。

## 浅拷贝 assign 胜任 Immutable

当我们不使用任何库，我们是否就无法享受不可变数据的利好？答案是否定的。

当面临可变性数据时候，大部分情况下我们会使用深拷贝来解决两个数据引用的问题。

```ts
const newData = deepCopy(myData);
newData.x.y.z = 7;
newData.a.b.push(9);
```

不幸的是，深度拷贝是昂贵的，在有些情况下更是不可接受的。深拷贝占用了大量的时间，同时两者之间没有任何结构共享。但我们可以通过仅复制需要更改的对象和重用未更改的对象来减轻这种情况。如 Object.assign 或者 ... 来实现结构共享。

大多数业务开发中，我们都是先进行深拷贝，再进行修改。但是我们真的需要这样做吗？事实并非如此。从项目整体出发的话，我们只需要解决一个核心问题  “深层嵌套对象”。当然，这并不意味着我们把所有的数据都放在第一层。只需要不嵌套可变的数据项即可。

``` ts
const staffA = {
  name: 'xx',
  gender: 'man',
  company: {},
  authority: []
}

const staffB = {...staffA}

staffB.name = 'YY'

// 不涉及到 复杂类型的修改即可
staffA.name // => 'xx'

const staffsA = [staffA, staffB]

// 需要对数组内部每一项进行浅拷贝
const staffsB = staffsA.map(x => ({...x}))

staffsB[0].name = 'gg'

staffsA[0].name // => 'xx'
```

如此，我们就把深拷贝变为了浅拷贝。同时实现了结构共享 (所有深度嵌套对象都被复用了) 。但有些情况下，数据模型并不是容易修改的，我们还是需要修改深度嵌套对象。那么就需要这样修改了。

```ts
const newData = Object.assign({}, myData, {
  x: Object.assign({}, myData.x, {
    y: Object.assign({}, myData.x.y, {z: 7}),
  }),
  a: Object.assign({}, myData.a, {b: myData.a.b.concat(9)})
});
```

这对于绝大部份的业务场景来说是相当高效的(因为它只是浅拷贝，并重用了其余的部分) ，但是编写起来却非常痛苦。

## immutability-helper 库辅助开发

[immutability-helper](https://github.com/kolodny/immutability-helper) (语法受到了 MongoDB 查询语言的启发 ) 这个库为 Object.assign 方案提供了简单的语法糖，使得编写浅拷贝代码更加容易:

```ts
import update from 'immutability-helper';

const newData = update(myData, {
  x: {y: {z: {$set: 7}}},
  a: {b: {$push: [9]}}
});

const initialArray = [1, 2, 3];
const newArray = update(initialArray, {$push: [4]}); // => [1, 2, 3, 4]
initialArray // => [1, 2, 3]
```

### 可用命令

- $push (类似于数组的 push,但是提供的是数组)
- $unshift (类似于数组的 unshift,但是提供的是数组)
- $splice (类似于数组的 splice, 但提供数组是一个数组,  $splice: [ [1, 1, 13, 14] ] ) 

注意：*数组中的项目是顺序应用的，因此顺序很重要。目标的索引可能会在操作过程中发生变化。*

- $toggle (字符串数组，切换目标对象的布尔数值)
- $set (完全替换目标节点, 不考虑之前的数据，只用当前指令设置的数据)
- $unset (字符串数组，移除 key 值(数组或者对象移除))
- $merge (合并对象)

```ts
const obj = {a: 5, b: 3};
const newObj = update(obj, {$merge: {b: 6, c: 7}}); // => {a: 5, b: 6, c: 7}
```

- $add(为 Map 添加 [key,value] 数组)
- $remove (字符串对象，为 Map 移除 key)
- $apply (应用函数到节点)

```ts
const obj = {a: 5, b: 3};
const newObj = update(obj, {b: {$apply: function(x) {return x * 2;}}});
// => {a: 5, b: 6}
const newObj2 = update(obj, {b: {$set: obj.b * 2}});
// => {a: 5, b: 6}
```

后面我们解析源码时，可以看到不同指令的实现。

### 扩展命令

我们可以基于当前业务去扩展命令。如添加税值计算:

```ts
import update, { extend } from 'immutability-helper';

extend('$addtax', function(tax, original) {
  return original + (tax * original);
});
const state = { price: 123 };
const withTax = update(state, {
  price: {$addtax: 0.8},
});
assert(JSON.stringify(withTax) === JSON.stringify({ price: 221.4 }));
```

如果您不想弄脏全局的 `update` 函数，可以制作一个副本并使用该副本，这样不会影响全局数据：

```ts
import { Context } from 'immutability-helper';

const myContext = new Context();

myContext.extend('$foo', function(value, original) {
  return 'foo!';
});

myContext.update(/* args */);
```

### 源码解析

为了加强理解，这里我来解析一下源代码，同时该库代码十分简洁强大:

先是工具函数(保留核心,环境判断，错误警告等逻辑去除):

```ts
// 提取函数，大量使用时有一定性能优势，且简明(更重要)
const hasOwnProperty = Object.prototype.hasOwnProperty;
const splice = Array.prototype.splice;
const toString = Object.prototype.toString;

// 检查类型
function type<T>(obj: T) {
  return (toString.call(obj) as string).slice(8, -1);
}

// 浅拷贝，使用 Object.assign 
const assign = Object.assign || /* istanbul ignore next */ (<T, S>(target: T & any, source: S & Record<string, any>) => {
  getAllKeys(source).forEach(key => {
    if (hasOwnProperty.call(source, key)) {
      target[key] = source[key] ;
    }
  });
  return target as T & S;
});

// 获取对象 key
const getAllKeys = typeof Object.getOwnPropertySymbols === 'function'
  ? (obj: Record<string, any>) => Object.keys(obj).concat(Object.getOwnPropertySymbols(obj) as any)
  /* istanbul ignore next */
  : (obj: Record<string, any>) => Object.keys(obj);

// 所有数据的浅拷贝
function copy<T, U, K, V, X>(
  object: T extends ReadonlyArray<U>
    ? ReadonlyArray<U>
    : T extends Map<K, V>
      ? Map<K, V>
      : T extends Set<X>
        ? Set<X>
        : T extends object
          ? T
          : any,
) {
  return Array.isArray(object)
    ? assign(object.constructor(object.length), object)
    : (type(object) === 'Map')
      ? new Map(object as Map<K, V>)
      : (type(object) === 'Set')
        ? new Set(object as Set<X>)
        : (object && typeof object === 'object')
          ? assign(Object.create(Object.getPrototypeOf(object)), object) as T
          /* istanbul ignore next */
          : object as T;
}

```

 然后是核心代码(同样保留核心) :

```ts
export class Context {
  // 导入所有指令
  private commands: Record<string, any> = assign({}, defaultCommands);

  // 添加扩展指令
  public extend<T>(directive: string, fn: (param: any, old: T) => T) {
    this.commands[directive] = fn;
  }
  
  // 功能核心
  public update<T, C extends CustomCommands<object> = never>(
    object: T,
    $spec: Spec<T, C>,
  ): T {
    // 增强健壮性，如果操作命令是函数,修改为 $apply
    const spec = (typeof $spec === 'function') ? { $apply: $spec } : $spec;

    // 数组(数组) 检查，报错
      
    // 返回对象(数组) 
    let nextObject = object;
    // 遍历指令
    getAllKeys(spec).forEach((key: string) => {
      // 如果指令在指令集中
      if (hasOwnProperty.call(this.commands, key)) {
        // 性能优化,遍历过程中，如果 object 还是当前之前数据
        const objectWasNextObject = object === nextObject;
        
        // 用指令修改对象
        nextObject = this.commands[key]((spec as any)[key], nextObject, spec, object);
        
        // 修改后，两者使用传入函数计算，还是相等的情况下，直接使用之前数据
        if (objectWasNextObject && this.isEquals(nextObject, object)) {
          nextObject = object;
        }
      } else {
        // 不在指令集中，做其他操作
        // 类似于 update(collection, {2: {a: {$splice: [[1, 1, 13, 14]]}}});
        // 解析对象规则后继续递归调用 update, 不断递归，不断返回
        // ...
      }
    });
    return nextObject;
  }
}
```

最后是通用指令:

```ts
const defaultCommands = {
  $push(value: any, nextObject: any, spec: any) {
    // 数组添加，返回 concat 新数组
    return value.length ? nextObject.concat(value) : nextObject;
  },
  $unshift(value: any, nextObject: any, spec: any) {
    return value.length ? value.concat(nextObject) : nextObject;
  },
  $splice(value: any, nextObject: any, spec: any, originalObject: any) {
    // 循环 splice 调用
    value.forEach((args: any) => {
      if (nextObject === originalObject && args.length) {
        nextObject = copy(originalObject);
      }
      splice.apply(nextObject, args);
    });
    return nextObject;
  },
  $set(value: any, _nextObject: any, spec: any) {
    // 直接替换当前数值
    return value;
  },
  $toggle(targets: any, nextObject: any) {
    const nextObjectCopy = targets.length ? copy(nextObject) : nextObject;
    // 当前对象或者数组切换
    targets.forEach((target: any) => {
      nextObjectCopy[target] = !nextObject[target];
    });

    return nextObjectCopy;
  },
  $unset(value: any, nextObject: any, _spec: any, originalObject: any) {
    // 拷贝后循环删除
    value.forEach((key: any) => {
      if (Object.hasOwnProperty.call(nextObject, key)) {
        if (nextObject === originalObject) {
          nextObject = copy(originalObject);
        }
        delete nextObject[key];
      }
    });
    return nextObject;
  },
  $add(values: any, nextObject: any, _spec: any, originalObject: any) {
    if (type(nextObject) === 'Map') {
      values.forEach(([key, value]) => {
        if (nextObject === originalObject && nextObject.get(key) !== value) {
          nextObject = copy(originalObject);
        }
        nextObject.set(key, value);
      });
    } else {
      values.forEach((value: any) => {
        if (nextObject === originalObject && !nextObject.has(value)) {
          nextObject = copy(originalObject);
        }
        nextObject.add(value);
      });
    }
    return nextObject;
  },
  $remove(value: any, nextObject: any, _spec: any, originalObject: any) {
    value.forEach((key: any) => {
      if (nextObject === originalObject && nextObject.has(key)) {
        nextObject = copy(originalObject);
      }
      nextObject.delete(key);
    });
    return nextObject;
  },
  $merge(value: any, nextObject: any, _spec: any, originalObject: any) {
    getAllKeys(value).forEach((key: any) => {
      if (value[key] !== nextObject[key]) {
        if (nextObject === originalObject) {
          nextObject = copy(originalObject);
        }
        nextObject[key] = value[key];
      }
    });
    return nextObject;
  },
  $apply(value: any, original: any) {
    // 传入函数，直接调用函数修改
    return value(original);
  },
};
```

就这样，作者写了一个简洁而强大的浅拷贝辅助库。

## 优秀的 Immer 库

[Immer](https://immerjs.github.io/immer/docs/introduction) 是一个非常优秀的不可变数据库，利用 proxy 来解决问题。不需要学习其他 api，开箱即用 ( gzipped 3kb )

```ts
import produce from "immer"

const baseState = [
  {
    todo: "Learn typescript",
 done: true
 },
 {
    todo: "Try immer",
 done: false
 }
]

// 直接修改，没有任何开发负担，心情美美哒
const nextState = produce(baseState, draftState => {
  draftState.push({todo: "Tweet about it"})
  draftState[1].done = true
})
```

关于 immer 性能优化请参考 [immer performance](https://immerjs.github.io/immer/docs/performance)。

### 核心代码分析

该库的核心还是在 proxy 的封装，所以不全部介绍，仅介绍代理功能。

```ts
export const objectTraps: ProxyHandler<ProxyState> = {
  get(state, prop) {
    // PROXY_STATE是一个symbol值，有两个作用，一是便于判断对象是不是已经代理过，二是帮助proxy拿到对应state的值
    // 如果对象没有代理过，直接返回
    if (prop === DRAFT_STATE) return state

    // 获取数据的备份？如果有，否则获取元数据
    const source = latest(state)

    // 如果当前数据不存在，获取原型上数据
    if (!has(source, prop)) {
      return readPropFromProto(state, source, prop)
    }
    const value = source[prop]

    // 当前代理对象已经改回了数值或者改数据是 null，直接返回
    if (state.finalized_ || !isDraftable(value)) {
      return value
    }
    // 创建代理数据
    if (value === peek(state.base_, prop)) {
      prepareCopy(state)
      return (state.copy_![prop as any] = createProxy(
        state.scope_.immer_,
        value,
        state
      ))
    }
    return value
  },
  // 当前数据是否有该属性
  has(state, prop) {
    return prop in latest(state)
  },
  set(
    state: ProxyObjectState,
    prop: string /* strictly not, but helps TS */,
    value
  ) {
    const desc = getDescriptorFromProto(latest(state), prop)

    // 如果当前有 set 属性，意味当前操作项是代理，直接设置即可
    if (desc?.set) {
      desc.set.call(state.draft_, value)
      return true
    }

    // 当前没有修改过，建立副本 copy，等待使用 get 时创建代理
    if (!state.modified_) {
      const current = peek(latest(state), prop)

      const currentState: ProxyObjectState = current?.[DRAFT_STATE]
      if (currentState && currentState.base_ === value) {
        state.copy_![prop] = value
        state.assigned_[prop] = false
        return true
      }
      if (is(value, current) && (value !== undefined || has(state.base_, prop)))
        return true
      prepareCopy(state)
      markChanged(state)
    }

    state.copy_![prop] = value
    state.assigned_[prop] = true
    return true
  },
  defineProperty() {
    die(11)
  },
  getPrototypeOf(state) {
    return Object.getPrototypeOf(state.base_)
  },
  setPrototypeOf() {
    die(12)
  }
}

// 数组的代理，把当前对象的代理拷贝过去，再修改 deleteProperty 和 set
const arrayTraps: ProxyHandler<[ProxyArrayState]> = {}
each(objectTraps, (key, fn) => {
  // @ts-ignore
  arrayTraps[key] = function() {
    arguments[0] = arguments[0][0]
    return fn.apply(this, arguments)
  }
})
arrayTraps.deleteProperty = function(state, prop) {
  if (__DEV__ && isNaN(parseInt(prop as any))) die(13)
  return objectTraps.deleteProperty!.call(this, state[0], prop)
}
arrayTraps.set = function(state, prop, value) {
  if (__DEV__ && prop !== "length" && isNaN(parseInt(prop as any))) die(14)
  return objectTraps.set!.call(this, state[0], prop, value, state[0])
}
```

### 其他

开发过程中，我们往往会在 React 函数中使用 useReducer 方法，但是 useReducer 实现较为复杂，我们可以用 [useMethods](https://github.com/pelotom/use-methods) 简化代码。useMethods 内部就是使用 immer (代码十分简单，我们直接拷贝 index.ts 即可)。

不使用 useMethods 情况下:

```ts
const initialState = {
  nextId: 0,
  counters: []
};

const reducer = (state, action) => {
  let { nextId, counters } = state;
  const replaceCount = (id, transform) => {
    const index = counters.findIndex(counter => counter.id === id);
    const counter = counters[index];
    return {
      ...state,
      counters: [
        ...counters.slice(0, index),
        { ...counter, count: transform(counter.count) },
        ...counters.slice(index + 1)
      ]
    };
  };

  switch (action.type) {
    case "ADD_COUNTER": {
      nextId = nextId + 1;
      return {
        nextId,
        counters: [...counters, { id: nextId, count: 0 }]
      };
    }
    case "INCREMENT_COUNTER": {
      return replaceCount(action.id, count => count + 1);
    }
    case "RESET_COUNTER": {
      return replaceCount(action.id, () => 0);
    }
  }
};
```

对比使用 useMethods :

```ts
import useMethods from 'use-methods';	

const initialState = {
  nextId: 0,
  counters: []
};

const methods = state => {
  const getCounter = id => state.counters.find(counter => counter.id === id);

  return {
    addCounter() {
      state.counters.push({ id: state.nextId++, count: 0 });
    },
    incrementCounter(id) {
      getCounter(id).count++;
    },
    resetCounter(id) {
      getCounter(id).count = 0;
    }
  };
};
```

## 参考资料

[immutability-helper](https://github.com/kolodny/immutability-helper)

[Immer](https://immerjs.github.io/immer/docs/introduction) 

[useMethods](https://github.com/pelotom/use-methods) 