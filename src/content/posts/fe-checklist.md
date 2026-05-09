---
title: 把一份前端 checklist 变成 AI 的 Skill：让 CR 不再靠记忆
published: 2026-05-09
description: 把沉睡三年的 front-end-checklist 改造成 Claude Code Skill，让 160 条 Code Review 经验从查阅式文档变成主动进入工作流的上下文。
tags: [AI, Claude Code, 前端, Code Review, Skill]
category: AI
draft: false
---

## 引子：一个吃灰三年的项目被重新盘活

写这篇博客的由头有点特别。

我有一个叫 `front-end-checklist` 的老项目（网页：<https://wsafight.github.io/front-end-checklist/>），2023 年初在公司做 Code Review 的时候顺手整理出来的。那会儿评审新同学的代码，总是在重复同样的话："这里没做 XSS 转义"、"useEffect 里有竞态"、"label 没和 input 关联"。后来干脆把这些反复出现的问题写成清单，用 Jekyll 挂在 GitHub Pages 上。

然后它就一直在那儿积灰。2024 只有一次提交，2025 只有一次，到了 2026 年 5 月也还没动过。

2026-05-08 晚上，我本来只想顺手改一下清单里过时的条目，结果一头扎进 Claude Code，**两小时做了 22 次提交**，把这个静态页面彻底改造了一遍。

真正让我想写这篇文章的，不是"AI 让我写代码变快"。快是肯定快，但这次改造最后落到了一件我之前没想过的事情上——**一份静态文档，换了个交付形式，才真正开始被用起来。**

## 清单本身：三年沉淀下来的 160 条检查项

先交代清楚这个清单是什么。

它不是 ESLint 能查的那种风格规则，而是 **Code Review 时需要结合业务和上下文判断的问题**。目前一共 25 个分组、160 条检查项：

```text
命名规范      数据与类型    函数设计      状态管理      控制流
异步处理      数据请求      UI 与渲染     样式与响应式  路由与权限
性能          安全与健壮性  表单与交互    错误处理      测试
无障碍访问    用户体验      代码质量      工程化        国际化
日志与监控    依赖管理      浏览器兼容    文档与协作    PR 自检
```

随便挑几条看看：

> - 区分"缺失"、"为空"、"为 0"、"为空数组"、"为空字符串"的业务含义
> - 处理并发请求的竞态问题，避免旧响应覆盖新状态
> - 同一表单/输入控件不要在受控与非受控之间切换
> - `useEffect` / `watch` 的依赖项必须完整，避免闭包捕获过期值
> - 定时器和事件监听记得清除，否则可能引发内存泄漏
> - 表单错误应定位到具体字段，而不是只给出笼统提示

这些不是靠格式化、类型推导或者简单 AST 规则就能稳定抓出来的问题。它们往往来自真实线上事故、返工、误解和交接成本。以前这些经验只能靠人去记，记不住就会在别的项目里重新踩一次。

## 痛点：清单挂在网上，但不会进入工作流

清单做完这三年，我一直有个遗憾：**没人真的会去翻**。

我自己都不翻。做一个 PR 的时候，我知道清单里有条"处理并发请求的竞态"，但我会不会每次都老老实实打开页面对一遍？不会。同事更不会。新人入职时我会把链接丢给他们，他们收藏，然后就再也不打开了。

这是很多静态文档共同的问题：**信息在那里，但你必须主动去触达它**。而在 CR 场景里，主动触达的前提是你已经意识到自己可能漏了什么。可真正漏掉的时候，人往往意识不到。

我试过一些办法：

- 写成 Markdown 放 README：没人会在写代码时切到 README 里逐条对照。
- 做成可搜索的网页：搜索的前提是你已经知道关键词，可 XSS、竞态、状态错位这类问题，经常就是因为你没意识到该搜什么。
- 加上勾选和进度追踪：这次改造时我反而把它们删了，因为它把"查阅文档"变成了"填表"，使用意愿更低。

根本问题不是文档形式不够花哨，而是查阅式文档很难主动进入人的工作流。

## 转折：把清单变成 AI 的上下文

Claude Code 的 Skill 机制改变了这件事。

简单说，Skill 是一段给 AI 读的说明书，加上它执行任务时需要参考的资料。当你在对话里说到特定触发词时，AI 会加载这个 Skill，并按说明书走流程。

我的 `frontend-checklist` Skill 里写的是这样的逻辑：

1. **只在用户明确请求时触发**：比如 `/frontend-checklist`、"按前端清单 review"、"按 checklist 检查这段代码"。用户没提，它不会自作主张去扫代码。
2. **确认检查范围**：如果用户指定了文件，就只看指定文件；如果说 "review PR"，就用 `git diff` 定位变更；如果都没有，就先确认范围，不盲目扫整个仓库。
3. **按语言选择清单**：中文提问读中文版清单，英文提问读英文版清单。
4. **只报命中的问题**：通过和不适用的条目一律不输出。
5. **按严重度排序**：安全、数据丢失、竞态、内存泄漏这类硬问题优先，命名风格靠后。
6. **每个问题都标出文件路径和行号**：让人能直接跳到具体位置。

