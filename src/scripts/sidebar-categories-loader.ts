type SidebarCategory = {
  name: string
  count: number
  url: string
}

function createCategoryLink(category: SidebarCategory): HTMLAnchorElement {
  const link = document.createElement('a')
  link.href = category.url
  link.setAttribute(
    'aria-label',
    `View all posts in the ${category.name} category`,
  )
  link.className =
    'flex w-full h-10 rounded-lg bg-none hover:bg-[var(--btn-plain-bg-hover)] active:bg-[var(--btn-plain-bg-active)] transition-all pl-2 hover:pl-3 text-neutral-700 hover:text-[var(--primary)] dark:text-neutral-300 dark:hover:text-[var(--primary)] items-center'

  const row = document.createElement('div')
  row.className = 'flex items-center justify-between relative mr-2 w-full'

  const name = document.createElement('div')
  name.className =
    'overflow-hidden text-left whitespace-nowrap overflow-ellipsis'
  name.textContent = category.name

  const badge = document.createElement('div')
  badge.className =
    'transition px-2 h-7 ml-4 min-w-[2rem] rounded-lg text-sm font-bold text-[var(--btn-content)] dark:text-[var(--deep-text)] bg-[oklch(0.95_0.025_var(--hue))] dark:bg-[var(--primary)] flex items-center justify-center'
  badge.textContent = String(category.count)

  row.append(name, badge)
  link.append(row)
  return link
}

function setLoadLabel(loadButton: HTMLButtonElement, text: string): void {
  const label = loadButton.querySelector<HTMLElement>(
    '[data-categories-load-label]',
  )
  if (label) {
    label.textContent = text
    return
  }
  loadButton.textContent = text
}

function setLoadState(loadButton: HTMLButtonElement, text: string): void {
  setLoadLabel(loadButton, text)
  loadButton.setAttribute('aria-busy', 'true')
  loadButton.disabled = true
}

function clearLoadState(loadButton: HTMLButtonElement, text: string): void {
  setLoadLabel(loadButton, text)
  loadButton.removeAttribute('aria-busy')
  loadButton.disabled = false
}

export async function renderSidebarCategories(
  root: HTMLElement,
): Promise<boolean> {
  const endpoint = root.dataset.categoriesEndpoint
  const list = root.querySelector<HTMLElement>('[data-categories-list]')
  const loadButton = root.querySelector<HTMLButtonElement>(
    '[data-categories-load]',
  )
  if (!endpoint || !list || !loadButton) return false

  setLoadState(loadButton, '加载中')

  try {
    const response = await fetch(endpoint, {
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to load categories: ${response.status}`)
    }

    const categories = (await response.json()) as SidebarCategory[]
    const fragment = document.createDocumentFragment()
    for (const category of categories) {
      fragment.append(createCategoryLink(category))
    }

    list.replaceChildren(fragment)
    loadButton.removeAttribute('aria-busy')
    loadButton.hidden = true
    return true
  } catch (error) {
    console.error(error)
    clearLoadState(loadButton, '加载失败，重试')
    return false
  }
}
