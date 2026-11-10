import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { foldBoard, foldSession, reduce } from '../lib/fold.js'
import { apply } from '../lib/index.js'
import { workflows } from '../lib/workflows.js'

function journal(id, parentSession, createdAt = 1000) {
  const events = [{ type: 'session', id, createdAt, ...(parentSession ? { parentSession } : {}) }]
  let seq = 0
  return {
    events,
    append(type, data, time = 1001 + seq) {
      const event = { type, seq: seq++, time, data }
      events.push(event)
      return event
    },
    message(miss, cacheHit, output, time) {
      return this.append('assistant/message', { usage: { inputTokens: miss, cacheReadTokens: cacheHit, outputTokens: output, cacheWriteTokens: 0, totalTokens: miss + cacheHit + output } }, time)
    },
    stage(stage, time, isError = false, workflow = 'bug-fix') {
      const callId = `stage-${seq}`
      this.append('tool/call', { callId, name: 'pstack_stage', arguments: JSON.stringify({ workflow, stage, note: stage }) }, time - 1)
      this.append('tool/result', { message: { toolCallId: callId, isError, content: [{ type: 'text', text: 'ok' }] } }, time)
    },
  }
}

const zero = { tokens: 0, cacheHit: 0, miss: 0, output: 0, contextTokens: 0, steps: 0, maxContext: 0, children: 0, byStage: [] }
const row = (workflow, stage, tokens, steps, contextTokens, maxContext, children = 0) => ({ workflow, stage, tokens, steps, contextTokens, maxContext, children })

test('legacy logs have zero usage, and usage counts cache hits separately from cache misses', () => {
  const legacy = journal('legacy')
  legacy.stage('reproduce', 1010)
  assert.deepEqual(foldSession(legacy.events).cost, zero)
  assert.equal(foldSession(legacy.events).parentSessionId, null)
  const l = journal('tokens')
  l.message(10, 100, 5)
  l.message(20, 200, 7)
  const state = foldSession(l.events)
  assert.deepEqual(state.cost, { tokens: 342, cacheHit: 300, miss: 30, output: 12, contextTokens: 330, steps: 2, maxContext: 220, children: 0, byStage: [row(null, 'pre', 342, 2, 330, 220)] })
  assert.deepEqual(l.events.reduce(reduce, undefined).board, state)
})

test('assistant steps without token accounting remain visible without invented token counts', () => {
  const l = journal('legacy-message')
  l.append('assistant/message', { message: { content: [] } })
  assert.deepEqual(foldSession(l.events).cost, { ...zero, steps: 1, byStage: [row(null, 'pre', 0, 1, 0, 0)] })
})

test('usage follows accepted stages, aggregates rollback visits, and ignores rejected transitions', () => {
  const l = journal('stages')
  l.message(1, 9, 1, 1005)
  l.stage('reproduce', 1010)
  l.message(2, 18, 2, 1015)
  l.stage('bisect', 1020)
  l.message(3, 27, 3, 1025)
  l.stage('red', 1030, true)
  l.message(4, 36, 4, 1035)
  l.stage('reproduce', 1040)
  l.message(5, 45, 5, 1045)
  assert.deepEqual(foldSession(l.events).cost.byStage, [
    row(null, 'pre', 11, 1, 10, 10),
    row('bug-fix', 'reproduce', 77, 2, 70, 50),
    row('bug-fix', 'bisect', 77, 2, 70, 40),
  ])
  const before = structuredClone(l.events)
  const first = foldBoard([l.events])
  assert.deepEqual(foldBoard([l.events]), first)
  assert.deepEqual(l.events, before)
})

test('attached children and descendants are hidden and attributed to their ancestor spawn stage', () => {
  const parent = journal('parent')
  parent.stage('reproduce', 1010)
  parent.message(1, 9, 1, 1015)
  parent.stage('bisect', 1020)
  // Catalog delivery can lag spawning: its childCreatedAt, not delivery time, owns the stage.
  parent.append('subagent/catalog', { childId: 'child', childCreatedAt: 1018 }, 1025)
  parent.stage('reproduce', 1030)
  const child = journal('child', 'parent', 1022)
  child.message(2, 18, 2, 1040)
  const grandchild = journal('grandchild', 'child', 1041)
  grandchild.message(3, 27, 3, 1045)
  const otherChild = journal('other-child', 'parent', 1028)
  otherChild.message(4, 36, 4, 1050)
  const orphan = journal('orphan', 'unattached-parent', 1018)
  orphan.message(999, 999, 999)
  const orphanChild = journal('orphan-child', 'orphan', 1019)
  orphanChild.message(999, 999, 999)
  const roots = foldBoard([grandchild.events, orphanChild.events, child.events, parent.events, otherChild.events, orphan.events])
  assert.deepEqual(roots.map(s => s.sessionId), ['parent'])
  assert.deepEqual(roots[0].cost, {
    tokens: 110, cacheHit: 90, miss: 10, output: 10, contextTokens: 100, steps: 4, maxContext: 40, children: 3,
    byStage: [row('bug-fix', 'reproduce', 66, 3, 60, 30, 2), row('bug-fix', 'bisect', 44, 1, 40, 40, 1)],
  })
  assert.equal(foldSession(child.events).parentSessionId, 'parent')
  assert.equal(foldSession(parent.events).cost.children, 0)
})

