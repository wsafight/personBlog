import { siteConfig } from '@/config'
import rss from '@astrojs/rss'
import { getSortedPosts } from '@utils/content-utils'
import type { APIContext } from 'astro'
import MarkdownIt from 'markdown-it'
import sanitizeHtml from 'sanitize-html'

const parser = new MarkdownIt()

export async function GET(context: APIContext) {
  const blogs = await getSortedPosts()

  // 优化：只包含最近 50 篇文章，减少 RSS 文件大小
  // const recentPosts = blog.slice(0, 50)

  return rss({
    title: siteConfig.title,
    description: siteConfig.subtitle || 'No description',
    site: context.site ?? 'https://fuwari.vercel.app',
    items: blogs.map(post => {
      // 优化：使用摘要而非全文，如果没有摘要则截取前 500 字符
      const content = post.data.description
        ? post.data.description
        : sanitizeHtml(parser.render(post.body.slice(0, 500) + '...'), {
            allowedTags: [],  // 移除所有 HTML 标签，只保留纯文本
          })

      return {
        title: post.data.title,
        pubDate: post.data.published,
        description: post.data.description || '',
        link: `/posts/${post.slug}/`,
        content: content,
      }
    }),
    customData: `<language>${siteConfig.lang}</language>`,
  })
}
