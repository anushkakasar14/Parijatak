import { JWT } from 'google-auth-library'
import { env } from '../config/env.ts'
import type { Enquiry } from '../models/enquiryModel.ts'

const TIMEOUT_MS = 8000

const isConfigured = Boolean(
  env.GOOGLE_SHEETS_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.googlePrivateKey,
)

// Created once; the client caches and refreshes its own access token.
const client = isConfigured
  ? new JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: env.googlePrivateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
  : null

/** Column order of the sheet. Add this as the header row of the spreadsheet. */
export const SHEET_COLUMNS = [
  'Created At',
  'Enquiry ID',
  'Name',
  'Email',
  'Phone',
  'Inquiry Type',
  'Product',
  'Message',
  'Source',
  'Status',
] as const

export const googleSheetsService = {
  isConfigured,

  /**
   * Appends one enquiry as a new row. Throws on failure — the caller decides what to do;
   * the database, not the sheet, is the source of truth.
   */
  async appendEnquiry(enquiry: Enquiry): Promise<void> {
    if (!client) return

    const row = [
      enquiry.createdAt,
      enquiry.id,
      enquiry.name,
      enquiry.email,
      enquiry.phone,
      enquiry.inquiryType,
      enquiry.productName ?? '',
      enquiry.message,
      enquiry.source,
      enquiry.status,
    ]

    const range = encodeURIComponent(env.GOOGLE_SHEETS_RANGE)
    await client.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_ID}/values/${range}:append`,
      method: 'POST',
      // RAW stores text exactly as sent, so user input can never run as a spreadsheet formula.
      params: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
      data: { values: [row] },
      timeout: TIMEOUT_MS,
    })
  },
}
