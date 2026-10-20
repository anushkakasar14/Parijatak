import { formatRupees, priceSummary } from '../../shared/productPricing'
import type { Product } from '../types'

/** "₹5,000", "₹3,000 – ₹5,000", an offer with the old price struck through, or "Price on enquiry". */
export function ProductPrice({ product, className = '' }: { product: Product; className?: string }) {
  const summary = priceSummary(product)

  if (summary.kind === 'none') {
    return <p className={`text-muted ${className}`}>Price on enquiry</p>
  }
  return (
    <p className={`font-medium text-maroon ${className}`}>
      <span className="sr-only">Price: </span>
      {summary.kind === 'range' ? (
        <>
          {formatRupees(summary.min)} – {formatRupees(summary.max)}
        </>
      ) : (
        <>
          {formatRupees(summary.price)}
          {summary.was !== null && (
            <>
              {' '}
              <s className="font-normal text-muted">
                <span className="sr-only">was </span>
                {formatRupees(summary.was)}
              </s>
            </>
          )}
        </>
      )}
      {summary.someOnEnquiry && <span className="text-sm font-normal text-muted"> · some sizes on enquiry</span>}
    </p>
  )
}

/** "Sizes: Small | Medium | Large" — only the sizes saved for the product; nothing when there are none. */
export function ProductSizes({ product, className = '' }: { product: Product; className?: string }) {
  if (!product.sizes.length) return null
  return (
    <p className={`text-sm text-muted ${className}`}>
      {product.sizes.length === 1 ? 'Size' : 'Sizes'}: {product.sizes.map((size) => size.label).join(' | ')}
    </p>
  )
}
