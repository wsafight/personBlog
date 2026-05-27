function createTagLink(tagName: string, tagBase: string): HTMLAnchorElement {
  const link = document.createElement('a')
  const normalizedBase = tagBase.endsWith('/') ? tagBase : `${tagBase}/`
  link.setAttribute('href', `${normalizedBase}${tagName}/`)
  link.setAttribute('aria-label', `View all posts with the ${tagName} tag`)
  link.className = 'btn-regular h-8 text-sm px-3 rounded-lg'
  link.textContent = tagName
  return link
}

function setLoadLabel(loadButton: HTMLButtonElement, text: string): void {
  const label = loadButton.querySelector<HTMLElement>('[data-tags-load-label]')
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

export async function renderSidebarTags(root: HTMLElement): Promise<boolean> {
  const endpoint = root.dataset.tagsEndpoint
  const tagBase = root.dataset.tagBase
  const list = root.querySelector<HTMLElement>('[data-tags-list]')
  const loadButton = root.querySelector<HTMLButtonElement>('[data-tags-load]')
  if (!endpoint || !tagBase || !list || !loadButton) return false

  setLoadState(loadButton, '加载中')

  try {
    const response = await fetch(endpoint, {
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to load tags: ${response.status}`)
    }

    const tags = (await response.json()) as string[]
    const fragment = document.createDocumentFragment()
    for (const tagName of tags) {
      fragment.append(createTagLink(tagName, tagBase))
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
