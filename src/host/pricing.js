/**
 * DeepSeek deepseek-flash (V4.1 Flash) price estimate.
 *
 * Official list prices, USD per 1M tokens, as of 2026-11-11:
 *   cache-hit input: $0.003 off-peak / $0.006 peak
 *   cache-miss input: $0.15 off-peak / $0.30 peak
 *   output:           $0.60 off-peak / $1.20 peak
 * Peak: 01:00-04:00 and 06:00-10:00 UTC, Mon-Fri.
 * Chinese public holidays are not excluded by this local estimate.
 */

const DEFAULT_PRICING = {
  input: { peak: 0.30, offPeak: 0.15 },
  cacheRead: { peak: 0.006, offPeak: 0.003 },
  output: { peak: 1.20, offPeak: 0.60 },
  usdToCny: 7.2,
}

export function isPeak(now = new Date()) {
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10)
}

function rate(pricing, key, band) {
  const value = pricing?.[key]
  if (typeof value === 'number') return value
  if (value && typeof value === 'object') {
    const selected = value[band]
    if (Number.isFinite(selected)) return selected
  }
  return DEFAULT_PRICING[key][band]
}

export function estimateCost(usage, cfg = {}, now = new Date()) {
  const pricing = cfg.pricing && typeof cfg.pricing === 'object' ? cfg.pricing : {}
  const band = isPeak(now) ? 'peak' : 'offPeak'
  const inputRate = rate(pricing, 'input', band)
  const hitRate = rate(pricing, 'cacheRead', band)
  const outputRate = rate(pricing, 'output', band)
  const missInput = (usage?.input ?? 0) + (usage?.cacheWrite ?? 0)
  const cachedInput = usage?.cacheRead ?? 0
  const output = usage?.output ?? 0
  const costUsd = (missInput / 1e6) * inputRate + (cachedInput / 1e6) * hitRate + (output / 1e6) * outputRate
  return {
    costUsd,
    band,
    usdToCny: Number.isFinite(pricing.usdToCny) ? pricing.usdToCny : DEFAULT_PRICING.usdToCny,
  }
}
