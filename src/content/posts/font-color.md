---
title: 根据背景色自适应文本颜色
published: 2020-10-07
description: 介绍了一种通过计算背景色的亮度来自动调整文本颜色的方法，以确保文本在任何背景色下都能保持清晰可读。还提供了相关的代码示例和参考资料。
tags: [用户体验, 最佳实践]
category: 用户体验
draft: false
---
针对企业服务来说，最终用户往往需要更加细化的信息分类方式，而打标签无疑是非常好的解决方案。

如果标签仅仅只提供几种颜色可能无法满足各个用户的实际需求。那么系统就需要为用户提供颜色选择。事实上我们完全无法预知用户选择了何种颜色，那么如果当前用户选择了黑色作为背景色，同时当前的字体颜色也是黑色，该标签就无法使用。如果配置背景色的同时还要求用户配置文字颜色，那么这个标签功能未免有些鸡肋。让用户觉得我们的开发水平有问题。

所以需要寻找一种解决方案来搞定这个问题。

## 问题解析

对于彩色转灰度，有一个著名的公式。我们可以把十六进制的代码分成3个部分，以获得单独的红色，绿色和蓝色的强度。用此算法逐个修改像素点的颜色可以将当前的彩色图片变为灰色图像。

```js
gray = r * 0.299 + g * 0.587 + b * 0.114
```

但是针对明亮和阴暗的颜色，经过公式的计算后一定会获得不同的数值，而针对当前不同值，我们取反就可以得到当前的文本颜色。即：

```typescript
const textColor = (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? '#000' : '#FFF'	
```

当然了，186 并不是一个确定的数值，你可以根据自己的需求调整一个新的数值。通过该算法,传入不同的背景色，就可以得到白色和黑色，或者自定义出比较合适的文本颜色。

## 完善代码

当然，虽然解决的方法非常简单，但是中间还是涉及了一些进制转换问题，这里简单传递数值如下所示。

```typescript
/**
 * @param backgroundColor 字符串 传入  #FFFBBC | FBC | FFBBCC 均可
 */
export function contrastTextColor(backgroundHexColor: string) {
  let hex = backgroundHexColor
  
  // 如果当前传入的参数以 # 开头,去除当前的
  if (hex.startsWith('#')) {
    hex = hex.substring(1);
  }
  // 如果当前传入的是 3 位小数值，直接转换为 6 位进行处理
  if (hex.length === 3) {
    hex = [hex[0], hex[0], hex[1], hex[1], hex[2], hex[2]].join('')
  }

  if (hex.length !== 6) {
    throw new Error('Invalid background color.' + backgroundHexColor);
  }

  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  
  if ([r,g,b].some(x => Number.isNaN(x))) {
     throw new Error('Invalid background color.' + backgroundHexColor);
  }

  const textColor = (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? '#000' : '#FFF'
  return textColor
}


```

我们还可以在其中添加 rgb 颜色，以及转换逻辑。

```ts
/**
 * @param backgroundColor 字符串
 */
export function contrastTextColor(backgroundHexColor: string) {
  // 均转换为 hex 格式， 可以传入 rgb(222,33,44)。
  // 如果当前字符串参数长度大于 7 rgb(,,) 最少为 8 个字符，则认为当前传入的数值为 rgb，进行转换
  const backgroundHexColor = backgroundColor.length > 7 ? convertRGBToHex(backgroundColor) : backgroundColor
  
  // ... 后面代码
}

/** 获取背景色中的多个值,即 rgb(2,2,2) => [2,2,2] */
const rgbRegex = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/

/** 转换 10 进制为 16 进制, 
  * 计算完成后时字符串前面加 0，同时取后两位数值。使得返回的数值一定是 两位数
  * 如 E => 0E  |  FF => 0FF => FF
  */
const hex = (x: string) => ("0" + parseInt(x).toString(16)).slice(-2);

function convertRGBToHex(rgb: string): string {
  const bg = rgb.match(rgbRegex);
  
  if (!bg) {
    // 返回空字符串，在后面判断长度为 6 时候会报错。不在此处进行操作
    return ''
  }
  
  return ("#" + hex(bg[1]) + hex(bg[2]) + hex(bg[3])).toUpperCase();
}
```

当然了，我们也可以在其中添加缓存代码，以便于减少计算量。

```ts
// 使用 map 来缓存 
const colorByBgColor = new Map()
// 缓存错误字符串
const CACHE_ERROR = 'error'

export function contrastTextColor(backgroundColor: string) {
  // 获取缓存
  const cacheColor = colorByBgColor.get(backgroundColor)
  if (cacheColor) {
    // 当前缓存错误，直接报错
    if (cacheColor === CACHE_ERROR) {
      throw new Error('Invalid background color.' + backgroundColor);
    }
    return colorByBgColor.get(backgroundColor)
  }
  
  // ...
  if (hex.length !== 6) {
    // 直接缓存错误
    colorByBgColor.set(backgroundColor, CACHE_ERROR)
    throw new Error('Invalid background color.' + backgroundColor);
  }
  
  // ...
  
  if ([r,g,b].some(x => Number.isNaN(x))) {
    // 直接缓存错误
    colorByBgColor.set(backgroundColor, CACHE_ERROR)
    throw new Error('Invalid background color.' + backgroundColor);
  }

  const textColor = (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? '#000' : '#FFF'
  // 缓存数据
  colorByBgColor.set(backgroundColor, textColor)
  return textColor
}
```

完整代码可以在代码库中 [转换问题颜色](https://github.com/wsafight/Daily-Algorithm/blob/master/src/fun/contrast-text-color.ts) 中看到。

当然了，如果你不需要严格遵循 W3C 准则，当前代码已经足够使用。但是如果你需要严格遵循你可以参考 http://stackoverflow.com/a/3943023/112731 以及 https://www.w3.org/TR/WCAG20/。

## 参考资料

[stackoverflow 问题](http://stackoverflow.com/a/3943023/112731)