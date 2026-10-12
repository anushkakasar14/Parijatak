import type { Request, Response } from 'express'
import { env } from '../config/env.ts'
import { productModel } from '../models/productModel.ts'
import type { Product } from '../models/productModel.ts'
import { HttpError } from '../utils/httpError.ts'
import { listProductsSchema } from '../utils/schemas.ts'

/** Public shape of a product: drops the internal isActive flag, adds the WhatsApp enquiry link. */
function toPublicProduct({ isActive: _isActive, ...product }: Product) {
  const message = `Hello Parijatak, I am interested in the ${product.name} collection. I would like to know more about availability, pricing and customization options.`
  return {
    ...product,
    whatsappEnquiryUrl: `https://wa.me/${env.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
  }
}

export const productController = {
  async list(req: Request, res: Response) {
    const { featured, category } = listProductsSchema.parse(req.query)
    const products = await productModel.findActive({
      featured: featured === undefined ? undefined : featured === 'true',
      category,
    })
    res.json({ success: true, data: products.map(toPublicProduct) })
  },

  async get(req: Request<{ id: string }>, res: Response) {
    const product = await productModel.findActiveByIdOrSlug(req.params.id)
    if (!product) throw new HttpError(404, 'Product not found')
    res.json({ success: true, data: toPublicProduct(product) })
  },
}
