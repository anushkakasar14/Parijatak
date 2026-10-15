import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, test } from 'node:test'

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'memory://',
  ADMIN_API_KEY: '',
  GOOGLE_SHEETS_ID: '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
})

const { createApp } = await import('../app.ts')
const { closeDb, getDb } = await import('../config/database.ts')
const { authService } = await import('../services/authService.ts')
const { getMediaStorage } = await import('../services/mediaStorage.ts')
const { inspectImage } = await import('../utils/imageInfo.ts')

const ADMIN = { email: 'owner@parijatak.test', name: 'Owner', password: 'correct-horse-battery', role: 'admin' as const }
const VIEWER = { email: 'reader@parijatak.test', name: 'Reader', password: 'look-but-do-not-touch', role: 'viewer' as const }

let server: Server
let baseUrl: string
let admin: { cookie: string; csrf: string }
let viewer: { cookie: string; csrf: string }

const sql = async (text: string, params: unknown[] = []) => (await getDb()).query(text, params)

async function call(
  path: string,
  { method = 'GET', body, as = null, raw, headers = {} }: {
    method?: string
    body?: unknown
    as?: { cookie: string; csrf: string } | null
    raw?: Buffer
    headers?: Record<string, string>
  } = {},
) {
  const h: Record<string, string> = { Origin: baseUrl, ...headers }
  if (!raw) h['Content-Type'] = 'application/json'
  if (as) {
    h.Cookie = as.cookie
    h['X-CSRF-Token'] = as.csrf
  }
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: h,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
  const type = res.headers.get('content-type') ?? ''
  return {
    status: res.status,
    headers: res.headers,
    body: type.includes('json') ? ((await res.json()) as any) : Buffer.from(await res.arrayBuffer()),
  }
}

async function signIn(account: { email: string; password: string }) {
  const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify(account),
  })
  const body = (await res.json()) as any
  return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0], csrf: body.data.csrfToken }
}

// ── Tiny but genuine image headers ────────────────────────────────────────────────
function png(width: number, height: number) {
  const b = Buffer.alloc(40)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}
function jpeg(width: number, height: number) {
  // SOI, an APP0 segment, then SOF0 carrying the size.
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0])
  const sof = Buffer.alloc(19)
  sof.writeUInt16BE(0xffc0, 0)
  sof.writeUInt16BE(17, 2)
  sof[4] = 8
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])])
}
function webp(width: number, height: number) {
  const b = Buffer.alloc(30)
  b.write('RIFF', 0, 'ascii')
  b.writeUInt32LE(22, 4)
  b.write('WEBP', 8, 'ascii')
  b.write('VP8X', 12, 'ascii')
  b.writeUIntLE(width - 1, 24, 3)
  b.writeUIntLE(height - 1, 27, 3)
  return b
}

const upload = (file: Buffer, as = admin, name = 'loom photo.png', type = 'image/png') =>
  call('/admin/media', { method: 'POST', as, raw: file, headers: { 'Content-Type': type, 'X-Filename': encodeURIComponent(name) } })

before(async () => {
  await getDb()
  server = createApp().listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await authService.createAdmin(ADMIN)
  await authService.createAdmin(VIEWER)
})

after(async () => {
  server.close()
  await closeDb()
})

beforeEach(async () => {
  await sql(`DELETE FROM products WHERE id NOT IN ('bed-linens', 'cushion-covers', 'throws')`)
  await sql(`UPDATE products SET status = 'published', image_url = '/media/shoot-bench.jpg', category_id = id`)
  await sql(`DELETE FROM categories WHERE id NOT IN ('bed-linens', 'cushion-covers', 'throws')`)
  await sql(`UPDATE categories SET is_active = TRUE, description = NULL`)
  await sql(`DELETE FROM media_assets`)
  await sql(`DELETE FROM admin_sessions`)
  admin = await signIn(ADMIN)
  viewer = await signIn(VIEWER)
})

