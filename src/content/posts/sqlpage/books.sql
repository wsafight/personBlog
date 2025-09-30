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