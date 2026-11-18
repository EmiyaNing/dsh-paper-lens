import * as pdfjsLib from 'pdfjs-dist'
import katex from 'katex'
import { prepareMath } from '../shared/math.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/paper-translator/pdf.worker.mjs'

// Assigned inside the loader factory; top-level presentational helpers below
// use it when they render, which happens after the factory has run.
let React
// Host layout service, used only for the explicit "back to conversation" control.
let LAYOUT = null
// Math macros from the paper preamble (\newcommand / \DeclareMathOperator).
let MATH_MACROS = {}

const CSS = `
.pt-root, .pt-root *, .pt-root *::before, .pt-root *::after { box-sizing: border-box; }
.pt-root {
  height: 100%; min-height: 0; display: flex; flex-direction: column;
  /* Accent-derived colours. The base values are the host's own tokens; the
     wallpaper/glass block at the end of this sheet swaps in contrast-safe
     values when the accent is user-configurable. */
  --pt-accent-fill: var(--dsw-alias-brand-primary, #2563eb);
  --pt-accent-on: var(--dsw-alias-label-on-color, #fff);
  --pt-accent-ink: var(--dsw-alias-brand-primary, #2563eb);
  background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: var(--dsh-content-font-size, 14px);
  overflow: hidden;
}
.pt-header {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 10px 14px;
  /* DSH reserves the top strip for macOS traffic lights / the Windows
     titlebar. Host pages add this inset to their page head; without it the
     plugin header sits under the close/minimize/zoom controls once the
     sidebar is collapsed. */
  padding-top: calc(10px + var(--dsh-frame-top-clearance, 0px));
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  background: var(--dsw-alias-bg-base, #fff);
}
.pt-header .pt-title { font-weight: 600; max-width: 34vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-header .pt-sub { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12px; max-width: 34vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-spacer { flex: 1; }
.pt-input {
  height: 30px; padding: 0 9px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #1f2328); outline: none; min-width: 0;
}
.pt-input:focus { border-color: var(--dsw-alias-brand-primary, #2563eb); }
.pt-btn {
  height: 30px; padding: 0 11px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 13px; white-space: nowrap;
}
.pt-btn:hover { background: var(--dsw-alias-interactive-bg-hover, #f3f4f6); }
.pt-btn:disabled { opacity: .45; cursor: default; }
.pt-btn-primary {
  background: var(--pt-accent-fill, var(--dsw-alias-brand-primary, #2563eb)); border-color: transparent;
  color: var(--pt-accent-on, var(--dsw-alias-label-on-color, #fff));
}
.pt-btn-primary:hover { background: var(--dsw-alias-button-primary-hover, #1d4ed8); }
.pt-badge {
  display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px;
  border-radius: 999px; font-size: 12px;
  background: var(--dsw-alias-bg-layer-2, #f3f4f6);
  color: var(--dsw-alias-label-secondary, #4b5563);
}
.pt-badge.ok { color: var(--dsw-alias-state-success-primary, #047857); }
.pt-badge.warn { color: var(--dsw-alias-state-warn-primary, #b45309); }
.pt-badge.err { color: var(--dsw-alias-state-error-primary, #b91c1c); }
.pt-main { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.pt-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; flex: 1; background: var(--dsw-alias-bg-base, #fff); }
.pt-pane + .pt-pane { border-left: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }
.pt-pane-head {
  display: flex; align-items: center; gap: 8px; padding: 7px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  background: var(--dsw-alias-bg-layer-1, #fafafa);
}
.pt-pane-head .pt-label { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-seg { margin-left: auto; display: inline-flex; padding: 2px; gap: 2px; border-radius: 7px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.pt-seg button {
  border: 0; border-radius: 5px; padding: 3px 9px; font-size: 12px; cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary, #4b5563);
}
.pt-seg button:hover { color: var(--dsw-alias-label-primary, #111827); }
.pt-seg button.on { background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #111827); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.pt-scroll { flex: 1; min-height: 0; overflow: auto; padding: 18px 22px 40px; scroll-behavior: auto; }
.pt-block {
  position: relative; margin: 0 0 14px; padding: 8px 10px; border-radius: 8px;
  border-left: 3px solid transparent; cursor: pointer; line-height: 1.75;
}
.pt-block:hover { background: var(--dsw-alias-interactive-bg-hover, #f8fafc); }
.pt-block.active { border-left-color: var(--dsw-alias-brand-primary, #2563eb); background: var(--dsw-alias-bg-layer-1, #f8fafc); }
.pt-block h1, .pt-block h2, .pt-block h3, .pt-block h4 { margin: 4px 0; line-height: 1.45; }
.pt-block h1 { font-size: 1.45em; }
.pt-block h2 { font-size: 1.25em; }
.pt-block h3 { font-size: 1.12em; }
.pt-block p { margin: 0; }
.pt-block .pt-caption { font-size: .93em; color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-block .pt-caption-label { display: inline-block; margin-right: 6px; font-weight: 600; color: var(--dsw-alias-label-tertiary, #6b7280); }
.pt-block.pending { color: var(--dsw-alias-label-tertiary, #6b7280); }
.pt-block.failed { border-left-color: var(--dsw-alias-state-error-primary, #b91c1c); }
.pt-block.math { cursor: default; padding: 2px 10px; }
.pt-block.math:hover { background: transparent; }
.pt-math { display: inline-block; max-width: 100%; overflow-x: auto; vertical-align: middle; }
.pt-math.display { display: block; margin: 6px 0; overflow-x: auto; }
.pt-math-error {
  display: inline-block; max-width: 100%; padding: 1px 6px; border-radius: 4px;
  border: 1px dashed var(--dsw-alias-state-warn-primary, #b45309);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b45309) 8%, transparent);
  color: var(--dsw-alias-state-warn-primary, #92400e);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .88em; white-space: pre-wrap; overflow-wrap: anywhere; vertical-align: middle;
}
.pt-math-error.display { display: block; margin: 6px 0; padding: 6px 8px; }
.pt-math-error code { font: inherit; }
.pt-chip {
  display: inline-flex; align-items: center; height: 18px; padding: 0 5px; margin: 0 1px;
  border-radius: 4px; font-size: 11px; vertical-align: 1px;
  background: var(--dsw-alias-markdown-inline-code, #eef2ff);
  color: var(--dsw-alias-label-secondary, #4b5563);
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
}
.pt-link { color: var(--dsw-alias-link, #2563eb); text-decoration: underline; }
.pt-block-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 11px; color: var(--dsw-alias-label-tertiary, #6b7280); }
.pt-mini { height: 22px; padding: 0 7px; font-size: 11px; border-radius: 4px; }
.pt-src { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 20px; padding: 12px 0 40px; }
.pt-src-line { display: flex; min-height: 20px; white-space: pre-wrap; word-break: break-word; }
.pt-src-line.active { background: var(--dsw-alias-bg-document-selection, rgba(37,99,235,.10)); }
.pt-src-no { width: 46px; flex: 0 0 46px; text-align: right; padding-right: 10px; color: var(--dsw-alias-label-caption, #9ca3af); user-select: none; }
.pt-src-text { flex: 1; min-width: 0; }
.pt-pdf-shell { position: relative; flex: 1; min-height: 0; display: flex; }
.pt-pdf { padding: 14px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.pt-pdf-zoom {
  position: absolute; top: 10px; right: 18px; z-index: 6;
  display: inline-flex; align-items: center; gap: 2px; padding: 3px;
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base, #fff) 88%, transparent);
  box-shadow: 0 2px 10px rgba(0,0,0,.14); backdrop-filter: blur(6px);
}
.pt-pdf-zoom button {
  min-width: 26px; height: 24px; padding: 0 6px; border: 0; border-radius: 5px;
  background: transparent; color: var(--dsw-alias-label-primary, #111827);
  cursor: pointer; font-size: 13px; line-height: 24px;
}
.pt-pdf-zoom button:hover { background: var(--dsw-alias-interactive-bg-hover, #f3f4f6); }
.pt-pdf-zoom .pct { min-width: 58px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-pdf-page { position: relative; margin: 0 auto 16px; max-width: 100%; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.16); border-radius: 2px; overflow: hidden; }
.pt-pdf-page canvas { display: block; width: 100%; height: auto; }
.pt-pdf-page.active { outline: 2px solid var(--dsw-alias-brand-primary, #2563eb); }
.pt-pdf-no { position: absolute; top: 6px; right: 8px; padding: 1px 6px; border-radius: 4px; font-size: 11px; background: rgba(0,0,0,.55); color: #fff; }
.pt-footer {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 6px 14px; border-top: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  background: var(--dsw-alias-bg-layer-1, #fafafa); font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
}
.pt-footer label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.pt-global-usage {
  padding: 1px 6px; border-radius: 4px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 11%, transparent);
  color: var(--dsw-alias-brand-primary, #2563eb);
}
.pt-banner { margin: 8px 14px 0; padding: 8px 10px; border-radius: 7px; font-size: 12.5px; }
.pt-banner.err { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #b91c1c) 12%, transparent); color: var(--dsw-alias-state-error-primary, #b91c1c); }
.pt-banner.warn { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b45309) 12%, transparent); color: var(--dsw-alias-state-warn-primary, #b45309); }
.pt-banner-head { display: flex; align-items: flex-start; gap: 8px; }
.pt-banner-head > span { flex: 1; min-width: 0; }
.pt-banner-close {
  flex: 0 0 auto; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 4px;
  background: transparent; color: inherit; cursor: pointer; font-size: 17px; line-height: 20px;
  opacity: .7;
}
.pt-banner-close:hover { opacity: 1; background: color-mix(in srgb, currentColor 12%, transparent); }
.pt-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px; text-align: center; color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-empty h2 { margin: 0; font-size: 18px; color: var(--dsw-alias-label-primary, #111827); }
.pt-empty p { margin: 0; max-width: 520px; line-height: 1.7; }
.pt-open-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pt-open-row .pt-input { width: 360px; max-width: 100%; flex: 1 1 320px; min-width: 220px; }
.pt-rebuttal-tabs {
  flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
  padding-bottom: 8px; border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
}
.pt-rebuttal-tabs button {
  padding: 4px 9px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-secondary, #4b5563);
  font-size: 12px; cursor: pointer;
}
.pt-rebuttal-tabs button.on { background: var(--dsw-alias-brand-primary, #2563eb); border-color: var(--dsw-alias-brand-primary, #2563eb); color: #fff; }
.pt-rebuttal-tabs button:disabled { opacity: .55; cursor: default; }
.pt-rebuttal-tabs .pt-rebuttal-add { border-style: dashed; background: transparent; }
.pt-rebuttal-name { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--dsw-alias-label-tertiary, #6b7280); }
.pt-rebuttal-name input {
  height: 30px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827); font-size: 13px;
}
.pt-overview { display: flex; flex-direction: column; gap: 8px; }
.pt-overview h4 { margin: 8px 0 0; font-size: 13px; }
.pt-overview-summary { margin: 0; line-height: 1.7; font-size: 13px; }
.pt-attitudes { display: flex; flex-direction: column; gap: 8px; }
.pt-attitude { padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 7px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); font-size: 12px; line-height: 1.55; }
.pt-attitude p { margin: 5px 0; }
.pt-attitude ul { margin: 4px 0 0; padding-left: 18px; color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 11px; }
.pt-attitude-head { display: flex; align-items: center; gap: 7px; }
.pt-attitude-badge { padding: 1px 7px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.pt-attitude-badge.positive { background: #dcfce7; color: #166534; }
.pt-attitude-badge.neutral { background: #e5e7eb; color: #374151; }
.pt-attitude-badge.negative { background: #fee2e2; color: #991b1b; }
.pt-attitude-badge.mixed { background: #fef3c7; color: #92400e; }
.pt-attitude-score { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 11px; }
.pt-overview-reviewer {
  padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 4px;
  background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-brand-primary, #2563eb);
  font-size: 11px; cursor: pointer;
}
.pt-overview-groups { display: flex; flex-direction: column; gap: 8px; }
.pt-overview-group { padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 7px; font-size: 12px; line-height: 1.55; }
.pt-overview-group p { margin: 5px 0; }
.pt-overview-group ul { margin: 4px 0 0; padding-left: 18px; color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 11px; }
.pt-overview-group blockquote { margin: 5px 0 0; padding-left: 8px; border-left: 2px solid var(--dsw-alias-border-l2, #d1d5db); color: var(--dsw-alias-label-secondary, #4b5563); font-size: 11px; }
.pt-overview-group-head { display: flex; align-items: flex-start; gap: 7px; }
.pt-overview-group-head strong { flex: 1; }
.pt-overview-reviewers { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.pt-severity { padding: 1px 6px; border-radius: 4px; font-size: 10px; background: #fef3c7; color: #92400e; }
.pt-severity.major { background: #fee2e2; color: #991b1b; }
.pt-rebuttal-mask { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.28); }
.pt-rebuttal-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 51;
  width: min(680px, 96vw); padding: 18px; overflow: hidden;
  display: flex; flex-direction: column; gap: 10px;
  background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #111827);
  border-left: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  box-shadow: -12px 0 34px rgba(0,0,0,.16);
}
.pt-rebuttal-head { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
.pt-rebuttal-head h3 { flex: 1; margin: 0; font-size: 15px; }
.pt-rebuttal-body {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  display: flex; flex-direction: column; gap: 12px; padding-right: 2px;
}
.pt-rebuttal-input {
  width: 100%; min-height: 170px; max-height: 38vh; resize: vertical; padding: 10px;
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827);
  font-family: inherit; font-size: 13px; line-height: 1.65;
}
.pt-rebuttal-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; }
.pt-rebuttal-controls label { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-rebuttal-controls select { height: 28px; padding: 0 6px; border-radius: 5px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; }
.pt-rebuttal-hint { flex: 1 1 220px; min-width: 180px; font-size: 11px; line-height: 1.5; }
.pt-rebuttal-result { display: flex; flex-direction: column; gap: 8px; }
.pt-rebuttal-result h4 { margin: 6px 0 0; font-size: 13px; }
.pt-rebuttal-paragraphs { display: flex; flex-direction: column; gap: 10px; font-size: 14px; line-height: 1.9; }
.pt-rebuttal-paragraph { margin: 0; white-space: pre-wrap; }
.pt-rebuttal-mark {
  padding: 0 2px; border-radius: 3px; cursor: pointer;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 18%, transparent);
  border-bottom: 2px solid var(--dsw-alias-brand-primary, #2563eb);
}
.pt-rebuttal-mark:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 30%, transparent); }
.pt-rebuttal-mark sup { margin-left: 2px; font-size: 10px; font-weight: 600; }
.pt-rebuttal-matches { display: flex; flex-direction: column; gap: 6px; }
.pt-rebuttal-match {
  display: flex; align-items: flex-start; gap: 8px; width: 100%; padding: 8px 10px;
  text-align: left; cursor: pointer; color: inherit;
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2, #f3f4f6);
}
.pt-rebuttal-match:hover { border-color: var(--dsw-alias-brand-primary, #2563eb); }
.pt-rebuttal-num {
  flex: 0 0 22px; width: 22px; height: 22px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-brand-primary, #2563eb); color: #fff; font-size: 11px; font-weight: 600;
}
.pt-rebuttal-match-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 12px; line-height: 1.5; }
.pt-rebuttal-quote { color: var(--dsw-alias-label-secondary, #4b5563); font-style: italic; }
.pt-rebuttal-original { color: var(--dsw-alias-label-primary, #111827); white-space: pre-wrap; }
.pt-rebuttal-reason { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 11px; }
.pt-rebuttal-locate { color: var(--dsw-alias-brand-primary, #2563eb); font-size: 11px; }
.pt-rebuttal-pins { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.pt-rebuttal-pin {
  padding: 1px 6px; border-radius: 4px; cursor: pointer; font-size: 10.5px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 45%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 12%, transparent);
  color: var(--dsw-alias-brand-primary, #2563eb);
}
.pt-src-rebuttal {
  flex: 0 0 auto; margin-left: 8px; padding: 0 5px; border-radius: 3px; cursor: pointer;
  font-size: 10px; border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 45%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 12%, transparent);
  color: var(--dsw-alias-brand-primary, #2563eb);
}
.pt-drawer-mask { position: fixed; inset: 0; background: rgba(0,0,0,.28); z-index: 40; }
.pt-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 92vw); z-index: 41;
  background: var(--dsw-alias-bg-base, #fff); border-left: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  padding: 18px; overflow: auto; display: flex; flex-direction: column; gap: 12px;
}
.pt-drawer h3 { margin: 0 0 4px; font-size: 15px; }
.pt-drawer label { font-size: 12px; color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-drawer textarea { width: 100%; min-height: 140px; resize: vertical; padding: 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827); font-family: ui-monospace, monospace; font-size: 12px; }
.pt-drawer select { height: 30px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827); }
.pt-dock h3 { margin: 0; font-size: 15px; }
.pt-dock label { font-size: 12px; color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-dock textarea { width: 100%; min-height: 140px; resize: vertical; padding: 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827); font-family: ui-monospace, monospace; font-size: 12px; }
.pt-dock select, .pt-dock input[type="text"] { height: 30px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827); }
.pt-rebuttal-head h3 { flex: 1; margin: 0; font-size: 15px; }
.pt-log { white-space: pre-wrap; max-height: 220px; overflow: auto; font-family: ui-monospace, monospace; font-size: 11px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); padding: 8px; border-radius: 6px; }
.pt-spin { width: 12px; height: 12px; border: 2px solid var(--dsw-alias-border-l2, #d1d5db); border-top-color: var(--dsw-alias-brand-primary, #2563eb); border-radius: 50%; animation: ptspin .9s linear infinite; display: inline-block; }
@keyframes ptspin { to { transform: rotate(360deg); } }
.pt-splitter { width: 5px; flex: 0 0 5px; cursor: col-resize; background: transparent; }
.pt-splitter:hover { background: var(--dsw-alias-brand-primary, #2563eb); opacity: .25; }
.pt-muted { color: var(--dsw-alias-label-tertiary, #6b7280); }
.pt-usage-card {
  display: flex; flex-direction: column; gap: 4px; padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2, #f3f4f6); font-size: 12px; line-height: 1.5;
}
.pt-usage-title { font-weight: 600; font-size: 12px; }
.pt-error-text { color: var(--dsw-alias-state-error-primary, #b91c1c); }
.pt-block-tools { display: flex; gap: 5px; margin-top: 5px; opacity: .45; transition: opacity .12s ease; }
.pt-block:hover .pt-block-tools, .pt-block.active .pt-block-tools { opacity: 1; }
.pt-edit-mask {
  position: fixed; inset: 0; z-index: 60; padding: 24px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.36);
}
.pt-edit-card {
  width: min(820px, 100%); max-height: calc(100vh - 48px);
  display: flex; flex-direction: column; gap: 10px;
  padding: 16px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-base, #fff);
  background-clip: padding-box;
  color: var(--dsw-alias-label-primary, #111827);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l1, #e5e7eb), 0 18px 50px rgba(0,0,0,.24);
  overflow: hidden;
}
.pt-edit-card h3 { margin: 0; font-size: 15px; line-height: 1.4; }
.pt-edit-modes { display: inline-flex; align-self: flex-start; gap: 2px; padding: 3px; border-radius: 7px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }
.pt-edit-modes button { border: 0; border-radius: 5px; padding: 4px 12px; font-size: 12px; cursor: pointer; background: transparent; color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-edit-modes button.on { background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #111827); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.pt-edit-modes button:disabled { opacity: .5; cursor: default; }
.pt-edit-card textarea {
  width: 100%; flex: 1 1 auto; min-height: 220px; max-height: none; resize: none; padding: 10px;
  border-radius: 7px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.65;
  outline: none;
}
.pt-edit-card textarea:focus { border-color: var(--dsw-alias-brand-primary, #2563eb); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 18%, transparent); }
.pt-edit-card textarea.zh { font-family: inherit; font-size: 14.5px; line-height: 1.85; }
.pt-edit-hint { font-size: 12px; line-height: 1.65; color: var(--dsw-alias-label-tertiary, #6b7280); }
.pt-edit-error { font-size: 12px; line-height: 1.65; color: var(--dsw-alias-state-error-primary, #b91c1c); }
.pt-edit-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }

/* ---- Visual spec ----------------------------------------------------------
   One scale for the whole panel: 8px controls, 12px cards, 30px control
   height, three text sizes (11 caption / 13 body / 15 title) and a single
   hairline. Feature blocks later in the sheet override individual radii; this
   pass keeps the surface family coherent instead of seven radii and nine
   text sizes. --------------------------------------------------------------- */
.pt-btn, .pt-input, .pt-seg, .pt-seg button.on, .pt-edit-modes, .pt-edit-modes button.on { border-radius: 8px; }
.pt-badge, .pt-chip { border-radius: 6px; }
.pt-block, .pt-attitude, .pt-overview-group, .pt-rebuttal-match { border-radius: 12px; }
.pt-btn { font-size: 13px; font-weight: 500; }
.pt-input { font-size: 13px; }
.pt-btn:focus-visible, .pt-input:focus-visible, .pt-icon-btn:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary, #2563eb));
  outline-offset: 1px;
}
/* Reading measure: translation blocks stop at 74 characters and centre in the
   pane, so wide windows keep a comfortable line length. Source/PDF panes are
   deliberately unaffected. */
.pt-scroll { padding: 22px 28px 56px; }
.pt-block { max-width: 74ch; margin: 0 auto 16px; line-height: 1.85; }
.pt-block h1 { font-size: 1.4em; letter-spacing: -.01em; }
.pt-block h2 { font-size: 1.22em; letter-spacing: -.01em; }
.pt-block h3 { font-size: 1.1em; }
/* State colours come from the theme's semantic tokens, not fixed pastels, so
   the attitude / severity chips keep working in dark and glass themes. */
.pt-attitude-badge.positive { background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #047857) 15%, transparent); color: var(--dsw-alias-state-success-primary, #047857); }
.pt-attitude-badge.neutral { background: color-mix(in srgb, var(--dsw-alias-label-secondary, #4b5563) 12%, transparent); color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-attitude-badge.negative { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #b91c1c) 15%, transparent); color: var(--dsw-alias-state-error-primary, #b91c1c); }
.pt-attitude-badge.mixed { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b45309) 15%, transparent); color: var(--dsw-alias-state-warn-primary, #b45309); }
.pt-severity { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b45309) 15%, transparent); color: var(--dsw-alias-state-warn-primary, #b45309); }
.pt-severity.major { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #b91c1c) 15%, transparent); color: var(--dsw-alias-state-error-primary, #b91c1c); }
@media (prefers-reduced-motion: reduce) {
  .pt-spin { animation: none; }
  .pt-block, .pt-block-tools, .pt-banner-close, .pt-btn, .pt-input { transition: none; }
}


/* ---- Command bar, body and status bar ------------------------------------
   The shell is three bands: a single command bar, a body that may host one or
   two reading panes plus a docked side panel, and one status line. Secondary
   actions live in the two popover menus instead of a wrapping toolbar. */
.pt-cmdbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px; padding-top: calc(8px + var(--dsh-frame-top-clearance, 0px));
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  background: var(--dsw-alias-bg-layer-1, #fff);
  position: relative; z-index: 20;
}
.pt-proj {
  display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 10px;
  border: 1px solid transparent; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-primary, #1f2328); cursor: pointer; max-width: 36vw; min-width: 0;
}
.pt-proj:hover, .pt-proj.on { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.pt-proj svg { width: 16px; height: 16px; flex: 0 0 16px; opacity: .8; }
.pt-proj-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; font-size: 13px; }
.pt-caret { font-size: 9px; opacity: .55; }
.pt-mainfile { height: 28px; max-width: 220px; }
.pt-viewseg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.pt-viewseg button {
  border: 0; border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary, #4b5563);
}
.pt-viewseg button:hover { color: var(--dsw-alias-label-primary, #111827); }
.pt-viewseg button.on { background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.pt-chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; font-size: 11px; border-radius: 6px; }
.pt-chip.warn { color: var(--dsw-alias-state-warn-primary, #b45309); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b45309) 14%, transparent); }
.pt-stat {
  display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary, #4b5563);
  font-size: 12px; cursor: pointer; font-variant-numeric: tabular-nums;
}
.pt-stat:hover { border-color: var(--dsw-alias-border-l2, #d1d5db); }
.pt-stat-err { color: var(--dsw-alias-state-error-primary, #b91c1c); font-weight: 600; }
.pt-ring { flex: 0 0 18px; }
.pt-icon-btn { width: 32px; padding: 0; font-size: 15px; line-height: 1; }
.pt-icon-btn.on { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.pt-menu {
  position: absolute; top: calc(100% - 2px); min-width: 260px; max-width: 420px; padding: 6px;
  border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  background: var(--dsw-alias-bg-overlay, #fff); box-shadow: 0 12px 32px rgba(0,0,0,.18);
  z-index: 40; display: flex; flex-direction: column; gap: 1px;
}
.pt-menu-left { left: 10px; }
.pt-menu-right { right: 10px; }
.pt-menu-title { padding: 6px 8px 4px; font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-tertiary, #6b7280); }
.pt-menu-item {
  display: flex; flex-direction: column; gap: 2px; align-items: stretch; width: 100%;
  padding: 7px 8px; border: 0; border-radius: 6px; background: transparent;
  color: var(--dsw-alias-label-primary, #1f2328); font-size: 13px; text-align: left; cursor: pointer;
}
.pt-menu-item:hover { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.pt-menu-item:disabled { opacity: .5; cursor: default; }
.pt-menu-item-title { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-menu-item-sub { font-size: 11px; color: var(--dsw-alias-label-tertiary, #6b7280); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-menu-empty { padding: 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #6b7280); }
.pt-menu-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l1, #e5e7eb); }
.pt-menu-form { display: flex; flex-direction: column; gap: 6px; padding: 4px; }
.pt-menu-row { display: flex; gap: 6px; justify-content: flex-end; }
.pt-body { flex: 1; min-height: 0; display: flex; align-items: stretch; }
.pt-main { min-width: 0; }
.pt-dock {
  flex: 0 0 auto; width: clamp(320px, 26vw, 400px); min-width: 0; display: flex; flex-direction: column;
  gap: 10px; padding: 16px; overflow: auto; border-left: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  background: var(--dsw-alias-bg-layer-1, #fff);
}
.pt-dock-wide { width: clamp(380px, 40vw, 620px); }
.pt-statusbar {
  display: flex; align-items: center; gap: 10px; padding: 6px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  background: var(--dsw-alias-bg-layer-1, #fff); font-size: 12px; color: var(--dsw-alias-label-tertiary, #6b7280);
  position: relative; z-index: 10;
}
.pt-usage { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.pt-usage:hover { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.pt-usage-pop {
  position: absolute; left: 8px; bottom: calc(100% + 6px); width: 280px; padding: 8px;
  border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  background: var(--dsw-alias-bg-overlay, #fff); box-shadow: 0 12px 32px rgba(0,0,0,.18);
  z-index: 40; display: flex; flex-direction: column; gap: 1px;
}
.pt-usage-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 8px; font-size: 12px; color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-toggle {
  display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); background: transparent;
  color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12px; cursor: pointer;
}
.pt-toggle.on { color: var(--dsw-alias-label-primary, #111827); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 45%, transparent); }
.pt-toggle-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .5; }
.pt-toggle.on .pt-toggle-dot { background: var(--dsw-alias-brand-primary, #2563eb); opacity: 1; }
.pt-empty-mark { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 14px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-secondary, #4b5563); }
.pt-empty-mark svg { width: 24px; height: 24px; }
.pt-empty-actions { display: flex; gap: 8px; }
.pt-recent { margin-top: 16px; width: min(520px, 100%); display: flex; flex-direction: column; gap: 4px; text-align: left; }
.pt-recent-title { padding: 2px 6px; font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-tertiary, #6b7280); }
.pt-recent-item { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.pt-recent-item:hover { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.pt-recent-name { font-size: 13px; color: var(--dsw-alias-label-primary, #1f2328); }
.pt-recent-path { font-size: 11px; color: var(--dsw-alias-label-tertiary, #6b7280); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- Wallpaper Engine coexistence (dsh-plugin-wallpaper-engine) -------------
   Two public markers gate this block. body[data-we-wallpaper]: the wallpaper
   row makes the page base transparent and lets the wallpaper show. body
   [data-we-glass-page]: the optional glass row remaps the raised-surface and
   overlay tokens to translucent recipes (>= 70% effective for layer-1 at the
   default glass alpha, more for bg-overlay). Without either marker nothing
   here matches, so the native look is byte-for-byte unchanged.

   What changes under a marker:
   - the reader stops painting the transparent page base and stacks two
     layer-1 plates (root + main, ~91% effective) so body text never sits
     directly on the wallpaper;
   - the toolbar and controls move up to bg-overlay (the footer to layer-2, so
     its own buttons still read against it), and the selected segment / active
     block no longer collapse into their own track;
   - tertiary and caption labels are raised one step inside the reader: their
     11-13px metadata is chosen against the opaque native base and would fall
     under 4.5:1 on a translucent plate;
   - the drawers and the edit card get bg-overlay plus their own frost, and
     keep their host stacking (they are siblings of .pt-main, never children of
     a layer-1 stacking context).

   .pt-main carries data-we-surface="v1" and a positioned, non-auto z-index so
   the glass runtime accepts it as a declared carrier (its safeLocal check);
   the PDF canvases carry data-we-surface-preserve so the paper stays white. */
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-root {
  background: var(--dsw-alias-bg-layer-1, #fff);
  --dsw-alias-label-tertiary: var(--dsw-alias-label-secondary);
  --dsw-alias-label-caption: var(--dsw-alias-label-secondary);
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-cmdbar,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-main {
  background: var(--dsw-alias-bg-layer-1, #fff);
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-main { position: relative; z-index: 0; }
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-pane { background: transparent; }
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-pane-head,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-input,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-btn:not(.pt-btn-primary) {
  background: var(--dsw-alias-bg-overlay, #fafafa);
}
/* The footer stays a step below its own controls, otherwise its buttons are
   border-only on the same fill. */
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-statusbar {
  background: var(--dsw-alias-bg-layer-2, #fafafa);
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-btn:not(.pt-btn-primary):hover,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-pdf-zoom button:hover {
  background: color-mix(in srgb, var(--dsw-alias-bg-overlay, #f3f4f6) 88%, var(--dsw-alias-brand-primary, #2563eb));
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-block:hover,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-overview-reviewer {
  background: var(--dsw-alias-bg-layer-2, #f3f4f6);
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-block.active,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-seg button.on,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-edit-modes button.on {
  background: var(--dsw-alias-bg-overlay, #fff);
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-seg button.on,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-edit-modes button.on {
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2, #d1d5db);
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-pdf-zoom { background: var(--dsw-alias-bg-overlay, #fff); }
/* Drawers and the edit card sit over the page, not over the reader's two-plate
   stack, so they paint the overlay recipe twice: one plate alone is ~0.8, two
   reach ~0.95 and keep 11px labels legible over a dark wallpaper region. */
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-dock,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-edit-card {
  background-color: var(--dsw-alias-bg-overlay, #fff);
  background-image: linear-gradient(var(--dsw-alias-bg-overlay, #fff), var(--dsw-alias-bg-overlay, #fff));
  -webkit-backdrop-filter: blur(22px) saturate(1.05);
  backdrop-filter: blur(22px) saturate(1.05);
}

/* ---- Accent legibility under the wallpaper accent --------------------------
   The wallpaper engine remaps --dsw-alias-brand-primary to its own accent
   colour (--we-accent, e.g. a pale cyan). White-on-brand labels then become
   white on a near-white fill, and accent-coloured text disappears on light
   surfaces. Under the marker the accent is used as a tonal fill with the
   theme's primary label as text, and as an accent/theme blend for accent text:
   both stay legible for any accent in either theme. Without the marker the
   host's original solid brand treatment is unchanged. ---------------------- */
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-root {
  --pt-accent-fill: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 22%, var(--dsw-alias-bg-layer-1, #fff));
  --pt-accent-on: var(--dsw-alias-label-primary, #1f2328);
  --pt-accent-ink: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 40%, var(--dsw-alias-label-primary, #1f2328));
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-btn-primary { border-color: var(--pt-accent-ink); }
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-btn-primary:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 32%, var(--dsw-alias-bg-layer-1, #fff));
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-rebuttal-tabs button.on {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 30%, var(--dsw-alias-bg-layer-1, #fff));
  border-color: var(--pt-accent-ink);
  color: var(--dsw-alias-label-primary, #111827);
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-rebuttal-num {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 30%, var(--dsw-alias-bg-layer-1, #fff));
  box-shadow: inset 0 0 0 1px var(--pt-accent-ink);
  color: var(--dsw-alias-label-primary, #111827);
}
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-link,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-global-usage,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-overview-reviewer,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-rebuttal-locate,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-rebuttal-pin,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-src-rebuttal { color: var(--pt-accent-ink); }
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-rebuttal-pin,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-src-rebuttal,
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-rebuttal-mark { border-color: var(--pt-accent-ink); }
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-input:focus { border-color: var(--pt-accent-ink); }
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-block.active { border-left-color: var(--pt-accent-ink); }
body:is([data-we-wallpaper], [data-we-glass-page]) .pt-pdf-page.active { outline-color: var(--pt-accent-ink); }
`

