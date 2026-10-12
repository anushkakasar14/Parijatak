import { enquiryModel } from '../models/enquiryModel.ts'
import type { Enquiry } from '../models/enquiryModel.ts'
import { productModel } from '../models/productModel.ts'
import { HttpError } from '../utils/httpError.ts'
import { errorMessage, logger } from '../utils/logger.ts'
import type { CreateEnquiryInput } from '../utils/schemas.ts'
import { googleSheetsService } from './googleSheetsService.ts'

export const enquiryService = {
  /**
   * Validated input → database → Google Sheets.
   * The enquiry is safely stored before the sheet is touched, so a Sheets failure
   * is logged and swallowed rather than failing the customer's submission.
   */
  async submit(input: CreateEnquiryInput): Promise<Enquiry> {
    let productName: string | null = null

    if (input.productId) {
      const product = productModel.findActiveByIdOrSlug(input.productId)
      if (!product) {
        throw new HttpError(400, 'Please check the details you entered.', {
          productId: 'This product could not be found',
        })
      }
      productName = product.name
    }

    const enquiry = enquiryModel.create({ ...input, productName, source: 'website' })

    if (googleSheetsService.isConfigured) {
      try {
        await googleSheetsService.appendEnquiry(enquiry)
      } catch (err) {
        // Log only the id and the error message — never the enquiry contents or credentials.
        logger.error('Google Sheets sync failed; enquiry is saved in the database', {
          enquiryId: enquiry.id,
          error: errorMessage(err),
        })
      }
    }

    return enquiry
  },
}
