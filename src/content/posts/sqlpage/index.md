---
title: SQL 语句构建网页工具 SQLPage
published: 2025-09-30
description: SQLPage 是一个革新性的 SQL-only 网页应用构建工具，让你仅用 SQL 语句就能快速创建交互式数据应用。
tags: [后端, 快速开发]
category: Web服务
draft: false
---

## SQLPage 简介

### 什么是 SQLPage？

SQLPage 是一个革新性的 SQL-only 网页应用构建工具，它允许开发者通过简单的 SQL 查询语句来创建功能丰富的交互式网站。<mcreference link="https://github.com/sqlpage/SQLPage" index="0">0</mcreference>

与传统的 Web 开发不同，SQLPage 让你无需掌握 JavaScript、HTML 或 CSS，只需专注于 SQL 查询，就能将数据库中的数据转化为美观、实用的用户界面。

### 核心价值与特点

SQLPage 的核心价值在于简化数据应用的开发流程，主要特点包括：

- **SQL 优先**：完全使用 SQL 语句构建应用，无需学习额外的前端技术
- **快速开发**：几行 SQL 代码即可创建功能完善的页面
- **组件化设计**：提供丰富的预定义组件（表格、表单、图表等）
- **多数据库支持**：兼容多种主流数据库
- **轻量级**：易于部署和维护
- **响应式布局**：自动适应不同设备屏幕

## 支持的数据库

SQLPage 支持多种主流数据库，让你可以灵活选择适合自己项目的数据源：

- **SQLite**：内置支持，包括 Spatialite 等扩展
- **PostgreSQL**：以及兼容的数据库如 YugabyteDB、CockroachDB 和 Aurora
- **MySQL**：以及兼容的数据库如 MariaDB 和 TiDB
- **Microsoft SQL Server**：以及兼容的数据库和提供商如 Azure SQL 和 Amazon RDS
- **ODBC 兼容数据库**：通过 ODBC 驱动连接各种数据库，如 ClickHouse、MongoDB、DuckDB、Oracle、Snowflake、BigQuery、IBM DB2 等

<mcreference link="https://github.com/sqlpage/SQLPage" index="0">0</mcreference>

## 快速上手

### 安装方式

SQLPage 提供多种安装方式，适合不同的使用场景：

#### 使用可执行文件

