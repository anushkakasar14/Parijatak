import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { defaultSections, defaultSettings } from '../../shared/defaultContent'
import type { SectionId } from '../../shared/defaultContent'
import { useResource } from '../hooks/useResource'
import { buildWhatsappUrl, formatWhatsappNumber } from '../lib/whatsapp'
import type { PageData, SectionContent, SiteSettings } from '../types'

interface SiteState {
  settings: SiteSettings
  /** wa.me link to the studio's number, with an optional pre-filled message. */
  whatsappUrl: (message?: string) => string
  /** The WhatsApp number written for people, e.g. "+91 80806 57140". */
  whatsappDisplay: string
}

const SiteContext = createContext<SiteState | null>(null)

/**
 * Brand, contact and social details, loaded from the database through GET /api/site.
 * Until the answer arrives — or if the API cannot be reached — the last details this
 * browser saw are used, and failing that the built-in defaults, so the header, footer
 * and WhatsApp buttons always work.
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const { data } = useResource<Partial<SiteSettings>>('/site', { remember: true })

  const value = useMemo<SiteState>(() => {
    const settings: SiteSettings = { ...defaultSettings, ...data }
    const number = settings.contact.whatsappNumber || defaultSettings.contact.whatsappNumber
    return {
      settings,
      whatsappUrl: (message) => buildWhatsappUrl(number, message),
      whatsappDisplay: formatWhatsappNumber(number),
    }
  }, [data])

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite(): SiteState {
  const value = useContext(SiteContext)
  if (!value) throw new Error('useSite must be used inside <SiteProvider>')
  return value
}

type Page = 'home' | 'about' | 'collection'

/**
 * The editable text blocks of a page, from GET /api/pages/:page.
 *
 * `ready` is false only on a first visit while the text is loading; pages keep their
 * wording hidden for that moment rather than flashing the defaults and then swapping.
 * If the request fails, the built-in wording is shown.
 */
export function usePageSections(page: Page) {
  const { data, status } = useResource<PageData>(`/pages/${page}`, { remember: true })

  const section = useCallback(
    (id: SectionId): SectionContent => data?.sections[id] ?? defaultSections[id],
    [data],
  )

  return { section, ready: status !== 'loading' }
}