关键的翻转在这里：

> 以前是"**你去翻清单**"。现在是"**清单来找你**"。

写 PR 的时候，你不需要记得清单里每一条是什么，直接在 IDE 里说一句"按前端清单 review 我这个 PR"，AI 会把 160 条和当前 diff 放在一起看，只告诉你命中的那些，并给出文件路径和行号，必要时附 1-3 行示例代码。心智负担从"记住 160 条"降到"知道有这么一个入口"。

## 一个真实跑出来的 review

空讲没意思，看一段 showcase 里的实际输出。

下面这段代码是我写的一个有意设计的"坏例子"（`showcase/cases/01-xss/bad.tsx`），一个评论列表组件：

```tsx
export function CommentList(props: any) {
  const [list, setList] = useState([] as any);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    fetch('/api/comments?topic=' + props.topic)
      .then((r) => r.json())
      .then((d) => {
        setList(d.data);
      });
  }, [props.topic]);

  const highlight = (text, kw) => {
    if (!kw) return text;
    return text.replace(new RegExp(kw, 'g'), '<mark>' + kw + '</mark>');
  };

  return (
    <div>
      <input type="text" onChange={onSearch} />
      <div id="tip" dangerouslySetInnerHTML={{ __html: props.tip }} />
      {list.map((c: Comment, i: number) => (
        <div key={i} className="comment">
          <img src={c.avatar} />
          <a href={'javascript:void(0)'} onClick={() => eval(c.author.onClick)}>
            {c.author.name}
          </a>
          <div dangerouslySetInnerHTML={{ __html: highlight(c.body, keyword) }} />
        </div>
      ))}
    </div>
  );
}
```

乍看能跑，TypeScript 不一定报错，ESLint 也不一定能拦住关键问题。但 Skill 跑完吐出来 **11 条命中**，挑几条看（行号对应 `showcase/cases/01-xss/bad.tsx` 原文件，不是上面代码块里的相对行号）：

**安全与健壮性（最严重的一批）**
- `line 35`：`dangerouslySetInnerHTML={{ __html: props.tip }}` 直接吃外部 `tip`，存在 XSS 风险。建议默认文本渲染，真要富文本时先用 DOMPurify 消毒。
- `line 44`：`highlight` 用字符串拼接 HTML 再 `dangerouslySetInnerHTML`，`body` 和 `keyword` 都没转义。建议改成 `String.split` 分段渲染，把命中段包进 `<mark>`，不要注入 HTML。
- `line 39`：`eval(c.author.onClick)` 把接口返回的字符串当代码执行，等于把任意脚本执行权交给接口数据。建议彻底删除，交互改成前端静态映射。

**数据请求**
- `line 14-20`：`props.topic` 变化时发起新请求但没取消旧请求，旧响应可能覆盖新数据。建议用 `AbortController` 或 `ignore` 标志在 cleanup 里关掉。

**UI 与渲染**
- `line 37`：`key={i}` 用数组下标，列表增删重排时可能导致状态错位。建议用稳定的业务 id，比如 `c.id`。

**无障碍**
- `line 34, 38`：搜索 input 没有 `aria-label` 或关联 `label`，`<img>` 没有 `alt`。

泛泛地让 AI 做 review，它很容易给出"结构清晰、建议补充错误处理"这类通用意见。扔给 ESLint，也大概率只会在 `any`、未定义变量、hook 依赖这类规则上发声。**Skill 的价值在于把评审标准显式化：AI 不是凭感觉聊几句，而是按一把真实的尺子在量代码。**

我还拿其他 showcase 跑了一遍：用户资料页命中 **12 条**（竞态、未清理副作用、无空值守卫），注册表单命中 **17 条**（a11y、字段级错误、密码明文 input、防重复提交）。这些都是一眼看过去"差不多能用"，但上线后很容易变成坑的代码。

## 怎么用

Skill 装起来一条命令的事：

```bash
curl -fsSL https://github.com/wsafight/front-end-checklist/releases/latest/download/install.sh \
  | sh -s -- claude
```

装完在对话里说 `/frontend-checklist` 或"按前端清单 review 我这个 PR"，就会触发它。也支持 Kiro / Cursor / Codex，把命令结尾换一下就行。

清单是中英双语的，AI 会根据你提问的语言自动选对应版本。

---

两小时改造一个老项目听起来像标题党，但实际发生的事情比这更有意思：**一份躺了三年没人翻的清单，换了个交付形式，突然就活过来了**。内容还是那 160 条，变的只是"它怎么到达读者"。

如果你手里也有这种"明明有价值但没人用"的老文档，值得花个晚上，把它接进 AI 看看。

— 2026-05-09 夜
