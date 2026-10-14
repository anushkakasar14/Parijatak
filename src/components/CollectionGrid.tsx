import type { Product } from '../types'
import { ProductCard } from './ProductCard'

interface CollectionGridProps {
  products: Product[]
}

/** An even grid: every product image has the same 4:5 shape, so the collection reads calmly. */
export function CollectionGrid({ products }: CollectionGridProps) {
  return (
    <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 md:gap-y-16">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          aspect="aspect-[4/5]"
          ctaLabel="View Details"
          showCategory
        />
      ))}
    </div>
  )
}
