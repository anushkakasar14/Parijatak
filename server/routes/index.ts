import { Router } from 'express'
import { enquiryRoutes } from './enquiryRoutes.ts'
import { productRoutes } from './productRoutes.ts'

export const apiRoutes = Router()

apiRoutes.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } })
})

apiRoutes.use('/products', productRoutes)
apiRoutes.use('/enquiries', enquiryRoutes)
