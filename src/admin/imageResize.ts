/**
 * Makes camera photos a sensible size for the website before they are uploaded: at most
 * MAX_EDGE pixels on the longest side, saved as a high-quality JPEG. Small images, and
 * PNGs (which may be transparent), are sent unchanged unless they are too large.
 * If the browser cannot process the image, the original file is returned and the
 * server's own checks still apply.
 */
const MAX_EDGE = 2400
const QUALITY = 0.86
/** Files at or under this size and edge length are left exactly as they are. */
const KEEP_UNDER_BYTES = 1.5 * 1024 * 1024

export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file

  let bitmap: ImageBitmap
  try {
    // Applies the photo's EXIF rotation, so portrait phone photos stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= MAX_EDGE && file.size <= KEEP_UNDER_BYTES) return file

    const scale = Math.min(1, MAX_EDGE / longest)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)

    const keepPng = file.type === 'image/png'
    const type = keepPng ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY))
    // Keep the original if the result is not actually smaller (for example a small, already compressed photo).
    if (!blob || blob.size >= file.size) return file

    const name = keepPng ? file.name : file.name.replace(/\.(jpe?g|png|webp)$/i, '') + '.jpg'
    return new File([blob], name, { type, lastModified: file.lastModified })
  } finally {
    bitmap.close()
  }
}

/** Sorts file names the way people number them: 1, 1.1, 1.2, 2, 2.1, 10 — not 1, 10, 2. */
export const byFileName = (a: File, b: File) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
