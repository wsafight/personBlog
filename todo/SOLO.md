# 魔改 VS Code，打造类 Trae SOLO 模式的 AI 原生开发体验

> 当 AI 成为开发主角，IDE 的形态也该进化了。本文将带你一步步改造 VS Code，实现类似 Trae SOLO 模式的「纯对话驱动」开发体验。

## 一、什么是 Trae SOLO 模式？

Trae 是字节跳动推出的 AI 编程 IDE，其 SOLO 模式代表了一种全新的开发范式：**以 AI 为主导，开发者只需用自然语言描述需求，AI 自主完成从需求理解、代码生成、测试到部署的全流程**。

SOLO 模式的核心设计哲学：

- **对话即开发**：用户不再需要手动编写代码，通过自然语言对话驱动整个开发过程
- **三栏布局**：左侧任务管理、中央 AI 对话、右侧工具面板（终端/浏览器/文档预览）
- **代码退居二线**：传统的编辑器区域被弱化，代码变更以 Diff 视图形式展示
- **双角色模式**：SOLO Builder（从零构建）和 SOLO Coder（迭代优化）

简单来说，SOLO 模式把「写代码」变成了「说需求」，把 IDE 变成了一个以 AI 对话为核心的工作台。

## 二、为什么要在 VS Code 上实现？

你可能会问：直接用 Trae 不就完了？

理由很充分：

1. **生态优势**：VS Code 拥有最庞大的扩展生态，超过 5 万个扩展覆盖几乎所有开发场景
2. **定制自由**：开源、可 Fork、可深度改造
3. **习惯成本**：大多数开发者已经深度定制了自己的 VS Code 工作流
4. **模型自由**：你可以接入任何 LLM — Claude、GPT、DeepSeek、本地模型均可
5. **学习价值**：理解 IDE 架构本身就是一次极好的工程实践

## 三、实现思路概览

我将改造方案分为三个层次，从轻量到深度依次递进：

| 层次 | 方案 | 改动量 | 适合人群 |
|------|------|--------|----------|
| L1 | 布局调整 + 现有扩展组合 | 零代码 | 所有人 |
| L2 | 自定义 VS Code 扩展 | 中等 | 有扩展开发经验的开发者 |
| L3 | Fork VS Code 源码深度改造 | 大 | 硬核玩家 |

## 四、L1：零代码方案 — 布局调整 + 扩展组合

这是最简单的方案，10 分钟内就能获得一个「70% 相似度」的 SOLO 体验。

### 4.1 安装核心扩展

你需要一个强力的 AI 对话扩展，推荐以下任一：

- **Cline**（原 Claude Dev）：支持自主执行终端命令、读写文件、浏览器操作
- **Roo Code**（基于 Cline 二次开发）：支持多角色模式（Code/Architect/Ask）
- **Continue**：开源 AI 代码助手，支持多模型切换

以 Cline 为例，它已经具备了 SOLO 模式的核心能力：自主读写文件、执行终端命令、查看浏览器截图、自动修复 Bug。

### 4.2 调整布局

核心思路：**把 AI 对话面板最大化，弱化传统编辑器区域**。

#### settings.json 配置

```jsonc
{
  // 隐藏传统编辑器 UI 元素
  "workbench.editor.showTabs": "none",
  "editor.minimap.enabled": false,
  "breadcrumbs.enabled": false,
  "editor.glyphMargin": false,
  "editor.folding": false,
  "editor.lineNumbers": "off",

  // 面板位置调整 — 将面板移到右侧，模拟 SOLO 的三栏布局
  "workbench.panel.defaultLocation": "right",

  // 活动栏移到顶部，节省水平空间
  "workbench.activityBar.location": "top",

  // 启动时不打开编辑器
  "workbench.startupEditor": "none",

  // 终端相关
  "terminal.integrated.defaultLocation": "view",
}
```

#### 快捷键配置（keybindings.json）

创建一个一键进入「SOLO 模式」的快捷键：

```jsonc
[
  {
    // Cmd+Shift+S 一键进入 SOLO 模式
    "key": "cmd+shift+s",
    "command": "runCommands",
    "args": {
      "commands": [
        "workbench.action.closeAllEditors",
        "workbench.action.closeSidebar",
        "workbench.action.togglePanel",
        // 聚焦到 Cline 视图（根据你使用的扩展调整）
        "cline.focusClineView"
      ]
    }
  },
  {
    // Cmd+Shift+E 一键退回传统模式
    "key": "cmd+shift+e",
    "command": "runCommands",
    "args": {
      "commands": [
        "workbench.action.toggleSidebarVisibility",
        "workbench.action.togglePanel"
      ]
    }
  }
]
```

### 4.3 效果

经过这些调整，你的 VS Code 会变成：
- 主界面被 AI 对话窗口占据
- 右侧面板放终端，用于查看 AI 执行命令的输出
- 不再有传统代码编辑器干扰视线
- 一键切换「SOLO 模式」和「传统模式」

## 五、L2：自定义扩展 — 打造真正的 SOLO 体验

如果 L1 方案不够用，我们可以开发一个自定义扩展，用 Webview 实现一个完整的 SOLO 界面。

### 5.1 项目初始化

```bash
# 安装脚手架
npm install -g yo generator-code

# 创建扩展项目
yo code

# 选择:
# ? What type of extension do you want to create? New Extension (TypeScript)
# ? What's the name of your extension? vscode-solo-mode
```

### 5.2 核心架构

```
vscode-solo-mode/
├── src/
│   ├── extension.ts          # 扩展入口
│   ├── soloPanel.ts          # SOLO 主面板（Webview）
│   ├── taskManager.ts        # 任务管理器
│   ├── aiService.ts          # AI 服务层
│   ├── terminalManager.ts    # 终端管理
│   └── webview/
│       ├── index.html         # SOLO 主界面
│       ├── styles.css         # 样式
│       └── main.js            # 前端逻辑
├── package.json
└── tsconfig.json
```

