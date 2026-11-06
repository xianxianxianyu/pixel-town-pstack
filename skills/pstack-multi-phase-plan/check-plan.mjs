#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import process from 'node:process'

const requiredSections = [
  'How to read this',
  'Program checklist',
  'Dependency graph',
  'Close',
  'Appendix A. Prototype evidence',
  'Appendix B. Alternatives rejected',
  'Appendix C. Risks',
  'Appendix D. Links and reading list',
]
const phaseId = /^P[1-9]\d*$/u
const file = process.argv[2]
const problems = []
const fail = (line, message) => problems.push({ line, message })

function report(phaseCount) {
  problems.sort((a, b) => a.line - b.line)
  for (const { line, message } of problems) console.log(`${file ?? '<input>'}:${line}: ${message}`)
  console.log(`${phaseCount} phase${phaseCount === 1 ? '' : 's'}, ${problems.length} problem${problems.length === 1 ? '' : 's'}`)
}

if (process.argv.length !== 3) {
  fail(1, 'usage: node check-plan.mjs <plan>')
  report(0)
  process.exit(2)
}

let source
try {
  source = readFileSync(file, 'utf8')
} catch (error) {
  fail(1, `cannot read plan (${error.code})`)
  report(0)
  process.exit(2)
}

// Fenced examples are not plan headings or checkboxes. Placeholders still count.
let fence = null
const lines = source.split(/\r?\n/u).map((text, index) => {
  const line = { text, n: index + 1, code: Boolean(fence) }
  for (const match of text.matchAll(/<[^<>\r\n]+>/gu)) {
    if (/^<[a-z][a-z\d+.-]*:[^\s<>]*>$/iu.test(match[0])) continue // Markdown URI autolinks are filled references.
    fail(line.n, `unfilled placeholder ${JSON.stringify(match[0])}`)
  }
  if (fence) {
    const close = text.match(/^ {0,3}(`+|~+)[ \t]*$/u)
    if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null
  } else {
    const open = text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u)
    if (open && (open[1][0] !== '`' || !open[2].includes('`'))) {
      fence = open[1]
      line.code = true
    }
  }
  return line
})

const headings = []
const sections = []
for (const line of lines) {
  if (line.code) continue
  const match = line.text.match(/^ {0,3}(#{1,3})[ \t]+(.+?)[ \t]*$/u)
  if (!match) continue
  const heading = { ...line, level: match[1].length, title: match[2].replace(/[ \t]+#+$/u, '') }
  headings.push(heading)
  if (heading.level === 2) sections.push(heading)
}

const titles = headings.filter(heading => heading.level === 1)
if (!titles.length) fail(1, 'missing "# <Outcome> plan" title')
for (const title of titles.slice(1)) fail(title.n, 'duplicate level-one title')
if (titles.length && sections.length && titles[0].n > sections[0].n) fail(titles[0].n, 'title must precede all sections')

const phases = []
const seenSections = new Set()
let lastRank = -1
for (let index = 0; index < sections.length; index++) {
  const section = sections[index]
  const phase = section.title.match(/^.+[ \t]+\((P[1-9]\d*)\)$/u)
  const requiredIndex = requiredSections.indexOf(section.title)
  let rank
  if (phase) {
    rank = 3
    phases.push({
      id: phase[1],
      n: section.n,
      end: sections[index + 1]?.n ?? lines.length + 1,
      dependencies: [],
      dependencyLine: section.n,
    })
  } else if (requiredIndex !== -1) {
    rank = requiredIndex < 3 ? requiredIndex : requiredIndex + 1
    if (seenSections.has(section.title)) {
      fail(section.n, `duplicate heading "## ${section.title}"`)
      continue
    }
    seenSections.add(section.title)
  } else {
    fail(section.n, `unrecognized heading "## ${section.title}"; phases need a "(P1)"-style ID`)
    continue
  }
  if (rank < lastRank) fail(section.n, `heading "## ${section.title}" is out of order`)
  else lastRank = rank
}
for (const title of requiredSections) {
  if (!seenSections.has(title)) fail(1, `missing heading "## ${title}"`)
}
if (!phases.length) fail(1, 'missing phase heading with a "(P1)"-style ID')

const byId = new Map()
for (const phase of phases) {
  if (byId.has(phase.id)) fail(phase.n, `duplicate phase ID ${phase.id}`)
  else byId.set(phase.id, phase)

  const subheadings = headings.filter(heading => heading.level === 3 && heading.n > phase.n && heading.n < phase.end)
  const seen = new Set()
  let last = -1
  for (const heading of subheadings) {
    const rank = ['Change', 'Verify'].indexOf(heading.title)
    if (rank === -1) continue
    if (seen.has(heading.title)) fail(heading.n, `duplicate heading "### ${heading.title}" in phase ${phase.id}`)
    else if (rank < last) fail(heading.n, `heading "### ${heading.title}" is out of order in phase ${phase.id}`)
    seen.add(heading.title)
    last = Math.max(last, rank)
  }
  for (const title of ['Change', 'Verify']) {
    if (!seen.has(title)) fail(phase.n, `missing heading "### ${title}" in phase ${phase.id}`)
  }

  const dependencyLines = lines.slice(phase.n, phase.end - 1).filter(line => !line.code && /^[ \t]*依赖[ \t]*:/u.test(line.text))
  if (!dependencyLines.length) fail(phase.n, `phase ${phase.id} needs "依赖: 无" or "依赖: P1, P2"`)
  for (const duplicate of dependencyLines.slice(1)) fail(duplicate.n, `duplicate dependency line in phase ${phase.id}`)
  if (!dependencyLines.length) continue
  const dependency = dependencyLines[0]
  phase.dependencyLine = dependency.n
  const value = dependency.text.slice(dependency.text.indexOf(':') + 1).trim()
  if (value === '无') continue
  const ids = value.split(',').map(id => id.trim())
  if (!ids.every(id => phaseId.test(id))) {
    fail(dependency.n, `phase ${phase.id} dependencies must be comma-separated P IDs or 无`)
    continue
  }
  phase.dependencies = [...new Set(ids)]
}
for (const phase of phases) {
  for (const id of phase.dependencies) {
    if (!byId.has(id)) fail(phase.dependencyLine, `phase ${phase.id} depends on unknown phase ${id}`)
  }
}

const visited = new Set()
const active = new Set()
const path = []
function visit(phase) {
  if (visited.has(phase.id)) return
  active.add(phase.id)
  path.push(phase.id)
  for (const id of phase.dependencies) {
    if (!byId.has(id)) continue
    if (active.has(id)) {
      const cycle = [...path.slice(path.indexOf(id)), id].join(' -> ')
      fail(phase.dependencyLine, `dependency cycle: ${cycle}`)
    } else visit(byId.get(id))
  }
  path.pop()
  active.delete(phase.id)
  visited.add(phase.id)
}
for (const phase of byId.values()) visit(phase)

for (let index = 0; index < lines.length; index++) {
  const line = lines[index]
  if (line.code) continue
  const box = line.text.match(/^([ \t]*)- \[ \](?:[ \t]+(.*))?$/u)
  if (!box) continue
  const indent = box[1].length
  const content = [box[2] ?? '']
  let nestedIndent = null
  for (let next = index + 1; next < lines.length; next++) {
    const continuation = lines[next]
    if (!continuation.text.trim()) continue
    const indentation = continuation.text.match(/^[ \t]*/u)[0].length
    if (indentation <= indent) break
    if (/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/u.test(continuation.text)) {
      nestedIndent = nestedIndent === null ? indentation : Math.min(nestedIndent, indentation)
      continue
    }
    if (nestedIndent !== null && indentation > nestedIndent) continue
    nestedIndent = null
    if (!continuation.code) content.push(continuation.text.trim())
  }
  if (!/(?:^|[^\p{L}\p{N}_])Evidence:\s*\S/u.test(content.join('\n'))) fail(line.n, 'unchecked box needs a nonempty "Evidence:" marker')
}

report(phases.length)
process.exitCode = problems.length ? 1 : 0
