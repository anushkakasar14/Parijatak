import serverless from 'serverless-http'

/**
 * Runs the Express API as a Netlify Function, so the site and its API live on one host.
 * netlify.toml routes /api/* here.
 */

type Handler = (event: Record<string, unknown>, context: unknown) => Promise<unknown>

let handlerPromise: Promise<Handler> | undefined

async function build(): Promise<Handler> {
  // Imported lazily so a configuration problem becomes a clean JSON error
  // instead of a function that fails to start.
  const { createApp } = await import('../../server/app.ts')
  return serverless(createApp()) as Handler
}

export const handler: Handler = async (event, context) => {
  try {
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
