---
title: 漫谈受控与非受控组件
published: 2020-06-13
description: 探讨了 React 中受控与非受控组件的区别，结合实际案例分析何时选择受控组件、何时选择非受控组件，以及非受控组件在 React 中的设计价值。
tags: [React, 组件]
category: 前端框架
draft: false
---

>  在大多数情况下，我们推荐使用 [受控组件](https://zh-hans.reactjs.org/docs/forms.html#controlled-components) 来处理表单数据。在一个受控组件中，表单数据是由 React 组件来管理的。另一种替代方案是使用非受控组件，这时表单数据将交由 DOM 节点来处理。

以上是 React 官网对受控组件与非受控组件的一次解释，大学刚刚毕业时候，看到这一段， 实在有些难以接受，在我看来，既然已经选择使用了 React ,就应该完全彻底的使用受控组件，为什么开发者会有直接使用 DOM 节点开发的的非受控组件。当时在 vue 中，并没有这种设定。同时我当时在开发 Sass 网站，因为在开发 pc 端网站总是需要即时验证(即时给予用户交互，不让用户在填写完整的数据后再提示错误以致于过分沮丧)。

不过现在来看，非受控组件的确是 React 非常好的设计。

## 非受控与受控组件的区别与选择

**非受控的输入**就像传统的HTML表单输入一样：

```jsx
class Form extends Component {
  /** 提交时候获取数据 */  
  handleSubmitClick = () => {
    const name = this._name.value;
    // 检测数据提示然后
  }
  render() {
    return  (
      <div>
        <input type="text" ref={input => this._name = input} />
        <button onClick={this.handleSubmitClick}>Sign up</button>
      </div>
    );
  }
}
```

我们只有在触发其他事件(例如点击提交按钮时)，才可以获取 DOM 数据中的值。

**受控的输入**接受当前的值作为参数，并且在值发生改变的时候执行回调函数。

```jsx
class NameForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {value: ''};

    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  handleChange(event) {
    this.setState({value: event.target.value});
  }

  handleSubmit(event) {
    alert('提交的名字: ' + this.state.value);
    event.preventDefault();
  }

  render() {
    return (
      <form onSubmit={this.handleSubmit}>
        <label>
          名字:
          <input type="text" value={this.state.value} onChange={this.handleChange} />
        </label>
        <input type="submit" value="提交" />
      </form>
    );
  }
}
```

当用户一旦进行了数据的修改，程序立刻就可以知道哪些状态发生了改变，这时候我们就可以基于状态修改来构建更好的表单交互与用户体验。

受控与非受控组件可以类比服务器和客户端的 push 和 pull 模型，push 是服务器主动发送数据给客户端，一旦有“数据改变”就立即推送，所以用户可以基于最新的消息做处理，而 pull 模型没法知道数据的细节变化，即使遇到了错误输出也只能间接检查通知用户。

如果你的表单在交互的过程中足够简单，仅仅只需要提交时候验证，并且没有级联数据，强制格式输入等复杂用户交互。那么可以选择非受控组件。当然选择并不是一次性的，我们可以在开发过程中迁移非受控组件到受控组件(应该没有小伙伴反向操作吧)。

## 全量与增量问题

事实上，我们在生活与开发过程中，总是会遇到类似 React 中受控与非受控组件等同的问题。其实也就是全量与增量问题。基于不同的领域，不同的设计目标，不同的用户，不同的团队，当前受限的资源以及当下要完成的目标设定，都会影响问题的最终决策。这里我列出最近我遇到的几个问题。供大家参考阅读。

### 老程序库 ts 升级

从去年开始，新项目都使用 TypeScript 进行开发，面对复杂的大型项目来说，TypeScript 利好不言而喻。尤其在业务不稳定，面临大量改动时候。动态类型总会让人担惊受怕。对于老项目，我们也想从中得到 TypeScript 的利好。

前端的 Vue 项目已经开发 3 年多了，当前的项目也从一个简单的单页面应用程序变成了基于业务的多页面应用。同时也拆分出来一系列的基础库与 widget。

我们都知道修改必然是从基础升级，目前我们还面临着繁重的开发任务，所以我们没有时间资源进行全量升级，同时基础依赖中也有 Vue 业务组件。Vue 3 此时的开发进度也让我们“进退两难”。所以我们只能想去改动非组件的辅助代码。

这是我们先增加了 tsc 编译配置，可以让新模块使用 TypeScript，同时可以在空闲时候修改部分老代码。

但是，作为依赖库，仅仅只在内部 TypeScript 代码是不够的，进一步来说，老大还想要定义文件(.d.ts)辅助其他项目开发。所以我们使用 tsc 编译出当前代码的所有 TypeScript 定义文件，然后使用 gulp-insert 对定义文件进行修改后投入使用。

### 小程序组件开发

面对移动端 Sass 开发，我们仍要提供复杂的表单，同时移动端不需要太多的交互。结合小程序 setData 非常耗费性能，同时小程序组件不像 Vue，React 有单向数据流的说法。所以数据放在各个组件内部反而更好，最后在提交时候，把各个组件的数据组合起来进行验证与对比提交，无论是性能还是开发都具有更好的体验。所以小程序表单提交反而使用“非受控组件”更好。

当然，移动端表单的侧重点是减少用户的输入，开发的精力应该投入在表单的默认数据上，从而减少用户的输入操作。

### 查询非法字符

在用户创造价值的时代中，审核用户提供的数据一定是重中之重。而我们目前小程序可以提供分享功能。而小程序本身也有查询文本安全的增值服务 api [security.msgSecCheck](https://developers.weixin.qq.com/community/servicemarket/detail/00040275a14468e0e689194b251015)。

这时候我们有两种选择,我们可以每一次提交可分享数据时候检查并提示含有非法字符，这样用户可以清楚的知道该次的数据提交中有非法字符。当然也可以在最终分享的时候提示有非法信息，但是此时面对如此大的数据量分享，用户恐怕很难查询出究竟是哪条信息出了问题。究竟是那种方式更好？这取决于小程序的用户量以及投入的资源。

同时还有很多例子，例如 js 文件修改，究竟是增量(字符串级别)还是全量(单个 js 文件) ? 大家需要根据公司和项目来判断。所以究竟使用什么方式，取决于你的业务，所拥有的资源，甚至是你面对的客户量级。

## 参考资料

[controlled-vs-uncontrolled-inputs-react](https://goshakkk.name/controlled-vs-uncontrolled-inputs-react/)