### 5.3 扩展入口 — extension.ts

```typescript
import * as vscode from 'vscode';
import { SoloPanel } from './soloPanel';

export function activate(context: vscode.ExtensionContext) {
  // 注册 SOLO 模式切换命令
  const toggleSolo = vscode.commands.registerCommand(
    'solo.toggle',
    () => {
      SoloPanel.createOrShow(context.extensionUri);
    }
  );

  // 注册 SOLO Builder 命令
  const soloBuilder = vscode.commands.registerCommand(
    'solo.builder',
    () => {
      SoloPanel.createOrShow(context.extensionUri, 'builder');
    }
  );

  // 注册 SOLO Coder 命令
  const soloCoder = vscode.commands.registerCommand(
    'solo.coder',
    () => {
      SoloPanel.createOrShow(context.extensionUri, 'coder');
    }
  );

  context.subscriptions.push(toggleSolo, soloBuilder, soloCoder);
}
```

### 5.4 SOLO 主面板 — soloPanel.ts

```typescript
import * as vscode from 'vscode';

export class SoloPanel {
  public static currentPanel: SoloPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    mode: 'builder' | 'coder' = 'coder'
  ) {
    // 关闭所有编辑器，进入 SOLO 模式
    vscode.commands.executeCommand('workbench.action.closeAllEditors');
    vscode.commands.executeCommand('workbench.action.closeSidebar');

    const column = vscode.ViewColumn.One;

    if (SoloPanel.currentPanel) {
      SoloPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'soloMode',
      `SOLO ${mode === 'builder' ? 'Builder' : 'Coder'}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'src', 'webview'),
        ],
      }
    );

    SoloPanel.currentPanel = new SoloPanel(panel, extensionUri, mode);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    mode: 'builder' | 'coder'
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtmlContent(mode);

    // 处理来自 Webview 的消息
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'chat':
            await this._handleChat(message.text);
            break;
          case 'runTerminal':
            await this._runTerminalCommand(message.command);
            break;
          case 'openFile':
            await this._openFileDiff(message.filePath);
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private async _handleChat(userMessage: string) {
    // 调用 AI 服务
    // 这里可以接入任何 LLM API
    this._panel.webview.postMessage({
      type: 'chatResponse',
      content: '正在处理你的需求...',
      status: 'thinking',
    });

    // 实际的 AI 调用逻辑
    const response = await this._callAI(userMessage);

    this._panel.webview.postMessage({
      type: 'chatResponse',
      content: response,
      status: 'done',
    });
  }

  private async _callAI(prompt: string): Promise<string> {
    // 在这里接入你的 LLM
    // 示例：调用 Claude API
    const apiKey = vscode.workspace
      .getConfiguration('solo')
      .get<string>('apiKey');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    return data.content[0].text;
  }

  private async _runTerminalCommand(cmd: string) {
    const terminal =
      vscode.window.activeTerminal ||
      vscode.window.createTerminal('SOLO Terminal');
    terminal.show();
    terminal.sendText(cmd);
  }

  private async _openFileDiff(filePath: string) {
    // 以 Diff 视图打开文件变更
    const uri = vscode.Uri.file(filePath);
    await vscode.commands.executeCommand('vscode.diff', uri, uri, 'SOLO Diff');
  }

  private _getHtmlContent(mode: string): string {
    return /*html*/ `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SOLO Mode</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
          height: 100vh;
          display: flex;
          flex-direction: column;
        }

        /* 顶部模式栏 */
        .mode-bar {
          display: flex;
          align-items: center;
          padding: 8px 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
          gap: 12px;
        }

        .mode-badge {
          background: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .mode-title {
          font-size: 14px;
          font-weight: 600;
        }

        /* 三栏布局 */
        .main-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        /* 左侧：任务面板 */
        .task-panel {
          width: 240px;
          border-right: 1px solid var(--vscode-panel-border);
          padding: 12px;
          overflow-y: auto;
        }

        .task-panel h3 {
          font-size: 12px;
          text-transform: uppercase;
          color: var(--vscode-descriptionForeground);
          margin-bottom: 12px;
          letter-spacing: 0.5px;
        }

        .task-item {
          padding: 8px 12px;
          margin-bottom: 4px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .task-item:hover {
          background: var(--vscode-list-hoverBackground);
        }

        .task-item.active {
          background: var(--vscode-list-activeSelectionBackground);
          color: var(--vscode-list-activeSelectionForeground);
        }

        .task-status {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .task-status.running { background: #f59e0b; animation: pulse 1.5s infinite; }
        .task-status.done { background: #22c55e; }
        .task-status.pending { background: #6b7280; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        /* 中央：对话区域 */
        .chat-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .message {
          max-width: 85%;
          margin-bottom: 16px;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.6;
        }

        .message.user {
          margin-left: auto;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border-bottom-right-radius: 4px;
        }

        .message.assistant {
          margin-right: auto;
          background: var(--vscode-editorWidget-background);
          border: 1px solid var(--vscode-editorWidget-border);
          border-bottom-left-radius: 4px;
        }

        .message .thinking {
          color: var(--vscode-descriptionForeground);
          font-style: italic;
        }

        /* Diff 展示区 */
        .diff-block {
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 8px;
          margin: 8px 0;
          overflow: hidden;
        }

        .diff-header {
          padding: 6px 12px;
          background: var(--vscode-editorGroupHeader-tabsBackground);
          font-size: 12px;
          display: flex;
          justify-content: space-between;
        }

        .diff-content {
          padding: 8px 12px;
          font-family: 'Fira Code', 'Cascadia Code', monospace;
          font-size: 13px;
          white-space: pre-wrap;
        }

        .diff-add { color: #22c55e; }
        .diff-del { color: #ef4444; text-decoration: line-through; }

        /* 输入区域 */
        .chat-input-area {
          padding: 16px 20px;
          border-top: 1px solid var(--vscode-panel-border);
        }

        .input-wrapper {
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }

        .chat-input {
          flex: 1;
          padding: 10px 16px;
          border-radius: 12px;
          border: 1px solid var(--vscode-input-border);
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          font-size: 14px;
          resize: none;
          min-height: 44px;
          max-height: 120px;
          font-family: inherit;
          outline: none;
        }

        .chat-input:focus {
          border-color: var(--vscode-focusBorder);
        }

        .send-btn {
          padding: 10px 20px;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          border-radius: 12px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
        }

        .send-btn:hover {
          background: var(--vscode-button-hoverBackground);
        }

        /* 右侧：工具面板 */
        .tool-panel {
          width: 320px;
          border-left: 1px solid var(--vscode-panel-border);
          display: flex;
          flex-direction: column;
        }

        .tool-tabs {
          display: flex;
          border-bottom: 1px solid var(--vscode-panel-border);
        }

        .tool-tab {
          flex: 1;
          padding: 8px;
          text-align: center;
          cursor: pointer;
          font-size: 12px;
          border-bottom: 2px solid transparent;
          color: var(--vscode-descriptionForeground);
        }

        .tool-tab.active {
          color: var(--vscode-foreground);
          border-bottom-color: var(--vscode-focusBorder);
        }

        .tool-content {
          flex: 1;
          overflow: auto;
          padding: 12px;
        }

        .file-change {
          display: flex;
          align-items: center;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          gap: 8px;
        }

        .file-change:hover {
          background: var(--vscode-list-hoverBackground);
        }

        .file-badge {
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 3px;
          font-weight: 600;
        }

        .file-badge.modified { background: #854d0e22; color: #f59e0b; }
        .file-badge.added { background: #14532d22; color: #22c55e; }
        .file-badge.deleted { background: #7f1d1d22; color: #ef4444; }
      </style>
    </head>
    <body>
      <div class="mode-bar">
        <span class="mode-badge">SOLO</span>
        <span class="mode-title">${mode === 'builder' ? 'Builder' : 'Coder'} Mode</span>
      </div>

      <div class="main-layout">
        <!-- 左侧：任务面板 -->
        <div class="task-panel">
          <h3>Tasks</h3>
          <div id="taskList">
            <div class="task-item active">
              <span class="task-status running"></span>
              <span>New conversation</span>
            </div>
          </div>
        </div>

        <!-- 中央：对话区域 -->
        <div class="chat-panel">
          <div class="chat-messages" id="chatMessages">
            <div class="message assistant">
              <p>Hi! I'm your SOLO ${mode === 'builder' ? 'Builder' : 'Coder'}.</p>
              <p style="margin-top: 8px;">
                ${
                  mode === 'builder'
                    ? 'Describe what you want to build, and I will handle everything — from project setup to deployment.'
                    : 'Open a project folder and tell me what you need. I can fix bugs, add features, or refactor code.'
                }
              </p>
            </div>
          </div>

          <div class="chat-input-area">
            <div class="input-wrapper">
              <textarea
                class="chat-input"
                id="chatInput"
                placeholder="Describe your requirements..."
                rows="1"
              ></textarea>
              <button class="send-btn" id="sendBtn">Send</button>
            </div>
          </div>
        </div>

        <!-- 右侧：工具面板 -->
        <div class="tool-panel">
          <div class="tool-tabs">
            <div class="tool-tab active" data-tab="changes">Changes</div>
            <div class="tool-tab" data-tab="terminal">Terminal</div>
            <div class="tool-tab" data-tab="preview">Preview</div>
          </div>
          <div class="tool-content" id="toolContent">
            <p style="color: var(--vscode-descriptionForeground); font-size: 13px;">
              File changes will appear here as the AI works.
            </p>
          </div>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        const chatMessages = document.getElementById('chatMessages');

        // 自动调整输入框高度
        chatInput.addEventListener('input', function () {
          this.style.height = 'auto';
          this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        // 发送消息
        function sendMessage() {
          const text = chatInput.value.trim();
          if (!text) return;

          // 添加用户消息
          appendMessage('user', text);
          chatInput.value = '';
          chatInput.style.height = 'auto';

          // 发送给扩展
          vscode.postMessage({ command: 'chat', text });
        }

        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        });

        // 添加消息到对话区
        function appendMessage(role, content) {
          const div = document.createElement('div');
          div.className = 'message ' + role;
          div.innerHTML = content;
          chatMessages.appendChild(div);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        // 接收扩展消息
        window.addEventListener('message', (event) => {
          const msg = event.data;
          if (msg.type === 'chatResponse') {
            appendMessage('assistant', msg.content);
          }
          if (msg.type === 'fileChanges') {
            renderFileChanges(msg.changes);
          }
        });

        // 渲染文件变更列表
        function renderFileChanges(changes) {
          const toolContent = document.getElementById('toolContent');
          toolContent.innerHTML = changes
            .map(
              (c) =>
                '<div class="file-change">' +
                '<span class="file-badge ' + c.type + '">' + c.type[0].toUpperCase() + '</span>' +
                '<span>' + c.path + '</span>' +
                '</div>'
            )
            .join('');
        }

        // Tab 切换
        document.querySelectorAll('.tool-tab').forEach((tab) => {
          tab.addEventListener('click', () => {
            document.querySelectorAll('.tool-tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
          });
        });
      </script>
    </body>
    </html>
    `;
  }

  public dispose() {
    SoloPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}
