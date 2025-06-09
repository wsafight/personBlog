<script lang="ts">
import { onMount } from 'svelte'
import Icon from '@iconify/svelte'

let keywordDesktop = ''
let keywordMobile = ''

interface PagefindResult {
  url: string
  meta: {
    title: string
  }
  excerpt: string
}

let result: PagefindResult[] = []

// const fakeResult: PagefindResult[] = [
// {
//   url: url('/'),
//   meta: {
//     title: 'This Is a Fake Search Result',
//   },
//   excerpt:
//     'Because the search cannot work in the <mark>dev</mark> environment.',
// },
// {
//   url: url('/'),
//   meta: {
//     title: 'If You Want to Test the Search',
//   },
//   excerpt: 'Try running <mark>npm build && npm preview</mark> instead.',
// },
// ]

let search = (keyword: string, isDesktop: boolean) => {}

onMount(() => {
  search = async (keyword: string, isDesktop: boolean) => {
    let panel = document.getElementById('search-panel')
    if (!panel) return

    if (!keyword) {
      if (isDesktop) {
        panel.classList.add('float-panel-closed')
      }
      return
    }

    // 如果是开发环境，暂停使用 pagefind 搜索
    const arr = []
    // 如果是生产环境，使用 pagefind 搜索
    if (import.meta.env.PROD) {
      const ret = await pagefind.search(keyword)
      for (const item of ret.results) {
        arr.push(await item.data())
      }
    }

    if (!arr.length && isDesktop) {
      panel.classList.add('float-panel-closed')
      return
    }

    if (isDesktop) {
      panel.classList.remove('float-panel-closed')
    }
    result = arr
  }
})

const togglePanel = () => {
  let panel = document.getElementById('search-panel')
  panel?.classList.toggle('float-panel-closed')
}

$: search(keywordDesktop, true)
$: search(keywordMobile, false)
</script>

<!-- search bar for desktop view -->
<div id="search-bar" class="hidden lg:flex transition-all items-center h-11 mr-2 rounded-lg
      bg-black/[0.04] hover:bg-black/[0.06] focus-within:bg-black/[0.06]
      dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10
">
    <Icon icon="material-symbols:search" class="absolute text-[1.25rem] pointer-events-none ml-3 transition my-auto text-black/30 dark:text-white/30"></Icon>
    <input placeholder="搜索" bind:value={keywordDesktop} on:focus={() => search(keywordDesktop, true)}
           class="transition-all pl-10 text-sm bg-transparent outline-0
         h-full w-40 active:w-60 focus:w-60 text-black/50 dark:text-white/50"
    >
</div>

<!-- toggle btn for phone/tablet view -->
<button on:click={togglePanel} aria-label="Search Panel" id="search-switch"
        class="btn-plain scale-animation lg:!hidden rounded-lg w-11 h-11 active:scale-90">
    <Icon icon="material-symbols:search" class="text-[1.25rem]"></Icon>
</button>

<!-- search panel -->
<div id="search-panel" class="float-panel float-panel-closed search-panel absolute md:w-[30rem]
top-20 left-4 md:left-[unset] right-4 shadow-2xl rounded-2xl p-2">

    <!-- search bar inside panel for phone/tablet -->
    <div id="search-bar-inside" class="flex relative lg:hidden transition-all items-center h-11 rounded-xl
      bg-black/[0.04] hover:bg-black/[0.06] focus-within:bg-black/[0.06]
      dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10
  ">
        <Icon icon="material-symbols:search" class="absolute text-[1.25rem] pointer-events-none ml-3 transition my-auto text-black/30 dark:text-white/30"></Icon>
        <input placeholder="Search" bind:value={keywordMobile}
               class="pl-10 absolute inset-0 text-sm bg-transparent outline-0
               focus:w-60 text-black/50 dark:text-white/50"
        >
    </div>

    <!-- search results -->
    {#each result as item}
        <a href={item.url}
           class="transition first-of-type:mt-2 lg:first-of-type:mt-0 group block
       rounded-xl text-lg px-3 py-2 hover:bg-[var(--btn-plain-bg-hover)] active:bg-[var(--btn-plain-bg-active)]">
            <div class="transition text-90 inline-flex font-bold group-hover:text-[var(--primary)]">
                {item.meta.title}<Icon icon="fa6-solid:chevron-right" class="transition text-[0.75rem] translate-x-1 my-auto text-[var(--primary)]"></Icon>
            </div>
            <div class="transition text-sm text-50">
                {@html item.excerpt}
            </div>
        </a>
    {/each}
</div>

<style>
  input:focus {
    outline: 0;
  }
  .search-panel {
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }
</style>
