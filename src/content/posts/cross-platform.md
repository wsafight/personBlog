---
title: 跨平台框架怎么选：16 个框架全景对比（2026 版）
published: 2026-02-02
description: 深度对比 16 个跨平台框架，从主流的 Flutter/React Native/Electron 到新兴的 Wails（Go）/Dioxus（Rust）/Slint（嵌入式），覆盖移动端、桌面端、嵌入式全场景。重点分析技术路线、适用场景、生产风险，帮你做出正确的技术选型。
tags: [跨平台开发, Flutter, React Native, Electron, Tauri, Wails, Dioxus, Go, Rust, 技术选型, 架构设计]
category: 架构设计
draft: false
---

> 跨平台不是"能不能跑"，而是"用哪条技术路线换哪种确定性"。

**选错框架的代价**：某团队用 Electron 做笔记应用，上线后用户反馈"启动 5 秒，内存 500MB"。重构用了 3 个月。如果一开始选 Tauri 或 Wails，这个坑完全可以避免。

**本文目标**：帮你在动手前想清楚。

**覆盖范围**：16 个框架，4 大技术路线
- **主流稳定**：Flutter、React Native、Electron、Qt（生产环境）
- **新兴可靠**：Wails（Go）、Dioxus（Rust）、Tauri（已值得试水）
- **垂直场景**：Slint（嵌入式）、Uno（C# WASM）、NativeScript（Vue/Angular）
- **探索阶段**：Lynx、Valdi、Electrobun、GPUI

**阅读建议**：
- 想快速决策？→ 直接看"快速决策表"
- 想深度了解？→ 按章节完整阅读
- 想对比细节？→ 查看"指标矩阵"

---

## 第一章：先搞懂底层逻辑

在看具体框架前，你需要理解一个核心问题：**UI 是怎么画到屏幕上的？**

不同的"画法"决定了框架的基因，也决定了它擅长什么、不擅长什么。

### 1.1 四种技术路线

#### 路线一：自绘渲染（Self-rendering）

**原理**：框架自己实现一套渲染引擎，拿到系统给的"画布"（Canvas/Surface），一笔一画把 UI 画出来。

**类比**：你买了一块空白画布，用自己的颜料和画笔画画。画出来的风格完全由你决定，跟画布是什么牌子的没关系。

**代表框架**：Flutter、Qt Quick、GPUI、Dioxus（Blitz 模式）、Slint

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

**代表框架**：React Native、.NET MAUI、Uno Platform、NativeScript、Lynx、Valdi

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

**代表框架**：Electron、Tauri、Wails、Electrobun

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

**Electron vs Tauri vs Electrobun 核心对比**：

| 维度 | Electron | Tauri | Electrobun |
|------|----------|-------|------------|
| 渲染引擎 | 内嵌 Chromium | 系统 WebView | 系统 WebView/CEF |
| 后端语言 | Node.js | Rust | Bun (TypeScript) |
| 包体大小 | 150MB+ | 3-10MB | 10-30MB |
| 启动速度 | 慢（初始化大） | 快 | 中等 |
| 适合团队 | 前端团队 | 愿意学 Rust | 前端团队 |

#### 路线四：逻辑共享优先（Shared Logic First）

**原理**：只共享业务逻辑和数据层，UI 各平台自己写（或用 Compose Multiplatform 共享 UI，使用 Skia 自绘）。

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
    Flutter/           RN/MAUI/Uno/      Electron/Tauri/
    Slint/Qt/GPUI      NativeScript/KMP/Lynx  Wails/Dioxus*

    * Dioxus: 桌面默认 WebView，可选 Blitz 自绘（实验性）
```

**技术栈快速匹配**：

```
你的团队主要用什么语言？
│
├─ JavaScript/TypeScript
│  ├─ React → React Native / Lynx
│  ├─ Vue/Angular → NativeScript
│  └─ 任意框架 → Electron / Tauri / Wails / Electrobun
│
├─ Dart → Flutter
│
├─ C# → .NET MAUI / Uno Platform（需要 WASM）
│
├─ C++ → Qt / Slint（嵌入式）
│
├─ Go → Wails（桌面）
│
├─ Kotlin → KMP
│
└─ Rust
   ├─ Web 前端 → Tauri
   ├─ 全栈（含 UI）→ Dioxus
   ├─ 嵌入式 → Slint
   └─ 极致性能 → GPUI
```

---

## 第二章：16 个框架逐一拆解

下面我们按"成熟度从高到低"的顺序介绍每个框架。为了便于理解，我们将框架按技术路线分组呈现。

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

### 2.3 NativeScript（Progress Software，2014）

**一句话定位**：用 Vue/Angular/Vanilla JS 写原生应用，填补非 React 前端技术栈的空白。

**技术栈**：
- 语言：JavaScript/TypeScript + Vue/Angular/Vanilla JS
- 渲染：映射到原生控件（与 RN 类似）
- 架构：直接访问原生 API（无桥接层）

**适合场景**：
- Vue 或 Angular 技术栈的团队
- 需要直接访问原生 API
- 想要原生体验的移动应用

**不太适合**：
- React 技术栈（直接用 React Native）
- 需要复杂动效
- 桌面端需求（主要支持移动端）

**真实案例**：
- SAP：企业应用
- Strudel：音乐流媒体应用

**代码示例**（Vue 风格）：

```vue
<template>
  <Page>
    <ActionBar title="计数器"/>
    <StackLayout class="p-20">
      <Label :text="`点击了 ${count} 次`" class="text-center text-2xl mb-4"/>
      <Button text="+1" @tap="count++" class="btn btn-primary"/>
    </StackLayout>
  </Page>
</template>