```

### 5.5 package.json 配置

```json
{
  "name": "vscode-solo-mode",
  "displayName": "SOLO Mode",
  "description": "AI-driven Solo development mode for VS Code",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "solo.toggle",
        "title": "SOLO: Toggle Solo Mode"
      },
      {
        "command": "solo.builder",
        "title": "SOLO: Start Builder Mode"
      },
      {
        "command": "solo.coder",
        "title": "SOLO: Start Coder Mode"
      }
    ],
    "keybindings": [
      {
        "command": "solo.toggle",
        "key": "ctrl+shift+s",
        "mac": "cmd+shift+s"
      }
    ],
    "configuration": {
      "title": "SOLO Mode",
      "properties": {
        "solo.apiKey": {
          "type": "string",
          "default": "",
          "description": "API Key for the LLM service"
        },
        "solo.model": {
          "type": "string",
          "default": "claude-sonnet-4-5-20250929",
          "enum": [
            "claude-sonnet-4-5-20250929",
            "claude-opus-4-6",
            "gpt-4o",
            "deepseek-chat"
          ],
          "description": "AI model to use"
        },
        "solo.apiEndpoint": {
          "type": "string",
          "default": "https://api.anthropic.com/v1/messages",
          "description": "Custom API endpoint"
        }
      }
    }
  }
}
```

### 5.6 增强：实现 AI 自主执行能力

SOLO 模式的灵魂在于 AI 能自主执行操作。以下是让 AI 具备「自主行动」能力的关键实现：

```typescript
// taskManager.ts — 任务拆解与自主执行

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'error';
  subtasks: Task[];
}

