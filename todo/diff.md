# 跨平台框架怎么选：新势力与主流对比

**副标题**：Lynx / KMP / Valdi / Electrobun / GPUI 与 Flutter / React Native / .NET MAUI / Qt / Electron / Tauri

**更新时间**：2026-02-01
**适读人群**：产品/技术负责人、架构师、跨端团队、想尝鲜新框架的工程师
**阅读时间**：约 25 分钟

---

## 摘要

跨平台不是"能不能跑"，而是"用哪条技术路线换哪种确定性"。

选错框架的代价是什么？一个真实案例：某团队用 Electron 做了一款笔记应用，上线后用户反馈"启动要 5 秒，内存占 500MB"。重构成本？3 个月。如果一开始就选 Tauri，这个坑本可以避免。

本文的目标很简单：**帮你在动手前想清楚**。我们会先讲清楚每个框架"是什么、擅长什么、坑在哪"，再用统一指标做横向对比，最后给出不同场景的选型建议。

---

## 读前说明

- **关于评价**：文内的性能与成本评价为"倾向性判断"，基于渲染路径和生态成熟度的经验归纳。最终结果仍取决于你的工程实现——同一个框架，不同团队做出来的性能可能差 10 倍。
- **关于命令**：入门步骤包含常见命令示例，可能随版本演进而变化，细节以官方文档为准。
- **关于立场**：本文不带货、不站队。每个框架都有它的"甜蜜点"，关键是找到匹配你场景的那个。

---

## 第一章：先搞懂底层逻辑

在看具体框架前，你需要理解一个核心问题：**UI 是怎么画到屏幕上的？**

不同的"画法"决定了框架的基因，也决定了它擅长什么、不擅长什么。

### 1.1 四种技术路线

#### 路线一：自绘渲染（Self-rendering）

**原理**：框架自己实现一套渲染引擎，拿到系统给的"画布"（Canvas/Surface），一笔一画把 UI 画出来。

**类比**：你买了一块空白画布，用自己的颜料和画笔画画。画出来的风格完全由你决定，跟画布是什么牌子的没关系。

**代表框架**：Flutter、Lynx、Qt Quick、GPUI

**优势**：
- 跨端一致性极强——因为渲染逻辑是自己写的，不依赖系统控件
- 动效表现好——可以做到 60fps 甚至 120fps 的流畅动画
- 可控性高——想改渲染管线？自己动手就行

**劣势**：
- 包体更大——要打包渲染引擎
- 与系统"格格不入"——比如 iOS 的橡皮筋效果、Android 的 Material You 动态取色，需要额外适配
- 无障碍支持需要额外工作

```
┌─────────────────────────────────────┐
│           你的应用代码               │
├─────────────────────────────────────┤
│         框架的渲染引擎               │  ← 这一层是框架自己实现的
├─────────────────────────────────────┤
│    系统图形 API (Metal/Vulkan/GL)   │
├─────────────────────────────────────┤
│              GPU                     │
└─────────────────────────────────────┘
```

#### 路线二：原生控件映射（Native Bridging）

**原理**：框架把你写的代码"翻译"成原生控件调用。你写 `<Button>`，框架帮你调用 iOS 的 `UIButton` 或 Android 的 `MaterialButton`。

**类比**：你是导演，给演员（原生控件）下指令。演员按照各自平台的"表演风格"来演，iOS 演员演得像 iOS，Android 演员演得像 Android。

**代表框架**：React Native、.NET MAUI、Valdi

**优势**：
- 原生体验——因为用的就是原生控件
- 系统功能集成方便——推送、权限、传感器等直接调用
- 无障碍支持天然继承

**劣势**：
- 跨端一致性差——同一份代码在不同平台上长得不一样
- 有"桥接"成本——JS 和原生通信需要序列化/反序列化
- 复杂动效难做——要协调多个原生控件

```
┌─────────────────────────────────────┐
│           你的应用代码               │
├─────────────────────────────────────┤
│       框架的桥接层 (Bridge)          │  ← 翻译 + 通信
├─────────────────────────────────────┤
│   原生控件 (UIKit / Android Views)  │
├─────────────────────────────────────┤
│              系统                    │
└─────────────────────────────────────┘
```

#### 路线三：WebView/Chromium 方案

**原理**：用 Web 技术栈（HTML/CSS/JS）写 UI，通过 WebView 或内嵌 Chromium 来渲染。

