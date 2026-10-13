import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, mock, test } from 'node:test'

// Configure the environment before any server module is loaded.
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
const { productModel } = await import('../models/productModel.ts')
const { enquiryModel } = await import('../models/enquiryModel.ts')
const { googleSheetsService } = await import('../services/googleSheetsService.ts')
const { migrations } = await import('../config/migrations.ts')

const ADMIN = { email: 'owner@parijatak.test', name: 'Owner', password: 'correct-horse-battery', role: 'admin' as const }
const VIEWER = { email: 'reader@parijatak.test', name: 'Reader', password: 'look-but-do-not-touch', role: 'viewer' as const }

let server: Server
let baseUrl: string
let admin: { cookie: string; csrf: string }
let viewer: { cookie: string; csrf: string }

const sql = async (text: string, params: unknown[] = []) => (await getDb()).query(text, params)

interface CallOptions {
  method?: string
  body?: unknown
  as?: { cookie: string; csrf: string } | null
}

async function call(path: string, { method = 'GET', body, as = null }: CallOptions = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: baseUrl }
  if (as) {
    headers.Cookie = as.cookie
    headers['X-CSRF-Token'] = as.csrf
  }
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => null)) as any }
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

const newProduct = {
  name: 'Indigo Table Runner',
  categoryId: 'throws',
  description: 'A runner for long tables.',
  imageUrl: '/media/shoot-bench.jpg',
}

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
  mock.restoreAll()
  // Remove anything a previous test created; the seeded content stays.
  await sql(`DELETE FROM enquiries`)
  await sql(`DELETE FROM products WHERE id NOT IN ('bed-linens', 'cushion-covers', 'throws')`)
  await sql(`UPDATE products SET status = 'published', is_active = TRUE, category_id = id`)
  await sql(`DELETE FROM categories WHERE id NOT IN ('bed-linens', 'cushion-covers', 'throws')`)
  await sql(`DELETE FROM offers`)
  await sql(`DELETE FROM admin_sessions`)
  admin = await signIn(ADMIN)
  viewer = await signIn(VIEWER)
})

describe('database', () => {
  test('connects and reports health without revealing configuration', async () => {
    const { status, body } = await call('/health')
    assert.equal(status, 200)
    assert.deepEqual(body.data, { status: 'ok', database: 'ok', googleSheets: 'not configured' })
  })

  test('every migration is recorded exactly once', async () => {
    const { rows } = await sql('SELECT version FROM schema_migrations ORDER BY version')
    assert.deepEqual(
      rows.map((r: any) => r.version),
      migrations.map((m) => m.version),
    )
  })

  test('seeded content is not re-created after an administrator deletes it', async () => {
    // Seeding belongs to the migration, which never runs twice — so this stays deleted.
    const created = await call('/admin/products', { method: 'POST', as: admin, body: newProduct })
    await call(`/admin/products/${created.body.data.id}`, { method: 'DELETE', as: admin })
    const { rows } = await sql('SELECT COUNT(*)::int AS n FROM products')
    assert.equal((rows[0] as any).n, 3)
  })
})

describe('public products', () => {
  test('published products load from the database with their details', async () => {
    const { status, body } = await call('/products')
    assert.equal(status, 200)
    assert.deepEqual(
      body.data.map((p: any) => p.name),
      ['Bed Linens', 'Cushion Covers', 'Throws'],
    )
    const throws = body.data[2]
    assert.equal(throws.category, 'Throws')
    assert.equal(throws.categoryId, 'throws')
    assert.ok(throws.shortDescription)
    assert.equal(throws.images[0].url, throws.imageUrl)
    assert.match(throws.whatsappEnquiryUrl, /^https:\/\/wa\.me\/917385087502\?text=/)
    assert.equal(throws.status, undefined, 'internal status is not exposed')
  })

  test('draft and archived products are hidden from every public endpoint', async () => {
    await call('/admin/products/bed-linens', { method: 'PATCH', as: admin, body: { status: 'draft' } })
    await call('/admin/products/throws', { method: 'PATCH', as: admin, body: { status: 'archived' } })

    const list = await call('/products')
    assert.deepEqual(
      list.body.data.map((p: any) => p.id),
      ['cushion-covers'],
    )
    assert.equal((await call('/products/bed-linens')).status, 404)
    assert.equal((await call('/products/throws')).status, 404)

    const categories = await call('/categories')
    assert.deepEqual(
      categories.body.data.map((c: any) => c.id),
      ['cushion-covers'],
      'categories with nothing published are hidden',
    )
  })

  test('a single product loads by id or slug', async () => {
    const created = await call('/admin/products', {
      method: 'POST',
      as: admin,
      body: { ...newProduct, slug: 'indigo-runner', status: 'published' },
    })
    const byId = await call(`/products/${created.body.data.id}`)
    const bySlug = await call('/products/indigo-runner')

    assert.equal(byId.body.data.name, 'Indigo Table Runner')
    assert.equal(bySlug.body.data.id, created.body.data.id)
  })

  test('products can be filtered by category id or name', async () => {
    const byId = await call('/products?category=throws')
    const byName = await call('/products?category=Cushion%20Covers')
    assert.deepEqual(byId.body.data.map((p: any) => p.id), ['throws'])
    assert.deepEqual(byName.body.data.map((p: any) => p.id), ['cushion-covers'])
  })

  test('an enquiry cannot be attached to an unpublished product', async () => {
    await call('/admin/products/throws', { method: 'PATCH', as: admin, body: { status: 'draft' } })
    const { status } = await call('/enquiries', {
      method: 'POST',
      body: {
        name: 'Asha',
        email: 'asha@example.com',
        phone: '9876543210',
        inquiryType: 'Product Enquiry',
        message: 'Is this available?',
        productId: 'throws',
      },
    })
    assert.equal(status, 400)
  })
})