export class TaskManager {
  private tasks: Task[] = [];
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  // AI 生成的计划 -> 可执行任务
  parsePlan(aiPlan: string): Task[] {
    // 解析 AI 返回的开发计划，拆解为具体任务
    const lines = aiPlan.split('\n').filter((l) => l.match(/^\d+\./));
    return lines.map((line, i) => ({
      id: `task-${i}`,
      title: line.replace(/^\d+\.\s*/, ''),
      status: 'pending' as const,
      subtasks: [],
    }));
  }

  // 自主执行文件操作
  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.workspaceRoot, filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  // 自主执行终端命令
  async runCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(
        cmd,
        { cwd: this.workspaceRoot, timeout: 30000 },
        (error: Error | null, stdout: string, stderr: string) => {
          if (error) reject(new Error(stderr || error.message));
          else resolve(stdout);
        }
      );
    });
  }

  // 获取项目上下文（帮助 AI 理解项目结构）
  async getProjectContext(): Promise<string> {
    const files = await vscode.workspace.findFiles(
      '**/*.{ts,js,py,go,rs,java}',
      '**/node_modules/**',
      50
    );
    const tree = files.map((f) =>
      path.relative(this.workspaceRoot, f.fsPath)
    );
    return `Project files:\n${tree.join('\n')}`;
  }
}
```

## 六、L3：Fork 源码 — 终极深度改造

如果你想做到 Trae SOLO 级别的一体化体验，需要 Fork VS Code 源码。

### 6.1 前置准备

```bash
# 克隆 VS Code 源码
git clone https://github.com/microsoft/vscode.git
cd vscode

# 安装依赖
yarn

# 编译
yarn watch

# 运行
./scripts/code.sh
```

### 6.2 关键改造点

VS Code 的工作台布局核心在 `src/vs/workbench/browser/layout.ts`，以下是需要改造的关键模块：

#### (1) 新增 SOLO 布局模式

在 `src/vs/workbench/browser/layout.ts` 中添加 SOLO 布局逻辑：

```typescript
// 在 Layout 类中添加 SOLO 模式切换
private _soloModeEnabled = false;

toggleSoloMode(): void {
  this._soloModeEnabled = !this._soloModeEnabled;

  if (this._soloModeEnabled) {
    // 隐藏编辑器组区域
    this.setEditorAreaVisible(false);
    // 隐藏侧边栏
    this.setSideBarHidden(true);
    // 将 SOLO Panel 最大化
    this.setPanelHidden(false);
    this.setPanelPosition(Position.LEFT);
    // 调整面板尺寸为全宽
    this.resizePanel(this.workbenchDimensions.width * 0.7);
  } else {
    // 恢复正常布局
    this.setEditorAreaVisible(true);
    this.setSideBarHidden(false);
    this.restoreDefaultLayout();
  }
}
```

#### (2) 注册 SOLO 视图容器

在 `src/vs/workbench/contrib/` 下新建 `solo/` 目录：

```
src/vs/workbench/contrib/solo/
├── browser/
│   ├── solo.contribution.ts   # 注册贡献点
│   ├── soloView.ts            # SOLO 主视图
│   ├── soloChat.ts            # 对话组件
│   ├── soloTaskList.ts        # 任务列表组件
│   └── media/
│       └── solo.css           # 样式
├── common/
│   ├── solo.ts                # 常量定义
│   └── soloService.ts         # SOLO 服务接口
└── node/
    └── soloAIService.ts       # AI 后端服务
```

#### (3) 注册到工作台

在 `solo.contribution.ts` 中注册 SOLO 模式：

```typescript
import { Registry } from 'vs/platform/registry/common/platform';
import {
  Extensions as ViewContainerExtensions,
  IViewContainersRegistry,
  ViewContainerLocation,
} from 'vs/workbench/common/views';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { SoloViewPane } from './soloView';

// 注册 SOLO 视图容器
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(
  ViewContainerExtensions.ViewContainersRegistry
).registerViewContainer(
  {
    id: 'workbench.view.solo',
    title: 'SOLO',
    order: 0,
    ctorDescriptor: new SyncDescriptor(SoloViewPane),
    icon: soloIcon,
    storageId: 'workbench.view.solo',
  },
  ViewContainerLocation.Panel
);