**类比**：在应用里开了一个"浏览器窗口"，你的 UI 实际上是一个网页。

**代表框架**：Electron、Tauri、Electrobun

**优势**：
- 前端团队无缝上手——就是写网页
- 生态巨大——npm 上百万个包随便用
- 开发效率高——热更新、DevTools 一应俱全

**劣势**：
- 资源占用——Chromium 本身就吃内存
- 启动慢——要初始化整个浏览器引擎
- "不够原生"——滚动、右键菜单等细节需要额外打磨

```
┌─────────────────────────────────────┐
│      你的 Web 应用 (HTML/CSS/JS)    │
├─────────────────────────────────────┤
│   WebView / Chromium / 系统浏览器    │
├────────────────┬────────────────────┤
│  后端进程      │   系统 API 调用    │
│  (Node/Rust)   │                    │
└────────────────┴────────────────────┘
```

**Electron vs Tauri vs Electrobun 的核心区别**：

| 维度 | Electron | Tauri | Electrobun |
|------|----------|-------|------------|
| 渲染引擎 | 内嵌 Chromium | 系统 WebView | 系统 WebView 或 CEF |
| 后端语言 | Node.js | Rust | TypeScript (Bun) |
| 包体大小 | ~150MB+ | ~3-10MB | ~10-30MB |
| 启动速度 | 慢 | 快 | 中等 |

#### 路线四：逻辑共享优先（Shared Logic First）

**原理**：只共享业务逻辑和数据层，UI 各平台自己写（或用 Compose Multiplatform 部分共享）。

**类比**：后厨（业务逻辑）是统一的，但前台装修（UI）各店不同。

**代表框架**：Kotlin Multiplatform (KMP)

**优势**：
- 原生体验最佳——UI 就是原生写的
- 渐进式迁移——可以一点点把逻辑抽到共享层
- 风险可控——UI 出问题不影响共享逻辑

**劣势**：
- UI 要写多份（除非用 Compose Multiplatform）
- 团队需要掌握多平台 UI 开发
- 共享层的边界需要仔细设计

```
┌──────────────────────────────────────────────────┐
│                  共享层 (Kotlin)                  │
│         网络、数据库、业务逻辑、状态管理           │
├─────────────────┬────────────────┬───────────────┤
│   Android UI    │    iOS UI      │   Desktop UI  │
│   (Compose)     │   (SwiftUI)    │  (Compose)    │
└─────────────────┴────────────────┴───────────────┘
```

### 1.2 一张图看懂路线选择

```
                        你的核心诉求是什么？
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
       跨端一致性          原生体验           开发效率
       视觉完全统一        系统深度集成        快速上线
            │                 │                 │
            ▼                 ▼                 ▼
       自绘渲染           原生映射          WebView 方案
    Flutter/Lynx/Qt    RN/.NET MAUI/KMP   Electron/Tauri
```

---

## 第二章：11 个框架逐一拆解

下面我们按"成熟度从高到低"的顺序介绍每个框架。

### 2.1 Flutter（Google，2018 稳定版）

**一句话定位**：自绘渲染的"全能选手"，跨端一致性最强的主流方案。

**技术栈**：
- 语言：Dart（Google 自研，语法类似 Java/JS 混合体）
- 渲染：Skia 引擎 → 正在迁移到 Impeller（iOS 已默认启用）
- 架构：Widget 树 + 声明式 UI

**适合场景**：
- 品牌型应用，强调视觉一致性（如 Google Pay、阿里闲鱼）
- 重动效、重交互的应用（如游戏化电商、社交）
- 需要同时覆盖移动 + Web + 桌面

**不太适合**：
- 需要深度系统集成的工具类应用（如文件管理器）
- 团队对 Dart 抵触强烈
- 包体大小极度敏感（Flutter 最小包体约 4-5MB）

**真实案例**：
- Google Pay：全球支付应用，Flutter 重写后开发效率提升 70%
- 闲鱼：阿里的二手交易平台，首页用 Flutter 实现
- BMW：车载信息娱乐系统 

**代码示例**（感受一下 Dart 风格）：

```dart
// 一个简单的计数器页面
class CounterPage extends StatefulWidget {
  @override
  _CounterPageState createState() => _CounterPageState();
}

class _CounterPageState extends State<CounterPage> {
  int _count = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('计数器')),
      body: Center(
        child: Text('点击了 $_count 次', style: TextStyle(fontSize: 24)),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => setState(() => _count++),
        child: Icon(Icons.add),
      ),
    );
  }
}
```

