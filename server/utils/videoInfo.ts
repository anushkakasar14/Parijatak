/**
 * Recognises a video by its first bytes, never by its name or the type a browser claims.
 * Only formats every current browser plays are accepted: MP4 and WebM.
 */
export type VideoCheck =
  | { ok: true; contentType: 'video/mp4' | 'video/webm'; extension: 'mp4' | 'webm' }
  | { ok: false; reason: string }

export function inspectVideo(head: Buffer): VideoCheck {
  // MP4 / QuickTime: a box of type "ftyp" right at the start, followed by a brand.
  if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') {
    const brand = head.toString('latin1', 8, 12)
    if (brand === 'qt  ') {
      return { ok: false, reason: 'This is a QuickTime (.mov) video, which many browsers cannot play. Please convert it to MP4 first.' }
    }
    return { ok: true, contentType: 'video/mp4', extension: 'mp4' }
  }

  // WebM is Matroska (EBML header 1A 45 DF A3) with the document type "webm".
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) {
    const start = head.subarray(0, Math.min(head.length, 64)).toString('latin1')
    if (start.includes('webm')) return { ok: true, contentType: 'video/webm', extension: 'webm' }
    return { ok: false, reason: 'This is an MKV video, which many browsers cannot play. Please convert it to MP4 first.' }
  }

  return { ok: false, reason: 'Only MP4 and WebM videos can be uploaded.' }
}