describe('image inspection', () => {
  test('recognises JPEG, PNG and WebP by their bytes and reads their size', () => {
    assert.deepEqual(inspectImage(png(1200, 800)), { contentType: 'image/png', extension: 'png', width: 1200, height: 800 })
    assert.deepEqual(inspectImage(jpeg(1920, 1080)), { contentType: 'image/jpeg', extension: 'jpg', width: 1920, height: 1080 })
    assert.deepEqual(inspectImage(webp(640, 480)), { contentType: 'image/webp', extension: 'webp', width: 640, height: 480 })
  })

  test('rejects anything else, whatever it is called', () => {
    assert.equal(inspectImage(Buffer.from('<svg onload="alert(1)"></svg>')), null)
    assert.equal(inspectImage(Buffer.from('GIF89a......')), null)
    assert.equal(inspectImage(Buffer.from('%PDF-1.7')), null)
  })
})

describe('media library', () => {
  test('an upload is stored, recorded with its details, and served back', async () => {
    const res = await upload(png(1200, 800))
    assert.equal(res.status, 201)
    const asset = res.body.data
    assert.match(asset.url, /^\/api\/media\/[0-9a-f-]{36}\.png$/)
    assert.equal(asset.filename, 'loom photo.png')
    assert.equal(asset.width, 1200)
    assert.equal(asset.height, 800)
    assert.equal(asset.contentType, 'image/png')

    const served = await call(asset.url.replace('/api', ''))
    assert.equal(served.status, 200)
    assert.equal(served.headers.get('content-type'), 'image/png')
    assert.match(served.headers.get('cache-control') ?? '', /immutable/)
    assert.ok((served.body as Buffer).equals(png(1200, 800)))

    const list = await call('/admin/media', { as: admin })
    assert.equal(list.body.pagination.total, 1)
  })

  test('the real type wins over the name and the claimed type', async () => {
    const res = await upload(jpeg(800, 600), admin, 'pretend.png', 'image/png')
    assert.equal(res.status, 201)
    assert.equal(res.body.data.contentType, 'image/jpeg')
    assert.match(res.body.data.url, /\.jpg$/)
  })

  test('non-images, empty files and oversized files are refused', async () => {
    const fake = await upload(Buffer.from('<html><script>alert(1)</script></html>'), admin, 'x.png', 'image/png')
    assert.equal(fake.status, 415)

    const empty = await upload(Buffer.alloc(0))
    assert.equal(empty.status, 400)

    const huge = await upload(Buffer.concat([png(10, 10), Buffer.alloc(4 * 1024 * 1024 + 10)]))
    assert.equal(huge.status, 413)
    assert.match(huge.body.message, /4 MB/)

    assert.equal((await call('/admin/media', { as: admin })).body.pagination.total, 0)
  })

  test('only signed-in administrators with the admin role can upload or delete', async () => {
    const anonymous = await call('/admin/media', { method: 'POST', raw: png(10, 10), headers: { 'Content-Type': 'image/png' } })
    assert.equal(anonymous.status, 401)

    const reader = await upload(png(10, 10), viewer)
    assert.equal(reader.status, 403)

    const noCsrf = await call('/admin/media', {
      method: 'POST',
      as: { cookie: admin.cookie, csrf: '' },
      raw: png(10, 10),
      headers: { 'Content-Type': 'image/png' },
    })
    assert.equal(noCsrf.status, 403)
    assert.equal((await call('/admin/media', { as: admin })).body.pagination.total, 0)
  })

  test('alt text can be updated', async () => {
    const asset = (await upload(png(10, 10))).body.data
    const res = await call(`/admin/media/${asset.id}`, { method: 'PATCH', as: admin, body: { altText: 'A <b>loom</b>' } })
    assert.equal(res.body.data.altText, 'A loom')
  })

  test('an image still in use cannot be deleted; an unused one can', async () => {
    const asset = (await upload(jpeg(400, 300))).body.data
    await call('/admin/products/throws', { method: 'PATCH', as: admin, body: { imageUrl: asset.url } })

    const blocked = await call(`/admin/media/${asset.id}`, { method: 'DELETE', as: admin })
    assert.equal(blocked.status, 409)
    assert.match(blocked.body.message, /Product: Throws/)

    await call('/admin/products/throws', { method: 'PATCH', as: admin, body: { imageUrl: '/media/shoot-motif.jpg' } })
    const removed = await call(`/admin/media/${asset.id}`, { method: 'DELETE', as: admin })
    assert.equal(removed.status, 200)
    assert.equal(await getMediaStorage().get(asset.url.split('/').pop()), null, 'the stored file is gone too')
    assert.equal((await call(asset.url.replace('/api', ''))).status, 404)
  })

  test('an image used in the gallery or a product gallery also counts as in use', async () => {
    const asset = (await upload(png(10, 10))).body.data
    await call('/admin/products/bed-linens', {
      method: 'PATCH',
      as: admin,
      body: { additionalImages: [{ url: asset.url, alt: 'Detail' }] },
    })
    assert.equal((await call(`/admin/media/${asset.id}`, { method: 'DELETE', as: admin })).status, 409)
  })

  test('uploaded images can be used anywhere a picture address is accepted', async () => {
    const asset = (await upload(webp(1600, 900))).body.data
    const slide = await call('/admin/slides', {
      method: 'POST',
      as: admin,
      body: { mediaType: 'image', mediaUrl: asset.url, heading: 'Uploaded', status: 'published' },
    })
    assert.equal(slide.status, 201)
    const home = await call('/homepage')
    assert.ok(home.body.data.slides.some((s: any) => s.mediaUrl === asset.url))
    await call(`/admin/slides/${slide.body.data.id}`, { method: 'DELETE', as: admin })
  })

  test('malformed media addresses are not served', async () => {
    for (const key of ['../../etc/passwd', 'abc.png', 'x.svg']) {
      assert.equal((await call(`/media/${encodeURIComponent(key)}`)).status, 404, key)
    }
  })
})

