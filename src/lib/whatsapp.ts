import { WHATSAPP_NUMBER } from '../config/site'

/** Builds a wa.me link, optionally with a pre-filled message. */
export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export const whatsappMessages = {
  general: 'Hello Parijatak, I would like to know more about your home textiles.',
  customization:
    'Hello Parijatak, I would like to enquire about personalized textiles for my space.',
  product: (productName: string) =>
    `Hello Parijatak, I am interested in the ${productName} collection. I would like to know more about availability, pricing and customization options.`,
}
