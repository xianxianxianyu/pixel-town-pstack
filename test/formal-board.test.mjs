// Standalone proof (after the normal build):
// OLD_TOWN_WORKFLOWS=/path/to/frozen/workflows.js CHROME_BIN=/path/to/chrome node --test test/formal-board.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { workflows } from '../lib/workflows.js'
import { boardProof } from './fixtures/board-proof.mjs'

const formal = ['create-formal-verification-skill', 'maintain-formal-verification-skill']
const names = ['形式化验证', '形式化巡检']

// Runs inside the parent page. Only the host boundary is a fixture: the iframe loads the
// shipped HTML, CSS, modules, polling, SVG/canvas rendering, and event handlers unchanged.
async function exerciseTown() {
  const frame = document.getElementById('board')
  const starts = []
  const fileOpens = []
  const errors = []
  const ids = ['create-formal-verification-skill', 'maintain-formal-verification-skill']
  let drain
  const must = (condition, message) => { if (!condition) throw new Error(message) }
  const until = async (read, label) => {
    const deadline = performance.now() + 8000
    while (performance.now() < deadline) {
      const value = read()
      if (value) return value
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error(`Timed out waiting for ${label}`)
  }
  // The barrier uses the same target's posted-message queue as the board's start request.
  const flushMessages = () => new Promise(resolve => {
    drain = resolve
    window.postMessage({ type: 'formal-board-proof/barrier' }, location.origin)
  })
  addEventListener('message', event => {
    if (event.origin !== location.origin) return
    if (event.source === window && event.data?.type === 'formal-board-proof/barrier') {
      drain()
      return
    }
    if (event.source !== frame.contentWindow) return
    if (event.data?.type === 'pixel-town-pstack/workspaces') {
      frame.contentWindow.postMessage({ type: 'pixel-town-pstack/workspaces', items: [
        { id: 'proof-workspace', title: 'Formal board fixture', path: '/fixture/formal-board' },
      ] }, location.origin)
    } else if (event.data?.type === 'pixel-town-pstack/start-session') starts.push(event.data)
    else if (event.data?.type === 'pixel-town-pstack/open-file') fileOpens.push(event.data)
  })
  const click = selector => {
    const win = frame.contentWindow, doc = frame.contentDocument
    const element = doc.querySelector(selector)
    must(element, `Missing click target: ${selector}`)
    const box = (element.querySelector('.station-hit') ?? element).getBoundingClientRect()
    must(box.width > 0 && box.height > 0, `Invisible click target: ${selector}`)
    const x = box.left + box.width / 2, y = box.top + box.height / 2
    const target = doc.elementFromPoint(x, y)
    must(target && (target === element || element.contains(target)), `Obscured click target: ${selector}`)
    target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win, clientX: x, clientY: y }))
  }
  const close = async () => { click('#close-popover'); await flushMessages() }
  const layout = () => [...frame.contentDocument.querySelectorAll('[data-building="detective"] .station')].map(station => {
    const matrix = station.transform.baseVal.consolidate().matrix
    const hit = station.querySelector('.station-hit')
    const plate = station.querySelector('.station-plate').getBoundingClientRect()
    return {
      id: station.dataset.plaque, name: station.querySelector('.station-plate text').textContent,
      x: matrix.e, y: matrix.f, width: hit.width.baseVal.value, height: hit.height.baseVal.value,
      labelLeft: plate.left, labelRight: plate.right,
    }
  })
  const load = async mode => {
    await new Promise(resolve => { frame.onload = resolve; frame.src = `/${mode}/town/index.html?embed=1` })
    frame.contentWindow.addEventListener('error', event => errors.push(event.message))
    frame.contentWindow.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
    await until(() => frame.contentWindow.PstackBoard?.connection.status === 'live', `${mode} board response`)
    // A real old workflow is the readiness control, not an invented workspace-ready flag.
    click('#plaque-interrogate')
    await until(() => frame.contentDocument.querySelector('[data-action="start-session"]'), `${mode} workspace handshake`)
    await close()
  }
  const openFormal = async id => {
    click(`#plaque-${id}`)
    await flushMessages()
    const doc = frame.contentDocument
    must(doc.querySelector('#town-popover').open, `${id} did not open its dialog`)
    return {
      id, title: doc.querySelector('#popover-title').textContent,
      hint: doc.querySelector('.plaque-hint')?.textContent,
      hasStart: Boolean(doc.querySelector('[data-action="start-session"]')),
      command: doc.querySelector('[data-control="command"]')?.value ?? null,
    }
  }
  try {
    await load('old')
    const oldLayout = layout()
    // Positive control in the old host itself: the same bridge and workspace really launch.
    click('#plaque-interrogate')
    click('[data-action="start-session"]')
    await flushMessages()
    const oldControl = starts.splice(0)
    await close()
    const old = []
    for (const id of ids) { old.push(await openFormal(id)); await close() }
    await flushMessages()
    const oldStarts = starts.splice(0)

    await load('new')
    const newLayout = layout()
    const allPlaques = [...frame.contentDocument.querySelectorAll('.station')].map(station => station.dataset.plaque)
    const current = []
    for (const id of ids) {
      current.push(await openFormal(id))
      const select = frame.contentDocument.querySelector('#plaque-workspace')
      must(select, `${id} has no workspace selector`)
      select.value = 'proof-workspace'
      select.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }))
      click('[data-action="start-session"]')
      await flushMessages()
      await close()
    }
    const newStarts = starts.splice(0)
    // Finished work has already left the map; both recent-leaver lists must still open its charts.
    for (const entry of ['#map-gate', '#map-notice']) {
      click(entry)
      const chartButtons = [...frame.contentDocument.querySelectorAll('.leaver [data-open-file]')]
      must(chartButtons.length === 2, `${entry}: expected charts for two finished sessions, not the old-host row`)
      for (const button of chartButtons) {
        click(`[data-open-file="${button.dataset.openFile}"]`)
        await flushMessages()
      }
      await close()
    }
    click('#map-notice')
    click('[data-action="help"]')
    const help = frame.contentDocument.querySelector('#info-content').textContent

    // The advertised skill, not a command inferred from the plaque ID, is authoritative.
    await load('advertised')
    const advertised = []
    for (const id of ids) {
      advertised.push(await openFormal(id))
      click('[data-action="start-session"]')
      await flushMessages()
      await close()
    }
    const advertisedStarts = starts.splice(0)
    await fetch('/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      oldLayout, newLayout, allPlaques, oldControl, old, oldStarts, current, newStarts, advertised, advertisedStarts, help, errors, fileOpens,
    }) })
  } catch (error) {
    await fetch('/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.stack }) })
  }
}