**入门步骤**：
1. 安装 Flutter SDK：https://docs.flutter.dev/get-started/install
2. 配置平台工具链（Android Studio + SDK；macOS 需 Xcode）
3. 运行环境检查：`flutter doctor`
4. 创建项目：`flutter create my_app`
5. 运行：`cd my_app && flutter run`

**常见坑**：
- **热重载失效**：有时需要热重启（Shift+R）或完全重启
- **包体优化**：使用 `--split-debug-info` 和 `--obfuscate` 可减小约 30%
- **iOS 审核**：确保 `Info.plist` 里的权限说明清晰

---

### 2.2 React Native（Meta，2015）

**一句话定位**：用 React 写原生应用，前端团队的"舒适区扩展"。

**技术栈**：
- 语言：JavaScript/TypeScript + React
- 渲染：映射到原生控件
- 架构：新架构（Fabric + TurboModules）正在推进

**适合场景**：
- 团队是 React 技术栈，想复用前端能力
- 需要原生体验，但开发效率也很重要
- 应用以内容展示为主（如新闻、电商列表页）

**不太适合**：
- 复杂动效（如游戏、3D 展示）
- 需要跨端 UI 完全一致
- 对启动速度要求极高（RN 的 JS 引擎初始化需要时间）

**真实案例**：
- Facebook/Instagram：部分页面使用 RN
- Shopify：商家管理应用
- Discord：移动端部分功能

**代码示例**：

```tsx
// React Native 的代码对 React 开发者很熟悉
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>点击了 {count} 次</Text>
      <TouchableOpacity style={styles.button} onPress={() => setCount(c => c + 1)}>
        <Text style={styles.buttonText}>+1</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 24, marginBottom: 20 },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8 },
  buttonText: { color: 'white', fontSize: 18 },
});
```

**入门步骤**：
1. 安装 Node.js（推荐 18+）
2. 选择初始化方式：
   - 快速上手：`npx create-expo-app my-app`（Expo 托管方案）
   - 完全控制：`npx react-native init MyApp`（裸 RN）
3. 配置原生工具链（Android Studio + Xcode）
4. 运行：`npx expo start` 或 `npx react-native run-ios`

**常见坑**：
- **桥接性能**：大量数据传递时考虑用新架构的 JSI
- **第三方库兼容性**：检查是否支持新架构
- **启动时间**：用 Hermes 引擎替代 JSC 可提升 30-50%

---

### 2.3 Electron（GitHub/OpenJS Foundation，2013）

**一句话定位**：Web 技术栈做桌面应用的"事实标准"，简单粗暴但有效。

**技术栈**：
- 前端：HTML/CSS/JS（任意前端框架）
- 后端：Node.js（完整的 Node API）
- 渲染：Chromium

**适合场景**：
- 快速把 Web 应用搬到桌面
- 团队只有前端能力
- 对包体大小和内存占用不敏感

**不太适合**：
- 资源敏感型应用（如系统工具）
- 需要极致启动速度
- 用户设备配置较低

**真实案例**：
- VS Code：微软的代码编辑器（证明 Electron 可以做出高性能应用）
- Slack：团队协作工具
- Discord：桌面端
- Figma：桌面端

**资源占用参考**：
- 空项目包体：~150MB（压缩后）
- 空项目内存：~80-150MB
- VS Code 内存：~300-800MB（取决于打开的文件和扩展）

**入门步骤**：
1. 初始化项目：`npm init -y`
2. 安装 Electron：`npm install -D electron`
3. 创建 `main.js`：

```javascript
const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadFile('index.html');
});
```

4. 添加启动脚本到 `package.json`：`"start": "electron ."`
5. 运行：`npm start`

**性能优化技巧**：
- 使用 `BrowserWindow` 的 `show: false` + `ready-to-show` 事件避免白屏
- 延迟加载非必要模块
- 考虑使用 `contextIsolation` 提升安全性

---

### 2.4 Qt / Qt Quick（The Qt Company，1995/2010）

**一句话定位**：工业级跨平台方案，嵌入式和桌面的"老大哥"。

**技术栈**：
- 语言：C++（核心）+ QML（声明式 UI）
- 渲染：RHI（Rendering Hardware Interface），支持 Vulkan/Metal/D3D/OpenGL
- 架构：信号槽机制 + 属性绑定

