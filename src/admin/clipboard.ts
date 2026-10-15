/**
 * Copies text to the clipboard. Uses the Clipboard API, and falls back to the older
 * copy command where that is refused (some embedded browsers and settings block it).
 * `near` should be an element in the open dialog, if any: outside a modal dialog the
 * page cannot be focused, so the fallback's temporary field is placed beside it.
 */
export async function copyText(text: string, near?: Element | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'
    const host = near?.closest('dialog') ?? document.body
    host.appendChild(field)
    field.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      field.remove()
    }
  }
}