const LOCALE = (() => {
  const zh = typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')
  return zh
    ? {
        open: '打开', scan: '扫描', browse: '选择目录…', picking: '选择中…', noTex: '该目录下没有 .tex 文件', pickerUnsupported: '当前运行环境不支持系统目录选择，请手动输入路径', project: '项目目录', main: '主文件', changeProject: '换项目',
        translation: '译文', source: 'LaTeX', pdf: 'PDF',
        translate: '翻译', retranslate: '重新翻译', compile: '编译 PDF', settings: '设置',
        sync: '同步滚动', swap: '交换左右', emptyTitle: '论文对照',
        split: '拆分', more: '更多', recent: '最近项目', noRecent: '还没有最近项目', openProject: '打开项目…', manualPath: '手动输入路径', untranslated: '待翻译', failedShort: '失败', blocksUnit: '段', backToChat: '返回对话',
        emptyBody: '选择一个包含 main.tex 的项目，左侧看中文译文，右侧看 LaTeX 或 PDF。',
        loading: '加载中…', reading: '读取项目…', parsing: '解析 LaTeX…',
        pending: '待翻译', translating: '翻译中…', failed: '翻译失败', retry: '重试',
        noPdf: '没有找到 PDF', compileRunning: '编译中…', compiled: '编译完成',
        compiledFail: '编译失败', tokens: 'tokens', cached: '缓存命中',
        clearCache: '清空本文缓存', clearAll: '清空全部缓存', glossary: '术语表',
        edit: '编辑', editBlock: '编辑这个段落', editZh: '编辑中文', editEn: '编辑英文', editZhTitle: '编辑中文译文', editEnTitle: '编辑英文 LaTeX',
        saveTranslate: '保存并翻译', cancel: '取消', rewriting: '翻译并写回…', rewriteFailed: '写回失败', writeBack: '已写回源文件',
        polish: '用 Best-Paper-Writing 润色', polishing: '润色中…', polished: '已润色，请检查后保存',
        polishHint: '润色使用 Best-Paper-Writing-Skill v1.2 的风格规则：只改表达，不改事实、数字、公式、引用；结果先填回编辑框，确认后再保存。',
        zoomIn: '放大', zoomOut: '缩小', fitWidth: '适应宽度（100%）',
        rebuttal: '返修意见', rebuttalTitle: '多审稿人返修意见与原文对应', rebuttalPlaceholder: '粘贴这一位审稿人的意见（可包含审稿人的后续回复）…',
        rebuttalRun: '翻译并定位', rebuttalRunning: '分析中…', rebuttalTarget: '译文', rebuttalHint: '每位审稿人单独添加；模型分别翻译并定位，总览会汇总重叠/独有意见和审稿人态度。',
        rebuttalTranslation: '返修意见译文', rebuttalMatches: '对应原文段落', rebuttalNoMatches: '没有找到足够明确的原文对应，已只返回译文。',
        rebuttalPin: '返修', rebuttalLocate: '定位到原文', rebuttalEmpty: '请先输入返修意见。', rebuttalFailed: '返修意见分析失败',
        rebuttalQuote: '返修原句', rebuttalReason: '对应理由', rebuttalClear: '清空',
        rebuttalOverview: '总览', addReviewer: '+ 添加审稿人', removeReviewer: '移除审稿人', reviewerName: '审稿人名称',
        overviewRun: '生成总览', overviewRunning: '汇总中…', overviewEmpty: '点击「生成总览」汇总各审稿人的重叠意见、独有意见和态度。',
        overviewSummary: '总体判断', overviewAttitudes: '各审稿人态度', overviewOverlaps: '重叠意见', overviewUnique: '独有意见',
        overviewNoneOverlap: '没有明显的跨审稿人重叠意见。', overviewNoneUnique: '没有单列出的独有意见。',
        severityMajor: '主要', severityMinor: '次要',
        attitudePositive: '正面', attitudeNeutral: '中性', attitudeNegative: '负面', attitudeMixed: '褒贬混合',
        reviewerDefault: '审稿人', overviewFailed: '总览生成失败',
        usage: '本论文 Token 用量与费用', globalUsageLabel: '全局总账', paperUsage: '本论文', globalUsage: '全局',
        usageInput: '输入', usageOutput: '输出', usageCacheHit: '缓存命中',
        usageCacheWrite: '缓存写入', usageCalls: '模型调用', usageCost: '估算费用',
        globalUsageNote: '跨论文累计，保存在 DSH_HOME/paper-translator/usage.json；清空单篇缓存不会清零总账。',
        usageNote: '按 DeepSeek 官方 deepseek-flash 峰谷价估算（单位 USD），人民币按配置汇率换算；未排除中国法定节假日。',
        zhEditHint: '保留 ⟦M1⟧ 这类占位符（公式/引用）；保存后自动译成英文并写回对应 .tex。段落内的加粗、斜体等格式会被简化。',
        enEditHint: '这里编辑的是该段落的原始 LaTeX 片段；保存后写回 .tex，并自动翻译成中文。',
        glossaryHint: 'JSON 对象，例如 {"world model": "世界模型"}',
        target: '目标语言', close: '关闭', save: '保存', settingsSaved: '设置已保存',
        warnings: '解析提示', model: '模型', noProject: '还没有打开项目',
        openFailed: '打开失败', fileChanged: '文件已更新', compilLog: '编译日志',
        readingPdf: '加载 PDF…', pdfFailed: 'PDF 加载失败', page: '页',
        sourceFile: '源文件', mode: '显示', retranslateAll: '重译全部',
      }
    : {
        open: 'Open', scan: 'Scan', browse: 'Choose folder…', picking: 'Choosing…', noTex: 'No .tex file in this folder', pickerUnsupported: 'This environment cannot open a native folder picker; type the path instead', project: 'Project directory', main: 'Main file', changeProject: 'Switch project',
        translation: 'Translation', source: 'LaTeX', pdf: 'PDF',
        translate: 'Translate', retranslate: 'Retranslate', compile: 'Compile PDF', settings: 'Settings',
        sync: 'Sync scroll', swap: 'Swap sides', emptyTitle: 'Paper Lens',
        split: 'Split', more: 'More', recent: 'Recent projects', noRecent: 'No recent project yet', openProject: 'Open project…', manualPath: 'Enter path manually', untranslated: 'Untranslated', failedShort: 'failed', blocksUnit: 'blocks', backToChat: 'Back to conversation',
        emptyBody: 'Pick a project containing main.tex. Read the Chinese translation on the left and LaTeX or PDF on the right.',
        loading: 'Loading…', reading: 'Reading project…', parsing: 'Parsing LaTeX…',
        pending: 'Pending', translating: 'Translating…', failed: 'Translation failed', retry: 'Retry',
        noPdf: 'No PDF found', compileRunning: 'Compiling…', compiled: 'Compiled',
        compiledFail: 'Compile failed', tokens: 'tokens', cached: 'cached',
        clearCache: 'Clear this project', clearAll: 'Clear all caches', glossary: 'Glossary',
        edit: 'Edit', editBlock: 'Edit this block', editZh: 'Edit Chinese', editEn: 'Edit English', editZhTitle: 'Edit Chinese translation', editEnTitle: 'Edit English LaTeX',
        saveTranslate: 'Save & translate', cancel: 'Cancel', rewriting: 'Translating & writing back…', rewriteFailed: 'Write-back failed', writeBack: 'Written back to source',
        polish: 'Polish with Best-Paper-Writing', polishing: 'Polishing…', polished: 'Polished; review before saving',
        polishHint: 'Uses Best-Paper-Writing-Skill v1.2 style rules: expression only, no changes to facts, numbers, formulas or citations. The result is placed back in the editor for review before saving.',
        zoomIn: 'Zoom in', zoomOut: 'Zoom out', fitWidth: 'Fit width (100%)',
        rebuttal: 'Rebuttal', rebuttalTitle: 'Multi-reviewer rebuttal mapping', rebuttalPlaceholder: 'Paste this reviewer\'s comments (follow-up replies are welcome)…',
        rebuttalRun: 'Translate & map', rebuttalRunning: 'Analyzing…', rebuttalTarget: 'Translate to', rebuttalHint: 'Add each reviewer separately. Translation and paper mapping stay per reviewer; Overview compares shared/unique concerns and attitudes.',
        rebuttalTranslation: 'Rebuttal translation', rebuttalMatches: 'Matched paper blocks', rebuttalNoMatches: 'No sufficiently clear paper mapping was found; only the translation is shown.',
        rebuttalPin: 'Rebut', rebuttalLocate: 'Locate in paper', rebuttalEmpty: 'Enter the rebuttal first.', rebuttalFailed: 'Rebuttal analysis failed',
        rebuttalQuote: 'Rebuttal excerpt', rebuttalReason: 'Why this block', rebuttalClear: 'Clear',
        rebuttalOverview: 'Overview', addReviewer: '+ Add reviewer', removeReviewer: 'Remove reviewer', reviewerName: 'Reviewer name',
        overviewRun: 'Generate overview', overviewRunning: 'Synthesizing…', overviewEmpty: 'Generate an overview to compare reviewers, find shared and unique concerns, and read each reviewer\'s stance.',
        overviewSummary: 'Overall read', overviewAttitudes: 'Reviewer attitudes', overviewOverlaps: 'Overlapping concerns', overviewUnique: 'Unique concerns',
        overviewNoneOverlap: 'No clear cross-reviewer overlap.', overviewNoneUnique: 'No separate unique concerns listed.',
        severityMajor: 'Major', severityMinor: 'Minor',
        attitudePositive: 'Positive', attitudeNeutral: 'Neutral', attitudeNegative: 'Negative', attitudeMixed: 'Mixed',
        reviewerDefault: 'Reviewer', overviewFailed: 'Overview failed',
        usage: 'This paper: token usage & cost', globalUsageLabel: 'Global ledger', paperUsage: 'This paper', globalUsage: 'All papers',
        usageInput: 'Input', usageOutput: 'Output', usageCacheHit: 'Cache hit',
        usageCacheWrite: 'Cache write', usageCalls: 'Model calls', usageCost: 'Estimated cost',
        globalUsageNote: 'Cumulative across papers, stored in DSH_HOME/paper-translator/usage.json. Clearing one paper\'s cache does not reset the global ledger.',
        usageNote: 'Estimated from DeepSeek official deepseek-flash peak/off-peak prices in USD; CNY uses the configured exchange rate. Chinese public holidays are not excluded.',
        zhEditHint: 'Keep placeholders such as ⟦M1⟧ (math/citations). Saving translates to English and writes it back to the .tex file. Bold/italic formatting inside the paragraph is simplified.',
        enEditHint: 'Edit the raw LaTeX fragment for this block. Saving writes it back and translates it to Chinese.',
        glossaryHint: 'JSON object, e.g. {"world model": "世界模型"}',
        target: 'Target language', close: 'Close', save: 'Save', settingsSaved: 'Settings saved',
        warnings: 'Parser warnings', model: 'Model', noProject: 'No project open',
        openFailed: 'Open failed', fileChanged: 'File updated', compilLog: 'Compile log',
        readingPdf: 'Loading PDF…', pdfFailed: 'PDF failed to load', page: 'page',
        sourceFile: 'Source file', mode: 'View', retranslateAll: 'Retranslate all',
      }
})()