**适合场景**：
- 工业软件、医疗设备、汽车 HMI
- 嵌入式系统（Linux 嵌入式、MCU）
- 对性能和稳定性要求极高

**不太适合**：
- 快速原型验证（学习曲线陡）
- 小团队短周期项目
- 纯移动端应用（移动端生态弱于 Flutter/RN）

**真实案例**：
- 特斯拉 Model S/X：早期车载系统
- 达芬奇手术机器人：控制界面
- Autodesk Maya：部分 UI
- VirtualBox：虚拟机管理界面

**代码示例**（QML）：

```qml
// QML 声明式 UI，类似 JSON 但带逻辑
import QtQuick 2.15
import QtQuick.Controls 2.15

ApplicationWindow {
    width: 400
    height: 300
    visible: true
    title: "计数器"

    Column {
        anchors.centerIn: parent
        spacing: 20

        Text {
            text: "点击了 " + counter + " 次"
            font.pixelSize: 24
        }

        Button {
            text: "+1"
            onClicked: counter++
        }
    }

    property int counter: 0
}
```

**许可证说明**：
- **开源版（LGPL/GPL）**：可免费商用，但有一些限制（如动态链接、开源要求）
- **商业版**：按开发者人数收费，约 $300-500/月/人

**入门步骤**：
1. 下载 Qt Online Installer：https://www.qt.io/download
2. 安装 Qt 6.x + Qt Creator
3. 创建新项目 → Qt Quick Application
4. 选择目标 Kit（Desktop/Android/iOS）
5. 运行（Qt Creator 一键构建）

---

### 2.5 .NET MAUI（Microsoft，2022）

**一句话定位**：C# 团队的跨平台方案，微软生态的"官方答案"。

**技术栈**：
- 语言：C#
- UI：XAML 或 C# Markup
- 渲染：原生控件映射（类似 RN）

**适合场景**：
- 企业内部应用（与 Azure、Office 365 集成好）
- 已有 C#/.NET 技术栈的团队
- Windows 优先，兼顾其他平台

**不太适合**：
- 需要极致跨端一致性
- 非 .NET 团队（学习成本高）
- iOS/Android 优先的消费级应用

**代码示例**：

```csharp
// .NET MAUI 的 XAML + C# 模式
// MainPage.xaml
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui">
    <VerticalStackLayout Spacing="20" VerticalOptions="Center">
        <Label x:Name="CounterLabel" Text="点击了 0 次" FontSize="24" HorizontalOptions="Center"/>
        <Button Text="+1" Clicked="OnCounterClicked" HorizontalOptions="Center"/>
    </VerticalStackLayout>
</ContentPage>

// MainPage.xaml.cs
public partial class MainPage : ContentPage
{
    int count = 0;

    public MainPage() => InitializeComponent();

    void OnCounterClicked(object sender, EventArgs e)
    {
        count++;
        CounterLabel.Text = $"点击了 {count} 次";
    }
}
```

**入门步骤**：
1. 安装 .NET 8 SDK：https://dotnet.microsoft.com/download
2. 安装 MAUI 工作负载：`dotnet workload install maui`
3. 创建项目：`dotnet new maui -n MyApp`
4. 用 Visual Studio 或 VS Code 打开
5. 选择目标平台运行

---

### 2.6 Tauri（Tauri Programme，2022 v1.0）

**一句话定位**：Electron 的"轻量替代品"，用系统 WebView + Rust 后端。

**技术栈**：
- 前端：任意 Web 框架（React/Vue/Svelte/原生）
- 后端：Rust
- 渲染：系统 WebView（macOS: WKWebView, Windows: WebView2, Linux: WebKitGTK）

**与 Electron 的关键区别**：

| 维度 | Electron | Tauri |
|------|----------|-------|
| 包体（空项目） | ~150MB | ~3MB |
| 内存（空项目） | ~100MB | ~30MB |
| 后端语言 | Node.js | Rust |
| WebView | 内嵌 Chromium | 系统自带 |
| 跨端一致性 | 高（同一个 Chromium） | 中（系统 WebView 版本不同） |

**适合场景**：
- 在意包体大小和资源占用
- 团队愿意学 Rust（或只做简单后端逻辑）
- 不需要复杂的 Node.js 生态

**不太适合**：
- 需要保证不同系统上渲染完全一致
- 后端逻辑复杂且团队不熟悉 Rust
- 需要使用大量 Node.js 包

