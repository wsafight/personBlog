---
title: 手写一个前端存储工具库
published: 2023-02-14
description: 介绍了如何手写一个前端存储工具库，通过适配器模式统一处理内存、IndexedDB、localStorage 等不同存储介质，帮助读者深入理解存储工具库的实现原理。
tags: [JavaScript, 工具开发]
category: 工程实践
draft: false
---
在项目开发的过程中，为了减少提高性能，减少请求，开发者往往需要将一些不易改变的数据放入本地缓存中。如把用户使用的模板数据放入 localStorage 或者 IndexedDB。代码往往如下书写。

```ts
// 这里将数据放入内存中
let templatesCache = null;

// 用户id，用于多账号系统
const userId: string = '1';

const getTemplates = ({
  refresh = false
} = {
  refresh: false
}) => {
  // 不需要立即刷新，走存储
  if (!refresh) {
    // 内存中有数据，直接使用内存中数据
    if (templatesCache) {
      return Promise.resolve(templatesCache)
    }

    const key = `templates.${userId}`
    // 从 localStorage 中获取数据
    const templateJSONStr = localStroage.getItem(key)
    
    if (templateJSONStr) {
      try {
        templatesCache = JSON.parse(templateJSONStr);
        return Promise.resolve(templatesCache)
      } catch () {
        // 解析失败，清除 storage 中数据
        localStroage.removeItem(key)
      }
    }
  }

  // 进行服务端掉用获取数据
  return api.get('xxx').then(res => {
    templatesCache = cloneDeep(res)
    // 存入 本地缓存
    localStroage.setItem(key, JSON.stringify(templatesCache))
    return res
  })
};
```

可以看到，代码非常冗余，同时这里的代码还没有处理数据版本、过期时间以及数据写入等功能。如果再把这些功能点加入，代码将会更加复杂，不易维护。

