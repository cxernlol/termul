import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import reactSsg from 'vite-plugin-react-ssg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Puts the stable version from the release snapshot into the JSON-LD
 * `softwareVersion` (placeholder `%TROUPE_STABLE_VERSION%` in index.html),
 * so the structured data never goes stale.
 */
function releaseVersionPlugin(): Plugin {
  return {
    name: 'troupe-release-version',
    transformIndexHtml(html) {
      const snapshotFile = path.resolve(__dirname, 'src/data/releases.snapshot.json')
      const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8')) as { stable?: { version?: string } | null }
      const version = snapshot.stable?.version ?? '0.0.0'
      return html.replaceAll('%TROUPE_STABLE_VERSION%', version)
    },
  }
}

/**
 * Preloads the Latin Inter file. Without it the browser finds the font only
 * after it has parsed the CSS, and the text swaps from the fallback later.
 * The file name has a content hash, so it is read from the client bundle.
 */
function fontPreloadPlugin(): Plugin {
  return {
    name: 'troupe-font-preload',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const font = Object.values(ctx.bundle ?? {}).find(
          (file) => file.type === 'asset' && /inter-latin-opsz-normal-[\w-]+\.woff2$/.test(file.fileName),
        )
        if (!font) return html
        return {
          html,
          tags: [
            {
              tag: 'link',
              attrs: { rel: 'preload', href: `/${font.fileName}`, as: 'font', type: 'font/woff2', crossorigin: '' },
              injectTo: 'head',
            },
          ],
        }
      },
    },
  }
}

/**
 * Local dev and preview have no Pages Functions. Read the public testimonial
 * list and avatars from production so the section looks real locally.
 * GET only: a form POST in dev must never reach the live database.
 */
const liveTestimonialsProxy = {
  '/api/testimonials': {
    target: 'https://usetroupe.dev',
    changeOrigin: true,
    bypass: (req: { method?: string; url?: string }) => (req.method === 'GET' ? undefined : req.url),
  },
}

// https://vite.dev/config/
export default defineConfig({
  server: { proxy: liveTestimonialsProxy },
  preview: { proxy: liveTestimonialsProxy },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    reactSsg(),
    releaseVersionPlugin(),
    fontPreloadPlugin(),
  ],
})