describe('categories', () => {
  test('create with a description, list with counts, and change the web address safely', async () => {
    const created = await call('/admin/categories', {
      method: 'POST',
      as: admin,
      body: { name: 'Table Linen', description: 'Runners and mats' },
    })
    assert.equal(created.status, 201)
    assert.equal(created.body.data.id, 'table-linen')
    assert.equal(created.body.data.description, 'Runners and mats')
    assert.equal(created.body.data.isActive, true)

    // Renaming the web address of a category in use carries its products along.
    const renamed = await call('/admin/categories/throws', { method: 'PATCH', as: admin, body: { slug: 'throws-and-blankets' } })
    assert.equal(renamed.status, 200)
    assert.equal(renamed.body.data.id, 'throws-and-blankets')
    assert.equal(renamed.body.data.productCount, 1)
    const product = await call('/admin/products/throws', { as: admin })
    assert.equal(product.body.data.categoryId, 'throws-and-blankets')
    assert.equal((await call('/products?category=throws-and-blankets')).body.data.length, 1)

    const clash = await call('/admin/categories/table-linen', { method: 'PATCH', as: admin, body: { slug: 'bed-linens' } })
    assert.equal(clash.status, 409)

    await call('/admin/categories/throws-and-blankets', { method: 'PATCH', as: admin, body: { slug: 'throws' } })
  })

  test('switching a category off hides it and its products from the public site', async () => {
    await call('/admin/categories/throws', { method: 'PATCH', as: admin, body: { isActive: false } })

    const products = (await call('/products')).body.data.map((p: any) => p.id)
    assert.ok(!products.includes('throws'))
    assert.equal((await call('/products/throws')).status, 404)
    assert.ok(!(await call('/categories')).body.data.some((c: any) => c.id === 'throws'))

    const adminView = (await call('/admin/categories', { as: admin })).body.data.find((c: any) => c.id === 'throws')
    assert.equal(adminView.isActive, false)
    assert.equal(adminView.productCount, 1, 'the product itself is untouched')
  })

  test('a category with products cannot be deleted', async () => {
    const res = await call('/admin/categories/throws', { method: 'DELETE', as: admin })
    assert.equal(res.status, 409)
  })
})

