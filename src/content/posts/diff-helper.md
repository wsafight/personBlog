---
title: 手写一个业务数据比对库
published: 2022-12-01
description: 介绍了如何编写一个业务数据比对库，方便开发者在提交数据到服务端时去除不必要的信息。包括简单对象比对、复杂属性比对、自定义对象属性比对等功能。
tags: [JavaScript, 工具开发]
category: 工程实践
draft: false
---

在开发 web 应用程序时，性能都是必不可少的话题。同时通用 web 应用程序离不开数据的增删改查，虽然用户大部分操作都是在查询，但是我们也不可以忽略更改数据对于系统的影响。于是个人写了一个业务数据比对库 [diff-helper](https://github.com/wsafight/diff-helper.git)。方便开发者在前端提交数据到服务端时候去除不必要的信息，优化网络传输和服务端性能。

## 项目演进

任何项目都不是一触而就的，下面是关于 diff-helper 库的编写思路。希望能对大家有一些帮助。

### 简单对象比对

前端提交 JSON 对象数据时，很多情况下都是对象一层数据比对。在不考虑对象中还有复杂数据（嵌套对象和数组）的情况下，编写如下代码

```ts
// newVal 表示新数据，oldVal 表示老数据
const simpleObjDiff = ({
  newVal,
  oldVal,
}): Record<string, any> => {
  // 当前比对的结果
  const diffResult: Record<string, any> = {};

  // 已经检查过的数据项，可以优化遍历性能
  const checkedKeys: Set<string> = new Set();

  // 遍历最新的对象属性
  Object.keys(newVal).forEach((key: string) => {
    // 将新数据的 key 记录一下
    checkedKeys.add(key);

    // 如果当前新的数据不等于老数据，直接把新的比对结果放入
    if (newVal[key] !== oldVal[key]) {
      diffResult[key] = newVal[key];
    }
  });

  // 遍历之前的对象属性
  Object.keys(oldVal).forEach((key) => {
    // 如果已经检查过了，不在进行处理
    if (checkedKeys.has(key)) {
      return;
    }

    // 新的数据有，但是老数据没有可以认为数据已经不存在了
    diffResult[key] = null;
  });
  return diffResult;
};
```

此时我们就可以使用该函数进行一系列简单数据操作了。

```ts
const result = simpleObjDiff({
  newVal: {
    a: 1,
    b: 1,
  },
  oldVal: {
    a: 2,
    c: 2,
  },
});
// => 返回结果为
result = {
  a: 1,
  b: 1,
  c: null,
};
```

#### 添加复杂属性比对

当前函数在面对对象内部有复杂类型时候就没办法判断了，即使没有更改的情况下，结果也会包含新数据属性，但是考虑到提交到服务端的表单数据一般不需要增量提交，所以这里试一试 JSON.stringify 。

诸如:

```ts
JSON.stringify("123");
// '"123"'

JSON.stringify(123);
// '123'

JSON.stringify(new Date());
// '"2022-11-29T15:16:46.325Z"'

JSON.stringify([1, 2, 3]);
// '[1,2,3]'

JSON.stringify({ a: 1, b: 2 });
// '{"b":2,"a":1}'

JSON.stringify({ b: 2, a: 1 });
// '{"b":2,"a":1}'

JSON.stringify({ b: 2, a: 1 }, ["a", "b"]);
// '{"a":1,"b":2}'

JSON.stringify({ b: 2, a: 1 }, ["a", "b"]) === JSON.stringify({ a: 1, b: 2 });
// true
```

对比上述结果，我们可以看到，JSON.stringify 如果不提供 replacer 可能会对对象类型数据的生成结果产生“误伤”。但从系统实际运行上来说，对象内部属性不太会出现排序变化的情况。直接进行以下改造：

```ts
const simpleObjDiff = ({
  newVal,
  oldVal,
}): Record<string, any> => {
  // ... 之前的代码

  // 遍历最新的对象数据
  Object.keys(newVal).forEach((key: string) => {
    // 当前已经处理过的对象 key 记录一下
    checkedKeys.add(key);

    // 先去查看类型，判断相同类型后再使用 JSON.stringify 获取字符串结果进行比对
    if (
      typeof newVal[key] !== typeof oldVal[key] ||
      JSON.stringify(newVal[key]) !== JSON.stringify(oldVal[key])
    ) {
      diffResult[key] = newVal[key];
    }
  });

  // ... 之前的代码
};
```

这时候尝试一下复杂数据类型

```ts
const result = simpleObjDiff({
  newVal: {
    a: 1,
    b: 1,
    d: [1, 2, 3],
  },
  oldVal: {
    a: 2,
    c: 2,
    d: [1, 2, 3],
  },
});
// => 返回结果为
result = {
  a: 1,
  b: 1,
  c: null,
};
```

#### 添加自定义对象属性比对

如果只使用 JSON.stringify 话，函数就没有办法灵活的处理各种需求，所以笔者开始追加函数让用户自行适配。

```ts
const simpleObjDiff = ({
  newVal,
  oldVal,
  options,
}): Record<string, any> => {
  // ... 之前的代码

  // 获取用户定义的 diff 函数
  const { diffFun } = { ...DEFAULT_OPTIONS, ...options };

  // 判断当前传入数据是否是函数
  const hasDiffFun = typeof diffFun === "function";

  // 遍历最新的对象数据
  Object.keys(newVal).forEach((key: string) => {
    // 当前已经处理过的对象 key 记录一下
    checkedKeys.add(key);

    let isChanged = false;

    if (hasDiffFun) {
      // 把当前属性 key 和对应的新旧值传入从而获取结果
      const diffResultByKey = diffFun({
        key,
        newPropVal: newVal[key],
        oldPropVal: oldVal[key],
      });

      // 返回了结果则写入 diffResult，没有结果认为传入的函数不处理
      // 注意是不处理，而不是认为不变化
      // 如果没返回就会继续走 JSON.stringify
      if (
        diffResultByKey !== null &&
        diffResultByKey !== undefined
      ) {
        diffResult[key] = diffResultByKey;
        isChanged = true;
      }
    }

    if (isChanged) {
      return;
    }

    if (
      typeof newVal[key] !== typeof oldVal[key] ||
      JSON.stringify(newVal[key]) !== JSON.stringify(oldVal[key])
    ) {
      diffResult[key] = newVal[key];
    }
  });

  // ... 之前的代码
};
```

此时我们尝试传入 diffFun 来看看效果：

```ts
const result = simpleObjDiff({
  newVal: {
    a: [12, 3, 4],
    b: 11,
  },
  oldVal: {
    a: [1, 2, 3],
    c: 22,
  },
  options: {
    diffFun: ({
      key,
      newPropVal,
      oldPropVal,
    }) => {
      switch (key) {
        // 处理对象中的属性 a
        case "a":
          // 当前数组新旧数据都有的数据项才会保留下来
          return newPropVal.filter((item: any) => oldPropVal.includes(item));
      }
      // 其他我们选择不处理，使用默认的 JSON.stringify
      return null;
    },
  },
});
// => 结果如下所示
result = {
  a: [3],
  b: 11,
  c: null,
};
```

通过 diffFun 函数，开发者不但可以自定义属性处理，还可以利用 [fast-json-stringify](https://github.com/fastify/fast-json-stringify) 来优化内部属性处理。该库通过 JSON schema 预先告知对象内部的属性类型，在提前知道数据类型的情况下，针对性处理会让 fast-json-stringify 性能非常高。

```ts
import fastJson from "fast-json-stringify";

const stringify = fastJson({
  title: "User Schema",
  type: "object",
  properties: {
    firstName: {
      type: "string",
    },
    lastName: {
      type: "string",
    },
    age: {
      description: "Age in years",
      type: "integer",
    },
  },
});

stringify({
  firstName: "Matteo",
  lastName: "Collina",
  age: 32,
});
// "{\"firstName\":\"Matteo\",\"lastName\":\"Collina\",\"age\":32}"

stringify({
  lastName: "Collina",
  age: 32,
  firstName: "Matteo",
})；
// "{\"firstName\":\"Matteo\",\"lastName\":\"Collina\",\"age\":32}"
```

可以看到，利用 fast-json-stringify 同时无需考虑对象属性的内部顺序。

#### 添加其他处理

这时候开始处理其他问题：

```ts
// 添加异常错误抛出
const invariant = (condition: boolean, errorMsg: string) => {
  if (condition) {
    throw new Error(errorMsg);
  }
};

// 判断是否是真实的对象
const isRealObject = (val: any): val is Record<string, any> => {
  return Object.prototype.toString.call(val) === "[object Object]";
};

simpleObjDiff = ({
  newVal,
  oldVal,
  options,
}: SimpleObjDiffParams): Record<string, any> => {
  // 添加错误传参处理
  invariant(!isRealObject(newVal), "params newVal must be a Object");
  invariant(!isRealObject(oldVal), "params oldVal must be a Object");

  // ...
  const { diffFun, empty } = { ...DEFAULT_OPTIONS, ...options };

  // ...

  Object.keys(oldVal).forEach((key) => {
    // 如果已经检查过了，直接返回
    if (checkedKeys.has(key)) {
      return;
    }
    // 设定空数据，建议使用 null 或 空字符串
    diffResult[key] = empty;
  });
};
```

简单对象比对函数就基本完成了。有兴趣的同学也可以直接阅读 [obj-diff 源码](https://github.com/wsafight/diff-helper/blob/main/src/obj-diff.ts) 。

### 简单数组对比

接下来就开始处理数组了，数组的比对核心在于数据的主键识别。代码如下：

```ts
const simpleListDiff = ({
  newVal,
  oldVal,
  options,
}: SimpleObjDiffParams) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 获取当前的主键 key 数值，不传递 key 默认为 'id'
  const { key, getChangedItem } = opts;

  // 增删改的数据
  const addLines = [];
  const deletedLines = [];
  const modifiedLines = [];

  // 添加检测过的数组主键，ListKey 是数字或者字符串类型
  const checkedKeys: Set<ListKey> = new Set<ListKey>();

  // 开始进行传入数组遍历
  newVal.forEach((newLine) => {
    // 根据主键去寻找之前的数据，也有可能新数据没有 key，这时候也是找不到的
    let oldLine: any = oldVal.find((x) => x[key] === newLine[key]);

    // 发现之前没有，走添加数据逻辑
    if (!oldLine) {
      addLines.push(newLine);
    } else {

      // 更新的数据 id 添加到 checkedKeys 里面去，方便删除
      checkedKeys.add(oldLine[key]);

      // 传入函数 getChangedItem 来获取结果
      const result = getChangedItem!({
        newLine,
        oldLine,
      });

      // 没有结果则认为当前数据没有改过,无需处理
      // 注意，和上面不同，这里返回 null 则认为数据没有修改
      if (result !== null && result !== undefined) {
        modifiedLines.push(result);
      }
    }
  });

  oldVal.forEach((oldLine) => {
    // 之前更新过不用处理
    if (checkedKeys.has(oldLine[key])) {
      return;
    }

    // 剩下的都是删除的数据
    deletedLines.push({
      [key]: oldLine[key],
    });
  });

  return {
    addLines,
    deletedLines,
    modifiedLines,
  };
};
```

此时我们就可以使用该函数进行一系列简单数据操作了。

```ts
const result = simpleListDiff({
  newVal: [{
    id: 1,
    cc: "bbc",
  },{
    bb: "123",
  }],
  oldVal: [{
    id: 1,
    cc: "bb",
  }, {
    id: 2,
    cc: "bdf",
  }],
  options: {
    // 传入函数
    getChangedItem: ({
      newLine,
      oldLine,
    }) => {
      // 利用对象比对 simpleObjDiff 来处理
      const result = simpleObjDiff({
        newVal: newLine,
        oldVal: oldLine,
      });

      // 发现没有改动，返回 null
      if (!Object.keys(result).length) {
        return null;
      }

      // 否则返回对象比对过的数据
      return { id: newLine.id, ...result };
    },
    key: "id",
  },
});
// => 返回结果为
result = {
  addedLines: [{
    bb: "123",
  }],
  deletedLines: [{
    id: 2,
  }],
  modifiedLines: [{
    id: 1,
    cc: "bbc",
  }],
};
```

函数到这里就差不多可用了，我们可以传入参数然后拿到比对好的结果发送给服务端进行处理。

#### 添加默认对比函数

这里就不传递 getChangedItem 的逻辑，函数将做如下处理。如此我们就可以不传递 getChangedItem 函数了。

```ts
const simpleListDiff = ({
  newVal,
  oldVal,
  options,
}: SimpleObjDiffParams) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 获取当前的主键 key 数值，不传递 key 默认为 'id'
  const { key } = opts;

  let { getChangedItem } = opts;

  // 如果没有传递 getChangedItem，就使用 simpleObjDiff 处理
  if (!getChangedItem) {
    getChangedItem = ({
      newLine,
      oldLine,
    }) => {
      const result = simpleObjDiff({
        newVal: newLine,
        oldVal: oldLine,
      });
      if (!Object.keys(result).length) {
        return null;
      }
      return { [key]: newLine[key], ...result };
    };
  }

  //... 之前的代码
};
```

#### 添加排序功能

部分表单提交不仅仅只需要增删改，还有排序功能。这样的话即使用户没有进行过增删改，也是有可能修改顺序的。此时我们在数据中添加序号，做如下改造：

```ts
const simpleListDiff = ({
  newVal,
  oldVal,
  options,
}: SimpleObjDiffParams) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 此时传入 sortName，不传递则不考虑排序问题
  const { key, sortName = "" } = opts;

  // 判定是否有 sortName 这个配置项
  const hasSortName: boolean = typeof sortName === "string" &&
    sortName.length > 0;

  let { getChangedItem } = opts;

  if (!getChangedItem) {
    //
  }

  const addLines = [];
  const deletedLines = [];
  const modifiedLines = [];
  // 添加 noChangeLines
  const noChangeLines = [];

  const checkedKeys: Set<ListKey> = new Set<ListKey>();

  newVal.forEach((newLine, index: number) => {
    // 这时候需要查询老数组的索引，是利用 findIndex 而不是 find
    let oldLineIndex: any = oldVal.findIndex((x) => x[key] === newLine[key]);

    // 没查到
    if (oldLineIndex === -1) {
      addLines.push({
        ...newLine,
        // 如果有 sortName 这个参数，我们就添加当前序号（索引 + 1）
        ...hasSortName && { [sortName]: index + 1 },
      });
    } else {
      // 通过索引来获取之前的数据
      const oldLine = oldVal[oldLineIndex];

      // 判定是否需要添加顺序参数，如果之前的索引和现在的不同就认为是改变的
      const addSortParams = hasSortName && index !== oldLineIndex;

      checkedKeys.add(oldLine[key]);

      const result = getChangedItem!({
        newLine,
        oldLine,
      });

      if (result !== null && result !== undefined) {
        modifiedLines.push({
          ...result,
          // 更新的数据同时添加排序信息
          ...addSortParams && { [sortName]: index + 1 },
        });
      } else {
        // 这里是没有修改的数据
        // 处理数据没改变但是顺序改变的情况
        if (addSortParams) {
          noChangeLines.push({
            [key!]: newLine[key!],
            [sortName]: index + 1,
          });
        }
      }
    }
  });

  //... 其他代码省略，删除不用考虑顺序了

  return {
    addLines,
    deletedLines,
    modifiedLines,
    // 返回不修改的 line
    ...hasSortName && {
      noChangeLines,
    },
  };
};
```

开始测试一下：

```ts
simpleListDiff({
  newVal: [
    { cc: "bbc" }, 
    { id: 1, cc: "bb" }
  ],
  oldVal: [
    { id: 1, cc: "bb" }
  ],
  options: {
    key: "id",
    sortName: "sortIndex",
  },
});
// 同样也支持为新增和修改的数据添加 sortIndex
result = {
  addedLines: [
    {
      cc: "bbc",
      // 新增的数据目前序号为 1
      sortIndex: 1,
    },
  ],
  // id 为 1 的数据位置变成了 2，但是没有发生数据的改变
  noChangeLines: [{
    id: 1,
    sortIndex: 2,
  }],
  deletedLines: [],
  modifiedLines: [],
};
```

简单数组比对函数就基本完成了。有兴趣的同学也可以直接阅读 [list-diff 源码](https://github.com/wsafight/diff-helper/blob/main/src/list-diff.ts) 。

以上所有代码都在 [diff-helper](https://github.com/wsafight/diff-helper.git) 中，针对复杂的服务端数据请求，可以通过传参使得两个函数能够嵌套处理。同时也欢迎大家提出 issue 和 pr。

## 其他

针对形形色色需求，上述两种函数处理方案也是不够用的，我们来看看其他的对比方案。

### 数据递归比对

当前库也提供了一个对象或者数组的比对函数 commonDiff。可以嵌套的比对函数，可以看一下实际效果。

```ts
import { commonDiff } from "diff-helper";

commonDiff({
  a: {
    b: 2,
    c: 2,
    d: [1, 3, 4, [3333]],
  },
}, {
  a: {
    a: 1,
    b: 1,
    d: [1, 2, 3, [223]],
  },
});
// 当前结果均是对象，不过当前会增加 type 帮助识别类型
result = {
  type: "obj",
  a: {
    type: "obj",
    a: null,
    b: 1,
    c: 2,
    d: {
      type: "arr",
      // 数组第 2 个数据变成了 3，第 3 数据变成了 4，以此类推
      1: 3,
      2: 4,
      3: {
        type: "arr",
        0: 223,
      },
    },
  },
};
```

### westore 比对函数

[westore](https://github.com/Tencent/westore) 是个人使用过最好用的小程序工具，兼顾了性能和可用性。其中最为核心的则是它的比对函数，完美的解决了小程序 setData 时为了性能需要建立复杂字符串的问题。

以下代码是实际的业务代码中出现的：

```ts
// 更新表单项数据，为了性能，不建议每次都传递一整个 user
this.setData({ [`user.${name}`]: value });

// 设置数组里面某一项数据
this.setData({ [`users[${index}].${name}`]: value });
```

这里就不介绍 westore 的用法了，直接看一下 westore diff 的参数以及结果：

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

不过这种增量比对不适合通用场景，大家有需求可以自行查阅代码。笔者也在考虑上面两个比对函数是否有其他的使用场景。

## 参考资料

[fast-json-stringify](https://github.com/fastify/fast-json-stringify)

[westore](https://github.com/Tencent/westore)

[diff-helper](https://github.com/wsafight/diff-helper.git)