于是个人写了一个小工具 [storage-tools](https://github.com/wsafight/storage-tools) 来处理这个问题。

## 使用 storage-tools 缓存数据

该库默认使用 localStorage 作为数据源，开发者从库中获取 StorageHelper 工具类。

```ts
import { StorageHelper } from "storage-tools";

// 当前用户 id
const userId = "1";

// 构建模版 store
// 构建时候就会获取 localStorage 中的数据放入内存
const templatesStore = new StorageHelper({
  // 多账号用户使用 key
  storageKey: `templates.${userId}`,
  // 当前数据版本号，可以从后端获取并传入
  version: 1,
  // 超时时间，单位为 秒
  timeout: 60 * 60 * 24,
});

// 从内存中获取数据
const templates = templatesStore.getData();

// 没有数据，表明数据过期或者没有存储过
if (templates === null) {
  api.get("xxx").then((val) => {
    // 存储数据到内存中去，之后的 getData 都可以获取到数据
    store.setData(val);

    // 闲暇时间将当前内存数据存储到 localStorage 中
    requestIdleCallback(() => {
      // 期间内可以多次掉用 setData
      store.commit();
    });
  });
}
```

StorageHelper 工具类支持了其他缓存源，代码如下：

```ts
import { IndexedDBAdaptor, StorageAdaptor, StorageHelper } from "storage-tools";

// 当前用户 id
const userId = "1";

const sessionStorageStore = new StorageHelper({
  // 配置同上
  storageKey: `templates.${userId}`,
  version: 1,
  timeout: 60 * 60 * 24,
  // 适配器，传入 sessionStorage
  adapter: sessionStorage,
});

const indexedDBStore = new StorageHelper({
  storageKey: `templates.${userId}`,
  version: 1,
  timeout: 60 * 60 * 24,
  // 适配器，传入 IndexedDBAdaptor
  adapter: new IndexedDBAdaptor({
    dbName: "userInfo",
    storeName: "templates",
  }),
});

// IndexedDB 只能异步构建，所以现在只能等待获取构建获取完成
indexedDBStore.whenReady().then(() => {
  // 准备完成后，我们就可以 getData 和 setData 了
  const data = indexedDBStore.getData();

  // 其余代码
});

// 只需要有 setItem 和 getItem 就可以构建 adaptor
class MemoryAdaptor implements StorageAdaptor {
  readonly cache = new Map();

  // 获取 map 中数据
  getItem(key: string) {
    return this.cache.get(key);
  }

  setItem(key: string, value: string) {
    this.cache.set(key, value);
  }
}

const memoryStore = new StorageHelper({
  // 配置同上
  storageKey: `templates.${userId}`,
  version: 1,
  timeout: 60 * 60 * 24,
  // 适配器，传入携带 getItem 和 setItem 对象
  adapter: new MemoryAdaptor(),
});
```

当然了，我们还可以继承 StorageHelper 构建业务类。

```ts
// 也可以基于 StorageHelper 构建业务类
class TemplatesStorage extends StorageHelper {
  // 传入 userId 以及 版本
  constructor(userId: number, version: number) {
    super({
      storageKey: `templates.${userId}`,
      // 如果需要运行时候更新，则可以动态传递
      version,
      timeout: 60 * 60 * 24,
    });
  }

  // TemplatesStorage 实例
  static instance: TemplatesStorage;

  // 如果需要版本信息的话，
  static version: number = 0;

  static getStoreInstance() {
    // 获取版本信息
    return getTemplatesVersion().then((newVersion) => {
      // 没有构建实例或者版本信息不相等，直接重新构建
      if (
        newVersion !== TemplatesStorage.version || !TemplatesStorage.instance
      ) {
        TemplatesStorage.instance = new TemplatesStorage("1", newVersion);
        TemplatesStorage.version = newVersion;
      }

      return TemplatesStorage.instance;
    });
  }

  /**
   * 获取模板缓存和 api 请求结合
   */
  getTemplates() {
    const data = super.getData();
    if (data) {
      return Promise.resolve(data);
    }
    return api.get("xxx").then((val) => {
      this.setTemplates(val);
      return super.getData();
    });
  }

  /**
   * 保存数据到内存后提交到数据源
   */
  setTemplats(templates: any[]) {
    super.setData(templates);
    super.commit();
  }
}

/**
 * 获取模版信息函数
 */
const getTemplates = () => {
  return TemplatesStorage.getStoreInstance().then((instance) => {
    return instance.getTemplates();
  });
};
```

针对于某些特定列表顺序需求，我们还可以构建 ListStorageHelper。

```ts
import { ListStorageHelper, MemoryAdaptor } from "../src";

// 当前用户 id
const userId = "1";

const store = new ListStorageHelper({
  storageKey: `templates.${userId}`,
  version: 1,
  // 设置唯一键 key，默认为 'id'
  key: "searchVal",
  // 列表存储最大数据量，默认为 10
  maxCount: 100,
  // 修改数据后是否移动到最前面，默认为 true
  isMoveTopWhenModified: true,
  // 添加数据后是否是最前面, 默认为 true
  isUnshiftWhenAdded: true,
});

store.setItem({ searchVal: "new game" });
store.getData();
// [{
//   searchVal: 'new game'
// }]

store.setItem({ searchVal: "new game2" });
store.getData();
// 会插入最前面
// [{
//   searchVal: 'new game2'
// }, {
//   searchVal: 'new game'
// }]

store.setItem({ searchVal: "new game" });
store.getData();
// 会更新到最前面
// [{
//   searchVal: 'new game'
// }, {
//   searchVal: 'new game2'
// }]

// 提交到 localStorage
store.commit();
```

## storage-tools 项目演进

任何项目都不是一触而就的，下面是关于 storage-tools 库的编写思路。希望能对大家有一些帮助。

### StorageHelper 支持 localStorage 存储

项目的第一步就是支持本地储存 localStorage 的存取。

```ts
// 获取从 1970 年 1 月 1 日 00:00:00 UTC 到用户机器时间的秒数
// 后续有需求也会向外提供时间函数配置，可以结合 sync-time 库一起使用
const getCurrentSecond = () => parseInt(`${new Date().getTime() / 1000}`);

// 获取当前空数据
const getEmptyDataStore = (version: number): DataStore<any> => {
  const currentSecond = getCurrentSecond();
  return {
    // 当前数据的创建时间
    createdOn: currentSecond,
    // 当前数据的修改时间
    modifiedOn: currentSecond,
    // 当前数据的版本
    version,
    // 数据,空数据为 null
    data: null,
  };
};

class StorageHelper<T> {
  // 存储的 key
  private readonly storageKey: string;
  // 存储的版本信息
  private readonly version: number;

  // 内存中数据，方便随时读写
  store: DataStore<T> | null = null;

  constructor({ storageKey, version }) {
    this.storageKey = storageKey;
    this.version = version || 1;

    this.load();
  }

  load() {
    const result: string | null = localStorage.getItem(this.storageKey);

    // 初始化内存信息数据
    this.initStore(result);
  }

  private initStore(storeStr: string | null) {
    // localStorage 没有数据，直接构建 空数据放入 store
    if (!storeStr) {
      this.store = getEmptyDataStore(this.version);
      return;
    }

    let store: DataStore<T> | null = null;

    try {
      // 开始解析 json 字符串
      store = JSON.parse(storeStr);

      // 没有数据或者 store 没有 data 属性直接构建空数据
      if (!store || !("data" in store)) {
        store = getEmptyDataStore(this.version);
      } else if (store.version !== this.version) {
        // 版本不一致直接升级
        store = this.upgrade(store);
      }
    } catch (_e) {
      // 解析失败了，构建空的数据
      store = getEmptyDataStore(this.version);
    }

    this.store = store || getEmptyDataStore(this.version);
  }

  setData(data: T) {
    if (!this.store) {
      return;
    }
    this.store.data = data;
  }

  getData(): T | null {
    if (!this.store) {
      return null;
    }
    return this.store?.data;
  }

  commit() {
    // 获取内存中的 store
    const store = this.store || getEmptyDataStore(this.version);
    store.version = this.version;

    const now = getCurrentSecond();
    if (!store.createdOn) {
      store.createdOn = now;
    }
    store.modifiedOn = now;

    // 存储数据到 localStorage
    localStorage.setItem(this.storageKey, JSON.stringify(store));
  }

  /**
   * 获取内存中 store 的信息
   * 如 modifiedOn createdOn version 等信息
   */
  get(key: DataStoreInfo) {
    return this.store?.[key];
  }

  upgrade(store: DataStore<T>): DataStore<T> {
    // 获取当前的秒数
    const now = getCurrentSecond();
    // 看起来很像 getEmptyDataStore 代码，但实际上是不同的业务
    // 不应该因为代码相似而合并，不利于后期扩展
    return {
      // 只获取之前的创建时间，如果没有使用当前的时间
      createdOn: store?.createdOn || now,
      modifiedOn: now,
      version: this.version,
      data: null,
    };
  }
}
```

### StorageHelper 添加超时机制

添加超时机制很简单，只需要在 getData 的时候检查一下数据即可。

```ts
class StorageHelper<T> {
  // 其他代码 ...

  // 超时时间，默认为 -1，即不超时
  private readonly timeout: number = -1;

  constructor({ storageKey, version, timeout }: StorageHelperParams) {
    // 传入的数据是数字类型，且大于 0，就设定超时时间
    if (typeof timeout === "number" && timeout > 0) {
      this.timeout = timeout;
    }
  }

  getData(): T | null {
    if (!this.store) {
      return null;
    }

    // 如果小于 0 就没有超时时间，直接返回数据，事实上不可能小于0
    if (this.timeout < 0) {
      return this.store?.data;
    }

    // 修改时间加超时时间大于当前时间，则表示没有超时
    // 注意，每次 commit 都会更新 modifiedOn
    if (getCurrentSecond() < (this.store?.modifiedOn || 0) + this.timeout) {
      return this.store?.data;
    }

    // 版本信息在最开始时候处理过了，此处直接返回 null
    return null;
  }
}
```

### StorageHelper 添加其他存储适配

此时我们可以添加其他数据源适配，方便开发者自定义 storage。

```ts
/**
 * 适配器接口，存在 getItem 以及 setItem
 */
interface StorageAdaptor {
  getItem: (key: string) => string | Promise<string> | null;
  setItem: (key: string, value: string) => void;
}

class StorageHelper<T> {
  // 其他代码 ...

  // 非浏览器环境不具备 localStorage，所以不在此处直接构造
  readonly adapter: StorageAdaptor;

  constructor({ storageKey, version, adapter, timeout }: StorageHelperParams) {
    // 此处没有传递 adapter 就会使用 localStorage
    // adapter 对象必须有 getItem 和 setItem
    // 此处没有进一步判断 getItem 是否为函数以及 localStorage 是否存在
    // 没有办法限制住所有的异常
    this.adapter = adapter && "getItem" in adapter && "setItem" in adapter
      ? adapter
      : localStorage;

    this.load();
  }

  load() {
    // 此处改为 this.adapter
    const result: Promise<string> | string | null = this.adapter.getItem(
      this.storageKey,
    );
  }

  commit() {
    // 此处改为 this.adapter
    this.adapter.setItem(this.storageKey, JSON.stringify(store));
  }
}
```

### StorageHelper 添加异步获取

如有些数据源需要异步构建并获取数据，例如 IndexedDB 。这里我们先建立一个 IndexedDBAdaptor 类。

```ts
import { StorageAdaptor } from "../utils";

// 把 indexedDB 的回调改为 Promise
function promisifyRequest<T = undefined>(
  request: IDBRequest<T> | IDBTransaction,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // @ts-ignore
    request.oncomplete = request.onsuccess = () => resolve(request.result);
    // @ts-ignore
    request.onabort = request.onerror = () => reject(request.error);
  });
}

/**
 * 创建并返回 indexedDB 的句柄
 */
const createStore = (
  dbName: string,
  storeName: string,
  upgradeInfo: IndexedDBUpgradeInfo = {},
): UseStore => {
  const request = indexedDB.open(dbName);

  /**
   * 创建或者升级时候会调用 onupgradeneeded
   */
  request.onupgradeneeded = () => {
    const { result: store } = request;
    if (!store.objectStoreNames.contains(storeName)) {
      const { options = {}, indexList = [] } = upgradeInfo;
      // 基于 配置项生成 store
      const store = request.result.createObjectStore(storeName, { ...options });

      // 建立索引
      indexList.forEach((index) => {
        store.createIndex(index.name, index.keyPath, index.options);
      });
    }
  };

  const dbp = promisifyRequest(request);

  return (txMode, callback) =>
    dbp.then((db) =>
      callback(db.transaction(storeName, txMode).objectStore(storeName))
    );
};

export class IndexedDBAdaptor implements StorageAdaptor {
  private readonly store: UseStore;

  constructor({ dbName, storeName, upgradeInfo }: IndexedDBAdaptorParams) {
    this.store = createStore(dbName, storeName, upgradeInfo);
  }

  /**
   * 获取数据
   */
  getItem(key: string): Promise<string> {
    return this.store("readonly", (store) => promisifyRequest(store.get(key)));
  }

  /**
   * 设置数据
   */
  setItem(key: string, value: string) {
    return this.store("readwrite", (store) => {
      store.put(value, key);
      return promisifyRequest(store.transaction);
    });
  }
}
```

对 StorageHelper 类做如下改造

```ts
type CreateDeferredPromise = <TValue>() => CreateDeferredPromiseResult<TValue>;

// 劫持一个 Promise 方便使用
export const createDeferredPromise: CreateDeferredPromise = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    currentPromise: promise,
    resolve,
    reject,
  };
};

export class StorageHelper<T> {
  // 是否准备好了
  ready: CreateDeferredPromiseResult<boolean> = createDeferredPromise<
    boolean
  >();

  constructor({ storageKey, version, adapter, timeout }: StorageHelperParams) {
    this.load();
  }

  load() {
    const result: Promise<string> | string | null = this.adapter.getItem(
      this.storageKey,
    );

    // 检查一下当前的结果是否是 Promise 对象
    if (isPromise(result)) {
      result
        .then((res) => {
          this.initStore(res);
          // 准备好了
          this.ready.resolve(true);
        })
        .catch(() => {
          this.initStore(null);
          // 准备好了
          this.ready.resolve(true);
        });
    } else {
      // 不是 Promise 直接构建 store
      this.initStore(result);
      // 准备好了
      this.ready.resolve(true);
    }
  }

  // 询问是否做好准备
  whenReady() {
    return this.ready.currentPromise;
  }
}
```

如此，我们就完成了 StorageHelper 全部代码。

### 列表辅助类 ListStorageHelper

ListStorageHelper 基于 StorageHelper 构建，方便特定业务使用。

```ts
// 数组最大数量
const STORE_MAX_COUNT: number = 10;

export class ListStorageHelper<T> extends StorageHelper<T[]> {
  // 主键，默认为 id
  readonly key: string = "id";
  // 存储最大数量，默认为 10
  readonly maxCount: number = STORE_MAX_COUNT;

  // 是否添加在最前面
  readonly isUnshiftWhenAdded: boolean = true;
  // 修改后是否放入最前面
  readonly isMoveTopWhenModified: boolean = true;

  constructor({
    maxCount,
    key,
    isMoveTopWhenModified = true,
    isUnshiftWhenAdded = true,
    storageKey,
    version,
    adapter,
    timeout,
  }: ListStorageHelperParams) {
    super({ storageKey, version, adapter, timeout });
    this.key = key || "id";

    // 设置配置项
    if (typeof maxCount === "number" && maxCount > 0) {
      this.maxCount = maxCount;
    }

    if (typeof isMoveTopWhenModified === "boolean") {
      this.isMoveTopWhenModified = isMoveTopWhenModified;
    }

    if (typeof this.isUnshiftWhenAdded === "boolean") {
      this.isUnshiftWhenAdded = isUnshiftWhenAdded;
    }
  }

  load() {
    super.load();
    // 没有数据，设定为空数组方便统一
    if (!this.store!.data) {
      this.store!.data = [];
    }
  }

  getData = (): T[] => {
    const items = super.getData() || [];
    // 检查数据长度并移除超过的数据
    this.checkThenRemoveItem(items);
    return items;
  };

  setItem(item: T) {
    if (!this.store) {
      throw new Error("Please complete the loading load first");
    }

    const items = this.getData();

    // 利用 key 去查找存在数据索引
    const index = items.findIndex(
      (x: any) => x[this.key] === (item as any)[this.key],
    );

    // 当前有数据，是更新
    if (index > -1) {
      const current = { ...items[index], ...item };
      // 更新移动数组数据
      if (this.isMoveTopWhenModified) {
        items.splice(index, 1);
        items.unshift(current);
      } else {
        items[index] = current;
      }
    } else {
      // 添加
      this.isUnshiftWhenAdded ? items.unshift(item) : items.push(item);
    }
    // 检查并移除数据
    this.checkThenRemoveItem(items);
  }

  removeItem(key: string | number) {
    if (!this.store) {
      throw new Error("Please complete the loading load first");
    }
    const items = this.getData();
    const index = items.findIndex((x: any) => x[this.key] === key);
    // 移除数据
    if (index > -1) {
      items.splice(index, 1);
    }
  }

  setItems(items: T[]) {
    if (!this.store) {
      return;
    }
    this.checkThenRemoveItem(items);
    // 批量设置数据
    this.store.data = items || [];
  }

  /**
   * 多添加一个方法 getItems，等同于 getData 方法
   */
  getItems() {
    if (!this.store) {
      return null;
    }
    return this.getData();
  }

  checkThenRemoveItem = (items: T[]) => {
    if (items.length <= this.maxCount) {
      return;
    }
    items.splice(this.maxCount, items.length - this.maxCount);
  };
}
```

该类继承了 StorageHelper，我们依旧可以直接调用 commit 提交数据。如此我们就不需要维护复杂的 storage 存取逻辑了。

代码都在 [storage-tools](https://github.com/wsafight/storage-tools) 中，欢迎各位提交 issue 以及 pr。

## 参考资料

[storage-tools](https://github.com/wsafight/storage-tools)

[sync-time](https://github.com/wsafight/sync-time)
