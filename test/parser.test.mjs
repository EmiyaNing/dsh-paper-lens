import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseLatex } from '../src/host/parser.js'
import { loadProject } from '../src/host/project.js'

let passed = 0
async function test(name, fn) {
  try {
    await fn()
    passed += 1
    console.log('ok  ', name)
  } catch (error) {
    console.error('FAIL', name)
    console.error(error)
    process.exitCode = 1
  }
}

await test('headings and section tracking', () => {
  const result = parseLatex(String.raw`\begin{document}
\section{Intro}
Hello.
\subsection{Method}
World.
\end{document}`)
  assert.equal(result.blocks[0].kind, 'heading')
  assert.equal(result.blocks[0].text, 'Intro')
  assert.equal(result.blocks[1].section, 'Intro')
  assert.equal(result.blocks[3].section, 'Intro / Method')
})

await test('inline placeholders and escapes', () => {
  const result = parseLatex(String.raw`\begin{document}
We use $x^2$, \(a+b\), \cite{a,b}, \ref{fig:1}, \url{https://x} and 50\% accuracy.
\end{document}`)
  const block = result.blocks.find((item) => item.kind === 'paragraph')
  assert.equal((block.text.match(/⟦/g) ?? []).length, 5)
  assert.ok(block.text.includes('50% accuracy'))
  assert.equal(block.placeholders.filter((item) => item.type === 'M').length, 2)
  assert.equal(block.placeholders.find((item) => item.type === 'C').key, 'a,b')
})

await test('math env and display math become math blocks', () => {
  const result = parseLatex(String.raw`\begin{document}
Before.
\begin{equation}
E = mc^2
\end{equation}
After.
\[
y = x
\]
\end{document}`)
  const math = result.blocks.filter((item) => item.kind === 'math')
  assert.equal(math.length, 2)
  assert.equal(math[0].latex, 'E = mc^2')
  assert.equal(math[1].latex, 'y = x')
})

await test('list items split and caption captured', () => {
  const result = parseLatex(String.raw`\begin{document}
\begin{itemize}
\item One.
\item Two.
\end{itemize}
\begin{figure}
\includegraphics{x}
\caption{A caption.}
\end{figure}
\end{document}`)
  assert.deepEqual(result.blocks.filter((item) => item.kind === 'item').map((item) => item.text), ['One.', 'Two.'])
  const caption = result.blocks.find((item) => item.kind === 'caption')
  assert.equal(caption.text, 'A caption.')
  assert.equal(caption.label, 'Figure')
})

await test('macro expansion and dash normalization', () => {
  const result = parseLatex(String.raw`\newcommand{\method}{EvoGauss}
\begin{document}
\method gives camera--LiDAR results.
\end{document}`)
  const block = result.blocks.find((item) => item.kind === 'paragraph')
  assert.ok(block.text.includes('EvoGauss'))
  assert.ok(block.text.includes('camera–LiDAR'))
})

await test('comments are ignored, escaped percent is kept', () => {
  const result = parseLatex(String.raw`\begin{document}
A 50\% gain. % this should vanish
Next line.
\end{document}`)
  const block = result.blocks.find((item) => item.kind === 'paragraph')
  assert.ok(block.text.includes('50% gain.'))
  assert.ok(!block.text.includes('vanish'))
})

await test('include expansion and file mapping', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'paper-lens-test-'))
  await writeFile(join(dir, 'main.tex'), String.raw`\begin{document}
\section{Intro}
Main text.
\input{sec/body}
\end{document}`)
  await mkdir(join(dir, 'sec'))
  await writeFile(join(dir, 'sec', 'body.tex'), String.raw`\subsection{Body}
Included text.
`)
  const project = await loadProject(dir, 'main.tex')
  const included = project.blocks.find((item) => item.text === 'Included text.')
  assert.ok(included)
  assert.equal(included.file, 'sec/body.tex')
  assert.equal(included.fileLine, 2)
})

await test('IEEEtran keywords, biography and proof environments', () => {
  const result = parseLatex(String.raw`\begin{document}
\section{Intro}
Text.
\begin{IEEEkeywords}
3D Gaussian splatting\sep sparse-view reconstruction\sep depth regularization
\end{IEEEkeywords}
\begin{IEEEbiography}[{\includegraphics[width=1in,height=1.25in]{authors/jane.jpg}}]{Jane Doe}
\IEEEPARstart{T}{his} is a short biography. She works on 3D vision.
\end{IEEEbiography}
\begin{IEEEbiographynophoto}{John Smith}
He works on Gaussian splatting.
\end{IEEEbiographynophoto}
\begin{IEEEproof}
The proof is straightforward.
\end{IEEEproof}
\begin{IEEEeqnarray}{rCl}
a &= b + c
\end{IEEEeqnarray}
\end{document}`)
  assert.equal(result.warnings.length, 0)
  const keywords = result.blocks.find((item) => item.kind === 'keywords')
  assert.ok(keywords)
  assert.equal(keywords.text, '3D Gaussian splatting, sparse-view reconstruction, depth regularization')
  assert.equal(keywords.section, 'Keywords')
  const jane = result.blocks.find((item) => item.section === 'Biography — Jane Doe')
  assert.ok(jane)
  assert.equal(jane.text, 'This is a short biography. She works on 3D vision.')
  const john = result.blocks.find((item) => item.section === 'Biography — John Smith')
  assert.ok(john)
  assert.equal(john.text, 'He works on Gaussian splatting.')
  assert.ok(result.blocks.some((item) => item.text === 'The proof is straightforward.'))
  const ieeeMath = result.blocks.find((item) => item.kind === 'math' && item.latex.includes('a &= b + c'))
  assert.ok(ieeeMath)
  assert.equal(ieeeMath.latex, 'a &= b + c')
})

console.log(`\n${passed} tests passed`)
