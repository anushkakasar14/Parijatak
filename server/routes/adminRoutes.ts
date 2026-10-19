import express, { Router } from 'express'
import { adminContentController as content } from '../controllers/adminContentController.ts'
import { adminController } from '../controllers/adminController.ts'
import { MAX_UPLOAD_BYTES, mediaController } from '../controllers/mediaController.ts'
import { productImageController as productImages } from '../controllers/productImageController.ts'
import { adminLimiter } from '../middleware/rateLimit.ts'
import { requireAdmin, requireRole } from '../middleware/requireAdmin.ts'

/**
 * Admin-only API, mounted at /api/admin. The first line applies to EVERYTHING below:
 * no route here can be reached without a signed-in administrator. Routes that change
 * data additionally require the `admin` role (a `viewer` may only read).
 */
export const adminRoutes = Router()

adminRoutes.use(adminLimiter, requireAdmin)
const write = requireRole('admin')

adminRoutes.get('/overview', adminController.overview)
adminRoutes.get('/integrations/google-sheets', adminController.googleSheetsHealth)

adminRoutes.get('/products', content.listProducts)
adminRoutes.post('/products', write, content.createProduct)
adminRoutes.get('/products/:id', content.getProduct)
adminRoutes.patch('/products/:id', write, content.updateProduct)
adminRoutes.post('/products/:id/duplicate', write, content.duplicateProduct)
adminRoutes.delete('/products/:id', write, content.deleteProduct)

// A product's pictures, one at a time (the product form can also save them all at once).
adminRoutes.get('/products/:id/images', productImages.list)
adminRoutes.post('/products/:id/images', write, productImages.add)
adminRoutes.put('/products/:id/images/order', write, productImages.reorder)
adminRoutes.patch('/products/:id/images/:imageId', write, productImages.update)
adminRoutes.post('/products/:id/images/:imageId/primary', write, productImages.setPrimary)
adminRoutes.delete('/products/:id/images/:imageId', write, productImages.remove)

adminRoutes.get('/categories', content.listCategories)
adminRoutes.post('/categories', write, content.createCategory)
adminRoutes.patch('/categories/:id', write, content.updateCategory)
adminRoutes.delete('/categories/:id', write, content.deleteCategory)

adminRoutes.get('/slides', content.listSlides)
adminRoutes.post('/slides', write, content.createSlide)
adminRoutes.patch('/slides/:id', write, content.updateSlide)
adminRoutes.delete('/slides/:id', write, content.deleteSlide)

adminRoutes.get('/sections', content.listSections)
adminRoutes.patch('/sections/:id', write, content.updateSection)

adminRoutes.get('/settings', content.getSettings)
adminRoutes.put('/settings/:key', write, content.updateSetting)

adminRoutes.get('/offers', content.listOffers)
adminRoutes.post('/offers', write, content.createOffer)
adminRoutes.patch('/offers/:id', write, content.updateOffer)
adminRoutes.delete('/offers/:id', write, content.deleteOffer)

// Media library. Uploads arrive as the raw file; the server checks what it really is.
adminRoutes.get('/media', mediaController.list)
adminRoutes.post(
  '/media',
  write,
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  mediaController.upload,
)
// Videos: too large for one request, so they are sent in pieces (see mediaController).
adminRoutes.post('/media/videos', write, mediaController.startVideo)
adminRoutes.put(
  '/media/videos/:uploadId/chunks/:index',
  write,
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  mediaController.putVideoChunk,
)
adminRoutes.post('/media/videos/:uploadId/complete', write, mediaController.completeVideo)
adminRoutes.delete('/media/videos/:uploadId', write, mediaController.abortVideo)
adminRoutes.patch('/media/:id', write, mediaController.update)
adminRoutes.delete('/media/:id', write, mediaController.remove)