<script>
export default {
  data() {
    return {
      count: 0
    }
  }
}
</script>
```

**入门步骤**：
1. 安装 Node.js 和 NativeScript CLI：`npm install -g @nativescript/cli`
2. 创建项目：`ns create my-app --vue` 或 `--angular`
3. 配置原生工具链（Android Studio + Xcode）
4. 运行：`ns run ios` 或 `ns run android`

**与 React Native 的对比**：

| 维度 | React Native | NativeScript |
|------|--------------|--------------|
| 框架支持 | React | Vue/Angular/Vanilla |
| 原生访问 | 通过桥接 | 直接访问 |
| 性能 | 有桥接开销 | 理论上更快 |
| 生态 | 更大 | 较小 |

---

### 2.4 Electron（GitHub/OpenJS Foundation，2013）

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

### 2.5 Qt / Qt Quick（The Qt Company，1995/2010）

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

### 2.6 .NET MAUI（Microsoft，2022）

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

### 2.7 Uno Platform（Uno Platform，2018）

**一句话定位**：C# 生态的"全平台方案"，比 .NET MAUI 更早、支持 WebAssembly。

**技术栈**：
- 语言：C#
- UI：XAML（与 UWP/WinUI 兼容）
- 渲染：三种模式可选
  - **Skia 渲染**（默认）：自绘渲染，跨端一致
  - **Native 渲染**：映射到原生控件
  - **WebAssembly**：渲染到 HTML/Canvas
- 架构：基于 WinUI API surface

**与 .NET MAUI 的关键区别**：

| 维度 | .NET MAUI | Uno Platform |
|------|-----------|--------------|
| 发布时间 | 2022 | 2018 |
| WebAssembly | 不支持 | **支持（核心优势）** |
| API 来源 | Xamarin.Forms 演进 | WinUI/UWP |
| Windows 优先度 | 中等 | 高（WinUI 语法） |
| Linux 支持 | 有限 | 通过 Skia 支持 |

**适合场景**：
- 需要 WebAssembly 支持（在浏览器中运行）
- 熟悉 WinUI/UWP 的团队
- 需要更广泛的平台支持（包括 Linux、Tizen）
- Windows 应用需要迁移到其他平台

**不太适合**：
- 新项目且对 WebAssembly 无需求（考虑 MAUI）
- 不熟悉 XAML 的团队
- 需要最轻量级的移动应用

**真实案例**：
- HSBC：银行应用的部分功能
- Bluebeam：建筑协作软件

**代码示例**：

```xml
<!-- MainPage.xaml - 与 WinUI 语法兼容 -->
<Page x:Class="MyApp.MainPage"
      xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation">
    <StackPanel Spacing="20" HorizontalAlignment="Center" VerticalAlignment="Center">
        <TextBlock x:Name="CounterText" Text="点击了 0 次" FontSize="24"/>
        <Button Content="+1" Click="OnCounterClicked"/>
    </StackPanel>
</Page>
```

```csharp
// MainPage.xaml.cs
public sealed partial class MainPage : Page
{
    private int _count = 0;

    public MainPage()
    {
        this.InitializeComponent();
    }

    private void OnCounterClicked(object sender, RoutedEventArgs e)
    {
        _count++;
        CounterText.Text = $"点击了 {_count} 次";
    }
}
```

**入门步骤**：
1. 安装 .NET SDK 和 Uno Platform 模板：
   ```bash
   dotnet new install Uno.Templates
   ```
2. 创建项目：
   ```bash
   dotnet new unoapp -o MyApp
   ```
3. 选择目标平台（iOS/Android/WebAssembly/Windows/macOS/Linux）
4. 运行：
   - WebAssembly: `dotnet run --project MyApp.Wasm`
   - 移动端：用 Visual Studio 或 Rider

**WebAssembly 优势示例**：
```bash
# 构建 WebAssembly 版本
dotnet publish MyApp.Wasm -c Release

# 直接部署到 Web 服务器，无需应用商店审核
# 用户通过浏览器访问即可使用
```

---

### 2.8 Tauri（Tauri Programme，2022 v1.0）

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

### 2.9 Wails（Wails Project，2019 / v2 2022）【重点推荐】

**一句话定位**：Go + WebView 的桌面应用方案，填补 Go 技术栈空白，比 Tauri 学习曲线更低。

**技术栈**：
- 前端：任意 Web 框架（React/Vue/Svelte/原生）
- 后端：Go
- 渲染：系统 WebView（与 Tauri 相同）
- 绑定：Go 方法直接暴露给前端

**核心优势**：

| 优势 | 说明 | 对比 |
|------|------|------|
| **学习曲线低** | Go 比 Rust 容易学 | 比 Tauri 门槛低 50% |
| **类型安全** | 自动生成 TS 类型 | 编译时发现错误 |
| **并发能力强** | goroutine 原生支持 | 适合高并发场景 |
| **包体适中** | 10-15MB | 比 Electron 小 90% |
| **编译快** | Go 编译速度快 | 比 Rust 快 5-10 倍 |

**桌面 WebView 方案全面对比**：

| 维度 | Electron | Tauri | Wails | Electrobun |
|------|----------|-------|-------|------------|
| 后端语言 | Node.js | Rust | **Go** | Bun (TS) |
| 学习曲线 | 低（JS/TS） | 高（Rust陡） | **低（Go易学）** | 低（TS） |
| 包体大小 | 150MB | 3MB | 10MB | 15MB |
| 内存占用 | 100MB | 30MB | 45MB | 50MB |
| 编译速度 | 无需编译 | 慢（Rust） | **快（Go）** | 快 |
| 并发模型 | 事件循环 | 异步+线程 | **goroutine** | 异步 |
| 类型安全 | JS→TS | 手动定义 | **自动生成TS** | TS 原生 |
| 生态成熟度 | 5/5 | 4/5 | 3/5 | 2/5 |

**适合场景**：
- **Go 技术栈团队做桌面应用**（这是最主要的使用场景）
- 后端逻辑复杂，需要高并发处理（如数据同步、文件处理）
- 需要调用 Go 生态的库（如 gRPC、各种数据库驱动）
- 在意包体大小，但不想学 Rust
- 系统工具类应用（文件管理、网络工具、开发工具）

**不太适合**：
- 需要跨平台 UI 完全一致（WebView 版本不同）
- 需要移动端支持（Wails 主要是桌面）
- 复杂的前端逻辑但后端很简单（考虑 Electron）
- 团队完全是前端，没人会 Go

**真实案例**：
- **LocalSend**：跨平台文件传输工具（开源，6k+ stars）
- **Clash Verge**：代理工具的 GUI 版本
- 多个企业内部工具（数据分析、运维面板）

**代码示例**（完整的类型安全流程）：

**步骤 1：后端 Go 方法**

```go
// app.go - 定义后端方法
type App struct {
    ctx context.Context
}

func (a *App) Greet(name string) string {
    return fmt.Sprintf("Hello %s!", name)
}

func (a *App) ProcessFile(path string) error {
    // 利用 Go 的 goroutine 并发处理
    go func() {
        // 后台处理文件
    }()
    return nil
}
```

**步骤 2：Wails 自动生成 TypeScript 类型**

```typescript
// wailsjs/go/models.ts - 自动生成，无需手写
export namespace main {
    export class App {
        static Greet(name: string): Promise<string>;
        static ProcessFile(path: string): Promise<void>;
    }
}
```

**步骤 3：前端调用（完全类型安全）**

```typescript
import { Greet } from '../wailsjs/go/main/App';

const result = await Greet("World");  // ✅ 类型正确
// await Greet(123);  // ❌ TypeScript 编译错误
```

> **核心优势**：前后端接口不匹配在编译时就能发现，而不是运行时报错。

**快速开始（5 分钟）**：

```bash
# 1. 安装 CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 2. 检查环境
wails doctor

# 3. 创建项目（选择模板：react/vue/svelte）
wails init -n myapp -t react

# 4. 开发（热重载）
cd myapp && wails dev