**入门步骤**：
1. 安装 Rust：https://rustup.rs/
2. 安装系统依赖（Linux 需要 WebKitGTK）
3. 创建项目：`npm create tauri-app@latest`
4. 选择前端模板（React/Vue/Svelte/Vanilla）
5. 开发：`npm run tauri dev`
6. 构建：`npm run tauri build`

**Rust 后端示例**：

```rust
// src-tauri/src/main.rs
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```javascript
// 前端调用
import { invoke } from '@tauri-apps/api/tauri';
const greeting = await invoke('greet', { name: 'World' });
```

---

### 2.7 Kotlin Multiplatform / KMP（JetBrains，2023 稳定版）

**一句话定位**：Android 团队扩展 iOS 的"最小阻力路径"，逻辑共享优先。

**技术栈**：
- 语言：Kotlin
- 共享层：`commonMain`（纯 Kotlin，编译到各平台）
- UI 方案：
  - 原生 UI：Android 用 Jetpack Compose，iOS 用 SwiftUI
  - 共享 UI：Compose Multiplatform（跨平台 Compose）

**核心概念**：

```
┌────────────────────────────────────────────────┐
│                  commonMain                     │
│   expect fun getPlatformName(): String          │  ← 声明接口
├──────────────────────┬─────────────────────────┤
│      androidMain     │        iosMain          │
│   actual fun get..() │    actual fun get..()   │  ← 各平台实现
│   = "Android"        │    = "iOS"              │
└──────────────────────┴─────────────────────────┘
```

**适合场景**：
- 已有 Android 应用，想扩展到 iOS
- 想保持各平台的原生体验
- 团队熟悉 Kotlin

**不太适合**：
- 想一套代码搞定所有 UI
- 团队对 Kotlin 不熟悉
- iOS 是主要平台（用 SwiftUI 原生可能更顺）

**代码示例**：

```kotlin
// commonMain - 共享的网络请求逻辑
class UserRepository(private val api: UserApi) {
    suspend fun getUser(id: String): User {
        return api.fetchUser(id)
    }
}

// 在 Android 和 iOS 中都可以直接使用
val repo = UserRepository(api)
val user = repo.getUser("123")
```

**入门步骤**：
1. 安装 Android Studio + Kotlin Multiplatform Mobile 插件
2. 创建 KMP 项目（选择模板）
3. 在 `shared/src/commonMain` 中编写共享逻辑
4. Android 端：直接依赖 `shared` 模块
5. iOS 端：通过 CocoaPods 或 Swift Package Manager 集成

---

### 2.8 Lynx（ByteDance，2024 开源）

**一句话定位**：字节跳动的跨端方案，用 Web 语法写原生渲染的 UI。

**技术栈**：
- 语言：JavaScript/TypeScript
- UI 语法：类 React/CSS（支持 Flexbox）
- 渲染：自研原生渲染引擎（非 WebView）

**核心特点**：
- **双线程架构**：UI 线程和 JS 线程分离，避免 JS 阻塞渲染
- **CSS 子集**：支持 Flexbox、常用属性，但不是完整 CSS
- **PlatformView**：可嵌入原生控件（如地图、视频播放器）

**适合场景**：
- 前端团队想做高性能移动应用
- 需要比 RN 更好的动效性能
- 字节系应用的技术选型

**不太适合**：
- 追求稳定、成熟的生态
- 需要社区大量第三方库支持
- 桌面端需求（目前主要支持移动端 + Web）

**代码示例**：

```tsx
// Lynx 的语法对 React 开发者很熟悉
import { Component, View, Text, Image } from '@anthropic/lynx';

export default class App extends Component {
  state = { count: 0 };

