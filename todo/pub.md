---
title: 发到 npm
---

## 前置条件

1. 注册 [npm](https://www.npmjs.com) 账号
2. 验证邮箱
3. 启用双因素认证（2FA）

### 启用 2FA

npm 要求启用 2FA 才能发布包：

1. 登录 [npmjs.com](https://www.npmjs.com)
2. 点击头像 → **Account** → **Two-Factor Authentication**
3. 选择 **Authenticator App**，使用 Google Authenticator、1Password 等扫码
4. 完成设置

## 发布流程

### 1. 登录 npm

```bash
npm login
```

按提示完成浏览器认证或邮箱验证。

验证登录状态：

```bash
npm whoami
```

### 2. 检查包名

```bash
npm view use-squoosh
```

返回 404 表示包名可用。

### 3. 构建项目

```bash
pnpm build
```

### 4. 检查发布内容

```bash
npm pack --dry-run
```

确认 `dist/` 和 `src/` 包含在内。

### 5. 发布

```bash
npm publish
```

发布时会提示输入 2FA 验证码。

## 版本更新

```bash
# 修复版本 0.1.0 -> 0.1.1
npm version patch

# 功能版本 0.1.0 -> 0.2.0
npm version minor

# 大版本 0.1.0 -> 1.0.0
npm version major

# 发布新版本
npm publish
```

## 常见问题

### E401 Unauthorized

未登录，执行 `npm login`。

### E403 Forbidden (2FA required)

需要启用双因素认证，参考上方「启用 2FA」。

### E404 Not Found

检查 registry 配置：

```bash
npm config get registry
```

应为 `https://registry.npmjs.org/`。如果是淘宝镜像，发布时指定官方源：

```bash
npm publish --registry https://registry.npmjs.org/
```

### 包名已被占用

修改 `package.json` 中的 `name` 字段，或使用 scope：

```json
{
  "name": "@yourname/use-squoosh"
}
```

发布 scoped 包：

```bash
npm publish --access public
```


/**
 * Hono RegExpRouter 核心原理演示
 *
 * Hono 之所以快，核心原因在于它尽量将路由匹配逻辑下沉到 JavaScript 引擎底层（C++ 实现的 RegExp）。
 * 传统的路由可能需要手动分割字符串、遍历节点（线性或树状），这些都是在 JS 层面执行的，开销相对较大。
 *
 * 下面是一个简化版的实现，展示如何将路由路径编译为正则表达式，以及如何提取参数。
 *
 * 注意：Hono 真实的 RegExpRouter 实现更复杂，它会尝试将多个路由合并成一个巨大的正则表达式（Trie + Regex），
 * 从而进一步减少匹配次数。这里为了易懂，展示的是“每个路由预编译成正则”的版本。
 */

type Handler = (params: Record<string, string>) => void;

interface Route {
  method: string;
  path: string;
  handler: Handler;
  paramNames: string[]; // 存储参数名，例如 ['id', 'postId']
}

export class DemoRegExpRouter {
  // 存储预编译好的正则表达式和对应的路由信息
  private routes: { pattern: RegExp; route: Route }[] = [];

  /**
   * 注册路由
   * 在这个阶段（应用启动时），我们进行“昂贵”的编译工作，
   * 将路径字符串转换为高效的正则表达式。
   */
  add(method: string, path: string, handler: Handler) {
    const paramNames: string[] = [];

    // 1. 路径转换：将 /user/:id/post/:postId 转换为正则字符串
    // 这里的正则逻辑是：找到 :xxx 形式的片段，替换为捕获组 ([^/]+)
    // 同时记录下参数名称，以便后续匹配时对应赋值
    const regexPath = path.replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
      paramNames.push(paramName); // 记录参数名：['id', 'postId']
      return '([^/]+)';           // 替换为正则捕获组：匹配除 / 以外的任意字符
    });

    // 2. 生成最终的正则表达式
    // ^ 和 $ 确保是全路径匹配
    // 例如：/user/:id 变成了 /^\/user\/([^/]+)$/
    // 这一步利用了 JS 引擎对正则的底层优化
    const pattern = new RegExp(`^${regexPath}$`);

    this.routes.push({
      pattern,
      route: { method, path, handler, paramNames }
    });
  }

  /**
   * 路由匹配
   * 在请求到来时调用。
   * 这里的关键是：主要逻辑只有 pattern.exec(path)，这是一个非常快的原生操作。
   */
  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
    // 遍历所有注册的路由（Hono 会通过 Trie 树或合并正则进一步减少这里的遍历次数）
    for (const { pattern, route } of this.routes) {
      // 1. 检查 HTTP 方法
      if (route.method !== method && route.method !== 'ALL') {
        continue;
      }

      // 2. 执行正则匹配
      // 这是最耗时的部分，但因为交给了底层 C++ 引擎，所以非常快
      const match = pattern.exec(path);

      if (match) {
        // 3. 提取参数
        // match[0] 是整个匹配串，match[1] 开始是捕获组
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });

        return { handler: route.handler, params };
      }
    }

    return null;
  }
}

// ==========================================
// 使用示例
// ==========================================

const router = new DemoRegExpRouter();

// 注册路由
router.add('GET', '/user/:id', (params) => {
  console.log(`获取用户详情，ID: ${params.id}`);
});

router.add('GET', '/user/:id/posts/:postId', (params) => {
  console.log(`获取用户 ${params.id} 的文章 ${params.postId}`);
});

// 模拟请求匹配
console.log('--- 开始匹配 ---');

// 匹配 /user/123
const result1 = router.match('GET', '/user/123');
if (result1) {
  console.log('匹配成功: /user/123');
  result1.handler(result1.params);
  // 输出: 获取用户详情，ID: 123
}

// 匹配 /user/123/posts/456
const result2 = router.match('GET', '/user/123/posts/456');
if (result2) {
  console.log('匹配成功: /user/123/posts/456');
  result2.handler(result2.params);
  // 输出: 获取用户 123 的文章 456
}

// 匹配不存在的路由
const result3 = router.match('GET', '/not/found');
if (!result3) {
  console.log('匹配失败: /not/found');
}

