// Standalone proof (after the normal build), against a frozen older host build:
// OLD_TOWN_LIB=/path/to/old/lib CHROME_BIN=/path/to/chrome node --test test/poteto-board.test.mjs
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DELIVERY_SKILL, LEGACY_WORKFLOW_IDS, workflows } from '../lib/workflows.js'
import { boardProof } from './fixtures/board-proof.mjs'

// The board payload exactly as a host build's own /board route answers it.
async function hostPayload(lib) {
  const { apply } = await import(pathToFileURL(join(lib, 'index.js')).href)
  const root = await mkdtemp(join(tmpdir(), 'poteto-board-host-'))
  try {
    let route
    const ctx = {
      tools: { register() {} }, sessions: { list: () => [] }, skills: { registerProvider() {} },
      get() {}, logger: { warn() {} }, on() {}, effect() {},
      inject(deps, run) {
        if (deps[0] === 'connection') run({ ...ctx, connection: { fetch: { register(value) { if (value.path === '/api/pixel-town-pstack/board') route = value } } } })
      },
    }
    apply(ctx, { root })
    return await (await route.fetch(new Request('http://localhost/api/pixel-town-pstack/board'))).json()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

// Runs inside the parent page around the shipped board in an iframe.
async function exerciseEntry() {
  const frame = document.getElementById('board')
  const starts = []
  const errors = []
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
  const flushMessages = () => new Promise(resolve => {
    drain = resolve
    window.postMessage({ type: 'poteto-board-proof/barrier' }, location.origin)
  })
  addEventListener('message', event => {
    if (event.origin !== location.origin) return
    if (event.source === window && event.data?.type === 'poteto-board-proof/barrier') { drain(); return }
    if (event.source !== frame.contentWindow) return
    if (event.data?.type === 'pixel-town-pstack/workspaces') {
      frame.contentWindow.postMessage({ type: 'pixel-town-pstack/workspaces', items: [
        { id: 'proof-workspace', title: 'Poteto board fixture', path: '/fixture/poteto-board' },
      ] }, location.origin)
    } else if (event.data?.type === 'pixel-town-pstack/start-session') starts.push(event.data)
  })
  const doc = () => frame.contentDocument
  const click = selector => {
    const win = frame.contentWindow
    const element = doc().querySelector(selector)
    must(element, `Missing click target: ${selector}`)
    const box = (element.querySelector('.station-hit') ?? element).getBoundingClientRect()
    must(box.width > 0 && box.height > 0, `Invisible click target: ${selector}`)
    const x = box.left + box.width / 2, y = box.top + box.height / 2
    const target = doc().elementFromPoint(x, y)
    must(target && (target === element || element.contains(target)), `Obscured click target: ${selector}`)
    target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win, clientX: x, clientY: y }))
  }
  const close = async () => { click('#close-popover'); await flushMessages() }
  const load = async mode => {
    await new Promise(resolve => { frame.onload = resolve; frame.src = `/${mode}/town/index.html?embed=1` })
    frame.contentWindow.addEventListener('error', event => errors.push(event.message))
    frame.contentWindow.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
    await until(() => frame.contentWindow.PstackBoard?.connection.status === 'live', `${mode} board response`)
    click('#plaque-investigation')
    await until(() => doc().querySelector('[data-action="start-session"]'), `${mode} workspace handshake`)
    await close()
  }
  const entry = () => {
    const button = doc().querySelector('#map-entry')
    const box = button.getBoundingClientRect(), stage = doc().querySelector('#town-stage').getBoundingClientRect()
    const label = button.querySelector('.map-object-label').getBoundingClientRect()
    const bubble = button.querySelector('.landmark-bubble'), bubbleBox = bubble.getBoundingClientRect()
    const note = doc().querySelector('#empty-state')
    return { hidden: button.hidden, width: box.width, height: box.height, text: button.querySelector('.map-object-label').textContent,
      inside: label.left >= stage.left && label.right <= stage.right && box.top >= stage.top && box.bottom <= stage.bottom,
      bubble: bubbleBox.width > 0 ? bubble.textContent : null,
      bubbleInside: bubbleBox.width > 0 && bubbleBox.left >= stage.left && bubbleBox.right <= stage.right && bubbleBox.top >= stage.top,
      emptyNote: note.hidden ? null : note.textContent }
  }
  const dialog = () => ({
    open: doc().querySelector('#town-popover').open, title: doc().querySelector('#popover-title').textContent,
    chip: doc().querySelector('#popover-chip').hidden ? null : doc().querySelector('#popover-chip').textContent,
    hint: doc().querySelector('.plaque-hint')?.textContent ?? null,
    hasStart: Boolean(doc().querySelector('[data-action="start-session"]')),
    command: doc().querySelector('[data-control="command"]')?.value ?? null,
  })
  const start = async () => {
    const select = doc().querySelector('#plaque-workspace')
    must(select, 'start form has no workspace selector')
    select.value = 'proof-workspace'
    select.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }))
    click('[data-action="start-session"]')
    await flushMessages()
  }
  const construction = () => [...doc().querySelectorAll('[data-building="construction"] .station')].map(station => {
    const matrix = station.transform.baseVal.consolidate().matrix
    const hit = station.querySelector('.station-hit'), plate = station.querySelector('.station-plate').getBoundingClientRect()
    return { id: station.dataset.plaque, name: station.querySelector('.station-plate text').textContent, x: matrix.e, y: matrix.f,
      width: hit.width.baseVal.value, height: hit.height.baseVal.value, labelLeft: plate.left, labelRight: plate.right }
  })
  try {
    await load('old')
    const oldEntry = entry()
    click('#plaque-figure-it-out')
    await flushMessages()
    const oldFigure = dialog()
    await close()
    const oldStarts = starts.splice(0)

    await load('new')
    const newEntry = entry()
    const layout = construction()
    click('#map-entry')
    await flushMessages()
    const entryPanel = { ...dialog(), expanded: doc().querySelector('#map-entry').getAttribute('aria-expanded'), bubble: entry().bubble }
    await start()
    const entryStarts = starts.splice(0)
    await close()
    const focusReturned = doc().activeElement?.id === 'map-entry'
    click('#plaque-figure-it-out')
    await flushMessages()
    const figure = dialog()
    await start()
    await close()
    const figureStarts = starts.splice(0)
    click('#map-notice')
    click('[data-action="help"]')
    const help = doc().querySelector('#info-content').textContent

    await load('advertised')
    const advertisedEntry = entry()
    click('#map-entry')
    await flushMessages()
    const advertised = dialog()
    click('[data-action="start-session"]')
    await flushMessages()
    const advertisedStarts = starts.splice(0)
    await fetch('/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      oldEntry, oldFigure, oldStarts, newEntry, layout, entryPanel, entryStarts, focusReturned, figure, figureStarts, help, advertisedEntry, advertised, advertisedStarts, errors,
    }) })
  } catch (error) {
    await fetch('/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.stack }) })
  }
}

