import type { Product } from '../types'
import { ProductCard } from './ProductCard'

/**
 * Asymmetric collage placements on a 12-column grid, repeated every three products
 * so the layout keeps its rhythm as the collection grows.
 */
const placements = [
  { cell: 'md:col-span-7', aspect: 'aspect-[4/3]' },
  { cell: 'md:col-span-4 md:col-start-9 md:mt-40', aspect: 'aspect-[3/4]' },
  { cell: 'md:col-span-6 md:col-start-3 md:-mt-10', aspect: 'aspect-square' },
]

interface CollectionGridProps {
  products: Product[]
}

export function CollectionGrid({ products }: CollectionGridProps) {
  return (
    <div className="grid gap-x-8 gap-y-16 md:grid-cols-12 md:gap-y-24">
      {products.map((product, i) => {
        const { cell, aspect } = placements[i % placements.length]
        return (
          <ProductCard
            key={product.id}
            product={product}
            aspect={aspect}
            ctaLabel="View Details"
            showCategory
            className={cell}
          />
        )
      })}
    </div>
  )
}
