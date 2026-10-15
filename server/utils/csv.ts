/**
 * CSV for spreadsheets. Text that a spreadsheet would treat as a formula (starting with
 * = + - @, or a tab/carriage return) is prefixed with an apostrophe, so customer input
 * can never run when the file is opened in Excel or Google Sheets.
 */
function cell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Rows to CSV text with Windows line endings and a byte-order mark, so Excel reads UTF-8 (₹, Hindi, Marathi) correctly. */
export function toCsv(header: readonly string[], rows: (string | number | null | undefined)[][]): string {
  return '﻿' + [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