  render() {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 24 }}>点击了 {this.state.count} 次</Text>
        <View
          style={{ padding: 15, backgroundColor: '#007AFF', borderRadius: 8 }}
          onClick={() => this.setState({ count: this.state.count + 1 })}
        >
          <Text style={{ color: 'white' }}>+1</Text>
        </View>
      </View>
    );
  }
}
```

**入门步骤**：
1. 参考官方文档：https://lynxjs.org/
2. 安装 Lynx CLI
3. 创建项目并配置模拟器环境
4. 运行调试

---

### 2.9 Valdi（Snapchat，2024 Beta）

**一句话定位**：TypeScript 编译成原生视图，追求 TS 开发体验 + 原生性能。

**技术栈**：
- 语言：TypeScript
- 编译：TS → 原生视图代码（不是解释执行）
- 渲染：原生控件

**核心理念**：
- 不走 WebView，也不走 JS 运行时
- 把 TS 代码编译成原生代码
- 类型安全 + 原生性能

**适合场景**：
- 喜欢 TypeScript 但不想用 WebView
- 追求原生性能
- 愿意尝试新技术

**不太适合**：
- 需要稳定、成熟的生态
- 大型团队生产环境使用（目前是 Beta）

**入门步骤**：
1. 访问：https://github.com/Snapchat/Valdi
2. 按 README 安装工具链
3. 创建项目并配置目标平台
4. 开发调试

---

### 2.10 Electrobun（2024 早期）

**一句话定位**：比 Electron 更轻量的桌面方案，用 Bun + 系统 WebView/CEF。

**技术栈**：
- 语言：TypeScript
- 运行时：Bun（替代 Node.js）
- 渲染：系统 WebView 或 CEF（可选）
- 底层：Zig

**与 Electron/Tauri 对比**：

| 维度 | Electron | Tauri | Electrobun |
|------|----------|-------|------------|
| 后端 | Node.js | Rust | Bun (TS) |
| 学习成本 | 低 | 中（要学 Rust） | 低 |
| 包体 | 大 | 小 | 中 |
| 成熟度 | 高 | 中 | 早期 |

**适合场景**：
- 想要比 Electron 轻量，但不想学 Rust
- 喜欢 Bun 的开发体验
- 愿意接受早期阶段的风险

**入门步骤**：
1. 安装 Bun：https://bun.sh/
2. 访问：https://electrobun.dev/
3. 按文档初始化项目
4. 开发调试

---

### 2.11 GPUI（Zed Industries，2024）

**一句话定位**：Zed 编辑器的 UI 框架，Rust 生态的高性能 GUI 方案。

**技术栈**：
- 语言：Rust
- 渲染：GPU 加速，自绘渲染
- 架构：ECS（Entity-Component-System）风格

**核心特点**：
- 性能极致——为 Zed 编辑器设计，追求每一帧的流畅
- Rust 原生——类型安全，内存安全
- 现代 API——异步优先，响应式

**适合场景**：
- Rust 团队做桌面应用
- 对性能有极致追求
- 愿意投入时间学习

**不太适合**：
- 不熟悉 Rust 的团队
- 需要快速出成果
- 需要成熟的组件库

**代码示例**：

```rust
// GPUI 的 Rust 风格 UI
use gpui::*;

struct Counter {
    count: i32,
}

