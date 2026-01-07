---
title: 基于 Squoosh WASM 的浏览器端图片转换库
published: 2026-01-08
description: 介绍了 use-squoosh 库的设计与实现，一个零依赖的浏览器端图片转换工具，通过 CDN 按需加载 Squoosh WASM 编解码器，支持 PNG、JPEG、WebP 格式互转。
tags: [JavaScript, 工具开发]
category: 工程实践
draft: false
---

在 Web 开发中，图片处理是一个常见需求。传统方案要么依赖服务端处理，要么使用 Canvas API，但前者增加服务器负担，后者在压缩质量上不尽人意。Google 的 Squoosh 项目提供了基于 WASM 的高质量图片编解码器，但直接使用比较繁琐。

于是我封装了 use-squoosh，一个零依赖的浏览器端图片转换库，通过 CDN 按需加载编解码器，开箱即用。

## 为什么需要这个库

### 现有方案的局限性

| 方案 | 优点 | 缺点 |
|------|------|------|
| 服务端处理 | 稳定可靠 | 增加服务器负担、网络开销 |
| Canvas API | 无依赖 | JPEG 质量差、不支持 WebP 编码 |
| 直接使用 @jsquash | 质量好 | 需要手动管理多个包、配置 WASM |
| 在线工具 | 简单 | 隐私风险、批量处理不便 |

### Canvas 的质量问题

Canvas 的 `toBlob()` 和 `toDataURL()` 方法虽然简单，但存在明显缺陷：

```javascript
// Canvas 方式
canvas.toBlob(callback, 'image/jpeg', 0.8);
```

**问题：**
1. JPEG 编码器质量较差，同等文件大小下清晰度不如专业编码器
2. 不支持 WebP 编码（部分旧浏览器）
3. 无法精确控制编码参数

### Squoosh 的优势

