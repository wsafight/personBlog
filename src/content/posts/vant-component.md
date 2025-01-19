---
title: 从 VantComponent 谈 小程序维护
published: 2019-04-27
description: 探讨如何利用 VantComponent 这一工具，对项目进行高效维护
tags: [小程序开发, 工程化]
category: 小程序开发
draft: false
---

在开发小程序的时候，我们总是期望用以往的技术规范和语法特点来书写当前的小程序，所以才会有各色的小程序框架，例如 mpvue、taro 等这些编译型框架。当然这些框架本身对于新开发的项目是有所帮助。而对于老项目，我们又想要利用 vue 的语法特性进行维护，又该如何呢？  
在此我研究了一下 youzan 的 vant-weapp。而发现该项目中的组件是如此编写的。

```
import { VantComponent } from '../common/component';

VantComponent({
  mixins: [],
  props: {
    name: String,
    size: String
  },
  // 可以使用 watch 来监控 props 变化
  // 其实就是把properties中的observer提取出来
  watch: {
    name(newVal) {
       ...
    },
    // 可以直接使用字符串 代替函数调用
    size: 'changeSize'
  },
  // 使用计算属性 来 获取数据，可以在 wxml直接使用
  computed: {
    bigSize() {
      return this.data.size + 100
    }
  }，
  data: {
    size: 0
  },
  methods: {
    onClick() {
      this.$emit('click');
    },
    changeSize(size) {
       // 使用set
       this.set(size)
    }
  },

  // 对应小程序组件 created 周期
  beforeCreate() {},

  // 对应小程序组件 attached 周期
  created() {},

  // 对应小程序组件 ready 周期
  mounted() {},

  // 对应小程序组件  detached 周期
  destroyed: {}
});
```

居然发现该组件写法整体上类似于 Vue 语法。而本身却没有任何编译。看来问题是出在了导入的 VantComponet 这个方法上。下面我们开始详细介绍一下如何利用 VantComponet 来对老项目进行维护。

## TLDR (不多废话，先说结论)

小程序组件写法这里就不再介绍。这里我们给出利用 VantComponent 写 Page 的代码风格。

```
import { VantComponent } from '../common/component';

VantComponent({
  mixins: [],
  props: {
    a: String,
    b: Number
  },
  // 在页面这里 watch 基本上是没有作用了，因为只做了props 变化的watch，page不会出现 props 变化
  // 后面会详细说明为何
  watch： {},
  // 计算属性仍旧可用
  computed: {
    d() {
      return c++
    }
  },
  methods: {
    onLoad() {}
  },
  created() {},
  // 其他组件生命周期
})
```

这里你可能感到疑惑，VantComponet 不是对组件 Component 生效的吗？怎么会对页面 Page 生效呢。事实上，我们是可以使用组件来构造小程序页面的。  
在官方文档中，我们可以看到 [使用 Component 构造器构造页面](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/component.html)  
事实上，小程序的页面也可以视为自定义组件。因而，页面也可以使用 Component 构造器构造，拥有与普通组件一样的定义段与实例方法。代码编写如下:

```
Component({
    // 可以使用组件的 behaviors 机制,虽然 React 觉得 mixins 并不是一个很好的方案
    // 但是在某种程度该方案的确可以复用相同的逻辑代码
    behaviors: [myBehavior],

    // 对应于page的options，与此本身是有类型的，而从options 取得数据均为 string类型
    // 访问 页面 /pages/index/index?paramA=123&paramB=xyz
    // 如果声明有属性 paramA 或 paramB ，则它们会被赋值为 123 或 xyz，而不是 string类型
    properties: {
        paramA: Number,
        paramB: String,
    },
    methods: {
        // onLoad 不需要 option
        // 但是页面级别的生命周期却只能写道 methods中来
        onLoad() {
            this.data.paramA // 页面参数 paramA 的值 123
            this.data.paramB // 页面参数 paramB 的值 ’xyz’
        }
    }

})
```

那么组件的生命周期和页面的生命周期又是怎么对应的呢。经过一番测试，得出结果为： (为了简便。只会列出 重要的的生命周期)

```
// 组件实例被创建 到 组件实例进入页面节点树
component created -> component attched ->
// 页面页面加载 到  组件在视图层布局完成
page onLoad -> component ready ->
// 页面卸载 到 组件实例被从页面节点树移除
page OnUnload -> component detached
```

