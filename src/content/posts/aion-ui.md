---
title: AionUi：构建跨平台 AI 工作台的技术实践
published: 2026-01-22
description: 深入解析 AionUi 开源项目的技术架构、核心功能实现、性能优化策略与安全设计。涵盖 Electron 多进程架构、React 前端、SQLite 数据持久化、多 AI 引擎支持、MCP 协议集成等企业级实践。
tags: [AionUi, Electron, React, AI工作台, TypeScript, SQLite, 跨平台]
category: 开源项目
draft: false
---

## 项目概述

AionUi 是一个开源的跨平台桌面应用，旨在为多个 AI 命令行工具提供统一的图形界面和工作平台。它解决了传统 CLI AI 工具交互体验差、缺乏可视化、难以管理历史对话等痛点，为开发者和普通用户提供了一个现代化的 AI 交互环境。

### 核心价值

- **多 AI 引擎支持**：集成 Google Gemini、Claude Code、OpenAI、本地模型等 8+ AI 引擎
- **开箱即用**：内置完整的 Gemini CLI 实现，无需额外安装配置
- **数据本地化**：所有对话保存到本地 SQLite 数据库，保障数据隐私和安全
- **跨平台体验**：原生支持 macOS、Windows、Linux 三大平台
- **Web 远程访问**：支持通过浏览器远程访问，适配移动设备

---

## 技术架构

### 1. 技术栈选型

AionUi 采用了现代化的前端技术栈，兼顾性能、开发体验和用户体验：

| 技术领域 | 选型 | 版本 | 选型理由 |
|---------|-----|------|---------|
| **桌面框架** | Electron | 37.3.1 | 跨平台桌面应用的事实标准 |
| **前端框架** | React | 19.1.0 | 最新版本，性能优化显著 |
| **UI 组件库** | Arco Design | 2.66.1 | 字节跳动企业级组件库，设计精美 |
| **原子 CSS** | UnoCSS | 0.66.3 | 高性能、可定制的原子 CSS 引擎 |
| **语言** | TypeScript | 5.8.3 | 强类型保证代码质量 |
| **路由** | React Router | 7.8.0 | React 生态最成熟的路由方案 |
| **数据库** | better-sqlite3 | 12.4.1 | 高性能同步 SQLite 库 |
| **代码编辑器** | Monaco Editor | 4.7.0 | VS Code 同款编辑器内核 |
| **构建工具** | Electron Forge | 7.8.1 | 现代化 Electron 应用构建工具链 |

### 2. 多进程架构设计

AionUi 采用 Electron 典型的多进程架构，充分利用多核 CPU 性能：

```
┌─────────────────────────────────────────────────────┐
│              主进程 (Main Process)                    │
├─────────────────────────────────────────────────────┤
│  • Electron 应用生命周期管理                          │
│  • better-sqlite3 数据库引擎                          │
│  • Express Web 服务器 (WebUI 模式)                    │
│  • WebSocket 实时通信服务                             │
│  • IPC 通信桥接层                                     │
│  • MCP (Model Context Protocol) 服务                 │
└─────────────────────────────────────────────────────┘
                        ↕ IPC
┌─────────────────────────────────────────────────────┐
│            渲染进程 (Renderer Process)                │
├─────────────────────────────────────────────────────┤
│  • React 19 应用                                      │
│  • React Router 7 路由系统                            │
│  • Context API 状态管理                               │
│  • 自定义 Hooks 业务逻辑层                             │
│  • Monaco Editor / CodeMirror 编辑器                  │
│  • Arco Design UI 组件                                │
└─────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────┐
│               Web Worker 线程                         │
├─────────────────────────────────────────────────────┤
│  • 后台任务处理                                        │
│  • 大文件解析                                          │
│  • 计算密集型操作                                      │
└─────────────────────────────────────────────────────┘
```

**设计亮点：**

