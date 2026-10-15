/**
 * Parijatak — receives website enquiries and adds them to this spreadsheet.
 *
 * Setup (in the Google Sheet): Extensions → Apps Script → replace everything with this
 * file → set TOKEN below → Save → Deploy → New deployment → type "Web app",
 * Execute as "Me", Who has access "Anyone" → Deploy → allow access → copy the web app URL.
 *
 * The website then needs two Netlify environment variables:
 *   GOOGLE_SHEETS_WEBHOOK_URL   = the web app URL (ends in /exec)
 *   GOOGLE_SHEETS_WEBHOOK_TOKEN = the same TOKEN as below
 *
 * "Anyone" only means the address can be called without a Google sign-in. Every request
 * must carry the TOKEN, so nobody else can add rows, and nothing can be read through it.
 */

// The shared secret. Must match GOOGLE_SHEETS_WEBHOOK_TOKEN on the website exactly.
const TOKEN = 'PASTE-THE-TOKEN-HERE'

const HEADER = [
  'Date',
  'Name',
  'Email',
  'Contact Number',
  'Inquiry Type',
  'Product',
  'Message',
  'Source',
  'Status',
  'Reference',
]

function doPost(e) {
  let request
  try {
    request = JSON.parse(e.postData.contents)
  } catch (err) {
    return reply({ ok: false, error: 'bad request' })
  }
  if (!request || request.token !== TOKEN || TOKEN === 'PASTE-THE-TOKEN-HERE') {
    return reply({ ok: false, error: 'unauthorized' })
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]

  if (request.action === 'ping') {
    return reply({ ok: true, sheetTitle: SpreadsheetApp.getActiveSpreadsheet().getName() })
  }

  if (request.action === 'append') {
    const reference = String(request.reference || '')
    const row = Array.isArray(request.row) ? request.row.slice(0, HEADER.length - 1) : null
    if (!reference || !row) return reply({ ok: false, error: 'bad request' })

    // One request at a time, so two retries cannot both add the same enquiry.
    const lock = LockService.getScriptLock()
    lock.waitLock(20000)
    try {
      if (sheet.getLastRow() === 0) sheet.appendRow(HEADER)

      const references = sheet.getRange(1, HEADER.length, sheet.getLastRow(), 1).getValues()
      if (references.some((r) => String(r[0]) === reference)) {
        return reply({ ok: true, duplicate: true })
      }

      // A leading apostrophe makes the sheet keep text as text: customer input that starts
      // with = + - or @ is never run as a formula, and phone numbers keep their "+91".
      const safe = row.concat([reference]).map((value) => {
        const text = String(value == null ? '' : value)
        return /^[=+\-@]/.test(text) ? "'" + text : text
      })
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, safe.length).setValues([safe])
      return reply({ ok: true })
    } finally {
      lock.releaseLock()
    }
  }

  return reply({ ok: false, error: 'unknown action' })
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON)
}