async function api(path, body, signal) {
  const response = await fetch('/api/paper-translator' + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || response.statusText || 'Request failed')
    error.code = data?.error?.code
    throw error
  }
  return data
}

const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, costCny: 0, calls: 0 }

function usageTotal(usage) {
  return (usage?.input ?? 0) + (usage?.output ?? 0) + (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0)
}

function formatTokens(value) {
  const number = Number(value) || 0
  if (number >= 1e6) return `${(number / 1e6).toFixed(2)}M`
  if (number >= 1e3) return `${(number / 1e3).toFixed(1)}k`
  return String(Math.round(number))
}

function formatUsd(value) {
  const number = Number(value) || 0
  if (number === 0) return '$0'
  if (number < 0.01) return `$${number.toFixed(4)}`
  if (number < 1) return `$${number.toFixed(3)}`
  return `$${number.toFixed(2)}`
}

function formatCny(value) {
  const number = Number(value) || 0
  if (number === 0) return '¥0'
  if (number < 0.01) return `¥${number.toFixed(3)}`
  return `¥${number.toFixed(2)}`
}

function newReviewer(id, index, target = 'zh-CN') {
  return {
    id,
    name: `${LOCALE.reviewerDefault} ${index}`,
    text: '',
    target,
    result: null,
  }
}

function reviewerBadge(name) {
  const number = /^(?:Reviewer|审稿人)\s*(\d+)/i.exec(String(name ?? ''))
  return number ? `R${number[1]}` : String(name || 'R').slice(0, 8)
}

function clampZoom(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(3, Math.max(0.5, number)) : 1
}

