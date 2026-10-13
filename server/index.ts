import { createApp } from './app.ts'
import { closeDb, getDb } from './config/database.ts'
import { env } from './config/env.ts'
import { googleSheetsService } from './services/googleSheetsService.ts'
import { errorMessage, logger } from './utils/logger.ts'

// Connect (and create tables) before accepting traffic, so problems show up at start-up.
try {
  await getDb()
} catch (err) {
  logger.error('Could not connect to the database', { error: errorMessage(err) })
  process.exit(1)
}

const server = createApp().listen(env.PORT, () => {
  logger.info(`Parijatak API listening on port ${env.PORT}`, {
    environment: env.NODE_ENV,
    database: env.DATABASE_URL ? 'PostgreSQL' : 'embedded (development)',
    googleSheets: googleSheetsService.isConfigured() ? 'enabled' : 'not configured',
    legacyAdminKey: env.ADMIN_API_KEY ? 'enabled' : 'off',
  })
})

function shutdown() {
  server.close(async () => {
    await closeDb().catch(() => {})
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
