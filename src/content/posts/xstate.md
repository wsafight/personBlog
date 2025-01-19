---
title: 利用 XState(有限状态机) 编写易于变更的代码
published: 2020-10-20
description: 探讨了 XState 在前端开发中的应用，介绍了其基本概念和使用方法，帮助开发者更好地管理状态和处理复杂的业务逻辑，提高代码的可维护性和可扩展性。
tags: [状态机, 工程实践]
category: 工程实践
draft: false
---
目前来说，无论是 to c 业务,还是 to b 业务，对于前端开发者的要求越来越高，各种绚丽的视觉效果，复杂的业务逻辑层出不穷。针对于业务逻辑而言，贯穿后端业务和前端交互都有一个关键点 —— 状态转换。

当然了，这种代码实现本身并不复杂，真正的难点在于如何快速的进行代码的修改。

在实际开发项目的过程中，ETC 原则，即 Easier To Change，易于变更是非常重要的。为什么解耦很好？ 为什么单一职责很有用？ 为什么好的命名很重要？因为这些设计原则让你的代码更容易发生变更。ETC 甚至可以说是其他原则的基石，可以说，我们现在所作的一切都是为了更容易变更！！特别是针对于初创公司，更是如此。

例如：项目初期，当前的网页有一个模态框，可以进行编辑，模态框上有两个按钮，保存与取消。这里就涉及到模态框的显隐状态以及权限管理。随着时间的推移，需求和业务发生了改变。当前列表无法展示该项目的所有内容，在模态框中我们不但需要编辑数据，同时需要展示数据。这时候我们还需要管理按钮之间的联动。仅仅这些就较为复杂，更不用说涉及多个业务实体以及多角色之间的细微控制。

重新审视自身代码，虽然之前我们做了大量努力利用各种设计原则，但是想要快速而安全的修改散落到各个函数中的状态修改，还是非常浪费心神的，而且还很容易出现“漏网之鱼”。

这时候，我们不仅仅需要依靠自身经验写好代码，同时也需要一些工具的辅助。

## 有限状态机

有限状态机是一个非常有用的数学计算模型，它描述了在任何给定时间只能处于一种状态的系统的行为。当然，该系统中只能够建立出一些有限的、定性的“模式”或“状态” ，并不描述与该系统相关的所有(可能是无限的)数据。例如，水可以是四种状态中的一种: 固体(冰)、液体、气体或等离子体。然而，水的温度可以变化，它的测量是定量的和无限的。

总结来说，有限状态机的三个特征为:

  * 状态总数（state）是有限的。
  * 任一时刻，只处在一种状态之中。
  * 某种条件下，会从一种状态转变（transition）到另一种状态。

在实际开发中，它还需要：

* 初始状态
* 触发状态变化的事件和转换函数
* 最终状态的集合(有可能是没有最终状态)

先看一个简单的红绿灯状态转换:

```ts
const light = {
  currentState: 'green',
  
  transition: function () {
    switch (this.currentState) {
      case "green":
        this.currentState = 'yellow'
        break;
      case "yellow":
        this.currentState = 'red'
        break;
      case "red": 
        this.currentState = 'green'
        break;
      default:
        break;
    }
  }
}
```

有限状态机在游戏开发中大放异彩，已经成为了一种常用的设计模式。用这种方式可以使每一个状态都是独立的代码块，与其他不同的状态分开独立运行，这样很容易检测遗漏条件和移除非法状态，减少了耦合,提升了代码的健壮性，这么做可以使得游戏的调试变得更加方便，同时也更易于增加新的功能。

对于前端开发来说，我们可以从其他工程领域中多年使用的经验学习与再创造。

## XState 体验

实际上开发一个 简单的状态机并不是特别复杂的事情，但是想要一个完善，实用性强，还具有可视化工具的状态机可不是一个简单的事。

