---
title: GKD：基于无障碍服务的 Android 屏幕自动化神器
published: 2025-12-31
description: 详细介绍了 GKD 这款开源 Android 屏幕自动化工具的技术原理，包括 AccessibilityService 工作机制、选择器引擎设计、规则引擎实现，以及如何手写一个简易版的 GKD 工具。
tags: [Android, 无障碍服务, 自动化]
category: Android
draft: false
---

## 项目简介

[GKD](https://github.com/gkd-kit/gkd) 是一款开源的 Android 屏幕自动化工具，全称是"高可定制点击"（Gu Ke Ding - 估计大概定）。它基于 Android 无障碍服务（AccessibilityService），通过自定义规则实现对屏幕元素的自动点击和操作。

GKD 的核心设计理念是：**在指定界面，满足指定条件（如屏幕上存在特定文字）时，点击特定的节点或位置或执行其他操作**。

## 核心应用场景

### 1. 跳过开屏广告

这是 GKD 最常见的使用场景。许多 App 启动时会展示 5-30 秒的开屏广告，用户需要等待或点击"跳过"按钮。GKD 可以自动识别并点击跳过按钮，极大提升用户体验。

### 2. 快捷操作

帮助简化重复性流程，例如：
- QQ/微信扫码登录时自动确认
- 自动点击"同意"用户协议
- 自动处理各种弹窗提示

### 3. 应用内功能优化

- 自动点击"稍后再说"或"不再提醒"
- 跳过应用更新提示
- 自动关闭各类诱导性弹窗

## 技术原理深度解析

### 1. AccessibilityService 工作机制

#### 1.1 无障碍服务生命周期

AccessibilityService 是 Android 为残障人士设计的辅助功能 API，允许应用获取屏幕内容并执行模拟操作。其工作流程如下：

```
┌─────────────────────────────────────────────────────────────┐
│                   AccessibilityService                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   系统事件流                                                │
│   ┌─────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │界面变化 │───▶│onAccessibilityEvent│───▶│规则匹配引擎  │      │
│   └─────────┘    └──────────────┘    └──────────────┘      │
│         │                                    │               │
│         ▼                                    ▼               │
│   ┌─────────┐                        ┌──────────────┐       │
│   │节点树   │                        │执行点击操作  │       │
│   │遍历     │                        │              │       │
│   └─────────┘                        └──────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 1.2 核心回调方法

```kotlin
class MyAccessibilityService : AccessibilityService() {

    // 服务连接时回调
    override fun onServiceConnected() {
        super.onServiceConnected()
        // 配置服务监听的事件类型
        val info = AccessibilityServiceInfo()
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
        info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        serviceInfo = info
    }

    // 核心方法：监听所有无障碍事件
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        when (event?.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                // 界面切换：打开新 Activity 或 Dialog
                handleWindowChanged(event)
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                // 内容变化：界面内容发生改变
                handleContentChanged(event)
            }
        }
    }

    // 中断回调
    override fun onInterrupt() {}
}
```

#### 1.3 节点树结构

Android 的界面是以树形结构组织的 View 层级，无障碍服务可以完整获取这棵树：

```
DecorView (根节点)
├── LinearLayout (actionBar)
│   └── TextView (title)
├── FrameLayout (content)
│   ├── TextView (text: "跳过广告")
│   ├── Button (text: "确定")
│   └── ImageView
└── LinearLayout (navigation)
```

每个 `AccessibilityNodeInfo` 节点包含：
- `text` - 节点显示的文字
- `contentDescription` - 内容描述
- `viewIdResourceName` - View 的资源 ID（如 `com.example.app:id/skip_btn`）
- `className` - 类名（如 `android.widget.Button`）
- `boundsInScreen` - 屏幕上的位置区域
- `isClickable` - 是否可点击
- `parent / child` - 父子节点关系

### 2. 选择器引擎原理

#### 2.1 选择器语法设计

GKD 创新性地设计了一套类似 CSS 选择器的节点选择语法，能够结合节点上下文信息精确定位目标元素：

```
@[vid="menu"] < [vid="menu_container"] - [vid="dot_text_layout"] > [text^="广告"]
```

选择器符号说明：

| 符号 | 含义 |
|------|------|
| `@` | 从当前界面开始查找 |
| `<` | 父节点 |
| `>` | 子节点 |
| `+` | 前一个兄弟节点 |
| `-` | 后一个兄弟节点 |
| `[vid="xxx"]` | 匹配 viewId |
| `[text^="xxx"]` | 匹配文字前缀 |
| `[text*="xxx"]` | 匹配文字包含 |
| `[text$="xxx"]` | 匹配文字后缀 |
| `[text="xxx"]` | 精确匹配文字 |

#### 2.2 选择器解析算法

```kotlin
// 选择器解析器核心逻辑
class SelectorParser {

