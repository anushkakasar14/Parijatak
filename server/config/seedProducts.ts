/**
 * Initial product records, inserted once when the products table is empty.
 * Material and price are left null until Parijatak confirms them.
 */
export const seedProducts = [
  {
    id: 'bed-linens',
    name: 'Bed Linens',
    slug: 'bed-linens',
    category: 'Bedroom',
    description:
      'Bed linens rooted in Indian traditional craftsmanship and designed for the way contemporary homes are lived in — comfortable, considered and made to be used every day.',
    imageUrl: '/media/shoot-bench.jpg',
  },
  {
    id: 'cushion-covers',
    name: 'Cushion Covers',
    slug: 'cushion-covers',
    category: 'Living',
    description:
      'Cushion covers that carry the expressiveness of Indian craft into living spaces — an easy way to layer warmth and personality into a home.',
    imageUrl: '/media/shoot-ground.jpg',
  },
  {
    id: 'throws',
    name: 'Throws',
    slug: 'throws',
    category: 'Living & Bedroom',
    description:
      'Throws made to be reached for — handcrafted textiles that add comfort and a sense of craft wherever they are draped.',
    imageUrl: '/media/shoot-motif.jpg',
  },
]