# 5. 构建
wails build  # 输出: myapp.app / myapp.exe / myapp
```

**Wails v2 vs v3（2025 重大更新）**：

Wails v3 正在开发中，主要改进：
- **原生移动端支持**（iOS/Android）
- **插件系统**（类似 Tauri 的插件）
- **更好的 TypeScript 集成**
- **自动更新支持**

**性能优化技巧**：

1. **使用 Go 的并发优势**：
```go
// 并行处理多个任务
func (a *App) ProcessMultipleFiles(files []string) {
    var wg sync.WaitGroup
    for _, file := range files {
        wg.Add(1)
        go func(f string) {
            defer wg.Done()
            // 处理文件
        }(file)
    }
    wg.Wait()
}
```

2. **使用事件系统**（前后端通信）：
```go
// 后端发送事件
runtime.EventsEmit(a.ctx, "progress", Progress{
    Current: 50,
    Total: 100,
})
```

```typescript
// 前端监听事件
import { EventsOn } from '../wailsjs/runtime';

EventsOn('progress', (data) => {
    console.log(`Progress: ${data.current}/${data.total}`);
});
```

3. **按需构建**（减小包体）：
```bash
# 只构建当前平台
wails build

# 跨平台构建
wails build -platform darwin/amd64,darwin/arm64,windows/amd64
```

**常见问题**：

| 问题 | 解决方案 |
|------|---------|
| Windows 缺少 WebView2 | 引导用户安装 WebView2 Runtime |
| 跨平台 WebView 差异 | 测试各平台，使用 polyfill |
| Go 依赖管理 | 运行 `go mod tidy` |
| 前端资源路径错误 | 检查 `wails.json` 配置 |

**Wails vs Tauri 选择指南**：

| 维度 | 选 Wails | 选 Tauri |
|------|---------|---------|
| 团队技能 | 熟悉 Go / 不想学 Rust | 愿意学 Rust |
| 后端需求 | 高并发（goroutine） | 一般 |
| 包体要求 | 10MB 可接受 | 要求最小（3MB） |
| 编译速度 | 要求快 | 可接受慢 |
| 类型安全 | 要自动生成 | 手动定义可接受 |
| 生态成熟度 | 可接受成长期 | 要求更成熟 |

---

### 2.10 Kotlin Multiplatform / KMP（JetBrains，2023 稳定版）

**一句话定位**：Android 团队扩展 iOS 的"最小阻力路径"，逻辑共享优先。

**技术栈**：
- 语言：Kotlin
- 共享层：`commonMain`（纯 Kotlin，编译到各平台）
- UI 方案：
  - 原生 UI：Android 用 Jetpack Compose，iOS 用 SwiftUI
  - 共享 UI：Compose Multiplatform（Skia 自绘渲染，非原生控件）

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
- 想一套代码搞定所有 UI（注意：Compose Multiplatform 使用 Skia 自绘，非原生控件）
- 团队对 Kotlin 不熟悉
- iOS 是主要平台（用 SwiftUI 原生可能更顺）

**重要说明**：
- **原生 UI 方案**：真正使用各平台原生控件（iOS 用 SwiftUI，Android 用 Jetpack Compose）
- **Compose Multiplatform**：使用 Skia 自绘渲染，跨平台一致性强，但不是原生控件

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

### 2.11 Lynx（ByteDance，2024 开源）

**一句话定位**：字节跳动的跨端方案，用 Web 语法映射到原生控件。

**技术栈**：
- 语言：JavaScript/TypeScript
- UI 语法：类 React/CSS（支持 Flexbox）
- 渲染：原生控件映射（类似 React Native）

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
import { useState } from '@lynx-js/react';
import { View, Text } from '@lynx-js/components';
import { createApp } from '@lynx-js/react-lynx';

function App() {
  const [count, setCount] = useState(0);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24 }}>点击了 {count} 次</Text>
      <View
        style={{ padding: 15, backgroundColor: '#007AFF', borderRadius: 8 }}
        bindtap={() => setCount(count + 1)}
      >
        <Text style={{ color: 'white' }}>+1</Text>
      </View>
    </View>
  );
}

createApp(App);
```

**入门步骤**：
1. 参考官方文档：https://lynxjs.org/
2. 安装 Lynx CLI
3. 创建项目并配置模拟器环境
4. 运行调试

---

### 2.12 Valdi（Snapchat，2024 Beta）

**一句话定位**：TypeScript AOT 编译成原生控件视图，追求 TS 开发体验 + 原生性能。

**技术栈**：
- 语言：TypeScript
- 编译：TS → .valdimodule（AOT 编译，不是解释执行）
- 渲染：原生控件（类似 React Native，但无运行时桥接）
- 布局引擎：C++ Flexbox 引擎

**核心理念**：
- 不走 WebView，也不走 JS Bridge
- AOT 编译避免了运行时性能损耗
- 类型安全 + 原生控件性能
- 内存占用仅为 React Native 的 1/4

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

### 2.13 Electrobun（2024 早期）

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

### 2.14 Dioxus（Dioxus Labs，2021 / v0.5 2024）【重点推荐】

**一句话定位**：Rust 版的 React，用 React-like 语法写全平台 UI，Rust 生态的"全能选手"。

**技术栈**：
- 语言：Rust
- 语法：类 React Hooks（但是 Rust 宏实现）
- 渲染：**多后端架构**（一套代码，多种渲染方式）
  - **Web**: 渲染到 DOM（浏览器原生渲染）
  - **Desktop（默认）**: WebView（WKWebView/WebView2/WebKitGTK）
  - **Desktop（Blitz）**: **自绘渲染**（WGPU + Taffy + Stylo）- 实验性
  - **Mobile**: WebView 或 Blitz（开发中）
  - **TUI**: 终端字符渲染（Ratatui）
- 架构：虚拟 DOM + 响应式

**核心优势**：

| 优势 | 说明 | 独特性 |
|------|------|--------|
| **React-like 语法** | 前端开发者易上手 | Rust GUI 中最像 React |
| **多渲染后端** | Web/Desktop/Mobile/TUI | 一套代码多平台 |
| **Blitz 原生渲染** | WGPU 自绘引擎（实验性） | 12-15MB 二进制，无 JS 引擎 |
| **WASM 性能** | 接近原生的 Web 性能 | 比 JS 快 2-10 倍 |
| **类型安全** | Rust 编译时检查 | 内存安全 + 线程安全 |
| **TUI 支持** | 终端 UI 独特优势 | 其他框架都不支持 |

**与其他 Rust GUI 框架的对比**：

