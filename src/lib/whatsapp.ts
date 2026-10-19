/** Builds a wa.me link, optionally with a pre-filled message. `number` is digits only. */
export function buildWhatsappUrl(number: string, message?: string): string {
  const base = `https://wa.me/${number}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

/** 918080657140 → "+91 80806 57140". Other countries are shown as "+<digits>". */
export function formatWhatsappNumber(number: string): string {
  const indian = /^91(\d{5})(\d{5})$/.exec(number)
  return indian ? `+91 ${indian[1]} ${indian[2]}` : `+${number}`
}

export const whatsappMessages = {
  general: 'Hello Parijatak, I would like to know more about your home textiles.',
  customization:
    'Hello Parijatak, I would like to enquire about personalized textiles for my space.',
  product: (productName: string) =>
    `Hello Parijatak, I am interested in the ${productName} collection. I would like to know more about availability, pricing and customization options.`,
}