1. 从 [GitHub Releases](https://github.com/sqlpage/SQLPage/releases) 下载对应操作系统的最新版本
2. 解压缩文件：`tar -xzf sqlpage-*.tgz`
3. 运行：`./sqlpage.bin`

#### 使用 Docker

```bash
docker run -it --name sqlpage -p 8080:8080 --volume "$(pwd):/var/www" --rm lovasoa/sqlpage
```

这个命令会在当前目录运行 SQLPage，并将 8080 端口映射到容器的 8080 端口。

<mcreference link="https://github.com/sqlpage/SQLPage" index="0">0</mcreference>

#### MacOS 安装（使用 Homebrew）

```bash
brew install sqlpage
```

## SQLPage 的工作原理

SQLPage 的核心概念非常简洁：**每个 SELECT 语句都会被分析并渲染为用户界面元素**。<mcreference link="https://sql-page.com/documentation.sql" index="1">1</mcreference>

在 SQLPage 中，有两个最重要的概念：

- **组件（components）**：用于以特定方式显示数据的用户界面元素
- **参数（parameters）**：
  - 顶层参数（top-level parameters）：定义组件的属性，用于自定义其外观和行为
  - 行级参数（row-level parameters）：构成你想在组件中显示的数据

### 基本语法

要选择一个组件并设置其顶层属性，你可以编写如下 SQL 语句：

```sql
SELECT 'component_name' AS component, 'my value' AS top_level_parameter_1;
```

然后，你可以通过第二个 SELECT 语句设置其行级参数：

```sql
SELECT column1 AS row_level_parameter_1, column2 AS row_level_parameter_2 FROM my_table;
```

## 核心组件介绍

SQLPage 提供了多种内置组件，让你能够构建丰富的用户界面：

### 常用展示组件

#### list 组件

用于创建项目列表：

```sql
SELECT 'list' AS component, 'Popular websites' AS title;
SELECT name AS title, url AS link, description FROM website;
```

#### table 组件

用于以表格形式展示数据：

```sql
SELECT 'table' AS component, 'User List' AS title;
SELECT id, name, email, created_at FROM users ORDER BY created_at DESC;
```

#### chart 组件

用于创建各种类型的图表：

```sql
SELECT 'chart' AS component, 'Quarterly Revenue' AS title, 'area' AS type;
SELECT quarter AS x, SUM(revenue) AS y FROM finances GROUP BY quarter;
```

### 交互组件

#### form 组件

用于创建数据输入表单：

```sql
SELECT 'form' AS component, 'Create New User' AS title, 'Save' AS validate;
SELECT 'first_name' AS name, 'text' AS type, 'First Name' AS label, true AS required;
SELECT 'last_name' AS name, 'text' AS type, 'Last Name' AS label, true AS required;
SELECT 'email' AS name, 'email' AS type, 'Email' AS label, true AS required;

-- 表单提交后的数据处理
INSERT INTO users (first_name, last_name, email)
SELECT $first_name, $last_name, $email
WHERE $first_name IS NOT NULL; -- 仅在表单提交时执行
```

#### button 组件

用于创建交互按钮：

```sql
SELECT 'button' AS component, 'Back to Home' AS label, '/' AS link, 'primary' AS style;
```

## 构建一个简单的图书管理系统

让我们使用 SQLPage 构建一个简单的图书管理系统，展示其实际应用能力。

### 项目结构

创建以下 SQL 文件：

1. `index.sql` - 主页
2. `books.sql` - 图书列表
3. `add_book.sql` - 添加图书

### 1. 主页（index.sql）

```sql
SELECT 'card' AS component, 'SQLPage 图书管理系统' AS title, 
  '一个使用 SQLPage 构建的简单图书管理应用' AS description, 
  'bg-blue-100' AS background; 

SELECT 'text' AS component, '# 欢迎使用图书管理系统' AS contents_md;

SELECT 'grid' AS component, 2 AS columns; 

SELECT 
  'button' AS component, 
  '查看图书列表' AS label, 
  'books.sql' AS link, 
  'primary' AS style; 

SELECT 
  'button' AS component, 
  '添加新图书' AS label, 
  'add_book.sql' AS link, 
  'secondary' AS style; 
```

### 2. 图书列表（books.sql）

```sql
-- 创建 books 表（如果不存在）
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publication_year INTEGER,
  isbn TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入示例数据（仅在表为空时）
INSERT INTO books (title, author, publication_year, isbn)
SELECT * FROM (
  SELECT 'SQL 基础教程', 'Mick', 2020, '978-7-115-53147-8'
  UNION ALL SELECT '数据库系统概念', 'Abraham Silberschatz', 2019, '978-7-302-52674-2'
  UNION ALL SELECT 'NoSQL 精粹', 'Pramod J. Sadalage', 2018, '978-7-111-59516-0'
) WHERE NOT EXISTS (SELECT 1 FROM books);

-- 显示页面标题
SELECT 'text' AS component, '# 图书列表' AS contents_md;

-- 显示图书表格
SELECT 'table' AS component, '所有图书' AS title;
SELECT 
  id, 
  title, 
  author, 
  publication_year, 
  isbn, 
  created_at 
FROM books 
ORDER BY created_at DESC;

-- 返回主页按钮
SELECT 'button' AS component, '返回主页' AS label, 'index.sql' AS link;
```

### 3. 添加图书（add_book.sql）

```sql
SELECT 'text' AS component, '# 添加新图书' AS contents_md;

-- 创建添加图书的表单
SELECT 'form' AS component, '添加图书' AS title, '保存图书' AS validate;

SELECT 'title' AS name, 'text' AS type, '书名' AS label, true AS required;
SELECT 'author' AS name, 'text' AS type, '作者' AS label, true AS required;
SELECT 'publication_year' AS name, 'number' AS type, '出版年份' AS label;
SELECT 'isbn' AS name, 'text' AS type, 'ISBN' AS label;

-- 处理表单提交
INSERT INTO books (title, author, publication_year, isbn)
SELECT $title, $author, $publication_year, $isbn
WHERE $title IS NOT NULL; -- 仅在表单提交时执行

-- 如果表单已提交，显示成功消息
SELECT 'alert' AS component, 'success' AS type, '成功添加图书！' AS title, 
  '图书已成功添加到数据库中。' AS description
WHERE $title IS NOT NULL;

-- 显示导航按钮
SELECT 'button' AS component, '查看图书列表' AS label, 'books.sql' AS link;
SELECT 'button' AS component, '返回主页' AS label, 'index.sql' AS link;
```

## 高级功能

### 认证与会话管理

SQLPage 提供了 `authentication` 组件，让你可以轻松添加用户认证功能：

```sql
-- 简单的密码保护
SELECT 'authentication' AS component, '请输入密码以访问此页面' AS title, 
  '密码不正确，请重试' AS error_message, 
  '/login.sql' AS link; 

-- 验证密码
SELECT 
  CASE WHEN $password = 'my_secure_password' THEN 1 ELSE 0 END AS is_authenticated;
```

对于更复杂的认证需求，SQLPage 还支持单点登录（SSO）功能。

<mcreference link="https://sql-page.com/documentation.sql" index="1">1</mcreference>

### 文件下载功能

使用 `download` 组件，你可以让用户下载文件：

```sql
-- 下载 CSV 文件示例
SELECT 'download' AS component, 
  'data:text/csv;charset=utf-8,' || sqlpage.url_encode('书名,作者,出版年份
SQL 基础教程,Mick,2020
数据库系统概念,Abraham Silberschatz,2019') AS contents, 
  'books.csv' AS filename;
```

## 应用场景

SQLPage 特别适合以下应用场景：

- **数据管理工具**：快速创建简单的数据录入和查询界面
- **报表系统**：基于数据库数据生成可视化报表
- **管理后台**：为应用程序快速构建管理界面
- **原型设计**：快速验证产品想法和数据模型
- **内部工具**：为团队创建实用的内部数据工具
- **个人项目**：无需全栈开发即可创建完整的数据应用

## 总结

SQLPage 是一个极具创新性的工具，它重新定义了数据应用的开发方式，让开发者可以专注于数据和业务逻辑，而不必担心前端技术的复杂性。

通过简单的 SQL 语句，SQLPage 使数据应用的开发变得前所未有的简单和高效。无论是快速原型设计，还是构建小型数据应用，SQLPage 都是一个值得尝试的优秀工具。

随着数据驱动应用的普及，像 SQLPage 这样专注于简化数据应用开发的工具将会越来越受到开发者的欢迎。它不仅降低了开发门槛，也大大提高了开发效率，让更多人能够轻松构建自己的数据应用。