| 维度 | Dioxus | GPUI | Tauri | egui |
|------|--------|------|-------|------|
| 语法风格 | React-like | Rust 原生 | Web 前端 | 即时模式 |
| 学习曲线 | 低（前端易上手） | 高（需熟练 Rust） | 低（会 Web 即可） | 中等 |
| 移动端支持 | 开发中 | 无 | v2 支持 | 有限 |
| Web 支持 | 5/5 完整 WASM | 无 | 5/5 完整 | 3/5 有限 |
| TUI 支持 | 5/5 独特优势 | 无 | 无 | 无 |
| 组件生态 | 3/5 成长中 | 2/5 早期 | 5/5（npm生态） | 3/5 |
| 渲染性能 | 4/5 强 | 5/5 极强 | 3/5 中等 | 4/5 强 |
| 成熟度 | 3/5 成长中 | 3/5 成长中 | 4/5 稳定 | 4/5 稳定 |

**适合场景**：
- **Rust 技术栈，想做全平台应用**
- 需要 Web（WASM）和桌面共享代码
- 前端转 Rust 的开发者（熟悉 React）
- 命令行工具需要 TUI 界面
- 性能敏感的应用（利用 Rust + WASM）
- 开源项目（生态正在快速成长）

**不太适合**：
- 不熟悉 Rust 的团队（学习曲线陡）
- 需要大量现成组件（生态还在建设中）
- 生产环境要求极高稳定性（v1.0 还未发布）
- 移动端是主要平台（移动端支持还在完善）

**真实案例**：
- **Blitz（开源）**：游戏辅助工具
- **FutureSDR**：软件定义无线电框架的 UI
- 多个开源开发工具和 TUI 应用

**代码示例**（感受 Rust + React 的组合）：

**基础计数器**：

```rust
use dioxus::prelude::*;

fn main() {
    launch(App);
}

#[component]
fn App() -> Element {
    let mut count = use_signal(|| 0);

    rsx! {
        div {
            style: "display: flex; flex-direction: column; align-items: center; gap: 20px;",
            h1 { "计数器" }
            p {
                style: "font-size: 24px;",
                "点击了 {count} 次"
            }
            button {
                onclick: move |_| count += 1,
                style: "padding: 10px 20px; font-size: 18px;",
                "+1"
            }
        }
    }
}
```

**组件复用**（像 React 一样）：

```rust
// 可复用的 Button 组件
#[component]
fn MyButton(onclick: EventHandler<MouseEvent>, children: Element) -> Element {
    rsx! {
        button {
            class: "custom-button",
            onclick: move |evt| onclick.call(evt),
            {children}
        }
    }
}

// 使用组件
#[component]
fn App() -> Element {
    rsx! {
        MyButton {
            onclick: |_| println!("Clicked!"),
            "点击我"
        }
    }
}
```

**异步数据获取**（类似 React Query）：

```rust
use dioxus::prelude::*;

#[component]
fn App() -> Element {
    let mut user_data = use_resource(|| async move {
        // 异步请求数据
        reqwest::get("https://api.example.com/user")
            .await
            .ok()?
            .json::<User>()
            .await
            .ok()
    });

    match &*user_data.read_unchecked() {
        None => rsx! { p { "加载中..." } },
        Some(user) => rsx! {
            div {
                h1 { "欢迎, {user.name}" }
                p { "邮箱: {user.email}" }
            }
        },
    }
}
```

**多渲染后端示例**：

```rust
// 同一套代码，不同渲染后端

// 1. 桌面应用（WebView）
fn main() {
    launch(App);
}

// 2. Web 应用（WASM）
fn main() {
    launch(App);
}

// 3. 终端 UI（TUI）
fn main() {
    launch(App);
}

// 4. 服务端渲染（SSR）
fn main() {
    let html = dioxus_ssr::render(|| rsx! { App {} });
    // 返回 HTML 字符串
}
```

**入门步骤**：

1. **安装 Rust 和 Dioxus CLI**：
   ```bash
   # 安装 Rust
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

   # 安装 Dioxus CLI
   cargo install dioxus-cli
   ```

2. **创建项目**（自动配置）：
   ```bash
   dx new my-app
   # 选择模板：web, desktop, mobile, TUI
   ```

3. **开发模式**（带热重载）：
   ```bash
   cd my-app
   dx serve  # Web
   # 或
   dx serve --platform desktop  # 桌面
   ```

4. **构建生产版本**：
   ```bash
   dx build --release
   ```

**Dioxus 0.5 的重大改进**（2024）：

- ✅ **信号系统**：更简单的状态管理
- ✅ **资源系统**：内置异步数据获取
- ✅ **路由系统**：完整的客户端路由
- ✅ **服务端组件**：支持 SSR 和流式渲染
- ✅ **热重载**：开发体验接近 Vite

**性能优化技巧**：

1. **利用 Rust 的零成本抽象**：
```rust
// 组件会在编译时优化
#[inline(always)]
#[component]
fn FastComponent() -> Element {
    // 编译器会内联这个组件
    rsx! { div { "Fast Component" } }
}
```

2. **使用 memo 避免重渲染**：
```rust
let expensive = use_memo(move || {
    // 只在依赖变化时重新计算
    heavy_computation(dep1(), dep2())
});
```

3. **WASM 优化**：
```bash
# 构建优化的 WASM
dx build --release --platform web
# 生成的 WASM 包通常只有几百 KB
```

**TUI 应用示例**（独特优势）：

```rust
// 用同样的代码创建漂亮的终端 UI
use dioxus::prelude::*;

fn main() {
    launch(App);
}

#[component]
fn App() -> Element {
    let mut count = use_signal(|| 0);

    rsx! {
        div {
            border_width: "1px",
            padding: "2",
            h1 { "Terminal Counter" }
            p { "Count: {count}" }
            button {
                onclick: move |_| count += 1,
                "Increment"
            }
        }
    }
}
```

**常见坑**：

- **生命周期标注**：
  - Rust 的生命周期可能让新手困惑
  - 使用 Dioxus CLI 生成的模板可以避免大部分问题

- **异步运行时**：
  - 需要理解 Rust 的 async/await
  - 建议使用 `use_future` 而不是手动管理

- **跨平台样式**：
  - 不同渲染后端的样式支持不同
  - Web 支持完整 CSS，桌面支持子集

**Blitz 原生渲染引擎详解**（Dioxus 的核心技术）：

Blitz 是 Dioxus 团队开发的**模块化 HTML/CSS 渲染引擎**，旨在替代桌面端的 WebView，提供真正的原生渲染体验。

**架构组成**：
```
┌────────────────────────────────────┐
│     Dioxus Virtual DOM             │
├────────────────────────────────────┤
│     Blitz DOM (核心抽象层)          │
├────────────────────────────────────┤
│  Stylo (CSS)  │  Taffy (布局)      │
│  Firefox 引擎  │  Flexbox/Grid     │
├────────────────┼───────────────────┤
│  Parley (文本) │  WGPU (渲染)      │
│  文本排版      │  GPU 加速         │
└────────────────┴───────────────────┘
```

