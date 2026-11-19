<details>
<summary><b>简体中文</b></summary>

# 论文对照

**DeepSeek Harness 的中英双语 LaTeX 论文阅读插件。** 左侧中文译文，右侧 LaTeX 源码或 PDF；按段落翻译、按段落定位审稿意见，左右两侧都可以编辑并写回 `.tex` 源文件。

- 插件名：`@local/paper-translator`
- 版本：`0.3.0`
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

- **阅读与返修** —— 在顶部切换工作模式。在阅读栏头切换拆分、译文、LaTeX 或 PDF。窄窗口按上下排列论文与批注。
- **按段落翻译** —— 把 LaTeX 项目解析为段落块（章节、正文、图表标题、公式、列表），逐块调用 DSH 已配置的模型路由翻译。
- **逐块缓存与用量账本** —— 重新打开论文即可恢复已完成的译文；状态栏显示本文与全局的 token 与费用。
- **段落修订** —— 修改中文或英文，预览逐词差异后采纳，重新打开该段即可撤销。
- **可选本地编译** —— 本机装有 TeX 发行版时，工具栏的「编译」会用 `pdflatex` / `latexmk` / `xelatex` 生成 PDF。
- **返修意见** —— 最多八位审稿人，每位单独粘贴意见，自动翻译并定位到具体段落；点击即可在意见与段落之间跳转；「总览」汇总重叠意见、独有意见与审稿人态度。
- **项目术语** —— 选中正文术语即可指定译法并定位译文中需要核对的段落。目标语言支持 `zh-CN`、`zh-TW` 和 `en`。
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