test('formal plaques render 3+4 and launch only workflows advertised by the host', { timeout: 45000 }, async t => {
  const oldCatalog = process.env.OLD_TOWN_WORKFLOWS
    ? (await import(pathToFileURL(process.env.OLD_TOWN_WORKFLOWS).href)).workflows
    : workflows.filter(workflow => !formal.includes(workflow.id))
  assert.ok(oldCatalog.some(workflow => workflow.id === 'interrogate'))
  assert.ok(formal.every(id => !oldCatalog.some(workflow => workflow.id === id)), 'old host must omit both new workflows')
  for (const id of formal) assert.equal(workflows.find(workflow => workflow.id === id)?.skill, `pstack-${id}`)
  const payload = catalog => ({ workflows: catalog, sessions: [] })
  const fixtures = new Map([
    ['old', payload(oldCatalog)], ['new', payload(workflows)],
    ['advertised', payload(workflows.map(workflow => formal.includes(workflow.id)
      ? { ...workflow, skill: `host-advertised-${workflow.id}` } : workflow))],
  ])
  fixtures.get('new').sessions = [
    { sessionId: 'finished-a', title: 'Finished A', workflow: formal[0], stage: 'handoff', status: 'finished', finishedAt: 3,
      canvas: { path: '/fixture/a.mmd', at: 3 } },
    { sessionId: 'finished-b', title: 'Finished B', workflow: formal[0], stage: 'handoff', status: 'finished', finishedAt: 2,
      canvas: { path: '/fixture/b.mmd', at: 2 } },
    { sessionId: 'finished-old', title: 'Old host', workflow: formal[0], stage: 'handoff', status: 'finished', finishedAt: 1 },
  ].map(session => ({ skipped: [], subagentCount: 0, ...session }))
  const { evidence, requests } = await boardProof({ fixtures, exercise: exerciseTown, title: 'Formal board proof' })
  assert.equal(evidence.error, undefined, evidence.error)
  assert.deepEqual(evidence.errors, [])
  assert.deepEqual(evidence.fileOpens, Array.from({ length: 2 }, () => [
    { type: 'pixel-town-pstack/open-file', sessionId: 'finished-a', path: '/fixture/a.mmd' },
    { type: 'pixel-town-pstack/open-file', sessionId: 'finished-b', path: '/fixture/b.mmd' },
  ]).flat())
  assert.equal(evidence.allPlaques.length, 18)
  assert.ok(!evidence.allPlaques.includes('statechart') && !evidence.allPlaques.includes('pstack-statechart'))
  for (const layout of [evidence.oldLayout, evidence.newLayout]) {
    assert.equal(layout.length, 7)
    const rows = [...new Set(layout.map(station => station.y))].sort((a, b) => a - b)
    assert.equal(rows.length, 2)
    assert.deepEqual(rows.map(y => layout.filter(station => station.y === y).length), [3, 4])
    assert.deepEqual(layout.map(station => station.id), [
      'interrogate', 'blast-radius', 'eval', 'create-verification-skill', 'maintain-verification-skill', ...formal,
    ])
    for (const station of layout) {
      assert.ok(station.width > 0 && station.height > 0)
      assert.ok(station.x >= 284 && station.x + station.width <= 460, `${station.id} inside detective room horizontally`)
      assert.ok(station.y >= 12 && station.y + station.height <= 124, `${station.id} inside detective room vertically`)
    }
    for (const y of rows) {
      const row = layout.filter(station => station.y === y).sort((a, b) => a.x - b.x)
      for (let i = 1; i < row.length; i++) {
        assert.ok(row[i - 1].x + row[i - 1].width <= row[i].x, 'station hit areas must not overlap')
        assert.ok(row[i - 1].labelRight <= row[i].labelLeft, 'rendered plaque labels must not overlap')
      }
    }
    assert.ok(rows[0] + Math.max(...layout.filter(station => station.y === rows[0]).map(station => station.height)) <= rows[1])
    assert.deepEqual(layout.slice(-2).map(station => station.name), names)
  }
  assert.deepEqual(evidence.oldControl, [{ type: 'pixel-town-pstack/start-session', skill: oldCatalog.find(workflow => workflow.id === 'interrogate').skill }])
  assert.deepEqual(evidence.oldStarts, [], 'old host formal plaque clicks must not post start-session')
  assert.deepEqual(evidence.old, formal.map((id, index) => ({
    id, title: names[index], hint: '还没接入 DSH，暂时不能从这里开工。', hasStart: false, command: null,
  })))
  for (const [index, id] of formal.entries()) {
    assert.equal(evidence.current[index].title, names[index])
    assert.equal(evidence.current[index].hasStart, true)
    assert.equal(evidence.current[index].command, `/pstack-${id}`)
    assert.equal(evidence.advertised[index].command, `/host-advertised-${id}`)
    assert.ok(evidence.help.includes(names[index]))
  }
  assert.deepEqual(evidence.newStarts, formal.map(id => ({ type: 'pixel-town-pstack/start-session', skill: `pstack-${id}`, workspaceId: 'proof-workspace' })))
  assert.deepEqual(evidence.advertisedStarts, formal.map(id => ({ type: 'pixel-town-pstack/start-session', skill: `host-advertised-${id}` })))
  for (const mode of fixtures.keys()) assert.ok(requests.includes(`GET /${mode}/board`), `${mode} used real board polling`)
  assert.deepEqual(requests.filter(request => !request.startsWith('GET ')), ['POST /result'])
  t.diagnostic(JSON.stringify({ oldCatalog: process.env.OLD_TOWN_WORKFLOWS ?? 'current catalog minus formal workflows',
    layout: evidence.newLayout.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
    oldHints: evidence.old.map(({ id, hint }) => ({ id, hint })), oldStartPosts: evidence.oldStarts.length,
    oldControl: evidence.oldControl, newStarts: evidence.newStarts, advertisedStarts: evidence.advertisedStarts }))
})