    // 解析选择器字符串
    fun parse(selector: String): Selector {
        val tokens = tokenize(selector)
        return buildSelectorTree(tokens)
    }

    // 选择器求值：在节点树中查找匹配的节点
    fun evaluate(selector: Selector, root: AccessibilityNodeInfo): List<AccessibilityNodeInfo> {
        val candidates = mutableListOf<AccessibilityNodeInfo>()

        // 从根节点开始深度优先遍历
        traverse(root) { node ->
            if (matches(selector, node)) {
                candidates.add(node)
            }
        }

        return candidates
    }

    // 判断节点是否匹配选择器条件
    private fun matches(selector: Selector, node: AccessibilityNodeInfo): Boolean {
        selector.conditions.forEach { condition ->
            when (condition) {
                is VidCondition -> {
                    if (node.viewIdResourceName != condition.value) return false
                }
                is TextCondition -> {
                    val text = node.text?.toString() ?: ""
                    when (condition.operator) {
                        "^" -> if (!text.startsWith(condition.value)) return false
                        "*" -> if (!text.contains(condition.value)) return false
                        "$" -> if (!text.endsWith(condition.value)) return false
                        "=" -> if (text != condition.value) return false
                    }
                }
            }
        }
        return true
    }
}
```

### 3. 规则引擎设计

#### 3.1 规则数据结构

```kotlin
// 规则定义
data class Rule(
    val id: String,
    val name: String,
    val priority: Int = 0,
    val match: MatchConfig,
    val action: ActionConfig
)

// 匹配配置
data class MatchConfig(
    val appId: String? = null,           // 目标应用包名
    val activity: String? = null,        // 目标 Activity
    val selector: String? = null,        // 触发条件选择器
    val delay: Long = 0                   // 延迟执行（毫秒）
)

// 动作配置
data class ActionConfig(
    val type: ActionType = ActionType.CLICK,
    val selector: String,                 // 目标节点选择器
    val repeat: Int = 1,                  // 重复次数
    val interval: Long = 1000             // 重复间隔
)

enum class ActionType {
    CLICK,       // 点击
    LONG_CLICK,  // 长按
    GLOBAL_CLICK // 全局坐标点击
}
```

#### 3.2 规则匹配引擎

```kotlin
class RuleEngine(private val service: AccessibilityService) {

    private val rules = mutableListOf<Rule>()

    fun loadRules(newRules: List<Rule>) {
        rules.clear()
        rules.addAll(newRules.sortedByDescending { it.priority })
    }

    // 处理无障碍事件
    fun onEvent(event: AccessibilityEvent) {
        val packageName = event.packageName?.toString() ?: return

        rules.forEach { rule ->
            if (shouldTrigger(rule, event, packageName)) {
                executeRule(rule, event)
            }
        }
    }

    // 判断规则是否应该触发
    private fun shouldTrigger(
        rule: Rule,
        event: AccessibilityEvent,
        packageName: String
    ): Boolean {
        // 检查应用包名
        if (rule.match.appId != null && rule.match.appId != packageName) {
            return false
        }

        // 检查 Activity 名称
        if (rule.match.activity != null) {
            val activityName = getCurrentActivityName(event)
            if (activityName != rule.match.activity) {
                return false
            }
        }

        // 检查触发条件
        if (rule.match.selector != null) {
            val nodes = findNodes(rule.match.selector)
            if (nodes.isEmpty()) {
                return false
            }
        }

        return true
    }

