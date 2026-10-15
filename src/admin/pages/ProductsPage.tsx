import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
import {
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorNotice,
  LoadingBlock,
  Notice,
  PageHeader,
  Pill,
  PublicationBadge,
  formatDate,
} from '../components'
import { Checkbox, MediaLibraryList, SelectInput, TextArea, TextInput, useFormState } from '../forms'
import { useApi, useDebounced } from '../hooks'
import { MediaImage, MediaLibraryDialog, MediaPicker, UploadButton } from '../media'
import { statusOptions } from '../types'
import type { AdminProduct, Category, MediaAsset, Paginated, ProductImage, PublicationStatus } from '../types'
import { cardClass, fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../ui'

const PAGE_SIZE = 20

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

const sortOptions = [
  { value: 'order', label: 'Website order' },
  { value: 'updated', label: 'Recently changed' },
  { value: 'created', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
]

// ── Editor ────────────────────────────────────────────────────────────────────────

interface ProductForm {
  name: string
  slug: string
  categoryId: string
  status: PublicationStatus
  shortDescription: string
  description: string
  material: string
  craftsmanship: string
  dimensions: string
  variants: string
  price: string
  offerPrice: string
  imageUrl: string
  imageAlt: string
  gallery: ProductImage[]
  customizationAvailable: boolean
  isFeatured: boolean
  displayOrder: string
}

const toForm = (product: AdminProduct | null, categories: Category[]): ProductForm => ({
  name: product?.name ?? '',
  slug: product?.slug ?? '',
  categoryId: product?.categoryId ?? categories[0]?.id ?? '',
  status: product?.status ?? 'draft',
  shortDescription: product?.shortDescription ?? '',
  description: product?.description ?? '',
  material: product?.material ?? '',
  craftsmanship: product?.craftsmanship ?? '',
  dimensions: product?.dimensions ?? '',
  variants: product?.variants.join('\n') ?? '',
  price: product?.price?.toString() ?? '',
  offerPrice: product?.offerPrice?.toString() ?? '',
  imageUrl: product?.imageUrl ?? '',
  imageAlt: product?.imageAlt ?? '',
  gallery: product?.images.slice(1) ?? [],
  customizationAvailable: product?.customizationAvailable ?? true,
  isFeatured: product?.isFeatured ?? false,
  displayOrder: String(product?.displayOrder ?? 0),
})

/** Extra pictures shown after the main one. */
function GalleryEditor({ images, onChange }: { images: ProductImage[]; onChange: (images: ProductImage[]) => void }) {
  const [choosing, setChoosing] = useState(false)
  const add = (asset: MediaAsset) => {
    onChange([...images, { url: asset.url, alt: asset.altText }])
    setChoosing(false)
  }
  const update = (index: number, patch: Partial<ProductImage>) =>
    onChange(images.map((image, i) => (i === index ? { ...image, ...patch } : image)))
  const move = (index: number, direction: -1 | 1) => {
    const next = [...images]
    const [image] = next.splice(index, 1)
    next.splice(index + direction, 0, image)
    onChange(next)
  }

  return (
    <fieldset>
      <legend className={labelClass}>More pictures (optional)</legend>
      <p className="mt-1 text-sm text-stone-500">Shown after the main picture. Up to 12.</p>
      {images.length > 0 && (
        <ol className="mt-3 space-y-3">
          {images.map((image, i) => (
            <li key={`${image.url}-${i}`} className="flex flex-wrap items-center gap-3 rounded-md border border-stone-200 p-3">
              <MediaImage src={image.url} className="h-16 w-20 shrink-0 rounded bg-stone-100 object-cover" />
              <div className="min-w-48 flex-1">
                <label htmlFor={`gallery-alt-${i}`} className="text-xs font-medium text-stone-600">
                  Description of picture {i + 2}
                </label>
                <input
                  id={`gallery-alt-${i}`}
                  value={image.alt}
                  maxLength={200}
                  onChange={(e) => update(i, { alt: e.target.value })}
                  className={`${fieldClass} mt-1 py-2 text-sm`}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move picture ${i + 2} earlier`} className={secondaryButtonClass}>
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === images.length - 1}
                  aria-label={`Move picture ${i + 2} later`}
                  className={secondaryButtonClass}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                  aria-label={`Remove picture ${i + 2}`}
                  className={`${secondaryButtonClass} text-red-700`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {images.length < 12 && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <UploadButton onUploaded={add} multiple label="Upload pictures" />
          <button type="button" onClick={() => setChoosing(true)} className={secondaryButtonClass}>
            Choose from library
          </button>
        </div>
      )}
      <MediaLibraryDialog open={choosing} onClose={() => setChoosing(false)} onSelect={add} />
    </fieldset>
  )
}

function ProductEditor({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null
  categories: Category[]
  onClose: () => void
  onSaved: (product: AdminProduct) => void
}) {
  const { values, set, setValues } = useFormState(toForm(product, categories))
  // For a new product the web address follows the name until it is edited by hand.
  const [slugTouched, setSlugTouched] = useState(product !== null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onName = (name: string) =>
    setValues((current) => ({ ...current, name, slug: slugTouched ? current.slug : slugify(name) }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setFailure(null)
    const number = (v: string) => (v.trim() === '' ? null : Number(v))
    const body = {
      name: values.name,
      ...(values.slug.trim() ? { slug: values.slug.trim() } : {}),
      categoryId: values.categoryId,
      status: values.status,
      shortDescription: values.shortDescription,
      description: values.description,
      material: values.material,
      craftsmanship: values.craftsmanship,
      dimensions: values.dimensions,
      variants: values.variants
        .split(/\n|,/)
        .map((v) => v.trim())
        .filter(Boolean),
      price: number(values.price),
      offerPrice: number(values.offerPrice),
      imageUrl: values.imageUrl,
      imageAlt: values.imageAlt,
      additionalImages: values.gallery,
      customizationAvailable: values.customizationAvailable,
      isFeatured: values.isFeatured,
      displayOrder: number(values.displayOrder) ?? 0,
    }
    try {
      const saved = await adminFetch<AdminProduct>(product ? `/admin/products/${product.id}` : '/admin/products', {
        method: product ? 'PATCH' : 'POST',
        body,
      })
      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setFailure(err instanceof ApiError ? err.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={product ? `Edit “${product.name}”` : 'Add a product'} width="max-w-3xl">
      <MediaLibraryList />
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {failure && <Notice kind="error">{failure}</Notice>}

        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput id="product-name" label="Name" value={values.name} onChange={onName} error={errors.name} required maxLength={120} />
          <TextInput
            id="product-slug"
            label="Web address (slug)"
            value={values.slug}
            onChange={(v) => {
              setSlugTouched(true)
              set('slug')(v)
            }}
            error={errors.slug}
            hint="Lowercase letters, numbers and hyphens. Must be unique."
            maxLength={64}
          />
          <SelectInput
            id="product-category"
            label="Category"
            value={values.categoryId}
            onChange={set('categoryId')}
            error={errors.categoryId}
            options={[
              ...(values.categoryId ? [] : [{ value: '', label: 'Choose a category' }]),
              ...categories.map((c) => ({ value: c.id, label: c.isActive ? c.name : `${c.name} (hidden category)` })),
            ]}
          />
          <SelectInput
            id="product-status"
            label="Status"
            value={values.status}
            onChange={(v) => set('status')(v as PublicationStatus)}
            options={statusOptions}
            error={errors.status}
          />
        </div>

        <MediaPicker
          id="product-image"
          label="Main picture"
          value={values.imageUrl}
          onChange={set('imageUrl')}
          onAltSuggested={(alt) => !values.imageAlt && set('imageAlt')(alt)}
          error={errors.imageUrl}
          required
        />
        <TextInput
          id="product-image-alt"
          label="Description of the main picture (for people who cannot see it)"
          value={values.imageAlt}
          onChange={set('imageAlt')}
          error={errors.imageAlt}
          maxLength={200}
        />

        <GalleryEditor images={values.gallery} onChange={set('gallery')} />
        {errors.additionalImages && <p className="text-sm text-red-700">{errors.additionalImages}</p>}

        <TextInput
          id="product-short"
          label="Short description (optional)"
          value={values.shortDescription}
          onChange={set('shortDescription')}
          error={errors.shortDescription}
          hint="One line, shown under the name."
          maxLength={200}
        />
        <TextArea
          id="product-description"
          label="Description"
          value={values.description}
          onChange={set('description')}
          error={errors.description}
          rows={5}
          maxLength={5000}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextArea id="product-material" label="Material (optional)" value={values.material} onChange={set('material')} error={errors.material} rows={3} maxLength={1000} />
          <TextArea
            id="product-craft"
            label="Craftsmanship (optional)"
            value={values.craftsmanship}
            onChange={set('craftsmanship')}
            error={errors.craftsmanship}
            rows={3}
            maxLength={1000}
          />
          <TextInput id="product-dimensions" label="Size (optional)" value={values.dimensions} onChange={set('dimensions')} error={errors.dimensions} placeholder="130 × 180 cm" maxLength={300} />
          <TextArea
            id="product-variants"
            label="Colours or variants (optional)"
            value={values.variants}
            onChange={set('variants')}
            error={errors.variants}
            hint="One per line."
            rows={3}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <TextInput id="product-price" label="Price in ₹ (optional)" type="number" value={values.price} onChange={set('price')} error={errors.price} />
          <TextInput
            id="product-offer"
            label="Offer price in ₹ (optional)"
            type="number"
            value={values.offerPrice}
            onChange={set('offerPrice')}
            error={errors.offerPrice}
          />
          <TextInput
            id="product-order"
            label="Position on the website"
            type="number"
            value={values.displayOrder}
            onChange={set('displayOrder')}
            error={errors.displayOrder}
            hint="Lower numbers come first."
          />
        </div>

        <div className="space-y-3">
          <Checkbox
            id="product-featured"
            label="Feature this product"
            hint="Featured products are highlighted on the homepage."
            checked={values.isFeatured}
            onChange={set('isFeatured')}
          />
          <Checkbox
            id="product-custom"
            label="Can be customised"
            checked={values.customizationAvailable}
            onChange={set('customizationAvailable')}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ── List ──────────────────────────────────────────────────────────────────────────

export function ProductsPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const categoryId = params.get('category') ?? ''
  const sort = params.get('sort') ?? 'order'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [search, setSearch] = useState(params.get('search') ?? '')
  const query = useDebounced(search.trim())

  const listPath =
    `/admin/products?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}&sort=${sort}` +
    (status ? `&status=${status}` : '') +
    (categoryId ? `&categoryId=${encodeURIComponent(categoryId)}` : '') +
    (query ? `&search=${encodeURIComponent(query)}` : '')
  const { data, error, loading, reload } = useApi<Paginated<AdminProduct>>(listPath, { raw: true })
  const categories = useApi<Category[]>('/admin/categories')

  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AdminProduct | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  /** Changes one filter and goes back to the first page. */
  // Built from the address bar, which is always current, so two quick changes cannot undo each other.
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next, { replace: true })
  }
  const goToPage = (n: number) => {
    const next = new URLSearchParams(window.location.search)
    if (n > 1) next.set('page', String(n))
    else next.delete('page')
    setParams(next)
  }

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setNotice(null)
    try {
      await action()
      setNotice({ kind: 'ok', text: success })
      reload()
      categories.reload()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' })
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (product: AdminProduct, next: PublicationStatus) =>
    run(
      () => adminFetch(`/admin/products/${product.id}`, { method: 'PATCH', body: { status: next } }),
      next === 'published'
        ? `“${product.name}” is now on the website.`
        : next === 'draft'
          ? `“${product.name}” is now a draft and hidden from the website.`
          : `“${product.name}” is archived and hidden from the website.`,
    )

  const duplicate = (product: AdminProduct) =>
    run(
      () => adminFetch(`/admin/products/${product.id}/duplicate`, { method: 'POST' }),
      `A draft copy of “${product.name}” was added.`,
    )

  const products = data?.data ?? []
  const total = data?.pagination.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = Boolean(status || categoryId || query)

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything in the collection. Only published products in a visible category appear on the website."
        action={
          canEdit && (
            <button
              type="button"
              onClick={() => setEditing('new')}
              disabled={!categories.data?.length}
              className={primaryButtonClass}
            >
              Add product
            </button>
          )
        }
      />

      {canEdit && categories.data?.length === 0 && (
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          Add a category first — every product belongs to one.{' '}
          <Link to="/admin/categories" className="font-medium underline">
            Go to categories
          </Link>
        </p>
      )}

      <div className={`${cardClass} mb-5 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <label htmlFor="product-search" className={labelClass}>
            Search
          </label>
          <input
            id="product-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              if (page > 1) goToPage(1)
            }}
            placeholder="Name or description"
            className={fieldClass}
          />
        </div>
        <SelectInput
          id="product-filter-category"
          label="Category"
          value={categoryId}
          onChange={(v) => setFilter('category', v)}
          options={[{ value: '', label: 'All categories' }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
        />
        <SelectInput
          id="product-filter-status"
          label="Status"
          value={status}
          onChange={(v) => setFilter('status', v)}
          options={[
            { value: '', label: 'Any status' },
            { value: 'published', label: 'Published' },
            { value: 'draft', label: 'Draft' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
        <SelectInput id="product-sort" label="Sort by" value={sort} onChange={(v) => setFilter('sort', v === 'order' ? '' : v)} options={sortOptions} />
      </div>

      {notice && (
        <div className="mb-5">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      {error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock label="Loading products…" />
      ) : products.length === 0 ? (
        <EmptyState title={filtered ? 'No products match these filters' : 'No products yet'}>
          {filtered ? 'Try a different search, category or status.' : canEdit ? 'Use “Add product” to create the first one.' : undefined}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-stone-500" aria-live="polite">
            {total} {total === 1 ? 'product' : 'products'}
            {pages > 1 && ` · page ${page} of ${pages}`}
          </p>
          <ul className="space-y-3" aria-busy={loading || busy}>
            {products.map((product) => (
              <li key={product.id} className={`${cardClass} flex flex-wrap items-center gap-4 p-4`}>
                <img src={product.imageUrl} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-md bg-stone-100 object-cover" />
                <div className="min-w-48 flex-1">
                  <p className="font-medium text-stone-900">{product.name}</p>
                  <p className="text-sm text-stone-500">
                    {product.category}
                    {product.price != null && (
                      <>
                        {' · '}
                        {product.offerPrice != null ? (
                          <>
                            <span className="line-through">{money.format(product.price)}</span> {money.format(product.offerPrice)}
                          </>
                        ) : (
                          money.format(product.price)
                        )}
                      </>
                    )}
                    {' · changed '}
                    {formatDate(product.updatedAt)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <PublicationBadge status={product.status} />
                    {product.isFeatured && <Pill>Featured</Pill>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {product.status === 'published' && product.categoryId && (
                    <a
                      href={`/collection?category=${encodeURIComponent(product.categoryId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 text-sm font-medium text-maroon hover:underline"
                    >
                      View on website ↗
                    </a>
                  )}
                  {canEdit && (
                    <>
                      <button type="button" onClick={() => setEditing(product)} className={secondaryButtonClass}>
                        Edit
                      </button>
                      {product.status !== 'published' ? (
                        <button type="button" onClick={() => setStatus(product, 'published')} disabled={busy} className={secondaryButtonClass}>
                          Publish
                        </button>
                      ) : (
                        <button type="button" onClick={() => setStatus(product, 'draft')} disabled={busy} className={secondaryButtonClass}>
                          Unpublish
                        </button>
                      )}
                      {product.status !== 'archived' && (
                        <button type="button" onClick={() => setStatus(product, 'archived')} disabled={busy} className={secondaryButtonClass}>
                          Archive
                        </button>
                      )}
                      <button type="button" onClick={() => duplicate(product)} disabled={busy} className={secondaryButtonClass}>
                        Duplicate
                      </button>
                      <button type="button" onClick={() => setDeleting(product)} className={`${secondaryButtonClass} text-red-700`}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav aria-label="Pages" className="mt-5 flex items-center justify-center gap-3">
              <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1} className={secondaryButtonClass}>
                Previous
              </button>
              <span className="text-sm text-stone-600">
                Page {page} of {pages}
              </span>
              <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= pages} className={secondaryButtonClass}>
                Next
              </button>
            </nav>
          )}
        </>
      )}

      {!canEdit && data && <p className="mt-5 text-sm text-stone-500">Your account can view products but not change them.</p>}

      {editing && categories.data && (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          categories={categories.data}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setNotice({ kind: 'ok', text: editing === 'new' ? `“${saved.name}” was added.` : `“${saved.name}” was saved.` })
            setEditing(null)
            reload()
            categories.reload()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this product?"
        confirmLabel="Delete product"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const product = deleting
          if (!product) return
          await run(() => adminFetch(`/admin/products/${product.id}`, { method: 'DELETE' }), `“${product.name}” was deleted.`)
          setDeleting(null)
        }}
      >
        <p>
          “{deleting?.name}” will be removed permanently. Enquiries that mention it are kept. To hide it but keep
          it for later, use Archive instead.
        </p>
      </ConfirmDialog>
    </>
  )
}