当然 我们重点不是在 onload 和 onunload 中间的状态，因为中间状态的时候，我们可以在页面中使用页面生命周期来操作更好。  
某些时候我们的一些初始化代码不应该放在 onload 里面，我们可以考虑放在 component create 进行操作，甚至可以利用 behaviors 来复用初始化代码。  
某种方面来说，如果不需要 Vue 风格，我们在老项目中直接利用 Component 代替 Page 也不失为一个不错的维护方案。毕竟官方标准，不用担心其他一系列后续问题。

## VantComponent 源码解析

### VantComponent

此时，我们对 VantComponent 开始进行解析

```
// 赋值，根据 map 的 key 和 value 来进行操作
function mapKeys(source: object, target: object, map: object) {
  Object.keys(map).forEach(key => {
    if (source[key]) {
      // 目标对象 的 map[key] 对应 源数据对象的 key
      target[map[key]] = source[key];
    }
  });
}

// ts代码，也就是 泛型
function VantComponent<Data, Props, Watch, Methods, Computed>(
  vantOptions: VantComponentOptions<
    Data,
    Props,
    Watch,
    Methods,
    Computed,
    CombinedComponentInstance<Data, Props, Watch, Methods, Computed>
  > = {}
): void {
  const options: any = {};
  // 用function 来拷贝 新的数据，也就是我们可以用的 Vue 风格
  mapKeys(vantOptions, options, {
    data: 'data',
    props: 'properties',
    mixins: 'behaviors',
    methods: 'methods',
    beforeCreate: 'created',
    created: 'attached',
    mounted: 'ready',
    relations: 'relations',
    destroyed: 'detached',
    classes: 'externalClasses'
  });

  // 对组件间关系进行编辑，但是page不需要，可以删除
  const { relation } = vantOptions;
  if (relation) {
    options.relations = Object.assign(options.relations || {}, {
      [`../${relation.name}/index`]: relation
    });
  }

  // 对组件默认添加 externalClasses，但是page不需要，可以删除
  // add default externalClasses
  options.externalClasses = options.externalClasses || [];
  options.externalClasses.push('custom-class');

  // 对组件默认添加 basic，封装了 $emit 和小程序节点查询方法，可以删除
  // add default behaviors
  options.behaviors = options.behaviors || [];
  options.behaviors.push(basic);

  // map field to form-field behavior
  // 默认添加 内置 behavior  wx://form-field
  // 它使得这个自定义组件有类似于表单控件的行为。
  // 可以研究下文给出的 内置behaviors
  if (vantOptions.field) {
    options.behaviors.push('wx://form-field');
  }

  // add default options
  // 添加组件默认配置，多slot
  options.options = {
    multipleSlots: true,// 在组件定义时的选项中启用多slot支持
    // 如果这个 Component 构造器用于构造页面 ，则默认值为 shared
    // 组件的apply-shared，可以研究下文给出的 组件样式隔离
    addGlobalClass: true
  };

  // 监控 vantOptions
  observe(vantOptions, options);

  // 把当前重新配置的options 放入Component
  Component(options);
}
```