// 注册 SOLO 模式切换命令
registerAction2(
  class extends Action2 {
    constructor() {
      super({
        id: 'workbench.action.toggleSoloMode',
        title: 'Toggle SOLO Mode',
        f1: true,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
        },
      });
    }

    run(accessor: ServicesAccessor): void {
      const layoutService = accessor.get(IWorkbenchLayoutService);
      layoutService.toggleSoloMode();
    }
  }
);
```

### 6.3 品牌定制

修改以下文件完成品牌替换：

```
product.json                          # 产品名称、图标
src/vs/workbench/browser/media/       # UI 图标资源
resources/linux/code.png              # 应用图标
resources/darwin/code.icns            # macOS 图标
resources/win32/code.ico              # Windows 图标
```

### 6.4 构建分发

```bash
# 构建生产版本
yarn gulp vscode-darwin-arm64       # macOS Apple Silicon
yarn gulp vscode-darwin-x64         # macOS Intel
yarn gulp vscode-linux-x64          # Linux
yarn gulp vscode-win32-x64-archive  # Windows
```

## 七、进阶：让 SOLO 模式具备真正的自主能力

不管选择哪个层次的方案，核心价值在于以下几个能力的实现深度：

### 7.1 上下文工程（Context Engineering）

SOLO 模式的精髓是 Context Engineering — 让 AI 在每次对话中都拥有足够的上下文：

```typescript
// 构建完整上下文
async function buildContext(workspace: string): Promise<string> {
  const parts: string[] = [];

  // 1. 项目结构
  parts.push('## Project Structure');
  parts.push(await getFileTree(workspace, 3));

  // 2. 关键配置文件
  const configs = ['package.json', 'tsconfig.json', '.env.example'];
  for (const config of configs) {
    const content = await safeReadFile(path.join(workspace, config));
    if (content) {
      parts.push(`## ${config}\n\`\`\`\n${content}\n\`\`\``);
    }
  }

  // 3. 最近的 Git 变更
  parts.push('## Recent Changes');
  parts.push(await execCommand('git log --oneline -10', workspace));

  // 4. 当前错误信息（如果有）
  const diagnostics = vscode.languages.getDiagnostics();
  if (diagnostics.length > 0) {
    parts.push('## Current Errors');
    for (const [uri, diags] of diagnostics) {
      for (const d of diags) {
        if (d.severity === vscode.DiagnosticSeverity.Error) {
          parts.push(`- ${uri.fsPath}:${d.range.start.line}: ${d.message}`);
        }
      }
    }
  }

  return parts.join('\n\n');
}
```

### 7.2 Tool Use — 让 AI 调用工具

现代 LLM 支持 Tool Use（Function Calling），这是实现自主执行的关键：

```typescript
const tools = [
  {
    name: 'write_file',
    description: 'Create or overwrite a file',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a file content',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for files matching a pattern',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern' },
      },
      required: ['pattern'],
    },
  },
];

// AI Agentic Loop
async function agentLoop(userMessage: string, context: string) {
  let messages = [
    { role: 'user', content: `${context}\n\nUser request: ${userMessage}` },
  ];

  while (true) {
    const response = await callLLM(messages, tools);

    if (response.stop_reason === 'end_turn') {
      // AI 完成任务，返回最终回复
      return response.content;
    }

    if (response.stop_reason === 'tool_use') {
      // AI 请求使用工具
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }
  }
}
```

### 7.3 SubAgent — 多任务并行

模拟 Trae 的 SubAgent 能力，实现任务级别的并行：

```typescript
class SubAgentManager {
  private agents: Map<string, AgentWorker> = new Map();

  // 启动一个子 Agent
  async spawn(taskId: string, task: string, context: string): Promise<void> {
    const agent = new AgentWorker(taskId, task, context);
    this.agents.set(taskId, agent);
    agent.start(); // 非阻塞
  }

  // 并行执行多个子任务
  async parallel(
    tasks: Array<{ id: string; task: string }>
  ): Promise<Map<string, string>> {
    const context = await buildContext(this.workspace);
    const promises = tasks.map((t) =>
      this.spawn(t.id, t.task, context).then(() => this.waitFor(t.id))
    );
    const results = await Promise.allSettled(promises);
    // 汇总结果...
    return this.collectResults(results);
  }
}
```

## 八、方案对比与选型建议

| 维度 | L1 布局调整 | L2 自定义扩展 | L3 Fork 源码 |
|------|------------|-------------|-------------|
| 开发时间 | 10 分钟 | 1-2 周 | 1-3 个月 |
| 还原度 | 70% | 85% | 95%+ |
| 可维护性 | 高 | 中 | 低（需跟进上游更新） |
| AI 自主能力 | 依赖第三方扩展 | 可自定义 | 完全自定义 |
| 扩展兼容性 | 完全兼容 | 完全兼容 | 完全兼容 |
| 隐藏功能 | 仅设置级别 | 有限控制 | 源码级完全控制 |
| 内置插件 | 不可能 | 不可能 | 完全支持 |
| 开箱即用 | 需手动配置 | 需安装扩展 | 用户零配置 |
| 适合场景 | 个人尝鲜 | 团队内部工具 | 打造产品级 IDE |

**我的建议**：

- **大多数人选 L1** — 安装 Cline/Roo Code + 调整布局，5 分钟获得 80% 的体验
- **想深入定制选 L2** — 开发扩展，掌控 AI 调用逻辑和 UI 设计
- **想做产品选 L3** — 但要做好长期维护的心理准备，Cursor、Trae、Windsurf 走的都是这条路

## 九、产品级定制：隐藏功能 + 内置插件，开箱即用

如果你的目标不只是自己用，而是**打包成一个产品直接交给用户** — 用户打开就是 SOLO 模式，不需要自己装插件、调设置 — 那么你需要做两件事：**隐藏不需要的 VS Code 功能**和**将插件预装到发行包中**。

这是 Cursor、Windsurf、Trae 们都在做的事。完全可行，以下是详细做法。

### 9.1 隐藏不需要的功能

SOLO 模式下，传统 IDE 的很多功能对用户来说是噪音。你可以通过三个层次来裁剪：

#### (1) product.json — 产品级开关

`product.json` 是 VS Code 的产品配置文件，控制着大量功能的开关。Fork 后直接修改根目录的 `product.json`：

```jsonc
{
  // 产品基本信息 — 换上你自己的品牌
  "nameShort": "SoloCode",
  "nameLong": "SoloCode - AI Native IDE",
  "applicationName": "solocode",
  "dataFolderName": ".solocode",
  "urlProtocol": "solocode",

  // 关闭遥测
  "enableTelemetry": false,

  // 关闭实验性功能推送
  "experimentsUrl": "",

  // 扩展市场 — 指向 Open VSX（或你自己的私有市场）
  "extensionsGallery": {
    "serviceUrl": "https://open-vsx.org/vscode/gallery",
    "itemUrl": "https://open-vsx.org/vscode/item",
    "resourceUrlTemplate": "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}"
  },

  // 也可以完全禁用扩展市场，让用户无法自行安装额外扩展
  // "extensionsGallery": {}

  // 预装扩展的 Proposed API 白名单
  "extensionEnabledApiProposals": {
    "your-publisher.solo-mode": [
      "terminalDataWriteEvent",
      "fileSearchProvider",
      "textSearchProvider"
    ]
  },

  // 配置默认设置（用户首次启动时生效）
  "configurationDefaults": {
    "workbench.startupEditor": "none",
    "workbench.editor.showTabs": "none",
    "workbench.activityBar.location": "top",
    "workbench.panel.defaultLocation": "right",
    "editor.minimap.enabled": false,
    "breadcrumbs.enabled": false,
    "editor.lineNumbers": "off",
    "editor.glyphMargin": false,
    "editor.folding": false,
    "window.menuBarVisibility": "compact",
    "terminal.integrated.defaultLocation": "view"
  }
}
```

#### (2) 源码级移除 — 彻底删掉不需要的模块

在 `src/vs/workbench/contrib/` 目录下，每个子文件夹都是一个工作台贡献模块。你可以直接删除或注释掉不需要的模块注册：

```typescript
// src/vs/workbench/contrib/contributions.ts（或类似的注册入口文件）
// 注释掉你不需要的模块

