/**
 * Identifies an image from its first bytes — never from the file name or the type the
 * browser claims — and reads its pixel size from the header without decoding it.
 */

export interface ImageInfo {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp'
  extension: 'jpg' | 'png' | 'webp'
  width: number | null
  height: number | null
}

function jpegSize(b: Buffer): { width: number; height: number } | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]
    // Start-of-frame markers carry the size; C4, C8 and CC are other segment types.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

function webpSize(b: Buffer): { width: number; height: number } | null {
  const chunk = b.toString('ascii', 12, 16)
  if (chunk === 'VP8 ' && b.length >= 30) {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
  }
  if (chunk === 'VP8L' && b.length >= 25) {
    const bits = b.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X' && b.length >= 30) {
    return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 }
  }
  return null
}

/** Returns the image's real type and size, or null if the bytes are not a supported image. */
export function inspectImage(b: Buffer): ImageInfo | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const size = jpegSize(b)
    return { contentType: 'image/jpeg', extension: 'jpg', width: size?.width ?? null, height: size?.height ?? null }
  }
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: 'image/png', extension: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }
  if (b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const size = webpSize(b)
    return { contentType: 'image/webp', extension: 'webp', width: size?.width ?? null, height: size?.height ?? null }
  }
  return null
}