function parseGlossary(text) {
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function mathHtml(latex, display, env) {
  try {
    return katex.renderToString(prepareMath(latex, env), {
      output: 'mathml',
      displayMode: Boolean(display),
      throwOnError: true,
      strict: false,
      trust: false,
      macros: MATH_MACROS,
    })
  } catch {
    return null
  }
}

function MathSpan({ latex, display, env }) {
  const html = mathHtml(latex, display, env)
  if (!html) {
    return (
      <span className={display ? 'pt-math-error display' : 'pt-math-error'} title={latex}>
        <code>{latex}</code>
      </span>
    )
  }
  return <span className={display ? 'pt-math display' : 'pt-math'} dangerouslySetInnerHTML={{ __html: html }} />
}

function RichText({ text, placeholders }) {
  const map = new Map((placeholders ?? []).map((item) => [item.token, item]))
  const parts = String(text ?? '').split(/(⟦[A-Z]\d+⟧)/g)
  return parts.map((part, index) => {
    const placeholder = map.get(part)
    if (!placeholder) return part
    if (placeholder.type === 'M') return <MathSpan key={index} latex={placeholder.latex} display={placeholder.display} />
    if (placeholder.type === 'C') {
      return <span key={index} className="pt-chip" title={placeholder.key}>[{placeholder.key ?? 'cite'}]</span>
    }
    if (placeholder.type === 'R') {
      return <span key={index} className="pt-chip" title={placeholder.key}>↗ {placeholder.key ?? 'ref'}</span>
    }
    if (placeholder.type === 'U') {
      return <a key={index} className="pt-link" href={placeholder.url} target="_blank" rel="noreferrer">{placeholder.url}</a>
    }
    return <span key={index} className="pt-chip">{part}</span>
  })
}

function Batches(blocks, maxBlocks = 4, maxChars = 2400) {
  const batches = []
  let current = []
  let chars = 0
  for (const block of blocks) {
    const size = block.text?.length ?? 0
    if (current.length > 0 && (current.length >= maxBlocks || chars + size > maxChars)) {
      batches.push(current)
      current = []
      chars = 0
    }
    current.push(block)
    chars += size
  }
  if (current.length > 0) batches.push(current)
  return batches
}


window.__ModuleLoader__.load({
  id: '@local/paper-translator',
  factory(require) {
    React = require('react')
    const { useCallback, useEffect, useMemo, useRef, useState } = React

function SidebarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="3.5" width="8" height="17" rx="1.6" />
      <rect x="13.5" y="3.5" width="8" height="17" rx="1.6" />
      <path d="M5 7h3M5 10h3M5 13h3M16 7h3M16 10h3M16 13h3" opacity=".55" />
    </svg>
  )
}


    function ProgressRing({ done, total }) {
      const pct = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0
      const length = 2 * Math.PI * 7.5
      return (
        <svg className="pt-ring" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" fill="none" stroke="var(--dsw-alias-border-l2, #d1d5db)" strokeWidth="2.5" />
          <circle
            cx="10" cy="10" r="7.5" fill="none" stroke="var(--dsw-alias-brand-primary, #2563eb)" strokeWidth="2.5"
            strokeLinecap="round" strokeDasharray={`${length * pct} ${length}`} transform="rotate(-90 10 10)"
          />
        </svg>
      )
    }

    function CommandBar(props) {
      const {
        project, view, onView, texFiles, mainInput, onMainChange,
        progress, health, loading, compileRunning, picking,
        onRetranslate, onCompile, onRebuttal, onSettings,
        onPick, onScan, onOpen, rootInput, onRootChange, recent, onOpenRecent, onNextPending,
        onChangeProject,
      } = props
      const [menu, setMenu] = useState(null)
      const barRef = useRef(null)
      useEffect(() => {
        if (!menu) return undefined
        const onDown = (event) => { if (!barRef.current?.contains(event.target)) setMenu(null) }
        const onKey = (event) => { if (event.key === 'Escape') setMenu(null) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [menu])
      const failed = progress.failed || 0
      const toggle = (name) => setMenu((current) => (current === name ? null : name))
      return (
        <div className="pt-cmdbar" ref={barRef}>
          <button
            className="pt-btn pt-icon-btn pt-back"
            title={LOCALE.backToChat} aria-label={LOCALE.backToChat}
            onClick={() => { if (typeof LAYOUT?.selectPanel === 'function') LAYOUT.selectPanel(null) }}
          >←</button>
          <button
            className={menu === 'project' ? 'pt-proj on' : 'pt-proj'}
            aria-haspopup="menu" aria-expanded={menu === 'project'}
            title={project?.root || LOCALE.noProject}
            onClick={() => toggle('project')}
          >
            <SidebarIcon />
            <span className="pt-proj-name">{project ? (project.title || project.mainFile) : LOCALE.emptyTitle}</span>
            <span className="pt-caret" aria-hidden="true">▾</span>
          </button>
          {project && texFiles.length > 1 ? (
            <select className="pt-input pt-mainfile" value={mainInput} onChange={(event) => onMainChange(event.target.value)} aria-label={LOCALE.main}>
              {texFiles.map((file) => <option key={file} value={file}>{file}</option>)}
            </select>
          ) : null}
          {project ? (
            <div className="pt-viewseg" role="group" aria-label={LOCALE.mode}>
              {[['split', LOCALE.split], ['translation', LOCALE.translation], ['source', LOCALE.source], ['pdf', LOCALE.pdf]].map(([id, label]) => (
                <button key={id} className={view === id ? 'on' : ''} aria-pressed={view === id} onClick={() => onView(id)}>{label}</button>
              ))}
            </div>
          ) : null}
          <div className="pt-spacer" />
          {health && !health.ok ? (
            <span className="pt-chip warn" title={health.error || ''}>{LOCALE.model}: {health.model || '—'}</span>
          ) : null}
          {project ? (
            <button className="pt-stat" onClick={onNextPending} title={`${LOCALE.cached} ${progress.cached} · ${LOCALE.untranslated} ${progress.pending} · ${failed} ${LOCALE.failedShort}`}>
              <ProgressRing done={progress.done} total={progress.total} />
              <span>{progress.done}/{progress.total}</span>
              {progress.pending > 0 ? <span className="pt-spin" /> : null}
              {failed ? <span className="pt-stat-err">{failed}</span> : null}
            </button>
          ) : null}
          {project ? <button className="pt-btn" disabled={progress.pending > 0} onClick={onRetranslate}>{LOCALE.retranslateAll}</button> : null}
          {project ? <button className="pt-btn" disabled={compileRunning} onClick={onCompile} title={LOCALE.compile}>{compileRunning ? LOCALE.compileRunning : LOCALE.compile}</button> : null}
          <button
            className={menu === 'more' ? 'pt-btn pt-icon-btn pt-more on' : 'pt-btn pt-icon-btn pt-more'}
            aria-label={LOCALE.more} aria-haspopup="menu" aria-expanded={menu === 'more'}
            onClick={() => toggle('more')}
          >⋯</button>
          {menu === 'project' ? (
            <div className="pt-menu pt-menu-left" role="menu">
              <div className="pt-menu-title">{LOCALE.recent}</div>
              {recent.length ? recent.map((item) => (
                <button key={`${item.root}|${item.main}`} className="pt-menu-item" role="menuitem" onClick={() => { setMenu(null); onOpenRecent(item) }} title={item.root}>
                  <span className="pt-menu-item-title">{item.title || item.main}</span>
                  <span className="pt-menu-item-sub">{item.root}</span>
                </button>
              )) : <div className="pt-menu-empty">{LOCALE.noRecent}</div>}
              <div className="pt-menu-sep" />
              <button className="pt-menu-item" role="menuitem" disabled={picking} onClick={() => { setMenu(null); onPick() }}>
                {picking ? LOCALE.picking : LOCALE.openProject}
              </button>
              {!project ? (
                <>
                  <div className="pt-menu-sep" />
                  <div className="pt-menu-form">
                    <input
                      className="pt-input" value={rootInput} placeholder={LOCALE.project}
                      onChange={(event) => onRootChange(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') { setMenu(null); onOpen() } }}
                    />
                    <div className="pt-menu-row">
                      <button className="pt-btn" onClick={() => { setMenu(null); onScan() }}>{LOCALE.scan}</button>
                      <button className="pt-btn pt-btn-primary" disabled={loading || !rootInput.trim()} onClick={() => { setMenu(null); onOpen() }}>{LOCALE.open}</button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          {menu === 'more' ? (
            <div className="pt-menu pt-menu-right" role="menu">
              {project ? <button className="pt-menu-item" role="menuitem" onClick={() => { setMenu(null); onRebuttal() }}>{LOCALE.rebuttal}</button> : null}
              {project ? <button className="pt-menu-item" role="menuitem" onClick={() => { setMenu(null); onSettings() }}>{LOCALE.settings}</button> : null}
              <div className="pt-menu-sep" />
              <button className="pt-menu-item" role="menuitem" disabled={picking} onClick={() => { setMenu(null); (project ? onChangeProject : onPick)() }}>{project ? LOCALE.changeProject : LOCALE.openProject}</button>
            </div>
          ) : null}
        </div>
      )
    }

    function Pane(props) {
      const { title, tools, children } = props
      return (
        <div className="pt-pane">
          <div className="pt-pane-head">
            <span className="pt-label">{title}</span>
            {tools ?? null}
          </div>
          {children}
        </div>
      )
    }

    function TranslationPane(props) {
      const { blocks, translations, activeId, origin, onSelect, onVisible, onRetry, onEdit, rebuttalPins, onRebuttal } = props
      const scrollRef = useRef(null)
      const frameRef = useRef(0)
      const lastRef = useRef('')

      useEffect(() => {
        if (!activeId || !scrollRef.current || origin === 'translation') return
        const node = scrollRef.current.querySelector(`[data-block-id="${activeId}"]`)
        if (!node) return
        const box = scrollRef.current.getBoundingClientRect()
        const rect = node.getBoundingClientRect()
        if (rect.top < box.top + 40 || rect.bottom > box.bottom - 40) {
          node.scrollIntoView({ block: 'center' })
        }
      }, [activeId])

      const handleScroll = () => {
        if (frameRef.current) return
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = 0
          const container = scrollRef.current
          if (!container) return
          const nodes = container.querySelectorAll('[data-block-id]')
          const top = container.getBoundingClientRect().top + 48
          for (const node of nodes) {
            if (node.getBoundingClientRect().bottom > top) {
              const id = node.getAttribute('data-block-id')
              if (id && id !== lastRef.current) {
                lastRef.current = id
                onVisible(id)
              }
              break
            }
          }
        })
      }

      return (
        <div className="pt-scroll" ref={scrollRef} onScroll={handleScroll}>
          {blocks.map((block) => {
            if (block.kind === 'math') {
              return (
                <div className="pt-block math" key={block.id} data-block-id={block.id}>
                  <MathSpan latex={block.latex} env={block.env} display />
                </div>
              )
            }
            const state = translations[block.id]
            const status = state?.status ?? 'idle'
            const text = state?.text ?? block.text
            const classes = ['pt-block']
            if (block.id === activeId) classes.push('active')
            if (status === 'pending' || status === 'idle') classes.push('pending')
            if (status === 'error') classes.push('failed')
            if (block.kind === 'heading') classes.push('heading')
            return (
              <article
                className={classes.join(' ')}
                key={block.id}
                data-block-id={block.id}
                onClick={() => onSelect(block.id)}
                onDoubleClick={(event) => { event.stopPropagation(); onEdit(block, 'zh') }}
              >
                {block.kind === 'heading' ? (
                  block.level <= 2 ? <h2><RichText text={text} placeholders={block.placeholders} /></h2>
                    : block.level === 3 ? <h3><RichText text={text} placeholders={block.placeholders} /></h3>
                      : <h4><RichText text={text} placeholders={block.placeholders} /></h4>
                ) : block.kind === 'caption' ? (
                  <div className="pt-caption">
                    <span className="pt-caption-label">{block.label || 'Caption'}</span>
                    <RichText text={text} placeholders={block.placeholders} />
                  </div>
                ) : (
                  <p><RichText text={text} placeholders={block.placeholders} /></p>
                )}
                {rebuttalPins?.[block.id]?.length ? (
                  <div className="pt-rebuttal-pins">
                    {rebuttalPins[block.id].map((pin) => (
                      <button
                        key={`${pin.reviewerId}-${pin.number}`}
                        className="pt-rebuttal-pin"
                        title={`${pin.reviewerName} · ${LOCALE.rebuttal}: ${pin.number}`}
                        onClick={(event) => { event.stopPropagation(); onRebuttal(block.id, pin.reviewerId) }}
                      >
                        {reviewerBadge(pin.reviewerName)}·{pin.number}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="pt-block-tools">
                  <button className="pt-btn pt-mini" onClick={(event) => { event.stopPropagation(); onEdit(block, 'zh') }}>{LOCALE.edit}</button>
                </div>
                {status === 'error' ? (
                  <div className="pt-block-meta">
                    <span className="pt-error-text">{LOCALE.failed}: {state?.error || 'unknown'}</span>
                    <button className="pt-btn pt-mini" onClick={(event) => { event.stopPropagation(); onRetry(block.id) }}>{LOCALE.retry}</button>
                  </div>
                ) : null}
                {status === 'pending' || status === 'idle' ? (
                  <div className="pt-block-meta"><span className="pt-spin" /> {LOCALE.translating}</div>
                ) : null}
              </article>
            )
          })}
        </div>
      )
    }

    function SourcePane(props) {
      const { source, blocks, activeId, origin, onSelect, onVisible, onEdit, rebuttalPins, onRebuttal } = props
      const lines = useMemo(() => String(source ?? '').split('\n'), [source])
      const active = blocks.find((block) => block.id === activeId)
      const scrollRef = useRef(null)
      const frameRef = useRef(0)

      useEffect(() => {
        if (!active || !scrollRef.current || origin === 'source') return
        const node = scrollRef.current.querySelector(`[data-line="${active.line}"]`)
        if (node) node.scrollIntoView({ block: 'center' })
      }, [activeId])

      const handleScroll = () => {
        if (frameRef.current) return
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = 0
          const container = scrollRef.current
          if (!container) return
          const line = Math.max(1, Math.floor((container.scrollTop + 60) / 20))
          const block = blocks.find((item) => line >= item.line && line <= item.endLine)
          if (block) onVisible(block.id)
        })
      }

      return (
        <div className="pt-scroll" ref={scrollRef} onScroll={handleScroll} style={{ padding: '0 12px' }}>
          <div className="pt-src">
            {lines.map((line, index) => {
              const number = index + 1
              const isActive = active && number >= active.line && number <= active.endLine
              const lineBlock = blocks.find((item) => number >= item.line && number <= item.endLine)
              const pinNumbers = lineBlock && number === lineBlock.line ? rebuttalPins?.[lineBlock.id] : null
              return (
                <div
                  className={isActive ? 'pt-src-line active' : 'pt-src-line'}
                  key={number}
                  data-line={number}
                  onClick={() => {
                    if (lineBlock) onSelect(lineBlock.id)
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault()
                    if (lineBlock && lineBlock.translatable) onEdit(lineBlock, 'en')
                  }}
                >
                  <span className="pt-src-no">{number}</span>
                  <span className="pt-src-text">{line || ' '}</span>
                  {pinNumbers?.length ? (
                    <button
                      className="pt-src-rebuttal"
                      onClick={(event) => { event.stopPropagation(); onRebuttal(lineBlock.id, pinNumbers[0].reviewerId) }}
                    >
                      {pinNumbers.map((pin) => `${reviewerBadge(pin.reviewerName)}·${pin.number}`).join(' ')}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    function PdfPage(props) {
      const { pdfDoc, pageNumber, active, containerRef, containerWidth, zoom } = props
      const wrapperRef = useRef(null)
      const canvasRef = useRef(null)
      const [visible, setVisible] = useState(false)
      const [error, setError] = useState('')
      const [height, setHeight] = useState(620)
      const [pageWidth, setPageWidth] = useState(0)

      useEffect(() => {
        const node = wrapperRef.current
        if (!node) return
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
        }, { root: containerRef.current, rootMargin: '800px 0px' })
        observer.observe(node)
        return () => observer.disconnect()
      }, [containerRef])

      useEffect(() => {
        if (!visible || !pdfDoc) return
        let cancelled = false
        let task = null
        ;(async () => {
          try {
            const page = await pdfDoc.getPage(pageNumber)
            if (cancelled) return
            const base = page.getViewport({ scale: 1 })
            const available = Math.max(240, (containerWidth || containerRef.current?.clientWidth || 860) - 28)
            const scale = Math.max(0.15, Math.min(6, (available / base.width) * zoom))
            const viewport = page.getViewport({ scale })
            const canvas = canvasRef.current
            if (!canvas) return
            const ratio = Math.min(2, window.devicePixelRatio || 1, Math.max(1, 3000 / Math.max(1, viewport.width)))
            canvas.width = Math.floor(viewport.width * ratio)
            canvas.height = Math.floor(viewport.height * ratio)
            canvas.style.width = `${Math.round(viewport.width)}px`
            canvas.style.height = 'auto'
            const context = canvas.getContext('2d', { alpha: false })
            const renderParams = { canvasContext: context, viewport }
            if (ratio !== 1) renderParams.transform = [ratio, 0, 0, ratio, 0, 0]
            task = page.render(renderParams)
            await task.promise
            setHeight(Math.round(viewport.height))
            setPageWidth(Math.round(viewport.width))
          } catch (renderError) {
            if (!cancelled) setError(renderError?.message || String(renderError))
          }
        })()
        return () => {
          cancelled = true
          try {
            task?.cancel()
          } catch {
            // ignore
          }
        }
      }, [visible, pdfDoc, pageNumber, zoom, containerWidth, containerRef])

      return (
        <div
          className={active ? 'pt-pdf-page active' : 'pt-pdf-page'}
          data-we-surface-preserve
          ref={wrapperRef}
          style={{ minHeight: height, width: pageWidth ? `${pageWidth}px` : '100%', maxWidth: 'none' }}
          data-page={pageNumber}
        >
          {error ? <div className="pt-banner err">{LOCALE.pdfFailed}: {error}</div> : null}
          <canvas ref={canvasRef} />
          <span className="pt-pdf-no">{pageNumber}</span>
        </div>
      )
    }

    function PdfPane(props) {
      const { pdfDoc, pdfPages, activePage, origin, onVisiblePage, zoom, onZoom } = props
      const scrollRef = useRef(null)
      const frameRef = useRef(0)
      const lastRef = useRef(0)
      const [containerWidth, setContainerWidth] = useState(0)

      useEffect(() => {
        const node = scrollRef.current
        if (!node) return undefined
        let frame = 0
        const measure = () => {
          frame = 0
          setContainerWidth(node.clientWidth)
        }
        let observer = null
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => {
            if (!frame) frame = requestAnimationFrame(measure)
          })
          observer.observe(node)
        }
        measure()
        window.addEventListener('resize', measure)
        return () => {
          observer?.disconnect()
          window.removeEventListener('resize', measure)
          if (frame) cancelAnimationFrame(frame)
        }
      }, [pdfDoc, pdfPages])

      const handleScroll = () => {
        if (frameRef.current) return
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = 0
          const container = scrollRef.current
          if (!container) return
          const children = [...container.querySelectorAll('[data-page]')]
          const top = container.getBoundingClientRect().top + 80
          for (const node of children) {
            if (node.getBoundingClientRect().bottom > top) {
              const page = Number(node.getAttribute('data-page'))
              if (page && page !== lastRef.current) {
                lastRef.current = page
                onVisiblePage(page)
              }
              break
            }
          }
        })
      }

      useEffect(() => {
        const node = scrollRef.current
        if (!node) return undefined
        const handleWheel = (event) => {
          if (!(event.ctrlKey || event.metaKey)) return
          event.preventDefault()
          event.stopPropagation()
          const factor = Math.min(1.3, Math.max(0.77, Math.exp(-event.deltaY * 0.002)))
          onZoom(zoom * factor)
        }
        node.addEventListener('wheel', handleWheel, { passive: false })
        let gestureStartZoom = null
        const handleGestureStart = (event) => {
          gestureStartZoom = zoom
          event.preventDefault()
        }
        const handleGestureChange = (event) => {
          if (gestureStartZoom == null) return
          event.preventDefault()
          onZoom(gestureStartZoom * (event.scale || 1))
        }
        const handleGestureEnd = (event) => {
          gestureStartZoom = null
          event.preventDefault()
        }
        node.addEventListener('gesturestart', handleGestureStart, { passive: false })
        node.addEventListener('gesturechange', handleGestureChange, { passive: false })
        node.addEventListener('gestureend', handleGestureEnd, { passive: false })
        return () => {
          node.removeEventListener('wheel', handleWheel)
          node.removeEventListener('gesturestart', handleGestureStart)
          node.removeEventListener('gesturechange', handleGestureChange)
          node.removeEventListener('gestureend', handleGestureEnd)
        }
      }, [zoom, onZoom])

      useEffect(() => {
        if (!activePage || !scrollRef.current || origin === 'pdf') return
        const node = scrollRef.current.querySelector(`[data-page="${activePage}"]`)
        if (!node) return
        const box = scrollRef.current.getBoundingClientRect()
        const rect = node.getBoundingClientRect()
        if (rect.top < box.top + 30 || rect.bottom > box.bottom - 30) node.scrollIntoView({ block: 'start' })
      }, [activePage])

      if (!pdfDoc) {
        return <div className="pt-empty"><p>{LOCALE.noPdf}</p></div>
      }
      return (
        <div className="pt-pdf-shell">
          <div className="pt-pdf-zoom" role="group" aria-label="PDF zoom">
            <button title={LOCALE.zoomOut} aria-label={LOCALE.zoomOut} onClick={() => onZoom(zoom / 1.1)}>−</button>
            <button className="pct" title={LOCALE.fitWidth} aria-label={LOCALE.fitWidth} onClick={() => onZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button title={LOCALE.zoomIn} aria-label={LOCALE.zoomIn} onClick={() => onZoom(zoom * 1.1)}>+</button>
          </div>
          <div className="pt-scroll pt-pdf" ref={scrollRef} onScroll={handleScroll}>
            {Array.from({ length: pdfPages }, (_, index) => (
              <PdfPage
                key={index + 1}
                pdfDoc={pdfDoc}
                pageNumber={index + 1}
                active={activePage === index + 1}
                containerRef={scrollRef}
                containerWidth={containerWidth}
                zoom={zoom}
              />
            ))}
          </div>
        </div>
      )
    }

    function SettingsDrawer(props) {
      const { target, setTarget, glossaryText, setGlossaryText, onClose, onClear, onClearAll, usage, globalUsage } = props
      return (
        <aside className="pt-dock" aria-label={LOCALE.settings} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
            <h3>{LOCALE.settings}</h3>
            <label>{LOCALE.target}</label>
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="zh-CN">简体中文</option>
              <option value="zh-TW">繁體中文</option>
              <option value="en">English</option>
            </select>
            <label>{LOCALE.glossary}</label>
            <textarea value={glossaryText} onChange={(event) => setGlossaryText(event.target.value)} placeholder={LOCALE.glossaryHint} />
            <div className="pt-usage-card">
              <div className="pt-usage-title">{LOCALE.usage}</div>
              <div>{LOCALE.usageInput}: {(usage.input ?? 0).toLocaleString()} · {LOCALE.usageOutput}: {(usage.output ?? 0).toLocaleString()}</div>
              <div>{LOCALE.usageCacheHit}: {(usage.cacheRead ?? 0).toLocaleString()} · {LOCALE.usageCacheWrite}: {(usage.cacheWrite ?? 0).toLocaleString()} · {LOCALE.usageCalls}: {usage.calls ?? 0}</div>
              <div>{LOCALE.usageCost}: {formatUsd(usage.costUsd)} / {formatCny(usage.costCny ?? (usage.costUsd ?? 0) * 7.2)}</div>
              <div className="pt-muted" style={{ fontSize: 11, lineHeight: 1.5 }}>{LOCALE.usageNote}</div>
            </div>
            <div className="pt-usage-card">
              <div className="pt-usage-title">{LOCALE.globalUsageLabel}</div>
              <div>{LOCALE.usageInput}: {(globalUsage.input ?? 0).toLocaleString()} · {LOCALE.usageOutput}: {(globalUsage.output ?? 0).toLocaleString()}</div>
              <div>{LOCALE.usageCacheHit}: {(globalUsage.cacheRead ?? 0).toLocaleString()} · {LOCALE.usageCacheWrite}: {(globalUsage.cacheWrite ?? 0).toLocaleString()} · {LOCALE.usageCalls}: {globalUsage.calls ?? 0}</div>
              <div>{LOCALE.usageCost}: {formatUsd(globalUsage.costUsd)} / {formatCny(globalUsage.costCny ?? (globalUsage.costUsd ?? 0) * 7.2)}</div>
              <div className="pt-muted" style={{ fontSize: 11, lineHeight: 1.5 }}>{LOCALE.globalUsageNote}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="pt-btn" onClick={onClear}>{LOCALE.clearCache}</button>
              <button className="pt-btn" onClick={onClearAll}>{LOCALE.clearAll}</button>
              <button className="pt-btn pt-btn-primary" onClick={onClose}>{LOCALE.close}</button>
            </div>
        </aside>
      )
    }


    function RebuttalDrawer(props) {
      const {
        reviewers, activeId, view, onSelectView, onAddReviewer, onRemoveReviewer,
        overview, busy, overviewBusy, error, overviewError,
        onUpdate, onRun, onClear, onRunOverview, onClose, onLocate, blocks,
      } = props
      const activeReviewer = reviewers.find((reviewer) => reviewer.id === activeId) ?? reviewers[0] ?? null
      const result = activeReviewer?.result ?? null
      const blockById = useMemo(() => new Map((blocks ?? []).map((block) => [block.id, block])), [blocks])
      const reviewerById = useMemo(() => new Map((reviewers ?? []).map((reviewer) => [reviewer.id, reviewer])), [reviewers])
      const numberById = useMemo(
        () => new Map((result?.matches ?? []).map((match, index) => [match.id, index + 1])),
        [result],
      )
      const matchById = useMemo(
        () => new Map((result?.matches ?? []).map((match) => [match.id, match])),
        [result],
      )
      const paragraphs = useMemo(() => {
        const groups = []
        for (const segment of result?.segments ?? []) {
          const index = Number.isInteger(segment.paragraph) ? Math.max(0, segment.paragraph - 1) : 0
          while (groups.length <= index) groups.push([])
          groups[index].push(segment)
        }
        return groups
      }, [result])
      const attitudeLabel = {
        positive: LOCALE.attitudePositive,
        neutral: LOCALE.attitudeNeutral,
        negative: LOCALE.attitudeNegative,
        mixed: LOCALE.attitudeMixed,
      }
      const canRun = Boolean(activeReviewer?.text?.trim())
      const canOverview = reviewers.some((reviewer) => reviewer.text?.trim())

      const renderResult = () => {
        if (!result) return null
        return (
          <div className="pt-rebuttal-result">
            <h4>{LOCALE.rebuttalTranslation}</h4>
            <div className="pt-rebuttal-paragraphs">
              {paragraphs.map((segments, paragraphIndex) => (
                <p className="pt-rebuttal-paragraph" key={paragraphIndex}>
                  {segments.map((segment, index) => {
                    const match = segment.matchId ? matchById.get(segment.matchId) : null
                    if (!match) return <span key={index}>{segment.text}</span>
                    const number = numberById.get(match.id)
                    const block = blockById.get(match.blockId)
                    return (
                      <mark
                        key={index}
                        className="pt-rebuttal-mark"
                        title={`${LOCALE.rebuttalLocate}: ${block?.section || block?.kind || match.blockId}`}
                        onClick={() => onLocate(match)}
                      >
                        {segment.text}
                        <sup>{number}</sup>
                      </mark>
                    )
                  })}
                </p>
              ))}
            </div>
            <h4>{LOCALE.rebuttalMatches}</h4>
            {(result.matches ?? []).length === 0 ? (
              <div className="pt-muted">{LOCALE.rebuttalNoMatches}</div>
            ) : (
              <div className="pt-rebuttal-matches">
                {result.matches.map((match, index) => {
                  const block = blockById.get(match.blockId)
                  return (
                    <button
                      type="button"
                      className="pt-rebuttal-match"
                      key={match.id}
                      onClick={() => onLocate(match)}
                    >
                      <span className="pt-rebuttal-num">{index + 1}</span>
                      <span className="pt-rebuttal-match-body">
                        <span className="pt-rebuttal-quote">{LOCALE.rebuttalQuote}: {match.quote}</span>
                        <span className="pt-rebuttal-original">
                          {block?.section ? `${block.section} · ` : ''}{String(block?.text ?? '').slice(0, 260)}
                        </span>
                        {match.reason ? <span className="pt-rebuttal-reason">{LOCALE.rebuttalReason}: {match.reason}</span> : null}
                        <span className="pt-rebuttal-locate">{LOCALE.rebuttalLocate} →</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      }

      const renderOverview = () => (
        <div className="pt-overview">
          <div className="pt-rebuttal-controls">
            <span className="pt-muted pt-rebuttal-hint">
              {LOCALE.overviewEmpty}
            </span>
            <div className="pt-spacer" />
            <button
              className="pt-btn pt-btn-primary"
              disabled={busy || overviewBusy || !canOverview}
              onClick={onRunOverview}
            >
              {overviewBusy ? LOCALE.overviewRunning : LOCALE.overviewRun}
            </button>
          </div>
          {overviewError ? <div className="pt-banner err">{LOCALE.overviewFailed}: {overviewError}</div> : null}
          {overview ? (
            <>
              <h4>{LOCALE.overviewSummary}</h4>
              <p className="pt-overview-summary">{overview.summary}</p>

              <h4>{LOCALE.overviewAttitudes}</h4>
              <div className="pt-attitudes">
                {(overview.reviewers ?? []).map((item) => {
                  const reviewer = reviewerById.get(item.id)
                  return (
                    <div className={`pt-attitude ${item.attitude}`} key={item.id}>
                      <div className="pt-attitude-head">
                        <button className="pt-overview-reviewer" onClick={() => onSelectView(item.id)}>
                          {reviewer?.name ?? item.id}
                        </button>
                        <span className={`pt-attitude-badge ${item.attitude}`}>{attitudeLabel[item.attitude] ?? item.attitude}</span>
                        <span className="pt-attitude-score">{item.score > 0 ? `+${item.score}` : item.score}</span>
                      </div>
                      <p>{item.summary}</p>
                      {item.evidence?.length ? (
                        <ul>
                          {item.evidence.map((quote, index) => <li key={index}>{quote}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <h4>{LOCALE.overviewOverlaps}</h4>
              {(overview.overlaps ?? []).length === 0 ? (
                <div className="pt-muted">{LOCALE.overviewNoneOverlap}</div>
              ) : (
                <div className="pt-overview-groups">
                  {overview.overlaps.map((group) => (
                    <div className="pt-overview-group" key={group.id}>
                      <div className="pt-overview-group-head">
                        <strong>{group.title}</strong>
                        <span className={`pt-severity ${group.severity}`}>
                          {group.severity === 'major' ? LOCALE.severityMajor : LOCALE.severityMinor}
                        </span>
                      </div>
                      <div className="pt-overview-reviewers">
                        {group.reviewerIds.map((id) => (
                          <button className="pt-overview-reviewer" key={id} onClick={() => onSelectView(id)}>
                            {reviewerById.get(id)?.name ?? id}
                          </button>
                        ))}
                      </div>
                      <p>{group.summary}</p>
                      {group.quotes?.length ? (
                        <ul>
                          {group.quotes.map((quote, index) => (
                            <li key={index}><b>{reviewerById.get(quote.reviewerId)?.name ?? quote.reviewerId}:</b> {quote.text}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              <h4>{LOCALE.overviewUnique}</h4>
              {(overview.unique ?? []).length === 0 ? (
                <div className="pt-muted">{LOCALE.overviewNoneUnique}</div>
              ) : (
                <div className="pt-overview-groups">
                  {overview.unique.map((group) => (
                    <div className="pt-overview-group" key={group.id}>
                      <div className="pt-overview-group-head">
                        <strong>{group.title}</strong>
                        <span className={`pt-severity ${group.severity}`}>
                          {group.severity === 'major' ? LOCALE.severityMajor : LOCALE.severityMinor}
                        </span>
                      </div>
                      <div className="pt-overview-reviewers">
                        <button className="pt-overview-reviewer" onClick={() => onSelectView(group.reviewerId)}>
                          {reviewerById.get(group.reviewerId)?.name ?? group.reviewerId}
                        </button>
                      </div>
                      <p>{group.summary}</p>
                      {group.quote ? <blockquote>{group.quote}</blockquote> : null}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="pt-muted">{LOCALE.overviewEmpty}</div>
          )}
        </div>
      )

      return (
        <aside
          className="pt-dock pt-dock-wide"
          aria-label={LOCALE.rebuttal}
          onKeyDown={(event) => { if (event.key === 'Escape' && !busy && !overviewBusy) onClose() }}
        >
            <div className="pt-rebuttal-head">
              <h3>{LOCALE.rebuttalTitle}</h3>
              <button className="pt-btn pt-mini" disabled={busy || overviewBusy} onClick={onClose}>×</button>
            </div>
            <div className="pt-rebuttal-tabs">
              {reviewers.map((reviewer) => (
                <button
                  key={reviewer.id}
                  className={view === reviewer.id ? 'on' : ''}
                  disabled={busy || overviewBusy}
                  onClick={() => onSelectView(reviewer.id)}
                >
                  {reviewer.name}
                </button>
              ))}
              <button
                className={view === 'overview' ? 'on' : ''}
                disabled={busy || overviewBusy}
                onClick={() => onSelectView('overview')}
              >
                {LOCALE.rebuttalOverview}
              </button>
              <button
                className="pt-rebuttal-add"
                disabled={busy || overviewBusy || reviewers.length >= 8}
                onClick={onAddReviewer}
              >
                {LOCALE.addReviewer}
              </button>
            </div>

            <div className="pt-rebuttal-body">
            {view === 'overview' ? renderOverview() : activeReviewer ? (
              <>
                <label className="pt-rebuttal-name">
                  {LOCALE.reviewerName}
                  <input
                    value={activeReviewer.name}
                    disabled={busy || overviewBusy}
                    onChange={(event) => onUpdate(activeReviewer.id, { name: event.target.value })}
                  />
                </label>
                <textarea
                  className="pt-rebuttal-input"
                  value={activeReviewer.text}
                  disabled={busy || overviewBusy}
                  autoFocus
                  placeholder={LOCALE.rebuttalPlaceholder}
                  onChange={(event) => onUpdate(activeReviewer.id, { text: event.target.value })}
                  onInput={(event) => onUpdate(activeReviewer.id, { text: event.currentTarget.value })}
                />
                <div className="pt-rebuttal-controls">
                  <label>
                    {LOCALE.rebuttalTarget}
                    <select
                      value={activeReviewer.target}
                      disabled={busy || overviewBusy}
                      onChange={(event) => onUpdate(activeReviewer.id, { target: event.target.value })}
                    >
                      <option value="zh-CN">简体中文</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                  <span className="pt-muted pt-rebuttal-hint">{LOCALE.rebuttalHint}</span>
                  <div className="pt-spacer" />
                  {reviewers.length > 1 ? (
                    <button className="pt-btn" disabled={busy || overviewBusy} onClick={() => onRemoveReviewer(activeReviewer.id)}>{LOCALE.removeReviewer}</button>
                  ) : null}
                  <button className="pt-btn" disabled={busy || overviewBusy || !activeReviewer.text.trim()} onClick={() => onClear(activeReviewer.id)}>{LOCALE.rebuttalClear}</button>
                  <button className="pt-btn pt-btn-primary" disabled={busy || overviewBusy || !canRun} onClick={() => onRun(activeReviewer.id)}>
                    {busy ? LOCALE.rebuttalRunning : LOCALE.rebuttalRun}
                  </button>
                </div>
                {error ? <div className="pt-banner err">{LOCALE.rebuttalFailed}: {error}</div> : null}
                {renderResult()}
              </>
            ) : null}
            </div>
        </aside>
      )
    }

    function App() {
      const [health, setHealth] = useState(null)
      const [project, setProject] = useState(null)
      const [blocks, setBlocks] = useState([])
      const [translations, setTranslations] = useState({})
      const [activeId, setActiveId] = useState(null)
      const [origin, setOrigin] = useState('click')
      const [leftMode, setLeftMode] = useState('translation')
      const [rightMode, setRightMode] = useState('source')
      const [view, setView] = useState('split')
      const [manualPath, setManualPath] = useState(false)
      const [usageOpen, setUsageOpen] = useState(false)
      const [recent, setRecent] = useState(() => {
        try {
          const parsed = JSON.parse(localStorage.getItem('paperTranslator.recent') || '[]')
          return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.root === 'string').slice(0, 5) : []
        } catch {
          return []
        }
      })
      const [sync, setSync] = useState(true)
      const [loading, setLoading] = useState(false)
      const [picking, setPicking] = useState(false)
      const [editing, setEditing] = useState(null)
      const [error, setError] = useState('')
      const [status, setStatus] = useState('')
      const [rootInput, setRootInput] = useState(() => localStorage.getItem('paperTranslator.root') || '')
      const [mainInput, setMainInput] = useState(() => localStorage.getItem('paperTranslator.main') || 'main.tex')
      const [texFiles, setTexFiles] = useState([])
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [rebuttalOpen, setRebuttalOpen] = useState(false)
      const [reviewers, setReviewers] = useState(() => [newReviewer('r1', 1, 'zh-CN')])
      const [activeReviewerId, setActiveReviewerId] = useState('r1')
      const [rebuttalView, setRebuttalView] = useState('r1')
      const [rebuttalOverview, setRebuttalOverview] = useState(null)
      const [rebuttalBusy, setRebuttalBusy] = useState(false)
      const [overviewBusy, setOverviewBusy] = useState(false)
      const [rebuttalError, setRebuttalError] = useState('')
      const [overviewError, setOverviewError] = useState('')
      const [target, setTarget] = useState(() => localStorage.getItem('paperTranslator.target') || 'zh-CN')
      const [glossaryText, setGlossaryText] = useState(() => localStorage.getItem('paperTranslator.glossary') || '{}')
      const [usage, setUsage] = useState(EMPTY_USAGE)
      const [globalUsage, setGlobalUsage] = useState(EMPTY_USAGE)
      const [pdfDoc, setPdfDoc] = useState(null)
      const [pdfZoom, setPdfZoom] = useState(() => {
        const saved = Number(localStorage.getItem('paperTranslator.pdfZoom'))
        return Number.isFinite(saved) ? clampZoom(saved) : 1
      })
      const [pdfPages, setPdfPages] = useState(0)
      const [pdfError, setPdfError] = useState('')
      const [compileState, setCompileState] = useState({ running: false, log: '' })
      const [activePage, setActivePage] = useState(1)

      const projectRef = useRef(null)
      const translationsRef = useRef({})
      const queueRef = useRef(new Set())
      const abortRef = useRef(null)
      const lockRef = useRef(0)
      const sigRef = useRef('')
      const refreshRef = useRef(false)
      const pdfDocRef = useRef(null)
      const blocksRef = useRef([])
      const activeIdRef = useRef(null)
      const editingRef = useRef(false)
      const reviewerSeqRef = useRef(2)
      const rebuttalLoadedRef = useRef(null)

      useEffect(() => { translationsRef.current = translations }, [translations])
      useEffect(() => { projectRef.current = project }, [project])
      useEffect(() => {
        if (!project?.projectId || rebuttalLoadedRef.current !== project.projectId) return undefined
        const timer = setTimeout(() => {
          try {
            localStorage.setItem(`paperTranslator.rebuttal.${project.projectId}`, JSON.stringify({
              version: 2,
              reviewers,
              overview: rebuttalOverview,
            }))
          } catch {
            // storage is optional
          }
        }, 250)
        return () => clearTimeout(timer)
      }, [project?.projectId, reviewers, rebuttalOverview])
      useEffect(() => { blocksRef.current = blocks }, [blocks])
      useEffect(() => { activeIdRef.current = activeId }, [activeId])
      useEffect(() => { editingRef.current = Boolean(editing) }, [editing])
      useEffect(() => {
        localStorage.setItem('paperTranslator.pdfZoom', String(pdfZoom))
      }, [pdfZoom])

      const changeZoom = useCallback((next) => {
        setPdfZoom((previous) => clampZoom(typeof next === 'function' ? next(previous) : next))
      }, [])
      useEffect(() => { pdfDocRef.current = pdfDoc }, [pdfDoc])

      useEffect(() => {
        localStorage.setItem('paperTranslator.target', target)
      }, [target])
      useEffect(() => {
        localStorage.setItem('paperTranslator.glossary', glossaryText)
      }, [glossaryText])

      useEffect(() => {
        api('/health').then(setHealth).catch(() => setHealth({ ok: false, model: '', error: 'health failed' }))
        return () => {
          try {
            pdfDocRef.current?.destroy()
          } catch {
            // ignore
          }
          abortRef.current?.abort()
        }
      }, [])

      useEffect(() => {
        if (leftMode !== 'pdf' && rightMode !== 'pdf') return undefined
        const handleKey = (event) => {
          if (!(event.metaKey || event.ctrlKey)) return
          const tag = event.target?.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
          if (event.key === '=' || event.key === '+') {
            event.preventDefault()
            changeZoom((value) => value * 1.1)
          } else if (event.key === '-') {
            event.preventDefault()
            changeZoom((value) => value / 1.1)
          } else if (event.key === '0') {
            event.preventDefault()
            changeZoom(1)
          }
        }
        window.addEventListener('keydown', handleKey, true)
        return () => window.removeEventListener('keydown', handleKey, true)
      }, [leftMode, rightMode, changeZoom])

      const glossary = useMemo(() => parseGlossary(glossaryText), [glossaryText])

      const progress = useMemo(() => {
        const translatable = blocks.filter((block) => block.translatable && block.text)
        let done = 0
        let pending = 0
        let failed = 0
        let cached = 0
        for (const block of translatable) {
          const state = translations[block.id]
          if (state?.status === 'done') {
            done += 1
            if (state.cached) cached += 1
          } else if (state?.status === 'error') {
            failed += 1
          } else if (state?.status === 'pending' || state?.status === 'idle' || !state) {
            pending += 1
          }
        }
        return { total: translatable.length, done, pending, failed, cached }
      }, [blocks, translations])

      const activeBlock = useMemo(() => blocks.find((block) => block.id === activeId) ?? null, [blocks, activeId])
      const activePageDerived = useMemo(() => {
        if (!activeBlock || !pdfPages) return activePage
        const ratio = activeBlock.line / Math.max(1, project?.totalLines ?? 1)
        return Math.max(1, Math.min(pdfPages, Math.round(ratio * pdfPages)))
      }, [activeBlock, pdfPages, project, activePage])

      const loadPdf = useCallback(async (projectId) => {
        try {
          setPdfError('')
          setPdfDoc(null)
          setPdfPages(0)
          const response = await fetch(`/api/paper-translator/pdf?projectId=${encodeURIComponent(projectId)}`, { credentials: 'same-origin' })
          if (!response.ok) throw new Error('PDF ' + response.status)
          const data = await response.arrayBuffer()
          const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false, useWorkerFetch: false }).promise
          try {
            pdfDocRef.current?.destroy()
          } catch {
            // ignore
          }
          pdfDocRef.current = doc
          setPdfDoc(doc)
          setPdfPages(doc.numPages)
        } catch (pdfFailure) {
          setPdfError(pdfFailure?.message || String(pdfFailure))
        }
      }, [])

      const runBatch = useCallback(async (batch, projectId, bypassCache) => {
        const controller = abortRef.current
        try {
          const data = await api('/translate', {
            projectId,
            target,
            glossary,
            bypassCache,
            blocks: batch.map((block) => block.id),
            prevSource: '',
          }, controller?.signal)
          setTranslations((previous) => {
            const next = { ...previous }
            for (const result of data.results ?? []) {
              if (result.error) next[result.id] = { status: 'error', error: result.error }
              else next[result.id] = { status: 'done', text: result.text, cached: Boolean(result.cached) }
            }
            return next
          })
          if (data.globalTotals) setGlobalUsage(data.globalTotals)
          if (data.totals) {
            setUsage(data.totals)
          } else if (data.usage) {
            setUsage((previous) => ({
              input: (previous.input ?? 0) + (data.usage.input ?? 0),
              output: (previous.output ?? 0) + (data.usage.output ?? 0),
              cacheRead: (previous.cacheRead ?? 0) + (data.usage.cacheRead ?? 0),
              cacheWrite: (previous.cacheWrite ?? 0) + (data.usage.cacheWrite ?? 0),
              costUsd: (previous.costUsd ?? 0) + (data.usage.costUsd ?? 0),
              calls: (previous.calls ?? 0) + (data.usage.calls ?? 0),
            }))
          }
        } catch (batchError) {
          if (batchError?.name === 'AbortError') return
          setTranslations((previous) => {
            const next = { ...previous }
            for (const block of batch) next[block.id] = { status: 'error', error: batchError?.message || String(batchError) }
            return next
          })
        }
      }, [target, glossary])

      const queueTranslations = useCallback(async (list, projectId, bypassCache = false) => {
        const pending = list.filter((block) => {
          if (!block.translatable || !block.text) return false
          if (bypassCache) return true
          return !translationsRef.current[block.id]?.text
        })
        const fresh = pending.filter((block) => !queueRef.current.has(block.id))
        if (!fresh.length) return
        for (const block of fresh) queueRef.current.add(block.id)
        setTranslations((previous) => {
          const next = { ...previous }
          for (const block of fresh) {
            if (bypassCache || !next[block.id]?.text) next[block.id] = { status: 'pending' }
          }
          return next
        })
        const batches = Batches(fresh)
        let cursor = 0
        const worker = async () => {
          while (cursor < batches.length) {
            const batch = batches[cursor]
            cursor += 1
            await runBatch(batch, projectId, bypassCache)
            for (const block of batch) queueRef.current.delete(block.id)
          }
        }
        await Promise.all([worker(), worker()])
      }, [runBatch])

      const openProject = useCallback(async (overrideRoot, overrideMain) => {
        const root = (overrideRoot ?? rootInput).trim()
        const main = (overrideMain ?? mainInput).trim() || 'main.tex'
        if (!root) {
          setError(LOCALE.project)
          return
        }
        abortRef.current?.abort()
        abortRef.current = new AbortController()
        setLoading(true)
        setError('')
        setStatus(LOCALE.parsing)
        try {
          const data = await api('/project/open', { root, mainFile: main }, abortRef.current.signal)
          localStorage.setItem('paperTranslator.root', data.root)
          localStorage.setItem('paperTranslator.main', data.mainFile)
          localStorage.setItem('paperTranslator.projectId', data.projectId)
          setRecent((previous) => {
            const entry = { root: data.root, main: data.mainFile, title: data.title || data.mainFile }
            const next = [entry, ...previous.filter((item) => item.root !== entry.root)].slice(0, 5)
            try {
              localStorage.setItem('paperTranslator.recent', JSON.stringify(next))
            } catch {
              // storage may be unavailable; recents stay in memory
            }
            return next
          })
          setRootInput(data.root)
          setMainInput(data.mainFile)
          setTexFiles(data.texFiles ?? [])
          MATH_MACROS = data.mathMacros ?? {}
          setProject(data)
          setBlocks(data.blocks ?? [])
          const initialTranslations = {}
          for (const [id, text] of Object.entries(data.translations ?? {})) {
            if (typeof text === 'string' && text) initialTranslations[id] = { status: 'done', text, cached: true }
          }
          setTranslations(initialTranslations)
          translationsRef.current = initialTranslations
          setUsage(data.usage ?? EMPTY_USAGE)
          setGlobalUsage(data.globalUsage ?? EMPTY_USAGE)
          setRebuttalOpen(false)
          setRebuttalError('')
          setOverviewError('')
          setRebuttalBusy(false)
          setOverviewBusy(false)
          const rebuttalKey = `paperTranslator.rebuttal.${data.projectId}`
          let nextReviewers = [newReviewer('r1', 1, 'zh-CN')]
          let nextOverview = null
          try {
            const saved = JSON.parse(localStorage.getItem(rebuttalKey) || 'null')
            const segmentedResult = (value) => Boolean(
              value
              && Array.isArray(value.segments)
              && value.segments.length > 0
              && value.segments.every((segment) => Number.isInteger(segment.paragraph)),
            )
            const rawList = saved && Array.isArray(saved.reviewers) && saved.reviewers.length
              ? saved.reviewers
              : saved && (typeof saved.text === 'string' || saved.result)
                ? [saved]
                : []
            if (rawList.length) {
              const used = new Set()
              nextReviewers = rawList.slice(0, 8).map((raw, index) => {
                let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `r${index + 1}`
                while (used.has(id)) id = `${id}-${index + 1}`
                used.add(id)
                return {
                  id,
                  name: typeof raw.name === 'string' && raw.name.trim()
                    ? raw.name.trim()
                    : `${LOCALE.reviewerDefault} ${index + 1}`,
                  text: typeof raw.text === 'string' ? raw.text : '',
                  target: raw.target === 'en' ? 'en' : 'zh-CN',
                  result: segmentedResult(raw.result) ? raw.result : null,
                }
              })
            }
            if (saved && saved.overview && typeof saved.overview === 'object') nextOverview = saved.overview
          } catch {
            nextReviewers = [newReviewer('r1', 1, 'zh-CN')]
            nextOverview = null
          }
          setReviewers(nextReviewers)
          rebuttalLoadedRef.current = data.projectId
          setActiveReviewerId(nextReviewers[0].id)
          setRebuttalView(nextReviewers[0].id)
          setRebuttalOverview(nextOverview)
          let maxSeq = 1
          for (const reviewer of nextReviewers) {
            const number = /^r(\d+)$/.exec(reviewer.id)
            if (number) maxSeq = Math.max(maxSeq, Number(number[1]))
          }
          reviewerSeqRef.current = Math.max(maxSeq + 1, nextReviewers.length + 1, 2)
          setActiveId((data.blocks ?? []).find((block) => block.translatable && block.text)?.id ?? null)
          setLeftMode('translation')
          setRightMode(data.pdf?.exists ? 'pdf' : 'source')
          setTexFiles(data.texFiles ?? [])
          sigRef.current = ''
          try {
            const stat = await api(`/stat?projectId=${encodeURIComponent(data.projectId)}`)
            sigRef.current = stat.sig
          } catch {
            // ignore
          }
          if (data.pdf?.exists) await loadPdf(data.projectId)
          else {
            setPdfDoc(null)
            setPdfPages(0)
          }
          setStatus('')
          await queueTranslations(data.blocks ?? [], data.projectId)
        } catch (openError) {
          if (openError?.name === 'AbortError') return
          setError(openError?.message || LOCALE.openFailed)
        } finally {
          setLoading(false)
          setStatus('')
        }
      }, [rootInput, mainInput, loadPdf, queueTranslations])

      const pickDirectory = useCallback(async () => {
        if (picking) return
        setPicking(true)
        setError('')
        try {
          const picked = await api('/directory/pick', {})
          if (!picked || picked.kind !== 'native') {
            setError(picked?.message || LOCALE.pickerUnsupported)
            return
          }
          if (!picked.path) return
          setRootInput(picked.path)
          let main = 'main.tex'
          try {
            const listing = await api('/project/list', { root: picked.path })
            const files = listing.files ?? []
            setTexFiles(files)
            if (!files.length) {
              setError(LOCALE.noTex)
              return
            }
            main = files.find((file) => /(^|\/)main\.tex$/.test(file)) || files[0]
            setMainInput(main)
          } catch (listingError) {
            setError(listingError?.message || String(listingError))
            return
          }
          void openProject(picked.path, main)
        } catch (pickError) {
          if (pickError?.name !== 'AbortError') setError(pickError?.message || String(pickError))
        } finally {
          setPicking(false)
        }
      }, [picking, openProject])

      useEffect(() => {
        const lastRoot = localStorage.getItem('paperTranslator.root')
        const lastMain = localStorage.getItem('paperTranslator.main')
        if (lastRoot) openProject(lastRoot, lastMain || 'main.tex')
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const refreshProject = useCallback(async () => {
        if (editingRef.current) return
        const current = projectRef.current
        if (!current || refreshRef.current) return
        refreshRef.current = true
        try {
          const data = await api('/project/refresh', { projectId: current.projectId })
          MATH_MACROS = data.mathMacros ?? {}
          setProject(data)
          setBlocks(data.blocks ?? [])
          const merged = { ...(translationsRef.current ?? {}) }
          for (const id of data.removed ?? []) delete merged[id]
          for (const [id, text] of Object.entries(data.translations ?? {})) {
            if (!merged[id]?.text && typeof text === 'string' && text) merged[id] = { status: 'done', text, cached: true }
          }
          translationsRef.current = merged
          setTranslations(merged)
          if (data.changed?.length) setStatus(`${LOCALE.fileChanged}: ${data.changed.length}`)
          if (data.pdf?.exists) {
            if (data.pdf.mtime !== current.pdf?.mtime) await loadPdf(data.projectId)
          } else {
            setPdfDoc(null)
            setPdfPages(0)
          }
          await queueTranslations(data.blocks ?? [], data.projectId)
        } catch (refreshError) {
          if (refreshError?.name !== 'AbortError') setError(refreshError?.message || String(refreshError))
        } finally {
          refreshRef.current = false
        }
      }, [loadPdf, queueTranslations])

      useEffect(() => {
        if (!project) return undefined
        const timer = setInterval(async () => {
          if (!projectRef.current || editingRef.current) return
          try {
            const stat = await api(`/stat?projectId=${encodeURIComponent(projectRef.current.projectId)}`)
            if (sigRef.current && stat.sig !== sigRef.current) {
              sigRef.current = stat.sig
              await refreshProject()
            } else if (!sigRef.current) {
              sigRef.current = stat.sig
            }
          } catch {
            // transient network failures are ignored
          }
        }, 2000)
        return () => clearInterval(timer)
      }, [project, refreshProject])

      const selectBlock = useCallback((id) => {
        setOrigin('click')
        setActiveId(id)
        lockRef.current = Date.now() + 200
      }, [])

      const selectView = useCallback((next) => {
        setView(next)
        if (next === 'split') {
          setLeftMode('translation')
          setRightMode((mode) => (mode === 'pdf' ? 'pdf' : 'source'))
          return
        }
        setLeftMode(next)
        setRightMode(next)
      }, [])

      const openRecent = useCallback((item) => {
        setRootInput(item.root)
        setMainInput(item.main || 'main.tex')
        void openProject(item.root, item.main || 'main.tex')
      }, [openProject])

      // "Switch project" returns to the empty state instead of opening the
      // native folder chooser directly: the picker is a separate, explicit
      // action on that screen, and the empty state offers recent projects.
      const changeProject = useCallback(() => {
        abortRef.current?.abort()
        setProject(null)
        setBlocks([])
        setTranslations({})
        translationsRef.current = {}
        setTexFiles([])
        setActiveId(null)
        setSettingsOpen(false)
        setRebuttalOpen(false)
        rebuttalLoadedRef.current = null
        setReviewers([newReviewer('r1', 1, 'zh-CN')])
        setActiveReviewerId('r1')
        setRebuttalView('r1')
        setRebuttalOverview(null)
        setRebuttalError('')
        setOverviewError('')
        reviewerSeqRef.current = 2
      }, [])

      // Switching the main .tex inside the open project re-opens it, so the
      // translation, source and PDF all follow the selected file.
      const switchMainFile = useCallback((file) => {
        setMainInput(file)
        const current = projectRef.current
        if (current) void openProject(current.root, file)
      }, [openProject])

      const goNextPending = useCallback(() => {
        const next = blocks.find((block) => block.translatable && block.text
          && translations[block.id]?.status !== 'done')
        if (next) selectBlock(next.id)
      }, [blocks, translations, selectBlock])

      const activeReviewer = reviewers.find((reviewer) => reviewer.id === activeReviewerId) ?? reviewers[0] ?? null

      const rebuttalPins = useMemo(() => {
        const pins = {}
        for (const reviewer of reviewers) {
          for (const [index, match] of (reviewer.result?.matches ?? []).entries()) {
            if (!match?.blockId) continue
            if (!pins[match.blockId]) pins[match.blockId] = []
            pins[match.blockId].push({
              reviewerId: reviewer.id,
              reviewerName: reviewer.name,
              number: index + 1,
              match,
            })
          }
        }
        return pins
      }, [reviewers])

      const updateReviewer = useCallback((id, patch) => {
        setReviewers((previous) => previous.map((reviewer) => (
          reviewer.id === id ? { ...reviewer, ...patch } : reviewer
        )))
      }, [])

      const addReviewer = useCallback(() => {
        if (reviewers.length >= 8 || rebuttalBusy || overviewBusy) return
        const id = `r${reviewerSeqRef.current++}`
        const next = newReviewer(id, reviewers.length + 1, activeReviewer?.target ?? 'zh-CN')
        setReviewers((previous) => [...previous, next])
        setActiveReviewerId(id)
        setRebuttalView(id)
        setRebuttalOverview(null)
        setOverviewError('')
        setRebuttalOpen(true)
      }, [reviewers.length, activeReviewer?.target, rebuttalBusy, overviewBusy])

      const removeReviewer = useCallback((id) => {
        if (reviewers.length <= 1) return
        const next = reviewers.filter((reviewer) => reviewer.id !== id)
        if (!next.length) return
        setReviewers(next)
        setActiveReviewerId(next[0].id)
        setRebuttalView(next[0].id)
        setRebuttalOverview(null)
        setOverviewError('')
      }, [reviewers])

      const openRebuttalForBlock = useCallback((blockId, reviewerId) => {
        const targetId = reviewerId ?? rebuttalPins[blockId]?.[0]?.reviewerId ?? activeReviewer?.id
        if (targetId) {
          setActiveReviewerId(targetId)
          setRebuttalView(targetId)
        }
        selectBlock(blockId)
        setRebuttalOpen(true)
      }, [rebuttalPins, activeReviewer?.id, selectBlock])

      const locateRebuttal = useCallback((match) => {
        if (!match?.blockId) return
        selectBlock(match.blockId)
        const block = blocks.find((item) => item.id === match.blockId)
        const reviewer = reviewers.find((item) => item.id === activeReviewerId)
        setStatus(`${reviewer?.name ?? ''} · ${LOCALE.rebuttalLocate}: ${block?.section || block?.kind || match.blockId}`)
        setRebuttalOpen(false)
      }, [selectBlock, blocks, reviewers, activeReviewerId])

      const runRebuttal = useCallback(async (reviewerId) => {
        const current = projectRef.current
        const reviewer = reviewers.find((item) => item.id === reviewerId)
        if (!current || !reviewer?.text.trim() || rebuttalBusy || overviewBusy) return
        setRebuttalBusy(true)
        setRebuttalError('')
        try {
          const data = await api('/rebuttal', {
            projectId: current.projectId,
            text: reviewer.text,
            target: reviewer.target,
            glossary,
          })
          setReviewers((previous) => previous.map((item) => (
            item.id === reviewer.id ? { ...item, result: data } : item
          )))
          if (data.totals) setUsage(data.totals)
          if (data.globalTotals) setGlobalUsage(data.globalTotals)
          setActiveReviewerId(reviewer.id)
          setRebuttalView(reviewer.id)
        } catch (analysisError) {
          setRebuttalError(analysisError?.message || String(analysisError))
        } finally {
          setRebuttalBusy(false)
        }
      }, [reviewers, rebuttalBusy, overviewBusy, glossary])

      const runRebuttalOverview = useCallback(async () => {
        const current = projectRef.current
        if (!current || overviewBusy || rebuttalBusy) return
        const usable = reviewers
          .filter((reviewer) => reviewer.text.trim())
          .map((reviewer) => ({ id: reviewer.id, name: reviewer.name, text: reviewer.text }))
        if (!usable.length) return
        setOverviewBusy(true)
        setOverviewError('')
        try {
          const data = await api('/rebuttal/overview', {
            projectId: current.projectId,
            reviewers: usable,
            target: target === 'en' ? 'en' : 'zh-CN',
          })
          setRebuttalOverview(data)
          if (data.totals) setUsage(data.totals)
          if (data.globalTotals) setGlobalUsage(data.globalTotals)
        } catch (analysisError) {
          setOverviewError(analysisError?.message || String(analysisError))
        } finally {
          setOverviewBusy(false)
        }
      }, [reviewers, overviewBusy, rebuttalBusy, target])

      const clearRebuttal = useCallback((reviewerId) => {
        setReviewers((previous) => previous.map((reviewer) => (
          reviewer.id === reviewerId ? { ...reviewer, text: '', result: null } : reviewer
        )))
        setRebuttalError('')
        setRebuttalOverview(null)
        setOverviewError('')
      }, [])

      const handleVisible = useCallback((id, from) => {
        if (!sync) return
        if (Date.now() < lockRef.current) return
        lockRef.current = Date.now() + 180
        setOrigin(from || 'click')
        setActiveId(id)
      }, [sync])

      const handleVisiblePage = useCallback((page) => {
        if (!sync) return
        if (Date.now() < lockRef.current) return
        setOrigin('pdf')
        setActivePage(page)
        const current = projectRef.current
        if (!current) return
        const ratio = (page - 0.5) / Math.max(1, pdfPages)
        const targetLine = Math.max(1, Math.round(ratio * (current.totalLines ?? 1)))
        const block = blocksRef.current.find((item) => targetLine >= item.line && targetLine <= item.endLine)
        if (block && block.id !== activeIdRef.current) {
          lockRef.current = Date.now() + 200
          setActiveId(block.id)
        }
      }, [sync, pdfPages])

      const retranslateAll = useCallback(async () => {
        if (!projectRef.current) return
        setTranslations({})
        translationsRef.current = {}
        queueRef.current.clear()
        await queueTranslations(blocksRef.current, projectRef.current.projectId, true)
      }, [queueTranslations])

      const retryOne = useCallback(async (id) => {
        const current = projectRef.current
        const block = blocksRef.current.find((item) => item.id === id)
        if (!current || !block) return
        setTranslations((previous) => ({ ...previous, [id]: { status: 'pending' } }))
        await runBatch([block], current.projectId, true)
      }, [runBatch])

      const openEditor = useCallback((block, mode = 'zh') => {
        const current = translationsRef.current[block.id]
        setEditing({
          blockId: block.id,
          mode,
          zhValue: current?.text ?? block.text ?? '',
          enValue: block.source ?? '',
          busy: false,
          polishing: false,
          error: '',
        })
      }, [])

      // Reader keyboard: J/K (or arrows) move the active block, E opens the
      // editor for it. Ignored while typing, and in panes without a project.
      useEffect(() => {
        if (!project) return undefined
        const onKey = (event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return
          const tag = event.target?.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return
          const list = blocks.filter((block) => block.translatable && block.text)
          if (!list.length) return
          const index = list.findIndex((block) => block.id === activeId)
          if (event.key === 'j' || event.key === 'J') {
            event.preventDefault()
            selectBlock((list[Math.min(list.length - 1, Math.max(0, index) + 1)] ?? list[0]).id)
          } else if (event.key === 'k' || event.key === 'K') {
            event.preventDefault()
            selectBlock((list[Math.max(0, index - 1)] ?? list[0]).id)
          } else if (event.key === 'e' || event.key === 'E') {
            event.preventDefault()
            openEditor(list[Math.max(0, index)] ?? list[0])
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [project, blocks, activeId, selectBlock, openEditor])

      const polishEdit = useCallback(async () => {
        if (!editing || editing.busy || editing.polishing) return
        const current = projectRef.current
        if (!current) return
        const draft = editing
        const value = draft.mode === 'zh' ? draft.zhValue : draft.enValue
        if (!value.trim()) return
        setEditing({ ...draft, polishing: true, error: '' })
        try {
          const data = await api('/block/polish', {
            projectId: current.projectId,
            blockId: draft.blockId,
            mode: draft.mode,
            text: value,
            glossary,
          })
          if (data.totals) setUsage(data.totals)
          if (data.globalTotals) setGlobalUsage(data.globalTotals)
          setEditing({
            ...draft,
            mode: 'en',
            enValue: data.englishSource ?? draft.enValue,
            polishing: false,
            error: '',
          })
          setStatus(LOCALE.polished)
        } catch (error) {
          setEditing({ ...draft, polishing: false, error: error?.message || String(error) })
        }
      }, [editing, glossary])

      const saveEdit = useCallback(async () => {
        if (!editing || editing.busy || editing.polishing) return
        const current = projectRef.current
        if (!current) return
        const draft = editing
        setEditing({ ...draft, busy: true, error: '' })
        try {
          const value = draft.mode === 'zh' ? draft.zhValue : draft.enValue
          const data = await api('/block/rewrite', {
            projectId: current.projectId,
            blockId: draft.blockId,
            glossary,
            ...(draft.mode === 'zh' ? { chineseText: value } : { englishSource: value }),
          })
          MATH_MACROS = data.mathMacros ?? MATH_MACROS
          setProject(data)
          setBlocks(data.blocks ?? [])
          const merged = { ...(translationsRef.current ?? {}) }
          for (const [id, text] of Object.entries(data.translations ?? {})) {
            if (typeof text === 'string' && text) merged[id] = { status: 'done', text, cached: true }
          }
          translationsRef.current = merged
          setTranslations(merged)
          if (data.usage) setUsage(data.usage)
          if (data.globalUsage) setGlobalUsage(data.globalUsage)
          if (data.rewrittenBlockId) setActiveId(data.rewrittenBlockId)
          if (data.translationError && data.rewrittenBlockId) {
            merged[data.rewrittenBlockId] = { status: 'error', error: data.translationError }
            translationsRef.current = merged
            setTranslations(merged)
          }
          if (data.translationError) {
            setEditing({
              ...draft,
              blockId: data.rewrittenBlockId ?? draft.blockId,
              busy: false,
              error: `${LOCALE.rewriteFailed}: ${data.translationError}`,
            })
          } else {
            setEditing(null)
            setStatus(LOCALE.writeBack)
          }
        } catch (error) {
          setEditing({ ...draft, busy: false, error: error?.message || String(error) })
        }
      }, [editing, glossary])

      const compilePdf = useCallback(async () => {
        const current = projectRef.current
        if (!current || compileState.running) return
        setCompileState({ running: true, log: '', visible: true })
        try {
          const result = await api('/compile', { projectId: current.projectId })
          setCompileState((previous) => ({ ...previous, running: false, log: result.log || '' }))
          if (result.ok) {
            const refreshed = await api('/project/refresh', { projectId: current.projectId })
            setProject(refreshed)
            setBlocks(refreshed.blocks ?? [])
            if (refreshed.pdf?.exists) await loadPdf(refreshed.projectId)
          }
        } catch (compileError) {
          setCompileState((previous) => ({ ...previous, running: false, log: compileError?.message || String(compileError) }))
        }
      }, [compileState.running, loadPdf])

      const scan = useCallback(async () => {
        try {
          const data = await api('/project/list', { root: rootInput.trim() })
          setTexFiles(data.files ?? [])
          if ((data.files ?? []).length && !data.files.includes(mainInput)) {
            const preferred = data.files.find((file) => /(^|\/)main\.tex$/.test(file)) || data.files[0]
            setMainInput(preferred)
          }
        } catch (scanError) {
          setError(scanError?.message || String(scanError))
        }
      }, [rootInput, mainInput])

      const pdfAvailable = Boolean(pdfDoc || project?.pdf?.exists)
      const showPdf = activePageDerived

      return (
        <div className="pt-root">
          <style>{CSS}</style>
          <CommandBar
            project={project}
            view={view}
            onView={selectView}
            texFiles={texFiles}
            mainInput={mainInput}
            onMainChange={switchMainFile}
            progress={progress}
            health={health}
            loading={loading}
            compileRunning={compileState.running}
            picking={picking}
            onRetranslate={retranslateAll}
            onCompile={compilePdf}
            onSettings={() => setSettingsOpen(true)}
            onRebuttal={() => {
              setRebuttalView(activeReviewer?.id ?? 'overview')
              setRebuttalOpen(true)
            }}
            onPick={pickDirectory}
            onScan={scan}
            onOpen={() => openProject()}
            rootInput={rootInput}
            onRootChange={setRootInput}
            recent={recent}
            onOpenRecent={openRecent}
            onNextPending={goNextPending}
            onChangeProject={changeProject}
          />
          {error ? <div className="pt-banner err">{error}</div> : null}
          {status ? <div className="pt-banner warn">{status}</div> : null}
          {project?.warnings?.length ? (
            <div className="pt-banner warn">
              {LOCALE.warnings}: {project.warnings.slice(0, 3).map((warning) => warning.message).join(' · ')}
            </div>
          ) : null}
          <div className="pt-body">
            {project ? (
              <>
                <div className="pt-main" data-we-surface="v1">
                  {view === 'split' ? (
                    <>
                      <Pane title={LOCALE.translation}>
                        <TranslationPane
                          blocks={blocks}
                          translations={translations}
                          activeId={activeId}
                          origin={origin}
                          onSelect={selectBlock}
                          onVisible={(id) => handleVisible(id, 'translation')}
                          onRetry={retryOne}
                          onEdit={openEditor}
                          rebuttalPins={rebuttalPins}
                          onRebuttal={openRebuttalForBlock}
                        />
                      </Pane>
                      <Pane
                        title={rightMode === 'pdf' ? LOCALE.pdf : LOCALE.source}
                        tools={(
                          <div className="pt-seg" role="group" aria-label={LOCALE.mode}>
                            <button className={rightMode === 'source' ? 'on' : ''} onClick={() => setRightMode('source')}>{LOCALE.source}</button>
                            <button className={rightMode === 'pdf' ? 'on' : ''} disabled={!pdfAvailable} onClick={() => setRightMode('pdf')}>{LOCALE.pdf}</button>
                          </div>
                        )}
                      >
                        {rightMode === 'pdf' ? (
                          <PdfPane pdfDoc={pdfDoc} pdfPages={pdfPages} activePage={showPdf} origin={origin} onVisiblePage={handleVisiblePage} zoom={pdfZoom} onZoom={changeZoom} />
                        ) : (
                          <SourcePane source={project.source} blocks={blocks} activeId={activeId} origin={origin} onSelect={selectBlock} onVisible={(id) => handleVisible(id, 'source')} onEdit={openEditor} rebuttalPins={rebuttalPins} onRebuttal={openRebuttalForBlock} />
                        )}
                      </Pane>
                    </>
                  ) : (
                    <Pane title={view === 'pdf' ? LOCALE.pdf : view === 'source' ? LOCALE.source : LOCALE.translation}>
                      {view === 'translation' ? (
                        <TranslationPane
                          blocks={blocks}
                          translations={translations}
                          activeId={activeId}
                          origin={origin}
                          onSelect={selectBlock}
                          onVisible={(id) => handleVisible(id, 'translation')}
                          onRetry={retryOne}
                          onEdit={openEditor}
                          rebuttalPins={rebuttalPins}
                          onRebuttal={openRebuttalForBlock}
                        />
                      ) : view === 'source' ? (
                        <SourcePane source={project.source} blocks={blocks} activeId={activeId} origin={origin} onSelect={selectBlock} onVisible={(id) => handleVisible(id, 'source')} onEdit={openEditor} rebuttalPins={rebuttalPins} onRebuttal={openRebuttalForBlock} />
                      ) : (
                        <PdfPane pdfDoc={pdfDoc} pdfPages={pdfPages} activePage={showPdf} origin={origin} onVisiblePage={handleVisiblePage} zoom={pdfZoom} onZoom={changeZoom} />
                      )}
                    </Pane>
                  )}
                </div>
                {rebuttalOpen ? (
                  <RebuttalDrawer
                    reviewers={reviewers}
                    activeId={activeReviewer?.id}
                    view={rebuttalView}
                    onSelectView={(id) => {
                      setRebuttalView(id)
                      if (id !== 'overview') setActiveReviewerId(id)
                    }}
                    onAddReviewer={addReviewer}
                    onRemoveReviewer={removeReviewer}
                    overview={rebuttalOverview}
                    busy={rebuttalBusy}
                    overviewBusy={overviewBusy}
                    error={rebuttalError}
                    overviewError={overviewError}
                    onUpdate={updateReviewer}
                    onRun={runRebuttal}
                    onClear={clearRebuttal}
                    onRunOverview={runRebuttalOverview}
                    onClose={() => setRebuttalOpen(false)}
                    onLocate={locateRebuttal}
                    blocks={blocks}
                  />
                ) : null}
                {settingsOpen ? (
                  <SettingsDrawer
                    target={target}
                    setTarget={setTarget}
                    glossaryText={glossaryText}
                    setGlossaryText={setGlossaryText}
                    usage={usage}
                    globalUsage={globalUsage}
                    onClose={() => setSettingsOpen(false)}
                    onClear={async () => {
                      if (projectRef.current) await api('/cache/clear', { projectId: projectRef.current.projectId })
                    }}
                    onClearAll={async () => {
                      await api('/cache/clear', { all: true })
                    }}
                  />
                ) : null}
              </>
            ) : (
              <div className="pt-empty">
                <div className="pt-empty-mark"><SidebarIcon /></div>
                <h2>{LOCALE.emptyTitle}</h2>
                <p>{LOCALE.emptyBody}</p>
                <div className="pt-empty-actions">
                  <button className="pt-btn pt-btn-primary" disabled={picking} onClick={pickDirectory}>{picking ? LOCALE.picking : LOCALE.openProject}</button>
                  <button className="pt-btn" onClick={() => setManualPath((value) => !value)}>{LOCALE.manualPath}</button>
                </div>
                {loading ? <span className="pt-spin" /> : null}
                {manualPath ? (
                  <div className="pt-open-row">
                    <input className="pt-input" value={rootInput} placeholder={LOCALE.project} onChange={(event) => setRootInput(event.target.value)} />
                    <button className="pt-btn" onClick={scan}>{LOCALE.scan}</button>
                    <button className="pt-btn pt-btn-primary" disabled={loading || !rootInput.trim()} onClick={() => openProject()}>{LOCALE.open}</button>
                  </div>
                ) : null}
                {recent.length ? (
                  <div className="pt-recent">
                    <div className="pt-recent-title">{LOCALE.recent}</div>
                    {recent.map((item) => (
                      <button key={`${item.root}|${item.main}`} className="pt-recent-item" onClick={() => openRecent(item)} title={item.root}>
                        <span className="pt-recent-name">{item.title || item.main}</span>
                        <span className="pt-recent-path">{item.root}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
          {project ? (
            <div className="pt-statusbar">
              <button className="pt-usage" aria-expanded={usageOpen} onClick={() => setUsageOpen((value) => !value)}>
                {blocks.filter((block) => block.translatable).length} {LOCALE.blocksUnit} · {LOCALE.cached} {progress.cached} · ≈ {formatUsd(usage.costUsd)}
                <span className="pt-caret" aria-hidden="true">▴</span>
              </button>
              {pdfError ? <span className="pt-error-text">{LOCALE.pdfFailed}: {pdfError}</span> : null}
              <div className="pt-spacer" />
              <button className={sync ? 'pt-toggle on' : 'pt-toggle'} aria-pressed={sync} onClick={() => setSync(!sync)}>
                <span className="pt-toggle-dot" aria-hidden="true" />
                {LOCALE.sync}
              </button>
              {usageOpen ? (
                <div className="pt-usage-pop">
                  <div className="pt-menu-title">{LOCALE.paperUsage}</div>
                  <div className="pt-usage-row"><span>{LOCALE.usageInput}</span><span>{(usage.input ?? 0).toLocaleString()}</span></div>
                  <div className="pt-usage-row"><span>{LOCALE.usageOutput}</span><span>{(usage.output ?? 0).toLocaleString()}</span></div>
                  <div className="pt-usage-row"><span>{LOCALE.usageCacheHit}</span><span>{(usage.cacheRead ?? 0).toLocaleString()}</span></div>
                  <div className="pt-usage-row"><span>{LOCALE.usageCalls}</span><span>{usage.calls ?? 0}</span></div>
                  <div className="pt-usage-row"><span>{LOCALE.usageCost}</span><span>{formatUsd(usage.costUsd)} / {formatCny(usage.costCny ?? (usage.costUsd ?? 0) * 7.2)}</span></div>
                  <div className="pt-menu-sep" />
                  <div className="pt-menu-title">{LOCALE.globalUsage}</div>
                  <div className="pt-usage-row"><span>{LOCALE.paperUsage}</span><span>{formatTokens(usageTotal(globalUsage))} · ≈ {formatUsd(globalUsage.costUsd)}</span></div>
                </div>
              ) : null}
            </div>
          ) : null}
          {editing ? (
            <div className="pt-edit-mask" onClick={() => { if (!editing.busy) setEditing(null) }}>
              <div className="pt-edit-card" onClick={(event) => event.stopPropagation()}>
                <h3>{LOCALE.editBlock}</h3>
                <div className="pt-edit-modes">
                  <button className={editing.mode === 'zh' ? 'on' : ''} disabled={editing.busy || editing.polishing} onClick={() => setEditing({ ...editing, mode: 'zh', error: '' })}>{LOCALE.editZh}</button>
                  <button className={editing.mode === 'en' ? 'on' : ''} disabled={editing.busy || editing.polishing} onClick={() => setEditing({ ...editing, mode: 'en', error: '' })}>{LOCALE.editEn}</button>
                </div>
                <div className="pt-edit-hint">{editing.mode === 'zh' ? LOCALE.zhEditHint : LOCALE.enEditHint}</div>
                <textarea
                  className={editing.mode === 'zh' ? 'zh' : ''}
                  value={editing.mode === 'zh' ? editing.zhValue : editing.enValue}
                  disabled={editing.busy || editing.polishing}
                  autoFocus
                  onChange={(event) => setEditing({
                    ...editing,
                    ...(editing.mode === 'zh' ? { zhValue: event.target.value } : { enValue: event.target.value }),
                  })}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      saveEdit()
                    }
                    if (event.key === 'Escape' && !editing.busy) setEditing(null)
                  }}
                />
                {editing.error ? <div className="pt-edit-error">{editing.error}</div> : null}
                <div className="pt-edit-hint">{LOCALE.polishHint}</div>
                <div className="pt-edit-actions">
                  <button
                    className="pt-btn"
                    disabled={editing.busy || editing.polishing || !(editing.mode === 'zh' ? editing.zhValue : editing.enValue).trim()}
                    onClick={polishEdit}
                  >
                    {editing.polishing ? LOCALE.polishing : LOCALE.polish}
                  </button>
                  <button className="pt-btn" disabled={editing.busy || editing.polishing} onClick={() => setEditing(null)}>{LOCALE.cancel}</button>
                  <button
                    className="pt-btn pt-btn-primary"
                    disabled={editing.busy || editing.polishing || !(editing.mode === 'zh' ? editing.zhValue : editing.enValue).trim()}
                    onClick={saveEdit}
                  >
                    {editing.busy ? LOCALE.rewriting : LOCALE.saveTranslate}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {compileState.log && compileState.visible !== false ? (
            <div className="pt-banner warn">
              <div className="pt-banner-head">
                <span>{compileState.running ? LOCALE.compileRunning : LOCALE.compilLog}</span>
                <button
                  className="pt-banner-close"
                  title={LOCALE.close}
                  aria-label={LOCALE.close}
                  onClick={() => setCompileState((previous) => ({ ...previous, visible: false }))}
                >×</button>
              </div>
              <pre className="pt-log">{compileState.log}</pre>
            </div>
          ) : null}
        </div>
      )
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        try {
          LAYOUT = ctx.layout ?? (typeof ctx.get === 'function' ? ctx.get('layout') : undefined) ?? null
        } catch {
          LAYOUT = null
        }
        let t = (key) => key
        try {
          ctx.effect(() => ctx.locale.register('paperTranslator', {
            en: { panel: 'Paper Lens' },
            zh: { panel: '论文对照' },
          }), 'paper-translator: locale')
          t = ctx.locale.bind('paperTranslator')
        } catch (error) {
          console.warn('[paper-translator] locale registration failed:', error)
        }
        ctx.slots.inject('main', () => {
          try {
            return ctx.slots.register({
              name: 'main',
              key: 'paper-translator',
              locale: 'paperTranslator',
            }, App)
          } catch (error) {
            console.error('[paper-translator] main panel registration failed:', error)
            return () => {}
          }
        })
        ctx.slots.inject('sidebar.panellist', () => {
          try {
            return ctx.slots.register({
              name: 'sidebar.panellist',
              id: 'paper-translator',
              order: 20,
              label: () => t('panel'),
              locale: 'paperTranslator',
            }, SidebarIcon)
          } catch (error) {
            console.error('[paper-translator] sidebar registration failed:', error)
            return () => {}
          }
        })
      },
    }
  },
})
