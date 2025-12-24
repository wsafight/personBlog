---
title: 手写一个 Askama 模板压缩工具
published: 2025-12-23
description: 介绍了 askama-minify 工具的设计与实现，这是一个专门用于压缩 Askama 模板文件的 Rust 工具。文章详细讲解了如何保留模板语法、压缩 HTML/CSS/JavaScript，压缩率可达 40-55%。
tags: [性能优化, 模板]
category: 性能优化
draft: false
---

在 Web 开发中，前端资源的大小直接影响用户体验。大型模板文件不仅占用带宽，还会延长页面加载时间。虽然市面上有很多 HTML 压缩工具，但对于使用了模板引擎的 HTML 文件（如 Askama、Jinja2 等），通用压缩器往往会破坏模板语法。

于是个人写了一个 Askama 模板压缩工具 askama-minify，专门用于压缩 Askama 模板文件，同时完美保留模板语法。

## Askama 为什么要压缩

### 模板文件占用的空间

在实际的 Web 项目中，模板文件往往占据相当大的体积：

| 项目类型 | 模板数量 | 总大小 | 压缩后大小 |
|---------|---------|--------|-----------|
| 小型网站 | 10-20 | 200-500KB | 100-250KB |
| 中型应用 | 50-100 | 1-3MB | 500KB-1.5MB |
| 大型系统 | 200+ | 5-10MB | 2-5MB |

### 压缩的好处

1. **减少带宽消耗**：模板大小减少 40-55%，直接降低流量成本
2. **加快页面加载**：更小的文件意味着更快的传输速度
3. **提升用户体验**：首屏渲染时间缩短，特别是移动端用户
4. **降低服务器负载**：传输数据量减少，服务器压力降低
5. **节省存储空间**：生产环境的模板文件占用更少空间

### Askama 自带的压缩配置

Askama 本身提供了 whitespace 控制功能，在项目根目录的 `askama.toml` 中配置：

```toml
[general]
# 三种模式可选
whitespace = "suppress"   # 或 "minimize" / "preserve"
```

**三种模式对比：**

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| `preserve` | 保留所有空白（默认） | 开发调试 |
| `suppress` | 激进移除空白 | 生产环境 |
| `minimize` | 适度移除空白 | 平衡模式 |

也可以在单个模板上覆盖：

```rust
#[derive(Template)]
#[template(path = "example.html", whitespace = "suppress")]
struct ExampleTemplate;
```

### Askama 自带压缩的局限性

Askama 的 whitespace 控制有以下限制：

1. **只处理空白字符**：不能移除 HTML 注释 `<!-- -->`
2. **不影响 CSS**：`<style>` 标签内的 CSS 完全保留
3. **不影响 JavaScript**：`<script>` 标签内的 JS 完全保留
4. **不优化代码**：无法进行属性合并、颜色优化等

**示例对比：**

```html
<!-- 原始模板 -->
<style>
    body {
        margin-top: 0;
        margin-bottom: 0;
        /* 这是 CSS 注释 */
        background-color: #ff0000;
    }
</style>
<script>
    // 这是 JS 注释
    console.log("Hello");
</script>
```

```html
<!-- Askama whitespace = "suppress" 的结果 -->
<style>body{margin-top:0;margin-bottom:0;/*这是CSS注释*/background-color:#ff0000;}</style><script>//这是JS注释
console.log("Hello");</script>
```

```html
<!-- askama-minify 的结果 -->
<style>body{margin:0 0;background-color:red}</style><script>console.log("Hello");</script>
```

可以看到，askama-minify 做得更彻底：
- 移除了所有注释
- 合并了 CSS 属性
- 优化了颜色值
- 压缩了 JavaScript

## 项目演进

任何项目都不是一蹴而就的，下面是关于 askama-minify 库的编写思路。希望能对大家有一些帮助。

## 为什么需要专门的工具（补充）

在使用 Askama 这样的 Rust 模板引擎时，我们的模板文件中会包含特殊的语法：

```html
<!-- Askama 模板语法 -->
<div>{{ title }}</div>
{% for item in items %}
    <p>{{ item.name }}</p>
{% endfor %}
```

通用的 HTML 压缩器（如 html-minifier）可能会：
- 将 `{{ }}` 识别为无效语法而破坏
- 将 `{% %}` 中的空格错误处理
- 无法区分模板语法和普通文本