// import './welcomeGettingStarted/browser/gettingStarted.contribution';  // 欢迎页
// import './surveys/browser/ces.contribution';                           // 调查问卷
// import './releasenotes/browser/releasenotes.contribution';             // 更新日志
// import './extensions/browser/extensions.contribution';                 // 扩展市场界面（如果不想让用户装插件）
// import './update/browser/update.contribution';                         // 自动更新
// import './feedback/browser/feedback.contribution';                     // 反馈
// import './welcomeBanner/browser/welcomeBanner.contribution';           // 欢迎横幅

// 保留你需要的
import './terminal/browser/terminal.contribution';                        // 终端
import './files/browser/files.contribution';                              // 文件浏览
import './search/browser/search.contribution';                            // 搜索
import './scm/browser/scm.contribution';                                  // Git
```

#### (3) 菜单栏精简 — 隐藏不相关的菜单项

修改菜单注册文件，移除 SOLO 模式下不需要的菜单入口：

```typescript
// src/vs/workbench/browser/actions/windowActions.ts
// 或者通过 when 条件控制菜单显隐

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: '1_new',
  command: { id: 'solo.newTask', title: 'New SOLO Task' },
  order: 1,
  // 只在 SOLO 模式下显示
  when: ContextKeyExpr.equals('config.solo.enabled', true),
});
```

你也可以通过自定义 `when` 上下文来批量控制菜单项的可见性：

```typescript
// 注册自定义上下文
const soloModeContext = new RawContextKey<boolean>('soloMode', false);

// 在已有的菜单注册中添加 when 条件来隐藏
// 例如，隐藏 "Run" 菜单下的传统调试选项
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
  // ...原有配置
  when: ContextKeyExpr.equals('soloMode', false), // SOLO 模式下隐藏
});
```

#### (4) 隐藏活动栏中不需要的图标

```typescript
// 通过 viewsRegistry 控制哪些视图容器在活动栏可见
// 在你的 solo.contribution.ts 中