1. **主进程承担重型任务**：数据库操作、文件 I/O、系统调用都在主进程完成，避免阻塞 UI 渲染
2. **渲染进程专注 UI**：只处理 React 组件渲染和用户交互，保证界面流畅
3. **Worker 处理耗时操作**：文档解析、图像处理等放到 Worker，进一步优化主线程性能

### 3. 模块化代码组织

项目采用了清晰的模块化结构，403+ TypeScript 文件按功能域划分：

```
src/
├── agent/              # AI Agent 适配器层
│   ├── gemini/        # Google Gemini CLI 完整实现
│   ├── codex/         # Claude Code 适配器
│   └── acp/           # 通用 ACP 协议适配器
├── renderer/          # React 前端应用
│   ├── components/    # 可复用组件库
│   ├── pages/         # 页面级组件
│   ├── hooks/         # 自定义 Hooks
│   ├── context/       # 全局状态管理
│   └── i18n/          # 国际化资源
├── process/           # Electron 主进程
│   ├── database/      # SQLite 数据持久化
│   ├── services/      # 主进程服务
│   └── bridge/        # IPC 通信桥接
├── webserver/         # Web 服务器 (WebUI 模式)
│   ├── routes/        # Express 路由
│   ├── auth/          # JWT 认证系统
│   └── websocket/     # WebSocket 实时通信
└── common/            # 跨进程共享代码
    ├── types/         # TypeScript 类型定义
    └── utils/         # 工具函数库
```

**最佳实践体现：**

- **关注点分离**：UI、业务逻辑、数据访问三层清晰分离
- **代码复用**：`common/` 目录存放跨进程共享代码，避免重复
- **类型安全**：严格的 TypeScript 配置 (`noImplicitAny: true`)，强制类型标注

---

## 核心功能实现

### 1. 多 AI 引擎适配系统

AionUi 最大的技术挑战之一是支持多个异构的 AI 引擎。项目通过**适配器模式**优雅地解决了这个问题：

#### 通用 ACP 协议

AionUi 定义了一套 **Agent CLI Protocol (ACP)**，作为统一的抽象层：

```typescript
// 简化示例
interface AgentAdapter {
  initialize(): Promise<void>;
  sendMessage(message: string): AsyncIterator<StreamChunk>;
  abort(): void;
  getConfig(): AgentConfig;
}
```

#### 内置 Gemini CLI 实现

项目最大的亮点是**内置了完整的 Gemini CLI 实现**，这意味着：

- 用户无需单独安装 Google 官方 CLI 工具
- 应用启动即可直接使用 Gemini 模型
- 减少了环境配置的复杂度

技术实现上，`src/agent/gemini/` 目录实现了：
- Gemini API 客户端封装
- 流式响应处理
- 上下文记忆管理
- 图像生成和识别功能

#### 动态适配器加载

应用启动时会自动检测本地已安装的 AI CLI 工具：

```typescript
// 伪代码示例
async function detectAvailableAgents() {
  const agents = [];

  // 内置 Gemini 始终可用
  agents.push({ name: 'gemini', type: 'builtin' });

  // 检测 Claude Code
  if (await commandExists('codex')) {
    agents.push({ name: 'codex', type: 'external' });
  }

  // 检测 Ollama
  if (await commandExists('ollama')) {
    agents.push({ name: 'ollama', type: 'local' });
  }

  return agents;
}
```

### 2. 智能文件管理系统

AionUi 提供了类似 IDE 的文件管理能力，核心实现在 `src/renderer/pages/conversation/workspace/` 目录。

#### 技术架构

```
workspace/
├── index.tsx                    # 容器组件 (550 行)
├── hooks/                       # 业务逻辑 Hooks
│   ├── useWorkspaceTree.ts     # 树结构管理
│   ├── useFileOperations.ts    # 文件操作
│   ├── useDragAndDrop.ts       # 拖拽功能
│   ├── useFilePreview.ts       # 预览逻辑
│   └── useAIIntegration.ts     # AI 驱动功能
├── utils/
│   ├── treeOperations.ts       # 树算法 (搜索、遍历、过滤)
│   └── fileUtils.ts            # 文件工具函数
└── types.ts                     # TypeScript 类型定义
```

