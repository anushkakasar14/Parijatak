import type { Request, Response } from 'express'
import { getDb } from '../config/database.ts'
import type { Queryable } from '../config/database.ts'
import { productImageModel } from '../models/productImageModel.ts'
import type { ProductImageRecord } from '../models/productImageModel.ts'
import {
  MAX_PRODUCT_IMAGES,
  addProductImageSchema,
  idParam,
  productImageParams,
  reorderProductImagesSchema,
  updateProductImageSchema,
} from '../utils/contentSchemas.ts'

/**
 * A product's pictures, one at a time. Every change runs in one transaction with the
 * product locked, and updates the product's picture columns in the same commit, so the
 * website never sees a half-changed gallery.
 */
async function inTransaction<T>(productId: string, fn: (tx: Queryable) => Promise<T>) {
  const db = await getDb()
  return db.transaction(async (tx) => {
    await productImageModel.lockProduct(tx, productId)
    return fn(tx)
  })
}

/** The gallery as the admin sees it, in order, after a change. */
async function gallery(productId: string): Promise<ProductImageRecord[]> {
  return productImageModel.list(await getDb(), productId)
}

export const productImageController = {
  async list(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const images = await inTransaction(id, (tx) => productImageModel.list(tx, id))
    res.json({ success: true, data: images })
  },

  /** Adds a picture (an uploaded image's address, or a site file) at the end of the gallery. */
  async add(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const input = addProductImageSchema.parse(req.body)
    const image = await inTransaction(id, (tx) => productImageModel.add(tx, id, input, MAX_PRODUCT_IMAGES))
    res.status(201).json({ success: true, data: { image, images: await gallery(id) } })
  },

  /** Changes the description, or replaces the picture in the same place. */
  async update(req: Request, res: Response) {
    const { id, imageId } = productImageParams.parse(req.params)
    const patch = updateProductImageSchema.parse(req.body)
    const image = await inTransaction(id, (tx) => productImageModel.update(tx, id, imageId, patch))
    res.json({ success: true, data: { image, images: await gallery(id) } })
  },

  async setPrimary(req: Request, res: Response) {
    const { id, imageId } = productImageParams.parse(req.params)
    await inTransaction(id, (tx) => productImageModel.setPrimary(tx, id, imageId))
    res.json({ success: true, data: { images: await gallery(id) } })
  },

  async reorder(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const { imageIds } = reorderProductImagesSchema.parse(req.body)
    await inTransaction(id, (tx) => productImageModel.reorder(tx, id, imageIds))
    res.json({ success: true, data: { images: await gallery(id) } })
  },

  /** Removes the picture from this product only; the uploaded file stays in the media library. */
  async remove(req: Request, res: Response) {
    const { id, imageId } = productImageParams.parse(req.params)
    await inTransaction(id, (tx) => productImageModel.remove(tx, id, imageId))
    res.json({ success: true, data: { images: await gallery(id) } })
  },
}
