import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run dev:fake` serves the real app against a fake WaniKani — no
// token, no account; see fake/wanikani.js. The fake is inlined into the
// page ahead of the app, and only by the dev server in the `fake` mode:
// `apply: 'serve'` keeps it out of every build.
function fakeWaniKani(mode) {
  return {
    name: 'fake-wanikani',
    apply: 'serve',
    transformIndexHtml() {
      if (mode !== 'fake') return
      const script = readFileSync(new URL('./fake/wanikani.js', import.meta.url), 'utf8')
      return [{ tag: 'script', children: script, injectTo: 'head-prepend' }]
    }
  }
}

// Served from https://ksenousi.github.io/kanigami/ — the base path has to
// match the repo name or every asset URL 404s on Pages.
export default defineConfig(({ mode }) => ({
  base: '/kanigami/',
  plugins: [react(), fakeWaniKani(mode)]
}))