describe('admin product management', () => {
  test('create, edit, publish, archive and delete persist to the database', async () => {
    const created = await call('/admin/products', {
      method: 'POST',
      as: admin,
      body: {
        ...newProduct,
        shortDescription: 'For long tables',
        dimensions: '40 x 180 cm',
        variants: ['Indigo', 'Natural'],
        price: 2400,
        offerPrice: 1999,
        additionalImages: [{ url: '/media/shoot-ground.jpg', alt: 'Detail' }],
      },
    })
    assert.equal(created.status, 201)
    const { id } = created.body.data
    assert.equal(created.body.data.slug, 'indigo-table-runner', 'slug is generated from the name')
    assert.equal(created.body.data.status, 'draft', 'new products start as drafts')
    assert.equal((await call('/products/indigo-table-runner')).status, 404, 'a draft is not public')

    const published = await call(`/admin/products/${id}`, {
      method: 'PATCH',
      as: admin,
      body: { status: 'published', name: 'Indigo Runner', isFeatured: true },
    })
    assert.equal(published.body.data.status, 'published')

    const fromDb = await productModel.findById(id)
    assert.equal(fromDb?.name, 'Indigo Runner')
    assert.equal(fromDb?.price, 2400)
    assert.equal(fromDb?.offerPrice, 1999)
    assert.deepEqual(fromDb?.variants, ['Indigo', 'Natural'])
    assert.equal(fromDb?.images.length, 2)

    const live = await call('/products/indigo-table-runner')
    assert.equal(live.body.data.name, 'Indigo Runner')
    assert.equal(live.body.data.dimensions, '40 x 180 cm')

    await call(`/admin/products/${id}`, { method: 'PATCH', as: admin, body: { status: 'archived' } })
    assert.equal((await call('/products/indigo-table-runner')).status, 404)

    const removed = await call(`/admin/products/${id}`, { method: 'DELETE', as: admin })
    assert.equal(removed.status, 200)
    assert.equal(await productModel.findById(id), null)
    assert.equal((await call(`/admin/products/${id}`, { as: admin })).status, 404)
  })

  test('the admin list shows every status, with filters and paging', async () => {
    await call('/admin/products', { method: 'POST', as: admin, body: newProduct })

    const all = await call('/admin/products', { as: admin })
    assert.equal(all.body.pagination.total, 4)

    const drafts = await call('/admin/products?status=draft', { as: admin })
    assert.deepEqual(drafts.body.data.map((p: any) => p.name), ['Indigo Table Runner'])

    const searched = await call('/admin/products?search=runner', { as: admin })
    assert.equal(searched.body.pagination.total, 1)

    const paged = await call('/admin/products?limit=2&offset=2', { as: admin })
    assert.equal(paged.body.data.length, 2)
  })

  test('invalid product data is rejected with field messages', async () => {
    const cases: [object, string][] = [
      [{ ...newProduct, name: '' }, 'name'],
      [{ ...newProduct, categoryId: 'no-such-category' }, 'categoryId'],
      [{ ...newProduct, imageUrl: 'javascript:alert(1)' }, 'imageUrl'],
      [{ ...newProduct, imageUrl: 'http://insecure.example/a.jpg' }, 'imageUrl'],
      [{ ...newProduct, price: 100, offerPrice: 500 }, 'offerPrice'],
      [{ ...newProduct, status: 'live' }, 'status'],
      [{ ...newProduct, slug: 'Not A Slug' }, 'slug'],
    ]
    for (const [body, field] of cases) {
      const res = await call('/admin/products', { method: 'POST', as: admin, body })
      assert.equal(res.status, 400, `${field} should be rejected`)
      assert.ok(res.body.errors[field], `${field} should have a message`)
    }
    assert.equal((await call('/admin/products', { as: admin })).body.pagination.total, 3)
  })

  test('unknown fields are refused rather than silently stored', async () => {
    const res = await call('/admin/products', {
      method: 'POST',
      as: admin,
      body: { ...newProduct, isAdmin: true },
    })
    assert.equal(res.status, 400)
  })

  test('two products cannot share a web address', async () => {
    const res = await call('/admin/products', {
      method: 'POST',
      as: admin,
      body: { ...newProduct, slug: 'throws' },
    })
    assert.equal(res.status, 409)
    assert.ok(!JSON.stringify(res.body).includes('constraint'), 'no database detail leaks')
  })

  test('deleting a product keeps its enquiries', async () => {
    const created = await call('/admin/products', {
      method: 'POST',
      as: admin,
      body: { ...newProduct, status: 'published' },
    })
    await call('/enquiries', {
      method: 'POST',
      body: {
        name: 'Asha',
        email: 'asha@example.com',
        phone: '9876543210',
        inquiryType: 'Product Enquiry',
        message: 'Is this available?',
        productId: created.body.data.id,
      },
    })
    await call(`/admin/products/${created.body.data.id}`, { method: 'DELETE', as: admin })

    const { enquiries } = await enquiryModel.list({ limit: 10, offset: 0 })
    assert.equal(enquiries.length, 1)
    assert.equal(enquiries[0].productName, 'Indigo Table Runner', 'the product name is kept')
    assert.equal(enquiries[0].productId, null)
  })

  test('categories can be added, renamed and removed — but not while in use', async () => {
    const created = await call('/admin/categories', { method: 'POST', as: admin, body: { name: 'Table Linen' } })
    assert.equal(created.status, 201)
    assert.equal(created.body.data.id, 'table-linen')

    assert.equal((await call('/admin/categories', { method: 'POST', as: admin, body: { name: 'Table Linen' } })).status, 409)

    await call('/admin/categories/throws', { method: 'PATCH', as: admin, body: { name: 'Throws & Blankets' } })
    assert.equal((await call('/products/throws')).body.data.category, 'Throws & Blankets')
    await call('/admin/categories/throws', { method: 'PATCH', as: admin, body: { name: 'Throws' } })

    const inUse = await call('/admin/categories/throws', { method: 'DELETE', as: admin })
    assert.equal(inUse.status, 409)
    assert.equal((await call('/admin/categories/table-linen', { method: 'DELETE', as: admin })).status, 200)
  })
})

