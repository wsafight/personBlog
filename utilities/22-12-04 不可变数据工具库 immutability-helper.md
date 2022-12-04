# 不可变数据工具库 immutability-helper

之前学习函数式编程语言的过程中，有 3 比较重要的特性：

- 函数是一等公民
- 数据不可变
- 惰性求值

JavaScript 虽然具有函数式语言的特性，但是很可惜，它还是没有具备不可变数据这一大优势。

在开发复杂系统的情况下，不可变性会带来巨大的优势。它具有两个最大的优势：不可修改 (减少错误的发生) 以及结构共享
(节省空间)。不可修改也意味着数据容易回溯，易于观察。

当前端开发谈到不可变性数据时候，第一个一定会想到 Immer 库，该库利用 ES6 的 proxy，几乎以最小的成本实现了 js 的不可变数据结构。React
也通过不可变数据结构结合提升性能。不过 Immer 还是有一定侵入性。那么有没有较好且没有侵入的解决方案呢？我们可以去看看
[immutability-helper](https://github.com/kolodny/immutability-helper)。

## 浅拷贝实现不可变数据

最简单的不可变数据结构就是深拷贝了。

```ts
const newUser = JSON.parse(JSON.stringify(user));
newUser[key] = value;
```

但是这对于大部分的情况是无法接受的，这里大量消耗了性能和内存，使得系统变得不可用。

事实上，开发中完全可以利用浅拷贝来实现不可变数据结构的，这也是 immutability-helper 所使用的方案。我们来看一下以下数据：

```ts
const user = {
  name: "wsafight",
  company: {
    name: "测试公司",
    otherInfo: {
      owner: "测试公司老板",
    },
  },
  schools: [
    { name: "测试小学" },
    { name: "测试初中" },
    { name: "测试高中" },
  ],
};
```

我们怎么才能在不改变原有数据的情况下改变 user.company.name 呢？代码如下

```ts
// 修改公司名称
const newUser = {
  ...user,
  company: {
    ...user.company,
    name: "升级测试公司",
  },
};

user === newUser;
// false

user.company === newUser.company;
// false

user.company.otherInfo === newUser.company.otherInfo;
// true

newUser.schools === user.schools;
// true
```

我们没有改变原有的 user，同时我们获取了共用其他数据结构的
newUser。同时，如果需要数据回溯，即使我们将当前对象直接存入数组中，内存占用也不会出现非常大的情况。当然，[Immer Patches](https://immerjs.github.io/immer/zh-CN/patches/)
对于回溯的处理更优，后续我也会继续解读不可变结构的其他工具库。

## immutability-helper 用法

上述方案是不错，但是编写起来过于复杂。面对复杂的数据结构，未免捉襟见肘。还很容易写出 bug。

于是 kolodny 出手编写了 immutability-helper 来帮助我们构建不可变的数据结构。

```ts
import update from "immutability-helper";

// 修改公司名称
const newUser = update(user, {
  company: {
    name: {
      $set: "升级测试公司",
    },
  },
});
```

我们可以看到 update 函数传入之前的数据以及一个对象结构，得到了新的数据。$set 是替换目前的数据的意思。除此之外，还有其他的命令。

针对数组的操作

- { $push: any[] } 针对当前数组数据 push 一些数组
- { $unshift: any[] } 针对当前数组数据 unshift 一些数组
- { $splice: {start: number, deleteCount: number, ...items: T[]}[] }
  使的参数调用目标上的每个项目,注意顺序

```ts
const target = update(user, {
  schools: {
    $push: [
      { name: "测试大学" },
    ],
  },
});

const target = update(user, {
  schools: {
    $unshift: [
      { name: "测试幼儿园" },
    ],
  },
});

// 排序操作
const sourceItem = user[sourceIndex];
const newUser = update(user, {
  schools: {
    $splice: [
      [sourceIndex, 1],
      [targetIndex, 0, sourceItem!],
    ],
  },
});
```

还有一个可以基于当前数据进行操作的 $apply.

```ts
const newObj = update(user, {
  name: {
    $apply: (name) => `${name} change`,
  },
});
```

还有针对对象的 $set, $unset, $merge 以及针对 Map，Set 的 $add, $remove。这些就不一一介绍了，遇到了就自行查阅一下文档。

## 添加辅助函数

对比之前的写法无疑对我们已经有很大的帮助了。但是针对当前操作还是非常难受。还是需要编写复杂的数据结构。

我们直接编写如下函数

```ts
export const convertImmutabilityByPath = (
  path: string,
  value: Record<string, any>
) => {
	// 路径 path 没有或者不是字符串，直接返回空对象
  if (!path || typeof path !== 'string') {
    return {}
  }

	// value 没有或者不是对象，直接返回空对象
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') {
    return {}
  }

	// 简单替换 [ 和 ] 为 . 和 空字符串，没有做太多逻辑处理
	// 请不要建立奇怪的路径，否则可能有未知错误
  const keys = path.replace(/\[/g, '.')
    .replace(/\]/g, '')
    .split('.')
    .filter(Boolean)

  const result: Record<string, any> = {}
  let current = result
  
  const len = keys.length
  
  keys.forEach((key: string, index: number) => {
    current[key] = index === len - 1 ? value : {}
    current = current[key]
  })

  return result
}
```



代码在 [val-path-helper](https://github.com/wsafight/val-path-helper) 中，库还有其他的功能，目前还在编写中。

如此一来我们就可以直接编辑数据了。

```ts
convertImmutabilityByPath(
	'schools[0].name', 
	{ $set: '试试小学' }
)
// 也可以使用 'schools.0.name' 'schools.[0].name' 

// 如此，我们就可以用这种方式编写
convertImmutabilityByPath(
	`schools[${index}].name`, 
	{ $set: '试试小学' },
)

```

## 实测 React

我们可以实测 immutability-helper 对于 react 渲染的帮助。

// TODO

```

```


## 源代码分析

immutability-helper 仅有几百行代码，我们来解析一下。

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
				// 这样的话，react 就不会出发渲染函数
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

最后是通用指令的解析

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

## 其他

```ts
convertImmutabilityByPath(
	`schools[${index}].name`, 
	{ $set: '试试小学' },
)
```

大家在看到如上代码会想到什么呢？没错，就是我之前在 [手写一个业务数据比对库](https://github.com/wsafight/personBlog/issues/49) 中推荐的 westore diff 函数。

```ts
const result = diff({
  a: 1,
  b: 2,
  c: "str",
  d: { e: [2, { a: 4 }, 5] },
  f: true,
  h: [1],
  g: { a: [1, 2], j: 111 },
}, {
  a: [],
  b: "aa",
  c: 3,
  d: { e: [3, { a: 3 }] },
  f: false,
  h: [1, 2],
  g: { a: [1, 1, 1], i: "delete" },
  k: "del",
});
// 结果
{ 
  "a": 1, 
  "b": 2, 
  "c": "str", 
  "d.e[0]": 2, 
  "d.e[1].a": 4, 
  "d.e[2]": 5, 
  "f": true, 
  "h": [1], 
  "g.a": [1, 2], 
  "g.j": 111, 
  "g.i": null, 
  "k": null 
}
```

之前的文章我就考虑该库的 diff 算法有其他功能，后续个人会结合 diff 以及 immutability-helper 开发一些工具库。

## 参考资料

[immutability-helper](https://github.com/kolodny/immutability-helper)

[val-path-helper](https://github.com/wsafight/val-path-helper)

[immutability-helper实践与优化](https://cloud.tencent.com/developer/article/1907994)




