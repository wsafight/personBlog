---
title: 利用 es6 new.target 来对模拟抽象类
published: 2019-05-10
description: 深入探讨new.target属性的用法和应用场景，展示如何利用它来提高代码的健壮性和可维护性。我们将通过实际的代码示例，详细讲解如何使用new.target来模拟抽象类，以及如何在继承关系中利用它来实现更灵活的控制。
tags: [ES6]
category: 有趣的实践
draft: false
---

## 起源

最近在使用 Symbol 来做为唯一值，发现 Symbol 无法进行 new 操作，只能当作函数使用，只要进行了new 就会发生类型错误
```
new Symbol()

// error
Uncaught TypeError: Symbol is not a constructor
    at new Symbol (<anonymous>)
    at <anonymous>:1:1
```

在不考虑底层实现的情况下，在代码层面是否能够实现一个函数只可以进行调用而不可以进行 new 操作呢？思考之后如下写出：

```
function disConstructor() {
  if (this !== window) {
    throw new TypeError(' disConstructor is not a constructor')
  }
  console.log('gogo go')
}

// 测试结果如下
disConstructor() // gogo go

new disConstructor()

// error
Uncaught TypeError:  disConstructor is not a constructor
    at new disConstructor (<anonymous>:3:15)
    at <anonymous>:1:1
```

如果使用 nodejs,window 可以切换为 global, 代码运行结果不变,因为对于个人而言没有适用场景。于是就没有继续研究下去，可是最近在从新翻阅 es6 时候发现 new.target这个属性。

## new.target 属性

### 介绍(引用 mdn 文档)

new.target属性允许你检测函数或构造方法是否是通过new运算符被调用的。   
在通过new运算符被初始化的函数或构造方法中，new.target返回一个指向构造方法或函数的引用。在普通的函数调用中，new.target 的值是undefined。

这样的话 我们的代码就可以这样改为

```
function disConstructor() {
  // 普通的函数调用中，new.target 的值是undefined。
  if (new.target) {
    throw new TypeError(' disConstructor is not a constructor')
  }
  console.log('gogo go')
}
```
得到与上述代码一样的答案。

### 深入
难道 es6 特地添加的功能仅仅只能用于检查一下我们的函数调用方式吗？   
在查阅的过程各种发现了大多数都方案都是用 new.target 写出只能被继承的类。类似于实现java的抽象类。
```
class Animal {
  constructor(name, age) {
    if (new.target === Animal) {
      throw new Error('Animal class can`t instantiate');
    }
    this.name = name
    this.age = age
  }
  // 其他代码
  ...
}

class Dog extends Animal{
  constructor(name, age, sex) {
    super(name, age)
    this.sex = sex
  }
}

new Animal()
// error
Uncaught Error: Animal class can`t instantiate
    at new Animal (<anonymous>:4:13)
    at <anonymous>:1:1

new Dog('mimi', 12, '公')
// Dog {name: "mimi", age: 12, sex: "公"}

```

但是 java抽象类抽象方法需要重写，这个是没有方案的。于是在测试与使用的过程中，却意外发现了超类可以在构造期间访问派生类的原型，利用起来。

```
class Animal {
  constructor(name, age) {
    console.log(new.target.prototype)
  }
  // 其他代码
  ...
}
```

之前运行时调用需要重写的方法报错是这样写的。

```
class Animal {
  constructor(name, age) {
    this.name = name
    this.age = age
  }

  getName () {
    throw new Error('please overwrite getName method')
  }
}

class Dog extends Animal{
  constructor(name, age, sex) {
    super(name, age)
    this.sex = sex
  }
}

const pite = new Dog('pite', 2, '公')
a.getName()
// error
Uncaught Error: please overwrite getName method
    at Dog.getName (<anonymous>:8:11)
    at <anonymous>:1:3
```

然而此时利用 new.target ，我就可以利用 构造期间 对子类进行操作报错。
```
class Animal {
  constructor(name, age) {
    // 如果 target 不是 基类 且 没有 getName 报错
    if (new.target !== Animal && !new.target.prototype.hasOwnProperty('getName')) {
      throw new Error('please overwrite getName method')
    }
    this.name = name
    this.age = age
  }
}

class Dog extends Animal{
  constructor(name, age, sex) {
    super(name, age)
    this.sex = sex
  }
}

const pite = new Dog('pite', 2, '公')
// error
Uncaught Error: please overwrite getName method
    at new Animal (<anonymous>:5:13)
    at new Dog (<anonymous>:14:5)
    at <anonymous>:1:1
```
此时可以把运行方法时候发生的错误提前到构造时期，虽然都是在运行期，但是该错误触发机制要早危害要大。反而对代码是一种保护。

当然了，利用超类可以在构造期间访问派生类的原型作用远远不是那么简单，必然是很强大的，可以结合业务场景谈一谈理解和作用。

## 其他方案

- 增加 编辑器插件   
- proxy   
- 修饰器   