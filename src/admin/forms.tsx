import { useState } from 'react'
import type { ReactNode } from 'react'
import { fieldClass, labelClass } from './ui'

/**
 * Small form building blocks for the content screens. Each field shows its label,
 * an optional hint, and the server's message for that field when a save is rejected.
 */

interface FieldProps {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  children: ReactNode
}

export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-sm text-stone-500">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

const describedBy = (id: string, error?: string, hint?: ReactNode) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined

interface TextProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  hint?: ReactNode
  error?: string
  required?: boolean
  disabled?: boolean
  type?: 'text' | 'email' | 'tel' | 'date' | 'number'
  placeholder?: string
  list?: string
  maxLength?: number
}

export function TextInput({ id, label, value, onChange, hint, error, type = 'text', ...rest }: TextProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={fieldClass}
        {...rest}
      />
    </Field>
  )
}

export function TextArea({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  rows = 4,
  disabled,
  maxLength,
}: Omit<TextProps, 'type' | 'list' | 'placeholder' | 'required'> & { rows?: number }) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={fieldClass}
      />
    </Field>
  )
}

export function SelectInput({
  id,
  label,
  value,
  onChange,
  options,
  hint,
  error,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  hint?: ReactNode
  error?: string
  disabled?: boolean
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={fieldClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function Checkbox({
  id,
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-1 h-5 w-5 accent-maroon"
      />
      <label htmlFor={id} className="text-sm text-stone-700">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-stone-500">{hint}</span>}
      </label>
    </div>
  )
}

/** Simple form state: values, a setter per field, and whether anything changed. */
export function useFormState<T extends object>(initial: T) {
  const [values, setValues] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const set =
    <K extends keyof T>(key: K) =>
    (value: T[K]) =>
      setValues((current) => ({ ...current, [key]: value }))
  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  /** Call after a successful save, so the form counts as unchanged again. */
  const markSaved = (next: T = values) => {
    setValues(next)
    setSaved(next)
  }
  return { values, set, setValues, dirty, markSaved }
}

/** Files that exist in the website's media folder, offered as suggestions in path fields. */
export const mediaLibrary = [
  '/media/story-source.mp4',
  '/media/story-source-poster.jpg',
  '/media/story-yarn.mp4',
  '/media/story-yarn-poster.jpg',
  '/media/story-loom.jpg',
  '/media/story-sample.jpg',
  '/media/story-throw.jpg',
  '/media/shoot-bench.jpg',
  '/media/shoot-checks.jpg',
  '/media/shoot-ground.jpg',
  '/media/shoot-motif.jpg',
  '/media/craft-swatch.jpg',
  '/media/about-founder.jpg',
  '/media/studio-film.mp4',
  '/media/studio-film-poster.jpg',
  '/media/studio-2.jpg',
  '/media/studio-3.jpg',
]

/** A <datalist> of the media library; give a path field `list={MEDIA_LIST_ID}`. */
export const MEDIA_LIST_ID = 'admin-media-library'
export function MediaLibraryList() {
  return (
    <datalist id={MEDIA_LIST_ID}>
      {mediaLibrary.map((path) => (
        <option key={path} value={path} />
      ))}
    </datalist>
  )
}

export const mediaHint =
  'A file already on the website, such as /media/story-loom.jpg (start typing to see them), or a full https:// address. Uploading new files is not available yet.'

/** Shows a small preview of an image or video path, or says plainly that it cannot be found. */
export function MediaPreview({ url, video = false }: { url: string; video?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!url) return null
  if (failed === url) {
    return <p className="text-sm text-red-700">No file was found at this address.</p>
  }
  const className = 'h-28 w-44 rounded-md border border-stone-200 bg-stone-100 object-cover'
  return video ? (
    <video src={url} muted playsInline preload="metadata" className={className} onError={() => setFailed(url)} />
  ) : (
    <img src={url} alt="" className={className} onError={() => setFailed(url)} />
  )
}