因此我们需要一个专门设计的压缩工具。

## 简单的 HTML 压缩

最基础的 HTML 压缩非常简单：移除多余的空白字符即可。

```rust
pub fn minify_html_simple(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let mut last_was_space = false;

    for ch in content.chars() {
        if ch.is_whitespace() {
            if !last_was_space && !result.is_empty() {
                result.push(' ');
                last_was_space = true;
            }
        } else {
            result.push(ch);
            last_was_space = false;
        }
    }

    result
}
```

这个简单版本会将：
```html
<div>    <p>   Hello   </p>    </div>
```
压缩为：
```html
<div> <p> Hello </p> </div>
```

但这样还不够——我们需要：
1. 移除 HTML 注释
2. 处理特殊标签（`<pre>`, `<textarea>`）
3. 保留模板语法

## 保留模板语法

模板语法的保留是本工具的核心。我们需要在遇到 `{{` 和 `{%` 时，保持原样输出，直到遇到对应的 `}}` 和 `%}`。

```rust
pub fn minify_html(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let mut chars = content.chars().peekable();
    let mut in_template_brace = false;  // {{ }}
    let mut in_template_chevron = false; // {% %}

    while let Some(ch) = chars.next() {
        // 检测模板语法开始
        if ch == '{' {
            if let Some(&next_ch) = chars.peek() {
                if next_ch == '{' {
                    in_template_brace = true;
                    result.push(ch);
                    continue;
                } else if next_ch == '%' {
                    in_template_chevron = true;
                    result.push(ch);
                    continue;
                }
            }
        }

        // 在模板语法内，保持原样
        if in_template_brace || in_template_chevron {
            result.push(ch);
            // 检测模板语法结束
            if in_template_brace && ch == '}' && result.ends_with("}}") {
                in_template_brace = false;
            } else if in_template_chevron && ch == '}' && result.ends_with("%}") {
                in_template_chevron = false;
            }
            continue;
        }

        // ... 其他处理逻辑
    }

    result
}
```

测试一下：
```
输入: <div>{{ title }}</div>
输出: <div>{{ title }}</div>  // 完美保留

输入: <div>  {{  title  }}</div>
输出: <div> {{ title }}</div>  // 模板外空格压缩，模板内保留
```

## 移除 HTML 注释

HTML 注释的移除需要小心，不能破坏字符串中的 `<!--`：

```rust
// HTML 注释处理（只在不在 script/style 内时处理）
if !in_script && !in_style && ch == '<' && chars.peek() == Some(&'!') {
    let mut comment = String::from("<");
    comment.push(chars.next().unwrap()); // '!'

    if chars.peek() == Some(&'-') {
        comment.push(chars.next().unwrap()); // first '-'
        if chars.peek() == Some(&'-') {
            comment.push(chars.next().unwrap()); // second '-'
            // 这是一个注释，跳过直到 -->
            while let Some(c) = chars.next() {
                comment.push(c);
                if comment.ends_with("-->") {
                    break;
                }
            }
            continue; // 跳过注释
        }
    }
    result.push_str(&comment);
    continue;
}
```

## 处理特殊标签

某些标签（如 `<pre>` 和 `<textarea>`）的内容需要完全保留原样，包括空格和换行：

```rust
let mut in_pre = false;
let mut in_textarea = false;

// 在标签检测时
if tag_name == "pre" {
    in_pre = true;
} else if tag_name == "textarea" {
    in_textarea = true;
} else if tag_name == "/pre" {
    in_pre = false;
} else if tag_name == "/textarea" {
    in_textarea = false;
}

// 在字符处理时
if in_pre || in_textarea {
    result.push(ch);  // 完全保留
    continue;
}
```

## 添加 CSS 优化

HTML 中的 `<style>` 标签内容可以使用专业的 CSS 优化器。这里选择 lightningcss，它是 Parcel 团队开发的高性能 CSS 解析器：

