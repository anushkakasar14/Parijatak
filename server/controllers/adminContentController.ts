import type { Request, Response } from 'express'
import {
  categoryModel,
  offerModel,
  sectionModel,
  settingsModel,
  slideModel,
} from '../models/contentModels.ts'
import { productModel } from '../models/productModel.ts'
import type { ProductInput } from '../models/productModel.ts'
import {
  createCategorySchema,
  createOfferSchema,
  createProductSchema,
  createSlideSchema,
  idParam,
  listAdminProductsSchema,
  settingKeyParam,
  settingSchemas,
  slugify,
  updateCategorySchema,
  updateOfferSchema,
  updateProductSchema,
  updateSectionSchema,
  updateSlideSchema,
  uuidParam,
} from '../utils/contentSchemas.ts'
import { HttpError } from '../utils/httpError.ts'

/**
 * Content management for administrators. Every route using these handlers sits behind
 * `requireAdmin`; the ones that change data also require the `admin` role.
 */

const notFound = (what: string) => new HttpError(404, `${what} not found`)

/** Replaces "not sent" with null for optional fields when creating a record. */
function withNulls<T extends object, K extends keyof T>(value: T, keys: K[]) {
  const result = { ...value }
  for (const key of keys) if (result[key] === undefined) result[key] = null as T[K]
  return result as { [P in keyof T]-?: P extends K ? Exclude<T[P], undefined> : T[P] }
}

async function requireCategory(categoryId: string) {
  if (!(await categoryModel.exists(categoryId))) {
    throw new HttpError(400, 'Please check the details you entered.', {
      categoryId: 'That category does not exist',
    })
  }
}

/** The older one-line "size" text, kept in step with the sizes list for older readers. */
const sizesText = (sizes: { label: string }[]) => (sizes.length ? sizes.map((size) => size.label).join(', ').slice(0, 300) : null)

