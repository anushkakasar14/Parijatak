import { useRef, useState } from 'react'
import type { ChangeEvent, FocusEvent, FormEvent } from 'react'
import { inquiryTypes, validateEnquiry } from '../lib/validation'
import type { EnquiryData, EnquiryErrors } from '../lib/validation'
import { submitEnquiry } from '../services/enquiry'

const emptyForm: EnquiryData = {
  fullName: '',
  email: '',
  phone: '',
  inquiryType: '',
  message: '',
}

const fieldOrder = Object.keys(emptyForm) as (keyof EnquiryData)[]

const controlClass =
  'mt-2 block w-full border border-ink/35 bg-white/60 px-4 py-3 text-base text-ink placeholder:text-muted/70 focus:border-teal aria-invalid:border-maroon'

type Status = 'idle' | 'submitting' | 'success' | 'error'

export function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState(emptyForm)
  const [errors, setErrors] = useState<EnquiryErrors>({})
  const [status, setStatus] = useState<Status>('idle')

  const onChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const name = e.target.name as keyof EnquiryData
    const next = { ...values, [name]: e.target.value }
    setValues(next)
    // Once a field has shown an error, re-check it as the user corrects it.
    if (errors[name]) setErrors({ ...errors, [name]: validateEnquiry(next)[name] })
  }

  const onBlur = (e: FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const name = e.target.name as keyof EnquiryData
    setErrors({ ...errors, [name]: validateEnquiry(values)[name] })
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validateEnquiry(values)
    setErrors(found)

    const firstInvalid = fieldOrder.find((name) => found[name])
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus()
      return
    }

    setStatus('submitting')
    try {
      await submitEnquiry(values)
      setValues(emptyForm)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div role="status" className="border border-line bg-cream p-8 md:p-10">
        <p className="font-display text-3xl md:text-4xl">
          Thank you. Your enquiry has been received.
        </p>
        <button type="button" onClick={() => setStatus('idle')} className="text-link mt-6">
          Send another enquiry
        </button>
      </div>
    )
  }

  /** Shared label / error wiring for every field. */
  const field = (name: keyof EnquiryData) => ({
    id: name,
    name,
    value: values[name],
    onChange,
    onBlur,
    required: true,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
    className: controlClass,
  })

  const error = (name: keyof EnquiryData) =>
    errors[name] && (
      <p id={`${name}-error`} className="mt-2 text-sm font-medium text-maroon">
        {errors[name]}
      </p>
    )

  const labelClass = 'eyebrow text-ink'

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6">
      <div>
        <label htmlFor="fullName" className={labelClass}>
          Full Name
        </label>
        <input type="text" autoComplete="name" {...field('fullName')} />
        {error('fullName')}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input type="email" autoComplete="email" {...field('email')} />
          {error('email')}
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            Contact Number
          </label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91"
            {...field('phone')}
          />
          {error('phone')}
        </div>
      </div>

      <div>
        <label htmlFor="inquiryType" className={labelClass}>
          Inquiry About
        </label>
        <select {...field('inquiryType')}>
          <option value="">Select an option</option>
          {inquiryTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        {error('inquiryType')}
      </div>

      <div>
        <label htmlFor="message" className={labelClass}>
          Message
        </label>
        <textarea rows={5} {...field('message')} />
        {error('message')}
      </div>

      {status === 'error' && (
        <p role="alert" className="text-sm font-medium text-maroon">
          Sorry, something went wrong and your enquiry was not sent. Please try again, or message
          us on WhatsApp.
        </p>
      )}

      <button type="submit" disabled={status === 'submitting'} className="btn btn-primary">
        {status === 'submitting' ? 'Sending…' : 'Send Enquiry'}
      </button>
    </form>
  )
}