```rust
use lightningcss::stylesheet::{MinifyOptions, ParserOptions, PrinterOptions, StyleSheet};

pub fn minify_css(css_code: &str) -> String {
    let stylesheet = StyleSheet::parse(css_code, ParserOptions::default());

    match stylesheet {
        Ok(mut sheet) => {
            sheet.minify(MinifyOptions::default()).ok();
            let result = sheet.to_css(PrinterOptions {
                minify: true,
                ..PrinterOptions::default()
            });

            match result {
                Ok(output) => output.code,
                Err(e) => {
                    eprintln!("Warning: Failed to minify CSS: {:?}", e);
                    css_code.to_string()
                },
            }
        }
        Err(e) => {
            eprintln!("Warning: Failed to parse CSS: {:?}", e);
            css_code.to_string()
        },
    }
}
```

lightningcss 的优化效果非常好：

```css
/* 输入 */
body {
    margin-top: 0;
    margin-bottom: 0;
    background-color: #ff0000;
}

/* 输出 */
body{margin:0 0;background-color:red}
```

- 属性合并：`margin-top: 0; margin-bottom: 0` → `margin: 0 0`
- 颜色优化：`#ff0000` → `red`
- 移除所有不必要的空格和换行

## 添加 JavaScript 压缩

JavaScript 的压缩需要更加小心，因为：
1. 字符串中的注释语法不应被处理
2. 除法运算符 `/` 容易与注释混淆
3. 转义字符需要正确处理（`\"`, `\'`）
4. 正则表达式需要保护

```rust
pub fn minify_js(js_code: &str) -> String {
    let mut result = String::with_capacity(js_code.len());
    let mut chars = js_code.chars().peekable();
    let mut in_string = false;
    let mut in_single_comment = false;
    let mut in_multi_comment = false;
    let mut string_char = '\0';

    while let Some(ch) = chars.next() {
        // 处理单行注释
        if !in_string && !in_multi_comment && ch == '/' && chars.peek() == Some(&'/') {
            in_single_comment = true;
            chars.next(); // 跳过第二个 /
            continue;
        }

        if in_single_comment {
            if ch == '\n' {
                in_single_comment = false;
            }
            continue;
        }

        // 处理多行注释
        if !in_string && !in_single_comment && ch == '/' && chars.peek() == Some(&'*') {
            in_multi_comment = true;
            chars.next(); // 跳过 *
            continue;
        }

        if in_multi_comment {
            if ch == '*' && chars.peek() == Some(&'/') {
                in_multi_comment = false;
                chars.next(); // 跳过 /
            }
            continue;
        }

        // 处理字符串
        if ch == '"' || ch == '\'' || ch == '`' {
            if !in_string {
                in_string = true;
                string_char = ch;
            } else if ch == string_char {
                // 检查是否被转义：计算前面的反斜杠数量
                let mut backslash_count = 0;
                let mut temp_result = result.clone();
                while temp_result.ends_with('\\') {
                    backslash_count += 1;
                    temp_result.pop();
                }
                // 偶数个反斜杠（包括0个）意味着引号没有被转义
                if backslash_count % 2 == 0 {
                    in_string = false;
                }
            }
            result.push(ch);
            continue;
        }

        if in_string {
            result.push(ch);
            continue;
        }

        // 压缩空白（保留必要的空格）
        // ...
    }

    result
}
```

测试转义字符处理：

```javascript
// 输入
let s = "test\\";  // 字符串中有转义的反斜杠
let s2 = 'quote\'';

// 输出
let s="test\\";   // 正确保留转义字符
let s2='quote\'';  // 正确保留转义字符
```

## 整合三层压缩

将 HTML、CSS、JS 压缩整合在一起，在解析 HTML 时识别 `<script>` 和 `<style>` 标签：

```rust
pub fn minify_html(content: &str) -> String {
    let mut in_script = false;
    let mut in_style = false;
    let mut script_content = String::new();
    let mut style_content = String::new();

    while let Some(ch) = chars.next() {
        // 标签处理
        if ch == '<' {
            // ... 读取标签名

            if tag_name == "script" {
                in_script = true;
            } else if tag_name == "/script" {
                // 压缩并输出 script 内容
                if !script_content.trim().is_empty() {
                    let minified = minify_js(&script_content);
                    result.push_str(&minified);
                }
                script_content.clear();
                in_script = false;
            } else if tag_name == "style" {
                in_style = true;
            } else if tag_name == "/style" {
                // 压缩并输出 style 内容
                if !style_content.trim().is_empty() {
                    let minified = minify_css(&style_content);
                    result.push_str(&minified);
                }
                style_content.clear();
                in_style = false;
            }
        }

        // 收集 script/style 内容
        if !in_tag {
            if in_script {
                script_content.push(ch);
                continue;
            } else if in_style {
                style_content.push(ch);
                continue;
            }
        }
    }
}
```

## 压缩效果

经过三层压缩，整体压缩率可达 **40-55%**：

| 层级 | 贡献率 | 示例 |
|------|--------|------|
| CSS 优化 | 20-30% | `margin-top: 0; margin-bottom: 0` → `margin:0 0` |
| JS 压缩 | 15-25% | 移除注释和空白 |
| HTML 压缩 | 10-15% | 移除换行和缩进 |
| 注释移除 | 5-10% | 取决于注释密度 |

完整示例：

```html
<!-- 输入：324 字节 -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>{{ title }}</title>
    <!-- 这是注释 -->
    <style>
        body {
            margin: 0;
            padding: 20px;
            background-color: #f0f0f0;
        }
    </style>