test('许愿池 starts poteto mode only for a host advertising the entry skill, invites while the town is empty, and 想办法 completes 工地 as 3+3', { timeout: 45000 }, async t => {
  const current = await hostPayload(fileURLToPath(new URL('../lib/', import.meta.url)))
  assert.equal(current.entrySkill, 'pstack-poteto-mode')
  const old = process.env.OLD_TOWN_LIB ? await hostPayload(process.env.OLD_TOWN_LIB)
    : { workflows: workflows.filter(workflow => workflow.id !== 'figure-it-out'), deliverySkill: DELIVERY_SKILL, legacyWorkflowIds: LEGACY_WORKFLOW_IDS, sessions: [] }
  assert.equal(Object.hasOwn(old, 'entrySkill'), false, 'the older host advertises no entry skill')
  assert.equal(old.workflows.some(workflow => workflow.id === 'figure-it-out'), false, 'the older host predates figure-it-out')
  // One resident in the advertised town: the well stops inviting once somebody is at work.
  const resident = { sessionId: 'proof-resident', title: '添加搜索筛选', cwd: '/fixture/poteto-board', workflow: 'feature', stage: 'build', status: 'working',
    skill: null, detail: '', subagentCount: 0, skipped: [], needs: null, gag: null, startedAt: Date.now(), stageEnteredAt: Date.now(), lastEventAt: Date.now(), history: [] }
  const fixtures = new Map([['old', old], ['new', current], ['advertised', { ...current, entrySkill: 'host-advertised-entry', sessions: [resident] }]])
  const { evidence, requests } = await boardProof({ fixtures, exercise: exerciseEntry, title: 'Poteto board proof' })
  assert.equal(evidence.error, undefined, evidence.error)
  assert.deepEqual(evidence.errors, [])

  assert.deepEqual(evidence.oldEntry, { hidden: true, width: 0, height: 0, text: '许愿池', inside: false, bubble: null, bubbleInside: false, emptyNote: '还没有会话在跑' }, 'old host: inert well, plain empty-state note')
  assert.equal(evidence.oldFigure.hint, '还没接入 DSH，暂时不能从这里开工。')
  assert.equal(evidence.oldFigure.hasStart, false)
  assert.deepEqual(evidence.oldStarts, [], 'old host posts no start request')

  assert.equal(evidence.newEntry.hidden, false)
  assert.ok(evidence.newEntry.width > 0 && evidence.newEntry.height > 0 && evidence.newEntry.inside, 'the well is clickable inside the town')
  assert.equal(evidence.newEntry.bubble, '想做什么？许个愿吧', 'an empty town shows the invitation')
  assert.ok(evidence.newEntry.bubbleInside, 'the invitation stays inside the town')
  assert.equal(evidence.newEntry.emptyNote, null, 'the invitation replaces the empty-state note')
  assert.deepEqual(evidence.entryPanel, { open: true, title: '许个愿', chip: '许愿池', hint: evidence.entryPanel.hint, hasStart: true, command: '/pstack-poteto-mode', expanded: 'true', bubble: null })
  assert.match(evidence.entryPanel.hint, /不会替你发送/u)
  assert.deepEqual(evidence.entryStarts, [{ type: 'pixel-town-pstack/start-session', skill: 'pstack-poteto-mode', workspaceId: 'proof-workspace' }])
  assert.equal(evidence.focusReturned, true, 'closing the panel returns focus to the well')
  assert.equal(evidence.figure.title, '想办法')
  assert.equal(evidence.figure.command, '/pstack-figure-it-out')
  assert.deepEqual(evidence.figureStarts, [{ type: 'pixel-town-pstack/start-session', skill: 'pstack-figure-it-out', workspaceId: 'proof-workspace' }])
  assert.ok(evidence.help.includes('许愿池') && evidence.help.includes('想办法'))
  assert.equal(evidence.advertisedEntry.hidden, false)
  assert.equal(evidence.advertisedEntry.bubble, null, 'a resident in town silences the invitation')
  assert.equal(evidence.advertised.command, '/host-advertised-entry')
  assert.deepEqual(evidence.advertisedStarts, [{ type: 'pixel-town-pstack/start-session', skill: 'host-advertised-entry' }], 'the payload, not a guessed command, is authoritative')

  const { layout } = evidence
  assert.deepEqual(layout.map(station => station.id), ['investigation', 'prototype', 'multi-phase-plan', 'feature', 'refactoring', 'figure-it-out'])
  const rows = [...new Set(layout.map(station => station.y))].sort((a, b) => a - b)
  assert.deepEqual(rows.map(y => layout.filter(station => station.y === y).length), [3, 3])
  assert.equal(layout.at(-1).name, '想办法')
  for (const station of layout) {
    assert.ok(station.x >= 12 && station.x + station.width <= 188, `${station.id} inside 工地 horizontally`)
    assert.ok(station.y >= 12 && station.y + station.height <= 124, `${station.id} inside 工地 vertically`)
  }
  for (const y of rows) {
    const row = layout.filter(station => station.y === y).sort((a, b) => a.x - b.x)
    for (let i = 1; i < row.length; i++) {
      assert.ok(row[i - 1].x + row[i - 1].width <= row[i].x, 'station hit areas must not overlap')
      assert.ok(row[i - 1].labelRight <= row[i].labelLeft, 'rendered plaque labels must not overlap')
    }
  }
  for (const mode of fixtures.keys()) assert.ok(requests.includes(`GET /${mode}/board`), `${mode} used real board polling`)
  assert.deepEqual(requests.filter(request => !request.startsWith('GET ')), ['POST /result'])
  t.diagnostic(JSON.stringify({ oldHost: process.env.OLD_TOWN_LIB ?? 'current catalog minus figure-it-out, no entrySkill',
    oldEntry: evidence.oldEntry, oldStartPosts: evidence.oldStarts.length, newEntry: evidence.newEntry,
    entryStarts: evidence.entryStarts, layout: layout.map(({ id, x, y, width }) => ({ id, x, y, width })) }))
})
