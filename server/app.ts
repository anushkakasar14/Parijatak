import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.ts'
import { errorHandler, notFound } from './middleware/errorHandler.ts'
import { apiLimiter } from './middleware/rateLimit.ts'
import { apiRoutes } from './routes/index.ts'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', env.TRUST_PROXY)

  app.use(helmet())

  app.use(
    '/api',
    cors({ origin: env.corsOrigins, methods: ['GET', 'POST', 'PATCH'] }),
    apiLimiter,
    express.json({ limit: '10kb' }),
    apiRoutes,
    notFound,
  )

  // If the frontend has been built (npm run build), serve it from the same server
  // so the whole site can be deployed as a single service.
  const dist = resolve('dist')
  if (existsSync(resolve(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: env.isProduction ? '1h' : 0 }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || !req.accepts('html')) return next()
      res.sendFile(resolve(dist, 'index.html'))
    })
  }

  app.use(notFound)
  app.use(errorHandler)

  return app
}
