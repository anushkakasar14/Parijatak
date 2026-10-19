import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { SITE_URL, notFoundSeo, pageSeo } from './src/config/seo'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Fills the page-specific markers in index.html. */
function fillSeo(html: string, page: { title: string; description: string; url: string | null }) {
  const indexing = page.url
    ? `<link rel="canonical" href="${page.url}" />`
    : '<meta name="robots" content="noindex" />'
  return html
    .replaceAll('__SEO_TITLE__', () => escapeHtml(page.title))
    .replaceAll('__SEO_DESCRIPTION__', () => escapeHtml(page.description))
    .replaceAll('__SEO_URL__', () => page.url ?? `${SITE_URL}/`)
    .replace('<!--__SEO_INDEXING__-->', () => indexing)
}

/**
 * Gives every public page its own HTML file (about.html, collection.html…) with its title,
 * description, official address and preview tags, plus a not-found page and the sitemap.
 * The React app is the same in each file; only the head differs.
 */
function seoPages(): Plugin {
  let outDir = 'dist'
  let template = ''
  return {
    name: 'parijatak-seo-pages',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        template = html
        const home = pageSeo.home
        return fillSeo(html, { ...home, url: SITE_URL + home.path })
      },
    },
    closeBundle() {
      if (!template) return
      for (const page of Object.values(pageSeo)) {
        if (page.path === '/') continue // index.html is written by Vite itself
        writeFileSync(resolve(outDir, page.file), fillSeo(template, { ...page, url: SITE_URL + page.path }))
      }
      writeFileSync(resolve(outDir, '404.html'), fillSeo(template, { ...notFoundSeo, url: null }))

      const urls = Object.values(pageSeo)
        .map((page) => `  <url><loc>${SITE_URL}${page.path}</loc></url>`)
        .join('\n')
      writeFileSync(
        resolve(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), seoPages()],
  server: {
    // In development, forward API calls to the backend (npm run server).
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