**核心组件**：
- **Stylo**: Firefox Servo 的 CSS 引擎（工业级，经过实战验证）
- **Taffy**: Rust 编写的布局引擎，支持 Flexbox、Grid、Block 等（也被 Zed、Bevy UI 使用）
- **Parley**: 高性能文本布局和排版引擎
- **WGPU**: 跨平台 GPU 抽象层（支持 Vulkan、Metal、DirectX 12、OpenGL）

**优势**：
- ✅ 二进制大小仅 12-15MB（vs Electron 100MB+）
- ✅ 无需 JavaScript 引擎
- ✅ 完全用 Rust 编写，易于维护
- ✅ GPU 加速渲染，性能接近原生

**开发时间线**：
- 2024: Alpha 阶段（实验性）
- 2025 年底: Beta 版
- 2026: 生产就绪版本

**Rust GUI 框架选择指南**：

| 需求 | 推荐框架 | 理由 |
|------|---------|------|
| Web + 桌面共享代码 | **Dioxus** | WASM + 多后端 |
| 前端团队用 Rust 后端 | **Tauri** | 前后端分离 |
| React 开发者转 Rust | **Dioxus** | 语法相似 |
| 需要 TUI（终端界面） | **Dioxus** | 独特支持 |
| 追求极致性能（编辑器） | **GPUI** | 为 Zed 设计 |
| 嵌入式设备 | **Slint** | 轻量级 |
| 要 npm 生态 | **Tauri** | Web 前端 |
| 想要原生渲染 + React 语法 | **Dioxus + Blitz** | 最佳组合（2026 稳定）|

**未来展望**：

- 🎨 **Blitz 渲染引擎**：2025 年底 Beta，2026 年生产就绪（真正的原生渲染）
- 📱 **移动端支持**：Dioxus Mobile 正在开发，预计 2026 稳定
- 🧩 **组件库**：社区正在建设类似 shadcn/ui 的组件库
- 🔧 **开发者工具**：DevTools 正在完善，类似 React DevTools
- 🚀 **性能优化**：持续优化 WASM 包体积和运行时性能

---

### 2.15 Slint（SixtyFPS GmbH，2020 / v1.0 2023）

**一句话定位**：嵌入式和桌面 GUI 框架，填补"Qt 太重，Flutter 太大"的空白。

**技术栈**：
- 语言：Rust/C++/JavaScript（多语言绑定）
- UI 语法：自研 DSL（`.slint` 文件）
- 渲染：多后端（软件渲染/OpenGL/Skia/Femtovg）
- 架构：声明式 UI + 响应式属性

**核心特点**：

1. **极致轻量**
   - 适合低端嵌入式设备（MCU、ARM Cortex-M）
   - 包体可以做到 < 300KB（不含资源）
   - 内存占用可控（几 MB 级别）

2. **多语言支持**
   - Rust（一等公民）
   - C++（适合嵌入式团队）
   - JavaScript/Node.js（快速原型）
   - Python（正在开发）

3. **设计师友好**
   - 提供可视化设计工具（Slint UI Designer）
   - 支持热重载
   - 类似 QML 的声明式语法

**与 Qt 的对比**（嵌入式场景）：

| 维度 | Qt (Qt Quick) | Slint |
|------|---------------|-------|
| 最小包体 | ~10-20MB | ~300KB |
| 内存占用 | ~20-50MB | ~2-10MB |
| 启动速度 | 慢 | 快 |
| MCU 支持 | 需要 Qt for MCUs（商业版） | 开源版支持 |
| 许可证 | LGPL/GPL 或商业 | GPL/商业（企业版）|
| 学习曲线 | 中 | 低 |
| 工业案例 | 5/5 极多 | 3/5 成长中 |

**适合场景**：
- **嵌入式设备**：智能家居、工业控制面板、车载 HMI（低端）
- **资源受限环境**：老旧设备、单板计算机（树莓派）
- **快速启动应用**：系统工具、启动界面
- **多语言团队**：可以用 Rust/C++/JS 中的任意一种

**不太适合**：
- 需要复杂动效（Qt/Flutter 更强）
- 需要大量现成组件（生态还在建设）
- Web 应用（虽然有 WASM，但不如 Dioxus）
- 移动端应用（主要是桌面+嵌入式）

**真实案例**：
- 工业控制面板
- 智能家居设备 UI
- 医疗设备界面

**代码示例**（感受 Slint 的 DSL）：

**UI 文件**（`.slint` 声明式语法）：

```slint
// counter.slint
import { Button, VerticalBox } from "std-widgets.slint";

export component Counter {
    in-out property <int> counter: 0;

    VerticalBox {
        Text {
            text: "点击了 \{counter} 次";
            font-size: 24px;
        }

        Button {
            text: "+1";
            clicked => {
                counter += 1;
            }
        }
    }
}
```

**Rust 调用**：

```rust
// main.rs
slint::slint! {
    import { Counter } from "counter.slint";
}

fn main() {
    let ui = Counter::new().unwrap();

    // 可以从 Rust 代码访问和修改属性
    ui.set_counter(0);

    // 监听属性变化
    ui.on_counter_changed(|value| {
        println!("Counter changed to: {}", value);
    });

    ui.run().unwrap();
}
```

**C++ 调用**（嵌入式团队友好）：

```cpp
// main.cpp
#include "counter.h"

int main() {
    auto ui = Counter::create();

    // C++ API 类型安全
    ui->set_counter(0);

    // 回调
    ui->on_counter_changed([](int value) {
        std::cout << "Counter: " << value << std::endl;
    });

    ui->run();
}
```

**入门步骤**：

1. **安装 Slint**（Rust 项目）：
   ```bash
   cargo new my-app
   cd my-app
   cargo add slint
   ```

2. **创建 UI 文件**：
   ```bash
   # 创建 ui/counter.slint
   mkdir ui
   ```

3. **配置 build.rs**（自动编译 .slint 文件）：
   ```rust
   // build.rs
   fn main() {
       slint_build::compile("ui/counter.slint").unwrap();
   }
   ```

4. **运行**：
   ```bash
   cargo run
   ```

**可视化设计工具**：

```bash
# 安装 Slint UI Designer
cargo install slint-viewer

# 实时预览 .slint 文件
slint-viewer ui/counter.slint
```

**嵌入式示例**（软件渲染，适合无 GPU 设备）：

```rust
use slint::platform::software_renderer::{MinimalSoftwareWindow, RepaintBufferType};

fn main() {
    slint::platform::set_platform(Box::new(MyPlatform::new())).unwrap();

    let ui = Counter::new().unwrap();

    // 渲染到帧缓冲区
    let window = ui.window();
    window.set_size(slint::PhysicalSize::new(800, 480));

    // 自定义事件循环（适合 bare-metal 环境）
    loop {
        slint::platform::update_timers_and_animations();
        window.draw_if_needed(|renderer| {
            // 渲染到你的帧缓冲区
        });
    }
}
```

**常见坑**：

