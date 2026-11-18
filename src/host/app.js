import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { registerRoutes } from './routes.js'
import { UsageLedger } from './usage-ledger.js'

const DEFAULTS = {
  provider: 'deepseek-official',
  model: 'deepseek-flash',
  targetLanguage: 'zh-CN',
  maxOutputTokens: 4096,
  temperature: 0.3,
  compileTimeoutMs: 180000,
  compileEngine: 'pdflatex',
  compileRuns: 2,
  compile: true,
  pricing: {
    input: { peak: 0.30, offPeak: 0.15 },
    cacheRead: { peak: 0.006, offPeak: 0.003 },
    output: { peak: 1.20, offPeak: 0.60 },
    usdToCny: 7.2,
  },
}

export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...(config ?? {}) }
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const stateDir = join(home, 'paper-translator')
  const legacyDir = join(stateDir, 'cache')
  const ledger = new UsageLedger(join(stateDir, 'usage.json'))

  registerRoutes(ctx, cfg, { legacyDir, ledger })

  // A public worker script is simpler than relying on a Worker request
  // carrying the page cookie; it contains no application data.
  if (typeof ctx.webServer?.register === 'function') {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/paper-translator/pdf.worker.mjs',
      handler: async (request, response) => {
        try {
          const buffer = await readFile(new URL('../../assets/pdf.worker.mjs', import.meta.url))
          response.writeHead(200, {
            'content-type': 'text/javascript; charset=utf-8',
            'content-length': String(buffer.byteLength),
            'cache-control': 'public, max-age=3600',
          })
          response.end(buffer)
        } catch {
          response.writeHead(404)
          response.end('worker not found')
        }
      },
    }), 'paper-translator: pdf worker asset')
  }

}
