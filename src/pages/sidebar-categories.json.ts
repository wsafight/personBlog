import { getCategoryList } from '../utils/content-utils'
import { getCategoryUrl } from '../utils/url-utils'

export const prerender = true

export async function GET(): Promise<Response> {
  const categories = await getCategoryList()
  const sidebarCategories = categories.map(category => ({
    name: category.name,
    count: category.count,
    url: getCategoryUrl(category.name),
  }))

  return new Response(JSON.stringify(sidebarCategories), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
