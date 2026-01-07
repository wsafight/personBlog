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
