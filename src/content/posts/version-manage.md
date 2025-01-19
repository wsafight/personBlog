---
title: 聊聊版本号的作用与价值
published: 2023-09-10
description: 探讨了版本号在软件开发中的重要性和实际应用。介绍了版本号的组成和含义，以及如何使用版本号来管理软件的更新和发布。
tags: [版本管理]
category: 工程实践
draft: false
---

在项目开发和运行的过程中，总是少不了各类升级。例如某个功能组件需要更高的依赖库、数据项需要进行兼容等等问题。遇到此类问题开发者需要使用版本号来解决。今天我们就来分析一下项目迭代过程中会遇到的各类升级问题以及如何使用版本号来解决。

通常来说升级会涉及到三个点：

- 向下兼容
- 协商升级
- 拒绝服务

## 依赖升级

开发者在产品演进的过程中会不断的升级工具依赖，以 npm 版本为例。版本号通常由三部分组成: 主版本号、次版本号和修订版本号。

```
Major.Minor.Patch
```

其中，Major 表示主版本，当你做了不兼容的 API 修改时，就需要升级这个版本号。Minor 表示次版本，当你做了向下兼容的功能性新增时，就需要升级这个版本号。而 Patch 表示修订版本，当你做了向下兼容的问题修正时，就需要升级这个版本号。

每次在使用 npm install 时都会下载
package.json 中的依赖。而在在依赖中有 ^ 和 ～ 符号。其中 ^ 代表次版本兼容，～ 是修订版本兼容。

```json
{
  "devDependencies": {
    "lib1": "0.15.3",
    "lib2": "^0.15.3",
    "lib3": "~0.15.3"
  }
}
```

如果当前三个库都有几个高版本，如：

- 0.15.3
- 0.15.4
- 0.16.1
- 1.0.0

在项目下载后执行 install ,下载的对应版本则是

- lib1 0.15.3
- lib2 0.16.1
- lib3 0.15.4

虽然 ^ 和 ~ 都不会升级破坏性依赖，但版本号只是“君子协议”。还是建议大家不要使用这些符号。同时之前也遇到过组件库在某个修订版本中出现了 bug。虽然很快修复好了。但是定位问题还是需要花费一定时间的。

## 数据缓存

很多情况，开发者为了减少网络请求都会使用数据缓存。如果是一个较为稳定的数据。我们可以添加版本号进行缓存（同时添加一个足够长的过期时间方便重新获获取）。

以 localStorage 为例，代码如下所示：

```ts
interface Store<T> {
  /** 存储数据 */
  data: T;
  /**
   * 当前版本数据,可以是一个数字或一个日期字符串 '220101-1'
   * 后续的 -1 是为了当天发布多个版本而准备的。
   */
  version: string | number;
  /**
   * 过期时间
   * 可以使用 时间戳（天数），天数 dayjs 等
   */
  expries: string ｜ number;
}

/**
  * 实际存储 key 值
  */
const XXX_STORAGE_KEY = 'storageKey';

const isNeedUpgrade = async <T>(): Promise<boolean> => {
  const storeJSONStr = localStorage.getItem(XXX_STORAGE_KEY);
  // 没有存储 JSON 字符串
  if (storeJSONStr === null) {
    return true;
  }

  let store: Partial<Store<T>> = {};

  try {
    store = JSON.parse(storeJSONStr)
  } catch (e) {
    // JSON 字符串解析失败
    return true;
  }

  const { expries, version: localVersion } = store;

  // 没有过期时间获取当前时间超过过期时间
  if (!expries || isOverTime(expries)) {
    return true;
  }

  // 没有缓存本地版本
  if (!localVersion) {
    return true;
  }

  const currentVersion = await getCurrentVersionForXXXStore();

  // 版本不一致
  if (currentVersion !== localVersion) {
    return true;
  }

  // 无需升级
  return false;
}
```

当前代码其实就涉及到了上述所说的协商升级。

## 使用版本号进行 api 维护

随着业务的发展，数据结构不可避免会发生一定的改变，如果仅仅只是增加一个数据，开发者可以直接在服务端做一下向下兼容即可。但有些时候我们可能需要做出一系列的调整，诸如前一个版本处理传递上来的 A 和 C 数据，但是后一个版本需要处理 A 和 D 数据。这时候我们可能就无法通过数据传输来确定如何使用。因为我们无法保证服务端与客户端能够同步升级。

