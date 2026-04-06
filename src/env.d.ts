/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

declare module 'astro/loaders' {
  export const glob: typeof import('astro/dist/content/loaders/glob.js').glob
}

declare module '@fontsource-variable/jetbrains-mono'
