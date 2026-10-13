import type { Request } from 'express'

/**
 * The visitor's IP address.
 *
 * On Netlify the real address arrives in Netlify's own header. That header is trusted
 * ONLY when the code is actually running as a Netlify function (the function entry point
 * sets PARIJATAK_RUNTIME) — on a standalone server anyone could send it to dodge limits.
 */
export function getClientIp(req: Request): string {
  if (process.env.PARIJATAK_RUNTIME === 'netlify') {
    const forwarded = req.get('x-nf-client-connection-ip')
    if (forwarded) return forwarded
  }
  return req.ip ?? 'unknown'
}