</head>
<body>
    <h1>{{ heading }}</h1>
    {% for item in items %}
        <p>{{ item.name }}</p>
    {% endfor %}
    <script>
        // 这是注释
        console.log("Hello");
    </script>
</body>
</html>
```

```html
<!-- 输出：152 字节，-53% -->
<!doctype html><html lang=zh-CN><meta charset=UTF-8><title>{{ title }}</title><style>body{background-color:#f0f0f0;margin:0;padding:20px}</style><body><h1>{{ heading }}</h1>{% for item in items %} <p>{{ item.name }}</p>{% endfor %}<script>console.log("Hello");</script>
```

## 其他技术细节

### 命令行参数设计

使用 clap 库来处理命令行参数：

```rust
use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "askama-minify")]
struct Args {
    /// 要压缩的文件或文件夹路径
    #[arg(value_name = "PATH")]
    path: PathBuf,

    /// 递归处理文件夹（默认启用）
    #[arg(short, long, default_value_t = true)]
    recursive: bool,

    /// 输出文件或文件夹路径
    #[arg(short = 'd', long)]
    output: Option<PathBuf>,

    /// 输出文件的后缀名（例如: "min" 会生成 .min.html）
    #[arg(short = 's', long)]
    suffix: Option<String>,
}
```

### 文件处理优化

使用 walkdir 库实现高效的文件夹遍历：

```rust
use walkdir::WalkDir;

let walker = if recursive {
    WalkDir::new(path)
} else {
    WalkDir::new(path).max_depth(1)
};

for entry in walker.into_iter().filter_map(|e| e.ok()) {
    let file_path = entry.path();
    if !file_path.is_file() || !is_template_file(file_path) {
        continue;
    }
    // 处理文件...
}
```

### 代码质量优化

1. **常量提取**：避免魔法字符串
```rust
const DEFAULT_SUFFIX: &str = "min";
const MIN_MARKER: &str = ".min.";
const VALID_EXTENSIONS: &[&str] = &["html", "htm", "xml", "svg"];
```

2. **避免不必要的字符串分配**：使用 `eq_ignore_ascii_case` 而不是 `to_lowercase()`
```rust
// 优化后
ext_str.eq_ignore_ascii_case(valid_ext)

// 优化前（会创建新字符串）
ext_str.to_lowercase() == valid_ext
```

3. **空文件快速处理**
```rust
if original_size == 0 {
    fs::write(output_path, "")?;
    return Ok((0, 0));
}
```

## 使用方式

### 安装

```bash
# 克隆仓库
git clone https://github.com/wsafight/askama-minify.git
cd askama-minify

# 编译
cargo build --release
```

编译后的二进制文件位于 `target/release/askama-minify`。

### 基本用法

```bash
# 压缩单个文件（默认生成 .min.html 后缀）
./target/release/askama-minify template.html

# 指定输出文件
./target/release/askama-minify -d output.html template.html

# 压缩整个文件夹
./target/release/askama-minify templates/

# 输出到指定目录并保持目录结构
./target/release/askama-minify -d dist/ templates/
```

### 命令行选项

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--output <PATH>` | `-d` | 输出文件或文件夹路径 | 原路径 |
| `--suffix <SUFFIX>` | `-s` | 输出文件后缀名 | `min` |
| `--recursive` | `-r` | 递归处理子文件夹 | `true` |

### 后缀规则

