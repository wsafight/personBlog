-- 添加新图书页面
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