这里我要推荐 [XState](https://github.com/davidkpiano/xstate)，该库用于创建、解释和执行有限状态机和状态图。

简单来说：上述的代码可以这样写。

```ts
import { Machine } from 'xstate'

const lightMachine = Machine({
  // 识别 id, SCXML id 必须唯一
  id: 'light',
  // 初始化状态，绿灯
  initial: 'green',
  
  // 状态定义 
  states: {
    green: {
      on: {
        // 事件名称，如果触发 TIMRE 事件，直接转入 yellow 状态
        TIMRE: 'yellow'
      }
    },
    yellow: {
      on: {
        TIMER: 'red'
      }
    },
    red: {
      on: {
        TIMER: 'green'
      }
    }
  }
})

// 设置当前状态
const currentState = 'green'

// 转换的结果
const nextState = lightMachine.transition(currentState, 'TIMER').value 
// => 'yellow'

// 如果传入的事件没有定义，则不会发生转换，如果是严格模式，将会抛出错误
lightMachine.transition(currentState, 'UNKNOWN').value 
```

其中 [SCXML](https://www.w3.org/TR/scxml) 是状态图可扩展标记语言, XState 遵循该标准，所以需要提供 id。当前状态机也可以转换为 JSON 或 SCXML。

虽然 transition 是一个纯函数，非常好用，但是在真实环境使用状态机，我们还是需要更强大的功能。如:

- 跟踪当前状态
- 执行副作用
- 处理延迟过度以及时间
- 与外部服务沟通

XState 提供了 interpret 函数，

```ts
import { Machine,interpret } from 'xstate'

// 。。。 lightMachine 代码

// 状态机的实例成为 serivce
const lightService = interpret(lightMachine)
   // 当转换时候，触发的事件(包括初始状态)
  .onTransition(state => {
    // 返回是否改变，如果状态发生变化(或者 context 以及 action 后文提到)，返回 true 
    console.log(state.changed) 
    console.log(state.value)
  })
  // 完成时候触发
  .onDone(() => {
    console.log('done')
  })

// 开启
lightService.start()

// 将触发事件改为 发送消息，更适合状态机风格
// 初始化状态为 green 绿色
lightService.send('TIMER') // yellow
lightService.send('TIMER') // red

// 批量活动
lightService.send([
  'TIMER',
  'TIMER'
])

// 停止
lightService.stop()

// 从特定状态启动当前服务,这对于状态的保存以及使用更有作用
lightService.start(previousState)
```

我们也可以结合其他库在 Vue React 框架中使用，仅仅只用几行代码就实现了我们想要的功能。

```tsx
import lightMachine from '..'
// react hook 风格
import { useMachine } from '@xstate/react'

function Light() {
  const [light, send] = useMachine(lightMachine)
  
  return <>
    // 当前状态 state 是否是绿色
    <span>{light.matches('green') && '绿色'}</span>	
    // 当前状态的值
    <span>{light.value}</span>  
    // 发送消息
    <button onClick={() => send('TIMER')}>切换</button>
  </>
}
```

当前的状态机也是还可以进行嵌套处理,在红灯状态下添加人的行动状态。

```ts
import { Machine } from 'xstate';

const pedestrianStates = {
  // 初识状态 行走
  initial: 'walk',
  states: {
    walk: {
      on: {
        PED_TIMER: 'wait'
      }
    },
    wait: {
      on: {
        PED_TIMER: 'stop'
      }
    },
    stop: {}
  }
};

const lightMachine = Machine({
  id: 'light',
  initial: 'green',
  states: {
    green: {
      on: {
        TIMER: 'yellow'
      }
    },
    yellow: {
      on: {
        TIMER: 'red'
      }
    },
    red: {
      on: {
        TIMER: 'green'
      },
      ...pedestrianStates
    }
  }
});

const currentState = 'yellow';

const nextState = lightMachine.transition(currentState, 'TIMER').value;

// 返回级联对象 
// => {
//   red: 'walk'
// }

// 也可以写为 red.walk
lightMachine.transition('red.walk', 'PED_TIMER').value;

// 转化后返回
// => {
//   red: 'wait'
// }

// TIMER 还可以返回下一个状态
lightMachine.transition({ red: 'stop' }, 'TIMER').value;
// => 'green'
```

当然了，既然有嵌套状态，我们还可以利用 type: 'parallel' ,进行串行和并行处理。

除此之外，XState 还有扩展状态 context 和过度防护 guards。这样的话，更能够模拟现实生活

```ts
// 是否可以编辑
functions canEdit(context: any, event: any, { cond }: any) {
  console.log(cond)
  // => delay: 1000
  
  // 是否有某种权限 ？？？
  return hasXXXAuthority(context.user)
}


const buttonMachine = Machine({
  id: 'buttons',
  initial: 'green',
  // 扩展状态，例如 用户等其他全局数据
  context: {
    // 用户数据
    user: {}
  },
  states: {
    view: {
      on: {
        // 对应之前 TIMRE: 'yellow'
        // 实际上 字符串无法表达太多信息，需要对象表示
        EDIT: {
          target: 'edit',
          // 如果没有该权限，不进行转换，处于原状态
          // 如果没有附加条件，直接 cond: searchValid
          cond: {
            type: 'searchValid',
            delay: 3
          }
        }, 
      }
    }
  }
}, {
  // 守卫
  guards: {
    canEdit,
  }
})


// XState 给予了更加合适的 API 接口,开发时候 Context 可能不存在
// 或者我们需要在不同的上下文 context 中复用状态机，这样代码扩展性更强
const buttonMachineWithDelay = buttonMachine.withContext({
  user: {},
  delay: 1000
})

// withContext 是直接替换，不进行浅层合并,但是我们可以手动合并
const buttonMachineWithDelay = buttonMachine.withContext({
  ...buttonMachine.context,
  delay: 1000
})
```

我们还可以通过瞬时状态来过度，瞬态状态节点可以根据条件来确定机器应从先前的状态真正进入哪个状态。瞬态状态表现为空字符串，即 '',如

```ts
const timeOfDayMachine = Machine({
  id: 'timeOfDay',
  // 当前不知道是什么状态
  initial: 'unknown',
  context: {
    time: undefined
  },
  states: {
    // Transient state
    unknown: {
      on: {
        '': [
          { target: 'morning', cond: 'isBeforeNoon' },
          { target: 'afternoon', cond: 'isBeforeSix' },
          { target: 'evening' }
        ]
      }
    },
    morning: {},
    afternoon: {},
    evening: {}
  }
}, {
  guards: {
    isBeforeNoon: //... 确认当前时间是否小于 中午 
    isBeforeSix: // ... 确认当前时间是否小于 下午 6 点
  }
});

const timeOfDayService = interpret(timeOfDayMachine
  .withContext({ time: Date.now() }))
  .onTransition(state => console.log(state.value))
  .start();

timeOfDayService.state.value 
// 根据当前时间，可以是 morning afternoon 和 evening，而不是 unknown 转态
```

到这里，我觉得已经介绍 XState 很多功能了，篇幅所限，不能完全介绍所有功能，不过当前的功能已经足够大部分业务需求使用了。如果有其他更复杂的需求，可以参考 [XState 文档](https://xstate.js.org/docs/)。

这里列举一些没有介绍到的功能点:

- 进入和离开某状态触发动作(action 一次性)和活动(activity 持续性触发，直到离开某状态)
- 延迟事件与过度 after
- 服务调用 invoke,包括 promise 以及 两个状态机之间相互交互
- 历史状态节点，可以通过配置保存状态并且回退状态

当然了，对比于 x-state 这种，还有其他的状态机工具，如 [javascript-state-machine](https://github.com/jakesgordon/javascript-state-machine) , [Ego](https://github.com/oguzeroglu/Ego)  等。大家可以酌情考虑使用。

## 总结

对于现代框架而言，无论是如火如荼的 React Hook 还是渐入佳境的 Vue Compoistion Api，其本质都想提升状态逻辑的复用能力。但是考虑大部分场景下，状态本身的切换都是有特定约束的，如果仅仅靠良好的编程习惯，恐怕还是难以写出抑郁修改的代码。而 FSM 以及 XState 无疑是一把利器。

## 参考

[XState 文档](https://xstate.js.org/docs/)

[JavaScript与有限状态机](http://www.ruanyifeng.com/blog/2013/09/finite-state_machine_for_javascript.html)