这种**容器组件 + Hooks + 工具函数**的三层架构是 React 最佳实践的典范：

1. **容器组件**：只负责组装 UI 和协调子组件
2. **Hooks**：封装可复用的业务逻辑（有状态）
3. **工具函数**：纯函数，无副作用，易于测试

#### 核心功能

**虚拟文件树**：
- 支持大规模文件目录（10000+ 文件）
- 懒加载和虚拟滚动优化性能
- 实时搜索和过滤

**拖拽操作**：
```typescript
// 使用 HTML5 Drag & Drop API
function useDragAndDrop() {
  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);

    // 批量导入文件
    await importFiles(files);

    // 通知 AI 有新文件加入
    await notifyAI({ type: 'files_added', files });
  };

  return { handleDrop };
}
```

**AI 驱动的文件组织**：
- 自动分类和标签
- 智能文件合并和拆分
- 代码重构建议

### 3. 强大的文件预览系统

预览系统支持 **9+ 文件格式**，是 AionUi 的另一个技术亮点。

#### 支持的格式

| 格式 | 渲染引擎 | 特性 |
|-----|---------|------|
| **Markdown** | React Markdown + KaTeX | 数学公式、代码高亮、实时编辑 |
| **PDF** | PDF.js | 缩放、搜索、分页导航 |
| **Word** | mammoth.js | 保留样式、图片、表格 |
| **Excel** | SheetJS | 多工作表、公式显示 |
| **PPT** | pptx2json + 自定义渲染 | 幻灯片预览、动画效果 |
| **代码** | Monaco Editor | 语法高亮、智能补全、格式化 |
| **图片** | 原生 `<img>` + sharp | 缩放、裁剪、格式转换 |
| **HTML** | iframe 沙箱 | 隔离执行、安全渲染 |
| **Diff** | react-diff-view | 行级对比、语法高亮 |

#### 实时编辑和同步

Markdown 和代码文件支持**实时编辑**，技术实现：

```typescript
function useRealtimePreview(filePath: string) {
  const [content, setContent] = useState('');

  // 监听文件变化
  useEffect(() => {
    const watcher = fs.watch(filePath, async () => {
      const newContent = await fs.readFile(filePath, 'utf-8');
      setContent(newContent);
    });

    return () => watcher.close();
  }, [filePath]);

  // 防抖保存
  const debouncedSave = useMemo(
    () => debounce(async (newContent: string) => {
      await fs.writeFile(filePath, newContent);
    }, 500),
    [filePath]
  );

  return { content, setContent: debouncedSave };
}
```

### 4. 数据持久化与数据库设计

AionUi 使用 **better-sqlite3** 作为本地数据库，存储所有对话历史和应用状态。

#### 为什么选择 better-sqlite3？

相比其他数据库方案的优势：

| 特性 | better-sqlite3 | electron-store | IndexedDB |
|-----|---------------|----------------|-----------|
| **同步 API** | ✅ | ✅ | ❌ (异步) |
| **SQL 查询** | ✅ | ❌ | ❌ |
| **性能** | 极高 | 中 | 中 |
| **事务支持** | ✅ | ❌ | ✅ |
| **全文搜索** | ✅ (FTS5) | ❌ | ❌ |

#### 数据库结构

```sql
-- 会话表
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  agent_type TEXT,  -- 'gemini' | 'codex' | 'ollama'...
  workspace_id TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- 消息表
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  role TEXT,  -- 'user' | 'assistant' | 'system'
  content TEXT,
  metadata JSON,  -- 存储附加信息（图片、文件等）
  created_at INTEGER,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- 工作空间表
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT,
  root_path TEXT,
  file_tree JSON,  -- 缓存文件树结构
  created_at INTEGER
);

-- 全文搜索索引
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content=messages,
  content_rowid=id
);
```

#### WAL 模式性能优化

