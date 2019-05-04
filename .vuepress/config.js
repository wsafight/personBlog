const path = require('path');
const fs = require('fs');

module.exports = {
  title: "jump-jump-docs",
  description: "Welcome to my docs",
  head: [
    [
      "link",
      {
        rel: "icon",
        href: "/img/logo.ico"
      }
    ]
  ],
  themeConfig: {
    sidebarDepth: 3,
    nav: [
      {
        text: '个人博客',
        link: '/blog/introduction'
      },
      {
        text: '常用算法',
        link: '/algorithm/introduction'
      },
      {
        text: '个人感悟',
        link: '/perception/introduction'
      },
      {
        text: '关于',
        link: '/about'
      },
      {
        text: '了解更多',
        items: [
          { text: 'Github', link: 'https://github.com/wsafight' },
          { text: '学习资源', link: '/learn' }
        ]
      }
      // {
      //   text: 'Github',
      //   link: 'https://github.com/jgsrty'
      // }
    ],
    sidebar: {
      "/blog/": [
        "introduction",
        {
          title: "web前端",
          collapsable: false,
          children: genSidebarConfig("blog/web-front", true)
        },
      ],
      // "/vuepress/": [
      //   "introduction",
      //   {
      //     title: "配置步骤",
      //     collapsable: false,
      //     children: genSidebarConfig("vuepress/2018-October", true)
      //   },
      // ],
      // "/components/": [
      //   "introduction",
      //   {
      //     title: "UI组件",
      //     collapsable: false,
      //     children: genSidebarConfig("components/UI", true)
      //   },
        // "进度条",
        // {
        //   title: '123',
        //   children: genSidebarConfig("components/rtyProgress", true)
        // }
      // ],
    }
  },
  sass: { indentedSyntax: true },
};

function genSidebarConfig(dir, hasSub) {
  let p = path.join(__dirname, '../', dir);
  let files = fs.readdirSync(p);
  let subDir = hasSub ? dir.split('/')[1] : '';
  files = files.map(item => {
    item = subDir ? subDir + '/' + path.basename(item, '.md') : path.basename(item, '.md');
    return item;
  });
  return files.reverse();
}