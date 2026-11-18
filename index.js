/**
 * Host half of the Paper Lens plugin.
 *
 * It parses the paper, calls the configured DeepSeek route through ctx.llm,
 * caches translations, and serves the browser panel over DSH's authenticated
 * /api Fetch registry. The browser bundle is client.js.
 */

export { apply } from './src/host/app.js'

export const inject = ['llm', 'connection', 'webServer', 'directoryPicker']