AionUi 启用了 SQLite 的 **WAL (Write-Ahead Logging)** 模式：

```typescript
const db = new Database('aionui.db');
db.pragma('journal_mode = WAL');  // 启用 WAL 模式
db.pragma('synchronous = NORMAL'); // 平衡性能和安全性
```

WAL 模式的优势：
- **并发性能提升**：读操作不阻塞写操作
- **崩溃恢复**：更好的数据完整性保证
- **写入性能**：减少磁盘 I/O 操作

### 5. WebUI 远程访问模式

除了桌面应用，AionUi 还支持通过 **浏览器远程访问**，这对移动设备和多设备协作非常有用。

#### 启动 WebUI 模式

```bash
# 本地访问（仅限 127.0.0.1）
aionui --webui

# 局域网访问（允许其他设备连接）
aionui --webui --remote
```

#### 技术实现

WebUI 模式基于 **Express + WebSocket** 实现：

```typescript
// 简化示例
import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
const wss = new WebSocketServer({ noServer: true });

// 静态资源服务（React 构建产物）
app.use(express.static('dist/renderer'));

// API 路由
app.use('/api/conversations', conversationRouter);
app.use('/api/messages', messageRouter);

// WebSocket 升级
server.on('upgrade', (request, socket, head) => {
  authenticate(request, (err, client) => {
    if (err) return socket.destroy();

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, client);
    });
  });
});
```

#### JWT 认证系统

WebUI 模式使用 **JWT Token** 进行身份验证：

```typescript
// 登录接口
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  // 验证用户名密码（存储在 SQLite）
  const user = await db.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // 生成 JWT Token
  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token });
});

// 认证中间件
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}
```

#### 移动设备支持

WebUI 模式特别优化了移动端体验：

- **响应式布局**：基于 Arco Design 的移动端适配
- **触摸优化**：支持滑动、长按等手势
- **PWA 支持**：可以安装到手机主屏幕
- **Termux 支持**：可以在 Android Termux 环境运行

### 6. MCP (Model Context Protocol) 集成

AionUi 支持 Anthropic 提出的 **MCP 协议**，允许 AI 模型访问外部工具和服务。

#### MCP 架构

```
┌──────────────┐
│  AI Model    │
└──────┬───────┘
       │ MCP Protocol
┌──────▼───────┐
│ MCP Server   │  ← AionUi 作为 MCP 客户端
├──────────────┤
│ • File Tool  │
│ • Web Tool   │
│ • API Tool   │
└──────────────┘
```

#### 工具调用示例

```typescript
// MCP 工具定义
const fileReadTool = {
  name: 'read_file',
  description: 'Read content from a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' }
    },
    required: ['path']
  },
  handler: async ({ path }) => {
    return await fs.readFile(path, 'utf-8');
  }
};

// AI 模型调用工具
const response = await model.sendMessage('Read the README.md file');
// AI 返回：需要调用 read_file 工具
const result = await mcpClient.callTool('read_file', {
  path: './README.md'
});
```

---

## 国际化与主题系统

### 国际化实现

AionUi 支持 **5 种语言**：英语、简体中文、繁体中文、日语、韩语。

技术栈：**i18next + React i18next**

```typescript
// i18n 配置
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: require('./locales/en.json') },
      'zh-CN': { translation: require('./locales/zh-CN.json') },
      'zh-TW': { translation: require('./locales/zh-TW.json') },
      ja: { translation: require('./locales/ja.json') },
      ko: { translation: require('./locales/ko.json') }
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false }
  });

// 使用方式
function Component() {
  const { t } = useTranslation();
  return <Button>{t('common.save')}</Button>;
}
```

### 主题系统

AionUi 使用 **UnoCSS + CSS 变量** 实现动态主题：

```css
/* 亮色主题 */
:root {
  --color-primary: #165dff;
  --color-bg: #ffffff;
  --color-text: #1d2129;
}

/* 暗色主题 */
[data-theme='dark'] {
  --color-primary: #3c7eff;
  --color-bg: #17171a;
  --color-text: #e5e6eb;
}
```

