/**
 * How a product's price reads on the website, worked out from what the administrator saved:
 * a base price (with an optional offer price) and, optionally, sizes with their own prices.
 * Shared by the public pages so every card and the product details agree.
 */
export interface ProductSize {
  label: string
  /** Only when this size costs something other than the product's price. */
  price: number | null
}

interface Priced {
  price: number | null
  offerPrice: number | null
  sizes: ProductSize[]
}

export type PriceSummary =
  | { kind: 'none' }
  | { kind: 'single'; price: number; was: number | null; someOnEnquiry?: boolean }
  | { kind: 'range'; min: number; max: number; someOnEnquiry?: boolean }

/** The product's own price, or its offer price when that is lower. */
function basePrice(product: Priced): { price: number; was: number | null } | null {
  if (product.price === null) return null
  if (product.offerPrice !== null && product.offerPrice < product.price) {
    return { price: product.offerPrice, was: product.price }
  }
  return { price: product.price, was: null }
}

/** What one size costs: its own price, otherwise the product's price. */
export function sizePrice(product: Priced, size: ProductSize): number | null {
  return size.price ?? basePrice(product)?.price ?? null
}

/** True when at least one size has a price of its own. */
export const pricedBySize = (product: Priced) => product.sizes.some((size) => size.price !== null)

export function priceSummary(product: Priced): PriceSummary {
  const base = basePrice(product)
  if (!pricedBySize(product)) return base ? { kind: 'single', ...base } : { kind: 'none' }

  const prices = product.sizes
    .map((size) => sizePrice(product, size))
    .filter((price): price is number => price !== null)
  // Sizes with no price at all (no own price and no product price) are asked about instead.
  const someOnEnquiry = prices.length < product.sizes.length
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max
    ? { kind: 'single', price: min, was: null, someOnEnquiry }
    : { kind: 'range', min, max, someOnEnquiry }
}

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** e.g. 1500 → "₹1,500". */
export const formatRupees = (amount: number) => rupees.format(amount)
