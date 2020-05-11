# 前端数据规范化利器 normalizr

如果你使用过 redux。你一定不会不清楚 [Dan Abramov](http://github.com/gaearon) 这位大神。而我现在要介绍的是这位大佬创造的 [normalizr](https://github.com/paularmstrong/normalizr) 库。作者创建了该库为了让前端状态库更简单的使用后端传递过来的 JSON 数据格式(许多 api 都返回具有深度嵌套对象的 JSON 数据，这种数据结构对于前端程序开发是不友好的，尤其是那些使用 Flux 或 Redux 的应用程序 )。也就是说，对于复杂的应用数据，normalizr 可以将层级的数据数据变为扁平化数据，同时也去除了重复数据。

简单结合实例说明一下。该库可以做到:

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

感觉是不是很带感，我们这里先不谈如何使用，先来讨论一下该库的适用场景。

对于大部分 web应用,是没有必要使用 normalizr 来规范化数据的，如果当前的数据没有影响性能以及开发体验，我们大可不必使用。使用 normalizr 反而会增加复杂度。

因为 Googole 的 [JSON Style Guide](https://google.github.io/styleguide/jsoncstyleguide.xml#Flattened_data_vs_Structured_Hierarchy) 中提供了一个模棱两可的解释: 虽然尽可能的使用扁平化方式，但在某些情况下使用层级形式反而更容易理解。

同时大部分情况下，如果迫切的需要扁平化数据，建议和服务端同学聊一聊。如果在使用第三方 api 情况下，可以使用

### 缓存

如果当前数据对于



我们

要尽可能使用扁平化方式，但在某型情况下使用层级形式反而更容易理解

## 使用

该库的作用是在前端

针对于前端大型建模，设计

也说不定会有奇效。



如果后端定义的结构过于拉跨，你也可以重新构建

