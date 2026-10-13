import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { whatsappMessages } from '../lib/whatsapp'
import type { Product } from '../types'
import { CloseIcon } from './Icons'
import { WhatsAppButton } from './WhatsAppButton'

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

function Price({ price, offerPrice }: { price: number; offerPrice: number | null }) {
  if (offerPrice !== null && offerPrice < price) {
    return (
      <>
        <span className="font-medium">{rupees.format(offerPrice)}</span>{' '}
        <s className="text-muted">
          <span className="sr-only">was </span>
          {rupees.format(price)}
        </s>
      </>
    )
  }
  return <>{rupees.format(price)}</>
}

interface ProductModalProps {
  product: Product | null
  onClose: () => void
}

export function ProductModal({ product, onClose }: ProductModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [imageIndex, setImageIndex] = useState(0)

  // Native <dialog>: focus is trapped while open, Escape closes, focus returns to the trigger.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (product && !dialog.open) dialog.showModal()
    if (!product && dialog.open) dialog.close()
    setImageIndex(0)

    document.documentElement.style.overflow = product ? 'hidden' : ''
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [product])

  // Only details that have actually been filled in are shown.
  const details: [string, ReactNode][] = product
    ? ([
        ['Price', product.price !== null && <Price price={product.price} offerPrice={product.offerPrice} />],
        ['Material', product.material],
        ['Craftsmanship', product.craftsmanship],
        ['Dimensions', product.dimensions],
        ['Available in', product.variants.join(', ')],
        [
          'Customization',
          product.customizationAvailable
            ? 'Available — tell us about your size, colour or design requirements.'
            : 'Not currently available for this product.',
        ],
      ] as [string, ReactNode][]).filter(([, value]) => Boolean(value))
    : []

  const images = product?.images ?? []
  const image = images[imageIndex] ?? images[0]

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="product-modal-title"
      onClose={onClose}
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

          <div className="flex flex-col bg-cream">
            <div className="aspect-[4/3] md:aspect-auto md:min-h-[36rem] md:flex-1">
              {image && (
                <img
                  src={image.url}
                  alt={image.alt || product.name}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            {images.length > 1 && (
              <ul className="flex gap-2 overflow-x-auto p-2" aria-label="More images">
                {images.map((thumbnail, i) => (
                  <li key={thumbnail.url}>
                    <button
                      type="button"
                      onClick={() => setImageIndex(i)}
                      aria-label={`Show image ${i + 1} of ${images.length}`}
                      aria-current={i === imageIndex ? 'true' : undefined}
                      className={`block h-16 w-16 overflow-hidden border-2 ${
                        i === imageIndex ? 'border-teal' : 'border-transparent'
                      }`}
                    >
                      <img src={thumbnail.url} alt="" className="h-full w-full object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
