import { defineCollection } from 'astro/content/config'
import { glob } from 'astro/loaders'
import { z } from 'zod/v4'

const postsCollection: ReturnType<typeof defineCollection> = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/posts',
    generateId: ({ entry }: { entry: string }) => {
      // Strip .md extension and /index suffix for clean slugs
      return entry.replace(/\.md$/, '').replace(/\/index$/, '')
    },
  }),
  schema: z.object({
    title: z.string(),
    published: z.date(),
    updated: z.date().optional(),
    draft: z.boolean().optional().default(false),
    description: z.string().optional().default(''),
    image: z.string().optional().default(''),
    tags: z.array(z.string()).optional().default([]),
    category: z.string().optional().default(''),
    lang: z.string().optional().default(''),

    /* For internal use */
    prevTitle: z.string().default(''),
    prevSlug: z.string().default(''),
    nextTitle: z.string().default(''),
    nextSlug: z.string().default(''),
  }),
})

const specCollection: ReturnType<typeof defineCollection> = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/spec' }),
})

export const collections: {
  posts: typeof postsCollection
  spec: typeof specCollection
} = {
  posts: postsCollection,
  spec: specCollection,
}
