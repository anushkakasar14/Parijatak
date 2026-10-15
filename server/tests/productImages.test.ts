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
  GOOGLE_SHEETS_WEBHOOK_URL: '',
  GOOGLE_SHEETS_WEBHOOK_TOKEN: '',
})

const { createApp } = await import('../app.ts')
const { closeDb, getDb } = await import('../config/database.ts')
const { migrations } = await import('../config/migrations.ts')
const { authService } = await import('../services/authService.ts')

const ADMIN = { email: 'owner@parijatak.test', name: 'Owner', password: 'correct-horse-battery', role: 'admin' as const }

let server: Server
let baseUrl: string
let admin: { cookie: string; csrf: string }

const sql = async <T = any>(text: string, params: unknown[] = []) => (await getDb()).query<T>(text, params)

async function call(path: string, { method = 'GET', body, raw, type }: { method?: string; body?: unknown; raw?: Buffer; type?: string } = {}) {
  const headers: Record<string, string> = {
    Origin: baseUrl,
    Cookie: admin.cookie,
    'X-CSRF-Token': admin.csrf,
    'Content-Type': type ?? 'application/json',
  }
  const res = await fetch(`${baseUrl}/api${path}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) })
  return { status: res.status, body: (await res.json()) as any }
}

/** The gallery rows of a product, in order. */
const gallery = async (productId: string) =>
  (
    await sql<{ id: string; url: string; alt_text: string; position: number; is_primary: boolean; media_asset_id: string | null }>(
      'SELECT id, url, alt_text, position, is_primary, media_asset_id FROM product_images WHERE product_id = $1 ORDER BY position',
      [productId],
    )
  ).rows

function png(width: number, height: number) {
  const b = Buffer.alloc(40)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

const productBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Gallery Test Throw',
  categoryId: 'throws',
  description: 'A throw for testing pictures.',
  imageUrl: '/media/shoot-bench.jpg',
  imageAlt: 'Main view',
  additionalImages: [
    { url: '/media/shoot-checks.jpg', alt: 'Second' },
    { url: '/media/shoot-motif.jpg', alt: 'Third' },
  ],
  ...overrides,
})

before(async () => {
  await getDb()
  server = createApp().listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await authService.createAdmin(ADMIN)
})

after(async () => {
  server.close()
  await closeDb()
})

beforeEach(async () => {
  await sql(`DELETE FROM products WHERE id NOT IN ('bed-linens', 'cushion-covers', 'throws')`)
  await sql('DELETE FROM media_assets')
  await sql('DELETE FROM admin_sessions')
  const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify(ADMIN),
  })
  admin = { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0], csrf: ((await res.json()) as any).data.csrfToken }
})

describe('migration 6: existing pictures are copied into product_images', () => {
  test('every seeded product has its main picture as the primary row, matching its columns', async () => {
    const { rows: products } = await sql<{ id: string; image_url: string; image_alt: string | null; additional_images: unknown[] }>(
      `SELECT id, image_url, image_alt, additional_images FROM products WHERE id IN ('bed-linens', 'cushion-covers', 'throws')`,
    )
    assert.equal(products.length, 3)
    for (const product of products) {
      const rows = await gallery(product.id)
      assert.equal(rows.length, 1 + product.additional_images.length)
      assert.equal(rows[0].url, product.image_url)
      assert.equal(rows[0].is_primary, true)
      assert.equal(rows.filter((r) => r.is_primary).length, 1)
    }
  })

  test('older galleries stored as bare addresses are copied in their saved order', async () => {
    await sql(
      `INSERT INTO products (id, name, slug, category, category_id, description, image_url, additional_images, status)
       VALUES ('legacy', 'Legacy', 'legacy', 'Throws', 'throws', 'x', '/media/a.jpg', '["/media/b.jpg", {"url": "/media/c.jpg", "alt": "C"}]', 'draft')`,
    )
    // Run the copy statements of migration 6 for this one product.
    const statements = migrations.find((m) => m.version === 6)!.statements.slice(-2)
    for (const statement of statements) {
      await sql(statement.replace(/WHERE (p\.image_url <> ''|COALESCE\(e\.url, ''\) <> '')/, "WHERE p.id = 'legacy' AND $1"))
    }
    const rows = await gallery('legacy')
    assert.deepEqual(
      rows.map((r) => [r.url, r.alt_text, r.is_primary]),
      [
        ['/media/a.jpg', '', true],
        ['/media/b.jpg', '', false],
        ['/media/c.jpg', 'C', false],
      ],
    )
  })
})

describe('product saves keep the gallery table in step', () => {
  test('creating a product stores its pictures in order, the first one primary', async () => {
    const created = await call('/admin/products', { method: 'POST', body: productBody() })
    assert.equal(created.status, 201)
    const rows = await gallery(created.body.data.id)
    assert.deepEqual(
      rows.map((r) => [r.position, r.url, r.alt_text, r.is_primary]),
      [
        [0, '/media/shoot-bench.jpg', 'Main view', true],
        [1, '/media/shoot-checks.jpg', 'Second', false],
        [2, '/media/shoot-motif.jpg', 'Third', false],
      ],
    )
    // The public shape is unchanged.
    assert.deepEqual(
      created.body.data.images.map((i: any) => i.url),
      ['/media/shoot-bench.jpg', '/media/shoot-checks.jpg', '/media/shoot-motif.jpg'],
    )
  })

  test('reordering and editing keeps each picture’s id, and removed pictures are deleted', async () => {
    const created = await call('/admin/products', { method: 'POST', body: productBody() })
    const id = created.body.data.id
    const before = await gallery(id)

    const saved = await call(`/admin/products/${id}`, {
      method: 'PATCH',
      body: { additionalImages: [{ url: '/media/shoot-motif.jpg', alt: 'Third, now second' }] },
    })
    assert.equal(saved.status, 200)
    const after = await gallery(id)
    assert.deepEqual(
      after.map((r) => [r.url, r.alt_text, r.position]),
      [
        ['/media/shoot-bench.jpg', 'Main view', 0],
        ['/media/shoot-motif.jpg', 'Third, now second', 1],
      ],
    )
    assert.equal(after[0].id, before[0].id, 'unchanged picture keeps its id')
    assert.equal(after[1].id, before[2].id, 'moved picture keeps its id')
  })

  test('a new main picture becomes the primary row, and the columns follow', async () => {
    const created = await call('/admin/products', { method: 'POST', body: productBody() })
    const id = created.body.data.id
    await call(`/admin/products/${id}`, { method: 'PATCH', body: { imageUrl: '/media/shoot-ground.jpg', imageAlt: 'New main' } })
    const rows = await gallery(id)
    assert.equal(rows.filter((r) => r.is_primary).length, 1)
    assert.equal(rows.find((r) => r.is_primary)!.url, '/media/shoot-ground.jpg')
    const { rows: product } = await sql('SELECT image_url, image_alt FROM products WHERE id = $1', [id])
    assert.deepEqual(product[0], { image_url: '/media/shoot-ground.jpg', image_alt: 'New main' })
  })

  test('a duplicated product gets its own copy of the gallery', async () => {
    const created = await call('/admin/products', { method: 'POST', body: productBody() })
    const copy = await call(`/admin/products/${created.body.data.id}/duplicate`, { method: 'POST' })
    const original = await gallery(created.body.data.id)
    const copied = await gallery(copy.body.data.id)
    assert.deepEqual(
      copied.map((r) => [r.url, r.position, r.is_primary]),
      original.map((r) => [r.url, r.position, r.is_primary]),
    )
    assert.ok(copied.every((r) => !original.some((o) => o.id === r.id)), 'new ids')
  })

  test('deleting a product removes its gallery rows', async () => {
    const created = await call('/admin/products', { method: 'POST', body: productBody() })
    await call(`/admin/products/${created.body.data.id}`, { method: 'DELETE' })
    assert.equal((await gallery(created.body.data.id)).length, 0)
  })
})

describe('database rules', () => {
  test('a product can have only one primary picture', async () => {
    const created = await call('/admin/products', { method: 'POST', body: productBody() })
    await assert.rejects(
      sql(`UPDATE product_images SET is_primary = TRUE WHERE product_id = $1`, [created.body.data.id]),
      /duplicate key|unique/i,
    )
  })

  test('two pictures of a product cannot share a position', async () => {
    const created = await call('/admin/products', { method: 'POST', body: productBody() })
    await assert.rejects(
      sql(`UPDATE product_images SET position = 0 WHERE product_id = $1`, [created.body.data.id]),
      /duplicate key|unique/i,
    )
  })

  test('a picture must belong to an existing product', async () => {
    await assert.rejects(
      sql(`INSERT INTO product_images (id, product_id, url, position) VALUES (gen_random_uuid(), 'no-such-product', '/x.jpg', 0)`),
      /foreign key/i,
    )
  })

  test('an uploaded image used in a gallery is linked to its file, which cannot then be deleted', async () => {
    const upload = await call('/admin/media', { method: 'POST', raw: png(800, 1000), type: 'image/png' })
    assert.equal(upload.status, 201)
    const created = await call('/admin/products', {
      method: 'POST',
      body: productBody({ additionalImages: [{ url: upload.body.data.url, alt: 'Uploaded' }] }),
    })
    const rows = await gallery(created.body.data.id)
    assert.equal(rows[1].media_asset_id, upload.body.data.id)

    const removed = await call(`/admin/media/${upload.body.data.id}`, { method: 'DELETE' })
    assert.equal(removed.status, 409)
    // Even bypassing the check, the database refuses.
    await assert.rejects(sql('DELETE FROM media_assets WHERE id = $1', [upload.body.data.id]), /foreign key|violates/i)
  })
})

describe('picture endpoints', () => {
  const VIEWER = { email: 'reader@parijatak.test', name: 'Reader', password: 'look-but-do-not-touch', role: 'viewer' as const }

  async function product() {
    // A unique name each time: two products cannot share a web address.
    const created = await call('/admin/products', { method: 'POST', body: productBody({ name: `Gallery Test ${Math.random().toString(36).slice(2, 8)}` }) })
    return created.body.data.id as string
  }
  const ids = async (productId: string) => (await gallery(productId)).map((r) => r.id)
  const publicImages = async (productId: string) => {
    await sql(`UPDATE products SET status = 'published' WHERE id = $1`, [productId])
    const res = await fetch(`${baseUrl}/api/products/${productId}`)
    return ((await res.json()) as any).data.images.map((i: any) => i.url) as string[]
  }

  test('list returns the pictures in order with their ids', async () => {
    const id = await product()
    const res = await call(`/admin/products/${id}/images`)
    assert.equal(res.status, 200)
    assert.deepEqual(
      res.body.data.map((i: any) => [i.url, i.isPrimary, i.position]),
      [
        ['/media/shoot-bench.jpg', true, 0],
        ['/media/shoot-checks.jpg', false, 1],
        ['/media/shoot-motif.jpg', false, 2],
      ],
    )
  })

  test('an uploaded picture is added at the end and appears on the website', async () => {
    const id = await product()
    const upload = await call('/admin/media', { method: 'POST', raw: png(1200, 1500), type: 'image/png' })
    const added = await call(`/admin/products/${id}/images`, {
      method: 'POST',
      body: { url: upload.body.data.url, altText: 'Close-up of the weave' },
    })
    assert.equal(added.status, 201)
    assert.equal(added.body.data.image.position, 3)
    assert.equal(added.body.data.image.mediaAssetId, upload.body.data.id)
    assert.equal((await publicImages(id)).at(-1), upload.body.data.url)
  })

  test('a deleted upload cannot be added', async () => {
    const id = await product()
    const res = await call(`/admin/products/${id}/images`, {
      method: 'POST',
      body: { url: '/api/media/00000000-0000-0000-0000-000000000000.png' },
    })
    assert.equal(res.status, 400)
  })

  test('setting the primary picture changes the collection card picture', async () => {
    const id = await product()
    const [, second] = await ids(id)
    const res = await call(`/admin/products/${id}/images/${second}/primary`, { method: 'POST' })
    assert.equal(res.status, 200)
    const rows = await gallery(id)
    assert.deepEqual(rows.filter((r) => r.is_primary).map((r) => r.id), [second])
    await sql(`UPDATE products SET status = 'published' WHERE id = $1`, [id])
    const listed = ((await fetch(`${baseUrl}/api/products`).then((r) => r.json())) as any).data.find((p: any) => p.id === id)
    assert.equal(listed.imageUrl, '/media/shoot-checks.jpg')
    assert.equal(listed.images[0].url, '/media/shoot-checks.jpg', 'primary first on the website')
  })

  test('reordering saves the new order, and must list every picture exactly once', async () => {
    const id = await product()
    const [a, b, c] = await ids(id)
    const res = await call(`/admin/products/${id}/images/order`, { method: 'PUT', body: { imageIds: [c, a, b] } })
    assert.equal(res.status, 200)
    assert.deepEqual(await ids(id), [c, a, b])
    // The primary picture (a) stays first on the website; the others follow the new order.
    assert.deepEqual(await publicImages(id), ['/media/shoot-bench.jpg', '/media/shoot-motif.jpg', '/media/shoot-checks.jpg'])

    assert.equal((await call(`/admin/products/${id}/images/order`, { method: 'PUT', body: { imageIds: [c, a] } })).status, 400)
    assert.equal((await call(`/admin/products/${id}/images/order`, { method: 'PUT', body: { imageIds: [c, a, a] } })).status, 400)
    assert.deepEqual(await ids(id), [c, a, b], 'a refused reorder changes nothing')
  })

  test('replacing a picture keeps its place and description; a new description is saved', async () => {
    const id = await product()
    const [, second] = await ids(id)
    const replaced = await call(`/admin/products/${id}/images/${second}`, { method: 'PATCH', body: { url: '/media/shoot-ground.jpg' } })
    assert.equal(replaced.status, 200)
    assert.equal(replaced.body.data.image.position, 1)
    assert.equal(replaced.body.data.image.altText, 'Second')
    const described = await call(`/admin/products/${id}/images/${second}`, { method: 'PATCH', body: { altText: 'Folded on a chair' } })
    assert.equal(described.body.data.image.altText, 'Folded on a chair')
    assert.equal((await publicImages(id))[1], '/media/shoot-ground.jpg')
  })

  test('removing a picture removes only that one, and the primary moves on if needed', async () => {
    const id = await product()
    const [first, second, third] = await ids(id)
    const removed = await call(`/admin/products/${id}/images/${first}`, { method: 'DELETE' })
    assert.equal(removed.status, 200)
    const rows = await gallery(id)
    assert.deepEqual(
      rows.map((r) => [r.id, r.position, r.is_primary]),
      [
        [second, 0, true],
        [third, 1, false],
      ],
    )
    await call(`/admin/products/${id}/images/${second}`, { method: 'DELETE' })
    const last = await call(`/admin/products/${id}/images/${third}`, { method: 'DELETE' })
    assert.equal(last.status, 409, 'the last picture cannot be removed')
    assert.equal((await gallery(id)).length, 1)
  })

  test('ids must belong to the product, and the product must exist', async () => {
    const id = await product()
    const other = await product()
    const [foreign] = await ids(other)
    assert.equal((await call(`/admin/products/${id}/images/${foreign}/primary`, { method: 'POST' })).status, 404)
    assert.equal((await call(`/admin/products/${id}/images/not-a-uuid`, { method: 'DELETE' })).status, 400)
    assert.equal((await call('/admin/products/no-such-product/images', { method: 'POST', body: { url: '/media/a.jpg' } })).status, 404)
    assert.equal((await call(`/admin/products/${id}/images`, { method: 'POST', body: { url: 'javascript:alert(1)' } })).status, 400)
  })

  test('a gallery is limited to 13 pictures', async () => {
    const id = await product()
    for (let n = 0; n < 10; n++) {
      assert.equal((await call(`/admin/products/${id}/images`, { method: 'POST', body: { url: `/media/extra-${n}.jpg` } })).status, 201)
    }
    const res = await call(`/admin/products/${id}/images`, { method: 'POST', body: { url: '/media/one-too-many.jpg' } })
    assert.equal(res.status, 409)
  })

  test('signed-out visitors and view-only accounts cannot change pictures', async () => {
    const id = await product()
    const [first] = await ids(id)
    const anonymous = await fetch(`${baseUrl}/api/admin/products/${id}/images/${first}`, { method: 'DELETE', headers: { Origin: baseUrl } })
    assert.equal(anonymous.status, 401)

    await authService.createAdmin(VIEWER).catch(() => {})
    const login = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify(VIEWER),
    })
    const viewer = { cookie: (login.headers.get('set-cookie') ?? '').split(';')[0], csrf: ((await login.json()) as any).data.csrfToken }
    const asViewer = await fetch(`${baseUrl}/api/admin/products/${id}/images/${first}`, {
      method: 'DELETE',
      headers: { Origin: baseUrl, Cookie: viewer.cookie, 'X-CSRF-Token': viewer.csrf },
    })
    assert.equal(asViewer.status, 403)
    const noCsrf = await fetch(`${baseUrl}/api/admin/products/${id}/images/${first}`, {
      method: 'DELETE',
      headers: { Origin: baseUrl, Cookie: admin.cookie },
    })
    assert.equal(noCsrf.status, 403)
    assert.equal((await gallery(id)).length, 3, 'nothing was removed')
  })

  test('a database failure part-way through leaves the gallery unchanged', async () => {
    const id = await product()
    const before = await gallery(id)
    // Make the last step (updating the product's picture columns) fail inside the transaction.
    await sql(`ALTER TABLE products ADD CONSTRAINT test_block_image CHECK (image_url <> '/media/shoot-checks.jpg') NOT VALID`)
    try {
      const res = await call(`/admin/products/${id}/images/${before[1].id}/primary`, { method: 'POST' })
      assert.ok(res.status >= 400, 'reported as a failure')
      assert.notEqual(res.body.success, true)
    } finally {
      await sql('ALTER TABLE products DROP CONSTRAINT test_block_image')
    }
    assert.deepEqual(await gallery(id), before, 'rolled back completely')
  })
})
