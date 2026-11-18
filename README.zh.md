# 论文对照 · Paper Lens

**DeepSeek Harness 的中英双语 LaTeX 论文阅读插件。** 左侧中文译文，右侧 LaTeX 源码或 PDF；按段落翻译、按段落定位审稿意见，左右两侧都可以编辑并写回 `.tex` 源文件。

[English](README.md) | 中文

- 插件名：`@local/paper-translator`
- 版本：`0.2.0`
- 已验证：DeepSeek Harness `0.2.2-rc.3`（Desktop，profile `desktop`）与 Web profile
- 运行时依赖：无（浏览器端 bundle 已预构建，Host 端只用 Node 内置模块）

---

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

---

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

1. 把本目录放到一个**固定位置**，例如 `~/Documents/projects/paper-lens`。安装后**不要移动或删除它**：本地安装是「链接」到该目录，而不是复制。
2. 打开 DeepSeek Harness。
3. 侧栏 → **插件 / Plugins** → **添加插件 / Add plugin** → **安装第三方插件 / Install third-party plugin**。
4. 选择「本地目录」，指向本文件夹（也可以输入 `link:/绝对路径/paper-lens`）。
5. 若对话框提供「立即启用」就启用，然后**完全退出 DeepSeek Harness 再重新打开** —— 客户端 bundle 在启动时组装，运行中的窗口不会热加载。
6. 左侧栏出现 **论文对照 / Paper Lens**。

### 方式二：命令行

```bash
# 桌面端
dsh plugin --profile desktop add link:/绝对路径/paper-lens

# dsh web
dsh plugin --profile web add link:/绝对路径/paper-lens
```

正式版 Desktop 不会把 `dsh` 放进 `PATH`。为避免用不同版本改写 profile，请锁定与 App 相同的版本：

```bash
npx -y @deepseek-ai/dsh@0.2.2-rc.3 plugin --profile desktop add link:/绝对路径/paper-lens
```

安装完成后重启 DeepSeek Harness。

### 方式三：从 Git 仓库安装

```bash
dsh plugin --profile desktop add github:<owner>/<repo>
```

### 验证安装

- **插件 / Plugins** 列表中出现该 bundle，且行 `paper-translator` 已启用。
- 点击侧栏入口能打开面板：顶部是项目 chip、视图切换、进度环与操作按钮。
- 未打开项目时，面板显示 **打开项目… / Open project…**。

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
paper-lens/
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
└── README.md / README.zh.md
```

## 兼容性

- 已验证 DeepSeek Harness `0.2.2-rc.3`；面板依赖 `main` keyed slot、`sidebar.panellist`、`layout` 服务、设置界面与带鉴权的 `/api` fetch 注册表。
- 支持 [`dsh-plugin-wallpaper-engine`](https://github.com/elysia395/dsh-wallpaper-engine)：通过其公开的 `body[data-we-wallpaper]` / `body[data-we-glass-page]` 标记，阅读区保留纸张底板，并用 `data-we-surface="v1"` 加入玻璃运行时，同时让 PDF 白底保持原样。
- 不依赖其他插件；壁纸插件的玻璃子行开启或关闭都能正常共存。

## 许可证

本插件自身代码采用 MIT，见 [`LICENSE`](LICENSE)。`skills/best-paper-writing` 下的写作技能保留其自带的许可与署名文件（`LICENSE`、`LICENSE-base-skill`、`NOTICE.md`），不在上述 MIT 许可范围内。
