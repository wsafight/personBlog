const VISIBLE_CLASS = 'visible'
const DESKTOP_MIN_WIDTH = 1024

class TableOfContents extends HTMLElement {
  tocEl: HTMLElement | null = null
  observer: IntersectionObserver
  anchorNavTarget: HTMLElement | null = null
  headingIdxMap: Map<string, number> = new Map<string, number>()
  headings: HTMLElement[] = []
  sections: HTMLElement[] = []
  tocEntries: HTMLAnchorElement[] = []
  active: boolean[] = []
  activeIndicator: HTMLElement | null = null
  pendingUpdate: boolean = false
  initialized: boolean = false
  lastRangeStart: number = -1
  lastRangeEnd: number = -1
  lastScrollTop: number = Number.NaN
  cleanupAnimationListener: (() => void) | null = null

  constructor() {
    super()
    this.observer = new IntersectionObserver(this.markVisibleSection, {
      threshold: 0,
    })
  }

  scheduleUpdate = (): void => {
    if (this.pendingUpdate) return
    this.pendingUpdate = true
    requestAnimationFrame(() => {
      this.pendingUpdate = false
      this.update()
    })
  }

  markVisibleSection = (entries: IntersectionObserverEntry[]): void => {
    let changed = false
    entries.forEach(entry => {
      const id = entry.target.firstElementChild?.getAttribute('id')
      const idx = id ? this.headingIdxMap.get(id) : undefined
      if (idx !== undefined && this.active[idx] !== entry.isIntersecting) {
        this.active[idx] = entry.isIntersecting
        changed = true
      }

      if (
        entry.isIntersecting &&
        this.anchorNavTarget === entry.target.firstElementChild
      ) {
        this.anchorNavTarget = null
      }
    })

    if (!this.active.includes(true)) {
      changed = this.fallback() || changed
    }

    if (changed) {
      this.scheduleUpdate()
    }
  }

  getActiveRange(): { start: number; end: number } {
    let i = this.active.length - 1
    while (i >= 0 && !this.active[i]) {
      i--
    }

    if (i < 0) {
      return { start: -1, end: -1 }
    }

    let start = i
    let end = i
    while (i >= 0 && this.active[i]) {
      start = i
      i--
    }

    return { start, end }
  }

  toggleActiveHeading = (start: number, end: number): boolean => {
    if (
      start === this.lastRangeStart &&
      end === this.lastRangeEnd &&
      start !== -1
    ) {
      return false
    }

    this.tocEntries.forEach((entry, idx) => {
      entry.classList.toggle(VISIBLE_CLASS, idx >= start && idx <= end)
    })

    if (start >= 0 && end >= 0) {
      const top = this.tocEntries[start].offsetTop
      const bottom =
        this.tocEntries[end].offsetTop + this.tocEntries[end].offsetHeight
      this.activeIndicator?.style.setProperty('top', `${top}px`)
      this.activeIndicator?.style.setProperty('height', `${bottom - top}px`)
    }

    this.lastRangeStart = start
    this.lastRangeEnd = end
    return true
  }

