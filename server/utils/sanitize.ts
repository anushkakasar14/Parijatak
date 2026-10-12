// Control characters except tab (\x09), newline (\x0A) and carriage return (\x0D).
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
const HTML_TAGS = /<\/?[a-z][^>]*>/gi

/** Cleans free text that may span several lines (e.g. the enquiry message). */
export function sanitizeText(value: string): string {
  return value.replace(CONTROL_CHARS, '').replace(HTML_TAGS, '').trim()
}

/** Cleans single-line text (names etc.): also collapses all whitespace runs. */
export function sanitizeLine(value: string): string {
  return sanitizeText(value).replace(/\s+/g, ' ')
}