[Squoosh](https://squoosh.app/) 是 Google Chrome Labs 开发的图片压缩工具，其核心是一系列编译为 WASM 的高性能编解码器：

- **MozJPEG**：Mozilla 优化的 JPEG 编码器，同等质量下文件更小
- **libwebp**：Google 官方 WebP 编解码器
- **OxiPNG**：Rust 编写的 PNG 优化器

[@jsquash](https://github.com/nickreese/jSquash) 将这些编解码器封装为独立的 npm 包，但直接使用需要：
1. 安装多个包（@jsquash/webp、@jsquash/png、@jsquash/jpeg）
2. 手动处理 WASM 文件加载
3. 管理编解码器的初始化

use-squoosh 解决了这些问题。

## 核心设计思路

### 零依赖 + CDN 加载

最核心的设计决策是：**不打包编解码器，运行时从 CDN 加载**。

```typescript
// 编解码器通过动态 import 从 CDN 加载
const url = `${cdnConfig.baseUrl}/@jsquash/webp@${version}/encode.js`;
const module = await import(/* @vite-ignore */ url);
```

**好处：**
1. 库本身体积极小（< 5KB gzipped）
2. 编解码器按需加载，不使用的格式不会下载
3. 利用 CDN 缓存，多项目共享同一份 WASM

**加载时机：**
- 首次调用转换函数时加载对应格式的编解码器
- 加载后缓存到 `window` 对象，页面内复用
- 支持预加载关键格式

### Promise 缓存避免竞态

并发场景下可能同时触发多次加载：

```typescript
// 错误示例：可能重复加载
async function getEncoder() {
  if (!cache.encoder) {
    cache.encoder = await import(url);  // 并发时会多次触发
  }
  return cache.encoder;
}
```

解决方案是缓存 Promise 而非结果：

```typescript
// 正确示例：缓存 Promise
async function getCodec(type: CodecType): Promise<any> {
  const cache = getCache();
  if (!cache[type]) {
    // 缓存 Promise 本身，而非 await 后的结果
    cache[type] = import(/* @vite-ignore */ url);
  }
  const module = await cache[type];
  return module.default;
}
```

这样即使并发调用，也只会触发一次网络请求。

### 全局缓存支持多项目共享

编解码器挂载到 `window` 对象：

```typescript
function getCache(): CodecCache {
  if (typeof window !== "undefined") {
    const key = cdnConfig.cacheKey;
    if (!(window as any)[key]) {
      (window as any)[key] = createEmptyCache();
    }
    return (window as any)[key];
  }
  return moduleCache;  // 非浏览器环境回退
}
```

**好处：**
- 同一页面多个组件/库使用 use-squoosh，共享编解码器
- 页面导航不重新加载（SPA 场景）
- 可配置 `cacheKey` 实现隔离

## 实现细节

### 格式自动检测

当输入是 `Blob` 或 `File` 时，自动从 MIME 类型检测格式：

```typescript
const FORMAT_MAP: Record<string, ImageFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
  // 同时支持扩展名
  png: "png",
  jpeg: "jpeg",
  jpg: "jpeg",
  webp: "webp",
};

export async function convert(
  input: ArrayBuffer | Blob | File,
  options: ConvertOptions = {},
): Promise<ArrayBuffer> {
  let buffer: ArrayBuffer;
  let fromFormat = options.from;

  if (input instanceof Blob || input instanceof File) {
    buffer = await input.arrayBuffer();
    // 自动检测格式
    if (!fromFormat && input.type) {
      fromFormat = getFormat(input.type) ?? undefined;
    }
  } else {
    buffer = input;
  }

  // ...
}
```

### 解码 -> 编码流程

图片转换本质是：解码为 ImageData → 编码为目标格式。

```typescript
export async function decode(
  buffer: ArrayBuffer,
  type: ImageFormat,
): Promise<ImageData> {
  switch (type.toLowerCase()) {
    case "png": {
      const decoder = await getPngDecoder();
      return decoder(buffer);
    }
    case "jpeg":
    case "jpg": {
      const decoder = await getJpegDecoder();
      return decoder(buffer);
    }
    case "webp": {
      const decoder = await getWebpDecoder();
      return decoder(buffer);
    }
    default:
      throw new Error(`Unsupported decode type: ${type}`);
  }
}

export async function encode(
  imageData: ImageData,
  type: ImageFormat,
  options: { quality?: number } = {},
): Promise<ArrayBuffer> {
  switch (type.toLowerCase()) {
    case "png": {
      const encoder = await getPngEncoder();
      return encoder(imageData);  // PNG 无损，不需要 quality
    }
    case "jpeg":
    case "jpg": {
      const encoder = await getJpegEncoder();
      return encoder(imageData, { quality: options.quality ?? 75 });
    }
    case "webp": {
      const encoder = await getWebpEncoder();
      return encoder(imageData, { quality: options.quality ?? 75 });
    }
    default:
      throw new Error(`Unsupported encode type: ${type}`);
  }
}
```

### CDN 配置系统

支持自定义 CDN 地址和版本：

```typescript
export interface CDNConfig {
  baseUrl?: string;      // CDN 基础路径
  webpVersion?: string;  // @jsquash/webp 版本
  pngVersion?: string;   // @jsquash/png 版本
  jpegVersion?: string;  // @jsquash/jpeg 版本
  cacheKey?: string;     // window 缓存 key
}

const defaultCDNConfig: Required<CDNConfig> = {
  baseUrl: "https://cdn.jsdelivr.net/npm",
  webpVersion: "1.5.0",
  pngVersion: "3.1.1",
  jpegVersion: "1.6.0",
  cacheKey: "__ImageConverterCache__",
};
```

**智能缓存清除：** 只有 CDN 相关配置变更时才清除缓存：

```typescript
export function configure(config: CDNConfig): void {
  const cdnKeys: (keyof CDNConfig)[] = [
    "baseUrl", "webpVersion", "pngVersion", "jpegVersion",
  ];

  // 只有这些字段变更才清除缓存
  const needsClearCache = cdnKeys.some(
    (key) => key in config && config[key] !== cdnConfig[key],
  );

  cdnConfig = { ...cdnConfig, ...config };

  if (needsClearCache) {
    clearCache();
  }
}
```

### 编解码器 URL 生成

统一管理编解码器的包名、版本和文件路径：

```typescript
const codecConfig: Record<
  CodecType,
  { pkg: string; version: keyof CDNConfig; file: string }
> = {
  webpEncoder: { pkg: "@jsquash/webp", version: "webpVersion", file: "encode.js" },
  webpDecoder: { pkg: "@jsquash/webp", version: "webpVersion", file: "decode.js" },
  pngEncoder: { pkg: "@jsquash/png", version: "pngVersion", file: "encode.js" },
  pngDecoder: { pkg: "@jsquash/png", version: "pngVersion", file: "decode.js" },
  jpegEncoder: { pkg: "@jsquash/jpeg", version: "jpegVersion", file: "encode.js" },
  jpegDecoder: { pkg: "@jsquash/jpeg", version: "jpegVersion", file: "decode.js" },
};

async function getCodec(type: CodecType): Promise<any> {
  const cache = getCache();
  if (!cache[type]) {
    const { pkg, version, file } = codecConfig[type];
    const url = `${cdnConfig.baseUrl}/${pkg}@${cdnConfig[version]}/${file}`;
    cache[type] = import(/* @vite-ignore */ url);
  }
  const module = await cache[type];
  return module.default;
}
```

## 使用方式

### 基本使用

```typescript
import { convert, pngToWebp, compress } from 'use-squoosh';

// 文件选择器获取图片
const file = input.files[0];

// PNG 转 WebP
const webpBuffer = await pngToWebp(file, { quality: 80 });

// 通用转换
const result = await convert(file, {
  from: 'png',    // Blob/File 可省略，自动检测
  to: 'webp',
  quality: 85
});

// 压缩（保持原格式）
const compressed = await compress(file, {
  format: 'jpeg',
  quality: 70
});
```

### 配置 CDN

```typescript
import { configure } from 'use-squoosh';

// 使用 unpkg
configure({ baseUrl: 'https://unpkg.com' });

// 使用自托管 CDN
configure({ baseUrl: 'https://your-cdn.com/npm' });

// 锁定特定版本
configure({
  webpVersion: '1.5.0',
  pngVersion: '3.1.1',
  jpegVersion: '1.6.0'
});
```

### 预加载优化首屏

```typescript
import { preload, isLoaded } from 'use-squoosh';

// 页面加载时预加载常用格式
await preload(['webp', 'png']);

// 检查加载状态
if (isLoaded('webp')) {
  // WebP 编解码器已就绪
}
```

### 工具函数

```typescript
import { toBlob, toDataURL, download } from 'use-squoosh';

const buffer = await pngToWebp(file);

// 转为 Blob
const blob = toBlob(buffer, 'image/webp');

// 转为 Data URL（用于 img.src）
const dataUrl = await toDataURL(buffer, 'image/webp');

// 触发下载
download(buffer, 'converted.webp', 'image/webp');
```

## 自托管 CDN

如果不想依赖公共 CDN，可以自托管编解码器文件。

### 目录结构要求

```
your-cdn.com/npm/
  @jsquash/
    webp@1.5.0/
      encode.js
      decode.js
    png@3.1.1/
      encode.js
      decode.js
    jpeg@1.6.0/
      encode.js
      decode.js
```

### 获取文件

从 npm 下载对应版本：

```bash
# 下载 @jsquash 包
npm pack @jsquash/webp@1.5.0
npm pack @jsquash/png@3.1.1
npm pack @jsquash/jpeg@1.6.0

# 解压并部署到 CDN
```

### 配置使用

```typescript
configure({
  baseUrl: 'https://your-cdn.com/npm',
  webpVersion: '1.5.0',
  pngVersion: '3.1.1',
  jpegVersion: '1.6.0'
});
```

## 压缩效果对比

以一张 1920x1080 的 PNG 截图为例：

| 输出格式 | Quality | 文件大小 | 压缩率 |
|---------|---------|---------|--------|
| 原始 PNG | - | 2.1 MB | - |
| WebP | 80 | 186 KB | 91% |
| WebP | 90 | 312 KB | 85% |
| JPEG | 80 | 245 KB | 88% |
| JPEG | 90 | 398 KB | 81% |

WebP 在同等视觉质量下，文件大小比 JPEG 小约 25-35%。

## 浏览器兼容性

需要支持 WebAssembly 和动态 import：

| 浏览器 | 最低版本 |
|--------|---------|
| Chrome | 57+ |
| Firefox | 52+ |
| Safari | 11+ |
| Edge | 16+ |

覆盖全球 95%+ 的用户。

## 与其他方案对比

| 特性 | use-squoosh | browser-image-compression | 直接使用 @jsquash |
|------|-------------|--------------------------|-------------------|
| 包大小 | < 5KB | ~50KB | ~2KB × 6 |
| 运行时依赖 | CDN 加载 | 打包在内 | 需手动配置 |
| WebP 支持 | ✅ | ✅ | ✅ |
| PNG 优化 | ✅ | ❌ | ✅ |
| 质量控制 | ✅ | ✅ | ✅ |
| 自动格式检测 | ✅ | ✅ | ❌ |
| 预加载 | ✅ | ❌ | 需手动 |
| 自定义 CDN | ✅ | ❌ | ❌ |
| TypeScript | ✅ | ✅ | ✅ |

## 总结

use-squoosh 通过以下设计实现了易用的浏览器端图片转换：

1. **零依赖设计**：编解码器按需从 CDN 加载，库本身极轻量
2. **Promise 缓存**：避免并发场景重复加载
3. **全局共享**：多组件/项目复用编解码器
4. **灵活配置**：支持自定义 CDN 和版本锁定
5. **TypeScript**：完整类型定义，开发体验好

项目已开源：https://github.com/wsafight/use-squoosh

欢迎提出 issue 和 PR。

## 参考资料

- [Squoosh](https://squoosh.app/) - Google 的在线图片压缩工具
- [jSquash](https://github.com/jamsinclair/jSquash) - Squoosh 编解码器的 npm 封装
- [WebAssembly](https://webassembly.org/) - 浏览器端高性能运行时
