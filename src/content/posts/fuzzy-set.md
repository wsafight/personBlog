---
title: 命令行错误提示—谈谈模糊集
published: 2020-11-12
description: 探讨了模糊集在命令行错误提示中的应用。通过介绍模糊集的基本概念和算法，展示了如何利用模糊集来提供更智能、更友好的错误提示信息，帮助用户快速定位和纠正错误。
tags: [算法]
category: 工程实践
draft: false
---
在开发的过程中，我们会使用各种指令。有时候，我们由于这样或者那样的原因，写错了某些指令。此时，应用程序往往会爆出错误。

> Unrecognized option 'xxx' (did you mean 'xxy'?)

可以看到，当前代码不仅仅提示了当前你输入的配置错误。同时还提供了类似当前输入的近似匹配指令。非常的智能。此时，我们需要使用算法来计算，即模糊集。

事实上，模糊集其实可以解决一些现实的问题。例如我们有一个“高个子”集合 A，定义 1.75m 为高个子。那么在通用逻辑中我们会认为某一个元素隶属或者不隶属该集合。也就是 1.78 就是高个子，而 1.749 就不是高个子，即使它距离 1.75 米只差里一毫米。该集合被称为(two-valued 二元集)，与此相对的，模糊集合则没有这种问题。

在模糊集合中，所有人都是集合 A 的成员，所不同的仅仅是匹配度而已。我们可以通过计算匹配度来决定差异性。

## 如何运行

