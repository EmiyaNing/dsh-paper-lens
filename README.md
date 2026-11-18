<details>
<summary><b>简体中文</b></summary>

# 论文对照

**DeepSeek Harness 的中英双语 LaTeX 论文阅读插件。** 左侧中文译文，右侧 LaTeX 源码或 PDF；按段落翻译、按段落定位审稿意见，左右两侧都可以编辑并写回 `.tex` 源文件。

- 插件名：`@local/paper-translator`
- 版本：`0.2.0`
- 已验证：DeepSeek Harness `0.2.2-rc.3`（桌面端与 `dsh web`）
- 运行时依赖：无（浏览器端打包文件已预构建，宿主端只用 Node 内置模块）

## 目录

- [功能](#功能)
- [环境要求](#环境要求)
- [安装](#安装)
- [首次使用](#首次使用)
- [阅读与操作](#阅读与操作)
- [返修意见](#返修意见)
- [配置](#配置)
- [快捷键](#快捷键)
- [数据与隐私](#数据与隐私)
- [常见问题](#常见问题)
- [开发](#开发)
- [目录结构](#目录结构)
- [兼容性](#兼容性)
- [许可证](#许可证)

## 功能

- **左右对照** —— 左侧译文，右侧 LaTeX 源码或 PDF，可自由组合；顶部一个切换器即可在「拆分 / 译文 / 原文 / PDF」之间切换。
- **按段落翻译** —— 把 LaTeX 项目解析为段落块（章节、正文、图表标题、公式、列表），逐块调用 DSH 已配置的模型路由翻译。
- **逐块缓存与用量账本** —— 重新打开论文即可恢复已完成的译文；状态栏显示本文与全局的 token 与费用。
- **写回式编辑** —— 修改中文译文或英文 LaTeX 后保存，源 `.tex` 会被改写并重新翻译该段。
- **可选本地编译** —— 本机装有 TeX 发行版时，工具栏的「编译」会用 `pdflatex` / `latexmk` / `xelatex` 生成 PDF。
- **返修意见** —— 最多八位审稿人，每位单独粘贴意见，自动翻译并定位到具体段落；点击即可在意见与段落之间跳转；「总览」汇总重叠意见、独有意见与审稿人态度。
- **术语表与目标语言** —— 支持 `zh-CN`、`zh-TW`、`en`，术语表按安装保存。
- **论文般的排版** —— 74 字符行宽、宽松行高、语义化主题色、支持「减弱动效」。
- **适配壁纸/玻璃主题** —— 启用 [`dsh-plugin-wallpaper-engine`](https://github.com/elysia395/dsh-wallpaper-engine) 时，阅读区保留自己的纸张底板，保证文字在壁纸上依然清晰；同时通过其公开的跨插件标记接入玻璃运行时。
- **中英双语界面** —— 跟随 DSH 的界面语言。

## 环境要求

| 项目 | 要求 |
|---|---|
| DeepSeek Harness | 0.2.x，已在 `0.2.2-rc.3` 验证 |
| Node.js | ≥ 22.12（仅在命令行安装或从源码构建时需要） |
| pnpm | 仅在终端安装时需要 |
| TeX 发行版 | 可选，仅「编译 PDF」需要 |
| 可用模型 | DSH **设置 → 模型** 中任一可用路由 |

插件已自带浏览器 bundle（`client.js`）和 PDF worker（`assets/pdf.worker.mjs`），**直接安装本目录不需要 `npm install`**。

## 安装

### 方式一：本地目录（推荐）

1. 把本目录放到一个**固定位置**，例如 `~/Documents/projects/dsh-paper-lens`。安装后**不要移动或删除它**：本地安装是「链接」到该目录，而不是复制。
2. 打开 DeepSeek Harness。
3. 侧栏 → **插件** → **添加插件** → **安装第三方插件**。
4. 选择「本地目录」，指向本文件夹（也可以输入 `link:/绝对路径/dsh-paper-lens`）。
5. 若对话框提供「立即启用」就启用，然后**完全退出 DeepSeek Harness 再重新打开** —— 客户端 bundle 在启动时组装，运行中的窗口不会热加载。
6. 左侧栏出现 **论文对照**。

### 方式二：命令行

```bash
# 桌面端
dsh plugin --profile desktop add link:/绝对路径/dsh-paper-lens

# dsh web
dsh plugin --profile web add link:/绝对路径/dsh-paper-lens
```

正式版 Desktop 不会把 `dsh` 放进 `PATH`。为避免用不同版本改写 profile，请锁定与 App 相同的版本：

```bash
npx -y @deepseek-ai/dsh@0.2.2-rc.3 plugin --profile desktop add link:/绝对路径/dsh-paper-lens
```

安装完成后重启 DeepSeek Harness。

### 方式三：从 Git 仓库安装

```bash
dsh plugin --profile desktop add github:<owner>/<repo>
```

### 验证安装

- **插件** 列表中出现该 bundle，且行 `paper-translator` 已启用。
- 点击侧栏入口能打开面板：顶部是项目 chip、视图切换、进度环与操作按钮。
- 未打开项目时，面板显示 **打开项目…**。

### 卸载

插件页 → `@local/paper-translator` 卡片 → **移除**，然后重启 DeepSeek Harness。Host 端缓存的译文仍会保留在 `$DSH_HOME/paper-translator`（见[数据与隐私](#数据与隐私)）。

## 首次使用

1. 点击 **打开项目…**，选择包含 `main.tex` 的目录（会弹出系统目录选择器；不支持原生选择器的环境请用 **手动输入路径**）。
2. 若项目有多个 `.tex` 文件，用项目 chip 右侧的下拉框选择主文件 —— 译文、源码与 PDF 会一起切换到该文件。
3. 点命令栏的 **重译全部**。段落按批次翻译，进度环显示 `已完成/总数`，完成的段落会进入缓存。
4. 用视图切换器在 **拆分 / 译文 / 原文 / PDF** 之间切换；拆分模式下右栏可在 LaTeX 与 PDF 之间切换。
5. 本机装了 TeX 发行版时，点 **编译** 生成 PDF 并刷新 PDF 栏。

## 阅读与操作

- **点击**段落即可高亮它以及对应的源码/PDF 位置；**J / K** 切换当前段落，**E** 编辑当前段。
- **编辑**会打开段落编辑器：可切换中文/英文，保存并翻译会写回 `.tex`；也可先用内置的 *Best-Paper-Writing* 润色一遍再保存。
- **状态栏**显示已翻译段数、缓存命中与本文费用；点开可看输入/输出/缓存/调用明细与全局用量。右侧是 **跟随滚动** 开关。
- **⋯ → 设置** 打开设置面板：目标语言、术语表（JSON）、用量与清空缓存。
- **⋯ → 返修意见** 打开审稿人面板（见下）。

## 返修意见

1. **⋯ → 返修意见**。每位审稿人一个标签页，最多八位。
2. 在每个标签页粘贴一位审稿人的意见，点 **翻译并定位**：每条意见都会被翻译并匹配到对应段落。
3. 点匹配项即可跳到段落；受影响的段落旁与 LaTeX 行号区会出现标记。
4. **总览** 会汇总各审稿人的态度、多人共同提出的意见，以及只有一人提出的独有意见。

## 配置

Host 半区接受 `paper-translator` 行上的以下配置（均可选）：

| 键 | 默认值 | 含义 |
|---|---|---|
| `model` | `deepseek-flash` | 翻译、润色与总览使用的模型 |
| `targetLanguage` | `zh-CN` | 默认目标语言（`zh-CN`、`zh-TW`、`en`）；设置面板可按浏览器覆盖 |
| `compileEngine` | `pdflatex` | `pdflatex`、`latexmk` 或 `xelatex` |
| `compileRuns` | `2` | `pdflatex` 的编译轮数 |
| `pricing` | DeepSeek 官方价 | 费用估算用的每百万 token 价格 |

在 profile 的 `cordis.patch.yml`（DSH 插件管理器写入的同一层）中设置：

```yaml
- id: paper-translator
  name: '@local/paper-translator'
  config:
    model: deepseek-chat
    compileEngine: xelatex
```

修改行配置会重启该插件，之后重新打开面板即可。`model` 请填写 **设置 → 模型** 中真实存在的路由。

## 快捷键

| 快捷键 | 作用 |
|---|---|
| `J` / `K` | 下一段 / 上一段（两侧同步跟随） |
| `E` | 编辑当前段落 |
| `Cmd/Ctrl` + `+` / `-` / `0` | 缩放 PDF（PDF 栏可见时） |
| `Esc` | 关闭菜单、设置面板或返修面板 |
| `Cmd/Ctrl` + `Enter` | 保存段落编辑器 |

## 数据与隐私

- 译文、用量账本与解析缓存保存在 `$DSH_HOME/paper-translator`（默认 `~/.dsh/paper-translator`）。可用 **设置 → 清空本文缓存 / 清空全部缓存** 清除。
- 只有在你触发翻译、润色或生成总览时，论文文本才会离开本机，并且只走 DSH 已配置的模型路由。
- 浏览器端通过带鉴权的 `/api/paper-translator/*` 路由与 Host 通信，不发起任何第三方网络请求。
- PDF 阅读器来自 `pdfjs-dist`；其 worker 由 `/paper-translator/pdf.worker.mjs` 提供。

## 常见问题

| 现象 | 处理 |
|---|---|
| 侧栏入口或面板不出现 | 在 **插件** 页确认 bundle 已启用，然后完全重启 DSH（新装 bundle 仅刷新页面不够）。 |
| 提示「当前运行环境不支持系统目录选择」 | 改用 **手动输入路径**；远程浏览器没有系统选择器。 |
| PDF 栏是空的 | 主 `.tex` 旁没有已编译的 PDF：先编译，或把 `<main>.pdf` 放在 `<main>.tex` 旁边。 |
| 翻译失败 | 检查 **设置 → 模型** 与账户余额；面板 `⋯` 菜单下的横幅会显示具体错误。 |
| 壁纸上文字看不清 | 本插件会保留可读底板；若整个 app 对比度偏低，请把壁纸插件里的强调色调深（过浅的强调色也会影响 DSH 自带的按钮）。 |
| 换了主文件但内容没变 | 用项目 chip 右侧的下拉框选择文件，阅读器会用该文件重新打开项目。 |

## 开发

```bash
npm install          # esbuild、katex、pdfjs-dist 以及烟雾测试依赖
npm run build        # 打包 src/client/index.jsx -> client.js，并复制 PDF worker
npm test             # LaTeX 解析测试
npm run test:ui      # jsdom 挂载 + 交互烟雾测试
```

- 客户端源码：`src/client/index.jsx`（样式在文件顶部的 `CSS` 模板字符串里）。
- Host 源码：`src/host/*.js`，入口在 `src/host/app.js`。
- 修改客户端代码后执行 `npm run build` 并刷新 DSH 页面；本地安装会直接从本目录读取 `client.js`。
- 本地安装是**链接**：profile 指向本目录，改完重新构建 + 刷新即可，无需重新安装。

设计说明见 [`DESIGN.md`](DESIGN.md)。

## 目录结构

```
dsh-paper-lens/
├── index.js               # Host 入口（导出 apply 与 inject）
├── client.js              # 构建产物（不要手改）
├── cordis.patch.yml       # bundle patch：插入 paper-translator 行
├── src/
│   ├── client/index.jsx   # React 面板、样式、键盘处理
│   ├── host/              # 解析、翻译、编译、路由、缓存、返修
│   └── shared/math.js
├── assets/pdf.worker.mjs  # 提供给浏览器的 pdf.js worker
├── skills/best-paper-writing/  # 可选润色技能（自带 LICENSE/NOTICE）
├── locale/{zh,en}.json    # bundle 标题与描述
├── test/                  # 解析测试 + jsdom 烟雾测试
├── scripts/build-client.mjs
├── icon.svg
├── DESIGN.md
└── README.md
```

## 兼容性

- 已验证 DeepSeek Harness `0.2.2-rc.3`；面板依赖 `main` keyed slot、`sidebar.panellist`、`layout` 服务、设置界面与带鉴权的 `/api` fetch 注册表。
- 支持 [`dsh-plugin-wallpaper-engine`](https://github.com/elysia395/dsh-wallpaper-engine)：通过其公开的 `body[data-we-wallpaper]` / `body[data-we-glass-page]` 标记，阅读区保留纸张底板，并用 `data-we-surface="v1"` 加入玻璃运行时，同时让 PDF 白底保持原样。
- 不依赖其他插件；壁纸插件的玻璃子行开启或关闭都能正常共存。

## 许可证

本插件自身代码采用 MIT，见 [`LICENSE`](LICENSE)。`skills/best-paper-writing` 下的写作技能保留其自带的许可与署名文件（`LICENSE`、`LICENSE-base-skill`、`NOTICE.md`），不在上述 MIT 许可范围内。

</details>

<details open>
<summary><b>English</b></summary>

# Paper Lens

**Bilingual LaTeX paper reader for DeepSeek Harness.** Read a paper with a Chinese translation on the left and the LaTeX source or PDF on the right, translate section by section, annotate reviewer reports against the exact paragraphs, and edit either side with a write-back to the `.tex` file.

- Plugin name: `@local/paper-translator`
- Version: `0.2.0`
- Verified on: DeepSeek Harness `0.2.2-rc.3` (desktop app and `dsh web`)
- Runtime dependencies: none (prebuilt browser bundle; the host half uses Node built-ins only)

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

1. Put this folder somewhere permanent, for example `~/Documents/projects/dsh-paper-lens`. **Do not delete or move it afterwards**: a local install links the profile to this directory, it does not copy it.
2. Open DeepSeek Harness.
3. Sidebar → **Plugins** → **Add plugin** → **Install third-party plugin**.
4. Choose the **local directory** source and select this folder (or type `link:/absolute/path/to/dsh-paper-lens`).
5. Enable the bundle if the dialog offers it, then **quit DeepSeek Harness completely and reopen it** — client bundles are assembled at boot, so a running window does not pick them up.
6. The left sidebar now shows **Paper Lens**.

### Option 2 — command line

```bash
# Desktop app
dsh plugin --profile desktop add link:/absolute/path/to/dsh-paper-lens

# dsh web
dsh plugin --profile web add link:/absolute/path/to/dsh-paper-lens
```

The packaged Desktop app does not put `dsh` on `PATH`. Pin the same version as the app to avoid rewriting the profile with a different release:

```bash
npx -y @deepseek-ai/dsh@0.2.2-rc.3 plugin --profile desktop add link:/absolute/path/to/dsh-paper-lens
```

Restart DeepSeek Harness afterwards.

### Option 3 — from a Git repository

```bash
dsh plugin --profile desktop add github:<owner>/<repo>
```

### Verify the installation

- **Plugins** lists the bundle, and its row `paper-translator` is enabled.
- The sidebar entry opens the panel; the command bar shows the project chip, the view switcher, the progress ring and the action buttons.
- With no project open, the panel shows **Open project…**.

### Uninstall

Plugins → the `@local/paper-translator` card → **Remove**, then restart DeepSeek Harness. Translations cached on the host stay under `$DSH_HOME/paper-translator` (see [Data and privacy](#data-and-privacy)).

## First run

1. Click **Open project…** and choose the directory that contains `main.tex` (a native folder chooser opens; on environments without one, use **Enter path manually**).
2. If the project has several `.tex` files, pick the main file from the dropdown next to the project chip — the reader reloads the translation, source and PDF for that file.
3. Click **Retranslate all** in the command bar. Blocks translate in batches; the progress ring shows `done/total`, and finished blocks are cached.
4. Use the view switcher to read **Split**, **Translation**, **LaTeX** or **PDF**. In split mode the right pane can toggle between LaTeX and PDF.
5. If a TeX distribution is installed, **Compile PDF** builds the PDF and reloads the PDF pane.

## Using the reader

- **Click** a block to highlight it and its source/PDF counterpart. **J / K** move the active block, **E** edits it.
- **Edit** opens the paragraph editor: switch between Chinese and English, save and translate to rewrite the `.tex` source, or use the bundled *Best-Paper-Writing* polish pass to tighten the prose before saving.
- The **status bar** shows translated segment count, cache hits and the running cost of the current paper; click it for the input/output/cache/call breakdown and the global total. The **Sync scroll** toggle lives on the right of the same bar.
- **⋯ → Settings** opens the settings panel: target language, glossary (JSON), usage, and cache clearing.
- **⋯ → Rebuttal** opens the reviewer panel (see below).

## Reviewer reports

1. **⋯ → Rebuttal**. Each reviewer has a tab; add up to eight.
2. Paste one reviewer's report per tab and click **Translate and locate**. Every remark is translated and matched to the paragraph it refers to.
3. Click a match to jump to the paragraph; pinned markers appear next to the affected blocks and in the LaTeX gutter.
4. **Overview** summarises the reviewers' attitudes, the points several reviewers share, and the points only one raised.

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

- Translations, the usage ledger and the parsed-project cache live under `$DSH_HOME/paper-translator` (`~/.dsh/paper-translator` by default). **Settings → Clear this project / Clear all caches** clears them.
- Paper text leaves the machine only when you translate, polish or generate an overview, and only through the model route configured in DSH.
- The browser half talks to the host over the authenticated `/api/paper-translator/*` fetch routes; no third-party network calls are made.
- The PDF viewer ships with `pdfjs-dist`; its worker is served from `/paper-translator/pdf.worker.mjs`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| The sidebar entry or panel is missing | Check the bundle is enabled in **Plugins**, then fully restart DSH (a page refresh is not enough for a newly installed bundle). |
| “The environment cannot open a native folder picker” | Use **Enter path manually**; remote browsers have no OS chooser. |
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
dsh-paper-lens/
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
└── README.md
```

## Compatibility

- DeepSeek Harness `0.2.2-rc.3` is the verified release; the panel relies on the `main` keyed slot, `sidebar.panellist`, the `layout` service, the settings surface and the authenticated `/api` fetch registry.
- [`dsh-plugin-wallpaper-engine`](https://github.com/elysia395/dsh-wallpaper-engine) is supported through its public `body[data-we-wallpaper]` / `body[data-we-glass-page]` markers: the reader keeps a paper surface, participates in the glass runtime via `data-we-surface="v1"`, and preserves the white PDF canvas.
- No other plugin is required. The panel coexists with the wallpaper plugin's glass sub-row whether it is enabled or disabled.

## License

MIT for this plugin's own code — see [`LICENSE`](LICENSE). The bundled writing skill under `skills/best-paper-writing` keeps its own license and attribution files (`LICENSE`, `LICENSE-base-skill`, `NOTICE.md`), which are not covered by the MIT license above.

</details>
