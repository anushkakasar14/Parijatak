import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development, forward API calls to the backend (npm run server).
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
