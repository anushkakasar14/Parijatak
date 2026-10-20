import { useResource } from '../hooks/useResource'
import type { Product } from '../types'
import { LoadError } from './Content'
import { ProductCard, ProductCardSkeleton } from './ProductCard'

const FEATURED_COUNT = 3

/**
 * A few products from the collection — featured ones first; if none are marked, the first
 * few. Used on Home and About, so both always show the same saved prices and sizes.
 */
export function FeaturedProducts() {
  const { data: products, status, retry } = useResource<Product[]>('/products')

  if (status === 'error') {
    return <LoadError message="The collection could not be loaded." onRetry={retry} />
  }

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading products" className="grid gap-x-8 gap-y-14 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  const all = products ?? []
  const featured = all.filter((p) => p.isFeatured)
  const shown = (featured.length ? featured : all).slice(0, FEATURED_COUNT)

  if (shown.length === 0) {
    return <p className="text-muted">New pieces are on their way — please check back soon.</p>
  }

  return (
    <div className="grid gap-x-8 gap-y-14 md:grid-cols-3">
      {shown.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
