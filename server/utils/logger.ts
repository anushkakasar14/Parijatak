type Meta = Record<string, unknown>

function write(level: 'info' | 'warn' | 'error', message: string, meta?: Meta) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...meta })
  if (level === 'error') console.error(line)
  else console.log(line)
}

/** Minimal structured logger. Never pass secrets or full request bodies as meta. */
export const logger = {
  info: (message: string, meta?: Meta) => write('info', message, meta),
  warn: (message: string, meta?: Meta) => write('warn', message, meta),
  error: (message: string, meta?: Meta) => write('error', message, meta),
}

/** Reduces an unknown thrown value to a loggable message (no stack, no payload). */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
