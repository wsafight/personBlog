import { getTagList } from '../utils/content-utils'

export const prerender = true

export async function GET(): Promise<Response> {
  const tags = await getTagList()
  const sidebarTags = [...tags]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map(tag => tag.name)

  return new Response(JSON.stringify(sidebarTags), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
