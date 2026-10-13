import { Router } from 'express'
import { getDb } from '../config/database.ts'
import { googleSheetsService } from '../services/googleSheetsService.ts'
import { errorMessage, logger } from '../utils/logger.ts'
import { adminAuthRoutes } from './adminAuthRoutes.ts'
import { adminRoutes } from './adminRoutes.ts'
import { enquiryRoutes } from './enquiryRoutes.ts'
import { productRoutes } from './productRoutes.ts'

export const apiRoutes = Router()

/** Reports whether each integration is ready, without revealing any configuration values. */
apiRoutes.get('/health', async (_req, res) => {
  let database = 'ok'
  try {
    await (await getDb()).query('SELECT 1')
  } catch (err) {
    database = 'unavailable'
    logger.error('Health check: database unavailable', { error: errorMessage(err) })
  }

  res.status(database === 'ok' ? 200 : 503).json({
    success: database === 'ok',
    data: {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      googleSheets: googleSheetsService.isConfigured() ? 'configured' : 'not configured',
    },
  })
})

apiRoutes.use('/admin/auth', adminAuthRoutes)
apiRoutes.use('/admin', adminRoutes)
apiRoutes.use('/products', productRoutes)
apiRoutes.use('/enquiries', enquiryRoutes)
