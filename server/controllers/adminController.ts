import type { Request, Response } from 'express'
import { z } from 'zod'
import { offerModel } from '../models/contentModels.ts'
import { enquiryModel } from '../models/enquiryModel.ts'
import { productModel } from '../models/productModel.ts'
import { googleSheetsService } from '../services/googleSheetsService.ts'
import { indiaDayRange } from '../utils/indiaDate.ts'
import { env } from '../config/env.ts'
import { integrationStatusModel } from '../models/integrationStatusModel.ts'
import { SHEETS_FEED } from './sheetsFeedController.ts'

const rangeSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((r) => !r.from || !r.to || r.from <= r.to, { message: 'The start date must be before the end date', path: ['to'] })


export const adminController = {
  /** Everything the dashboard's first screen shows, in one request. Optional `from`/`to` dates narrow the enquiry figures. */
  async overview(req: Request, res: Response) {
    const range = rangeSchema.parse(req.query)
    // One query after another: a request should hold a single database connection.
    const days = indiaDayRange(range)
    const enquiries = await enquiryModel.stats(days)
    const products = await productModel.counts()
    const offers = await offerModel.counts()
    const recent = await enquiryModel.list({
      limit: 5,
      offset: 0,
      ...days,
    })
    const recentProducts = await productModel.adminList({ sort: 'updated', limit: 5, offset: 0 })

    res.json({
      success: true,
      data: {
        range: { from: range.from ?? null, to: range.to ?? null },
        enquiries,
        products,
        offers,
        googleSheets: {
          configured: googleSheetsService.isConfigured(),
          mode: googleSheetsService.mode(),
          // Waiting enquiries of any date, not only those in the chosen range.
          pending: range.from || range.to ? (await enquiryModel.stats()).unsynced : enquiries.unsynced,
          // The formula feed: on or off, and when Google last actually read it.
          feed: { enabled: Boolean(env.GOOGLE_SHEETS_FEED_KEY), ...(await integrationStatusModel.get(SHEETS_FEED)) },
        },
        recentEnquiries: recent.enquiries,
        recentProducts: recentProducts.products.map(({ id, name, status, imageUrl, updatedAt, category }) => ({
          id,
          name,
          status,
          imageUrl,
          updatedAt,
          category,
        })),
      },
    })
  },

  /** Asks Google now whether the sheet can be reached. The answer is never assumed. */
  async googleSheetsHealth(_req: Request, res: Response) {
    res.json({ success: true, data: await googleSheetsService.checkConnection() })
  },
}