export const adminContentController = {
  // ── Products ──────────────────────────────────────────────────────────────────

  async listProducts(req: Request, res: Response) {
    const filter = listAdminProductsSchema.parse(req.query)
    const { products, total } = await productModel.adminList(filter)
    res.json({
      success: true,
      data: products,
      pagination: { total, limit: filter.limit, offset: filter.offset },
    })
  },

  async getProduct(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const product = await productModel.findById(id)
    if (!product) throw notFound('Product')
    res.json({ success: true, data: product })
  },

  async createProduct(req: Request, res: Response) {
    const input = createProductSchema.parse(req.body)
    await requireCategory(input.categoryId)

    const slug = input.slug ?? slugify(input.name)
    if (!slug) {
      throw new HttpError(400, 'Please check the details you entered.', {
        slug: 'Enter a web address (slug) for this product',
      })
    }

    if (input.sizes.length) input.dimensions = sizesText(input.sizes)
    const product = await productModel.create({
      ...withNulls(input, [
        'shortDescription',
        'material',
        'craftsmanship',
        'dimensions',
        'price',
        'offerPrice',
        'imageAlt',
      ]),
      slug,
    } as ProductInput)
    res.status(201).json({ success: true, data: product })
  },

  async updateProduct(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const patch = updateProductSchema.parse(req.body)
    if (patch.categoryId) await requireCategory(patch.categoryId)
    if (patch.sizes) patch.dimensions = sizesText(patch.sizes)

    const product = await productModel.update(id, patch as Partial<ProductInput>)
    if (!product) throw notFound('Product')
    res.json({ success: true, data: product })
  },

  /** Copies a product as a new draft with its own web address. */
  async duplicateProduct(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const copy = await productModel.duplicate(id)
    if (!copy) throw notFound('Product')
    res.status(201).json({ success: true, data: copy })
  },

  async deleteProduct(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    if (!(await productModel.delete(id))) throw notFound('Product')
    res.json({ success: true, message: 'Product deleted' })
  },

  // ── Categories ────────────────────────────────────────────────────────────────

  async listCategories(_req: Request, res: Response) {
    res.json({ success: true, data: await categoryModel.list({ publishedOnly: false }) })
  },

  async createCategory(req: Request, res: Response) {
    const { slug, ...input } = createCategorySchema.parse(req.body)
    const id = slug ?? slugify(input.name)
    if (!id) throw new HttpError(400, 'Please check the details you entered.', { name: 'Enter a name' })
    if (await categoryModel.exists(id)) {
      throw new HttpError(409, 'Another category already uses this name or web address.')
    }

    await categoryModel.create({ id, ...input, description: input.description ?? null })
    const created = (await categoryModel.list({ publishedOnly: false })).find((c) => c.id === id)
    res.status(201).json({ success: true, data: created })
  },

  async updateCategory(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const { slug, ...patch } = updateCategorySchema.parse(req.body)
    const newId = await categoryModel.update(id, { ...patch, ...(slug ? { id: slug } : {}) })
    if (!newId) throw notFound('Category')
    const updated = (await categoryModel.list({ publishedOnly: false })).find((c) => c.id === newId)
    res.json({ success: true, data: updated })
  },

  async deleteCategory(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    if (!(await categoryModel.delete(id))) throw notFound('Category')
    res.json({ success: true, message: 'Category deleted' })
  },

  // ── Homepage slides ───────────────────────────────────────────────────────────

  async listSlides(_req: Request, res: Response) {
    res.json({ success: true, data: await slideModel.listAll() })
  },

  async createSlide(req: Request, res: Response) {
    const input = createSlideSchema.parse(req.body)
    const slide = await slideModel.create(
      withNulls(input, ['posterUrl', 'eyebrow', 'description', 'ctaLabel', 'ctaUrl']),
    )
    res.status(201).json({ success: true, data: slide })
  },

  async updateSlide(req: Request, res: Response) {
    const { id } = uuidParam.parse(req.params)
    const slide = await slideModel.update(id, updateSlideSchema.parse(req.body))
    if (!slide) throw notFound('Slide')
    res.json({ success: true, data: slide })
  },

  async deleteSlide(req: Request, res: Response) {
    const { id } = uuidParam.parse(req.params)
    if (!(await slideModel.delete(id))) throw notFound('Slide')
    res.json({ success: true, message: 'Slide deleted' })
  },

  // ── Page sections ─────────────────────────────────────────────────────────────

  async listSections(req: Request, res: Response) {
    const page = typeof req.query.page === 'string' ? req.query.page.slice(0, 32) : undefined
    res.json({ success: true, data: await sectionModel.list(page) })
  },

  async updateSection(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const section = await sectionModel.update(id, updateSectionSchema.parse(req.body))
    if (!section) throw notFound('Section')
    res.json({ success: true, data: section })
  },

  // ── Site settings ─────────────────────────────────────────────────────────────

  async getSettings(_req: Request, res: Response) {
    res.json({ success: true, data: await settingsModel.all() })
  },

  async updateSetting(req: Request, res: Response) {
    const { key } = settingKeyParam.parse(req.params)
    const value = settingSchemas[key].parse(req.body)
    await settingsModel.set(key, value)
    res.json({ success: true, data: value })
  },

  // ── Offers ────────────────────────────────────────────────────────────────────

  async listOffers(_req: Request, res: Response) {
    res.json({ success: true, data: await offerModel.listAll() })
  },

  async createOffer(req: Request, res: Response) {
    const input = createOfferSchema.parse(req.body)
    const offer = await offerModel.create(
      withNulls(input, [
        'description',
        'discountText',
        'bannerImageUrl',
        'bannerImageAlt',
        'ctaLabel',
        'ctaUrl',
        'startsAt',
        'endsAt',
      ]),
    )
    res.status(201).json({ success: true, data: offer })
  },

  async updateOffer(req: Request, res: Response) {
    const { id } = uuidParam.parse(req.params)
    const offer = await offerModel.update(id, updateOfferSchema.parse(req.body))
    if (!offer) throw notFound('Offer')
    res.json({ success: true, data: offer })
  },

  async deleteOffer(req: Request, res: Response) {
    const { id } = uuidParam.parse(req.params)
    if (!(await offerModel.delete(id))) throw notFound('Offer')
    res.json({ success: true, message: 'Offer deleted' })
  },
}
