import type { Request, Response } from 'express'
import { enquiryModel } from '../models/enquiryModel.ts'
import { productModel } from '../models/productModel.ts'
import { googleSheetsService } from '../services/googleSheetsService.ts'

export const adminController = {
  /** Everything the dashboard's first screen shows, in one request. */
  async overview(_req: Request, res: Response) {
    const [enquiries, products, recent] = await Promise.all([
      enquiryModel.stats(),
      productModel.counts(),
      enquiryModel.list({ limit: 5, offset: 0 }),
    ])

    res.json({
      success: true,
      data: {
        enquiries,
        products,
        googleSheets: {
          configured: googleSheetsService.isConfigured(),
          pending: enquiries.unsynced,
        },
        recentEnquiries: recent.enquiries,
      },
    })
  },
}