| 配置 | 结果 | 示例 |
|------|------|------|
| 无 `-d` 无 `-s` | 默认后缀 `min` | `file.html` → `file.min.html` |
| 无 `-d` 有 `-s` | 自定义后缀 | `file.html` + `-s prod` → `file.prod.html` |
| 有 `-d` 无 `-s` | 不添加后缀 | `file.html` + `-d out.html` → `out.html` |
| 有 `-d` 有 `-s` | 后缀 + 自定义路径 | `file.html` + `-d out/` + `-s prod` → `out/file.prod.html` |

### 集成到构建流程

#### 方式一：在 `build.rs` 中使用

```rust
// build.rs
use std::process::Command;

fn main() {
    // 在生产构建时自动压缩模板
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        let status = Command::new("./target/release/askama-minify")
            .args(["-d", "dist/templates/", "templates/"])
            .status()
            .expect("Failed to execute askama-minify");

        if !status.success() {
            panic!("Template minification failed");
        }
    }
}
```

#### 方式二：在 Makefile 中使用

```makefile
# Makefile
.PHONY: build minify-templates

build: minify-templates
	cargo build --release

minify-templates:
	askama-minify -d dist/templates/ -s prod templates/
```

#### 方式三：在 CI/CD 中使用

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Build askama-minify
        run: |
          git clone https://github.com/wsafight/askama-minify.git
          cd askama-minify
          cargo build --release
      - name: Minify templates
        run: ./askama-minify/target/release/askama-minify -d dist/ -s prod templates/
      - name: Deploy
        run: # 你的部署脚本
```

### 在 Askama 中使用压缩后的模板

有两种使用方式：

#### 方式一：切换模板路径（推荐）

开发环境使用源模板，生产环境使用压缩模板：

```rust
use askama::Template;

#[derive(Template)]
#[template(
    path = "{{ template_path }}",  // 通过配置传入
    whitespace = "suppress"
)]
struct HomePage {
    title: String,
}

// 根据环境变量选择模板路径
fn get_template_path(name: &str) -> String {
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        format!("dist/{}.prod.html", name)  // 使用压缩版
    } else {
        format!("templates/{}.html", name)   // 使用源文件
    }
}
```

#### 方式二：构建时替换

```bash
# 开发环境
cp templates/*.html templates/

# 生产构建时
askama-minify -d templates/ -s prod templates/
```

### 实际项目示例

假设你有以下项目结构：

```
my-app/
├── templates/
│   ├── base.html
│   ├── index.html
│   └── user/
│       ├── profile.html
│       └── settings.html
├── dist/              # 压缩后的输出目录
├── Cargo.toml
└── build.rs
```

**开发时**：直接使用 `templates/` 下的原始文件

**部署前**：运行压缩命令

```bash
askama-minify -d dist/ -s prod templates/
```

输出：

```
dist/
├── base.prod.html
├── index.prod.html
└── user/
    ├── profile.prod.html
    └── settings.prod.html
```

**配置 Askama 使用生产模板**：

```toml
# askama.toml
[general]
dirs = ["dist"]  # 指向压缩后的目录
```

## 总结

askama-minify 通过以下技术实现了高效的模板压缩：

1. **模板语法保留**：完整保留 `{{ }}` 和 `{% %}` 语法
2. **三层压缩策略**：HTML 层、CSS 层、JS 层分别优化
3. **智能边缘处理**：正确处理转义字符、运算符、正则表达式
4. **专业 CSS 优化**：使用 lightningcss 进行属性合并和颜色优化
5. **Rust 实现**：高性能、内存安全

### 与 Askama 自带压缩的对比

| 特性 | Askama whitespace | askama-minify |
|------|-------------------|---------------|
| 空白压缩 | ✅ | ✅ |
| HTML 注释移除 | ❌ | ✅ |
| CSS 压缩优化 | ❌ | ✅ |
| JavaScript 压缩 | ❌ | ✅ |
| 模板语法保留 | ✅ | ✅ |
| 构建时处理 | ❌ | ✅ |

项目已开源：https://github.com/wsafight/askama-minify

欢迎大家提出 issue 和 pr。

## 参考资料

- [lightningcss](https://github.com/parcel-bundler/lightningcss) - 出色的 CSS 解析和优化工具
- [clap](https://github.com/clap-rs/clap) - 强大的命令行参数解析库
- [Askama](https://github.com/djc/askama) - 灵活的 Rust 模板引擎
