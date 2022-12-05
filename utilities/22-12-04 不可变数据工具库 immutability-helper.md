# 不可变数据工具库 immutability-helper

之前学习函数式编程语言的过程中，有 3 比较重要的特性：

- 函数是一等公民
- 数据不可变
- 惰性求值

JavaScript 虽然具有函数式语言的特性，但是很可惜，它还是没有具备不可变数据这一大优势。

在开发复杂系统的情况下，不可变性具有两个非常重要的特性：不可修改 (减少错误的发生) 以及结构共享(节省空间)。不可修改也意味着数据容易回溯，易于观察。

当前端开发谈到不可变性数据时候，第一个一定会想到 [Immer](https://immerjs.github.io/immer/) 库，Immer 利用
ES6 的 proxy，几乎以最小的成本实现了 js 的不可变数据结构。React 也通过不可变数据结构结合提升性能。不过 Immer
还是有一定侵入性。那么有没有较好且没有侵入的解决方案呢？本文将介绍另一个工具 [immutability-helper](https://github.com/kolodny/immutability-helper)，该库也在 [React 性能优化](https://zh-hans.reactjs.org/docs/optimizing-performance.html#the-power-of-not-mutating-data) 有所描述。

## 浅拷贝实现不可变数据

最简单的不可变数据结构就是深拷贝了。

```ts
const newUser = JSON.parse(JSON.stringify(user));
newUser[key] = value;
```

但这对于大部分的场景来说是无法接受的，它大量消耗了时间与空间，会让复杂的系统变得不可用。

事实上，开发中完全可以利用浅拷贝来实现不可变数据结构的，这也是 immutability-helper 所使用的方案。我们先来构造以下数据：

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

我们并没有改变原有的 user 数据，同时获取了共用其他数据结构的 newUser。同时，如果当前功能需要数据回溯，即使将当前对象直接存入一个数组中，内存占用也不会出现非常大的情况。当然，[Immer Patches](https://immerjs.github.io/immer/zh-CN/patches/) 对于回溯的处理更优，后续个人也会继续解读不可变结构的其他工具库。

## immutability-helper 用法

使用浅拷贝来实现不可变数据结构是不错，但是编写起来过于复杂。当开发者面对复杂的数据结构，未免捉襟见肘。还很容易写出 bug。

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
// 添加了用户的学校
const newUser = update(user, {
  schools: {
    $push: [
      { name: "测试大学" },
    ],
  },
});

const newUser = update(user, {
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

const newUser = update(user, {
  schools: {
    // 也可以同时放入命令进行操作
    $unshift: [
      { name: "测试幼儿园" },
    ],
    $push: [
      { name: "测试幼儿园" },
    ],
    $splice: [],
  },
});
```

还有一个可以基于当前数据进行操作的 $apply.

```ts
// 每次更新都基于当前的数据来计算
const newUser = update(user, {
  name: {
    $apply: (name) => `${name} change`,
  },
});
```

该库还有针对对象的 $set, $unset, $merge 以及针对 Map，Set 的 $add, $remove。甚至我们还可以自定义指令。这些就不一一介绍了，大家遇到了就自行查阅一下文档。

## 添加辅助函数
对比之前的写法无疑对我们已经有很大的帮助了。但是针对当前操作还是非常难受。还是需要编写复杂的数据结构。

编写如下函数：

```ts
export const convertImmutabilityByPath = (
  // 对象路径
  path: string,
  // 当前操作
  actions: Record<string, any>,
) => {
  // 路径 path 没有或者不是字符串，直接返回空对象
  if (!path || typeof path !== "string") {
    return {};
  }

  // actions 没有或者不是对象，直接返回空对象
  if (
    !actions || Object.prototype.toString.call(actions) !== "[object Object]"
  ) {
    return {};
  }

  // 简单替换 [ 和 ] 为 . 和 空字符串，没有做太多逻辑处理
  // 请不要建立奇怪的对象路径，否则可能出现未知错误
  const keys = path.replace(/\[/g, ".")
    .replace(/\]/g, "")
    .split(".")
    .filter(Boolean);

  const result: Record<string, any> = {};
  let current = result;

  const len = keys.length;

  // 根据路径一步步构建对象
  keys.forEach((key: string, index: number) => {
    current[key] = index === len - 1 ? actions : {};
    current = current[key];
  });

  return result;
};
```

当前代码在 [val-path-helper](https://github.com/wsafight/val-path-helper) 中，该库还有其他的功能，目前还在编写中。

如此一来我们就可以直接编辑数据了。

```ts
convertImmutabilityByPath(
  "schools[0].name",
  { $set: "试试小学" },
);
// 也可以使用 'schools.0.name' 'schools.[0].name'
// 甚至 'schools[0.name' 也行

// 我们也可以使用这种方式操作数据中对象
convertImmutabilityByPath(
  `schools[${index}].${key}`,
  { $set: value },
);
```

## 实测 React

这里我们开始实测 immutability-helper 对于 react 渲染的帮助。代码利用 [Profiler API](https://zh-hans.reactjs.org/docs/profiler.html) 来查看渲染代价。

```ts
function App() {
  const [user, setUser] = useState({
    name: "wsafight",
    company: {
      name: "测试公司",
    },
    schools: [
      { name: "测试小学", start: "1998-01-02", end: "2004-01-02" },
      { name: "测试高中", start: "2005-01-02", end: "2007-01-02" },
    ],
  });

  /**
   * Profiler 组件，可以查看渲染
   */
  const renderCallback = (...info) => {
    console.log("渲染原因", info[1]);
    console.log("本次更新 committed 花费的渲染时间", info[2]);
  };

  const handleSchoolsChange = () => {
    user.schools[0].name = "测试小学1";
    setUser({ ...user });
  };

  const handleSchools2 = () => {
    // immutability-helper
    const newUser = update(
      user,
      convertImmutabilityByPath("schools[0].name", {
        $set: "测试小学2",
      }),
    );
    setUser(newUser);
  };

  const handleSchools3 = () => {
    user.schools[0].name = "测试小学3";
    // 深拷贝
    const newUser = JSON.parse(JSON.stringify(user));
    setUser(newUser);
  };

  // 使用 useMemo 优化性能，也可以使用 memo 或者 shouldComponentUpdate
  // 如果 user.schools 不变,则不会重新渲染
  const renderSchools = useMemo(() => {
    return (
      <div>
        {user.schools.map((item) => {
          return (
            <div key={item.name}>
              {item.name}
              {item.start}
              {item.end}
            </div>
          );
        })}
      </div>
    );
  }, [user.schools]);

  return (
    <div className="App">
      <Profiler id="render" onRender={renderCallback}>
        <header className="App-header">
          {user.name}
          <button onClick={handleSchools}>修改学校1</button>
          <button onClick={handleSchools2}>修改学校2</button>
          <button onClick={handleSchools3}>修改学校3</button>
          <div>{renderSchools}</div>
        </header>
      </Profiler>
    </div>
  );
}
```

我们来看一下结果会怎么样。

测试按钮 1：

- 点击 修改学校1，触发 handleSchools 函数
- 渲染原因 update,本次更新 committed 花费的渲染时间 0.8999999999068677
- 渲染失败，由于 user.schools 没有改变，renderSchools 不会重新渲染
- 再次点击 修改学校1，触发 handleSchools 函数
- 渲染原因 update,本次更新 committed 花费的渲染时间 0.10000000009313226

测试按钮 2：

- 点击 修改学校2，触发 handleSchools 函数
- 渲染原因 update,本次更新 committed 花费的渲染时间 1.6000000000931323
- 渲染成功
- 再次点击 修改学校2，触发 handleSchools 函数
- 没有进行任何修改，同时也没有触发 renderCallback

测试按钮 3：

- 点击 修改学校3，触发 handleSchools 函数
- 渲染原因 update,本次更新 committed 花费的渲染时间 1.300000000745058
- 渲染成功
- 再次点击 修改学校3，触发 handleSchools 函数
- 渲染原因 update,本次更新 committed 花费的渲染时间 0.5

根据上述条件，我们可以看到 immutability-helper 的第二个好处，如果当前数据没有改变，将不会改变对象，从而不会触发渲染。

这里尝试把 schools 数据长度增加到 10002，再做一下测试。发现花费的渲染时间没有太多改变，均在 40 ms 左右，此时我们用 console.time 测试一下深拷贝和 immutability-helper 的时间差距。

```ts
const handleSchools2 = () => {
  console.time("浅拷贝");
  const newUser = update(
    user,
    convertImmutabilityByPath("schools[0].name", {
      $set: "测试小学2",
    }),
  );
  console.timeEnd("浅拷贝");
  setUser(newUser);
};

const handleSchools3 = () => {
  user.schools[0].name = "测试小学3";
  console.time("深拷贝");
  const newUser = JSON.parse(JSON.stringify(user));
  console.timeEnd("深拷贝");
  setUser(newUser);
};
```

得出的结果如下所示

- 浅拷贝: 1.807861328125 ms
- 浅拷贝: 0.165771484375 ms（第二次调用）
- 深拷贝: 8.59716796875 ms

测试下来有 4 倍的性能差距，再尝试在数据中添加 4 个 schools 大小的数据.

- 浅拷贝: 3.60302734375 ms
- 浅拷贝: 0.10107421875 ms（第二次调用）
- 深拷贝: 28.789794921875 ms

可以看到，随着数据的增大，耗费的时间差距也变得非常恐怖。

## 源代码分析

immutability-helper 仅有几百行代码。实现也非常简单。我们一起来看看作者是如何开发这个工具库的。

先是工具函数(保留核心,环境判断，错误警告等逻辑去除):

```ts
// 提取函数，大量使用时有一定性能优势
const hasOwnProperty = Object.prototype.hasOwnProperty;
const splice = Array.prototype.splice;
const toString = Object.prototype.toString;

// 检查类型
function type<T>(obj: T) {
  return (toString.call(obj) as string).slice(8, -1);
}

// 浅拷贝，使用 Object.assign，如果没有就手写一个
const assign = Object.assign || /* istanbul ignore next */
  (<T, S>(target: T & any, source: S & Record<string, any>) => {
    getAllKeys(source).forEach((key) => {
      if (hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    });
    return target as T & S;
  });

// 获取对象 key
const getAllKeys = typeof Object.getOwnPropertySymbols === "function"
  ? (obj: Record<string, any>) =>
    Object.keys(obj).concat(Object.getOwnPropertySymbols(obj) as any)
  : /* istanbul ignore next */
    (obj: Record<string, any>) => Object.keys(obj);

// 所有类型的拷贝函数
// 如果不是数组，Map,Set，对象，直接返回 拷贝值
function copy<T, U, K, V, X>(
  object: T extends ReadonlyArray<U> ? ReadonlyArray<U>
    : T extends Map<K, V> ? Map<K, V>
    : T extends Set<X> ? Set<X>
    : T extends object ? T
    : any,
) {
  return Array.isArray(object)
    ? assign(object.constructor(object.length), object)
    : (type(object) === "Map")
    ? new Map(object as Map<K, V>)
    : (type(object) === "Set")
    ? new Set(object as Set<X>)
    : (object && typeof object === "object")
    ? assign(Object.create(Object.getPrototypeOf(object)), object) as T
    : /* istanbul ignore next */
      object as T;
}
```

然后是核心代码(同样保留核心) :

```ts
export class Context {
  // 导入所有指令
  private commands: Record<string, any> = assign({}, defaultCommands);

  // 添加扩展指令(指令不要和对象中数据 key 相同)
  public extend<T>(directive: string, fn: (param: any, old: T) => T) {
    this.commands[directive] = fn;
  }

  // 功能核心
  public update<T, C extends CustomCommands<object> = never>(
    object: T,
    $spec: Spec<T, C>,
  ): T {
    // 增强健壮性，如果操作命令是函数,修改为 $apply
    const spec = (typeof $spec === "function") ? { $apply: $spec } : $spec;

    // 返回对象(数组)
    let nextObject = object;
    // 遍历对象，获取数据项和指令
    getAllKeys(spec).forEach((key: string) => {
      // 传入的是一个对象，如果当前 key 是指令的话，就进行操作
      if (hasOwnProperty.call(this.commands, key)) {
        // 性能优化,遍历过程中，如果 object 还是当前之前数据
        const objectWasNextObject = object === nextObject;

        // 用指令修改对象
        nextObject = this.commands[key](
          (spec as any)[key],
          nextObject,
          spec,
          object,
        );

        // 修改后，两者使用传入函数计算，还是相等的情况下，直接使用之前数据
        // 这样的话，数据没有修改，对象也不会改变
        if (objectWasNextObject && this.isEquals(nextObject, object)) {
          nextObject = object;
        }
      } else {
        // 不在指令集中，做其他操作
        // 类似于 update(collection, {2: {a: {$splice: [[1, 1, 13, 14]]}}});
        // 解析对象规则后继续递归调用 update, 不断递归，不断返回
        const nextValueForKey = type(object) === "Map"
          ? this.update((object as any as Map<any, any>).get(key), spec[key])
          : this.update(object[key], spec[key]);
        const nextObjectValue = type(nextObject) === "Map"
          ? (nextObject as any as Map<any, any>).get(key)
          : nextObject[key];
        // 内部数据有改变的情况下，进行 copy 操作
        if (
          !this.isEquals(nextValueForKey, nextObjectValue) ||
          typeof nextValueForKey === "undefined" &&
            !hasOwnProperty.call(object, key)
        ) {
          if (nextObject === object) {
            nextObject = copy(object as any);
          }
          if (type(nextObject) === "Map") {
            (nextObject as any as Map<any, any>).set(key, nextValueForKey);
          } else {
            nextObject[key] = nextValueForKey;
          }
        }
      }
    });
    // 返回对象
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
    if (type(nextObject) === "Map") {
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

根据上述代码，我们终于了解到了为什么作者需要传递一个对象来进行处理，同时我们也可以看出来如果当前数据路径的 key 值和指令相同就会出现错误。

## 其他

```ts
convertImmutabilityByPath(
  `schools[${index}].name`,
  { $set: "试试小学" },
);
```

大家在看到如上代码会想到什么呢？就是个人之前在 [手写一个业务数据比对库](https://github.com/wsafight/personBlog/issues/49) 中推荐的 [westore](https://github.com/Tencent/westore) diff 函数。

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

后续个人会结合 diff 以及 immutability-helper 开发一些有趣的工具。

## 参考资料

[immutability-helper](https://github.com/kolodny/immutability-helper)

[val-path-helper](https://github.com/wsafight/val-path-helper)

[immutability-helper实践与优化](https://cloud.tencent.com/developer/article/1907994)
