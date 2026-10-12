import type { ReactNode } from 'react'

interface SectionHeadingProps {
  eyebrow?: string
  title: string
  children?: ReactNode
  /** Heading level — use `h1` once per page. */
  as?: 'h1' | 'h2'
  align?: 'left' | 'center'
  /** Use on dark (teal) backgrounds. */
  inverted?: boolean
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  as: Heading = 'h2',
  align = 'left',
  inverted = false,
  className = '',
}: SectionHeadingProps) {
  const size =
    Heading === 'h1' ? 'text-5xl md:text-6xl lg:text-7xl' : 'text-4xl md:text-5xl lg:text-[3.5rem]'

  return (
    <div className={`${align === 'center' ? 'mx-auto text-center' : ''} max-w-2xl ${className}`}>
      {eyebrow && (
        <p className={`eyebrow mb-5 ${inverted ? 'text-ivory/80' : ''}`}>{eyebrow}</p>
      )}
      <Heading className={size}>{title}</Heading>
      {children && (
        <div
          className={`mt-6 space-y-4 text-base md:text-lg ${inverted ? 'text-ivory/90' : 'text-muted'}`}
        >
          {children}
        </div>
      )}
    </div>
  )
}
