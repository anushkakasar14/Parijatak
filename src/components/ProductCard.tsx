import type { Product } from '../types'
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

  return (
    <article className={`group ${className}`}>
      {/* Mouse convenience only — the button below is the keyboard/screen-reader control */}
      <div className={`${aspect} cursor-pointer overflow-hidden bg-cream`} onClick={open}>
        <img
          src={product.image}
          alt={product.imageAlt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      </div>

      <div className="mt-5">
        {showCategory && <p className="eyebrow mb-2">{product.category}</p>}
        <h3 className="text-3xl md:text-4xl">{product.name}</h3>
        <p className="mt-2 max-w-sm text-muted">{product.shortDescription}</p>
        <button type="button" onClick={open} aria-haspopup="dialog" className="text-link mt-4">
          {ctaLabel}
          <span className="sr-only">: {product.name}</span>
          <ArrowRightIcon width={16} height={16} />
        </button>
      </div>
    </article>
  )
}
