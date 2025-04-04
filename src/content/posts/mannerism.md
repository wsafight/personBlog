---
title: 探讨奇技淫巧
published: 2019-06-04
description: 介绍了奇技淫巧的定义和起源，强调了在工程实践中，官方未想象出的代码风格或使用场景也可能成为提升开发效率和应用性能的有效手段。
tags: [奇技淫巧]
category: 工程实践
draft: false
---
## 起源

在工程实践中，我们常常会遇到一些奇技淫巧。所谓奇技淫巧，就是官方在设计或者实践中并未想象出的代码风格或者使用场景。其实也就是类似于 react 的 hoc,本来源自于社区，但是该方案却成为了官方肯定的方案。那么究竟应不应在平时学习呢？究竟应不应该在工程中使用呢，或者使用怎么样的奇技淫巧。

两年前。我还没有毕业，在大学的最后一个学期中选择了进入前端，同时，被吸引到前端阵营中一个不得不说的原因就是 js 的奇技淫巧，同时个人是一个比较猎奇的人，所以就学了很多关于 js 的奇技淫巧。

现在这些奇技淫巧要么变成了这门语言不可或缺的一部分，要么随着时间的推移而消失，还有一些在不知不觉中却忘记了，既然这次的文章是介绍这方面的知识，也就多介绍一下之前学习的一些例子。

## ~ 运算符 + indexOf
在 es6 includes 尚未推行之前，我们判断判断字符串或者数组包含只能使用 indexOf 这个方法，但是 indexOf 返回的确实元素的索引，如果不存在则返回 -1。
因为在之前写 c 语言的时候，我们往往使用 0 代表成功，1 2 3代表着不同的错误。因为0是独一无二的。在类c的语言中是具有 truthy falsy 这个概念。并不指代bool的 true 与 false。

下表代表了js 的 truthy 以及 falsy。

| 变量类型        | falsy    |  truthy  |
| --------       | -----:   | :----: |
| 布尔        | false     |   true    |
| 字符串       | "  "      |   非空字符串    |
| 数值        | 0 NaN      |   任何不为falsy的数值   |
| null        |  是 |   否   |
| undefined        | 是      |   否   |
| 对象(数组), {} 以及 []        |    否    |   是  |

对于数值而言,我们知道 0 对于数值是唯一的，而 -1不是。那么我们可以通过 ~ 运算符来把-1 变为 0.
```
~-1
// 0
~1
//-2

```
解释下  
对每一个比特位执行非（NOT）操作。NOT a 结果为 a 的反转（即反码）。   
```
9 (base 10) = 00000000000000000000000000001001 (base 2)   
         
~9 (base 10) = 11111111111111111111111111110110 (base 2) = -10 (base 10)
```
因为在计算机中第一位代表着 符号位置。  

同时简单理解。对任一数值 x 进行按位非操作的结果为 -(x + 1)。
也就是说通过 ~ 可以把 -1(且仅仅只是 -1) 变为 falsy。
```
var str = 'study pwa';
var searchFor = 'a';

// 这是 if (str.indexOf('a') > -1) 或者 if ( -1 * str.indexOf('a') <= 0) 条件判断的另一种方法
if (~str.indexOf(searchFor)) {
  // searchFor 包含在字符串 str 中
} else {
  // searchFor 不包含在字符串 str 中
}
```



## 惰性函数
没学习惰性函数时候，如果创建 xhr,每次都需要判断。

```
function createXHR(){
  var xmlhttp;
  try{
    //firfox,opear,safari
    xmlHttp=new XMLHttpRequest();
  } catch(e) {
    try{
      xmlHttp=new ActiveXobject('Msxm12.XMLHTTP');
    } catch(e) {
      try{
        xmlHttp=new ActiveXobject("Microsoft.XMLHTTP")
      } catch(e) {
        alert("您的浏览器不支持AJAX")
        return false;
      }
    }
  }
  return xmlHttp;
}


```

在学习完了惰性函数之后

```
function createXHR(){
  // 定义xhr,
  var xhr = null;
  if (typeof XMLHttpRequest!='undefined') {
    xhr=new XMLHttpRequest();
    createXHR=function(){
      return new XMLHttpRequest();  //直接返回一个懒函数
    }
  } else {
    try{
      xhr=new ActiveXObject("Msxml2.XMLHTTP");
      createXHR=function(){
        return new ActiveXObject("Msxml2.XMLHTTP");
      }
    } catch(e) {
      try{
        xhr =new ActiveXObject("Microsoft.XMLHTTP");
        createXHR=function(){
          return new ActiveXObject("Microsoft.XMLHTTP");
        }
      } catch(e) {
        createXHR=function(){
          return null
        }
      }        
    }
  }
  // 第一次调用也需要 返回 xhr 对象，所以需要返回 xhr
  return xhr;
}
```
如果代码被使用于两次调用以上则会有一定的性能优化。第一次调用时候 把 xhr 赋值并返回，且在进入层层 if 判断中把 createXHR 这个函数赋值为其他函数。

