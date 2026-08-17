import fs from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const STREAMS_ENDPOINT = '/api/streams'

/** Event stream files, as paths relative to `public/` (e.g. `streams/x.csv`). */
function listStreamFiles(root: string): string[] {
  const publicDir = path.join(root, 'public')
  const streamsDir = path.join(publicDir, 'streams')

  if (!fs.existsSync(streamsDir)) {
    return []
  }

  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        return walk(entryPath)
      }

      if (!entry.name.toLowerCase().endsWith('.csv')) {
        return []
      }

      return [path.relative(publicDir, entryPath).split(path.sep).join('/')]
    })
  }

  return walk(streamsDir).sort((a, b) => a.localeCompare(b))
}

/** Serves the contents of `public/streams` so the UI can offer them as a list. */
function streamsIndex(): Plugin {
  const respondWith = (root: string) => (_: unknown, response: ServerResponse) => {
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify(listStreamFiles(root)))
  }

  return {
    name: 'tsoat:streams-index',
    configureServer(server) {
      server.middlewares.use(STREAMS_ENDPOINT, respondWith(server.config.root))
    },
    configurePreviewServer(server) {
      server.middlewares.use(STREAMS_ENDPOINT, respondWith(server.config.root))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), streamsIndex()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // canvas-record's H.264 fallback is a Node wasm build (`require("path")`).
      // Export uses WebCodecs; this stub keeps Vite from bundling that file.
      'h264-mp4-encoder': path.resolve(
        import.meta.dirname,
        './src/lib/h264Mp4EncoderStub.ts'
      ),
    },
  },
})