切换主题只需修改 `data-theme` 属性：

```typescript
function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    setTheme(newTheme);
  };

  return <Button onClick={toggleTheme}>Toggle Theme</Button>;
}
```

---

## 开发工具链与代码质量

### 代码规范工具

AionUi 使用严格的代码质量工具链：

```json
{
  "scripts": {
    "lint": "eslint src/ --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx,json}\"",
    "type-check": "tsc --noEmit"
  }
}
```

#### ESLint 规则

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

#### Git Hooks (Husky + lint-staged)

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write",
      "git add"
    ]
  }
}
```

这确保了每次提交的代码都经过：
1. **ESLint 检查**：修复常见错误
2. **Prettier 格式化**：统一代码风格
3. **TypeScript 类型检查**：避免类型错误

### 测试框架

AionUi 使用 **Jest** 进行单元测试：

```typescript
// 示例测试
describe('WorkspaceTree', () => {
  it('should filter files by search term', () => {
    const tree = createTreeFromFiles([
      { path: '/src/index.ts' },
      { path: '/src/utils.ts' },
      { path: '/test/index.test.ts' }
    ]);

    const filtered = filterTree(tree, 'utils');

    expect(filtered).toHaveLength(1);
    expect(filtered[0].path).toBe('/src/utils.ts');
  });
});
```

测试覆盖关键模块：
- 文件树操作算法
- 数据库 CRUD 操作
- MCP 工具调用
- 认证和权限逻辑

### 持续集成 (CI/CD)

项目使用 **GitHub Actions** 进行自动化构建和测试：

```yaml
name: Build and Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run lint
      - run: npm run type-check
      - run: npm test

  build:
    needs: test
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: npm run package
```

---

## 性能优化实践

### 1. React 性能优化

#### 虚拟列表渲染

对于大量消息历史，使用虚拟滚动（react-window）：

```typescript
import { FixedSizeList } from 'react-window';

function MessageList({ messages }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      <MessageItem message={messages[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={messages.length}
      itemSize={80}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

性能提升：
- **渲染时间**：从 1000ms 降至 50ms（1000 条消息）
- **内存占用**：减少 80%

#### React.memo 和 useMemo

```typescript
// 避免不必要的重新渲染
const MessageItem = React.memo(({ message }) => {
  return <div>{message.content}</div>;
}, (prevProps, nextProps) => {
  return prevProps.message.id === nextProps.message.id;
});

// 缓存昂贵计算
function ConversationView({ messages }) {
  const stats = useMemo(() => {
    return calculateMessageStats(messages);
  }, [messages]);

  return <div>Total tokens: {stats.tokens}</div>;
}
```

### 2. 数据库性能优化

#### 索引优化

```sql
-- 为常用查询字段创建索引
CREATE INDEX idx_messages_conversation_id
  ON messages(conversation_id);

CREATE INDEX idx_conversations_updated_at
  ON conversations(updated_at DESC);

-- 组合索引
CREATE INDEX idx_messages_conversation_created
  ON messages(conversation_id, created_at);
```

#### 查询优化

使用预编译语句（Prepared Statements）：

```typescript
// ❌ 不好：每次都重新解析 SQL
function getMessages(conversationId: string) {
  return db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = '${conversationId}'
  `).all();
}

// ✅ 好：预编译 + 参数绑定
const getMessagesStmt = db.prepare(`
  SELECT * FROM messages
  WHERE conversation_id = ?
  ORDER BY created_at
`);

function getMessages(conversationId: string) {
  return getMessagesStmt.all(conversationId);
}
```

性能提升：**3-5 倍查询速度**

### 3. Electron 性能优化

#### 主进程优化

- **异步化**：主进程中耗时操作使用异步 API
- **进程间通信优化**：减少 IPC 调用次数，批量传输数据
- **内存管理**：及时释放不用的资源

```typescript
// ❌ 不好：频繁 IPC 调用
for (const file of files) {
  await ipcRenderer.invoke('read-file', file.path);
}

// ✅ 好：批量读取
const contents = await ipcRenderer.invoke('read-files',
  files.map(f => f.path)
);
```

#### 渲染进程优化

- **代码分割**：使用动态 import 按需加载
- **懒加载路由**：React Router 的 lazy 组件

```typescript
import { lazy, Suspense } from 'react';

const ConversationPage = lazy(() =>
  import('./pages/conversation')
);

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/conversation" element={<ConversationPage />} />
      </Routes>
    </Suspense>
  );
}
```

---

## 安全性设计

### 1. XSS 防护

- **React 自动转义**：默认防止 XSS 攻击
- **dangerouslySetInnerHTML 审计**：仅在必要时使用，且输入经过消毒

```typescript
import DOMPurify from 'dompurify';

