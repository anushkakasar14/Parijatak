import type { Request, Response } from 'express'
import { enquiryModel } from '../models/enquiryModel.ts'
import { productModel } from '../models/productModel.ts'
import { googleSheetsService } from '../services/googleSheetsService.ts'

export const adminController = {
  /** Everything the dashboard's first screen shows, in one request. */
  async overview(_req: Request, res: Response) {
    // One query after another: a request should hold a single database connection.
    const enquiries = await enquiryModel.stats()
    const products = await productModel.counts()
    const recent = await enquiryModel.list({ limit: 5, offset: 0 })

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
