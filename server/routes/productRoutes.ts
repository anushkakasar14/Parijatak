import { Router } from 'express'
import { productController } from '../controllers/productController.ts'

export const productRoutes = Router()

productRoutes.get('/', productController.list)
productRoutes.get('/:id', productController.get)
