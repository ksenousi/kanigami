import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://ksenousi.github.io/kanigami/ — the base path has to
// match the repo name or every asset URL 404s on Pages.
export default defineConfig({
  base: '/kanigami/',
  plugins: [react()]
})