    // 执行规则动作
    private fun executeRule(rule: Rule, event: AccessibilityEvent) {
        // 延迟执行
        // 注意：AccessibilityNodeInfo 在事件结束后可能失效
        // 实际项目中应该使用 node.refresh() 或在延迟前保存节点的唯一标识
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            val targetNodes = findNodes(rule.action.selector)
            targetNodes.forEach { node ->
                when (rule.action.type) {
                    ActionType.CLICK -> node.click()
                    ActionType.LONG_CLICK -> node.longClick()
                }
            }
        }, rule.match.delay)
    }

    // 根据选择器查找节点
    private fun findNodes(selector: String): List<AccessibilityNodeInfo> {
        val root = service.rootInActiveWindow ?: return emptyList()
        return SelectorParser().evaluate(selector, root)
    }

    // 获取当前 Activity 名称
    private fun getCurrentActivityName(event: AccessibilityEvent): String? {
        // 通过 event.className 获取 Activity 名称
        return event.className?.toString()
    }
}
```

### 4. 节点操作封装

```kotlin
// AccessibilityNodeInfo 扩展函数
fun AccessibilityNodeInfo.click(): Boolean {
    // 当前节点可点击，直接执行
    if (isClickable) {
        return performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    // 向上遍历父节点，查找可点击的节点
    val clickableParent = generateSequence(parent) { it.parent }
        .firstOrNull { it.isClickable }
    return clickableParent?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        ?: false
}

fun AccessibilityNodeInfo.longClick(): Boolean {
    return performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK)
}

// 节点树遍历
fun AccessibilityNodeInfo.traverse(visitor: (AccessibilityNodeInfo) -> Unit) {
    visitor(this)
    for (i in 0 until childCount) {
        getChild(i)?.traverse(visitor)
    }
}

// 根据条件查找节点
fun AccessibilityNodeInfo.find(predicate: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
    if (predicate(this)) return this
    for (i in 0 until childCount) {
        val result = getChild(i)?.find(predicate)
        if (result != null) return result
    }
    return null
}

// 根据文字查找节点
fun AccessibilityNodeInfo.findByText(text: String): AccessibilityNodeInfo? {
    return find { it.text?.toString() == text }
}

// 根据 ID 查找节点
fun AccessibilityNodeInfo.findById(id: String): AccessibilityNodeInfo? {
    return find { it.viewIdResourceName == id }
}
```

### 5. 规则订阅系统

GKD 默认不提供任何规则，采用社区驱动的订阅模式：

- 用户可以编写本地规则
- 通过订阅链接获取远程规则
- 使用 `subscription-template` 快速构建个人订阅
- 在 GitHub Topics 下搜索 `gkd-subscription` 发现第三方订阅

---

## 手写一个简易版 GKD

下面我们实现一个最小可用版本的 GKD，核心功能包括：自动点击"跳过"按钮。

### 项目结构

```
SimpleGKD/
├── app/
│   ├── build.gradle.kts             # 构建配置
│   └── src/
│       └── main/
│           ├── java/com/example/simplegkd/
│           │   ├── SimpleGKDService.kt    # 无障碍服务
│           │   ├── RuleManager.kt          # 规则管理器
│           │   └── MainActivity.kt         # 主界面
│           ├── res/
│           │   ├── layout/
│           │   │   └── activity_main.xml   # 主界面布局
│           │   ├── values/
│           │   │   └── strings.xml         # 字符串资源
│           │   └── xml/
│           │       └── accessibility_service_config.xml
│           └── AndroidManifest.xml
```

### 1. 无障碍服务配置

**res/values/strings.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">SimpleGKD</string>
    <string name="accessibility_service_description">自动点击跳过按钮，简化您的操作流程</string>
</resources>
```

**res/xml/accessibility_service_config.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<accessibility-service
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/accessibility_service_description"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagReportViewIds|flagRetrieveInteractiveWindows"
    android:canRetrieveWindowContent="true"
    android:notificationTimeout="100"
    <!-- packageNames 为空时监听所有应用，实际使用时可指定目标应用包名 -->
    android:packageNames="com.example.app" />
