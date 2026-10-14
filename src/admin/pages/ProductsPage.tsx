import { EmptyState, ErrorNotice, LoadingBlock, PageHeader, Pill } from '../components'
import { useApi } from '../hooks'
import type { AdminProduct } from '../types'

/** Read-only for now: shows what the database holds. Editing tools are the next phase. */
export function ProductsPage() {
  const { data, error, reload } = useApi<AdminProduct[]>('/products')

  return (
    <>
      <PageHeader
        title="Products"
        description="The products currently published in the database."
      />

      <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
        This list is view-only for now. Adding, editing, publishing and archiving products — and
        showing these records on the public website — are part of the next phase.
      </p>

      {error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock label="Loading products…" />
      ) : data.length === 0 ? (
        <EmptyState title="No published products" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((product) => (
            <li key={product.id} className="overflow-hidden rounded-lg border border-stone-200 bg-white">
              <img
                src={product.imageUrl}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full bg-stone-100 object-cover"
              />
              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-sans text-base font-medium text-stone-900">{product.name}</h2>
                  <Pill tone="ok">Published</Pill>
                </div>
                <p className="mt-0.5 text-sm text-stone-500">{product.category}</p>
                <p className="mt-2 line-clamp-3 text-sm text-stone-600">{product.description}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