此时我们不得不借助版本号。新版本前端调用新版本的 API ，旧版本前端调用旧版本的 API。

```ts
/**
 * 2019-11-12 版本 15 兼容处理了 xxxx, xxxx
 * 2018-12-10 版本 14 xxxxxx
 */
const api = initRequest({
  // 全局 api 版本号
  apiVersion: 15,
});

const queryXXX = () => {
  return api({
    // 可以使用 api 版本号，不传递默认使用全局版本号
    apiVersion: 3,
  });
};
```

使用或者不使用全局版本号都有各自的优点。使用全局版本号一个版本可以同时进行多处修改，方便开发者维护。但是如果 api 兼容过多的话，apiVersion 也会升级的很快。最终反而不利于维护。大家可以酌情处理，如果是互联网项目，大家可以考虑使用 api 独立版本号，如果是企业服务则优先使用全局版本号。

大部分情况下服务端都可以兼容之前的代码。

```typescript
@Controller({
  path: "user",
  version: "2",
})
export class UserController {
  @Get()
  @Version("2")
  findAll() {
    return this.userService.findAll();
  }

  @Get()
  @Version("1")
  findAllOld() {
    return this.userService.findAllOld();
  }
}
```

极少数情况下，服务端代码难以兼容，或者需要付出极大代价，这时候就可以拒绝服务。

```typescript
@Controller({
  path: "user",
  version: "2",
})
export class UserController {
  @Get()
  @Version("1")
  findAllOld() {
    // 抛出版本不支持异常
    throw BusinessException.throwVersionNotSupport();
  }
}
```

老的前端代码中后端拒绝服务。这样的话就不需要在服务端维护多个版本。代码如下所示：

```ts
export const handleVersionError(err) {
  // 版本不支持和
  if (err.errCode !== 'versionNotSupport') {
    return;
  }

  this.$confirm('当前版本过低，无法正常使用此功能。', '温馨提示', {
    confirmButtonText: '刷新页面使用最新版本',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    location.reload();
  })
}
```

如果使用小程序开发，也可以通过小程序 API updateManager 重启升级。代码如下所示：

```ts
const updateManager = Taro.getUpdateManager();

updateManager.onCheckForUpdate(function (res) {
  // 请求完新版本信息的回调
  console.log(res.hasUpdate);
});

updateManager.onUpdateReady(function () {
  Taro.showModal({
    title: "更新提示",
    content: "新版本已经准备好，是否重启应用？",
    success: function (res) {
      if (res.confirm) {
        // 新的版本已经下载好，调用 applyUpdate 应用新版本并重启
        updateManager.applyUpdate();
      }
    },
  });
});

updateManager.onUpdateFailed(function () {
  // 新的版本下载失败
});
```

当然，针对小程序开发者还可以存储当前页面和获取信息，如果重启小程序后，直接打开对应界面并删除信息（添加超时机制）。

## 乐观锁

乐观锁也是利用了版本号来实现的。

当一些可变数据无法隔离时候，开发者可以用两种不同的控制策略：乐观锁策略和悲观锁策略。乐观锁用于冲突检测，悲观锁用于冲突避免。

悲观者策略非常简单，当 A 用户获取到用户信息时系统把当前用户信息给锁定，然后 B 用户在获取用户信息时就会被告知别人正在编辑。等到 A 员工进行了提交，系统才允许 B 员工获取数据。此时 B 获取的是 A 更新后的数据。

乐观者策略则不对获取进行任何限制，它可以在用户信息中添加版本号来告知用户信息已被修改。乐观锁要求每条数据都有一个版本号，同时在更新数据时候就会更新版本号，如 A 员工在更新用户信息时候提交了当前的版本号。系统判断 A 提交的时候的版本号和该条信息版本号一致，允许更新。然后系统就会把版本号修改为新的版本号，B 员工来进行提交时携带的是之前版本号，此时系统判定失败。

业务也可以根据情况添加用户问询，询问用户是否需要强制更新，在用户选择“是”时可以添加额外参数并携带之前的版本号以方便日志信息存储。

当然了，如果当前业务对时间要求没有那么高的情况下，开发者也可以直接利用数据的更新时间作为这条数据的版本号。
