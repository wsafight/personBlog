# 使用 headless-recorder 记录浏览器交互

> 大多数可以在浏览器中手动执行的操作都可以使用 Puppeteer 完成

Puppeteer 是 Chrome 团队在 2017 年发布的一个 Node.js 包，用来模拟 Chrome 浏览器的运行。

在之前的业务开发中，笔者团队也在服务端使用 Puppeteer 生成 pdf、png 等文件（puppeteer 下载时候会安装最新版本的 Chromium，而 puppeteer-core 可以连接现有浏览器）。

当然，笔者那个时候就想通过 Puppeteer 来实现 UI 自动化测试，但由于代码过于庞大且业务系统变化太大，无力维护故先行搁置。

而 [headless-recorder](https://github.com/checkly/headless-recorder) 是一个 Chrome 插件，该插件通过记录用户和浏览器交互来生成 Playwright 或 Puppeteer 脚本。今天我们就学习使用以及源码。


