---
title: 前端持久化缓存优化
published: 2023-09-24
description: 探讨了前端持久化缓存优化的重要性和实现方法。通过实际的代码示例，详细讲解了如何利用缓存来提升web应用程序的性能，特别是在用户受限于网速的情况下。
tags: [缓存, 性能优化]
category: 性能优化
draft: false
---

缓存是提升 web 应用程序有效方法之一，尤其是用户受限于网速的情况下。提升系统的响应能力，降低网络的消耗。当然，内容越接近于用户，则缓存的速度就会越快，缓存的有效性则会越高。

之前个人写过 [前端 api 请求缓存方案](../api-cache/)。介绍的了内存中的缓存以及过期逻辑。后续也写过 [手写一个前端存储工具库](https://github.com/wsafight/personBlog/issues/55)，该工具利用了适配器处理了不同的存储介质（内存，IndexedDB, localStorage 等）。

不过，在某些特定场景下缓存还需要优化，例如：用户需要在登录或者填写表单时需要通过某些接口获取必要数据，而这些接口是由第三方平台提供的。这些接口可能会出现错误或超时的情况。如果当前数据有很强实时性，开发者就必须重试或者联系第三方平台来处理对应的错误。如果数据的实时性不强，当前就可以使用本地缓存。


一般来说，当获取时效性缓存时候，我们会检查并删除当前数据。代码简写如下所示：

```javascript
// 缓存对应的的模块以及功能
const EXTRA_INFO_CACHE_KEY = 'xxx.xxx.xxx';
// 缓存时长为 7 天
const CACHE_TIME =  7 * 24 * 60 * 60 * 1000;

const getCachedExtraInfo = () => {
  const cacheStr = localStorage.getItem(`${EXTRA_INFO_CACHE_KEY}.${userId}`);

  if (!cacheStr) {
    return null;
  }

  let cache = null;
  try {
    cache = JSON.parse(cacheStr);
  } catch () {
    return null;
  }

  if (!cache) {
    return null;
  }

  // 缓存过期了，直接返回 null
  if ((cache.expiredTime ?? 0) < new Date().getTime()) {
    return null;
  }

  return cache.data;
}

const getExtraInfo = () => {
  const cacheData = getCachedExtraInfo();
  if (cacheData) {
    return Promise.resolve(cacheData);
  }

  return getExtraInfoApi().then(res => {
    localStorage.setItem(`${EXTRA_INFO_CACHE_KEY}.${userId}`, {
      data: res,
      expiredTime: (new Data()).getTime() + CACHE_TIME,
    });
    return res;
  });
}
```

如果这时候接口出现了访问错误问题，很多数据到期的用户就无法正常使用功能了，这时候添加重试功能可能会解决某些错误。这时候我们先不考虑重试的逻辑。


考虑到绝大部份用户对应数据不会进行修改的情况下，对应代码就可以不进行数据删除。而是返回超时标记。

```javascript
const EXTRA_INFO_CACHE_KEY = 'xxx.xxx.xxx';
const CACHE_TIME =  7 * 24 * 60 * 60 * 1000;

const getCachedExtraInfo = () => {
  const cacheStr = localStorage.getItem(`${EXTRA_INFO_CACHE_KEY}.${userId}`);

  if (!cacheStr) {
    return null;
  }

  let cache = null;
  try {
    cache = JSON.parse(cacheStr)
  } catch () {
    return null;
  }

  if (!cache) {
    return null;
  }

  if ((cache.expiredTime ?? 0) < new Date().getTime()) {
    return {
      data: cache.data,
      // 数据已经超时了
      isOverTime: true,
    };
  }

  return {
    data: cache.data,
    // 数据没有超时
    isOverTime: false,
  };
}

const getExtraInfo = () => {
  const cacheInfo = getCachedExtraInfo();
  // 数据没有超时才返回对应数据
  if (cacheInfo && !cacheInfo.isOverTime) {
      return Promise.resolve(cacheInfo.data);
  }

  return getExtraInfoApi().then(res => {
    localStorage.setItem(`${EXTRA_INFO_CACHE_KEY}.${userId}`, {
      data: res,
      expiredTime: (new Data()).getTime() + CACHE_TIME,
    });
    return res;
  }).catch(err => {
    // 有数据，才返回，否则继续抛出错误
    if (cacheInfo) {
      return cacheInfo.data;
    }
    throw err;
  })
}
```

这样的话，我们可以保证绝大多数用户是可以继续正常使用的。但如果对应的接口不稳定，会让用户等待很长时间才能继续使用。

这时候开发者可以考虑完全抛弃异步代码，同时减少缓存时间。

```javascript
const EXTRA_INFO_CACHE_KEY = 'xxx.xxx.xxx';
// 将缓存时效减少为 5 天
const CACHE_TIME =  5 * 24 * 60 * 60 * 1000;

const getCachedExtraInfo = () => {
  const cacheStr = localStorage.getItem(`${EXTRA_INFO_CACHE_KEY}.${userId}`);

  if (!cacheStr) {
    return null;
  }

  let cache = null;
  try {
    cache = JSON.parse(cacheStr)
  } catch () {
    return null;
  }

  if (!cache) {
    return null;
  }

  if ((cache.expiredTime ?? 0) < new Date().getTime()) {
    return {
      data: cache.data,
      isOverTime: true,
    };
  }

  return {
    data: cache.data,
    isOverTime: false,
  };
}

const getExtraInfo = () => {
  const cacheInfo = getCachedExtraInfo();
  // 如果超时了，就去获取，下一次再使用即可
  if (cacheInfo.isOverTime) {
      getExtraInfoApi().then(res => {
        localStorage.setItem(`${EXTRA_INFO_CACHE_KEY}.${userId}`, {
          data: res,
          expiredTime: (new Data()).getTime() + CACHE_TIME,
        })
      })
  }
  return cacheInfo.data
}
```

## 参考文档

[前端 api 请求缓存方案](https://github.com/wsafight/personBlog/issues/2)

[手写一个前端存储工具库](https://github.com/wsafight/personBlog/issues/55)