describe('homepage and site content', () => {
  test('the homepage endpoint returns published slides, sections and gallery', async () => {
    const { status, body } = await call('/homepage')
    assert.equal(status, 200)
    assert.equal(body.data.slides.length, 5)
    assert.equal(body.data.slides[0].heading, 'Crafted for the way you live')
    assert.equal(body.data.slides[0].mediaType, 'video')
    assert.equal(body.data.slides[0].status, undefined)
    assert.equal(body.data.sections['home.intro'].heading, 'Where tradition finds its place at home.')
    assert.equal(body.data.gallery.length, 3)
    assert.deepEqual(body.data.offers, [])
  })

  test('slides can be added, reordered, hidden and removed without code changes', async () => {
    const created = await call('/admin/slides', {
      method: 'POST',
      as: admin,
      body: {
        mediaType: 'image',
        mediaUrl: '/media/shoot-motif.jpg',
        altText: 'A throw on a tree',
        heading: 'A sixth slide',
        ctaLabel: 'See it',
        ctaUrl: '/collection',
        displayOrder: 0,
      },
    })
    assert.equal(created.status, 201)
    const { id } = created.body.data

    assert.equal((await call('/homepage')).body.data.slides.length, 5, 'a draft slide is not shown')

    await call(`/admin/slides/${id}`, { method: 'PATCH', as: admin, body: { status: 'published' } })
    let slides = (await call('/homepage')).body.data.slides
    assert.equal(slides.length, 6)
    assert.equal(slides[0].heading, 'A sixth slide', 'display order 0 puts it first')

    await call(`/admin/slides/${id}`, { method: 'PATCH', as: admin, body: { isActive: false } })
    assert.equal((await call('/homepage')).body.data.slides.length, 5, 'an inactive slide is hidden')

    await call(`/admin/slides/${id}`, { method: 'DELETE', as: admin })
    slides = (await call('/admin/slides', { as: admin })).body.data
    assert.equal(slides.length, 5)
  })

  test('a slide cannot link to an unsafe address', async () => {
    for (const ctaUrl of ['javascript:alert(1)', 'data:text/html,x', '//evil.example']) {
      const res = await call('/admin/slides', {
        method: 'POST',
        as: admin,
        body: { mediaType: 'image', mediaUrl: '/media/a.jpg', heading: 'X', ctaUrl },
      })
      assert.equal(res.status, 400, ctaUrl)
    }
  })

  test('editing a section changes what the public page receives', async () => {
    const updated = await call('/admin/sections/about.founder', {
      method: 'PATCH',
      as: admin,
      body: { body: 'First paragraph.\n\nSecond <b>paragraph</b>.' },
    })
    assert.equal(updated.status, 200)

    const page = await call('/pages/about')
    assert.equal(
      page.body.data.sections['about.founder'].body,
      'First paragraph.\n\nSecond paragraph.',
      'HTML is stripped; paragraphs are kept',
    )
    assert.equal(page.body.data.sections['about.founder'].label, undefined)

    await call('/admin/sections/about.founder', { method: 'PATCH', as: admin, body: { body: '' } })
    assert.equal((await call('/admin/sections/no.such', { method: 'PATCH', as: admin, body: { heading: 'x' } })).status, 404)
    assert.equal((await call('/pages/secret')).status, 400)
  })

  test('contact and social settings update the public site details and WhatsApp links', async () => {
    const before = (await call('/site')).body.data
    assert.equal(before.brand.name, 'Parijatak')
    assert.equal(before.contact.whatsappNumber, '917385087502')

    const contact = { ...before.contact, whatsappNumber: '919999900000', email: 'Hello@Parijatak.Example' }
    const saved = await call('/admin/settings/contact', { method: 'PUT', as: admin, body: contact })
    assert.equal(saved.status, 200)

    const site = (await call('/site')).body.data
    assert.equal(site.contact.whatsappNumber, '919999900000')
    assert.equal(site.contact.email, 'hello@parijatak.example')
    assert.match((await call('/products/throws')).body.data.whatsappEnquiryUrl, /wa\.me\/919999900000/)

    const bad = await call('/admin/settings/contact', {
      method: 'PUT',
      as: admin,
      body: { ...contact, whatsappNumber: '+91 99999' },
    })
    assert.equal(bad.status, 400)
    assert.equal((await call('/admin/settings/secrets', { method: 'PUT', as: admin, body: {} })).status, 400)

    await call('/admin/settings/contact', { method: 'PUT', as: admin, body: before.contact })
  })

  test('offers appear only while published and inside their dates', async () => {
    const day = 24 * 60 * 60 * 1000
    const at = (offset: number) => new Date(Date.now() + offset).toISOString()
    const make = (title: string, extra: object) =>
      call('/admin/offers', { method: 'POST', as: admin, body: { title, ...extra } })

    await make('Running now', { status: 'published', startsAt: at(-day), endsAt: at(day) })
    await make('No dates', { status: 'published' })
    await make('Finished', { status: 'published', startsAt: at(-2 * day), endsAt: at(-day) })
    await make('Not started', { status: 'published', startsAt: at(day) })
    await make('Still a draft', { startsAt: at(-day), endsAt: at(day) })

    const titles = (await call('/offers')).body.data.map((o: any) => o.title).sort()
    assert.deepEqual(titles, ['No dates', 'Running now'])
    assert.equal((await call('/admin/offers', { as: admin })).body.data.length, 5)

    const backwards = await make('Backwards', { startsAt: at(day), endsAt: at(-day) })
    assert.equal(backwards.status, 400)
  })
})

