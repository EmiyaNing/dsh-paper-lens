# Paper Lens · 论文对照

**Bilingual LaTeX paper reader for DeepSeek Harness.** Read a paper with a Chinese translation on the left and the LaTeX source or PDF on the right, translate section by section, annotate reviewer reports against the exact paragraphs, and edit either side with a write-back to the `.tex` file.

English | [中文](README.zh.md)

- Plugin name: `@local/paper-translator`
- Version: `0.2.0`
- Verified on: DeepSeek Harness `0.2.2-rc.3` (Desktop, profile `desktop`) and the Web profile
- Runtime dependencies: none (the browser bundle is prebuilt; the host half uses Node built-ins only)

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [First run](#first-run)
- [Using the reader](#using-the-reader)
- [Reviewer reports](#reviewer-reports)
- [Configuration](#configuration)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Data and privacy](#data-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Project layout](#project-layout)
- [Compatibility](#compatibility)
- [License](#license)

---

## Features

- **Side-by-side reading** — translation on the left, LaTeX source or PDF on the right; split, translation-only, source-only and PDF-only views from a single switcher.
- **Section-aware translation** — the LaTeX project is parsed into blocks (sections, paragraphs, captions, math, lists) and translated block by block through the model route already configured in DSH.
- **Per-block cache and usage ledger** — re-opening a paper restores finished translations; token and cost totals are shown per paper and globally.
- **Write-back editing** — edit the Chinese translation or the English LaTeX and save; the source `.tex` is rewritten and the paragraph re-translated.
- **Optional local compile** — compile the PDF with `pdflatex`, `latexmk` or `xelatex` from the toolbar when a TeX distribution is installed.
- **Reviewer reports** — keep up to eight reviewers, paste each report, translate and locate every remark against the paper, click to jump between remark and paragraph, and generate a cross-reviewer overview (overlaps, unique points, attitudes).
- **Glossary and target language** — per-install glossary and target language (`zh-CN`, `zh-TW`, `en`).
- **Paper-like typography** — 74-character measure, generous line height, semantic theme colours, reduced-motion support.
- **Works with wallpaper/glass themes** — when [`dsh-plugin-wallpaper-engine`](https://github.com/elysia395/dsh-wallpaper-engine) is active, the reader keeps its own paper surface so text stays legible over a wallpaper, and opts into the glass runtime through its public cross-plugin markers.
- **Bilingual UI** — Chinese and English, following the DSH interface language.

## Requirements

| Item | Requirement |
|---|---|
| DeepSeek Harness | 0.2.x, verified on `0.2.2-rc.3` |
| Node.js | ≥ 22.12 (only for CLI installation or building from source) |
| pnpm | only for CLI installation from the terminal |
| TeX distribution | optional, only for the **Compile PDF** action |
| A configured model | any model route available in DSH **Settings → Models** |

The plugin ships its browser bundle (`client.js`) and its PDF worker (`assets/pdf.worker.mjs`), so installing the folder needs no `npm install`.

## Installation

### Option 1 — local folder (recommended)

1. Put this folder somewhere permanent, for example `~/Documents/projects/paper-lens`. **Do not delete or move it afterwards**: a local install links the profile to this directory, it does not copy it.
2. Open DeepSeek Harness.
3. Sidebar → **插件 / Plugins** → **添加插件 / Add plugin** → **安装第三方插件 / Install third-party plugin**.
4. Choose the **local directory** source and select this folder (or type `link:/absolute/path/to/paper-lens`).
5. Enable the bundle if the dialog offers it, then **quit DeepSeek Harness completely and reopen it** — client bundles are assembled at boot, so a running window does not pick them up.
6. The left sidebar now shows **论文对照 / Paper Lens**.

### Option 2 — command line

```bash
# Desktop app
dsh plugin --profile desktop add link:/absolute/path/to/paper-lens

# dsh web
dsh plugin --profile web add link:/absolute/path/to/paper-lens
```

The packaged Desktop app does not put `dsh` on `PATH`. Pin the same version as the app to avoid rewriting the profile with a different release:

```bash
npx -y @deepseek-ai/dsh@0.2.2-rc.3 plugin --profile desktop add link:/absolute/path/to/paper-lens
```

Restart DeepSeek Harness afterwards.

### Option 3 — from a Git repository

```bash
dsh plugin --profile desktop add github:<owner>/<repo>
```

### Verify the installation

- **插件 / Plugins** lists the bundle, and its row `paper-translator` is enabled.
- The sidebar entry opens the panel; the command bar shows the project chip, the view switcher, the progress ring and the action buttons.
- With no project open, the panel shows **打开项目… / Open project…**.

### Uninstall

Plugins → the `@local/paper-translator` card → **Remove**, then restart DeepSeek Harness. Translations cached on the host stay under `$DSH_HOME/paper-translator` (see [Data and privacy](#data-and-privacy)).

## First run

1. Click **打开项目… / Open project…** and choose the directory that contains `main.tex` (a native folder chooser opens; on environments without one, use **手动输入路径 / Enter path manually**).
2. If the project has several `.tex` files, pick the main file from the dropdown next to the project chip — the reader reloads the translation, source and PDF for that file.
3. Click **重译全部 / Retranslate all** in the command bar. Blocks translate in batches; the progress ring shows `done/total`, and finished blocks are cached.
4. Use the view switcher to read **拆分 / Split**, **译文 / Translation**, **原文 / LaTeX** or **PDF**. In split mode the right pane can toggle between LaTeX and PDF.
5. If a TeX distribution is installed, **编译 / Compile** builds the PDF and reloads the PDF pane.

## Using the reader

- **Click** a block to highlight it and its source/PDF counterpart. **J / K** move the active block, **E** edits it.
- **Edit** opens the paragraph editor: switch between Chinese and English, save and translate to rewrite the `.tex` source, or use the bundled *Best-Paper-Writing* polish pass to tighten the prose before saving.
- The **status bar** shows translated segment count, cache hits and the running cost of the current paper; click it for the input/output/cache/call breakdown and the global total. The **跟随滚动 / Sync scroll** toggle lives on the right of the same bar.
- **⋯ → 设置 / Settings** opens the settings panel: target language, glossary (JSON), usage, and cache clearing.
- **⋯ → 返修意见 / Reviewer reports** opens the reviewer panel (see below).

## Reviewer reports

1. **⋯ → 返修意见**. Each reviewer has a tab; add up to eight.
2. Paste one reviewer's report per tab and click **翻译并定位 / Translate and locate**. Every remark is translated and matched to the paragraph it refers to.
3. Click a match to jump to the paragraph; pinned markers appear next to the affected blocks and in the LaTeX gutter.
4. **总览 / Overview** summarises the reviewers' attitudes, the points several reviewers share, and the points only one raised.

## Configuration

The host half accepts these keys on the `paper-translator` row of the profile (all optional):

| Key | Default | Meaning |
|---|---|---|
| `model` | `deepseek-flash` | Model used for translation, polishing and the overview |
| `targetLanguage` | `zh-CN` | Default target language (`zh-CN`, `zh-TW`, `en`); the settings panel overrides it per browser |
| `compileEngine` | `pdflatex` | `pdflatex`, `latexmk` or `xelatex` |
| `compileRuns` | `2` | Number of `pdflatex` passes |
| `pricing` | DeepSeek list prices | Token prices used for the cost estimates, per million tokens |

Set them in the profile's `cordis.patch.yml` (the same layer that DSH's plugin manager writes):

```yaml
- id: paper-translator
  name: '@local/paper-translator'
  config:
    model: deepseek-chat
    compileEngine: xelatex
```

Changes to a row restart the plugin; open the panel again afterwards. Keep the `model` to a route that exists in **Settings → Models**.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `J` / `K` | Next / previous block (both panes follow) |
| `E` | Edit the active block |
| `Cmd/Ctrl` + `+` / `-` / `0` | Zoom the PDF (when a PDF pane is visible) |
| `Esc` | Close a menu, the settings panel or the reviewer panel |
| `Cmd/Ctrl` + `Enter` | Save the paragraph editor |

## Data and privacy

- Translations, the usage ledger and the parsed-project cache live under `$DSH_HOME/paper-translator` (`~/.dsh/paper-translator` by default). **设置 → 清空本文缓存 / 清空全部缓存** clears them.
- Paper text leaves the machine only when you translate, polish or generate an overview, and only through the model route configured in DSH.
- The browser half talks to the host over the authenticated `/api/paper-translator/*` fetch routes; no third-party network calls are made.
- The PDF viewer ships with `pdfjs-dist`; its worker is served from `/paper-translator/pdf.worker.mjs`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| The sidebar entry or panel is missing | Check the bundle is enabled in **插件**, then fully restart DSH (a page refresh is not enough for a newly installed bundle). |
| “The environment cannot open a native folder picker” | Use **手动输入路径 / Enter path manually**; remote browsers have no OS chooser. |
| The PDF pane is empty | There is no built PDF next to the main `.tex` file: compile it, or place `<main>.pdf` beside `<main>.tex`. |
| Translation fails | Check **Settings → Models** and the account balance; open the panel's `⋯` menu for the error banner text. |
| The text is hard to read over a wallpaper | This plugin keeps its own readable plate; if the whole app looks low-contrast, pick a darker accent colour in the wallpaper plugin's settings (a very light accent also affects DSH's own buttons). |
| A different main file seems not to load | Select it in the dropdown next to the project chip; the reader re-opens the project with that file. |

## Development

```bash
npm install          # esbuild, katex, pdfjs-dist and the smoke-test tooling
npm run build        # bundle src/client/index.jsx -> client.js, copy the PDF worker
npm test             # LaTeX parser tests
npm run test:ui      # jsdom mount + interaction smoke test
```

- Client source: `src/client/index.jsx` (styles live in the `CSS` template string at the top of the file).
- Host source: `src/host/*.js`, wired in `src/host/app.js`.
- After changing client code, run `npm run build` and reload the DSH page; a local install serves `client.js` from this folder.
- A local install is a **link**: the profile points at this directory, so edits appear after a rebuild and a reload without reinstalling.

Design notes live in [`DESIGN.md`](DESIGN.md).

## Project layout

```
paper-lens/
├── index.js               # host entry (exports apply + inject)
├── client.js              # built browser bundle (do not edit by hand)
├── cordis.patch.yml       # bundle patch: inserts the paper-translator row
├── src/
│   ├── client/index.jsx   # React panel, styles, keyboard handling
│   ├── host/              # parser, translator, compiler, routes, cache, rebuttal
│   └── shared/math.js
├── assets/pdf.worker.mjs  # pdf.js worker served to the browser
├── skills/best-paper-writing/  # optional polish skill (own LICENSE/NOTICE)
├── locale/{zh,en}.json    # bundle title and description
├── test/                  # parser tests + jsdom smoke test
├── scripts/build-client.mjs
├── icon.svg
├── DESIGN.md
└── README.md / README.zh.md
```

## Compatibility

- DeepSeek Harness `0.2.2-rc.3` is the verified release; the panel relies on the `main` keyed slot, `sidebar.panellist`, the `layout` service, the settings surface and the authenticated `/api` fetch registry.
- [`dsh-plugin-wallpaper-engine`](https://github.com/elysia395/dsh-wallpaper-engine) is supported through its public `body[data-we-wallpaper]` / `body[data-we-glass-page]` markers: the reader keeps a paper surface, participates in the glass runtime via `data-we-surface="v1"`, and preserves the white PDF canvas.
- No other plugin is required. The panel coexists with the wallpaper plugin's glass sub-row whether it is enabled or disabled.

## License

MIT for this plugin's own code — see [`LICENSE`](LICENSE). The bundled writing skill under `skills/best-paper-writing` keeps its own license and attribution files (`LICENSE`, `LICENSE-base-skill`, `NOTICE.md`), which are not covered by the MIT license above.
