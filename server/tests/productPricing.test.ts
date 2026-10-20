import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { formatRupees, priceSummary, sizePrice } from '../../shared/productPricing.ts'

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'memory://',
  ADMIN_API_KEY: '',
  GOOGLE_SHEETS_ID: '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
})

const { closeDb, getDb } = await import('../config/database.ts')
const { migrations } = await import('../config/migrations.ts')

after(async () => {
  await closeDb()
})

const product = (price: number | null, sizes: { label: string; price: number | null }[] = [], offerPrice: number | null = null) => ({
  price,
  offerPrice,
  sizes,
})

describe('how prices read on the website', () => {
  test('rupees are written the Indian way', () => {
    assert.equal(formatRupees(1500), '₹1,500')
    assert.equal(formatRupees(125000), '₹1,25,000')
  })

  test('one price, an offer, or nothing to show', () => {
    assert.deepEqual(priceSummary(product(5000)), { kind: 'single', price: 5000, was: null })
    assert.deepEqual(priceSummary(product(5000, [], 4500)), { kind: 'single', price: 4500, was: 5000 })
    assert.deepEqual(priceSummary(product(5000, [], 6000)), { kind: 'single', price: 5000, was: null }, 'a higher "offer" is ignored')
    assert.deepEqual(priceSummary(product(null)), { kind: 'none' })
    // Sizes without prices of their own do not change the price.
    assert.deepEqual(priceSummary(product(3000, [{ label: 'One size', price: null }])), { kind: 'single', price: 3000, was: null })
  })

  test('sizes priced differently give a range; sizes without a price use the product price', () => {
    const p = product(1500, [
      { label: 'Small', price: null },
      { label: 'Large', price: 2800 },
    ])
    assert.equal(sizePrice(p, p.sizes[0]), 1500)
    assert.equal(sizePrice(p, p.sizes[1]), 2800)
    assert.deepEqual(priceSummary(p), { kind: 'range', min: 1500, max: 2800, someOnEnquiry: false })
  })

  test('a size with no price at all is reported as on enquiry, never guessed', () => {
    const p = product(null, [
      { label: 'Small', price: null },
      { label: 'Large', price: 2800 },
    ])
    assert.equal(sizePrice(p, p.sizes[0]), null)
    assert.deepEqual(priceSummary(p), { kind: 'single', price: 2800, was: null, someOnEnquiry: true })
  })
})

describe('migration 9 (product sizes)', () => {
  test('a saved one-line size becomes the first size; products without one get none', async () => {
    const db = await getDb()
    const backfill = migrations.find((m) => m.version === 9)!.statements[1]
    await db.query(`UPDATE products SET sizes = '[]', dimensions = NULL`)
    await db.query(`UPDATE products SET dimensions = '  3 ft × 8 ft ' WHERE id = 'throws'`)
    await db.query(`UPDATE products SET dimensions = '   ' WHERE id = 'bed-linens'`)

    await db.query(backfill)

    const { rows } = await db.query<{ id: string; sizes: unknown }>(`SELECT id, sizes FROM products ORDER BY id`)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.sizes]))
    assert.deepEqual(byId.throws, [{ label: '3 ft × 8 ft', price: null }])
    assert.deepEqual(byId['bed-linens'], [])
    assert.deepEqual(byId['cushion-covers'], [])
  })
})
