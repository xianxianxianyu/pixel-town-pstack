// Real-browser proof of the first-time tips: one resident says 点我看进度 and the inbox says it has
// letters, each until its panel has been opened once; the choice survives a reload.
import assert from 'node:assert/strict'
import test from 'node:test'
import { boardProof } from './fixtures/board-proof.mjs'
import { townFixture } from './fixtures/town.mjs'

// Runs inside the parent page around the shipped board in an iframe.
async function exerciseTips() {
  const frame = document.getElementById('board')
  let drain
  const errors = []
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
    window.postMessage({ type: 'tips-board-proof/barrier' }, location.origin)
  })
  addEventListener('message', event => {
    if (event.source === window && event.data?.type === 'tips-board-proof/barrier') drain()
  })
  const doc = () => frame.contentDocument
  // Click the visible centre of `target`, proving nothing covers it.
  const clickOn = (target, owner = target) => {
    const win = frame.contentWindow
    const box = target.getBoundingClientRect()
    must(box.width > 0 && box.height > 0, 'invisible click target')
    const x = box.left + box.width / 2, y = box.top + box.height / 2
    const hit = doc().elementFromPoint(x, y)
    must(hit && (hit === owner || owner.contains(hit)), 'obscured click target')
    hit.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win, clientX: x, clientY: y }))
  }
  const close = async () => { clickOn(doc().querySelector('#close-popover')); await flushMessages() }
  const load = async () => {
    await new Promise(resolve => { frame.onload = resolve; frame.src = '/town/town/index.html' })
    frame.contentWindow.addEventListener('error', event => errors.push(event.message))
    await until(() => frame.contentWindow.PstackBoard?.connection.status === 'live' && doc().querySelector('.resident'), 'live residents')
    await flushMessages()
  }
  const tips = () => {
    const stage = doc().querySelector('#town-stage').getBoundingClientRect()
    const residents = [...doc().querySelectorAll('.resident')].filter(el => getComputedStyle(el.querySelector('.tip-bubble')).visibility === 'visible')
    const mailbox = doc().querySelector('#map-mailbox .landmark-bubble'), mailBox = mailbox.getBoundingClientRect()
    return {
      residents: residents.map(el => ({ id: el.dataset.session, text: el.querySelector('.tip-bubble text').textContent })),
      mailbox: mailBox.width > 0 ? mailbox.textContent : null,
      mailboxInside: mailBox.width === 0 || (mailBox.left >= stage.left && mailBox.right <= stage.right && mailBox.top >= stage.top),
    }
  }
  try {
    await load()
    const fresh = tips()
    must(fresh.residents.length === 1, 'expected one tipped resident')
    const tipped = doc().querySelector(`.resident[data-session="${fresh.residents[0].id}"]`)
    clickOn(tipped.querySelector('.resident-anchor'), tipped)
    await flushMessages()
    const card = doc().querySelector('#popover-content').textContent
    await close()
    const afterResident = tips()
    clickOn(doc().querySelector('#map-mailbox .map-object-label'), doc().querySelector('#map-mailbox'))
    await flushMessages()
    const whileInboxOpen = tips()
    await close()
    const afterInbox = tips()
    await load()
    const reloaded = tips()
    await fetch('/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fresh, card, afterResident, whileInboxOpen, afterInbox, reloaded, errors }) })
  } catch (error) {
    await fetch('/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.stack }) })
  }
}

test('first-time tips point at one resident and the inbox until each is opened, and stay gone after a reload', { timeout: 45000 }, async () => {
  const fixtures = new Map([['town', { ...townFixture, entrySkill: 'pstack-poteto-mode' }]])
  const { evidence } = await boardProof({ fixtures, exercise: exerciseTips, title: 'Tips board proof' })
  assert.equal(evidence.error, undefined, evidence.error)
  assert.deepEqual(evidence.errors, [])

  const ids = new Set(townFixture.sessions.map(session => session.sessionId))
  assert.equal(evidence.fresh.residents.length, 1)
  assert.ok(ids.has(evidence.fresh.residents[0].id))
  assert.equal(evidence.fresh.residents[0].text, '点我看进度')
  assert.equal(evidence.fresh.mailbox, '有信，点开看看', 'a mailbox with letters invites a first look')
  assert.ok(evidence.fresh.mailboxInside, 'the inbox tip stays inside the town')
  assert.ok(evidence.card.includes(townFixture.sessions.find(session => session.sessionId === evidence.fresh.residents[0].id).title), 'the tip led to that resident card')

  assert.deepEqual(evidence.afterResident.residents, [], 'one resident card retires the resident tip')
  assert.equal(evidence.afterResident.mailbox, '有信，点开看看', 'the inbox tip is independent')
  assert.equal(evidence.whileInboxOpen.mailbox, null)
  assert.deepEqual(evidence.afterInbox, { residents: [], mailbox: null, mailboxInside: true })
  assert.deepEqual(evidence.reloaded, { residents: [], mailbox: null, mailboxInside: true }, 'seen tips stay gone after a reload')
})
