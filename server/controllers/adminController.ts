import type { Request, Response } from 'express'
import { z } from 'zod'
import { offerModel } from '../models/contentModels.ts'
import { enquiryModel } from '../models/enquiryModel.ts'
import { productModel } from '../models/productModel.ts'
import { googleSheetsService } from '../services/googleSheetsService.ts'

const rangeSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((r) => !r.from || !r.to || r.from <= r.to, { message: 'The start date must be before the end date', path: ['to'] })

// Dates are whole days in India Standard Time.
const startOfDay = (d: string) => new Date(`${d}T00:00:00+05:30`)
const nextDay = (d: string) => new Date(startOfDay(d).getTime() + 24 * 60 * 60 * 1000)

export const adminController = {
  /** Everything the dashboard's first screen shows, in one request. Optional `from`/`to` dates narrow the enquiry figures. */
  async overview(req: Request, res: Response) {
    const range = rangeSchema.parse(req.query)
    // One query after another: a request should hold a single database connection.
    const enquiries = await enquiryModel.stats({
      from: range.from ? startOfDay(range.from) : undefined,
      to: range.to ? nextDay(range.to) : undefined,
    })
    const products = await productModel.counts()
    const offers = await offerModel.counts()
    const recent = await enquiryModel.list({
      limit: 5,
      offset: 0,
      from: range.from ? startOfDay(range.from) : undefined,
      to: range.to ? nextDay(range.to) : undefined,
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
          pending: enquiries.unsynced,
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
}