describe('enquiries', () => {
  const enquiry = {
    name: 'Asha Rao',
    email: 'asha@example.com',
    phone: '9876543210',
    inquiryType: 'General Enquiry',
    message: 'Do you ship to Pune?',
  }

  test('staff can add internal notes, which are never public', async () => {
    await call('/enquiries', { method: 'POST', body: enquiry })
    const [saved] = (await enquiryModel.list({ limit: 1, offset: 0 })).enquiries

    const res = await call(`/enquiries/${saved.id}`, {
      method: 'PATCH',
      as: admin,
      body: { internalNotes: 'Called back — wants samples.' },
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.internalNotes, 'Called back — wants samples.')
    assert.equal(res.body.data.status, 'new', 'status is untouched')

    assert.equal((await call(`/enquiries/${saved.id}`)).status, 401)
    assert.equal((await call(`/enquiries/${saved.id}`, { method: 'PATCH', as: admin, body: {} })).status, 400)
  })

  test('a failed Google Sheets sync is recorded against the enquiry, then cleared on success', async () => {
    mock.method(googleSheetsService, 'isConfigured', () => true)
    mock.method(googleSheetsService, 'addEnquiryToGoogleSheet', async () => {
      throw new Error('The caller does not have permission')
    })

    assert.equal((await call('/enquiries', { method: 'POST', body: enquiry })).status, 201)
    let [saved] = (await enquiryModel.list({ limit: 1, offset: 0 })).enquiries
    assert.equal(saved.sheetSyncedAt, null)
    assert.equal(saved.sheetSyncError, 'The caller does not have permission')

    mock.restoreAll()
    mock.method(googleSheetsService, 'isConfigured', () => true)
    mock.method(googleSheetsService, 'addEnquiryToGoogleSheet', async () => {})
    await call('/enquiries/sync-sheet', { method: 'POST', as: admin })

    ;[saved] = (await enquiryModel.list({ limit: 1, offset: 0 })).enquiries
    assert.ok(saved.sheetSyncedAt)
    assert.equal(saved.sheetSyncError, null)
  })
})

describe('access control for content management', () => {
  const uuid = '00000000-0000-4000-8000-000000000000'
  const adminRoutes: [string, string][] = [
    ['GET', '/admin/products'],
    ['POST', '/admin/products'],
    ['GET', '/admin/products/throws'],
    ['PATCH', '/admin/products/throws'],
    ['DELETE', '/admin/products/throws'],
    ['GET', '/admin/categories'],
    ['POST', '/admin/categories'],
    ['PATCH', '/admin/categories/throws'],
    ['DELETE', '/admin/categories/throws'],
    ['GET', '/admin/slides'],
    ['POST', '/admin/slides'],
    ['PATCH', `/admin/slides/${uuid}`],
    ['DELETE', `/admin/slides/${uuid}`],
    ['GET', '/admin/sections'],
    ['PATCH', '/admin/sections/home.intro'],
    ['GET', '/admin/settings'],
    ['PUT', '/admin/settings/brand'],
    ['GET', '/admin/offers'],
    ['POST', '/admin/offers'],
    ['PATCH', `/admin/offers/${uuid}`],
    ['DELETE', `/admin/offers/${uuid}`],
  ]

  test('every content-management route refuses a visitor who is not signed in', async () => {
    for (const [method, path] of adminRoutes) {
      const res = await call(path, { method, body: method === 'GET' ? undefined : {} })
      assert.equal(res.status, 401, `${method} ${path}`)
    }
    assert.equal((await productModel.findById('throws'))?.status, 'published', 'nothing was changed')
  })

  test('a viewer can read everything but change nothing', async () => {
    for (const [method, path] of adminRoutes) {
      const res = await call(path, { method, as: viewer, body: method === 'GET' ? undefined : {} })
      if (method === 'GET') assert.equal(res.status, 200, `${method} ${path}`)
      else assert.equal(res.status, 403, `${method} ${path}`)
    }
    assert.ok(await productModel.findById('throws'), 'the product still exists')
  })

  test('a change without the CSRF token is refused', async () => {
    const res = await call('/admin/products/throws', {
      method: 'DELETE',
      as: { cookie: admin.cookie, csrf: '' },
    })
    assert.equal(res.status, 403)
    assert.ok(await productModel.findById('throws'))
  })

  test('a database failure is reported without detail and without a false success', async () => {
    mock.method(productModel, 'findPublished', async () => {
      throw new Error('connection terminated: postgresql://user:secret@db.internal/parijatak')
    })
    const res = await call('/products')
    assert.equal(res.status, 500)
    assert.deepEqual(res.body, { success: false, message: 'Something went wrong. Please try again later.' })
  })
})
