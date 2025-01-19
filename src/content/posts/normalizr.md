---
title: 使用 normalizr 进行复杂数据转换
published: 2022-07-25
description: 介绍了如何使用 normalizr 库来处理复杂的嵌套对象，包括数据的规范化和反规范化，以及如何通过配置选项来定制数据转换的行为。
tags: [开发工具, 性能优化]
category: 开发工具
draft: false
---

笔者曾经开发过一个数据分享类的小程序，分享逻辑上类似于百度网盘。当前数据可以由被分享者加工然后继续分享（可以控制数据的过期时间、是否可以加工数据以及继续分享）。 

分享的数据是一个深度嵌套的 json 对象。在用户读取分享数据时存入小程序云数据库中（分享的数据和业务数据有差异，没使用业务服务器进行维护）。如果拿到数据就直接存储的话，很快云数据库就会变得很大，其次我们也没办法分析各项和检索各项子数据给予分享者。

这时候需要进行数据转换以便拆分和维护。我们可以使用 [redux](http://cn.redux.js.org/) 作者 Dan Abramov 编写的 [normalizr](https://github.com/paularmstrong/normalizr) 来处理数据。

normalizr 创立的初衷是处理深层，复杂的嵌套的对象。

## 如何使用

稍微修改一下官方的例子，假定获取到如下书籍的数据：

```js
{
  id: "1",
  title: "JavaScript 从入门到放弃",
  // 作者
  author: {
    id: "1",
    name: "chc"
  },
  // 评论
  comments: [
    {
      id: "1",
      content: "作者写的太好了",
      commenter: {
        id: "1",
        name: "chc"
      }
    },
     {
      id: "2",
      content: "楼上造假数据哈",
      commenter: {
        id: "2",
        name: "dcd"
      }
    },
  ]
}
```

这时候我们可以写出 3 个主体: 书籍信息、评论以及用户。我们先从基础的数据来构造模式：

```js
import { normalize, schema } from 'normalizr';

// 构造第一个实体 用户信息
const user = new schema.Entity('users');

// 构造第二个实体 评论
const comment = new schema.Entity('comments', {
  // 评价者是用户
  commenter: user
});

// 构造第三个实体 书籍
const book = new schema.Entity('books', {
  // 作者
  author: user,
  // 评论
  comments: [comment]
});

// 传入数据以及当前最大的 schema 信息
const normalizedData = normalize(originalData, book);
```

先来看一下最终数据。

```js
{
  "entities": {
    "users": {
      "1": {
        "id": "1",
        "name": "chc"
      },
      "2": {
        "id": "2",
        "name": "dcd"
      }
    },
    "comments": {
      "1": {
        "id": "1",
        "content": "作者写的太好了",
        "commenter": "1"
      },
      "2": {
        "id": "2",
        "content": "楼上造假数据哈",
        "commenter": "2"
      }
    },
    "books": {
      "1": {
        "id": "1",
        "title": "JavaScript 从入门到放弃",
        "author": "1",
        "comments": [
          "1",
          "2"
        ]
      }
    }
  },
  "result": "1"
}
```

去除其他信息，我们可以看到获取了 3 个不同的实体对象, users，comments，books。对象的键为当前 id，值为当前平铺的数据结构。这时候我们就可以使用对象或者数组(Object.values) 来新增和更新数据。

## 解析逻辑

看到这里，大家可能是很懵的。先不管代码实现，这里先分析一下库是如何解析我们编写的 schema 的，以便大家可以在实际场景中使用，再看一遍数据和 schema 定义：

数据结构

```js
{
  id: "1",
  title: "JavaScript 从入门到放弃",
  // 作者
  author: {
    id: "1",
    name: "chc"
  },
  // 评论
  comments: [
    {
      id: "1",
      content: "作者写的太好了",
      commenter: {
        id: "1",
        name: "chc"
      }
    },
     {
      id: "2",
      content: "楼上造假数据哈",
      commenter: {
        id: "2",
        name: "dcd"
      }
    },
  ]
}
```

- 书籍信息是第一层对象，数据中有 id, title, author, comments，对应 schema 如下
  ```js
  const book = new schema.Entity('books', {
    // 作者
    author: user,
    // 一本书对应多个评论，所以这里使用数组
    comments: [comment]
  });
  ```
  其中 id ，title 是 book 本身的属性，无需关注，把需要解析的数据结构写出来。books 字符串与解析无关，对应 entities 对象的 key。

- 再看 user
  ```js
  const user = new schema.Entity('users');
  ```
  user 没有需要解析的信息，直接定义实体即可。

- 最后是评论信息
  ```js
  const comment = new schema.Entity('comments', {
    // 评价者是用户
    commenter: user
  });

  {
    id: "1",
    content: "作者写的太好了",
    commenter: {
      id: "1",
      name: "chc"
    }
  }
  ```
  把 comments 从原本的数据结构中拿出来，实际也就很清晰了。

## 高阶用法

### 处理数组

normalizr 可以解析单个对象，那么如果当前业务传递数组呢？类似于 comment 直接这样使用即可：

```js
[
  {
    id: '1',
    title: "JavaScript 从入门到放弃"
    // ...
  },
  {
    id: '2',
    // ...
  }
]

const normalizedData = normalize(originalData, [book]);
```

### 反向解析

我们只需要拿到刚才的 normalizedData 中的 result 以及 entities 就可以获取之前的信息了。

```js
import { denormalize, schema } from 'normalizr';

//...

denormalize(normalizedData.result, book, normalizedData.entities);
```

### Entity 配置

开发中可以根据配置信息重新解析实体数据。

```js
const book = new schema.Entity('books', {
  // 作者
  author: user,
  // 一本书对应多个评论，所以这里使用数组
  comments: [comment]
}， {
  // 默认主键为 id，否则使用 idAttribute 中的数据，如 cid，key 等
  idAttribute: 'id',
  // 预处理策略, 参数分别为 实体的输入值， 父对象
  processStrategy: (value, parent, key) => value,
  // 遇到两个id 相同数据的合并策略，默认如下所示，我们还可以继续修改
  mergeStrategy: (prev, prev) => ({
    ...prev,
    ...next,
    // 是否合并过，如果遇到相同的，就会添加该属性
    isMerge: true
  }),
});

// 看一下比较复杂的例子，以 user 为例子
const user = new schema.Entity('users', {
}, {
  processStrategy: (value, parent, key) => {
    // 增加父对象的属性
    // 例如 commenter: "1" => commenterId: "1" 或者 author: "2" => "authorId": "2"
    // 但是目前还无法通过 delete 删除 commenter 或者 author 属性
    parent[`${key}Id`] = value.id

    // 如果是从评论中获取的用户信息就增加 commentIds 属性
    if (key === 'commenter') { 
      return {
        ...value, 
        commentIds: [parent.id] 
      } 
    }
    // 不要忘记返回 value, 否则不会生成 user 数据
    return {
      ...value,
      bookIds: [parent.id]
    };
  }
  mergeStrategy: (prev, prev) => ({
    ...prev,
    ...next,
    // 该用户所有的评论归并到一起去
    commentIds: [...prev.commentIds, ...next.commentIds],
    // 该用户所有的书本归并到一起去
    bookIds: [...prev.bookIds, ...next.bookIds],
    isMerge: true
  }),
})

// 最终获取的用户信息为
{
  "1": {
    "id": "1",
    "name": "chc"
    // 用户 chc 写了评论和书籍，但是没有进行过合并
    "commentIds": ["1"],
    "bookIds": ["1"],
  },
  "2": {
    "id": "2",
    "name": "dcd",
    // 用户 dcd 写了 2 个评论，同时进行了合并处理
    "commentIds": [
      "2",
      "3"
    ],
    "isMerge": true
  }
}
```
  
当然了，该库也可以进行更加复杂的数据格式化，大家可以通过 [api 文档](https://github.com/paularmstrong/normalizr/blob/master/docs/api.md) 来进一步学习和使用。

## 其他

当然了，normalizr 使用场景毕竟有限，开源负责人也早已换人。目前主库已经无人维护了(issue 也也已经关闭)。当然了，normalizr 代码本身也是足够稳定。

笔者也在考虑一些新的场景使用并尝试为 normalizr 添加一些新的功能(如 id 转换)和优化(ts 重构)，如果您在使用 normalizr 的过程中遇到什么问题，也可以联系我，存储库目前在 [normalizr-helper](https://github.com/wsafight/normalizr-helper) 中。