impl Render for Counter {
    fn render(&mut self, cx: &mut ViewContext<Self>) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .items_center()
            .child(format!("Count: {}", self.count))
            .child(
                button("Increment")
                    .on_click(cx.listener(|this, _, _| this.count += 1))
            )
    }
}
```

**入门步骤**：
1. 安装 Rust：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. 创建项目：`cargo new my_app`
3. 添加 GPUI 依赖
4. 编写 UI 代码
5. 运行：`cargo run`

---

## 第三章：横向对比

### 3.1 核心信息对照表

| 框架 | 渲染方式 | 语言 | 平台覆盖 | 生态成熟度 | 一句话定位 |
|------|----------|------|----------|------------|------------|
| Flutter | 自绘 | Dart | 移动+桌面+Web | ⭐⭐⭐⭐⭐ | 全能选手，跨端一致性最强 |
| React Native | 原生映射 | JS/TS | 移动为主 | ⭐⭐⭐⭐⭐ | 前端团队的原生应用方案 |
| .NET MAUI | 原生映射 | C# | 全平台 | ⭐⭐⭐⭐ | C# 团队的官方方案 |
| Qt Quick | 自绘 | C++/QML | 全平台+嵌入式 | ⭐⭐⭐⭐⭐ | 工业级、嵌入式首选 |
| Electron | WebView | JS/TS | 桌面 | ⭐⭐⭐⭐⭐ | Web 做桌面的事实标准 |
| Tauri | 系统WebView+Rust | Rust+Web | 桌面+移动 | ⭐⭐⭐⭐ | 轻量级 Electron 替代 |
| Lynx | 自绘 | JS/TS | 移动+Web | ⭐⭐⭐ | 高性能+Web语法 |
| KMP | 原生/Compose | Kotlin | 移动+桌面 | ⭐⭐⭐⭐ | Android 团队扩 iOS |
| Valdi | 编译到原生 | TypeScript | 移动 | ⭐⭐ | TS 编译到原生 |
| Electrobun | 系统WebView/CEF | TypeScript | 桌面 | ⭐⭐ | 轻量桌面方案 |
| GPUI | 自绘 | Rust | 桌面 | ⭐⭐ | Rust 高性能 GUI |

### 3.2 指标矩阵

> 说明：以下评价基于渲染原理和生态现状的一般判断，实际表现取决于具体实现。

| 框架 | 包体/启动 | 性能上限 | 原生一致性 | 跨端一致性 | 开发效率 | 风险 |
|------|-----------|----------|------------|------------|----------|------|
| Flutter | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 低 |
| React Native | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 低 |
| .NET MAUI | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | 低 |
| Qt Quick | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 低 |
| Electron | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 低 |
| Tauri | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 中 |
| Lynx | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 中高 |
| KMP | 可变 | 可变 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | 低中 |
| Valdi | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | 高 |
| Electrobun | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 高 |
| GPUI | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | 高 |

**指标说明**：
- **包体/启动**：越多星表示包体越小、启动越快
- **性能上限**：复杂动效、大数据量场景的表现潜力
- **原生一致性**：与系统控件的融合程度
- **跨端一致性**：不同平台上 UI 的统一程度
- **开发效率**：上手速度、调试体验、工具链成熟度
- **风险**：生态稳定性、长期维护的不确定性

---

## 第四章：场景化选型指南

### 场景 A：移动端为主，重动效、品牌视觉统一

> 典型产品：电商首页、社交 feed、游戏化应用

**推荐**：Flutter / Lynx

**理由**：
- 自绘渲染保证跨端一致性
- 动效性能有保障
- Flutter 生态成熟，Lynx 性能更极致（但风险更高）

**备选**：Qt Quick（如果团队熟悉 C++）

---

### 场景 B：桌面效率工具，团队是前端

> 典型产品：笔记应用、开发工具、内部管理系统

**推荐**：Tauri（首选）/ Electron（求稳）

**理由**：
- 前端技术栈直接复用
- Tauri 包体小、启动快，适合工具类应用
- Electron 生态最成熟，VS Code 证明了可以做好

**选择建议**：
- 在意包体 → Tauri
- 求稳、需要大量 npm 包 → Electron
- 想尝新、不想学 Rust → Electrobun

---

### 场景 C：企业内部应用，C# 团队，长期维护

> 典型产品：ERP、CRM、内部审批系统

**推荐**：.NET MAUI

**理由**：
- 与微软生态（Azure、Office 365）集成好
- C# 企业级开发经验可复用
- 长期维护有保障（微软背书）

**备选**：Qt（如果需要嵌入式支持）/ Electron（如果有 Web 版需求）

---

### 场景 D：Android 团队扩展 iOS

> 典型产品：已有 Android 应用，想扩展到 iOS

**推荐**：KMP（逻辑共享 + 原生 UI）

**理由**：
- Kotlin 语言统一，学习成本低
- 可以渐进式迁移，风险可控
- 各平台 UI 保持原生体验

**进阶**：如果想共享部分 UI → KMP + Compose Multiplatform

---

### 场景 E：需要深度系统集成

> 典型产品：文件管理器、系统工具、相机应用

**推荐**：React Native / KMP（原生 UI）

**理由**：
- 原生控件映射，系统 API 调用方便
- 无障碍支持天然继承
- 可以针对各平台做深度优化

**备选**：.NET MAUI、纯原生

---

### 场景 F：极度关注包体大小

> 典型产品：Lite 版应用、下沉市场、低端设备

**推荐**：Tauri（桌面）/ Valdi（移动）

**理由**：
- Tauri 空项目约 3MB
- Valdi 编译到原生，无运行时开销

**备选**：KMP + 原生 UI

---

### 场景 G：全平台覆盖（移动 + 桌面 + Web）

> 典型产品：跨平台协作工具、内容消费应用

**推荐**：Flutter

**理由**：
- 唯一真正"一套代码，全平台运行"的成熟方案
- 移动、桌面、Web 体验一致

**备选**：Qt（工业场景）、各平台分别开发

---

### 场景 H：Rust 技术栈做桌面应用

> 典型产品：开发工具、性能敏感型应用

**推荐**：Tauri（需要 Web 前端）/ GPUI（纯 Rust）

**理由**：
- Tauri：Rust 后端 + Web 前端，平衡开发效率
- GPUI：纯 Rust，性能极致但学习曲线陡

---

## 第五章：选型方法论

### 5.1 三步选型法

```
Step 1: 确定渲染路线
    │
    ├── 需要跨端视觉完全一致 → 自绘渲染（Flutter/Lynx/Qt）
    ├── 需要原生体验优先 → 原生映射（RN/MAUI/KMP）
    └── 需要快速上线、前端技术栈 → WebView（Electron/Tauri）

