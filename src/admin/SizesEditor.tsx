import { fieldClass, labelClass, secondaryButtonClass } from './ui'

/** One row of the editor; prices are kept as typed until the product is saved. */
export interface DraftSize {
  key: string
  label: string
  price: string
}

export const MAX_SIZES = 20

let nextKey = 0
export const draftSize = (label = '', price = ''): DraftSize => ({ key: `size-${nextKey++}`, label, price })

/**
 * Problems the server would refuse, found before saving: a blank or repeated size, or a
 * price that is not a positive number. Keyed like the server's own messages ("sizes.0.label").
 */
export function checkSizes(sizes: DraftSize[]): Record<string, string> {
  const errors: Record<string, string> = {}
  const seen = new Set<string>()
  sizes.forEach((size, index) => {
    const label = size.label.trim().toLowerCase()
    if (!label) errors[`sizes.${index}.label`] = 'Enter the size, or remove this row'
    else if (seen.has(label)) errors[`sizes.${index}.label`] = 'This size is already listed'
    seen.add(label)

    const price = size.price.trim()
    if (price && !(Number.isFinite(Number(price)) && Number(price) >= 0)) {
      errors[`sizes.${index}.price`] = 'Enter a price of 0 or more, or leave it empty'
    }
  })
  return errors
}

/** The sizes as the API expects them. */
export const sizesForSaving = (sizes: DraftSize[]) =>
  sizes.map((size) => ({
    label: size.label.trim(),
    price: size.price.trim() === '' ? null : Number(size.price),
  }))

export function SizesEditor({
  sizes,
  onChange,
  errors,
  disabled,
}: {
  sizes: DraftSize[]
  onChange: (sizes: DraftSize[]) => void
  errors: Record<string, string>
  disabled?: boolean
}) {
  const update = (key: string, change: Partial<DraftSize>) =>
    onChange(sizes.map((size) => (size.key === key ? { ...size, ...change } : size)))
  const remove = (key: string) => onChange(sizes.filter((size) => size.key !== key))
  const add = () => onChange([...sizes, draftSize()])

  return (
    <fieldset className="space-y-3">
      <legend className={labelClass}>Sizes (optional)</legend>
      <p className="text-sm text-stone-500">
        The sizes this product is made in, shown on the website in this order. Give a size its own price
        only when it costs something different from the price above.
      </p>

      {sizes.length > 0 && (
        <ul className="space-y-3">
          {sizes.map((size, index) => {
            const labelError = errors[`sizes.${index}.label`]
            const priceError = errors[`sizes.${index}.price`]
            const n = index + 1
            return (
              <li key={size.key} className="rounded-md border border-stone-200 p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-start">
                  <div>
                    <label htmlFor={`size-label-${size.key}`} className="sr-only">
                      Size {n}
                    </label>
                    <input
                      id={`size-label-${size.key}`}
                      value={size.label}
                      onChange={(e) => update(size.key, { label: e.target.value })}
                      placeholder="e.g. Small — 2 ft × 4 ft"
                      maxLength={80}
                      disabled={disabled}
                      aria-invalid={labelError ? true : undefined}
                      aria-describedby={labelError ? `size-label-${size.key}-error` : undefined}
                      className={fieldClass}
                    />
                    {labelError && (
                      <p id={`size-label-${size.key}-error`} className="mt-1.5 text-sm text-red-700">
                        {labelError}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`size-price-${size.key}`} className="sr-only">
                      Price for size {n} in ₹ (optional)
                    </label>
                    <input
                      id={`size-price-${size.key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={size.price}
                      onChange={(e) => update(size.key, { price: e.target.value })}
                      placeholder="₹ own price"
                      disabled={disabled}
                      aria-invalid={priceError ? true : undefined}
                      aria-describedby={priceError ? `size-price-${size.key}-error` : undefined}
                      className={fieldClass}
                    />
                    {priceError && (
                      <p id={`size-price-${size.key}-error`} className="mt-1.5 text-sm text-red-700">
                        {priceError}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(size.key)}
                    disabled={disabled}
                    className={`${secondaryButtonClass} sm:mt-1`}
                  >
                    Remove<span className="sr-only"> size {n}</span>
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {errors.sizes && <p className="text-sm text-red-700">{errors.sizes}</p>}

      <button
        type="button"
        onClick={add}
        disabled={disabled || sizes.length >= MAX_SIZES}
        className={secondaryButtonClass}
      >
        Add a size
      </button>
    </fieldset>
  )
}