- **DSL 学习**：`.slint` 语法需要学习，但比 QML 简单
- **组件库有限**：标准组件够用，但不如 Qt 丰富
- **文档**：相比 Qt 文档较少，但正在改善

**什么时候选 Slint 而不是 Qt？**

选 **Slint** 如果：
- ✅ 嵌入式设备资源受限（RAM < 50MB）
- ✅ 需要快速启动（< 100ms）
- ✅ 想用 Rust 开发嵌入式 GUI
- ✅ 对许可证敏感（Qt 商业版很贵）

选 **Qt** 如果：
- ✅ 需要丰富的组件库
- ✅ 工业级项目，稳定性第一
- ✅ 团队已经熟悉 Qt
- ✅ 需要跨平台（包括移动端）

---

### 2.16 GPUI（Zed Industries，2024）

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
| Flutter | 自绘 | Dart | 移动+桌面+Web | 5/5 成熟 | 全能选手，跨端一致性最强 |
| React Native | 原生映射 | JS/TS | 移动为主 | 5/5 成熟 | 前端团队的原生应用方案 |
| NativeScript | 原生映射 | JS/TS+Vue/Angular | 移动 | 3/5 成长中 | Vue/Angular 写原生应用 |
| Electron | WebView | JS/TS | 桌面 | 5/5 成熟 | Web 做桌面的事实标准 |
| Qt Quick | 自绘 | C++/QML | 全平台+嵌入式 | 5/5 成熟 | 工业级、嵌入式首选 |
| .NET MAUI | 原生映射 | C# | 全平台 | 4/5 稳定 | C# 团队的官方方案 |
| Uno Platform | 原生/Skia/WASM | C# | 全平台+Web | 4/5 稳定 | C# + 多渲染模式 |
| Tauri | 系统WebView+Rust | Rust+Web | 桌面+移动 | 4/5 稳定 | 轻量级 Electron 替代 |
| Wails | 系统WebView+Go | Go+Web | 桌面 | 3/5 成长中 | Go 技术栈做桌面 |
| KMP | 自绘(Compose)/原生 | Kotlin | 移动+桌面 | 4/5 稳定 | Android 团队扩 iOS |
| Lynx | 原生映射 | JS/TS | 移动+Web | 3/5 成长中 | 高性能+Web语法 |
| Valdi | AOT编译+原生映射 | TypeScript | 移动 | 2/5 早期 | TS AOT 编译到原生控件 |
| Electrobun | 系统WebView/CEF | TypeScript | 桌面 | 2/5 早期 | 轻量桌面方案 |
| Dioxus | 多后端(WebView/Blitz自绘/DOM) | Rust | 全平台+TUI | 3/5 成长中 | Rust 版 React，多渲染后端 |
| Slint | 自绘 | Rust/C++/JS | 桌面+嵌入式 | 3/5 成长中 | 轻量嵌入式 GUI |
| GPUI | 自绘 | Rust | 桌面 | 2/5 早期 | Rust 高性能 GUI |

### 3.2 指标矩阵

> 说明：以下评价基于渲染原理和生态现状的一般判断，实际表现取决于具体实现。评分采用 1-5 分制，5 分最高。

| 框架 | 包体/启动 | 性能上限 | 原生体验 | 跨端一致 | 开发效率 | 生产风险 |
|------|-----------|----------|----------|----------|----------|----------|
| Flutter | 3 中等 | 5 极强 | 3 一般 | 5 极强 | 5 极高 | 低 |
| React Native | 3 中等 | 4 强 | 5 极强 | 3 一般 | 5 极高 | 低 |
| NativeScript | 3 中等 | 4 强 | 5 极强 | 3 一般 | 4 高 | 中 |
| Electron | 2 大/慢 | 3 中等 | 3 一般 | 5 极强 | 5 极高 | 低 |
| Qt Quick | 3 中等 | 5 极强 | 3 一般 | 5 极强 | 3 中等 | 低 |
| .NET MAUI | 3 中等 | 4 强 | 5 极强 | 3 一般 | 4 高 | 低 |
| Uno Platform | 3 中等 | 4 强 | 4 强 | 4 强 | 4 高 | 中 |
| Tauri | 5 小/快 | 4 强 | 3 一般 | 4 强 | 4 高 | 中 |
| Wails | 4 小/快 | 4 强 | 3 一般 | 4 强 | 5 极高 | 中 |
| KMP | 视UI方案 | 视UI方案 | 5 极强 | 3 一般 | 4 高 | 中 |
| Lynx | 4 小/快 | 5 极强 | 3 一般 | 5 极强 | 4 高 | 高 |
| Valdi | 4 小/快 | 5 极强 | 5 极强 | 3 一般 | 3 中等 | 高 |
| Electrobun | 4 小/快 | 3 中等 | 3 一般 | 4 强 | 4 高 | 高 |
| Dioxus | 4 小/快* | 5 极强 | 3 一般* | 4 强* | 4 高 | 高 |
| Slint | 5 小/快 | 4 强 | 3 一般 | 5 极强 | 3 中等 | 中 |
| GPUI | 4 小/快 | 5 极强 | 3 一般 | 3 一般 | 3 中等 | 高 |

**指标说明**：
- **包体/启动**：应用包大小和启动速度（5=最小最快，1=最大最慢）
- **性能上限**：复杂动效、大数据量场景的表现潜力（5=极限性能，1=性能受限）
- **原生体验**：与系统控件的融合程度（5=完全原生，1=明显非原生）
- **跨端一致**：不同平台上 UI 的统一程度（5=完全一致，1=差异大）
- **开发效率**：上手速度、调试体验、工具链成熟度（5=极高，1=很低）
- **生产风险**：生态稳定性、长期维护的不确定性（低/中/高）

**特殊说明**：
- **KMP**: 评分"视UI方案"是因为 KMP 本身只共享逻辑层，UI 可选原生或 Compose Multiplatform（自绘）
- **Dioxus**: 带 * 的评分因渲染后端不同而异
  - WebView 模式（默认）: 包体 3/5，原生体验 2/5，跨端一致 5/5
  - Blitz 模式（实验）: 包体 5/5，原生体验 3/5，跨端一致 5/5
  - 表中评分为 Blitz 模式预期值（2026 稳定后）
- **Uno Platform**: 支持三种渲染模式，评分为综合考量

---

## 第四章：场景化选型指南

### 快速决策表

**不想看详细分析？根据你的情况直接查表：**

#### 按技术栈选择

| 你的技术栈 | 首选 | 备选 | 理由 |
|-----------|------|------|------|
| React | React Native | Lynx | 复用 React 技能 |
| Vue/Angular | NativeScript | Flutter | 直接用 Vue/Angular |
| Go | **Wails** | - | 唯一的 Go 桌面方案 |
| Rust（有前端） | Tauri | Dioxus | 前后端分离 |
| Rust（纯 Rust） | **Dioxus** | GPUI | React-like 语法 |
| C# | .NET MAUI | Uno Platform | 微软生态 |
| C++ | Qt | Slint | 工业级/嵌入式 |
| Kotlin | KMP | Flutter | Android 团队扩展 |

