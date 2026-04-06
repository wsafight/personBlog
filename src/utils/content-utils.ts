import { getCollection } from 'astro:content'
import type { BlogPostData } from '@/types/config'

type BlogPostEntry = {
  body: string
  data: BlogPostData
  id: string
}

let allBlogPostsPromise: Promise<BlogPostEntry[]> | null = null
let sortedPostsPromise: Promise<BlogPostEntry[]> | null = null
let tagListPromise: Promise<Tag[]> | null = null
let categoryListPromise: Promise<Category[]> | null = null
const isProduction = process.env.NODE_ENV === 'production'

const getAllBlogPosts = async (): Promise<BlogPostEntry[]> => {
  if (allBlogPostsPromise) {
    return allBlogPostsPromise
  }

  allBlogPostsPromise = getCollection('posts', post => {
    const data = post.data as BlogPostData
    return isProduction ? data.draft !== true : true
  }).then(blogPosts => blogPosts as unknown as BlogPostEntry[])

  return allBlogPostsPromise
}

export async function getSortedPosts(): Promise<BlogPostEntry[]> {
  if (sortedPostsPromise) {
    return sortedPostsPromise
  }

  sortedPostsPromise = (async () => {
    const allBlogPosts = await getAllBlogPosts()
    const sorted = [...allBlogPosts].sort(
      (a: { data: BlogPostData }, b: { data: BlogPostData }) => {
        const dateA = new Date(a.data.published)
        const dateB = new Date(b.data.published)
        return dateA > dateB ? -1 : 1
      },
    )

    for (let i = 1; i < sorted.length; i++) {
      sorted[i].data.nextSlug = sorted[i - 1].id
      sorted[i].data.nextTitle = sorted[i - 1].data.title
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      sorted[i].data.prevSlug = sorted[i + 1].id
      sorted[i].data.prevTitle = sorted[i + 1].data.title
    }

    return sorted
  })()

  return sortedPostsPromise
}

export type Tag = {
  name: string
  count: number
}

export async function getTagList(): Promise<Tag[]> {
  if (tagListPromise) {
    return tagListPromise
  }

  tagListPromise = (async () => {
    const allBlogPosts = await getAllBlogPosts()
    const countMap: Record<string, number> = {}
    allBlogPosts.forEach(post => {
      post.data.tags.forEach((tag: string) => {
        if (!countMap[tag]) countMap[tag] = 0
        countMap[tag]++
      })
    })

    // sort tags
    const keys: string[] = Object.keys(countMap).sort((a, b) => {
      return a.toLowerCase().localeCompare(b.toLowerCase())
    })

    return keys.map(key => ({ name: key, count: countMap[key] }))
  })()

  return tagListPromise
}

export type Category = {
  name: string
  count: number
}

export async function getCategoryList(): Promise<Category[]> {
  if (categoryListPromise) {
    return categoryListPromise
  }

  categoryListPromise = (async () => {
    const allBlogPosts = await getAllBlogPosts()
    const count: Record<string, number> = {}
    allBlogPosts.forEach(post => {
      if (!post.data.category) {
        const ucKey = '未分类'
        count[ucKey] = count[ucKey] ? count[ucKey] + 1 : 1
        return
      }
      count[post.data.category] = count[post.data.category]
        ? count[post.data.category] + 1
        : 1
    })

    const lst = Object.keys(count).sort((a, b) => {
      return a.toLowerCase().localeCompare(b.toLowerCase())
    })

    const ret: Category[] = []
    for (const c of lst) {
      ret.push({ name: c, count: count[c] })
    }
    return ret
  })()

  return categoryListPromise
}
