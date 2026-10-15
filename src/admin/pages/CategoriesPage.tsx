import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
import { ConfirmDialog, Dialog, EmptyState, ErrorNotice, LoadingBlock, Notice, PageHeader, Pill } from '../components'
import { Checkbox, TextArea, TextInput, useFormState } from '../forms'
import { useApi } from '../hooks'
import type { Category } from '../types'
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../ui'

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

function CategoryEditor({
  category,
  nextOrder,
  onClose,
  onSaved,
}: {
  category: Category | null
  nextOrder: number
  onClose: () => void
  onSaved: (category: Category) => void
}) {
  const { values, set, setValues } = useFormState({
    name: category?.name ?? '',
    slug: category?.id ?? '',
    description: category?.description ?? '',
    isActive: category?.isActive ?? true,
    displayOrder: String(category?.displayOrder ?? nextOrder),
  })
  const [slugTouched, setSlugTouched] = useState(category !== null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setFailure(null)
    try {
      const saved = await adminFetch<Category>(category ? `/admin/categories/${category.id}` : '/admin/categories', {
        method: category ? 'PATCH' : 'POST',
        body: {
          name: values.name,
          ...(values.slug.trim() ? { slug: values.slug.trim() } : {}),
          description: values.description,
          isActive: values.isActive,
          displayOrder: Number(values.displayOrder) || 0,
        },
      })
      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setFailure(err instanceof ApiError ? err.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const slugChanged = category !== null && values.slug.trim() !== category.id

  return (
    <Dialog open onClose={onClose} title={category ? `Edit “${category.name}”` : 'Add a category'}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {failure && <Notice kind="error">{failure}</Notice>}
        <TextInput
          id="category-name"
          label="Name"
          value={values.name}
          onChange={(name) => setValues((v) => ({ ...v, name, slug: slugTouched ? v.slug : slugify(name) }))}
          error={errors.name}
          required
          maxLength={80}
        />
        <TextInput
          id="category-slug"
          label="Web address (slug)"
          value={values.slug}
          onChange={(v) => {
            setSlugTouched(true)
            set('slug')(v)
          }}
          error={errors.slug ?? errors.id}
          hint={
            slugChanged
              ? 'Changing this breaks links that already use the old address, such as shared collection filters.'
              : 'Used in collection links, for example /collection?category=throws.'
          }
          maxLength={64}
        />
        <TextArea
          id="category-description"
          label="Description (optional)"
          value={values.description}
          onChange={set('description')}
          error={errors.description}
          rows={3}
          maxLength={500}
        />
        <TextInput
          id="category-order"
          label="Position"
          type="number"
          value={values.displayOrder}
          onChange={set('displayOrder')}
          error={errors.displayOrder}
          hint="Lower numbers come first in the collection filters."
        />
        <Checkbox
          id="category-active"
          label="Show this category on the website"
          hint="When unticked, its products are hidden from the website too."
          checked={values.isActive}
          onChange={set('isActive')}
        />
        <div className="flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? 'Saving…' : category ? 'Save changes' : 'Add category'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function CategoriesPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const { data, error, reload } = useApi<Category[]>('/admin/categories')
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const categories = data ?? []

  const remove = async (category: Category) => {
    setBusy(true)
    setNotice(null)
    try {
      await adminFetch(`/admin/categories/${category.id}`, { method: 'DELETE' })
      setNotice({ kind: 'ok', text: `“${category.name}” was deleted.` })
      reload()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' })
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Categories"
        description="The groups products are filed under, shown as filters on the collection page."
        action={
          canEdit && (
            <button type="button" onClick={() => setEditing('new')} className={primaryButtonClass}>
              Add category
            </button>
          )
        }
      />

      {notice && (
        <div className="mb-5">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      {error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock />
      ) : categories.length === 0 ? (
        <EmptyState title="No categories yet">Add one before adding products.</EmptyState>
      ) : (
        <ul className="space-y-3" aria-busy={busy}>
          {categories.map((category) => (
            <li key={category.id} className={`${cardClass} flex flex-wrap items-center gap-4 p-4`}>
              <div className="min-w-48 flex-1">
                <p className="font-medium text-stone-900">{category.name}</p>
                <p className="text-sm text-stone-500">
                  /{category.id} · position {category.displayOrder}
                </p>
                {category.description && <p className="mt-1 text-sm text-stone-600">{category.description}</p>}
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {category.isActive ? <Pill tone="ok">Shown</Pill> : <Pill tone="warn">Hidden</Pill>}
                  <Link to={`/admin/products?category=${encodeURIComponent(category.id)}`} className="text-sm text-maroon hover:underline">
                    {category.productCount} {category.productCount === 1 ? 'product' : 'products'} ({category.publishedCount} published)
                  </Link>
                </div>
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditing(category)} className={secondaryButtonClass}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(category)}
                    disabled={category.productCount > 0}
                    title={category.productCount > 0 ? 'Move or delete its products first' : undefined}
                    className={`${secondaryButtonClass} text-red-700`}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && categories.some((c) => c.productCount > 0) && (
        <p className="mt-4 text-sm text-stone-500">
          A category that still has products cannot be deleted. Move its products to another category first, or hide
          the category instead.
        </p>
      )}

      {editing && (
        <CategoryEditor
          category={editing === 'new' ? null : editing}
          nextOrder={categories.length + 1}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setNotice({ kind: 'ok', text: editing === 'new' ? `“${saved.name}” was added.` : `“${saved.name}” was saved.` })
            setEditing(null)
            reload()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this category?"
        confirmLabel="Delete category"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && void remove(deleting)}
      >
        <p>“{deleting?.name}” has no products and will be removed permanently.</p>
      </ConfirmDialog>
    </>
  )
}
