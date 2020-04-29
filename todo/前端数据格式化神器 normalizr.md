# 精读 前端数据可视化利器 normalizr

如果你使用过 redux。你一定不会不清楚 [Dan Abramov](http://github.com/gaearon)。而我现在要介绍的是这位大佬开发的 [normalizr](https://github.com/paularmstrong/normalizr) 这个库。作者创建了该库为了让前端状态库更简单的使用后端传递过来的 JSON 数据格式。

简单结合实例说明一下。他可以做到:

```js
{
  "id": "123",
  "author": {
    "id": "1",
    "name": "Paul"
  },
  "title": "My awesome blog post",
  "comments": [
    {
      "id": "324",
      "commenter": {
        "id": "2",
        "name": "Nicole"
      }
    }
  ]
}

// 经过该库 解析后 => 

{
  result: "123",
  entities: {
    "articles": {
      "123": {
        id: "123",
        author: "1",
        title: "My awesome blog post",
        comments: [ "324" ]
      }
    },
    "users": {
      "1": { "id": "1", "name": "Paul" },
      "2": { "id": "2", "name": "Nicole" }
    },
    "comments": {
      "324": { id: "324", "commenter": "2" }
    }
  }
}
```

如果我们想要取得作者想让我们，如果处理类似转换也很不错。优化

