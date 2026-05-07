export {}

const GISCUS_ORIGIN = 'https://giscus.app'
const GISCUS_SELECTOR = '.giscus'

type CommentsRuntimeState = {
  idleHandle?: number | null
  observer?: IntersectionObserver | null
}

const commentsRuntime = ((window as any).__commentsRuntime ??= {}) as CommentsRuntimeState

function disconnectObserver() {
  commentsRuntime.observer?.disconnect()
  commentsRuntime.observer = null
}

function cancelIdleLoad() {
  if (commentsRuntime.idleHandle == null) return

  if (window.cancelIdleCallback) {
    window.cancelIdleCallback(commentsRuntime.idleHandle)
  } else {
    window.clearTimeout(commentsRuntime.idleHandle)
  }

  commentsRuntime.idleHandle = null
}

function cleanup() {
  disconnectObserver()
  cancelIdleLoad()
}

function ensurePreconnect() {
  if (document.querySelector('link[data-giscus-preconnect]')) return

  const link = document.createElement('link')
  link.rel = 'preconnect'
  link.href = GISCUS_ORIGIN
  link.crossOrigin = 'anonymous'
  link.setAttribute('data-giscus-preconnect', '')
  document.head.append(link)
}

function loadGiscus(container: HTMLElement) {
  if (
    container.dataset.giscusLoaded === 'true' ||
    container.querySelector('iframe.giscus-frame, script[data-giscus-script]')
  ) {
    container.dataset.giscusLoaded = 'true'
    return
  }

  ensurePreconnect()
  container.dataset.giscusLoaded = 'true'

  const script = document.createElement('script')
  script.src = `${GISCUS_ORIGIN}/client.js`
  script.async = true
  script.crossOrigin = 'anonymous'
  script.setAttribute('data-giscus-script', '')
  script.setAttribute('data-repo', 'wsafight/personBlog')
  script.setAttribute('data-repo-id', 'MDEwOlJlcG9zaXRvcnk2ODUxMzI3NQ==')
  script.setAttribute('data-category', 'Announcements')
  script.setAttribute('data-category-id', 'DIC_kwDOBBVt-84CmJfS')
  script.setAttribute('data-mapping', 'pathname')
  script.setAttribute('data-strict', '0')
  script.setAttribute('data-reactions-enabled', '0')
  script.setAttribute('data-emit-metadata', '0')
  script.setAttribute('data-input-position', 'top')
  script.setAttribute('data-theme', 'preferred_color_scheme')
  script.setAttribute('data-lang', 'zh-CN')
  script.setAttribute('data-loading', 'lazy')
  container.append(script)
}

function scheduleGiscusLoad(container: HTMLElement) {
  cancelIdleLoad()

  const run = () => {
    commentsRuntime.idleHandle = null
    if (!document.contains(container)) return
    loadGiscus(container)
  }

  if (window.requestIdleCallback) {
    commentsRuntime.idleHandle = window.requestIdleCallback(run, {
      timeout: 1500,
    })
    return
  }

  commentsRuntime.idleHandle = window.setTimeout(run, 1000)
}

function initComments() {
  cleanup()

  const container = document.querySelector<HTMLElement>(GISCUS_SELECTOR)
  if (!container) return

  if (
    container.dataset.giscusLoaded === 'true' ||
    container.querySelector('iframe.giscus-frame, script[data-giscus-script]')
  ) {
    container.dataset.giscusLoaded = 'true'
    return
  }

  if (!('IntersectionObserver' in window)) {
    scheduleGiscusLoad(container)
    return
  }

  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      disconnectObserver()
      scheduleGiscusLoad(container)
    },
    {
      rootMargin: '800px 0px',
    },
  )

  observer.observe(container)
  commentsRuntime.observer = observer
}

initComments()