[内置 behaviors](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/behaviors.html#%E5%86%85%E7%BD%AE-behaviors)  
[组件样式隔离](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html#%E7%BB%84%E4%BB%B6%E6%A0%B7%E5%BC%8F%E9%9A%94%E7%A6%BB)

### basic behaviors

刚刚我们谈到 basic behaviors，代码如下所示

```
export const basic = Behavior({
  methods: {
    // 调用 $emit组件 实际上是使用了 triggerEvent
    $emit() {
      this.triggerEvent.apply(this, arguments);
    },

    // 封装 程序节点查询
    getRect(selector: string, all: boolean) {
      return new Promise(resolve => {
        wx.createSelectorQuery()
          .in(this)[all ? 'selectAll' : 'select'](selector)
          .boundingClientRect(rect => {
            if (all && Array.isArray(rect) && rect.length) {
              resolve(rect);
            }

            if (!all && rect) {
              resolve(rect);
            }
          })
          .exec();
      });
    }
  }
});
```

### observe

小程序 watch 和 computed 的 代码解析

```
export function observe(vantOptions, options) {
  // 从传入的 option中得到 watch computed
  const { watch, computed } = vantOptions;

  // 添加  behavior
  options.behaviors.push(behavior);

  /// 如果有 watch 对象
  if (watch) {
    const props = options.properties || {};
    // 例如:
    // props: {
    //   a: String
    // },
    // watch: {
    //   a(val) {
    //     // 每次val变化时候打印
    //     consol.log(val)
    //   }
    }
    Object.keys(watch).forEach(key => {

      // watch只会对prop中的数据进行 监视
      if (key in props) {
        let prop = props[key];
        if (prop === null || !('type' in prop)) {
          prop = { type: prop };
        }
        // prop的observer被watch赋值，也就是小程序组件本身的功能。
        prop.observer = watch[key];
        // 把当前的key 放入prop
        props[key] = prop;
      }
    });
    // 经过此方法
    // props: {
    //  a: {
    //    type: String,
    //    observer: (val) {
    //      console.log(val)
    //    }
    //  }
    // }
    options.properties = props;
  }

  // 对计算属性进行封装
  if (computed) {
    options.methods = options.methods || {};
    options.methods.$options = () => vantOptions;

    if (options.properties) {

      // 监视props，如果props发生改变，计算属性本身也要变
      observeProps(options.properties);
    }
  }
}
```

### observeProps

现在剩下的也就是 observeProps 以及 behavior 两个文件了，这两个都是为了计算属性而生成的，这里我们先解释 observeProps 代码

```
export function observeProps(props) {
  if (!props) {
    return;
  }

  Object.keys(props).forEach(key => {
    let prop = props[key];
    if (prop === null || !('type' in prop)) {
      prop = { type: prop };
    }

    // 保存之前的 observer，也就是上一个代码生成的prop
    let { observer } = prop;
    prop.observer = function() {
      if (observer) {
        if (typeof observer === 'string') {
          observer = this[observer];
        }

        // 调用之前保存的 observer
        observer.apply(this, arguments);
      }

      // 在发生改变的时候调用一次 set 来重置计算属性
      this.set();
    };
    // 把修改的props 赋值回去
    props[key] = prop;
  });
}
```

### behavior

最终 behavior，也就算 computed 实现机制

```

// 异步调用 setData
function setAsync(context: Weapp.Component, data: object) {
  return new Promise(resolve => {
    context.setData(data, resolve);
  });
};

export const behavior = Behavior({
  created() {
    if (!this.$options) {
      return;
    }

    // 缓存
    const cache = {};
    const { computed } = this.$options();
    const keys = Object.keys(computed);

    this.calcComputed = () => {
      // 需要更新的数据
      const needUpdate = {};
      keys.forEach(key => {
        const value = computed[key].call(this);
        // 缓存数据不等当前计算数值
        if (cache[key] !== value) {
          cache[key] = needUpdate[key] = value;
        }
      });
      // 返回需要的更新的 computed
      return needUpdate;
    };
  },

  attached() {
    // 在 attached 周期 调用一次，算出当前的computed数值
    this.set();
  },

  methods: {
    // set data and set computed data
    // set可以使用callback 和 then
    set(data: object, callback: Function) {
      const stack = [];
      // set时候放入数据
      if (data) {
        stack.push(setAsync(this, data));
      }

      if (this.calcComputed) {
        // 有计算属性，同样也放入 stack中，但是每次set都会调用一次，props改变也会调用
        stack.push(setAsync(this, this.calcComputed()));
      }

      return Promise.all(stack).then(res => {
        // 所有 data以及计算属性都完成后调用callback
        if (callback && typeof callback === 'function') {
          callback.call(this);
        }
        return res;
      });
    }
  }
});
```

## 写在后面

- js 是一门灵活的语言(手动滑稽)
- 本身 小程序 Component 在 小程序 Page 之后，就要比 Page 更加成熟好用，有时候新的方案往往藏在文档之中，每次多看几遍文档绝不是没有意义的。

- 小程序版本 版本 2.6.1 Component 目前已经实现了 observers，可以监听 props data [数据监听器](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/observer.html),目前 VantComponent 没有实现，当然本身而言，Page 不需要对 prop 进行监听，因为进入页面压根不会变，而 data 变化本身就无需监听，直接调用函数即可，所以对 page 而言，observers 可有可无。

- 该方案也只是对 js 代码上有 vue 的风格，并没在 template 以及 style 做其他文章。

- 该方案性能一定是有所缺失的，因为 computed 是每次 set 都会进行计算，而并非根据 set 的 data 来进行操作，在删减之后我认为本身是可以接受。如果本身对于 vue 的语法特性需求不高，可以直接利用 Component 来编写 Page，选择不同的解决方案实质上是需要权衡各种利弊。如果本身是有其他要求或者新的项目，仍旧推荐使用新技术，如果本身是已有项目并且需要维护的，同时又想拥有 Vue 特性。可以使用该方案，因为代码本身较少，而且本身也可以基于自身需求修改。

- 同时，vant-weapp 是一个非常不错的项目，推荐各位可以去查看以及 star。