describe('products', () => {
  test('the admin list can be sorted', async () => {
    const byName = await call('/admin/products?sort=name&direction=desc', { as: admin })
    assert.deepEqual(byName.body.data.map((p: any) => p.name), ['Throws', 'Cushion Covers', 'Bed Linens'])

    await call('/admin/products/cushion-covers', { method: 'PATCH', as: admin, body: { shortDescription: 'Updated just now' } })
    const recent = await call('/admin/products?sort=updated', { as: admin })
    assert.equal(recent.body.data[0].id, 'cushion-covers')

    assert.equal((await call('/admin/products?sort=price', { as: admin })).status, 400)
  })

  test('duplicating makes a hidden draft with a free web address', async () => {
    const first = await call('/admin/products/throws/duplicate', { method: 'POST', as: admin })
    const second = await call('/admin/products/throws/duplicate', { method: 'POST', as: admin })

    assert.equal(first.status, 201)
    assert.equal(first.body.data.name, 'Throws (copy)')
    assert.equal(first.body.data.slug, 'throws-copy')
    assert.equal(first.body.data.status, 'draft')
    assert.equal(first.body.data.categoryId, 'throws')
    assert.equal(second.body.data.slug, 'throws-copy-2')
    assert.ok(!(await call('/products')).body.data.some((p: any) => p.slug.startsWith('throws-copy')))

    assert.equal((await call('/admin/products/throws/duplicate', { method: 'POST', as: viewer })).status, 403)
  })
})

describe('dashboard', () => {
  test('reports products by status, offers, and recently updated products', async () => {
    await call('/admin/products/bed-linens', { method: 'PATCH', as: admin, body: { status: 'draft' } })
    await call('/admin/offers', { method: 'POST', as: admin, body: { title: 'Now', status: 'published' } })
    await call('/admin/offers', {
      method: 'POST',
      as: admin,
      body: { title: 'Later', status: 'published', startsAt: new Date(Date.now() + 86_400_000).toISOString() },
    })

    const { body } = await call('/admin/overview', { as: viewer })
    assert.deepEqual(
      { total: body.data.products.total, published: body.data.products.published, draft: body.data.products.draft, archived: body.data.products.archived },
      { total: 3, published: 2, draft: 1, archived: 0 },
    )
    assert.deepEqual(body.data.offers, { active: 1, scheduled: 1 })
    assert.equal(body.data.recentProducts[0].id, 'bed-linens')
    await sql('DELETE FROM offers')
  })

  test('enquiry figures follow the chosen date range', async () => {
    await sql('DELETE FROM enquiries')
    await call('/enquiries', {
      method: 'POST',
      body: { name: 'Asha', email: 'asha@example.com', phone: '9876543210', inquiryType: 'General Enquiry', message: 'Hello' },
    })
    await sql(`UPDATE enquiries SET created_at = '2026-01-15T06:00:00Z'`)

    const january = await call('/admin/overview?from=2026-01-01&to=2026-01-31', { as: admin })
    const february = await call('/admin/overview?from=2026-02-01&to=2026-02-28', { as: admin })
    assert.equal(january.body.data.enquiries.total, 1)
    assert.equal(february.body.data.enquiries.total, 0)
    assert.equal(february.body.data.recentEnquiries.length, 0)

    const backwards = await call('/admin/overview?from=2026-03-01&to=2026-02-01', { as: admin })
    assert.equal(backwards.status, 400)
  })
})
