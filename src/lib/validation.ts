export const inquiryTypes = [
  'Product Enquiry',
  'Customization',
  'Personalized Styling',
  'Institutional / Hospitality',
  'Collaboration',
  'General Enquiry',
] as const

export interface EnquiryData {
  fullName: string
  email: string
  phone: string
  inquiryType: string
  message: string
}

export type EnquiryErrors = Partial<Record<keyof EnquiryData, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Accepts 10-digit Indian mobile numbers, with optional +91 / 91 / 0 prefix and spaces or dashes. */
export function isValidIndianPhone(value: string): boolean {
  const digits = value.replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(digits)
}

export function validateEnquiry(data: EnquiryData): EnquiryErrors {
  const errors: EnquiryErrors = {}

  if (!data.fullName.trim()) errors.fullName = 'Please enter your full name.'

  if (!data.email.trim()) errors.email = 'Please enter your email address.'
  else if (!EMAIL_RE.test(data.email.trim()))
    errors.email = 'Please enter a valid email address, e.g. name@example.com.'

  if (!data.phone.trim()) errors.phone = 'Please enter your contact number.'
  else if (!isValidIndianPhone(data.phone))
    errors.phone = 'Please enter a valid 10-digit Indian mobile number.'

  if (!data.inquiryType) errors.inquiryType = 'Please choose what your enquiry is about.'

  if (!data.message.trim()) errors.message = 'Please write a short message.'

  return errors
}