Step 2: 确定平台覆盖
    │
    ├── 移动端为主 → Flutter/RN/Lynx/KMP
    ├── 桌面端为主 → Electron/Tauri/Qt/GPUI
    └── 全平台 → Flutter/Qt

Step 3: 匹配团队技能
    │
    ├── Dart → Flutter
    ├── JS/TS + React → React Native / Lynx
    ├── JS/TS + 任意框架 → Electron / Tauri
    ├── C# → .NET MAUI
    ├── C++ → Qt
    ├── Kotlin → KMP
    └── Rust → Tauri / GPUI
```

### 5.2 决策检查清单

在最终决定前，问自己这些问题：

- [ ] 团队对目标语言的熟悉程度如何？
- [ ] 是否有时间预算来学习新技术？
- [ ] 对包体大小和启动速度的要求有多高？
- [ ] 是否需要与系统功能深度集成？
- [ ] 是否需要跨端 UI 完全一致？
- [ ] 项目周期是多长？是否允许使用新兴框架？
- [ ] 团队规模如何？是否需要大量第三方库支持？
- [ ] 未来是否需要扩展到更多平台？

---

## 第六章：趋势观察

### 6.1 当前格局

- **成熟稳定层**：Flutter、React Native、Electron、Qt——适合生产环境，生态完善
- **快速上升层**：Tauri、KMP——已有成功案例，值得认真考虑
- **新锐探索层**：Lynx、Valdi、Electrobun、GPUI——有潜力，但需承担早期风险

### 6.2 趋势预判

1. **自绘渲染持续演进**
   - Flutter 的 Impeller 引擎带来更好的 iOS 性能
   - 更多框架会走自绘路线

2. **Rust 生态崛起**
   - Tauri 证明了 Rust 在跨平台领域的价值
   - 更多 Rust GUI 框架会出现

3. **WebView 方案分化**
   - Electron 继续统治"不在乎资源占用"的场景
   - Tauri/Electrobun 抢占"轻量级"市场

4. **逻辑共享成为共识**
   - 即使 UI 不共享，业务逻辑共享也成为趋势
   - KMP 模式会被更多框架借鉴

---

## 总结

选框架不是选"最好的"，而是选"最适合的"。

**如果你只记住一件事**，那就是：

> 先想清楚你的核心诉求是什么——跨端一致性、原生体验、还是开发效率？然后在对应的技术路线里，选一个匹配团队技能的框架。

祝选型顺利！

---

## 参考资源

### 官方文档
- [Flutter](https://docs.flutter.dev/) | [支持的平台](https://docs.flutter.dev/reference/supported-platforms)
- [React Native](https://reactnative.dev/) | [新架构](https://reactnative.dev/docs/the-new-architecture/landing-page)
- [.NET MAUI](https://dotnet.microsoft.com/apps/maui)
- [Qt](https://doc.qt.io/) | [支持的平台](https://doc.qt.io/qt-6/supported-platforms.html)
- [Electron](https://www.electronjs.org/)
- [Tauri](https://tauri.app/) | [WebView 版本](https://v2.tauri.app/reference/webview-versions/)
- [Lynx](https://lynxjs.org/)
- [Kotlin Multiplatform](https://kotlinlang.org/docs/multiplatform.html)
- [Valdi](https://github.com/Snapchat/Valdi)
- [Electrobun](https://electrobun.dev/)
- [GPUI](https://www.gpui.rs/)

### 延伸阅读
- [Flutter vs React Native 2025 深度对比](https://docs.flutter.dev/resources/faq#how-does-flutter-compare-to-react-native)
- [Tauri vs Electron：该选哪个？](https://tauri.app/v1/guides/getting-started/prerequisites/)
- [KMP 生产实践：Netflix 案例](https://netflixtechblog.com/netflix-android-and-ios-studio-apps-kotlin-multiplatform-d6d4d8d25d23)
