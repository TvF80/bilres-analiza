import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// On GitHub Pages the app lives at /<repo-name>/
// Locally and on Vercel it lives at /
const base = process.env.GITHUB_PAGES === 'true'
  ? `/${process.env.GITHUB_REPO_NAME ?? 'bilres-analiza'}/`
  : '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 700,
  },
})
