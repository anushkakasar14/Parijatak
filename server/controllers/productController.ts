import type { Request, Response } from 'express'
import { env } from '../config/env.ts'
import { settingsModel } from '../models/contentModels.ts'
import { productModel } from '../models/productModel.ts'
import type { Product } from '../models/productModel.ts'
import { HttpError } from '../utils/httpError.ts'
import { listProductsSchema } from '../utils/schemas.ts'

/** The WhatsApp number set in the admin settings, falling back to the environment default. */
async function whatsappNumber(): Promise<string> {
  const contact = await settingsModel.get<{ whatsappNumber?: string }>('contact')
  return contact?.whatsappNumber || env.WHATSAPP_NUMBER
}

/** Public shape of a product: drops the internal status, adds the WhatsApp enquiry link. */
function toPublicProduct({ status: _status, ...product }: Product, number: string) {
  const message = `Hello Parijatak, I am interested in the ${product.name} collection. I would like to know more about availability, pricing and customization options.`
  return {
    ...product,
    whatsappEnquiryUrl: `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
  }
}

export const productController = {
  /** Published products only — drafts and archived products are never returned here. */
  async list(req: Request, res: Response) {
    const { featured, category } = listProductsSchema.parse(req.query)
    // One query after another: a request should hold a single database connection.
    const products = await productModel.findPublished({
      featured: featured === undefined ? undefined : featured === 'true',
      category,
    })
    const number = await whatsappNumber()
    res.json({ success: true, data: products.map((p) => toPublicProduct(p, number)) })
  },

  async get(req: Request<{ id: string }>, res: Response) {
    const product = await productModel.findPublishedByIdOrSlug(req.params.id)
    if (!product) throw new HttpError(404, 'Product not found')
    res.json({ success: true, data: toPublicProduct(product, await whatsappNumber()) })
  },
}
