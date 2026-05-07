<script lang="ts">
import { onMount } from 'svelte'
import SearchIcon from './icons/SearchIcon.svelte'
import ChevronRightIcon from './icons/ChevronRightIcon.svelte'

const { pagefindScriptUrl = '/pagefind/pagefind.js' } = $props<{
  pagefindScriptUrl?: string
}>()

let keywordDesktop = $state('')
let keywordMobile = $state('')

interface PagefindResult {
  url: string
  meta: {
    title: string
  }
  excerpt: string
}

interface PagefindSearchResult {
  data: () => Promise<PagefindResult>
}

interface PagefindApi {
  options: (options: { excerptLength: number }) => Promise<void> | void
  init: () => Promise<void> | void
  search: (
    keyword: string,
  ) => Promise<{ results: PagefindSearchResult[] }>
}

declare global {
  interface Window {
    pagefind?: PagefindApi
  }
}

let result: PagefindResult[] = $state([])
let pagefindApi: PagefindApi | null = null
let pagefindInitPromise: Promise<PagefindApi | null> | null = null
let activeSearchId = 0
let desktopSearchTimer: ReturnType<typeof setTimeout> | null = null
let mobileSearchTimer: ReturnType<typeof setTimeout> | null = null

const SEARCH_DEBOUNCE_MS = 180
const MAX_SEARCH_RESULTS = 8

let search = (keyword: string, isDesktop: boolean) => {}

function clearSearchTimer(isDesktop: boolean) {
  const timer = isDesktop ? desktopSearchTimer : mobileSearchTimer
  if (timer) {
    clearTimeout(timer)
  }
  if (isDesktop) {
    desktopSearchTimer = null
  } else {
    mobileSearchTimer = null
  }
}

const ensurePagefindLoaded = async (): Promise<PagefindApi | null> => {
  if (!import.meta.env.PROD) {
    return null
  }

  if (pagefindApi) {
    return pagefindApi
  }
  if (window.pagefind) {
    pagefindApi = window.pagefind
    return pagefindApi
  }
  if (pagefindInitPromise) {
    return pagefindInitPromise
  }

  pagefindInitPromise = (async () => {
    const pagefind = (await import(
      /* @vite-ignore */ pagefindScriptUrl
    )) as PagefindApi
    await pagefind.options({
      excerptLength: 20,
    })
    await pagefind.init()
    window.pagefind = pagefind
    pagefindApi = pagefind
    return pagefind
  })()

  try {
    return await pagefindInitPromise
  } catch (error) {
    console.error('Failed to load pagefind', error)
    return null
  } finally {
    pagefindInitPromise = null
  }
}

const warmupPagefind = () => {
  if (import.meta.env.PROD) {
    void ensurePagefindLoaded()
  }
}

const handleDesktopFocus = () => {
  warmupPagefind()
  void search(keywordDesktop, true)
}

onMount(() => {
  const runSearch = async (keyword: string, isDesktop: boolean) => {
    const panel = document.getElementById('search-panel')
    if (!panel) return

    const searchId = ++activeSearchId
    const normalizedKeyword = keyword.trim()
    if (!normalizedKeyword) {
      if (isDesktop) {
        panel.classList.add('float-panel-closed')
      }
      result = []
      return
    }

    let arr: PagefindResult[] = []

    if (import.meta.env.PROD) {
      const pagefind = await ensurePagefindLoaded()
      if (!pagefind) {
        return
      }
      const ret = await pagefind.search(normalizedKeyword)
      arr = await Promise.all(
        ret.results.slice(0, MAX_SEARCH_RESULTS).map(item => item.data()),
      )
    }

    if (searchId !== activeSearchId) {
      return
    }

    if (!arr.length) {
      result = []
      if (isDesktop) {
        panel.classList.add('float-panel-closed')
      }
      return
    }

    if (isDesktop) {
      panel.classList.remove('float-panel-closed')
    }
    result = arr
  }

  search = (keyword: string, isDesktop: boolean) => {
    clearSearchTimer(isDesktop)
    const delay = keyword.trim() ? SEARCH_DEBOUNCE_MS : 0
    const timer = setTimeout(() => {
      void runSearch(keyword, isDesktop)
    }, delay)

    if (isDesktop) {
      desktopSearchTimer = timer
    } else {
      mobileSearchTimer = timer
    }
  }

  return () => {
    activeSearchId += 1
    clearSearchTimer(true)
    clearSearchTimer(false)
  }
})

const togglePanel = () => {
  let panel = document.getElementById('search-panel')
  panel?.classList.toggle('float-panel-closed')
}

$effect(() => { search(keywordDesktop, true) })
$effect(() => { search(keywordMobile, false) })
</script>

<!-- search bar for desktop view -->
<div id="search-bar" class="hidden lg:flex transition-all items-center h-11 mr-2 rounded-lg
      bg-black/[0.04] hover:bg-black/[0.06] focus-within:bg-black/[0.06]
      dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10
">
    <SearchIcon class="absolute pointer-events-none ml-3 transition my-auto text-black/30 dark:text-white/30" />
    <input placeholder="搜索" bind:value={keywordDesktop} onfocus={handleDesktopFocus}
           class="transition-all pl-10 text-sm bg-transparent outline-0
         h-full w-40 active:w-60 focus:w-60 text-black/50 dark:text-white/50"
    >
</div>

<!-- toggle btn for phone/tablet view -->
<button onclick={togglePanel} aria-label="Search Panel" id="search-switch"
        class="btn-plain scale-animation lg:!hidden rounded-lg w-11 h-11 active:scale-90">
    <SearchIcon />
</button>

<!-- search panel -->
<div id="search-panel" class="float-panel float-panel-closed search-panel absolute md:w-[30rem]
top-20 left-4 md:left-[unset] right-4 shadow-2xl rounded-2xl p-2">

    <!-- search bar inside panel for phone/tablet -->
    <div id="search-bar-inside" class="flex relative lg:hidden transition-all items-center h-11 rounded-xl
      bg-black/[0.04] hover:bg-black/[0.06] focus-within:bg-black/[0.06]
      dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10
  ">
        <SearchIcon class="absolute pointer-events-none ml-3 transition my-auto text-black/30 dark:text-white/30" />
        <input placeholder="Search" bind:value={keywordMobile} onfocus={warmupPagefind}
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
                {item.meta.title}<ChevronRightIcon class="transition translate-x-1 my-auto text-[var(--primary)]" />
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
