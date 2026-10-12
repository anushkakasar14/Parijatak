import { getDb } from '../config/database.ts'
import { enquiryModel } from '../models/enquiryModel.ts'
import type { Enquiry, NewEnquiry } from '../models/enquiryModel.ts'
import { productModel } from '../models/productModel.ts'
import { HttpError } from '../utils/httpError.ts'
import { errorMessage, logger } from '../utils/logger.ts'
import type { CreateEnquiryInput } from '../utils/schemas.ts'
import { googleSheetsService } from './googleSheetsService.ts'

/** An identical enquiry from the same person inside this window is treated as a double submit. */
const DUPLICATE_WINDOW_MINUTES = 10

/**
 * Copies one enquiry to Google Sheets and records that it was synced.
 * Never throws: a Sheets failure is logged and the enquiry stays marked "to sync".
 */
async function syncToSheet(enquiry: Enquiry): Promise<boolean> {
  try {
    await googleSheetsService.addEnquiryToGoogleSheet(enquiry)
    await enquiryModel.markSheetSynced(enquiry.id)
    return true
  } catch (err) {
    // Log only the id and the error message — never the enquiry contents or credentials.
    logger.error('Google Sheets sync failed; enquiry is saved in the database', {
      enquiryId: enquiry.id,
      error: errorMessage(err),
    })
    return false
  }
}

export const enquiryService = {
  /**
   * Validated input → database → Google Sheets.
   * The enquiry is committed to the database before the sheet is touched, so a Sheets
   * failure can never lose it or fail the customer's submission.
   */
  async submit(input: CreateEnquiryInput): Promise<{ enquiry: Enquiry; duplicate: boolean }> {
    let productName: string | null = null

    if (input.productId) {
      const product = await productModel.findActiveByIdOrSlug(input.productId)
      if (!product) {
        throw new HttpError(400, 'Please check the details you entered.', {
          productId: 'This product could not be found',
        })
      }
      productName = product.name
    }

    const candidate: NewEnquiry = { ...input, productName, source: 'website' }
    const db = await getDb()

    const result = await db.transaction(async (tx) => {
      // Serialise submissions from the same person so two simultaneous clicks
      // cannot both slip past the duplicate check.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${candidate.email}|${candidate.phone}`,
      ])

      const existing = await enquiryModel.findRecentDuplicate(
        candidate,
        DUPLICATE_WINDOW_MINUTES,
        tx,
      )
      if (existing) return { enquiry: existing, duplicate: true }

      return { enquiry: await enquiryModel.create(candidate, tx), duplicate: false }
    })

    if (result.duplicate) {
      logger.info('Duplicate enquiry ignored', { enquiryId: result.enquiry.id })
    } else if (googleSheetsService.isConfigured()) {
      await syncToSheet(result.enquiry)
    }

    return result
  },

  /** Retries enquiries that have not reached Google Sheets yet (e.g. after an outage). */
  async syncPending(limit = 100): Promise<{ synced: number; failed: number }> {
    if (!googleSheetsService.isConfigured()) {
      throw new HttpError(503, 'Google Sheets is not configured')
    }

    let synced = 0
    let failed = 0
    for (const enquiry of await enquiryModel.findUnsynced(limit)) {
      if (await syncToSheet(enquiry)) synced++
      else failed++
    }
    return { synced, failed }
  },
}
