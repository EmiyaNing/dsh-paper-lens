import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

await build({
  entryPoints: [join(root, 'src/client/index.jsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110', 'safari16'],
  jsx: 'transform',
  loader: { '.css': 'text' },
  external: ['react'],
  outfile: join(root, 'client.js'),
  minify: true,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
})

const worker = join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
await mkdir(join(root, 'assets'), { recursive: true })
await copyFile(worker, join(root, 'assets/pdf.worker.mjs'))
console.log('worker copied')