// 设置默认隐藏的视图
configurationRegistry.registerConfiguration({
  id: 'solo',
  properties: {
    'workbench.view.extensions.visible': {
      type: 'boolean',
      default: false, // 默认隐藏扩展市场
    },
    'workbench.view.debug.visible': {
      type: 'boolean',
      default: false, // 默认隐藏调试面板
    },
  },
});
```

### 9.2 内置插件 — 让扩展随产品一起分发

VS Code 有两种方式内置扩展：**源码内置**和**构建时下载**。

#### 方式一：源码内置（推荐）

直接把扩展代码放到 VS Code 源码的 `extensions/` 目录中：

```bash
# VS Code 源码的 extensions/ 目录结构
vscode/
├── extensions/
│   ├── css-language-features/       # 内置：CSS 语言支持
│   ├── typescript-language-features/ # 内置：TypeScript 支持
│   ├── git/                          # 内置：Git 集成
│   ├── markdown-language-features/   # 内置：Markdown 预览
│   │
│   │   # ↓↓↓ 添加你的自定义扩展 ↓↓↓
│   ├── solo-mode/                    # 新增：SOLO 模式核心
│   │   ├── package.json
│   │   ├── package.nls.json
│   │   ├── src/
│   │   │   └── extension.ts
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── solo-ai-provider/             # 新增：AI 模型接入层
│   │   ├── package.json
│   │   └── src/
│   │       └── extension.ts
│   │
│   └── solo-browser-preview/         # 新增：内置浏览器预览
│       ├── package.json
│       └── src/
│           └── extension.ts
```

扩展的 `package.json` 需要添加内置标记：

```jsonc
// extensions/solo-mode/package.json
{
  "name": "solo-mode",
  "displayName": "SOLO Mode",
  "description": "AI-driven development mode",
  "version": "1.0.0",
  "publisher": "solocode",
  "engines": { "vscode": "*" },
  // 关键：标记为内置扩展
  "isBuiltin": true,
  // 随 VS Code 一起激活，无需用户手动启用
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      { "command": "solo.toggle", "title": "Toggle SOLO Mode" }
    ],
    "menus": {
      "commandPalette": [
        { "command": "solo.toggle", "group": "navigation" }
      ]
    },
    "configuration": {
      "title": "SOLO Mode",
      "properties": {
        "solo.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable SOLO Mode on startup"
        }
      }
    }
  }
}
```

这些扩展会随 `yarn watch` 自动编译，随构建产物一起打包分发。

#### 方式二：构建时自动下载（适合第三方扩展）

通过 `product.json` 的 `builtInExtensions` 字段，指定构建时自动从远程下载并打包的扩展：

```jsonc
// product.json
{
  "builtInExtensions": [
    // 从 Open VSX 或你自己的服务器下载
    {
      "name": "continue.continue",
      "version": "0.9.230",
      "repo": "https://github.com/continuedev/continue",
      "metadata": {
        "id": "continue.continue",
        "publisherId": "continue",
        "publisherDisplayName": "Continue"
      }
    },
    {
      "name": "esbenp.prettier-vscode",
      "version": "11.0.0",
      "repo": "https://github.com/prettier/prettier-vscode",
      "metadata": {
        "id": "esbenp.prettier-vscode",
        "publisherId": "esbenp",
        "publisherDisplayName": "Prettier"
      }
    }
  ]
}
```

构建过程中，gulp 脚本会自动拉取这些扩展并放入产物中。

#### 方式三：安装脚本预装 .vsix 文件（最灵活）

如果你有打包好的 `.vsix` 文件，可以在构建后通过脚本预装：

```bash
#!/bin/bash
# scripts/install-bundled-extensions.sh
# 构建完成后执行，将 .vsix 扩展预装到产物中

EXTENSIONS_DIR="./bundled-extensions"
PRODUCT_DIR="./out/SoloCode-darwin-arm64/SoloCode.app/Contents/Resources/app/extensions"

# 准备好的 .vsix 文件列表
EXTENSIONS=(
  "solo-mode-1.0.0.vsix"
  "solo-ai-provider-1.0.0.vsix"
  "solo-browser-preview-1.0.0.vsix"
  "prettier-11.0.0.vsix"
  "gitlens-16.0.0.vsix"
)

for ext in "${EXTENSIONS[@]}"; do
  echo "Installing $ext..."
  # 解压 vsix（本质是 zip 包）到 extensions 目录
  EXTRACT_DIR="$PRODUCT_DIR/$(basename "$ext" .vsix)"
  mkdir -p "$EXTRACT_DIR"
  unzip -q "$EXTENSIONS_DIR/$ext" -d "$EXTRACT_DIR"
  # 移动 extension/ 子目录的内容到根目录
  mv "$EXTRACT_DIR/extension/"* "$EXTRACT_DIR/" 2>/dev/null
  rm -rf "$EXTRACT_DIR/extension" "$EXTRACT_DIR/\[Content_Types\].xml"
done

echo "All extensions installed."
```

### 9.3 完整示例：从 Fork 到交付的 build pipeline

把以上所有步骤串起来，一个完整的构建流程如下：

```bash
#!/bin/bash
# build-solocode.sh — 一键构建 SoloCode 发行版

set -e

echo "=== Step 1: Clone & Patch ==="
git clone --depth 1 https://github.com/microsoft/vscode.git solocode
cd solocode

# 应用品牌补丁
cp ../patches/product.json ./product.json
cp ../patches/icon.icns ./resources/darwin/code.icns

echo "=== Step 2: 复制内置扩展 ==="
cp -r ../extensions/solo-mode ./extensions/solo-mode
cp -r ../extensions/solo-ai-provider ./extensions/solo-ai-provider
cp -r ../extensions/solo-browser-preview ./extensions/solo-browser-preview

echo "=== Step 3: 移除不需要的内置扩展 ==="
# 移除对 SOLO 模式无用的内置扩展（可选，减小包体积）
rm -rf extensions/vb/                    # VB 语言支持
rm -rf extensions/coffeescript/          # CoffeeScript
rm -rf extensions/fsharp/               # F#
rm -rf extensions/groovy/               # Groovy
rm -rf extensions/hlsl/                 # HLSL
rm -rf extensions/log/                  # Log 文件
rm -rf extensions/bat/                  # Batch 文件
rm -rf extensions/clojure/              # Clojure
rm -rf extensions/latex/                # LaTeX

echo "=== Step 4: 裁剪工作台模块 ==="
# 通过 sed 注释掉不需要的 workbench 贡献模块
# （实际操作中建议用 patch 文件管理，这里简化演示）
# sed -i '' 's|import.*welcomeGettingStarted.*|// &|' \
#   src/vs/workbench/contrib/contributions.ts

echo "=== Step 5: 安装依赖 & 编译 ==="
yarn install
yarn compile

echo "=== Step 6: 构建产物 ==="
yarn gulp vscode-darwin-arm64

echo "=== Step 7: 预装第三方 .vsix 扩展 ==="
bash ../scripts/install-bundled-extensions.sh