#### 按需求选择

| 你的需求 | 推荐框架 | 原因 |
|---------|---------|------|
| 极致跨端一致性 | Flutter, Qt | 自绘渲染 |
| 极小包体（< 5MB） | Tauri, Slint | 系统 WebView/轻量 |
| 原生体验优先 | React Native, .NET MAUI | 原生控件 |
| 嵌入式设备 | Slint, Qt | 资源占用低 |
| 需要 WebAssembly | Uno Platform, Dioxus | 浏览器运行 |
| 需要终端 UI（TUI） | Dioxus | 独特优势 |
| 快速原型 | Electron, Flutter | 工具链成熟 |

---

### 场景 A：移动端为主，重动效、品牌视觉统一

> 典型产品：电商首页、社交 feed、游戏化应用

**推荐**：Flutter

**理由**：
- 自绘渲染保证跨端一致性
- 动效性能有保障
- 生态成熟，组件丰富

**备选**：
- Qt Quick（如果团队熟悉 C++）
- Lynx（如果是前端团队且接受原生控件映射方案）

---

### 场景 B：桌面应用（按技术栈）

| 团队技术栈 | 首选方案 | 优势 | 典型产品 |
|-----------|---------|------|---------|
| **纯前端团队** | Electron | 生态最成熟，工具链完善 | VS Code, Slack |
| **前端 + 在意包体** | Tauri | 包体小（3MB），启动快 | 系统工具 |
| **Go 后端团队** | **Wails** | 无需学 Rust，类型安全 | 运维面板，数据处理 |
| **Rust 团队** | Tauri | 安全性高，插件生态好 | 开发工具 |
| **想尝新** | Electrobun | Bun 运行时，TS 全栈 | 原型项目 |

**快速决策**：
- 求稳定 → Electron
- 要轻量 → Tauri
- 用 Go → Wails
- 学 Rust → Tauri

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

**推荐**：
- **需要 Web 前端**：Tauri
- **需要 Web + 桌面共享代码**：Dioxus
- **纯 Rust，极致性能**：GPUI

**理由**：
- Tauri：前后端分离，前端用熟悉的 Web 技术栈
- Dioxus：React-like 语法，前端转 Rust 易上手，支持 WASM
- GPUI：为代码编辑器设计，性能极致但学习曲线陡

**选择建议**：
- 团队有前端，后端用 Rust → Tauri
- 想要纯 Rust 技术栈，喜欢 React → Dioxus
- 追求极致性能（如编辑器）→ GPUI

---

### 场景 I：嵌入式设备 GUI

> 典型产品：智能家居面板、车载 HMI、工业控制、医疗设备

**推荐**：Slint（首选）/ Qt（工业级）

**理由**：
- Slint：轻量（< 300KB），支持软件渲染，适合低端 MCU
- Qt：功能强大，工业案例丰富，但包体大、需商业授权

**选择建议**：
- 资源极度受限（RAM < 50MB）→ Slint
- 需要丰富组件库，工业级项目 → Qt
- 原型验证、Rust 技术栈 → Slint

---

### 场景 J：Vue/Angular 团队做移动应用

> 典型产品：企业内部应用、内容展示应用

**推荐**：NativeScript

**理由**：
- 直接用 Vue 或 Angular 写原生应用
- 无需学 React（如果用 React Native 需要学 React）
- 直接访问原生 API，无桥接层

**备选**：Flutter（如果愿意学 Dart）

---

### 场景 K：C# 团队，需要 WebAssembly

> 典型产品：需要 Web 版的企业应用、渐进式 Web 应用

**推荐**：Uno Platform

**理由**：
- 同时支持原生平台和 WebAssembly
- 一套代码可以跑在浏览器里
- WinUI 语法，Windows 应用迁移方便

**备选**：Blazor WebAssembly（纯 Web）+ .NET MAUI（原生）

---

## 第五章：选型方法论

### 5.1 三步选型法

```
Step 1: 确定渲染路线
    │
    ├── 需要跨端视觉完全一致 → 自绘渲染（Flutter/Qt/Dioxus+Blitz）
    ├── 需要原生体验优先 → 原生映射（RN/MAUI/KMP/Lynx）
    └── 需要快速上线、前端技术栈 → WebView（Electron/Tauri/Dioxus默认）

Step 2: 确定平台覆盖
    │
    ├── 移动端为主 → Flutter/RN/Lynx/KMP
    ├── 桌面端为主 → Electron/Tauri/Qt/GPUI
    └── 全平台 → Flutter/Qt

Step 3: 匹配团队技能
    │
    ├── Dart → Flutter
    ├── JS/TS + React → React Native / Lynx / Dioxus（想学 Rust）
    ├── JS/TS + Vue/Angular → NativeScript
    ├── JS/TS + 任意框架 → Electron / Tauri / Wails / Electrobun
    ├── C# → .NET MAUI / Uno Platform（需要 WASM）
    ├── C++ → Qt / Slint（嵌入式）
    ├── Go → Wails
    ├── Kotlin → KMP
    └── Rust → Tauri（Web前端） / Dioxus（全栈） / GPUI（纯Rust） / Slint（嵌入式）
```

### 5.2 决策检查清单

在最终决定前，问自己这些问题：

**基础问题**：
- [ ] 团队对目标语言的熟悉程度如何？（Dart/JS/TS/C#/C++/Go/Kotlin/Rust）
- [ ] 是否有时间预算来学习新技术？
- [ ] 对包体大小和启动速度的要求有多高？
- [ ] 是否需要与系统功能深度集成？
- [ ] 是否需要跨端 UI 完全一致？
- [ ] 项目周期是多长？是否允许使用新兴框架？
- [ ] 团队规模如何？是否需要大量第三方库支持？
- [ ] 未来是否需要扩展到更多平台？

**新增考虑点**（针对新框架）：
- [ ] 是否是 Go 技术栈？考虑 Wails
- [ ] 是否需要 WebAssembly 支持？考虑 Uno Platform / Dioxus
- [ ] 是否是 Vue/Angular 技术栈？考虑 NativeScript
- [ ] 是否是嵌入式设备（RAM < 50MB）？考虑 Slint
- [ ] 是否想用 Rust 写全栈（包括 UI）？考虑 Dioxus
- [ ] 是否需要终端 UI（TUI）？考虑 Dioxus
- [ ] 是否追求极致性能（如代码编辑器）？考虑 GPUI

---

## 第六章：趋势观察

### 6.1 当前格局（2026 更新）

**成熟稳定层**（生产环境可放心使用）：
- **移动端**：Flutter、React Native
- **桌面端**：Electron、Qt
- **C# 生态**：.NET MAUI、Uno Platform
- **逻辑共享**：KMP