test('handoffs retain earlier workflow buckets and child usage stays with its spawn workflow', () => {
  const parent = journal('handoff')
  let time = 1010
  for (const stage of workflows.find(workflow => workflow.id === 'runtime-forensics').stages) {
    parent.stage(stage.id, time, false, 'runtime-forensics')
    time += 10
  }
  parent.message(1, 9, 1, time - 5)
  const child = journal('child', 'handoff', time - 4)
  child.message(2, 18, 2, time + 20)
  parent.stage('reproduce', time)
  parent.message(3, 27, 3, time + 5)
  assert.deepEqual(foldBoard([parent.events, child.events])[0].cost.byStage, [
    row('runtime-forensics', 'report', 33, 2, 30, 20, 1),
    row('bug-fix', 'reproduce', 33, 1, 30, 30),
  ])
})

test('unattached catalog children contribute no usage or counted child sessions', () => {
  const parent = journal('parent')
  parent.append('subagent/catalog', { childId: 'not-attached', childCreatedAt: 1005 })
  parent.message(5, 50, 2)
  assert.deepEqual(foldBoard([parent.events])[0].cost, foldSession(parent.events).cost)
  assert.equal(foldBoard([parent.events])[0].cost.children, 0)
})

test('fork seed resets inherited usage and catalog but preserves the child parent relationship', () => {
  const child = journal('child', 'parent', 2000)
  child.stage('reproduce', 1010)
  child.message(100, 1000, 100, 1015)
  child.append('subagent/catalog', { childId: 'inherited-child', childCreatedAt: 1018 }, 1020)
  child.append('session/end-seed', { inherited: true }, 2001)
  child.message(2, 20, 3, 2002)
  const folded = foldSession(child.events)
  assert.equal(folded.parentSessionId, 'parent')
  assert.equal(folded.subagentCount, 0)
  assert.deepEqual(folded.cost, { tokens: 25, cacheHit: 20, miss: 2, output: 3, contextTokens: 22, steps: 1, maxContext: 22, children: 0, byStage: [row(null, 'pre', 25, 1, 22, 22)] })
})

test('board route rolls up only attached children alongside the manifest and launch metadata', async () => {
  const parent = journal('parent')
  parent.stage('reproduce', 1010)
  parent.message(1, 10, 2, 1015)
  const child = journal('child', 'parent', 1018)
  child.message(3, 30, 4, 1020)
  const orphan = journal('orphan', 'missing')
  orphan.message(100, 100, 100)
  let route
  let attached = [parent, child, orphan]
  const ctx = {
    tools: { register() {} }, skills: { registerProvider() {} },
    on() {},
    sessions: { list: () => attached.map(l => ({ header: l.events[0], snapshotEvents: () => l.events.slice(1) })) },
    inject(deps, install) { if (deps[0] === 'connection') install({ ...ctx, connection: { fetch: { register(value) { if (value.path === '/api/pixel-town-pstack/board') route = value } } } }) },
  }
  apply(ctx, { root: join(tmpdir(), 'pstack-cost-test') })
  const payload = await (await route.fetch()).json()
  assert.deepEqual(Object.keys(payload).sort(), ['deliverySkill', 'entrySkill', 'legacyWorkflowIds', 'sessions', 'workflows'])
  assert.deepEqual(payload.sessions.map(s => s.sessionId), ['parent'])
  assert.equal(payload.sessions[0].cost.tokens, 50)
  assert.equal(payload.sessions[0].cost.children, 1)
  attached = [parent]
  const detached = await (await route.fetch()).json()
  assert.equal(detached.sessions[0].cost.tokens, 13)
  assert.equal(detached.sessions[0].cost.children, 0)
})

test('synthetic retired ADR replay keeps parent and four-child token sums without an active workflow', () => {
  const parentId = 'synthetic-parent'
  const parentJournal = journal(parentId)
  parentJournal.stage('archaeology', 1010, false, 'adr')
  for (let step = 0; step < 30; step++) parentJournal.message(10 + step, 100, 5, 1020 + step)
  parentJournal.stage('crossexam', 1100, false, 'adr')
  for (let step = 30; step < 89; step++) parentJournal.message(10 + step, 100, 5, 1110 + step)
  const childJournals = Array.from({ length: 4 }, (_, index) => {
    const child = journal(`synthetic-child-${index + 1}`, parentId, index === 0 ? 1050 : 1100 + index)
    for (let step = 0; step < 17; step++) child.message(index + 2, (index + 1) * 20, 3, 1200 + step)
    return child
  })
  const logs = [parentJournal.events, ...childJournals.map(child => child.events)]
  const parent = foldSession(logs.find(log => log[0].id === parentId))
  const children = logs.map(foldSession).filter(s => s.parentSessionId === parentId)
  assert.equal(parent.workflow, undefined)
  assert.equal(parent.stage, undefined)
  assert.equal('gate' in parent, false)
  assert.equal(parent.cost.steps, 89)
  assert.deepEqual([parent.cost.miss, parent.cost.cacheHit, parent.cost.output], [4806, 8900, 445])
  assert.equal(children.length, 4)
  assert.deepEqual(children.reduce((sum, s) => sum.map((n, i) => n + [s.cost.miss, s.cost.cacheHit, s.cost.output][i]), [0, 0, 0]), [238, 3400, 204])
  const rolled = foldBoard(logs).find(s => s.sessionId === parentId).cost
  assert.deepEqual([rolled.miss, rolled.cacheHit, rolled.output, rolled.tokens, rolled.steps, rolled.children], [5044, 12300, 649, 17993, 157, 4])
  assert.equal(rolled.byStage.reduce((sum, s) => sum + s.tokens, 0), rolled.tokens)
  assert.equal(rolled.byStage.reduce((sum, s) => sum + s.contextTokens, 0), rolled.contextTokens)
  assert.equal(rolled.byStage.reduce((sum, s) => sum + s.steps, 0), rolled.steps)
  assert.deepEqual(rolled.byStage, [
    row('adr', 'archaeology', 4310, 47, 4109, 139, 1),
    row('adr', 'crossexam', 13683, 110, 13235, 198, 3),
  ])
})
