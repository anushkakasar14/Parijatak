import type { Product } from '../types'

/**
 * Mock product data for Module 1.
 * The shape mirrors what the backend will return later — swap this array for an API call.
 *
 * Values starting with "[Editable placeholder]" are awaiting confirmed details from Parijatak.
 */
export const products: Product[] = [
  {
    id: 'bed-linens',
    name: 'Bed Linens',
    category: 'Bedroom',
    shortDescription: 'Handcrafted bedding that brings quiet warmth to the room you rest in.',
    description:
      'Bed linens rooted in Indian traditional craftsmanship and designed for the way contemporary homes are lived in — comfortable, considered and made to be used every day.',
    material: '[Editable placeholder] Fabric and composition to be confirmed.',
    craftsmanship: '[Editable placeholder] Craft technique and making process to be confirmed.',
    customizationAvailable: true,
    image: '/media/shoot-bench.jpg',
    imageAlt: 'A black and natural checked Parijatak textile draped over a wooden garden bench',
  },
  {
    id: 'cushion-covers',
    name: 'Cushion Covers',
    category: 'Living',
    shortDescription: 'Artful accents that bring colour, texture and character to a seat or a corner.',
    description:
      'Cushion covers that carry the expressiveness of Indian craft into living spaces — an easy way to layer warmth and personality into a home.',
    material: '[Editable placeholder] Fabric and composition to be confirmed.',
    craftsmanship: '[Editable placeholder] Craft technique and making process to be confirmed.',
    customizationAvailable: true,
    image: '/media/shoot-ground.jpg',
    imageAlt:
      'A fringed Parijatak textile with blue motifs in yellow and green diamonds, laid on the ground',
  },
  {
    id: 'throws',
    name: 'Throws',
    category: 'Living & Bedroom',
    shortDescription: 'A handcrafted layer of comfort for the sofa, the bed or a favourite chair.',
    description:
      'Throws made to be reached for — handcrafted textiles that add comfort and a sense of craft wherever they are draped.',
    material: '[Editable placeholder] Fabric and composition to be confirmed.',
    craftsmanship: '[Editable placeholder] Craft technique and making process to be confirmed.',
    customizationAvailable: true,
    image: '/media/shoot-motif.jpg',
    imageAlt:
      'A fringed natural-toned Parijatak throw with a column of blue motifs in diamonds, hanging from a tree',
  },
]