  scrollToActiveHeading = (start: number, end: number): void => {
    if (this.anchorNavTarget || !this.tocEl || start < 0 || end < 0) return

    const topmost = this.tocEntries[start]
    const bottommost = this.tocEntries[end]
    const tocHeight = this.tocEl.clientHeight
    const currentTop = this.tocEl.scrollTop
    const currentBottom = currentTop + tocHeight
    const topPadding = 32
    const bottomPadding = 32
    const entryTop = topmost.offsetTop - topPadding
    const entryBottom =
      bottommost.offsetTop + bottommost.offsetHeight + bottomPadding

    if (entryTop >= currentTop && entryBottom <= currentBottom) {
      return
    }

    let nextTop = entryTop
    if (entryBottom - entryTop >= tocHeight * 0.9) {
      nextTop = bottommost.offsetTop - tocHeight * 0.8
    }

    if (Math.abs(this.lastScrollTop - nextTop) < 8) {
      return
    }

    this.lastScrollTop = nextTop
    this.tocEl.scrollTo({
      top: nextTop,
      left: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }

  update = (): void => {
    const { start, end } = this.getActiveRange()
    if (!this.toggleActiveHeading(start, end)) return
    this.scrollToActiveHeading(start, end)
  }

  fallback = (): boolean => {
    if (!this.sections.length) return false

    let changed = false
    for (let i = 0; i < this.sections.length; i++) {
      const offsetTop = this.sections[i].getBoundingClientRect().top
      const offsetBottom = this.sections[i].getBoundingClientRect().bottom
      const inViewport =
        this.isInRange(offsetTop, 0, window.innerHeight) ||
        this.isInRange(offsetBottom, 0, window.innerHeight) ||
        (offsetTop < 0 && offsetBottom > window.innerHeight)

      if (this.active[i] !== inViewport) {
        this.active[i] = inViewport
        changed = true
      }

      if (offsetTop > window.innerHeight) {
        break
      }
    }

    return changed
  }

  handleAnchorClick = (event: Event): void => {
    const anchor = event
      .composedPath()
      .find(element => element instanceof HTMLAnchorElement)

    if (anchor instanceof HTMLAnchorElement) {
      const id = decodeURIComponent(anchor.hash?.substring(1))
      const idx = this.headingIdxMap.get(id)
      this.anchorNavTarget = idx !== undefined ? this.headings[idx] : null
    }
  }

  isInRange(value: number, min: number, max: number): boolean {
    return min < value && value < max
  }

  connectedCallback(): void {
    if (this.initialized || window.innerWidth < DESKTOP_MIN_WIDTH) return

    const proseElement = document.querySelector('.prose')
    if (!proseElement) {
      this.init()
      return
    }

    const onAnimationEnd = (): void => {
      this.cleanupAnimationListener?.()
      this.cleanupAnimationListener = null
      this.init()
    }

    proseElement.addEventListener('animationend', onAnimationEnd, { once: true })
    this.cleanupAnimationListener = () => {
      proseElement.removeEventListener('animationend', onAnimationEnd)
    }

    const computedStyle = window.getComputedStyle(proseElement)
    const hasAnimation =
      computedStyle.animationName !== 'none' &&
      computedStyle.animationDuration !== '0s'

    if (!hasAnimation) {
      onAnimationEnd()
    }
  }

  init(): void {
    if (this.initialized || window.innerWidth < DESKTOP_MIN_WIDTH) return

    this.tocEl = document.getElementById('toc-inner-wrapper')
    if (!this.tocEl) return

    this.tocEntries = Array.from(this.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
    if (this.tocEntries.length === 0) return

    this.initialized = true
    this.activeIndicator = this.querySelector<HTMLElement>('#active-indicator')
    this.tocEl.addEventListener('click', this.handleAnchorClick, {
      capture: true,
    })

    this.sections = []
    this.headings = []
    this.headingIdxMap.clear()

    this.tocEntries.forEach(entry => {
      const id = decodeURIComponent(entry.hash?.substring(1))
      const heading = document.getElementById(id)
      const section = heading?.parentElement
      if (heading instanceof HTMLElement && section instanceof HTMLElement) {
        this.headingIdxMap.set(id, this.sections.length)
        this.headings.push(heading)
        this.sections.push(section)
      }
    })

    this.active = new Array(this.sections.length).fill(false)
    this.sections.forEach(section => {
      this.observer.observe(section)
    })

    this.fallback()
    this.scheduleUpdate()
  }

  disconnectedCallback(): void {
    this.cleanupAnimationListener?.()
    this.cleanupAnimationListener = null
    this.sections.forEach(section => {
      this.observer.unobserve(section)
    })
    this.observer.disconnect()
    this.tocEl?.removeEventListener('click', this.handleAnchorClick)
    this.initialized = false
  }
}

if (!customElements.get('table-of-contents')) {
  customElements.define('table-of-contents', TableOfContents)
}