插件页 → `@local/paper-translator` 卡片 → **移除**，然后重启 DeepSeek Harness。译文与返修记录保存在论文主文件旁（见[数据与隐私](#数据与隐私)）。

## 首次使用

1. 点击 **打开项目…**，选择包含 `main.tex` 的目录（会弹出系统目录选择器；不支持原生选择器的环境请用 **手动输入路径**）。
2. 若项目有多个 `.tex` 文件，用项目 chip 右侧的下拉框选择主文件 —— 译文、源码与 PDF 会一起切换到该文件。
3. 打开项目后会自动翻译缺少译文的段落。需要重新生成全部译文时，点 **重译全部**。进度环显示 `已完成/总数`，完成的段落会进入缓存。
4. 用视图切换器在 **拆分 / 译文 / 原文 / PDF** 之间切换；拆分模式下右栏可在 LaTeX 与 PDF 之间切换。
5. 本机装了 TeX 发行版时，点 **编译** 生成 PDF 并刷新 PDF 栏。

## 阅读与操作

- **点击**段落即可高亮它以及对应的源码/PDF 位置；**J / K** 切换当前段落，**E** 编辑当前段。
- **编辑** 打开段落草稿。点 **预览英文改动** 可检查增删内容，再点 **采纳并写回**。需要恢复时，在同一段的编辑器中点 **撤销本段上次修改**。
- **状态栏**显示已翻译段数、缓存命中与本文费用；点开可看输入/输出/缓存/调用明细与全局用量。右侧是 **跟随滚动** 开关。
- **⋯ → 设置** 提供项目术语、宋体阅读、目标语言和用量。选中正文里的英文术语后，也可以从底栏加入术语表。
- 有最新 PDF、SyncTeX 映射及命令行工具时，选择段落可定位到 PDF，双击 PDF 可回到对应源段。映射不可用时按篇幅估算页码。

## 返修意见

1. 打开顶部 **返修**，为每位审稿人粘贴一份报告，点击 **翻译并定位**。插件从整篇论文检索候选片段，并核对模型给出的原句。
2. 在右栏切换意见，左栏同步定位。可选择其他段落并点 **绑定当前选段**，也可将意见标为全文性意见或需要新增实验。
3. 点 **修改这一段**，用中文起草、预览并采纳英文。另一位审稿人提到同一处时，可在他的意见下关联本段已有修改。
4. 为每条意见填写回复并标记已回复。**总览** 优先列出尚待回复的共同意见，**导出逐点回复** 按审稿人生成 Markdown，保留待核对项和实验待办。

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
| `Cmd/Ctrl` + `Enter` | 预览或采纳当前段落修改 |

## 数据与隐私

- 主文件旁的 `<main>.paper-lens.review.json` 保存返修意见、回复、项目术语和已采纳的修改历史。首次打开时读取浏览器中的旧返修记录和术语。译文缓存和译稿分别存入 `<main>.paper-lens.json` 与 `<main>.paper-lens.md`，全局用量保存在 `$DSH_HOME/paper-translator/usage.json`。
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
- Version: `0.3.0`
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
- **Paragraph revisions** — preview English insertions and deletions, accept the displayed text, and undo the latest edit from the same paragraph.
- **Optional local compile** — compile the PDF with `pdflatex`, `latexmk` or `xelatex` from the toolbar when a TeX distribution is installed.
- **Reviewer reports** — keep up to eight reviewers, paste each report, translate and locate every remark against the paper, click to jump between remark and paragraph, and generate a cross-reviewer overview (overlaps, unique points, attitudes).
- **Project glossary** — select an English term, save its preferred translation, and inspect passages with a different rendering. Translation targets include `zh-CN`, `zh-TW` and `en`.
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

Plugins → the `@local/paper-translator` card → **Remove**, then restart DeepSeek Harness. Translations and review records stay beside the main manuscript (see [Data and privacy](#data-and-privacy)).

## First run

1. Click **Open project…** and choose the directory that contains `main.tex` (a native folder chooser opens; on environments without one, use **Enter path manually**).
2. If the project has several `.tex` files, pick the main file from the dropdown next to the project chip — the reader reloads the translation, source and PDF for that file.
3. Opening a project translates missing passages. Use **Retranslate all** to regenerate them all; the progress ring shows `done/total`, and finished blocks are cached.
4. Use the view switcher to read **Split**, **Translation**, **LaTeX** or **PDF**. In split mode the right pane can toggle between LaTeX and PDF.
5. If a TeX distribution is installed, **Compile PDF** builds the PDF and reloads the PDF pane.

## Using the reader

- **Click** a block to highlight it and its source/PDF counterpart. **J / K** move the active block, **E** edits it.
- **Edit** opens a Chinese or English draft. Choose **Preview English changes**, then **Accept and write**. Open the paragraph again to undo its latest edit.
- The **status bar** shows translated segment count, cache hits and the running cost of the current paper; click it for the input/output/cache/call breakdown and the global total. The **Sync scroll** toggle lives on the right of the same bar.
- **⋯ → Settings** contains the project glossary, serif reading font, translation target and usage. Selecting a term in the reader also opens a shortcut to the glossary.
- With a current PDF, a SyncTeX map and the SyncTeX executable, selecting a paragraph locates it in the PDF. Double-click a PDF location to select its source paragraph. Page estimates are used when a mapping is unavailable.

## Reviewer reports

1. Open **Review** and paste one report per reviewer. **Translate & map** retrieves candidate passages across the manuscript and verifies source excerpts.
2. Select a comment to display its passage alongside it. To correct a match, select a paragraph and choose **Bind selected passage**. General comments and requests for new experiments can be tracked independently.
3. **Revise passage** opens a linked editor. Accept the English change once and link it to another reviewer's comment when appropriate.
4. Write a response and mark it as replied. **Overview** prioritizes outstanding shared concerns. **Export response draft** downloads a Markdown file grouped by reviewer, with accepted edits and outstanding tasks.

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
| `Cmd/Ctrl` + `Enter` | Preview or accept the current edit |

## Data and privacy

- Reviewer reports, replies, preferred terms and accepted revisions are stored beside the main file in `<main>.paper-lens.review.json`. Existing browser review data and glossary entries migrate when the project is opened. Translation caches and the translated manuscript use `<main>.paper-lens.json` and `<main>.paper-lens.md`. The global ledger is in `$DSH_HOME/paper-translator/usage.json`.
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
