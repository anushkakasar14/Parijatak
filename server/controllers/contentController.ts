import type { Request, Response } from 'express'
import {
  categoryModel,
  offerModel,
  sectionModel,
  settingsModel,
  slideModel,
} from '../models/contentModels.ts'
import type { Offer, PageSection, Slide } from '../models/contentModels.ts'
import { pageParam, publicSettingKeys } from '../utils/contentSchemas.ts'

/**
 * Public, read-only content. Every query here filters to what visitors are allowed to
 * see, and each response is shaped explicitly so internal fields cannot leak by accident.
 */

const publicSlide = ({ isActive: _a, status: _s, createdAt: _c, updatedAt: _u, ...slide }: Slide) => slide

const publicOffer = ({ status: _s, createdAt: _c, updatedAt: _u, ...offer }: Offer) => offer

function publicSections(sections: PageSection[]) {
  return Object.fromEntries(
    sections.map(({ id, eyebrow, heading, body, imageUrl, imageAlt, ctaLabel, ctaUrl }) => [
      id,
      { eyebrow, heading, body, imageUrl, imageAlt, ctaLabel, ctaUrl },
    ]),
  )
}

async function publicSettings() {
  const all = await settingsModel.all()
  return Object.fromEntries(publicSettingKeys.filter((key) => key in all).map((key) => [key, all[key]]))
}

export const contentController = {
  async categories(_req: Request, res: Response) {
    const categories = await categoryModel.list({ publishedOnly: true })
    res.json({ success: true, data: categories })
  },

  /** Everything the homepage needs, in one request. */
  async homepage(_req: Request, res: Response) {
    // One query after another: a request should hold a single database connection.
    const slides = await slideModel.listPublic()
    const sections = await sectionModel.list('home')
    const offers = await offerModel.listActive()
    const gallery = await settingsModel.get<{ items: unknown[] }>('gallery')
    res.json({
      success: true,
      data: {
        slides: slides.map(publicSlide),
        sections: publicSections(sections),
        offers: offers.map(publicOffer),
        gallery: gallery?.items ?? [],
      },
    })
  },

  async page(req: Request, res: Response) {
    const { page } = pageParam.parse(req.params)
    res.json({ success: true, data: { sections: publicSections(await sectionModel.list(page)) } })
  },

  /** Brand, contact and social details shown in the header, footer and WhatsApp links. */
  async site(_req: Request, res: Response) {
    res.json({ success: true, data: await publicSettings() })
  },

  async offers(_req: Request, res: Response) {
    res.json({ success: true, data: (await offerModel.listActive()).map(publicOffer) })
  },
}
