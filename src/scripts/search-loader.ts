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
  search: (keyword: string) => Promise<{ results: PagefindSearchResult[] }>
}

declare global {
  interface Window {
    pagefind?: PagefindApi
  }
}

export type SearchController = {
  handleInput: (input?: HTMLInputElement) => void
  togglePanel: () => void
}

const SEARCH_DEBOUNCE_MS = 180
const MAX_SEARCH_RESULTS = 8

function createResultLink(item: PagefindResult): HTMLAnchorElement {
  const link = document.createElement('a')
  link.href = item.url
  link.className =
    'transition first-of-type:mt-2 lg:first-of-type:mt-0 group block rounded-xl text-lg px-3 py-2 hover:bg-[var(--btn-plain-bg-hover)] active:bg-[var(--btn-plain-bg-active)]'

  const title = document.createElement('div')
  title.className =
    'transition text-90 inline-flex font-bold group-hover:text-[var(--primary)]'
  title.textContent = item.meta.title

  const arrow = document.createElement('span')
  arrow.className = 'transition translate-x-1 my-auto text-[var(--primary)]'
  arrow.innerHTML = '&rsaquo;'
  title.append(arrow)

  const excerpt = document.createElement('div')
  excerpt.className = 'transition text-sm text-50'
  excerpt.innerHTML = item.excerpt

  link.append(title, excerpt)
  return link
}

export function mountSearch(root: HTMLElement): SearchController {
  const pagefindScriptUrl =
    root.dataset.pagefindScriptUrl || '/pagefind/pagefind.js'
  const panel = root.querySelector<HTMLElement>('#search-panel')
  const mobileInput = root.querySelector<HTMLInputElement>(
    '[data-search-input="mobile"]',
  )
  const results = root.querySelector<HTMLElement>('[data-search-results]')

  let pagefindApi: PagefindApi | null = null
  let pagefindInitPromise: Promise<PagefindApi | null> | null = null
  let activeSearchId = 0
  let desktopSearchTimer: ReturnType<typeof setTimeout> | null = null
  let mobileSearchTimer: ReturnType<typeof setTimeout> | null = null

  const ensurePagefindLoaded = async (): Promise<PagefindApi | null> => {
    if (!import.meta.env.PROD) return null

    if (pagefindApi) return pagefindApi
    if (window.pagefind) {
      pagefindApi = window.pagefind
      return pagefindApi
    }
    if (pagefindInitPromise) return pagefindInitPromise

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

  const clearSearchTimer = (isDesktop: boolean) => {
    const timer = isDesktop ? desktopSearchTimer : mobileSearchTimer
    if (timer) clearTimeout(timer)
    if (isDesktop) {
      desktopSearchTimer = null
    } else {
      mobileSearchTimer = null
    }
  }

  const renderResults = (items: PagefindResult[]) => {
    if (!results) return
    const fragment = document.createDocumentFragment()
    for (const item of items) {
      fragment.append(createResultLink(item))
    }
    results.replaceChildren(fragment)
  }

  const runSearch = async (keyword: string, isDesktop: boolean) => {
    if (!panel) return

    const searchId = ++activeSearchId
    const normalizedKeyword = keyword.trim()
    if (!normalizedKeyword) {
      if (isDesktop) {
        panel.classList.add('float-panel-closed')
      }
      renderResults([])
      return
    }

    let items: PagefindResult[] = []
    if (import.meta.env.PROD) {
      const pagefind = await ensurePagefindLoaded()
      if (!pagefind) return
      const ret = await pagefind.search(normalizedKeyword)
      items = await Promise.all(
        ret.results.slice(0, MAX_SEARCH_RESULTS).map(item => item.data()),
      )
    }

    if (searchId !== activeSearchId) return

    renderResults(items)
    if (isDesktop) {
      panel.classList.toggle('float-panel-closed', items.length === 0)
    }
  }

  const handleInput = (input?: HTMLInputElement) => {
    if (!input) {
      void ensurePagefindLoaded()
      return
    }

    const isDesktop = input.dataset.searchInput === 'desktop'
    clearSearchTimer(isDesktop)

    const keyword = input.value
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

  const togglePanel = () => {
    if (!panel) return
    panel.classList.toggle('float-panel-closed')
    if (!panel.classList.contains('float-panel-closed')) {
      mobileInput?.focus()
    }
  }

  return {
    handleInput,
    togglePanel,
  }
}
