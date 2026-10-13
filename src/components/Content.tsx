import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * A link whose destination comes from the database: a path on this site becomes a
 * router link; a full https:// address opens in a new tab. Anything else renders nothing.
 */
export function SmartLink({
  to,
  className,
  children,
}: {
  to: string | null | undefined
  className?: string
  children: ReactNode
}) {
  if (!to) return null
  if (to.startsWith('/')) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    )
  }
  if (to.startsWith('https://')) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  }
  return null
}

/** Renders plain text as paragraphs; a blank line starts a new one. Never interprets HTML. */
export function Paragraphs({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </>
  )
}

/**
 * Hides a page's wording for the instant it is loading, keeping its space so nothing
 * jumps. A plain show/hide on purpose: an animation here could leave text invisible if
 * the browser paused it (as it does in background tabs).
 */
export function FadeIn({ ready, children }: { ready: boolean; children: ReactNode }) {
  return (
    <div aria-busy={!ready} className={ready ? undefined : 'invisible'}>
      {children}
    </div>
  )
}

/** A neutral block shown while an image or card is loading. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse bg-cream ${className}`} />
}

/** Shown when content could not be loaded, with a way to try again. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="border border-line bg-cream px-6 py-10 text-center">
      <p className="font-display text-2xl">{message}</p>
      <button type="button" onClick={onRetry} className="text-link mt-5">
        Try again
      </button>
    </div>
  )
}