言归正转，我们回到当前实现。对于模糊集的实现，我们可以参考 [fuzzyset.js](https://github.com/Glench/fuzzyset.js) (注: 该库需要商业许可) 和 [fuzzyset.js 交互式文档](http://glench.github.io/fuzzyset.js/) 进行学习。

在这里，我仅仅只介绍基本算法，至于数据存储和优化在完整实现中。

通过查看交互式文档，我们可以算法是通过余弦相似度公式去计算。

在直角坐标系中，相似度公式如此计算。

> cos = (a _ b) / (|a| _ |b| ). => 等同于
>
> ( (x1, y1) _ (x2,y2)) / (Math.sqrt(x1 ** 2 + y1 ** 2) _ Math.sqrt(x2 ** 2 + y2 ** 2))

而相似度公式是通过将字符串转化为数字矢量来计算。如果当前的字符串分别为 “smaller” 和 “smeller”。我们需要分解字符串子串来计算。

当前可以分解的字符串子串可以根据项目来自行调整，简单起见，我们这里使用 2 为单位。

两个字符串可以被分解为:

```ts
const smallSplit: string[] = [
  '-s',
  'sm',
  'ma',
  'al',
  'll',
  'l-'
]
const smelllSplit: string[] = [
  '-s',
  'sm',
  'me',
  'el',
  'll',
  'll',
  'l-'
]
```

我们可以根据当前把代码变为如下向量:

```ts
const smallGramCount = {
  '-s': 1,
  'sm': 1,
  'ma': 1,
  'al': 1,
  'll': 1,
  'l-': 1
}

const smallGramCount = {
  '-s': 1,
  'sm': 1,
  'me': 1,
  'el': 1,
  'll': 2,
  'l-': 1
}
```

```ts
const _nonWordRe = /[^a-zA-Z0-9\u00C0-\u00FF, ]+/g;

/**
 * 可以直接把 'bal' 变为 ['-b', 'ba', 'al', 'l-']
 */
function iterateGrams (value: string, gramSize: number = 2) {
  // 当前 数值添加前后缀 '-'
  const simplified = '-' + value.toLowerCase().replace(_nonWordRe, '') + '-'

  // 通过计算当前子字符串长度和当前输入数据长度的差值
  const lenDiff = gramSize - simplified.length

  // 结果数组
  const results = []

  // 如果当前输入的数据长度小于当前长度
  // 直接添加 “-” 补差计算
  if (lenDiff > 0) {
    for (var i = 0; i < lenDiff; ++i) {
      value += '-';
    }
  }

  // 循环截取数值并且塞入结果数组中
  for (var i = 0; i < simplified.length - gramSize + 1; ++i) {
    results.push(simplified.slice(i, i + gramSize));
  }
  return results;
}

/**
 * 可以直接把 ['-b', 'ba', 'al', 'l-'] 变为 {-b: 1, 'ba': 1, 'al': 1, 'l-': 1}
 */
function gramCounter(value: string, gramSize: number = 2) {
  const result = {}
  // 根据当前的
  const grams = _iterateGrams(value, gramSize)
  for (let i = 0; i < grams.length; ++i) {
    // 根据当前是否有数据来进行数据增加和初始化 1
    if (grams[i] in result) {
      result[grams[i]] += 1;
    } else {
      result[grams[i]] = 1;
    }
  }
  return result;
}
```

然后我们可以计算 small \* smell 为:

| small gram | small count |     | smell gram | smell gram |
| :--------: | :---------: | :-: | :--------: | :--------: |
|     -s     |      1      | \*  |     -s     |     1      |
|     sm     |      1      | \*  |     sm     |     1      |
|     ma     |      1      | \*  |     ma     |     0      |
|     me     |      0      | \*  |     me     |     1      |
|     al     |      1      | \*  |     al     |     0      |
|     el     |      0      | \*  |     el     |     1      |
|     ll     |      1      | \*  |     ll     |     1      |
|     l-     |      1      | \*  |     l-     |     1      |
|            |             |     |    sum     |     4      |

```ts
function calcVectorNormal() {
  // 获取向量对象
  const small_counts = gramCounter('small', 2)
  const smell_counts = gramCOunter('smell', 2)

  // 使用 set 进行字符串过滤
  const keySet = new Set()

  // 把两单词组共有的字符串塞入 keySet
  for (let key in small_counts) {
    keySet.add(key)
  }

  for (let key in smell_counts) {
    keySet.add(key)
  }

  let sum: number = 0

  // 计算 small * smell
  for(let key in keySet.keys()) {
    sum += (small_count[key] ?? 0) * (smell_count[key] ?? 0)
  }

  return sum
}


```

同时我们可以计算 |small|\*|smell| 为:

| small Gram | SmAll Count | Count \*\* 2 |
| :--------: | :---------: | :----------: |
|     -s     |      1      |      1       |
|     sm     |      1      |      1       |
|     ma     |      1      |      1       |
|     al     |      1      |      1       |
|     ll     |      1      |      1       |
|     l-     |      1      |      1       |
|            |     sum     |      6       |
|            |    sqrt     |    2.449     |

同理可得当前 smell sqrt 也是 2.449。

最终的计算为： 4 / (2.449 \* 2.449) = 0.66 。

计算方式为

```ts
// ... 上述代码

function calcVectorNormal() {
  // 获取向量对象
  const gram_counts = gramCounter(normalized_value, 2);
  // 计算
  let sum_of_square_gram_counts = 0;
  let gram;
  let gram_count;

  for (gram in gram_counts) {
    gram_count = gram_counts[gram];
    // 乘方相加
    sum_of_square_gram_counts += Math.pow(gram_count, 2);
  }

  return Math.sqrt(sum_of_square_gram_counts);
}

```

则 small 与 smell 在子字符串为 2 情况下匹配度为 0.66。

当然，我们看到开头和结束添加了 - 也作为标识符号，该标识是为了识别出 sell 与 llse 之间的不同，如果使用

```ts
const sellSplit = [
  '-s',
  'se',
  'el',
  'll',
  'l-'
]
const llseSplit = [
  '-l',
  'll',
  'ls',
  'se',
  'e-'
]
```

我们可以看到当前的相似的只有 'll' 和 'se' 两个子字符串。

## 完整代码

编译型框架 [svelte](https://svelte.dev/) 项目代码中用到此功能，使用代码解析如下:

```ts
const valid_options = [
  'format',
  'name',
  'filename',
  'generate',
  'outputFilename',
  'cssOutputFilename',
  'sveltePath',
  'dev',
  'accessors',
  'immutable',
  'hydratable',
  'legacy',
  'customElement',
  'tag',
  'css',
  'loopGuardTimeout',
  'preserveComments',
  'preserveWhitespace'
];

// 如果当前操作不在验证项中，才会进行模糊匹配
if (!valid_options.includes(key)) {
  // 匹配后返回 match 或者 null
  const match = fuzzymatch(key, valid_options);
  let message = `Unrecognized option '${key}'`;
  if (match) message += ` (did you mean '${match}'?)`;

  throw new Error(message);
}
```

实现代码如下所示:

```ts
export default function fuzzymatch(name: string, names: string[]) {
  // 根据当前已有数据建立模糊集，如果有字符需要进行匹配、则可以对对象进行缓存
  const set = new FuzzySet(names);
  // 获取当前的匹配
  const matches = set.get(name);
  // 如果有匹配项，且匹配度大于 0.7，返回匹配单词，否则返回 null
  return matches && matches[0] && matches[0][0] > 0.7 ? matches[0][1] : null;
}

// adapted from https://github.com/Glench/fuzzyset.js/blob/master/lib/fuzzyset.js
// BSD Licensed

// 最小子字符串 2
const GRAM_SIZE_LOWER = 2;
// 最大子字符串 3
const GRAM_SIZE_UPPER = 3;

//  进行 Levenshtein 计算，更适合输入完整单词的匹配
function _distance(str1: string, str2: string) {
  if (str1 === null && str2 === null)
    throw 'Trying to compare two null values';
  if (str1 === null || str2 === null) return 0;
  str1 = String(str1);
  str2 = String(str2);

  const distance = levenshtein(str1, str2);
  if (str1.length > str2.length) {
    return 1 - distance / str1.length;
  } else {
    return 1 - distance / str2.length;
  }
}

// Levenshtein距离，是指两个字串之间，由一个转成另一个所需的最少的编辑操作次数。
function levenshtein(str1: string, str2: string) {
  const current: number[] = [];
  let prev;
  let value;

  for (let i = 0; i <= str2.length; i++) {
    for (let j = 0; j <= str1.length; j++) {
      if (i && j) {
        if (str1.charAt(j - 1) === str2.charAt(i - 1)) {
          value = prev;
        } else {
          value = Math.min(current[j], current[j - 1], prev) + 1;
        }
      } else {
        value = i + j;
      }
      prev = current[j];
      current[j] = value;
    }
  }
  return current.pop();
}

// 正则匹配除单词 字母 数字以及逗号和空格外的数据
const non_word_regex = /[^\w, ]+/;

// 上述代码已经介绍
function iterate_grams(value: string, gram_size = 2) {
  const simplified = '-' + value.toLowerCase().replace(non_word_regex, '') + '-';
  const len_diff = gram_size - simplified.length;
  const results = [];

  if (len_diff > 0) {
    for (let i = 0; i < len_diff; ++i) {
      value += '-';
    }
  }
  for (let i = 0; i < simplified.length - gram_size + 1; ++i) {
    results.push(simplified.slice(i, i + gram_size));
  }
  return results;
}

// 计算向量，上述代码已经介绍
function gram_counter(value: string, gram_size = 2) {
  const result = {};
  const grams = iterate_grams(value, gram_size);
  let i = 0;

  for (i; i < grams.length; ++i) {
    if (grams[i] in result) {
      result[grams[i]] += 1;
    } else {
      result[grams[i]] = 1;
    }
  }
  return result;
}

// 排序函数
function sort_descending(a, b) {
  return b[0] - a[0];
}

class FuzzySet {
  // 数据集合，记录所有的可选项目
  // 1.优化初始化时候，相同的可选项数据，同时避免多次计算相同向量
  // 2.当前输入的值与可选项相等，直接返回，无需计算
  exact_set = {};
  // 匹配对象存入，存储所有单词的向量
  // 如 match_dist['ba'] = [
  //     第2个单词，有 3 个
  //     {3, 1}
  //     第5个单词，有 2 个
  //     {2, 4}
  //   ]
  //   后面单词匹配时候，可以根据单词索引进行匹配然后计算最终分数
  match_dict = {};
  // 根据不同子字符串获取不同的单词向量，最终有不同的匹配度
  // item[2] = [[2.6457513110645907, "aaab"]]
  items = {};

  constructor(arr: string[]) {
    // 当前选择 2 和 3 为子字符串匹配
    // item = {2: [], 3: []}
    for (let i = GRAM_SIZE_LOWER; i < GRAM_SIZE_UPPER + 1; ++i) {
      this.items[i] = [];
    }

    // 添加数组
    for (let i = 0; i < arr.length; ++i) {
      this.add(arr[i]);
    }
  }

  add(value: string) {
    const normalized_value = value.toLowerCase();

    // 如果当前单词已经计算，直接返回
    if (normalized_value in this.exact_set) {
      return false;
    }

    // 分别计算 2 和 3 的向量
    for (let i = GRAM_SIZE_LOWER; i < GRAM_SIZE_UPPER + 1; ++i) {
      this._add(value, i);
    }
  }

  _add(value: string, gram_size: number) {
    const normalized_value = value.toLowerCase();
    // 获取 items[2]
    const items = this.items[gram_size] || [];
    // 获取数组的长度作为索引
    const index = items.length;

    // 没有看出有实际的用处？实验也没有什么作用？不会影响
    items.push(0);

    // 获取 向量数据
    const gram_counts = gram_counter(normalized_value, gram_size);
    let sum_of_square_gram_counts = 0;
    let gram;
    let gram_count;

    // 同上述代码，只不过把所有的匹配项目和当前索引都加入 match_dict 中去
    // 如 this.match_dict['aq'] = [[1, 2], [3,3]]
    for (gram in gram_counts) {
      gram_count = gram_counts[gram];
      sum_of_square_gram_counts += Math.pow(gram_count, 2);
      if (gram in this.match_dict) {
        this.match_dict[gram].push([index, gram_count]);
      } else {
        this.match_dict[gram] = [[index, gram_count]];
      }
    }
    const vector_normal = Math.sqrt(sum_of_square_gram_counts);
    // 添加向量  如： this.items[2][3] = [4.323, 'sqaaaa']
    items[index] = [vector_normal, normalized_value];
    this.items[gram_size] = items;
    // 设置当前小写字母，优化代码
    this.exact_set[normalized_value] = value;
  }

  // 输入当前值，获取选择项
  get(value: string) {
    const normalized_value = value.toLowerCase();
    const result = this.exact_set[normalized_value];

    // 如果当前值完全匹配，直接返回 1，不必计算
    if (result) {
      return [[1, result]];
    }

    let results = [];
    // 从多到少，如果多子字符串没有结果，转到较小的大小
    for (
      let gram_size = GRAM_SIZE_UPPER;
      gram_size >= GRAM_SIZE_LOWER;
      --gram_size
    ) {
      results = this.__get(value, gram_size);
      if (results) {
        return results;
      }
    }
    return null;
  }

  __get(value: string, gram_size: number) {
    const normalized_value = value.toLowerCase();
    const matches = {};
    // 获得当前值的向量值
    const gram_counts = gram_counter(normalized_value, gram_size);
    const items = this.items[gram_size];
    let sum_of_square_gram_counts = 0;
    let gram;
    let gram_count;
    let i;
    let index;
    let other_gram_count;

    // 计算得到较为匹配的数据
    for (gram in gram_counts) {
      // 获取 向量单词用于计算
      gram_count = gram_counts[gram];
      sum_of_square_gram_counts += Math.pow(gram_count, 2);
      // 取得当前匹配的 [index， gram_count]
      if (gram in this.match_dict) {
        // 获取所有匹配当前向量单词的项目，并且根据 索引加入 matches
        for (i = 0; i < this.match_dict[gram].length; ++i) {
          // 获得当前匹配的索引 === 输入单词[index]
          index = this.match_dict[gram][i][0];
          // 获得匹配子字符串的值
          other_gram_count = this.match_dict[gram][i][1];
          // 单词索引添加，注：只要和当前子字符串匹配的 索引都会加入 matches
          if (index in matches) {
            matches[index] += gram_count * other_gram_count;
          } else {
            matches[index] = gram_count * other_gram_count;
          }
        }
      }
    }


    const vector_normal = Math.sqrt(sum_of_square_gram_counts);
    let results = [];
    let match_score;

    // 构建最终结果 [分数, 单词]
    for (const match_index in matches) {
      match_score = matches[match_index];
      results.push([
        // 分数
        match_score / (vector_normal * items[match_index][0]),
        // 单词
        items[match_index][1]
      ]);
    }

    // 虽然所有的与之匹配子字符串都会进入，但我们只需要最高的分数
    results.sort(sort_descending);

    let new_results = [];

    // 如果匹配数目很大，只取的前 50 个数据进行计算
    const end_index = Math.min(50, results.length);

    // 由于是字符类型数据，根据当前数据在此计算 levenshtein  距离
    for (let i = 0; i < end_index; ++i) {
      new_results.push([
        _distance(results[i][1], normalized_value), results[i][1]
      ]);
    }
    results = new_results;
    // 在此排序
    results.sort(sort_descending);

    new_results = [];
    for (let i = 0; i < results.length; ++i) {
      // 因为 第一的分数是最高的，所有后面的数据如果等于第一个
      // 也可以进入最终选择
      if (results[i][0] == results[0][0]) {
        new_results.push([results[i][0], this.exact_set[results[i][1]]]);
      }
    }

    // 返回最终结果
    return new_results;
  }
}

```

## 参考资料

[fuzzyset.js 交互式文档](http://glench.github.io/fuzzyset.js/)

[svelte fuzzymatch](https://github.com/sveltejs/svelte/blob/master/src/compiler/utils/fuzzymatch.ts)