```
 // 如果浏览器中有 XMLHttpRequest 对象在第二次调用时候
  createXHR=function(){
    return XMLHttpRequest();  //直接返回一个懒函数
  }
```
该方案可以在不需要第二个变量的情况下直接对函数调用进行优化。同时对于调用方也是透明的，不需要修改任何代码。


##  扩展运算符号的另类用法

在最近的学习中，我看到了一篇关于 ...  (扩展运算符)的另类用法，[The shortest way to conditional insert properties into an object literal](https://dev.to/jfet97/the-shortest-way-to-conditional-insert-properties-into-an-object-literal-4ag7), 这篇文章介绍了如何最简化的写出条件性插入对象属性。 

在没有看过这篇文章时会写出如下代码：
```
// 获得手机号
const phone = this.state.phone

const person = {
  name: 'gogo',
  age: 11
}

// 如果手机号不为空，则添加到person中
if (phone) {
  person.phone = phone
}

```

但是,看完该文章之后可以写出这样的代码

```
// 获得手机号
const phone = this.state.phone

const person = {
  name: 'gogo',
  age: 11,
  ...phone && {phone}
}

```
上面的代码与该代码功能相同，但是代码量却减少很多。

要理解上述代码的运行原理，首先先介绍一下 ... 运算符，
对象的扩展运算符（...）用于取出参数对象的所有可遍历属性，拷贝到当前对象之中。
```
let z = { a: 3, b: 4 };
let n = { ...z };
n // { a: 3, b: 4 }

// 如果是 空对象，没有任何效果
{...{}, a: 1}
// { a: 1 }

// 如果扩展运算符后面不是对象，则会自动将其转为对象。但是如果对象没有属性，就会返回空对象
// {...1} 会变为 {...Object(1)} 但是因为没有属性
{...1} 
// {}

// 同理得到
{...undefined} {...null} {...true}
// 都会变为 {}
```
可以参考 阮一峰的 es6入门的[对象的扩展运算符](https://es6.ruanyifeng.com/#docs/object#%E5%AF%B9%E8%B1%A1%E7%9A%84%E6%89%A9%E5%B1%95%E8%BF%90%E7%AE%97%E7%AC%A6)

原理是因为代码可以如下理解：

```
const obj = {
  ...(phone && {phone})
}

// 如果 phone 有数据,&& 执行则会变为
const obj = {
  ...{phone}
}
// 而对象扩展运算符 执行就会变为
const obj = {
  phone
}

但是 如果 phone 为空字符串或者其他 falsy 数据，则代码会直接短路
const obj = {
  ...false
  ...null
  ...0
  ...undefined
}
则不会添加任何属性进入对象

```



## 讨论与思考

关于 ~ 操作符 + indexOf 其实加深了对位运算与比特位的理解。但是在es6之后我们完全可以使用 includes。完全可以不再使用~indexOf。

对于惰性函数，在typescript中，该代码是不可以使用的。当然，我们可以通过函数变量以及增加代码实现上述功能。

```
function createXHR(){}
// 修改为
let createXHR = function() {
  // ...
}
```
这里也可以看出 ts 不认可函数声明的函数名是一个变量。

对于扩展运算符的特殊用法。关于 typescript 使用,上述代码是可以在ts中使用的,不过不可以使用 &&，要使用 三元运算符
```
{
   ...phone ? {phone} : {}
}
```
但是不建议在ts中使用,因为该代码不会被代码ts检测到。
```
const phone = '123'

// 定义接口
interface Person {
  name: string;
}

// 不会爆出 error
const person: Person = {
  name: 'ccc',
  ...phone ? {phone} : {}
}
```
该代码是与 ts 严重相悖的，ts首要就是类型定义，而使用该代码逃出了 ts 的类型定义，这个对于语言上以及工程维护上是无法接受的。
同样的代码，我认为 js 是可以接受的(但是未必要在工程中使用)，但是 ts 确实无法接受的，这也是不同的语言之间的差异性。

在关于这片文章的评论中，最大的论点在于 为什么要使用最简的代码，最好的代码应该是不言自明的。  

而作者也相对而言探讨了自己的一些看法，应该学习一些自己不理解的东西。同时如果一个东西能够解释来龙去脉，完全可以从原理性解释，那么值得学习与使用。同时我个人其实是和作者持着相同意见的。


## 总结
- js 是一门灵活的语言(手动滑稽)。
- 应该多学习一些奇技淫巧，因为很多奇技淫巧往往代表一些混合的知识，往往会有一些新奇的思考与体验（怎么我想不出来？）同时，在别人使用了奇技淫巧时候我可以迅速理解。
- 在项目中是否使用此类代码要取决团队类型，以及项目体系，并非个人喜恶。

## 参考资料
[The shortest way to conditional insert properties into an object literal](https://dev.to/jfet97/the-shortest-way-to-conditional-insert-properties-into-an-object-literal-4ag7)

[对象的扩展运算符](https://es6.ruanyifeng.com/#docs/object#%E5%AF%B9%E8%B1%A1%E7%9A%84%E6%89%A9%E5%B1%95%E8%BF%90%E7%AE%97%E7%AC%A6)