function SafeHTML({ html }) {
  const sanitized = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

### 2. SQL 注入防护

- **使用预编译语句**：never 直接拼接 SQL
- **参数绑定**：所有用户输入通过占位符传递

### 3. 文件访问控制

- **路径遍历防护**：验证文件路径合法性

```typescript
import path from 'path';

function readFile(userPath: string) {
  const safePath = path.normalize(userPath);

  // 检查是否在允许的目录内
  if (!safePath.startsWith(workspaceRoot)) {
    throw new Error('Access denied');
  }

  return fs.readFileSync(safePath);
}
```

### 4. WebUI 安全

- **HTTPS 强制**：生产环境要求 HTTPS
- **CSRF 防护**：使用 CSRF Token
- **CORS 限制**：只允许特定域名访问
- **速率限制**：防止暴力破解

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100 // 最多 100 次请求
});

app.use('/api/', limiter);
```

---

## 构建与发布

### 多平台打包

使用 **Electron Builder** 打包多平台应用：

```json
{
  "build": {
    "appId": "com.aionui.app",
    "productName": "AionUi",
    "files": [
      "dist/**/*",
      "node_modules/**/*",
      "package.json"
    ],
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.developer-tools",
      "icon": "build/icon.icns"
    },
    "win": {
      "target": ["nsis", "portable"],
      "icon": "build/icon.ico"
    },
    "linux": {
      "target": ["AppImage", "deb", "rpm"],
      "category": "Development"
    }
  }
}
```

### 自动更新

使用 **electron-updater** 实现自动更新：

```typescript
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'A new version is available. Download now?'
  });
});
```

---

## 项目亮点总结

### 技术层面

1. **现代化技术栈**：React 19、TypeScript 5.8、Electron 37
2. **清晰的架构设计**：多进程、模块化、关注点分离
3. **高性能优化**：虚拟列表、数据库索引、预编译语句
4. **完善的工程化**：ESLint、Prettier、Husky、Jest、CI/CD
5. **类型安全**：严格的 TypeScript 配置，全面的类型覆盖

### 功能层面

1. **多 AI 引擎支持**：Gemini、Claude、OpenAI、Ollama 等
2. **内置 Gemini CLI**：开箱即用，无需额外配置
3. **强大的文件管理**：IDE 级别的文件操作和预览
4. **数据本地化**：SQLite 保障隐私和安全
5. **WebUI 远程访问**：跨设备、移动端支持

### 用户体验

1. **现代化 UI**：Arco Design 高颜值组件库
2. **国际化**：5 种语言支持
3. **主题系统**：深色/浅色模式
4. **性能流畅**：虚拟滚动、懒加载优化
5. **安全可靠**：完善的安全防护机制

---

## 适用场景

AionUi 适合以下用户和场景：

### 开发者

- 需要与 AI 协作编程的开发者
- 希望管理多个 AI 会话的用户
- 需要可视化文件管理的程序员
- 对数据隐私有要求的用户

### 团队协作

- 远程团队通过 WebUI 模式共享 AI 会话
- 项目文档和代码的集中管理
- AI 辅助的代码审查和重构

### 教育和学习

- 编程学习者与 AI 互动学习
- 教师演示 AI 辅助编程
- 学生练习代码和项目开发

---

## 与竞品对比

| 特性 | AionUi | Claude Cowork | VS Code + AI 插件 | Cursor |
|-----|--------|---------------|------------------|--------|
| **开源** | ✅ Apache-2.0 | ❌ 闭源 | ✅ MIT | ❌ 闭源 |
| **跨平台** | ✅ Mac/Win/Linux | ❌ macOS 仅 | ✅ 全平台 | ✅ 全平台 |
| **多模型支持** | ✅ 8+ 模型 | ❌ Claude 仅 | ✅ 插件支持 | ⚠️ 有限 |
| **内置 CLI** | ✅ Gemini | ❌ | ❌ | ❌ |
| **数据本地化** | ✅ SQLite | ❌ 云端 | ✅ 本地 | ⚠️ 部分云端 |
| **WebUI 访问** | ✅ | ❌ | ❌ | ❌ |
| **成本** | ✅ 免费 | ❌ $100/月 | ✅ 免费 | ⚠️ $20/月 |
| **文件预览** | ✅ 9+ 格式 | ⚠️ 有限 | ✅ 插件支持 | ✅ |
| **MCP 支持** | ✅ | ⚠️ 未知 | ❌ | ❌ |

**核心优势：**
- **完全开源免费**，无订阅费用
- **数据完全本地化**，保障隐私
- **内置 Gemini CLI**，开箱即用
- **WebUI 远程访问**，跨设备支持
- **多 AI 引擎**，灵活选择

---

## 未来展望

根据项目的技术架构和社区需求，AionUi 未来可能的发展方向：

### 短期计划

1. **插件系统**：支持第三方插件扩展功能
2. **更多模型支持**：集成更多本地和云端模型
3. **协作功能**：多人实时协作编辑
4. **移动端 App**：原生 iOS/Android 应用

### 长期愿景

1. **AI Agent 市场**：用户可分享和下载自定义 Agent
2. **企业版本**：团队管理、权限控制、审计日志
3. **云端同步**：可选的云端数据同步（保持本地优先）
4. **AI 工作流**：可视化编排 AI 任务流程

---

## 如何贡献

AionUi 是 Apache-2.0 开源项目，欢迎社区贡献：

### 参与方式

1. **提交 Issue**：报告 Bug 或提出功能建议
2. **Pull Request**：提交代码改进或新功能
3. **文档翻译**：帮助翻译文档到更多语言
4. **社区推广**：分享项目给更多开发者

### 开发环境搭建

```bash
# 克隆仓库
git clone https://github.com/aionui/aionui.git
cd aionui

# 安装依赖
npm install

# 启动开发模式
npm run dev

# 运行测试
npm test

# 构建应用
npm run build
npm run package
```

---

## 总结

AionUi 是一个**技术先进、功能完善、架构清晰**的开源 AI 工作台项目。它通过以下技术特点解决了 CLI AI 工具的痛点：

1. **统一界面**：为多个 AI 工具提供一致的图形界面
2. **本地优先**：数据安全可控，完全离线可用
3. **现代化架构**：React 19 + Electron 37 + TypeScript 5.8
4. **高性能**：虚拟滚动、数据库优化、代码分割
5. **可扩展**：MCP 协议、插件系统、WebUI 模式

对于开发者而言，AionUi 的代码质量和架构设计值得学习和借鉴：

- **模块化组织**：清晰的目录结构和职责划分
- **最佳实践**：Hooks、容器组件、工具函数三层架构
- **工程化**：完善的 Lint、Test、CI/CD 流程
- **性能优化**：虚拟列表、预编译语句、懒加载
- **安全设计**：XSS/SQL 注入防护、认证授权系统

无论是作为日常使用的 AI 工具，还是作为学习 Electron + React 的参考项目，AionUi 都是一个值得关注的优秀开源作品。

