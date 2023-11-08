export { prefetch }
export { addLinkPrefetchHandlers }

import { assert, assertClientRouting, assertUsage, checkIfClientRouting, objectAssign } from './utils.js'
import { isErrorFetchingStaticAssets, loadPageFilesClientSide } from '../shared/loadPageFilesClientSide.js'
import { skipLink } from './skipLink.js'
import { getPrefetchSettings } from './prefetch/getPrefetchSettings.js'
import { isAlreadyPrefetched, markAsAlreadyPrefetched } from './prefetch/alreadyPrefetched.js'
import { disableClientRouting } from './installClientRouter.js'
import { isExternalLink } from './isExternalLink.js'
import { isClientSideRoutable } from './isClientSideRoutable.js'
import { createPageContext } from './createPageContext.js'
import { route, type PageContextFromRoute } from '../../shared/route/index.js'

assertClientRouting()

const linkPrefetchHandlerAdded = new Map<HTMLElement, true>()

/**
 * Programmatically prefetch client assets.
 *
 * https://vike.dev/prefetch
 *
 * @param url - The URL of the page you want to prefetch.
 */
async function prefetch(url: string): Promise<void> {
  assertUsage(checkIfClientRouting(), 'prefetch() only works with Client Routing, see https://vike.dev/prefetch', {
    showStackTrace: true
  })
  assertUsage(
    !isExternalLink(url),
    `You are trying to prefetch the URL ${url} of another domain which cannot be prefetched`,
    { showStackTrace: true }
  )

  if (isAlreadyPrefetched(url)) return
  markAsAlreadyPrefetched(url)

  const pageContext = await createPageContext(url)
  const pageContextFromRoute = await route(pageContext)
  objectAssign(pageContext, pageContextFromRoute)
  const { _pageId: pageId, _pageFilesAll: pageFilesAll, _pageConfigs: pageConfigs } = pageContext
  if (pageId) {
    try {
      await loadPageFilesClientSide(pageFilesAll, pageConfigs, pageId)
    } catch (err) {
      if (isErrorFetchingStaticAssets(err)) {
        disableClientRouting(err, true)
      } else {
        throw err
      }
    }
  }
}

function addLinkPrefetchHandlers(pageContext: {
  exports: Record<string, unknown>
  _isProduction: boolean
  urlPathname: string
}) {
  // Current URL is already prefetched
  markAsAlreadyPrefetched(pageContext.urlPathname)

  const linkTags = [...document.getElementsByTagName('A')] as HTMLElement[]
  linkTags.forEach((linkTag) => {
    if (linkPrefetchHandlerAdded.has(linkTag)) return
    linkPrefetchHandlerAdded.set(linkTag, true)

    const url = linkTag.getAttribute('href')

    if (skipLink(linkTag)) return
    assert(url)

    if (isAlreadyPrefetched(url)) return

    const { prefetchStaticAssets } = getPrefetchSettings(pageContext, linkTag)
    if (!prefetchStaticAssets) return

    if (prefetchStaticAssets === 'hover') {
      linkTag.addEventListener('mouseover', () => {
        prefetchIfClientSideRoutable(url)
      })
      linkTag.addEventListener(
        'touchstart',
        () => {
          prefetchIfClientSideRoutable(url)
        },
        { passive: true }
      )
    }

    if (prefetchStaticAssets === 'viewport') {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            prefetchIfClientSideRoutable(url)
            observer.disconnect()
          }
        })
      })
      observer.observe(linkTag)
    }
  })
}

async function prefetchIfClientSideRoutable(url: string): Promise<void> {
  const pageContext = await createPageContext(url)
  let pageContextFromRoute: PageContextFromRoute
  try {
    pageContextFromRoute = await route(pageContext)
  } catch {
    // If a route() hook has a bug or `throw render()` / `throw redirect()`
    return
  }
  objectAssign(pageContext, pageContextFromRoute)
  if (!(await isClientSideRoutable(pageContext))) return
  await prefetch(url)
}