echo "=== Done! ==="
echo "产物位于: ./out/SoloCode-darwin-arm64/"
```

### 9.4 控制用户能看到什么

除了技术层面的裁剪，你还需要在体验层面做控制：

```jsonc
// product.json — configurationDefaults 完整版
{
  "configurationDefaults": {
    // === 首次启动体验 ===
    "workbench.startupEditor": "none",              // 不打开欢迎页
    "workbench.tips.enabled": false,                 // 关闭使用提示
    "workbench.enableExperiments": false,             // 关闭实验性功能

    // === 编辑器区域极简化 ===
    "workbench.editor.showTabs": "none",             // 隐藏标签栏
    "editor.minimap.enabled": false,                 // 隐藏小地图
    "editor.lineNumbers": "off",                     // 隐藏行号
    "editor.glyphMargin": false,                     // 隐藏装饰边距
    "editor.folding": false,                         // 隐藏折叠控件
    "breadcrumbs.enabled": false,                    // 隐藏面包屑
    "editor.renderWhitespace": "none",               // 不显示空白字符
    "editor.scrollbar.vertical": "hidden",           // 隐藏垂直滚动条
    "editor.overviewRulerBorder": false,             // 隐藏概览标尺边框

    // === 布局 ===
    "workbench.activityBar.location": "top",         // 活动栏顶部
    "workbench.panel.defaultLocation": "right",      // 面板在右侧
    "window.menuBarVisibility": "compact",           // 菜单栏紧凑模式
    "workbench.statusBar.visible": true,             // 保留状态栏（显示 AI 状态）

    // === 自动保存 ===
    "files.autoSave": "afterDelay",
    "files.autoSaveDelay": 1000,

    // === 扩展管理 ===
    "extensions.autoUpdate": false,                  // 不自动更新扩展
    "extensions.ignoreRecommendations": true,        // 不推荐扩展

    // === SOLO 模式专属 ===
    "solo.enabled": true,                            // 默认启用 SOLO 模式
    "solo.autoStartOnLaunch": true,                  // 启动时自动进入 SOLO 模式
    "solo.model": "claude-sonnet-4-5-20250929"       // 默认模型
  }
}
```

### 9.5 禁止用户安装扩展（可选）

如果你想做一个完全封闭的产品（像 Trae 一样，用户不需要也不应该自行安装扩展），有几种方式：

```jsonc
// product.json — 方式一：删除扩展市场配置
{
  // 不配置 extensionsGallery，用户将看不到扩展市场
  // "extensionsGallery": {}   // 注释掉或留空
}
```

```typescript
// 方式二：源码中禁用扩展视图
// src/vs/workbench/contrib/extensions/browser/extensions.contribution.ts
// 在注册视图容器时添加条件判断

if (!product.soloModeOnly) {
  // 只有非 SOLO-only 模式才注册扩展市场视图
  registerExtensionsViewContainer();
}
```

```typescript
// 方式三：禁用 VSIX 安装命令
CommandsRegistry.registerCommand('workbench.extensions.installExtension', () => {
  // 覆盖原有命令，改为提示信息
  vscode.window.showInformationMessage(
    'SoloCode manages extensions automatically. No manual installation needed.'
  );
});
```

### 9.6 架构全景图

最终，一个完整的「SoloCode」发行版的架构如下：

```
SoloCode (VS Code Fork)
│
├── product.json                         ← 品牌 / 市场 / 默认配置
│
├── extensions/                          ← 内置扩展（随产品分发）
│   ├── solo-mode/                       ← 核心：SOLO 模式 UI + AI 对话
│   ├── solo-ai-provider/                ← AI 模型接入（Claude/GPT/DeepSeek）
│   ├── solo-browser-preview/            ← 内置浏览器预览
│   ├── solo-deploy/                     ← 一键部署（Vercel/Netlify）
│   ├── git/                             ← 保留：Git 支持
│   ├── typescript-language-features/    ← 保留：TS 语言支持
│   └── ...                              ← 保留所需的语言支持
│
├── src/vs/workbench/
│   ├── browser/layout.ts                ← 修改：新增 SOLO 布局模式
│   └── contrib/
│       ├── solo/                        ← 新增：SOLO 工作台贡献
│       ├── welcomeGettingStarted/       ← 移除或替换
│       ├── extensions/                  ← 可选移除（封闭产品）
│       └── ...
│
└── 构建产物
    └── SoloCode.app / SoloCode.exe
        ├── 内置扩展（无需安装）
        ├── 预设配置（开箱即用）
        └── 精简 UI（无噪音）
```

**用户拿到手的就是一个干净的、AI 优先的 IDE，打开即用，无需任何配置。**

## 十、总结

Trae SOLO 模式的本质不是什么新技术，而是一次 **交互范式的转变**：

> 开发者的角色从「代码的编写者」变成了「需求的描述者」和「成果的审查者」。

这种转变的底层驱动力是 LLM 能力的飞速进步 — 当 AI 能够可靠地理解需求、生成代码、执行命令、修复 Bug 时，传统的「代码编辑器为中心」的 IDE 形态自然需要进化。

通过本文的方案，你可以根据自己的需求和技术投入，在 VS Code 上实现不同深度的 SOLO 体验：

- **L1（零代码）**：10 分钟布局调整，70% 体验
- **L2（自定义扩展）**：1-2 周开发，85% 体验
- **L3（Fork 源码）**：深度改造 + 隐藏功能 + 内置插件，95%+ 体验，开箱即用

尤其是第九章的「隐藏功能 + 内置插件」方案，可以让你直接打包一个**用户无需任何配置就能使用的 AI 原生 IDE** — 这正是 Cursor、Trae、Windsurf 们走过的路。

**代码的未来不是写得更快，而是不用写。**

---

*参考资料：*
- [Trae SOLO 模式官方文档](https://docs.trae.ai/ide/solo-mode?_lang=zh)
- [VS Code Extension API - Webview](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Source Code Organization](https://github.com/microsoft/vscode/wiki/Source-Code-Organization)
- [VS Code Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout)
- [VSCodium Extensions & API Configuration](https://deepwiki.com/VSCodium/vscodium/6.3-extensions-and-api-configuration)
- [Eclipse Theia - VS Code Built-in Extensions](https://github.com/eclipse-theia/vscode-builtin-extensions)
- [Is Forking VS Code a Good Idea?](https://eclipsesource.com/blogs/2024/12/17/is-it-a-good-idea-to-fork-vs-code/)
