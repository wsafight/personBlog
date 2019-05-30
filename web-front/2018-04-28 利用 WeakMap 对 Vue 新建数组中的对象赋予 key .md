# 利用 WeakMap 对 Vue 新建数组中的对象赋予 :key 

## 需求
在 Vue 中，对组件进行循环都需要加入key以便“就地复用”，可是在某些情况下，我们需要新建多个对象，而这些对象不是从后端获取到的，而是前端生成的，没有唯一值，且 Vue 目前版本只允许字符串，数字作为组件的 key。

## 方案
### 简单的组件
例如
```
<template> 
    <easy-component v-for="(item, index) in items" :key="index"/>
</template>
<script>
    export default{
        methods: {
            addSometing () {
                this.items.push({
                    // 一些属性
                    someProp
                })
            }
        }
    }
</script>
```
简单的组件，对 items 进行 CRUD 都是可以识别出来。不会影响界面的显示。

### 复杂的组件
但是对于一些复杂的组件 Vue 是识别不出来的，而且在删除时候会发生错乱。  
所以需要这样写
```
<template> 
    <complex-component v-for="item in items :key="item.id"/>
</template>
<script>
    export default{
        methods: {
            addSometing () {
                this.items.push({
                    id: getUidFunction(),
                    // 一些属性
                    someProp
                })
            }
        }
    }
</script>
```
在创建时候添加唯一的 key —— id ，并且在上传的时候删除数组的 id

### 缺点
很难判断你所写的组件究竟是复杂还是简单，但在数组对象中添加唯一的 id 且必须在上传之前去除它，这终究不是一个好的解决方案。

## 更好的方法 WeakMap
### 思考
在ruby语言中，我们可以唯一确定这个对象，因为每个对象新建后都有一个唯一值确定该对象。但是 js 却没有这种语言特性。所以我们要从这方面入手考虑。
### WeakMap的作用
WeakMap针对于普通的 Map 有两点特殊之处  
1、WeakMap只接受对象作为键名（ null 除外），不接受其他类型的值作为键名。  
2、WeakMap的键名所指向的对象是弱引用，不计入垃圾回收机制。  
重点在于 如果删除了WeakMap的键名所指向的对象，无需手动删除应用。  
那么 思考后代码如下
```
// 唯一key
let uKey = 1
// 弱引用Map
const uidMap = new WeakMap()

function getUniqueKey (obj) {
    if (!uidMap.has(obj)) {
        uidMap.set(obj, uKey++)
    }
    return uidMap.get(obj)
}

// 为了简单直接使用插件
const uidPlugin = {
    install (Vue) {
        Vue.prototype.$uid = getUniqueKey
    }
}

if (typeof window !== 'undefined' && window.Vue) {
    window.Vue.use(uidPlugin)
}

export { uidPlugin }
```

在复杂的组件可以这样使用
```
<template> 
    <complex-component v-for="(item, index) in items :key="$uid(item)"/>
</template>
```
无需添加唯一的 id 以及删除 id ，即插即用且不影响垃圾回收。完美！

## WeakMap  其他使用场景
1、标识 对象  
2、缓存与对象相关的 属性  
3、为对象添加监听器  
具体可参考 [Exploring ES6](http://exploringjs.com/es6/ch_maps-sets.html#_use-cases-for-weakmaps)

## 总结
新的特性对应新的解决方案，虽然js不是一门优秀的编程语言，但是js却拥有着及其优秀的社区，社区使得js可以不断进步。  
在这里我也想求教大家，有没有什么更好的解决方案，或者这篇博客中有什么不对的地方，欢迎指正，在这里感谢各位了。

<Valine></Valine>