---
title: 总结对象安全访问处理方案
published: 2020-11-15
description: 探讨了前端开发中常见的“cannot read property of undefined”错误，介绍了短路运算符号嗅探、||单元保底值、try catch、链判断运算符等多种对象安全访问处理方案。
tags: [工程实践]
category: 工程实践
draft: false
---

> 前端数据不可信，后端数据不可知

在前端项目开发与生产的过程中，“cannot read property of undefined”是一个常见的错误。从不可知得到一个空数据问题在所难免。面对这种问题我们该怎么办呢？

针对于特定的业务和数据，前端即使预知数据不存在，也无法处理，任其崩溃即可。但大部分情况下，如果因为列表某条数据出现错误而导致整个页面无法访问，用户将对我们系统健壮性产生信任危机。

为了能够在对象( JavaScript 中数组也是对象)中安全的取值，需要验证对象中数据项是否存在，if 语句判断当然是没有问题的，但是如果数据路径较深，代码就过于冗余了，而常见的处理方案有如下几种。

## 短路运算符号嗅探

JavaScript 中我们可以通过 && 来实现获取员工的地址邮编代码

```js
const result = (staff.address && staff.address[0] && staff.address[0].zip) || ''
```

### 原理解析

这种解析方式和 JavaScript 异于其他语言的判断机制有关。大部分语言都仅有 true 和 false, JavaScript 有 `truthy` 概念，即在某些场景下会被推断为 `true`。

当然以下数据会被解析为 false:

- null
- undefined
- NaN
- 0
- 空字符串

除此之外，都会被解析为 true，即使空数组, 空对象（注: Python 空字典，空列表，空元组均在判断中会被解析为 false）也不例外。

同时 && || 不仅仅返回 true 和 false，而是数据项。

|       运算符        |                            说明                             |
| :-----------------: | :---------------------------------------------------------: |
| 逻辑与，AND（`&&`） | 若第一项可转换为 `true`，则返回第二项；否则，返回第一项目。 |
|  逻辑或，OR  | 若第一项可转换为 `true`，则返回第一项；否则，返回第二项目。 |
| 逻辑非，NOT（`!`）  | 若当前项可转换为 `true`，则返回 `false`；否则，返回 `true`  |

## || 单元保底值

既然可以通过 && 来对数据进行嗅探，那么我们可以退一步，如果当前没有项目数据，利用 || 返回空对象或者空数组。

```js
const EMPTY_OBJ = {}

const result = (((staff || EMPTY_OBJ).address || EMPTY_OBJ)[0] || EMPTY_OBJ).zip || ''
```

对比上一个方案，虽然相比上述代码更为复杂。 但是如果针对拥有完整数据的数据项目而言，对数据的访问次数较少(. 的使用率),而上一个方案针对完善数据的访问会多不少。而大部分数据无疑是正确与完整的。

## try catch

该方法无需验证对象中数据项是否存在，而是通过错误处理直接处理。

```js
let result = ''
try {
  result = staff.address[0].zip
} catch {
  // 错误上报
}
```

try catch 方案更适合必要性数据缺失作为上报的情况。但如果发生了必要性内容数据缺失，前端界面崩溃反而是一件好事。所以 try catch 不太适合处理对象安全访问这种问题，仅仅作为可选方案。

## 链判断运算符

上述处理方式都很痛苦，因此 [ES2020](https://github.com/tc39/proposal-optional-chaining) 引入了“链判断运算符”（optional chaining operator）`?.`，简化上面的写法。

```js
const reuslt = staff?.address?.[0]?.zip || ''
```

简单来解释:

```js
a?.b
// 等同于
a == null ? undefined : a.b

a?.[x]
// 等同于
a == null ? undefined : a[x]

a?.b()
// 等同于
a == null ? undefined : a.b()

a?.()
// 等同于
a == null ? undefined : a()
```

如果你想要详细了解，可以参考阮一峰 [ECMAScript 6 入门 链判断运算符 ](https://es6.ruanyifeng.com/#docs/object#%E9%93%BE%E5%88%A4%E6%96%AD%E8%BF%90%E7%AE%97%E7%AC%A6) 一篇。

## 手写路径获取

某些情况下，我们需要传递路径来动态获取数据,如 'staff.address[0].zip', 这里手写了一个处理代码。传入对象和路径，得到对象，对象 key 以及 value。

```ts
/**
 * 根据路径来获取 对象内部属性
 * @param obj 对象
 * @param path 路径 a.b[1].c
 */
function getObjPropByPath(obj: Record<string, any>, path: string) {
  let tempObj = obj
  const keyArr = path.split('.').map(x => x.trim())
  let i: number = 0
  for (let len = keyArr.length; i <len - 1; ++i) {
    let key = keyArr[i]
    // 简单判断是否是数组数据，如果 以 ] 结尾的话
    const isFormArray = key.endsWith(']')
    let index: number = 0
    if (isFormArray) {
      const data = key.split('[') ?? []
      key = data[0] ?? ''
      // 对于 parseInt('12]') => 12
      index = parseInt(data[1], 10)
    }
    
    if (key in tempObj) {
      tempObj = tempObj[key]
      if (isFormArray && Array.isArray(tempObj)) {
        tempObj = tempObj[index]
        if (!tempObj) {
          return {}
        }
      }
    } else {
      return {}
    }
  }

  if (!tempObj) {
    return {}
  }
  
  return  {
    o: tempObj,
    k: keyArr[i],
    v: tempObj[keyArr[i]]
  }
}
```

不过笔者写的方案较为粗糙，但 lodash 对象模块中也有该功能，感兴趣的可以参考其实现方式。[lodash get](https://www.lodashjs.com/docs/lodash.get)

```js

// 根据 object对象的path路径获取值。 如果解析 value 是 undefined 会以 defaultValue 取代。
// _.get(object, path, [defaultValue])

var object = { 'a': [{ 'b': { 'c': 3 } }] };

_.get(object, 'a[0].b.c');
// => 3

_.get(object, ['a', '0', 'b', 'c']);
// => 3

_.get(object, 'a.b.c', 'default');
// => 'default'
```

## 其他

### Null 判断运算符

当然，我们大部分情况下使用 || 都没有问题，但是由于 `falsy` 的存在. || 对于 false 和 undefined 是一样的。但是某些情况下，false 是有意义的，true, false, undefined 均代表一种含义，这时候，我们还需要对数据进行其他处理，使用 in 或者 hasOwnProperty 进行存在性判断。

针对于这种情况，[ES2020](https://github.com/tc39/proposal-nullish-coalescing) 引入了一个新的 Null 判断运算符 `??`。它的行为类似`||`，但是只有运算符左侧的值为 `null` 或 `undefined` 时，才会返回右侧的值。如

```js
const result = staff.address && staff.address[0] && staff.address[0].zip ?? ''
```

## 参考资料

[ES6 入门教程](https://es6.ruanyifeng.com/)
