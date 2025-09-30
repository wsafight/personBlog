-- SQLPage 图书管理系统主页
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