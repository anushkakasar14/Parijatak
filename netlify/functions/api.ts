import { connectLambda } from '@netlify/blobs'
import serverless from 'serverless-http'

/**
 * Runs the Express API as a Netlify Function, so the site and its API live on one host.
 * netlify.toml routes /api/* here.
 */

type Handler = (event: Record<string, unknown>, context: unknown) => Promise<unknown>

let handlerPromise: Promise<Handler> | undefined

async function build(): Promise<Handler> {
  // Tells the app it may trust Netlify's client-IP header (see server/utils/clientIp.ts).
  process.env.PARIJATAK_RUNTIME = 'netlify'

  // A deployed function is always production. This is set here rather than as a Netlify
  // environment variable because NODE_ENV=production at BUILD time makes npm skip the
  // build tools, which breaks the site build.
  process.env.NODE_ENV ??= 'production'

  // Imported lazily so a configuration problem becomes a clean JSON error
  // instead of a function that fails to start.
  const { createApp } = await import('../../server/app.ts')
  // Images are sent back as binary, not text.
  return serverless(createApp(), { binary: ['image/*'] }) as Handler
}

export const handler: Handler = async (event, context) => {
  try {
    // Gives Netlify Blobs (uploaded media) its credentials for this request.
    try {
      connectLambda(event as unknown as Parameters<typeof connectLambda>[0])
    } catch {
      // Not running on Netlify (e.g. a local bundle test) — media storage is unavailable there.
    }

    handlerPromise ??= build()
    const run = await handlerPromise

    // Called directly, the path is /.netlify/functions/api/...; Express expects /api/...
    if (typeof event.path === 'string') {
      event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '/api')
    }

    return await run(event, context)
  } catch (err) {
    handlerPromise = undefined
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'API failed to start',
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        message: 'The service is temporarily unavailable. Please try again later.',
      }),
    }
  }
}
