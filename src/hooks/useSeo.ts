import { useEffect } from 'react'
import { site } from '../config/site'

function setMeta(selector: string, content: string) {
  document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content)
}

/** Sets the document title and description / Open Graph tags for the current page. */
export function useSeo(title: string = site.title, description: string = site.description) {
  useEffect(() => {
    document.title = title
    setMeta('meta[name="description"]', description)
    setMeta('meta[property="og:title"]', title)
    setMeta('meta[property="og:description"]', description)
  }, [title, description])
}