```

### 2. 核心服务实现

**SimpleGKDService.kt**

```kotlin
package com.example.simplegkd

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class SimpleGKDService : AccessibilityService() {

    companion object {
        const val TAG = "SimpleGKD"
    }

    private lateinit var ruleManager: RuleManager

    override fun onServiceConnected() {
        super.onServiceConnected()
        // 初始化规则管理器
        ruleManager = RuleManager(this)
        ruleManager.loadDefaultRules()
        log("服务已启动，规则已加载")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                log("界面变化: ${event.packageName}")
                handleWindowChanged(event)
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                handleContentChanged(event)
            }
        }
    }

    private fun handleWindowChanged(event: AccessibilityEvent) {
        val packageName = event.packageName?.toString() ?: return
        val root = rootInActiveWindow ?: return
        ruleManager.matchAndExecute(packageName, root)
    }

    private fun handleContentChanged(event: AccessibilityEvent) {
        // 界面内容变化时也需要重新检查规则
        handleWindowChanged(event)
    }

    override fun onInterrupt() {
        log("服务被中断")
    }

    override fun onDestroy() {
        super.onDestroy()
        log("服务已销毁")
    }

    private fun log(message: String) {
        android.util.Log.d(TAG, message)
    }
}
```

### 3. 规则管理器

**RuleManager.kt**

```kotlin
package com.example.simplegkd

import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo

class RuleManager(private val service: SimpleGKDService) {

    // 规则列表
    private val rules = mutableListOf<ClickRule>()

    // 加载默认规则
    fun loadDefaultRules() {
        // 示例：跳过某应用的广告
        rules.add(ClickRule(
            targetApp = "com.example.app",
            targetText = "跳过",
            delayMs = 500
        ))

        // 示例：自动点击"同意"
        rules.add(ClickRule(
            targetApp = "com.example.app",
            targetText = "同意",
            delayMs = 300
        ))

        // 示例：根据 ID 点击
        rules.add(ClickRule(
            targetApp = "com.example.app",
            targetId = "com.example.app:id/btn_confirm",
            delayMs = 0
        ))
    }

    // 匹配并执行规则
    fun matchAndExecute(packageName: String, root: AccessibilityNodeInfo) {
        rules.forEach { rule ->
            if (rule.targetApp == packageName) {
                findAndClick(root, rule)
            }
        }
    }

    // 查找并点击目标节点
    private fun findAndClick(
        root: AccessibilityNodeInfo,
        rule: ClickRule
    ): Boolean {
        // 根据规则条件查找节点
        val targetNode = when {
            rule.targetText != null -> findByText(root, rule.targetText)
            rule.targetId != null -> findById(root, rule.targetId)
            else -> null
        } ?: return false

        // 延迟执行，避免界面未完全加载导致点击失效
        // 注意：targetNode 在延迟期间可能失效，实际项目需要重新查找节点
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            performClick(targetNode)
        }, rule.delayMs.toLong())

        return true
    }

    // 根据文字查找节点（广度优先搜索）
    private fun findByText(root: AccessibilityNodeInfo, text: String): AccessibilityNodeInfo? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)

        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()

            // 检查当前节点
            val nodeText = node.text?.toString()
            if (nodeText == text || nodeText?.contains(text) == true) {
                return node
            }

            // 添加子节点到队列
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }

    // 根据 ID 查找节点
    private fun findById(root: AccessibilityNodeInfo, id: String): AccessibilityNodeInfo? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)

        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()

            if (node.viewIdResourceName == id) {
                return node
            }

            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }

    // 执行点击
    private fun performClick(node: AccessibilityNodeInfo): Boolean {
        // 方式1：直接使用无障碍 API 点击
        if (node.isClickable) {
            return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        }

        // 方式2：向上遍历父节点，查找可点击的节点
        val clickableParent = generateSequence(node.parent) { it.parent }
            .firstOrNull { it.isClickable }
        if (clickableParent != null) {
            return clickableParent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        }

        // 方式3：使用坐标点击（最后的备选方案）
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        return clickAt(bounds.centerX().toFloat(), bounds.centerY().toFloat())
    }

    // 坐标点击（需要 API 24+）
    private fun clickAt(x: Float, y: Float): Boolean {
        val path = Path().apply {
            moveTo(x, y)
        }

        val gestureBuilder = GestureDescription.Builder()
        gestureBuilder.addStroke(GestureDescription.StrokeDescription(path, 0, 100))

        return service.dispatchGesture(gestureBuilder.build(), null, null)
    }
}

