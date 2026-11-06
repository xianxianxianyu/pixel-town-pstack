import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const checker = fileURLToPath(new URL('../skills/pstack-multi-phase-plan/check-plan.mjs', import.meta.url))
const validPlan = `# Release plan

## How to read this
Check boxes only with evidence.
## Program checklist
- [ ] Record go. Evidence: chat instruction.
## Dependency graph
P1 is independent.
## Ship the change (P1)
依赖: 无
Files: src/run.ts.
### Change
- [ ] Change run. Evidence: diff.
### Verify
- [ ] Drive CLI. Evidence: output.txt.
## Close
- [ ] Hand back. Evidence: report.txt.
## Appendix A. Prototype evidence
No open questions.
## Appendix B. Alternatives rejected
Keep the existing public entry point.
## Appendix C. Risks
No cross-phase breakage.
## Appendix D. Links and reading list
src/run.ts.
`

function assertPlan(source, problems = [], phaseCount = 1) {
  const directory = mkdtempSync(join(tmpdir(), 'pstack-check-plan-'))
  try {
    writeFileSync(join(directory, 'plan.md'), source)
    const result = spawnSync(process.execPath, [checker, 'plan.md'], { cwd: directory, encoding: 'utf8' })
    assert.equal(result.error, undefined)
    assert.equal(result.status, problems.length ? 1 : 0, result.stdout + result.stderr)
    const summary = `${phaseCount} phase${phaseCount === 1 ? '' : 's'}, ${problems.length} problem${problems.length === 1 ? '' : 's'}`
    assert.equal(result.stdout, [...problems.map(([line, message]) => `plan.md:${line}: ${message}`), summary, ''].join('\n'))
    assert.equal(result.stderr, '')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function phase(id, dependencies = '无') {
  return `## Publish command (${id})
依赖: ${dependencies}
Files: src/publish.ts.
### Change
- [ ] Publish command. Evidence: publish.diff.
### Verify
- [ ] Drive publish. Evidence: publish.txt.
`
}

function withPhases(...sections) {
  return validPlan.replace('## Close', sections.join('') + '## Close')
}

const missingEvidence = 'unchecked box needs a nonempty "Evidence:" marker'

test('accepts the minimal skeleton through the CLI', () => {
  assertPlan(validPlan)
  assertPlan(validPlan.replaceAll('\n', '\r\n'))
})

for (const heading of [
  'How to read this', 'Program checklist', 'Dependency graph', 'Close',
  'Appendix A. Prototype evidence', 'Appendix B. Alternatives rejected',
  'Appendix C. Risks', 'Appendix D. Links and reading list',
]) {
  test(`reports a missing ${heading} heading at the document boundary`, () => {
    assertPlan(validPlan.replace(`## ${heading}`, heading), [[1, `missing heading "## ${heading}"`]])
  })
}

test('requires a title before all sections', () => {
  assertPlan(validPlan.replace('# Release plan', 'Release plan'), [[1, 'missing "# <Outcome> plan" title']])
  assertPlan(validPlan.replace('# Release plan', 'Release plan').replace('Check boxes only with evidence.', '# Release plan'), [
    [4, 'title must precede all sections'],
  ])
  assertPlan(validPlan.replace('Check boxes only with evidence.', '# Another plan'), [[4, 'duplicate level-one title']])
})

test('reports duplicate and misordered top-level headings at their actual lines', () => {
  assertPlan(validPlan.replace('Check boxes only with evidence.', '## How to read this'), [[4, 'duplicate heading "## How to read this"']])
  assertPlan(validPlan.replace('## How to read this', '## Program checklist').replace('## Program checklist\n- [ ]', '## How to read this\n- [ ]'), [
    [5, 'heading "## How to read this" is out of order'],
  ])
  assertPlan(validPlan.replace('## Appendix A. Prototype evidence', phase('P2', 'P1') + '## Appendix A. Prototype evidence'), [
    [18, 'heading "## Publish command (P2)" is out of order'],
  ], 2)
})

test('requires at least one phase and the current parenthesized P-ID style', () => {
  const withoutPhase = validPlan.replace(/## Ship the change \(P1\)\n[\s\S]*?(?=## Close)/u, '')
  assertPlan(withoutPhase, [[1, 'missing phase heading with a "(P1)"-style ID']], 0)
  for (const id of ['P0', 'P01', 'PR1']) {
    assertPlan(validPlan.replace('(P1)', `(${id})`), [
      [1, 'missing phase heading with a "(P1)"-style ID'],
      [9, `unrecognized heading "## Ship the change (${id})"; phases need a "(P1)"-style ID`],
    ], 0)
  }
})

test('requires unique phase IDs without requiring consecutive numbering', () => {
  assertPlan(withPhases(phase('P1')), [[16, 'duplicate phase ID P1']], 2)
  assertPlan(withPhases(phase('P12', 'P1')), [], 2)
})

for (const heading of ['Change', 'Verify']) {
  test(`requires ${heading} inside every phase`, () => {
    assertPlan(validPlan.replace(`### ${heading}`, heading), [[9, `missing heading "### ${heading}" in phase P1`]])
    assertPlan(withPhases(phase('P2').replace(`### ${heading}`, heading)), [[16, `missing heading "### ${heading}" in phase P2`]], 2)
  })
}

test('reports duplicate and reversed phase subheadings at their actual lines', () => {
  assertPlan(validPlan.replace('- [ ] Change run. Evidence: diff.', '### Change'), [[13, 'duplicate heading "### Change" in phase P1']])
  assertPlan(validPlan.replace('### Change', '### Verify').replace('### Verify\n- [ ] Drive', '### Change\n- [ ] Drive'), [
    [14, 'heading "### Change" is out of order in phase P1'],
  ])
})

test('reports every angle-bracket placeholder, including in fenced examples', () => {
  assertPlan(validPlan.replace('Files: src/run.ts.', 'Files: <path> and <owned boundary>.'), [
    [11, 'unfilled placeholder "<path>"'],
    [11, 'unfilled placeholder "<owned boundary>"'],
  ])
  assertPlan(validPlan + '```sh\nrun <input>\n```\n', [[27, 'unfilled placeholder "<input>"']])
})

test('accepts filled Markdown URI autolinks in the reading list', () => {
  assertPlan(validPlan + '<https://nodejs.org/api/fs.html>\n<urn:example:release-plan>\n')
})

test('accepts Evidence markers after punctuation without requiring English spacing', () => {
  assertPlan(validPlan.replace('Change run. Evidence: diff.', '修改接口。Evidence: diff.'))
  assertPlan(validPlan.replace('Change run. Evidence: diff.', 'Change run;Evidence: diff.'))
})

for (const box of [
  '- [ ] Change run.',
  '- [ ] Change run. Evidence:',
  '- [ ] Change run. Evidence:   ',
  '- [ ] Change run. evidence: diff.',
  '- [ ] Change run. NotEvidence: diff.',
  '- [ ]',
]) {
  test(`rejects an unchecked box without nonempty Evidence: ${JSON.stringify(box)}`, () => {
    assertPlan(validPlan.replace('- [ ] Change run. Evidence: diff.', box), [[13, missingEvidence]])
  })
}

test('accepts realistic live and performance evidence continuations', () => {
  assertPlan(validPlan.replace('- [ ] Drive CLI. Evidence: output.txt.', `- [ ] Live: start the CLI, wait for ready, submit a job, and observe completion.
  Evidence: receipts/cli.txt, revision abc123, compared with baseline def456.
- [ ] Perf: compare completed jobs for the same batch on baseline and head,
  or record why performance is not applicable. Evidence: receipts/perf.json.
- [ ] Review: record the decision.
  Evidence:
    receipts/review.txt at revision abc123.`))
})

test('does not borrow evidence from siblings or unindented paragraphs', () => {
  assertPlan(validPlan.replace('- [ ] Change run. Evidence: diff.', '- [ ] Change run.\n- [ ] Inspect callers. Evidence: callers.diff.'), [[13, missingEvidence]])
  assertPlan(validPlan.replace('- [ ] Change run. Evidence: diff.', '- [ ] Change run.\nEvidence: diff.'), [[13, missingEvidence]])
})

test('keeps nested boxes and parent continuations separate', () => {
  assertPlan(validPlan.replace('- [ ] Change run. Evidence: diff.', '- [ ] Change run.\n  - [ ] Update callers. Evidence: callers.diff.'), [[13, missingEvidence]])
  assertPlan(validPlan.replace('- [ ] Change run. Evidence: diff.', '- [ ] Change run.\n  - [ ] Update callers.\n  Evidence: parent.diff.'), [[14, missingEvidence]])
  assertPlan(validPlan.replace('- [ ] Change run. Evidence: diff.', `- [ ] Change run.
  - [ ] Update callers.
    Evidence: callers.diff.
  Evidence: parent.diff.`))
  assertPlan(validPlan.replace('- [ ] Change run. Evidence: diff.', '- [ ] Change run.\n  - Note. Evidence: unrelated.txt.'), [[13, missingEvidence]])
})

test('ignores checked boxes and fenced examples rather than treating them as plan structure', () => {
  assertPlan(validPlan.replace('- [ ] Change run. Evidence: diff.', '- [x] Change run.'))
  for (const [opening, closing] of [['```markdown', '```'], ['  ~~~markdown', '   ~~~~'], ['````markdown', '````']]) {
    assertPlan(validPlan + `${opening}\n## Example (P99)\n- [ ] Example without evidence.\n${closing}\n`)
  }
  assertPlan(validPlan.replace('## Dependency graph', '```markdown\n## Dependency graph\n```'), [[1, 'missing heading "## Dependency graph"']])
  assertPlan(validPlan.replace('- [ ] Change run. Evidence: diff.', '- [ ] Change run.\n  ```text\n  Evidence: example only.\n  ```'), [[13, missingEvidence]])
})

test('requires the dependency declaration rather than the obsolete English marker', () => {
  assertPlan(validPlan.replace('依赖: 无', 'Depends on: none.'), [[9, 'phase P1 needs "依赖: 无" or "依赖: P1, P2"']])
  assertPlan(withPhases(phase('P2').replace('依赖: 无\n', '')), [[16, 'phase P2 needs "依赖: 无" or "依赖: P1, P2"']], 2)
  assertPlan(validPlan.replace('Files: src/run.ts.', '依赖: 无'), [[11, 'duplicate dependency line in phase P1']])
})

for (const dependency of ['', 'none', '无, P1', 'P1 and P2', '(P1)', 'P0', 'P01', 'P1,']) {
  test(`rejects malformed dependencies ${JSON.stringify(dependency)}`, () => {
    assertPlan(validPlan.replace('依赖: 无', `依赖: ${dependency}`), [[10, 'phase P1 dependencies must be comma-separated P IDs or 无']])
  })
}

test('reports unknown IDs at the dependency declaration', () => {
  assertPlan(validPlan.replace('依赖: 无', '依赖: P9'), [[10, 'phase P1 depends on unknown phase P9']])
  assertPlan(withPhases(phase('P2', 'P8, P9')), [
    [17, 'phase P2 depends on unknown phase P8'],
    [17, 'phase P2 depends on unknown phase P9'],
  ], 2)
})

test('accepts disconnected roots, forward references, repeated edges, and a diamond DAG', () => {
  assertPlan(withPhases(phase('P2')), [], 2)
  assertPlan(withPhases(phase('P2', 'P1, P1')), [], 2)
  const diamond = withPhases(phase('P2', 'P4'), phase('P3', 'P4'), phase('P4'))
    .replace('依赖: 无', '依赖: P2, P3')
  assertPlan(diamond, [], 4)
})

test('detects self-dependencies and multi-phase cycles at their closing edges', () => {
  assertPlan(validPlan.replace('依赖: 无', '依赖: P1'), [[10, 'dependency cycle: P1 -> P1']])
  assertPlan(withPhases(phase('P2', 'P1')).replace('依赖: 无', '依赖: P2'), [[17, 'dependency cycle: P1 -> P2 -> P1']], 2)
  assertPlan(withPhases(phase('P2', 'P3'), phase('P3', 'P1')).replace('依赖: 无', '依赖: P2'), [
    [24, 'dependency cycle: P1 -> P2 -> P3 -> P1'],
  ], 3)
  assertPlan(withPhases(phase('P2', 'P3'), phase('P3', 'P2')), [[24, 'dependency cycle: P2 -> P3 -> P2']], 3)
})

test('reports multiple cycle-closing edges deterministically', () => {
  assertPlan(withPhases(phase('P2', 'P1'), phase('P3', 'P1')).replace('依赖: 无', '依赖: P2, P3'), [
    [17, 'dependency cycle: P1 -> P2 -> P1'],
    [24, 'dependency cycle: P1 -> P3 -> P1'],
  ], 3)
})

test('checks structure, not the meaning of evidence or graph prose', () => {
  assertPlan(validPlan.replace('P1 is independent.', 'P1 -> P1 is an explanation, not a dependency declaration.')
    .replace('Evidence: output.txt.', 'Evidence: a planned receipt that has not been produced.'))
})

test('sorts diagnostics by source line with stable same-line ordering', () => {
  const broken = validPlan.replace('## How to read this', 'How to read this')
    .replace(' Evidence: chat instruction.', '')
    .replace('依赖: 无', '依赖: P9')
    .replace('Files: src/run.ts.', 'Files: <path> and <boundary>.')
  const problems = [
    [1, 'missing heading "## How to read this"'],
    [6, missingEvidence],
    [10, 'phase P1 depends on unknown phase P9'],
    [11, 'unfilled placeholder "<path>"'],
    [11, 'unfilled placeholder "<boundary>"'],
  ]
  assertPlan(broken, problems)
  assertPlan(broken, problems)
})

test('reports usage and read failures without a stack trace', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pstack-check-plan-cli-'))
  try {
    for (const [args, output] of [
      [[], '<input>:1: usage: node check-plan.mjs <plan>\n0 phases, 1 problem\n'],
      [['missing.md'], 'missing.md:1: cannot read plan (ENOENT)\n0 phases, 1 problem\n'],
    ]) {
      const result = spawnSync(process.execPath, [checker, ...args], { cwd: directory, encoding: 'utf8' })
      assert.equal(result.error, undefined)
      assert.equal(result.status, 2)
      assert.equal(result.stdout, output)
      assert.equal(result.stderr, '')
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
