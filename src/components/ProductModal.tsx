import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { formatRupees, pricedBySize, sizePrice } from '../../shared/productPricing'
import { whatsappMessages } from '../lib/whatsapp'
import type { Product } from '../types'
import { CloseIcon } from './Icons'
import { ProductImages } from './ProductImages'
import { ProductPrice } from './ProductPrice'
import { WhatsAppButton } from './WhatsAppButton'

/** Each size with what it costs, for products whose sizes are priced differently. */
function SizePrices({ product }: { product: Product }) {
  return (
    <ul className="space-y-1">
      {product.sizes.map((size) => {
        const price = sizePrice(product, size)
        return (
          <li key={size.label}>
            {size.label} — {price === null ? 'price on enquiry' : formatRupees(price)}
          </li>
        )
      })}
    </ul>
  )
}

interface ProductModalProps {
  product: Product | null
  onClose: () => void
}

export function ProductModal({ product, onClose }: ProductModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Native <dialog>: focus is trapped while open, Escape closes, focus returns to the trigger.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (product && !dialog.open) dialog.showModal()
    if (!product && dialog.open) dialog.close()

    document.documentElement.style.overflow = product ? 'hidden' : ''
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [product])

  // Only details that have actually been filled in are shown.
  const details: [string, ReactNode][] = product
    ? ([
        pricedBySize(product)
          ? ['Sizes & prices', <SizePrices product={product} />]
          : ['Price', <ProductPrice product={product} className="text-sm" />],
        ['Material', product.material],
        ['Craftsmanship', product.craftsmanship],
        pricedBySize(product)
          ? ['Sizes', null]
          : ['Sizes', product.sizes.length ? product.sizes.map((size) => size.label).join(' | ') : product.dimensions],
        ['Available in', product.variants.join(', ')],
        [
          'Customization',
          product.customizationAvailable
            ? 'Available — tell us about your size, colour or design requirements.'
            : 'Not currently available for this product.',
        ],
      ] as [string, ReactNode][]).filter(([, value]) => Boolean(value))
    : []

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="product-modal-title"
      // Only this dialog: closing the full-screen picture view inside it must not close the product.
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto max-h-[92svh] w-[min(100%-1.5rem,66rem)] max-w-none overflow-y-auto bg-ivory text-ink backdrop:bg-ink/60"
    >
      {product && (
        <div className="relative grid md:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product details"
            className="absolute top-3 right-3 z-10 grid h-11 w-11 place-items-center bg-ivory transition-colors hover:bg-cream"
          >
            <CloseIcon />
          </button>

          {/* Keyed by product, so another product starts at its first picture */}
          <ProductImages key={product.id} images={product.images} productName={product.name} />

          <div className="p-6 md:p-10 lg:p-12">
            <p className="eyebrow">{product.category}</p>
            <h2 id="product-modal-title" className="mt-3 text-4xl md:text-5xl">
              {product.name}
            </h2>
            <p className="mt-5 whitespace-pre-line text-muted">{product.description}</p>

            <dl className="mt-8 divide-y divide-line border-y border-line text-sm">
              {details.map(([term, detail]) => (
                <div key={term} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
                  <dt className="eyebrow pt-0.5">{term}</dt>
                  <dd className="whitespace-pre-line">{detail}</dd>
                </div>
              ))}
            </dl>

            <WhatsAppButton
              message={whatsappMessages.product(product.name)}
              className="mt-8 w-full sm:w-auto"
            >
              Enquire on WhatsApp
            </WhatsAppButton>
            <p className="mt-4 text-sm text-muted">
              Orders are taken personally over WhatsApp — we will reply with availability and
              pricing.
            </p>
          </div>
        </div>
      )}
    </dialog>
  )
}

const ProductModalContext = createContext<(product: Product) => void>(() => {})

/** Returns a function that opens the product modal for a given product. */
export const useProductModal = () => useContext(ProductModalContext)

/** Mount once near the app root so any page can open the same modal. */
export function ProductModalProvider({ children }: { children: ReactNode }) {
  const [product, setProduct] = useState<Product | null>(null)
  const close = useCallback(() => setProduct(null), [])
  const open = useMemo(() => (p: Product) => setProduct(p), [])

  return (
    <ProductModalContext.Provider value={open}>
      {children}
      <ProductModal product={product} onClose={close} />
    </ProductModalContext.Provider>
  )
}
