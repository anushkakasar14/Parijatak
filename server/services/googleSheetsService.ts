import { JWT } from 'google-auth-library'
import { env } from '../config/env.ts'
import type { Enquiry } from '../models/enquiryModel.ts'
import { formatIndiaDateTime } from '../utils/indiaDate.ts'

const TIMEOUT_MS = 8000
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

/**
 * Two ways to reach the sheet:
 *  - 'apps-script': the sheet's own Apps Script web app (docs/google-sheets-apps-script.js).
 *    Nothing to set up in Google Cloud.
 *  - 'service-account': the Sheets API with a Google Cloud service account.
 * The Apps Script is used when both are set.
 */
export type SheetsMode = 'apps-script' | 'service-account'

export interface SheetsHealth {
  /** True only when Google answered just now and accepted our credentials. */
  ok: boolean
  mode: SheetsMode | null
  message: string
  sheetTitle?: string
  checkedAt: string
}

function enquiryRow(enquiry: Enquiry): string[] {
  return [
    formatIndiaDateTime(enquiry.createdAt),
    enquiry.name,
    enquiry.email,
    enquiry.phone,
    enquiry.inquiryType,
    enquiry.productName ?? '',
    enquiry.message,
    enquiry.source,
    enquiry.status,
  ]
}

// ── Apps Script web app ─────────────────────────────────────────────────────────

interface ScriptReply {
  ok?: boolean
  error?: string
  sheetTitle?: string
  duplicate?: boolean
}

/**
 * Posts to the web app. Google answers with a redirect to the script's output, which
 * fetch follows. Error messages never include the web app address or the token.
 */
async function callScript(payload: Record<string, unknown>): Promise<ScriptReply> {
  let response: Response
  try {
    response = await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, token: env.GOOGLE_SHEETS_WEBHOOK_TOKEN }),
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(
      err instanceof Error && err.name === 'TimeoutError'
        ? 'Google Apps Script did not answer in time'
        : 'Could not reach Google Apps Script',
    )
  }

  const text = await response.text()
  let reply: ScriptReply
  try {
    reply = JSON.parse(text) as ScriptReply
  } catch {
    // A sign-in or error page instead of the script's answer.
    throw new Error(
      response.status === 404
        ? 'The Apps Script web app was not found. Check the deployment address.'
        : /function not found/i.test(text)
          ? 'The deployed Apps Script has no doPost function. Paste the script, save, and deploy a new version.'
          : 'The Apps Script web app did not answer as expected. Check it is deployed with "Who has access: Anyone".',
    )
  }
  if (!reply.ok) {
    throw new Error(
      reply.error === 'unauthorized'
        ? 'The token in the Apps Script does not match the website’s token'
        : `Apps Script reported: ${String(reply.error ?? 'unknown error').slice(0, 200)}`,
    )
  }
  return reply
}

// ── Service account ─────────────────────────────────────────────────────────────

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

/** A readable reason from a Google API error, without request details. */
function googleError(err: unknown): string {
  const status = (err as { response?: { status?: number } }).response?.status
  if (status === 403) return 'Google refused access. Share the sheet with the service account as Editor.'
  if (status === 404) return 'The spreadsheet was not found. Check GOOGLE_SHEETS_ID.'
  return err instanceof Error ? err.message.slice(0, 200) : 'Unknown error'
}

// ── Public interface ────────────────────────────────────────────────────────────

export const googleSheetsService = {
  mode(): SheetsMode | null {
    if (env.GOOGLE_SHEETS_WEBHOOK_URL && env.GOOGLE_SHEETS_WEBHOOK_TOKEN) return 'apps-script'
    if (env.GOOGLE_SHEETS_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.googlePrivateKey) return 'service-account'
    return null
  },

  isConfigured(): boolean {
    return this.mode() !== null
  },

  /**
   * Appends one enquiry as a new row. Throws on failure — the caller decides what to do;
   * the database, not the sheet, is the source of truth.
   */
  async addEnquiryToGoogleSheet(enquiry: Enquiry): Promise<void> {
    if (this.mode() === 'apps-script') {
      // The script skips a reference it already has, so a retry never adds a second row.
      await callScript({ action: 'append', reference: enquiry.id, row: enquiryRow(enquiry) })
      return
    }

    await ensureHeader()
    await getClient().request({
      url: `${API}/${env.GOOGLE_SHEETS_ID}/values/${range('A:I')}:append`,
      method: 'POST',
      // RAW stores text exactly as sent, so user input can never run as a spreadsheet formula.
      params: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
      data: { values: [enquiryRow(enquiry)] },
      timeout: TIMEOUT_MS,
    })
  },

  /** Asks Google right now whether the sheet can be reached. Never throws. */
  async checkConnection(): Promise<SheetsHealth> {
    const mode = this.mode()
    const checkedAt = new Date().toISOString()
    if (!mode) {
      return { ok: false, mode, checkedAt, message: 'Google Sheets is not set up.' }
    }

    try {
      if (mode === 'apps-script') {
        const reply = await callScript({ action: 'ping' })
        return { ok: true, mode, checkedAt, sheetTitle: reply.sheetTitle, message: 'Connected.' }
      }
      const { data } = await getClient().request<{ properties?: { title?: string } }>({
        url: `${API}/${env.GOOGLE_SHEETS_ID}`,
        params: { fields: 'properties.title' },
        timeout: TIMEOUT_MS,
      })
      return { ok: true, mode, checkedAt, sheetTitle: data.properties?.title, message: 'Connected.' }
    } catch (err) {
      return {
        ok: false,
        mode,
        checkedAt,
        message: mode === 'apps-script' ? (err as Error).message : googleError(err),
      }
    }
  },
}
