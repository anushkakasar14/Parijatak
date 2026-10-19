import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { env } from '../config/env.ts'
import { enquiryModel } from '../models/enquiryModel.ts'
import { integrationStatusModel } from '../models/integrationStatusModel.ts'
import { toCsv } from '../utils/csv.ts'
import { HttpError } from '../utils/httpError.ts'
import { enquiryStatusLabels } from './enquiryController.ts'

export const SHEETS_FEED = 'google-sheets-feed'
const FEED_LIMIT = 5000

/** Compares without revealing, through timing, how much of the key was right. */
function keyMatches(given: string, expected: string): boolean {
  const hash = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(hash(given), hash(expected))
}

/** "+919876543210" → "+91 98765 43210": easier to read, and kept as text by the sheet. */
const readablePhone = (phone: string) => (/^\+91\d{10}$/.test(phone) ? `${phone.slice(0, 3)} ${phone.slice(3, 8)} ${phone.slice(8)}` : phone)

const indiaParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/**
 * "14 Oct 2026 · 3:42 pm" in India time. The dot between date and time stops the sheet
 * turning it into a bare serial number, so it reads the same without any formatting.
 */
const readableDate = (iso: string) => {
  const p = Object.fromEntries(indiaParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.day} ${p.month} ${p.year} · ${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`
}

export const sheetsFeedController = {
  /**
   * Read-only CSV of all enquiries for a Google Sheet:
   * =IMPORTDATA("https://<site>/api/enquiries/feed.csv?key=<GOOGLE_SHEETS_FEED_KEY>")
   * Without the right key it answers "not found", as if it did not exist.
   */
  async feed(req: Request, res: Response) {
    const expected = env.GOOGLE_SHEETS_FEED_KEY
    const given = typeof req.query.key === 'string' ? req.query.key : ''
    if (!expected || !keyMatches(given, expected)) throw new HttpError(404, 'Not found')

    const { enquiries } = await enquiryModel.list({ limit: FEED_LIMIT, offset: 0 })
    // Oldest first, so existing rows stay where they are and new enquiries appear at the bottom.
    const rows = enquiries.reverse().map((e) => [
      readableDate(e.createdAt),
      e.name,
      e.email,
      readablePhone(e.phone),
      e.inquiryType,
      e.productName,
      e.message,
      enquiryStatusLabels[e.status] ?? e.status,
      e.source,
      e.id,
    ])

    await integrationStatusModel.recordSuccess(SHEETS_FEED, `${rows.length} enquiries`)

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      // Always fresh, never stored by a browser or CDN, never indexed.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    })
    res.send(
      toCsv(
        ['Received (India time)', 'Name', 'Email', 'Contact number', 'Inquiry type', 'Product', 'Message', 'Status', 'Source', 'Reference'],
        rows,
        // No byte-order mark (IMPORTDATA would show it), and formula-like text kept as plain text.
        { bom: false, neutralise: 'space' },
      ),
    )
  },
}