**快速上升层**（已有成功案例，值得认真考虑）：
- **轻量桌面**：Tauri、Wails
- **新兴移动**：Lynx（字节跳动背书）
- **Rust 全栈**：Dioxus（社区活跃）

**新锐探索层**（有潜力，需承担早期风险）：
- **桌面端**：Electrobun、GPUI
- **移动端**：Valdi
- **嵌入式**：Slint

### 6.2 趋势预判

1. **自绘渲染持续演进**
   - Flutter 的 Impeller 引擎带来更好的 iOS 性能
   - Dioxus、Slint 等新框架证明自绘渲染仍有创新空间
   - GPU 加速成为标配

2. **Rust 生态全面爆发**（重要趋势）
   - **桌面端**：Tauri（轻量）、Dioxus（全栈）、GPUI（性能）、Slint（嵌入式）
   - Rust 已经形成完整的 GUI 生态矩阵
   - WebAssembly + Rust 成为 Web 高性能方案
   - 预测：2026-2027 会有更多 Rust GUI 框架成熟

3. **WebView 方案的"语言多样化"**
   - **传统**：Electron（Node.js）
   - **新势力**：Tauri（Rust）、Wails（Go）、Electrobun（Bun）
   - 趋势：每个后端语言都会有自己的 WebView 方案
   - Go、Rust、Bun 的学习曲线比 Node.js 低（或类型更安全）

4. **逻辑共享成为共识**
   - 即使 UI 不共享，业务逻辑共享也成为趋势
   - KMP 模式证明了渐进式迁移的可行性
   - Dioxus 的多渲染后端也是类似思路

5. **WebAssembly 的崛起**
   - Uno Platform 证明了 C# + WASM 的可行性
   - Dioxus 的 WASM 性能接近原生
   - 预测：更多框架会支持 WASM 作为部署目标

6. **类型安全成为标配**
   - Wails 的自动生成 TypeScript 类型
   - Dioxus 的 Rust 类型安全
   - Slint 的多语言类型绑定
   - 趋势：前后端通信的类型不匹配会成为历史

7. **前端框架语法的多样化**
   - 不再是"React 一家独大"
   - NativeScript 支持 Vue/Angular
   - Dioxus 带来 Rust + React-like 语法
   - 趋势：每个前端生态都能找到对应的跨平台方案

8. **嵌入式 GUI 的轻量化**
   - Slint 证明了 Qt 不是嵌入式唯一选择
   - 软件渲染 + 极致优化可以跑在 MCU 上
   - 趋势：智能家居、车载等场景会有更多轻量方案

---

## 总结

选框架不是选"最好的"，而是选"最适合的"。

**如果你只记住一件事**，那就是：

> 先想清楚你的核心诉求是什么——跨端一致性、原生体验、还是开发效率？然后在对应的技术路线里，选一个匹配团队技能的框架。

**2026 关键变化总结**：

| 变化 | 具体表现 | 影响 |
|------|---------|------|
| **1. 桌面方案多元化** | Electron/Tauri/Wails/Electrobun | 每个后端语言都有选择 |
| **2. Rust GUI 成熟** | Tauri/Dioxus/Slint/GPUI | 覆盖全场景 |
| **3. 前端多样化** | React/Vue/Angular 都有方案 | 不再是 React 独大 |
| **4. WASM 普及** | Uno/Dioxus 支持 | 浏览器运行原生性能 |
| **5. 嵌入式轻量化** | Slint 挑战 Qt | 低端设备新选择 |

**选型建议（按风险偏好）**：

```
稳妥派（生产环境）
├─ 移动端：Flutter, React Native
├─ 桌面端：Electron, Qt
└─ C# 生态：.NET MAUI, Uno Platform

平衡派（值得尝试）
├─ Go 桌面：Wails
├─ Rust 全栈：Dioxus
└─ 逻辑共享：KMP

激进派（原型/小项目）
├─ Lynx, Valdi（移动端新思路）
├─ Electrobun（桌面 Bun 方案）
└─ Slint（嵌入式轻量）
```

祝选型顺利！

---

## 参考资源

### 官方文档

**成熟框架**：
- [Flutter](https://docs.flutter.dev/) | [支持的平台](https://docs.flutter.dev/reference/supported-platforms)
- [React Native](https://reactnative.dev/) | [新架构](https://reactnative.dev/docs/the-new-architecture/landing-page)
- [NativeScript](https://docs.nativescript.org/)
- [Electron](https://www.electronjs.org/)
- [Qt](https://doc.qt.io/) | [支持的平台](https://doc.qt.io/qt-6/supported-platforms.html)
- [.NET MAUI](https://dotnet.microsoft.com/apps/maui)
- [Uno Platform](https://platform.uno/) | [WebAssembly](https://platform.uno/docs/articles/getting-started-with-wasm.html)
- [Tauri](https://tauri.app/) | [WebView 版本](https://v2.tauri.app/reference/webview-versions/)
- [Kotlin Multiplatform](https://kotlinlang.org/docs/multiplatform.html)

**新兴框架**：
- [Wails](https://wails.io/) | [GitHub](https://github.com/wailsapp/wails)
- [Dioxus](https://dioxuslabs.com/) | [GitHub](https://github.com/DioxusLabs/dioxus)
- [Slint](https://slint.dev/) | [嵌入式指南](https://slint.dev/docs/embedded)
- [Lynx](https://lynxjs.org/)
- [Valdi](https://github.com/Snapchat/Valdi)
- [Electrobun](https://electrobun.dev/)
- [GPUI](https://www.gpui.rs/) | [GitHub](https://github.com/zed-industries/zed)

### 延伸阅读

**对比文章**：
- [Flutter vs React Native 2026 深度对比](https://docs.flutter.dev/resources/faq#how-does-flutter-compare-to-react-native)
- [Tauri vs Electron vs Wails：该选哪个？](https://tauri.app/v1/guides/getting-started/prerequisites/)
- [Rust GUI 框架全景对比](https://www.areweguiyet.com/)

**生产实践案例**：
- [KMP 生产实践：Netflix 案例](https://netflixtechblog.com/netflix-android-and-ios-studio-apps-kotlin-multiplatform-d6d4d8d25d23)
- [Wails 真实案例：LocalSend](https://github.com/localsend/localsend)
- [Dioxus 构建全栈应用](https://dioxuslabs.com/blog/release-050/)
- [Uno Platform：跨平台开发最佳实践](https://platform.uno/blog/)

**技术深度解析**：
- [Wails 的类型安全绑定原理](https://wails.io/docs/guides/typescript)
- [Dioxus 的多渲染后端架构](https://dioxuslabs.com/blog/introducing-dioxus/)
- [Slint 的软件渲染优化](https://slint.dev/blog/software-renderer)
- [Rust WebAssembly 性能优化指南](https://rustwasm.github.io/book/)
