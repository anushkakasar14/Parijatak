import { JWT } from 'google-auth-library'
import { env } from '../config/env.ts'
import type { Enquiry } from '../models/enquiryModel.ts'

const TIMEOUT_MS = 6000
const API = 'https://sheets.googleapis.com/v4/spreadsheets'

/** Columns A–I of the "Parijatak Customer Enquiries" sheet. */
export const SHEET_COLUMNS = [
  'Date',
  'Name',
  'Email',
  'Contact Number',
  'Inquiry Type',
  'Product',
  'Message',
  'Source',
  'Status',
] as const

// Created on first use; the client caches and refreshes its own access token.
let client: JWT | undefined
function getClient(): JWT {
  client ??= new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.googlePrivateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return client
}

/** A1 range within the configured tab (or the first tab when none is set). */
function range(cells: string): string {
  const tab = env.GOOGLE_SHEETS_TAB
  return encodeURIComponent(tab ? `'${tab.replace(/'/g, "''")}'!${cells}` : cells)
}

/** e.g. "2026-10-12 15:42" in India Standard Time — readable and sortable. */
function formatDate(iso: string): string {
  return new Date(iso)
    .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata', hour12: false })
    .slice(0, 16)
}

let headerChecked = false

/** Writes the header row if the sheet is still empty. Runs once per server start. */
async function ensureHeader(): Promise<void> {
  if (headerChecked) return

  const { data } = await getClient().request<{ values?: string[][] }>({
    url: `${API}/${env.GOOGLE_SHEETS_ID}/values/${range('A1:I1')}`,
    timeout: TIMEOUT_MS,
  })

  if (!data.values?.length) {
    await getClient().request({
      url: `${API}/${env.GOOGLE_SHEETS_ID}/values/${range('A1:I1')}`,
      method: 'PUT',
      params: { valueInputOption: 'RAW' },
      data: { values: [SHEET_COLUMNS] },
      timeout: TIMEOUT_MS,
    })
  }
  headerChecked = true
}

export const googleSheetsService = {
  isConfigured(): boolean {
    return Boolean(env.GOOGLE_SHEETS_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.googlePrivateKey)
  },

  /**
   * Appends one enquiry as a new row. Throws on failure — the caller decides what to do;
   * the database, not the sheet, is the source of truth.
   */
  async addEnquiryToGoogleSheet(enquiry: Enquiry): Promise<void> {
    await ensureHeader()

    const row = [
      formatDate(enquiry.createdAt),
      enquiry.name,
      enquiry.email,
      enquiry.phone,
      enquiry.inquiryType,
      enquiry.productName ?? '',
      enquiry.message,
      enquiry.source,
      enquiry.status,
    ]

    await getClient().request({
      url: `${API}/${env.GOOGLE_SHEETS_ID}/values/${range('A:I')}:append`,
      method: 'POST',
      // RAW stores text exactly as sent, so user input can never run as a spreadsheet formula.
      params: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
      data: { values: [row] },
      timeout: TIMEOUT_MS,
    })
  },
}
