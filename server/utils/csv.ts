/**
 * CSV for spreadsheets. Text that a spreadsheet would treat as a formula (starting with
 * = + - @, or a tab/carriage return) is neutralised, so customer input can never run
 * when the file is opened in Excel or Google Sheets:
 *  - 'apostrophe' (files people open): Excel hides a leading apostrophe and keeps the text.
 *  - 'space' (Google Sheets IMPORTDATA, which would show an apostrophe): a leading space
 *    keeps the value as plain text, and phone numbers keep their "+91".
 */
type Neutralise = 'apostrophe' | 'space'

function cell(value: string | number | null | undefined, neutralise: Neutralise): string {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `${neutralise === 'space' ? ' ' : "'"}${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Rows to CSV text with Windows line endings. By default it starts with a byte-order
 * mark, so Excel reads UTF-8 (₹, Hindi, Marathi) correctly.
 */
export function toCsv(
  header: readonly string[],
  rows: (string | number | null | undefined)[][],
  { bom = true, neutralise = 'apostrophe' }: { bom?: boolean; neutralise?: Neutralise } = {},
): string {
  const lines = [header, ...rows].map((row) => row.map((value) => cell(value, neutralise)).join(','))
  return (bom ? '﻿' : '') + lines.join('\r\n') + '\r\n'
}
