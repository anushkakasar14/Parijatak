import { createApp } from './app.ts'
import { db } from './config/database.ts'
import { env } from './config/env.ts'
import { googleSheetsService } from './services/googleSheetsService.ts'
import { logger } from './utils/logger.ts'

const server = createApp().listen(env.PORT, () => {
  logger.info(`Parijatak API listening on port ${env.PORT}`, {
    environment: env.NODE_ENV,
    googleSheets: googleSheetsService.isConfigured ? 'enabled' : 'not configured',
    adminEndpoints: env.ADMIN_API_KEY ? 'enabled' : 'disabled (ADMIN_API_KEY not set)',
  })
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
