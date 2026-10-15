import { useState } from 'react'
import type { Product } from '../types'
import { Skeleton } from './Content'
import { ArrowRightIcon } from './Icons'
import { useProductModal } from './ProductModal'

interface ProductCardProps {
  product: Product
  /** Tailwind aspect-ratio class for the image, e.g. `aspect-[4/5]`. */
  aspect?: string
  ctaLabel?: string
  showCategory?: boolean
  className?: string
}

export function ProductCard({
  product,
  aspect = 'aspect-[4/5]',
  ctaLabel = 'View Product',
  showCategory = false,
  className = '',
}: ProductCardProps) {
  const openProduct = useProductModal()
  const open = () => openProduct(product)
  const [failed, setFailed] = useState(false)

  return (
    <article className={`group ${className}`}>
      {/* Mouse convenience only — the button below is the keyboard/screen-reader control */}
      <div className={`${aspect} cursor-pointer overflow-hidden bg-cream`} onClick={open}>
        {failed ? (
          <div className="grid h-full w-full place-items-center text-sm text-muted">
            <span>{product.name} — image unavailable</span>
          </div>
        ) : (
          <img
            src={product.imageUrl}
            alt={product.imageAlt ?? product.name}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        )}
      </div>

      <div className="mt-5">
        {showCategory && <p className="eyebrow mb-2">{product.category}</p>}
        <h3 className="text-3xl md:text-4xl">{product.name}</h3>
        <p className="mt-2 max-w-sm text-muted">
          {product.shortDescription ?? product.description}
        </p>
        <button type="button" onClick={open} aria-haspopup="dialog" className="text-link mt-4">
          {ctaLabel}
          <span className="sr-only">: {product.name}</span>
          <ArrowRightIcon width={16} height={16} />
        </button>
      </div>
    </article>
  )
}

/** Stands in for a card while products are loading. */
export function ProductCardSkeleton({
  aspect = 'aspect-[4/5]',
  className = '',
}: {
  aspect?: string
  className?: string
}) {
  return (
    <div className={className}>
      <Skeleton className={aspect} />
      <Skeleton className="mt-5 h-8 w-2/3" />
      <Skeleton className="mt-3 h-4 w-full max-w-sm" />
    </div>
  )
}