// 规则数据类
data class ClickRule(
    val targetApp: String,      // 目标应用包名
    val targetText: String? = null,   // 目标文字
    val targetId: String? = null,     // 目标 ID
    val delayMs: Int = 0        // 延迟毫秒
)
```

### 4. build.gradle 配置

**app/build.gradle.kts**

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.example.simplegkd"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.simplegkd"
        minSdk = 24
        targetSdk = 34
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
}
```

### 6. AndroidManifest 配置

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.simplegkd">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.SimpleGKD">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- 无障碍服务 -->
        <service
            android:name=".SimpleGKDService"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/accessibility_service_config" />
        </service>
    </application>
</manifest>
```

### 7. 主界面布局

**res/layout/activity_main.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center"
    android:padding="24dp">

    <TextView
        android:id="@+id/tv_status"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="服务未启用"
        android:textSize="18sp"
        android:layout_marginBottom="16dp"/>

    <Button
        android:id="@+id/btn_open_service"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="开启无障碍服务"/>

</LinearLayout>
```

### 8. 主界面（引导开启服务）

**MainActivity.kt**

```kotlin
package com.example.simplegkd

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val statusText = findViewById<TextView>(R.id.tv_status)
        val btnOpen = findViewById<Button>(R.id.btn_open_service)

        // 检查服务是否启用
        val isEnabled = isAccessibilityServiceEnabled()
        statusText.text = if (isEnabled) "服务已启用" else "服务未启用"

        btnOpen.setOnClickListener {
            // 打开无障碍设置页面
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            startActivity(intent)
        }
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val serviceName = "${packageName}/.${SimpleGKDService::class.simpleName}"
        val enabledServices = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )
        return enabledServices?.contains(serviceName) == true
    }
}
```

### 9. 使用说明

1. 安装应用后，打开 App
2. 点击"开启服务"按钮
3. 在无障碍设置中找到"SimpleGKD"并开启
4. 返回目标应用，规则将自动生效

### 10. 效果演示

```
目标应用启动 → 检测到"跳过"按钮 → 自动点击 → 广告关闭
```

### 11. 与完整版 GKD 的差距

| 功能 | 简易版 | 完整版 GKD |
|------|--------|------------|
| 基础点击 | ✅ | ✅ |
| 高级选择器 | ❌ | ✅ |
| 规则订阅 | ❌ | ✅ |
| 快照审查 | ❌ | ✅ |
| 规则编辑器 | ❌ | ✅ |
| 多规则优先级 | ❌ | ✅ |

---

## 总结

GKD 是一款设计精巧的 Android 自动化工具，它巧妙地利用了 Android 无障碍服务的 API，通过创新的选择器语法和社区驱动的规则订阅模式，为用户提供了一个强大且灵活的屏幕自动化解决方案。

通过本文的深度解析，我们了解到：
- AccessibilityService 是实现屏幕自动化的核心技术
- 类似 CSS 的选择器语法让规则编写更加灵活
- 规则引擎负责匹配、调度和执行自动化任务
- 简易版 GKD 用少量代码即可实现基础功能

无论是跳过广告还是简化操作流程，GKD 都能显著提升 Android 设备的使用体验。

## 参考资源

- [GKD 官方仓库](https://github.com/gkd-kit/gkd)
- [GKD 订阅模板](https://github.com/gkd-kit/subscription-template)
- [GKD 快照审查工具](https://github.com/gkd-kit/inspect)
- [Android 无障碍服务文档](https://developer.android.com/guide/topics/ui/accessibility/service)

---

*本文项目地址：[https://github.com/gkd-kit/gkd](https://github.com/gkd-kit/gkd)*

*许可证：GPL-3.0，仅供学习交流使用*
