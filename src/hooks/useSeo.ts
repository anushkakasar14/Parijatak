import { useEffect } from 'react'
import { site } from '../config/site'

const SITE_URL = 'https://www.studioparijatak.com'

function setMeta(selector: string, content: string) {
  document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content)
}

/**
 * Sets the document title and description / Open Graph tags for the current page, and its
 * official address on the www domain. `noindex` (the not-found page) asks search engines
 * not to list the page.
 */
export function useSeo(
  title: string = site.title,
  description: string = site.description,
  options: { noindex?: boolean } = {},
) {
  const { noindex = false } = options
  useEffect(() => {
    document.title = title
    setMeta('meta[name="description"]', description)
    setMeta('meta[property="og:title"]', title)
    setMeta('meta[property="og:description"]', description)

    const url = SITE_URL + window.location.pathname
    setMeta('meta[property="og:url"]', url)
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (noindex) canonical?.remove()
    else if (canonical) canonical.href = url
    else {
      const link = document.createElement('link')
      link.rel = 'canonical'
      link.href = url
      document.head.appendChild(link)
    }

    if (!noindex) return
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.appendChild(robots)
    return () => robots.remove()
  }, [title, description, noindex])
}
