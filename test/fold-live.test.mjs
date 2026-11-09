import assert from 'node:assert/strict'
import test from 'node:test'
import { foldBoard, foldSession, reduce } from '../lib/fold.js'

function log({ withSeq = true, header = {} } = {}) {
  const events = [{ type: 'session', version: 4, id: 'live-session', createdAt: 1000, isSeeded: false, ...header }]
  let seq = 0
  return {
    events,
    append(type, data, envelope = {}) {
      const event = { type, ...(withSeq ? { seq } : {}), time: 1001 + seq++, data, ...envelope }
      events.push(event)
      return event
    },
    call(id, name, args, scope = { turn: 1, step: 1 }) {
      return this.append('tool/call', { ...scope, callId: id, name, arguments: JSON.stringify(args) })
    },
    result(id, isError = false, content = 'ok', scope = { turn: 1, step: 1 }) {
      return this.append('tool/result', {
        ...scope,
        message: { role: 'tool', toolCallId: id, content: typeof content === 'string' ? [{ type: 'text', text: content }] : content, isError },
      })
    },
    stage(stage, { isError = false, result = 'ok' } = {}) {
      const id = `stage-${seq}`
      this.call(id, 'pstack_stage', { workflow: 'bug-fix', stage, note: stage })
      return this.result(id, isError, result)
    },
  }
}

function question(value, labels = []) {
  return { questions: [{ id: 'choice', question: value, options: labels.map(label => ({ label })) }] }
}

function enterRed(journal) {
  for (const stage of ['reproduce', 'bisect', 'red']) journal.stage(stage)
}

test('empty sessions expose nullable live metadata, needs, and gag', () => {
  const board = foldSession([])
  assert.equal(board.title, null)
  assert.equal(board.cwd, null)
  assert.equal(board.startedAt, null)
  assert.equal(board.needs, null)
  assert.equal(board.gag, null)
  assert.equal('check' in board, false)
  assert.equal(board.handoffFrom, null)
  assert.equal('gate' in board, false)
  assert.equal(board.status, 'idle')
  assert.equal(board.delivery, null)
  assert.equal(board.finishedAt, null)
  assert.equal(board.goal, null)
})

test('native goal changes and admitted goal messages fold objective, rounds, phases and clear', () => {
  const l = log()
  const goal = { id: 'goal-1', revision: 1, objective: '列出 src 下的文件并结束', phase: 'active', maxGoalRounds: 4 }
  const change = (operation, snapshot, roundsStarted, updatedAt) => l.append('goal/change', {
    kind: 'goal/change', version: 1, operation, goal: snapshot, roundsStarted, createdAt: 1000, updatedAt,
  })
  change('create', goal, 0, 1000)
  assert.deepEqual(foldSession(l.events).goal, {
    objective: '列出 src 下的文件并结束', phase: 'active', rounds: 0, maxRounds: 4, updatedAt: 1000,
  })
  l.append('user/message', { source: { kind: 'user' }, content: '继续' })
  assert.equal(foldSession(l.events).goal.rounds, 0)
  l.append('user/message', { source: { kind: 'goal', goalId: 'goal-1', revision: 1, round: 1 }, content: 'Round 1/4' })
  l.append('user/message', { source: { kind: 'goal', goalId: 'goal-1', revision: 1, round: 2 }, content: 'Round 2/4' })
  assert.deepEqual(foldSession(l.events).goal, {
    objective: '列出 src 下的文件并结束', phase: 'active', rounds: 2, maxRounds: 4, updatedAt: 1000,
  })
  change('pause', { ...goal, revision: 2, phase: 'paused' }, 2, 1020)
  assert.equal(foldSession(l.events).goal.phase, 'paused')
  change('resume', { ...goal, revision: 3 }, 2, 1030)
  const blockedReason = { code: 'workspace-unavailable', message: '工作区无法访问' }
  change('block', { ...goal, revision: 4, phase: 'blocked', blockedReason }, 2, 1040)
  assert.deepEqual(foldSession(l.events).goal, {
    objective: '列出 src 下的文件并结束', phase: 'blocked', rounds: 2, maxRounds: 4, blockedReason, updatedAt: 1040,
  })
  change('resume', { ...goal, revision: 5 }, 2, 1050)
  l.append('user/message', { source: { kind: 'goal', goalId: 'goal-1', revision: 5, round: 3 }, content: 'Round 3/4' })
  change('complete', { ...goal, revision: 6, phase: 'complete' }, 3, 1060)
  assert.deepEqual(foldSession(l.events).goal, {
    objective: '列出 src 下的文件并结束', phase: 'complete', rounds: 3, maxRounds: 4, updatedAt: 1060,
  })
  l.append('goal/change', { kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: 'goal-1', revision: 7 }, clearedAt: 1070 })
  assert.equal(foldSession(l.events).goal, null)
})

test('unknown goal versions are ignored and pre-goal logs expose null', () => {
  const l = log()
  l.stage('reproduce')
  l.append('user/message', { source: { kind: 'user' }, content: 'old log' })
  assert.equal(foldSession(l.events).goal, null)
  l.append('goal/change', { kind: 'goal/change', version: 2, operation: 'create', goal: { objective: 'future' } })
  assert.equal(foldSession(l.events).goal, null)
  l.append('goal/change', {
    kind: 'goal/change', version: 1, operation: 'create',
    goal: { id: 'g', revision: 1, objective: 'known', phase: 'active', maxGoalRounds: 2 },
    roundsStarted: 0, createdAt: 1000, updatedAt: 1000,
  })
  l.append('goal/change', { kind: 'goal/change', version: 99, operation: 'clear' })
  assert.equal(foldSession(l.events).goal.objective, 'known')
})

test('goal rounds follow native identity, revision, sequence and cap admission', () => {
  const l = log()
  assert.throws(() => foldSession([{ type: 'user/message', time: 1000,
    data: { source: { kind: 'goal', goalId: 'g', revision: 1, round: 1 } },
  }]), /next admitted round/u)
  l.append('goal/change', {
    kind: 'goal/change', version: 1, operation: 'create',
    goal: { id: 'g', revision: 1, objective: 'known', phase: 'active', maxGoalRounds: 1 },
    roundsStarted: 0, createdAt: 1000, updatedAt: 1000,
  })
  for (const source of [
    { kind: 'goal', goalId: 'other', revision: 1, round: 1 },
    { kind: 'goal', goalId: 'g', revision: 2, round: 1 },
    { kind: 'goal', goalId: 'g', revision: 1, round: 2 },
  ]) assert.throws(() => foldSession([...l.events, { type: 'user/message', time: 1010, data: { source } }]), /next admitted round/u)
  l.append('user/message', { source: { kind: 'goal', goalId: 'g', revision: 1, round: 1 } })
  assert.throws(() => foldSession([...l.events, {
    type: 'user/message', time: 1020, data: { source: { kind: 'goal', goalId: 'g', revision: 1, round: 2 } },
  }]), /next admitted round/u)
})

test('fork seed boundaries retain the native durable goal without inherited workflow progress', () => {
  const l = log()
  l.stage('reproduce')
  l.append('goal/change', {
    kind: 'goal/change', version: 1, operation: 'create',
    goal: { id: 'g', revision: 1, objective: 'continue', phase: 'active', maxGoalRounds: 2 },
    roundsStarted: 0, createdAt: 1000, updatedAt: 1000,
  })
  l.append('user/message', { source: { kind: 'goal', goalId: 'g', revision: 1, round: 1 } })
  l.append('session/end-seed', { inherited: true })
  l.append('user/message', { source: { kind: 'goal', goalId: 'g', revision: 1, round: 2 } })
  const board = foldSession(l.events)
  assert.equal(board.workflow, undefined)
  assert.deepEqual(board.history, [])
  assert.deepEqual(board.goal, { objective: 'continue', phase: 'active', rounds: 2, maxRounds: 2, updatedAt: 1000 })
})

test('legacy workflow logs keep their stage trails, costs and canonical skill names', () => {
  for (const [oldId, newId, stages] of [
    ['requirement', 'feature', ['restate', 'survey', 'sketch', 'checkpoint', 'build', 'verify', 'interrogate', 'pr']],
    ['bug-analysis', 'runtime-forensics', ['intake', 'capture', 'reduce', 'hypothesize', 'prove', 'report']],
  ]) {
    const l = log()
    l.append('user/message', { source: { kind: 'user' }, content: `/pstack-${oldId} work` })
    assert.equal(foldSession(l.events).skill, `pstack-${newId}`)
    l.call('load', 'skill', { name: `pstack-${oldId}` })
    l.result('load')
    for (const stage of stages) {
      l.call(stage, 'pstack_stage', { workflow: oldId, stage, note: stage })
      l.result(stage)
      l.append('assistant/message', { usage: { inputTokens: 2, cacheReadTokens: 3, outputTokens: 5 } })
    }
    const board = foldSession(l.events)
    assert.equal(board.workflow, newId)
    assert.equal(board.skill, `pstack-${newId}`)
    assert.deepEqual(board.history.map(entry => [entry.workflow, entry.stage, entry.kind]), stages.map(stage => [newId, stage, 'enter']))
    assert.equal(board.cost.tokens, stages.length * 10)
    assert.deepEqual(board.cost.byStage.map(row => [row.workflow, row.stage, row.tokens]), stages.map(stage => [newId, stage, 10]))
    l.append('user/message', { source: { kind: 'skill-invocation', name: `pstack-${oldId}` }, content: 'loaded' })
    assert.equal(foldSession(l.events).skill, `pstack-${newId}`)
  }
})

test('metadata comes from the header and the latest session/title event', () => {
  const l = log({ header: { id: 'named-session', cwd: '/work/child', createdAt: 0 } })
  let board = foldSession(l.events)
  assert.equal(board.sessionId, 'named-session')
  assert.equal(board.title, null)
  assert.equal(board.cwd, '/work/child')
  assert.equal(board.startedAt, 0)
  l.append('session/title', { title: 'Original title' })
  l.append('session/title', { title: 'Renamed title' })
  l.call('shell', 'bash', { command: 'pwd', cwd: '/somewhere/else' })
  board = foldSession(l.events)
  assert.equal(board.title, 'Renamed title')
  assert.equal(board.cwd, '/work/child')
  assert.equal(board.startedAt, 0)
  assert.equal(foldSession(log().events).cwd, null)
})

test('questions preserve every real schema question and option label', () => {
  const l = log()
  l.call('question', 'ask_user_question', { questions: [
    { id: 'mode', header: 'Mode', question: 'Which mode?', options: [
      { label: 'Safe (Recommended)', description: 'Keep the existing behavior.' },
      { label: 'Fast', description: 'Change the defaults.' },
    ] },
    { id: 'scope', question: 'Which scope?', options: [{ label: 'Local' }, { label: 'Shared' }], multi_select: true },
    { id: 'notes', question: 'Any additional notes?' },
  ] })
  const board = foldSession(l.events)
  assert.deepEqual(board.needs, {
    kind: 'question',
    question: 'Which mode?\nWhich scope?\nAny additional notes?',
    options: ['Safe (Recommended)', 'Fast', 'Local', 'Shared'],
  })
  assert.equal(board.status, 'needsYou')
  assert.equal(board.gag, null)
})

test('object tool arguments produce the same pending question contract', () => {
  const l = log()
  l.append('tool/call', { turn: 1, step: 1, callId: 'question', name: 'ask_user_question', arguments: question('Continue?', ['Yes', 'No']) })
  assert.deepEqual(foldSession(l.events).needs, { kind: 'question', question: 'Continue?', options: ['Yes', 'No'] })
})

test('only matching scoped question results clear needs, without turn-end or message heuristics', () => {
  const l = log()
  const scope = { turn: 2, step: 3 }
  l.call('shared-id', 'ask_user_question', question('Keep waiting?', ['Wait']), scope)
  l.result('shared-id', false, 'wrong step', { turn: 2, step: 4 })
  l.result('shared-id', false, 'wrong turn', { turn: 3, step: 3 })
  l.result('different-id', false, 'wrong call', scope)
  l.append('user/message', { content: [{ type: 'text', text: 'unrelated message' }], source: { kind: 'user' } })
  l.append('turn/end', { turn: 2 })
  let board = foldSession(l.events)
  assert.deepEqual(board.needs, { kind: 'question', question: 'Keep waiting?', options: ['Wait'] })
  assert.equal(board.status, 'needsYou')
  assert.equal(board.gag, null)
  const answered = l.result('shared-id', false, '{"answers":[{"id":"choice","selected":["Wait"]}]}', scope)
  board = foldSession(l.events)
  assert.equal(board.needs, null)
  assert.equal(board.status, 'idle')
  assert.equal(board.gag.kind, 'answered')
  assert.equal(board.gag.at, answered.time)
})

test('reused call IDs in different steps retain independent pending questions', () => {
  const l = log()
  l.call('reused', 'ask_user_question', question('First question'), { turn: 1, step: 1 })
  l.call('reused', 'ask_user_question', question('Second question'), { turn: 1, step: 2 })
  l.result('reused', false, 'first answer', { turn: 1, step: 1 })
  let board = foldSession(l.events)
  assert.deepEqual(board.needs, { kind: 'question', question: 'Second question', options: [] })
  assert.equal(board.status, 'needsYou')
  const firstId = board.gag.id
  l.result('reused', true, 'question cancelled', { turn: 1, step: 2 })
  board = foldSession(l.events)
  assert.equal(board.needs, null)
  assert.equal(board.gag.kind, 'answered')
  assert.notEqual(board.gag.id, firstId)
})

test('approval needs include tool name and reason and decisions clear matching IDs only', () => {
  const l = log()
  l.append('approval/asked', { id: 'a', toolName: 'bash', reason: 'Write outside the workspace?' })
  l.append('approval/asked', { id: 'b', toolName: 'plugin_manager', reason: 'Install this plugin?' })
  l.append('approval/decided', { id: 'unknown', outcome: 'allowed-once' })
  let board = foldSession(l.events)
  assert.deepEqual(board.needs, { kind: 'approval', question: 'bash: Write outside the workspace?', options: [] })
  assert.equal(board.gag, null)
  l.append('approval/decided', { id: 'a', outcome: 'rejected' })
  board = foldSession(l.events)
  assert.deepEqual(board.needs, { kind: 'approval', question: 'plugin_manager: Install this plugin?', options: [] })
  assert.equal(board.status, 'needsYou')
  assert.equal(board.gag.kind, 'answered')
  const answered = l.append('approval/decided', { id: 'b', outcome: 'allowed-once' })
  board = foldSession(l.events)
  assert.equal(board.needs, null)
  assert.equal(board.status, 'idle')
  assert.equal(board.gag.kind, 'answered')
  assert.equal(board.gag.at, answered.time)
})

test('questions and approvals remain pending independently', () => {
  const l = log()
  l.append('turn/start', { turn: 1 })
  l.append('approval/asked', { id: 'approval', toolName: 'bash' })
  l.call('question', 'ask_user_question', question('Which branch?'))
  assert.equal(foldSession(l.events).needs.kind, 'question')
  l.result('question')
  assert.deepEqual(foldSession(l.events).needs, { kind: 'approval', question: 'bash: approval requested', options: [] })
  l.append('approval/decided', { id: 'approval', outcome: 'cancelled' })
  const board = foldSession(l.events)
  assert.equal(board.needs, null)
  assert.equal(board.status, 'working')
})

test('only inactive parents show the number of known unsettled children and restore their stage detail', () => {
  const l = log()
  l.stage('reproduce')
  l.append('subagent/catalog', { childId: 'a' })
  l.append('subagent/catalog', { childId: 'a' })
  l.append('subagent/catalog', { childId: 'b' })
  let board = foldSession(l.events)
  assert.equal(board.status, 'working')
  assert.equal(board.detail, '等 2 个助手回来')
  assert.equal(board.subagentCount, 2)
  l.append('turn/start', { turn: 1 })
  board = foldSession(l.events)
  assert.equal(board.status, 'working')
  assert.equal(board.detail, 'reproduce')
  l.append('turn/end', { turn: 1 })
  assert.equal(foldSession(l.events).detail, '等 2 个助手回来')
  l.append('user/message', { source: { kind: 'user', senderSessionId: 'a' }, content: 'Not a settlement' })
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'unknown' }, content: 'Unknown child' })
  assert.equal(foldSession(l.events).detail, '等 2 个助手回来')
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'a' }, content: 'A finished' })
  board = foldSession(l.events)
  assert.equal(board.status, 'working')
  assert.equal(board.detail, '等 1 个助手回来')
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'a' }, content: 'Duplicate settlement' })
  assert.equal(foldSession(l.events).detail, '等 1 个助手回来')
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'b' }, content: 'B finished' })
  board = foldSession(l.events)
  assert.equal(board.status, 'idle')
  assert.equal(board.detail, 'reproduce')
  assert.equal(board.subagentCount, 2)
  l.append('session/title', { title: 'Still settled' })
  assert.equal(foldSession(l.events).detail, 'reproduce')
})

test('sending a known child a message re-pends it until settlement and catalog refreshes preserve that lifecycle', () => {
  const l = log()
  l.stage('reproduce')
  l.append('subagent/catalog', { childId: 'child' })
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done' })
  l.append('subagent/catalog', { childId: 'child', childCreatedAt: 1000, version: 1 })
  assert.equal(foldSession(l.events).status, 'idle')
  assert.equal(foldSession(l.events).detail, 'reproduce')
  l.call('resume', 'send_message', { agent_id: 'child', message: 'One more task' })
  let board = foldSession(l.events)
  assert.equal(board.status, 'working')
  assert.equal(board.detail, '等 1 个助手回来')
  l.result('resume')
  l.append('subagent/catalog', { childId: 'child', version: 2 })
  assert.equal(foldSession(l.events).detail, '等 1 个助手回来')
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done again' })
  l.append('subagent/catalog', { childId: 'child', version: 3 })
  l.call('unknown', 'send_message', { agent_id: 'unknown', message: 'Not a catalog entry' })
  board = foldSession(l.events)
  assert.equal(board.status, 'idle')
  assert.equal(board.detail, 'reproduce')
  assert.equal(board.subagentCount, 1)
})

test('waiting display never replaces an accepted stage note, including notes accepted while waiting', () => {
  const l = log()
  l.stage('reproduce')
  l.append('subagent/catalog', { childId: 'child' })
  l.call('note', 'pstack_stage', { workflow: 'bug-fix', stage: 'reproduce', note: 'Latest reproduction evidence' })
  l.result('note')
  assert.equal(foldSession(l.events).detail, '等 1 个助手回来')
  l.stage('fix', { isError: true, result: 'Rejected transition' })
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done' })
  assert.equal(foldSession(l.events).detail, 'Latest reproduction evidence')
})

test('questions and approvals take precedence over child waiting without clearing it', () => {
  const l = log()
  l.stage('reproduce')
  l.append('subagent/catalog', { childId: 'child' })
  l.append('approval/asked', { id: 'approval', toolName: 'bash', reason: 'Continue?' })
  l.call('question', 'ask_user_question', question('Which branch?'))
  let board = foldSession(l.events)
  assert.equal(board.status, 'needsYou')
  assert.equal(board.needs.kind, 'question')
  assert.equal(board.detail, 'reproduce')
  l.result('question')
  board = foldSession(l.events)
  assert.equal(board.status, 'needsYou')
  assert.equal(board.needs.kind, 'approval')
  assert.equal(board.detail, 'reproduce')
  l.append('approval/decided', { id: 'approval', outcome: 'allowed-once' })
  board = foldSession(l.events)
  assert.equal(board.status, 'working')
  assert.equal(board.detail, '等 1 个助手回来')
  l.call('another-question', 'ask_user_question', question('Anything else?'))
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done' })
  board = foldSession(l.events)
  assert.equal(board.status, 'needsYou')
  assert.equal(board.detail, 'reproduce')
  l.result('another-question')
  assert.equal(foldSession(l.events).status, 'idle')
})

test('unsettled children keep an ended terminal stage working until the final child settles', () => {
  const l = log()
  for (const stage of ['reproduce', 'bisect', 'red', 'fix', 'verify', 'pr']) l.stage(stage)
  l.append('turn/end', { turn: 1 })
  assert.equal(foldSession(l.events).status, 'finished')
  l.append('subagent/catalog', { childId: 'child' })
  let board = foldSession(l.events)
  assert.equal(board.status, 'working')
  assert.equal(board.detail, '等 1 个助手回来')
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done' })
  board = foldSession(l.events)
  assert.equal(board.status, 'finished')
  assert.equal(board.detail, 'pr')
})

test('tool errors do not invent stuck status; child waiting still follows lifecycle', () => {
  const l = log()
  l.stage('reproduce')
  for (let index = 0; index < 3; index++) {
    l.call(`failed-${index}`, 'read', { path: 'missing' })
    l.result(`failed-${index}`, true, 'not found')
  }
  assert.equal(foldSession(l.events).status, 'idle')
  l.append('subagent/catalog', { childId: 'child' })
  assert.equal(foldSession(l.events).status, 'working')
  l.append('turn/start', { turn: 1 })
  assert.equal(foldSession(l.events).status, 'working')
  assert.equal(foldSession(l.events).detail, 'reproduce')
  l.append('turn/end', { turn: 1 })
  assert.equal(foldSession(l.events).detail, '等 1 个助手回来')
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done' })
  assert.equal(foldSession(l.events).status, 'idle')
})

test('legacy logs without a child catalog retain tool detail and do not infer waiting from messages', () => {
  const l = log()
  l.append('turn/start', { turn: 1 })
  l.call('shell', 'bash', { command: 'pwd' })
  l.result('shell')
  assert.equal(foldSession(l.events).status, 'working')
  assert.equal(foldSession(l.events).detail, 'pwd')
  l.append('turn/end', { turn: 1 })
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'unknown' }, content: 'Done' })
  let board = foldSession(l.events)
  assert.equal(board.status, 'idle')
  assert.equal(board.detail, 'pwd')
  l.call('unknown', 'send_message', { agent_id: 'unknown', message: 'Continue', description: 'Contact an agent' })
  board = foldSession(l.events)
  assert.equal(board.status, 'idle')
  assert.equal(board.detail, 'Contact an agent')
  assert.equal(board.subagentCount, 0)
})

test('child settlement, re-pending, and repeated catalog metadata preserve spawn-stage cost attribution', () => {
  const parent = log()
  parent.stage('reproduce')
  const spawn = parent.stage('bisect').time + 0.5
  parent.stage('red')
  parent.append('subagent/catalog', { childId: 'child', childCreatedAt: spawn })
  parent.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done' })
  parent.call('resume', 'send_message', { agent_id: 'child', message: 'Continue' })
  parent.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done again' })
  parent.append('subagent/catalog', { childId: 'child', childCreatedAt: 2000 })
  const child = log({ header: { id: 'child', parentSession: 'live-session', createdAt: 2000 } })
  child.append('assistant/message', { usage: { inputTokens: 2, cacheReadTokens: 3, outputTokens: 5 } })
  const [board] = foldBoard([parent.events, child.events])
  assert.equal(board.status, 'idle')
  assert.equal(board.cost.children, 1)
  assert.equal(board.cost.tokens, 10)
  assert.deepEqual(board.cost.byStage.map(({ workflow, stage, tokens, children }) => ({ workflow, stage, tokens, children })), [
    { workflow: 'bug-fix', stage: 'bisect', tokens: 10, children: 1 },
  ])
})

test('incremental child lifecycle updates preserve prior states and match full replay', () => {
  const l = log({ withSeq: false })
  l.stage('reproduce')
  l.append('subagent/catalog', { childId: 'child' })
  const previous = l.events.reduce(reduce, undefined)
  const snapshot = structuredClone(previous)
  const offset = l.events.length
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done' })
  l.call('resume', 'send_message', { agent_id: 'child', message: 'Continue' })
  l.append('subagent/catalog', { childId: 'child' })
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done again' })
  const incremental = l.events.slice(offset).reduce(reduce, previous)
  assert.deepEqual(previous, snapshot)
  assert.deepEqual(incremental.board, foldSession(l.events))
  assert.equal(incremental.board.status, 'idle')
  assert.equal(incremental.board.detail, 'reproduce')
})

test('accepted moves retain skipped state without repeating history, and rollback permits a fresh skip', () => {
  const l = log()
  enterRed(l)
  l.stage('red')
  l.stage('fix')
  l.stage('verify')
  let board = foldSession(l.events)
  assert.deepEqual(board.skipped, ['plan-fix'])
  assert.deepEqual(board.history.filter(entry => entry.kind === 'skip').map(entry => entry.stage), ['plan-fix'])
  l.stage('pr')
  l.stage('pr')
  board = foldSession(l.events)
  assert.deepEqual(board.skipped, ['plan-fix', 'interrogate'])
  assert.deepEqual(board.history.filter(entry => entry.kind === 'skip').map(entry => entry.stage), ['plan-fix', 'interrogate'])
  l.stage('bisect')
  board = foldSession(l.events)
  assert.deepEqual(board.skipped, [])
  assert.deepEqual(board.history.filter(entry => entry.kind === 'skip').map(entry => entry.stage), ['plan-fix', 'interrogate'])
  l.stage('red')
  board = foldSession(l.events)
  assert.deepEqual(board.skipped, ['plan-fix'])
  assert.deepEqual(board.history.filter(entry => entry.kind === 'skip').map(entry => entry.stage), ['plan-fix', 'interrogate', 'plan-fix'])
})

test('handoffs clear the previous workflow skipped state without adding skip history', () => {
  const l = log()
  for (const stage of ['reproduce', 'bisect', 'red', 'fix', 'verify', 'pr']) l.stage(stage)
  const before = foldSession(l.events)
  l.call('handoff', 'pstack_stage', { workflow: 'feature', stage: 'restate', note: 'New requirement' })
  l.result('handoff')
  const board = foldSession(l.events)
  assert.equal(board.workflow, 'feature')
  assert.equal(board.stage, 'restate')
  assert.deepEqual(board.skipped, [])
  assert.deepEqual(board.history.filter(entry => entry.kind === 'skip'), before.history.filter(entry => entry.kind === 'skip'))
  assert.equal(board.history.at(-1).kind, 'handoff')
  assert.equal(board.detail, 'New requirement')
})

test('an accepted rollback names its target from the manifest and ordinary progress does not emit a gag', () => {
  const l = log()
  enterRed(l)
  assert.equal(foldSession(l.events).gag, null)
  l.call('rollback', 'pstack_stage', { workflow: 'bug-fix', stage: 'plan-fix', note: 'Reconsider the design' })
  assert.equal(foldSession(l.events).gag, null)
  const accepted = l.result('rollback')
  const rollback = foldSession(l.events).gag
  assert.equal(rollback.kind, 'rollback')
  assert.equal(rollback.text, '退回「设计修复」')
  assert.equal(rollback.at, accepted.time)
  assert.ok(rollback.id)
  assert.equal(foldSession(l.events).stage, 'plan-fix')
  l.stage('plan-fix')
  l.stage('red')
  assert.deepEqual(foldSession(l.events).gag, rollback)
})

test('legacy rejected reports remain historical facts without rejection bubbles', () => {
  const l = log()
  l.stage('reproduce')
  l.stage('fix', { isError: true, result: 'Error: old transition gate rejected this report' })
  const board = foldSession(l.events)
  assert.equal(board.stage, 'reproduce')
  assert.equal(board.history.at(-1).kind, 'rejected')
  assert.equal(board.gag, null)
})

test('stage and bash result correlation remains scoped even with reused IDs', () => {
  const l = log()
  l.call('reused', 'pstack_stage', { workflow: 'bug-fix', stage: 'reproduce', note: 'Reproduce' }, { turn: 1, step: 1 })
  l.call('reused', 'bash', { command: 'npm test' }, { turn: 1, step: 2 })
  l.result('reused', true, 'failed', { turn: 1, step: 2 })
  let board = foldSession(l.events)
  assert.equal(board.stage, undefined)
  assert.equal(board.gag.kind, 'verify-failed')
  l.result('reused', false, 'entered', { turn: 1, step: 1 })
  board = foldSession(l.events)
  assert.equal(board.stage, 'reproduce')
  assert.equal(board.gag.kind, 'verify-failed')
})

for (const command of [
  'node --test test/', 'node --import tsx --test test/live.test.ts',
  'npm test', 'npm run test', 'pnpm test', 'pnpm run test:unit', 'yarn test', 'yarn run test',
  'npx vitest run', 'pnpm exec jest --runInBand', 'pytest -q', 'python -m pytest',
  'go test ./...', 'cargo test --workspace',
]) {
  test(`failed test command emits a gag: ${command}`, () => {
    const l = log()
    l.call('test', 'bash', { command })
    const result = l.result('test', true, 'runner stopped')
    const board = foldSession(l.events)
    assert.equal(board.gag.kind, 'verify-failed')
    assert.equal(board.gag.at, result.time)
  })
}

for (const marker of ['ℹ fail 12', '✖ failing assertion', 'not ok 2 - assertion', 'AssertionError: mismatch', 'FAILED test_case.py', 'exit=17']) {
  test(`tail failure evidence is sufficient despite isError false: ${marker}`, () => {
    const l = log()
    enterRed(l)
    l.call('test', 'bash', { command: 'node --test test/' })
    l.result('test', false, [
      { type: 'text', text: 'successful output\n'.repeat(5000) },
      { type: 'image', data: 'not relevant' },
      { type: 'text', text: marker },
    ])
    const board = foldSession(l.events)
    assert.equal(board.gag.kind, 'test-red')
    assert.equal(board.stage, 'red')
  })
}

test('failure markers work without an isError flag and with string result content', () => {
  const l = log()
  l.call('test', 'bash', { command: 'pytest -q' })
  l.append('tool/result', { turn: 1, step: 1, message: { toolCallId: 'test', content: 'FAILED test_missing.py' } })
  assert.equal(foldSession(l.events).gag.kind, 'verify-failed')
})

test('the accepted stage distinguishes red-test and verification failure reactions', () => {
  const l = log()
  enterRed(l)
  l.call('red-test', 'bash', { command: 'npm test' })
  l.result('red-test', true)
  assert.equal(foldSession(l.events).gag.kind, 'test-red')
  l.stage('fix')
  l.stage('verify')
  l.call('verify-test', 'bash', { command: 'npm test' })
  l.result('verify-test', false, 'ℹ fail 1')
  assert.equal(foldSession(l.events).gag.kind, 'verify-failed')
})

test('passing test summaries and ordinary shell errors do not fabricate test failures', () => {
  const l = log()
  for (const [id, name, args, isError, output] of [
    ['passing', 'bash', { command: 'node --test test/' }, false, 'ℹ fail 0\nexit=0'],
    ['build', 'bash', { command: 'npm run build' }, true, 'FAILED\nexit=1'],
    ['script', 'bash', { command: 'node scripts/test-helper.mjs' }, true, 'AssertionError'],
    ['description', 'bash', { command: 'false', description: 'npm test' }, true, '✖'],
    ['output', 'bash', { command: 'cat report.txt' }, false, 'npm test\nnot ok 1'],
    ['other-tool', 'read', { command: 'npm test' }, true, 'FAILED'],
  ]) {
    l.call(id, name, args)
    l.result(id, isError, output)
    assert.equal(foldSession(l.events).gag, null, id)
  }
  l.result('unmatched', true, 'FAILED npm test')
  assert.equal(foldSession(l.events).gag, null)
})

test('compaction start emits one gag that survives end and ordinary refresh events', () => {
  const l = log()
  const start = l.append('compaction/start', {})
  const gag = foldSession(l.events).gag
  assert.equal(gag.kind, 'compacting')
  assert.equal(gag.at, start.time)
  l.append('compaction/end', {})
  l.append('session/title', { title: 'Still compacted' })
  l.append('turn/end', { turn: 1 })
  assert.deepEqual(foldSession(l.events).gag, gag)
  l.append('compaction/start', {})
  assert.notEqual(foldSession(l.events).gag.id, gag.id)
})

test('gag IDs are stable per replay and unique per occurrence, not per timestamp or kind', () => {
  for (const withSeq of [true, false]) {
    const l = log({ withSeq })
    l.append('compaction/start', {}, { time: 2000 })
    const first = foldSession(l.events).gag
    l.append('compaction/start', {}, { time: 2000 })
    const second = foldSession(l.events).gag
    assert.equal(first.kind, second.kind)
    assert.equal(first.at, second.at)
    assert.notEqual(first.id, second.id)
    assert.deepEqual(foldSession(l.events).gag, second)
    assert.deepEqual(l.events.reduce(reduce, undefined).board.gag, second)
    const other = structuredClone(l.events)
    other[0].id = 'other-session'
    assert.notEqual(foldSession(other).gag.id, second.id)
  }
})

test('sequence IDs and fallback ordinals occupy distinct identities', () => {
  const l = log({ withSeq: false })
  l.append('compaction/start', {}, { seq: 3 })
  const first = foldSession(l.events).gag.id
  l.append('compaction/start', {})
  assert.notEqual(foldSession(l.events).gag.id, first)
})

test('fork boundaries preserve child header metadata but reset inherited title and live state', () => {
  const l = log({ withSeq: false, header: { id: 'child', cwd: '/child/workspace', createdAt: 7000, isSeeded: true } })
  l.append('session/title', { title: 'Parent title' })
  l.stage('reproduce')
  l.call('parent-question', 'ask_user_question', question('Parent question?'))
  l.append('approval/asked', { id: 'parent-approval', toolName: 'bash', reason: 'Parent approval?' })
  l.append('subagent/catalog', { childId: 'parent-child' })
  l.append('compaction/start', {})
  const inheritedGag = foldSession(l.events).gag
  const boundary = l.append('session/end-seed', { inherited: true })
  let board = foldSession(l.events)
  assert.equal(board.sessionId, 'child')
  assert.equal(board.cwd, '/child/workspace')
  assert.equal(board.startedAt, 7000)
  assert.equal(board.lastEventAt, boundary.time)
  assert.equal(board.title, null)
  assert.equal(board.workflow, undefined)
  assert.equal(board.stage, undefined)
  assert.deepEqual(board.history, [])
  assert.equal(board.needs, null)
  assert.equal(board.gag, null)
  assert.equal(board.subagentCount, 0)
  assert.equal(board.status, 'idle')
  assert.equal(board.detail, '')
  l.call('inherited-child-message', 'send_message', { agent_id: 'parent-child', message: 'Not owned by this session' })
  l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'parent-child' }, content: 'Inherited settlement' })
  assert.equal(foldSession(l.events).status, 'idle')
  assert.equal(foldSession(l.events).subagentCount, 0)
  l.result('parent-question')
  l.append('approval/decided', { id: 'parent-approval', outcome: 'allowed-once' })
  assert.equal(foldSession(l.events).gag, null)
  l.append('session/title', { title: 'Child title' })
  l.append('compaction/start', {})
  board = foldSession(l.events)
  assert.equal(board.title, 'Child title')
  assert.notEqual(board.gag.id, inheritedGag.id)
  assert.equal(board.cwd, '/child/workspace')
  assert.equal(board.startedAt, 7000)
})

test('an ordinary end-seed marker does not discard own-session live state', () => {
  const l = log()
  l.append('session/title', { title: 'Own title' })
  l.call('question', 'ask_user_question', question('Own question?'))
  l.append('compaction/start', {})
  const before = foldSession(l.events)
  l.append('session/end-seed', { inherited: false })
  const after = foldSession(l.events)
  assert.equal(after.title, before.title)
  assert.deepEqual(after.needs, before.needs)
  assert.deepEqual(after.gag, before.gag)
  l.append('subagent/catalog', { childId: 'child' })
  l.result('question')
  l.append('session/end-seed', { inherited: false })
  assert.equal(foldSession(l.events).status, 'working')
  assert.equal(foldSession(l.events).detail, '等 1 个助手回来')
})

test('incremental branches and complete replay are pure and expose no pending maps', () => {
  const l = log({ header: { cwd: '/workspace' } })
  l.append('session/title', { title: 'Pure replay' })
  l.call('question', 'ask_user_question', question('Choose?', ['A', 'B']))
  l.append('approval/asked', { id: 'approval', toolName: 'bash', reason: 'Continue?' })
  const eventsBefore = structuredClone(l.events)
  const previous = l.events.reduce(reduce, undefined)
  const previousBefore = structuredClone(previous)
  l.result('question')
  l.append('approval/decided', { id: 'approval', outcome: 'allowed-once' })
  l.append('compaction/start', {})
  const incremental = l.events.slice(eventsBefore.length).reduce(reduce, previous)
  const complete = foldSession(l.events)
  assert.deepEqual(previous, previousBefore)
  assert.deepEqual(l.events.slice(0, eventsBefore.length), eventsBefore)
  assert.deepEqual(incremental.board, complete)
  assert.deepEqual(foldSession(l.events), complete)
  assert.deepEqual(complete.needs, null)
  assert.equal(complete.gag.kind, 'compacting')
  assert.equal('pending' in complete, false)
  assert.equal('approvals' in complete, false)
  assert.equal('ordinal' in complete, false)
})

test('legacy check fields are ignored while arbitrary paths and workflow switches replay', () => {
  const l = log()
  l.call('legacy', 'pstack_stage', {
    workflow: 'bug-fix', stage: 'verify', note: 'Old registered command',
    check: { command: 'sh bug.sh', expect: 'right' },
  })
  l.result('legacy')
  let board = foldSession(l.events)
  assert.equal(board.stage, 'verify')
  assert.deepEqual(board.skipped, ['reproduce', 'bisect', 'plan-fix', 'red', 'fix'])
  l.stage('fix')
  board = foldSession(l.events)
  assert.equal(board.history.at(-1).kind, 'rollback')
  l.call('switch', 'pstack_stage', { workflow: 'investigation', stage: 'explain', note: 'Explain instead', check: 'obsolete' })
  const switched = l.result('switch')
  board = foldSession(l.events)
  assert.deepEqual(board.handoffFrom, { workflow: 'bug-fix', stage: 'fix', at: switched.time })
  assert.deepEqual(board.skipped, ['scope', 'explore'])
  assert.equal('check' in board, false)
  assert.equal('gate' in board, false)
  assert.equal('evidence' in l.events.reduce(reduce, undefined), false)
  assert.equal(board.history.some(entry => 'check' in entry), false)
})

for (const [name, command, output, kind, url] of [
  ['GitHub URL', 'gh pr create --base main', 'https://github.example/acme/widget/pull/17', 'pr', 'https://github.example/acme/widget/pull/17'],
  ['GitLab URL', 'glab mr create --target-branch main', 'https://gitlab.example/acme/group/widget/-/merge_requests/23', 'mr', 'https://gitlab.example/acme/group/widget/-/merge_requests/23'],
  ['GitHub command', 'gh pr create --base main', 'created', 'pr', undefined],
  ['GitLab command', 'glab mr create --target-branch main', 'created', 'mr', undefined],
  ['local commit', 'git -C "/tmp/work tree" commit -m "fix(cli): carry seconds"', '[fix-cli abc1234] fix(cli): carry seconds', 'local', undefined],
  ['commit with hooks bypassed', 'git commit -n -m x', 'committed', 'local', undefined],
  ['commit in an AND chain', 'git add . && git commit -m x && git status', 'committed', 'local', undefined],
  ['commit in an OR chain', 'git diff --quiet || git commit -am x', 'committed', 'local', undefined],
  ['commit before a pipe', 'git commit -m x | cat', 'committed', 'local', undefined],
  ['commit after a semicolon', 'git add .; git -C repo commit -m x', 'committed', 'local', undefined],
  ['commit after a newline', 'git add .\ngit commit -m x', 'committed', 'local', undefined],
  ['assignment and command prefix', 'GH_PROMPT_DISABLED=1 command gh pr create', 'created', 'pr', undefined],
  ['env prefix and quoted assignment', 'env TITLE="a; b && c" glab mr create', 'created', 'mr', undefined],
  ['nested prefixes', 'LC_ALL=C command env GIT_EDITOR=true git -C repo commit -m x', 'committed', 'local', undefined],
  ['quoted command words', '"gh" p\'r\' create --title "a; b && c"', 'created', 'pr', undefined],
  ['escaped command words', 'g\\h pr cre\\ate', 'created', 'pr', undefined],
  ['continued command line', 'git \\\ncommit -m x', 'committed', 'local', undefined],
]) {
  test(`delivery recognizes committed successful ${name}`, () => {
    const l = log()
    l.stage('pr')
    l.call('delivery', 'bash', { command })
    assert.equal(foldSession(l.events).delivery, null)
    const result = l.result('delivery', false, output)
    assert.deepEqual(foldSession(l.events).delivery, { kind, ...(url ? { url } : {}), at: result.time })
    assert.deepEqual(l.events.reduce(reduce, undefined).board, foldSession(l.events))
  })
}

for (const [name, command, output] of [
  ['J4 echo of a forge command', 'echo "gh pr create --base main"', 'gh pr create --base main'],
  ['J4 URL read from notes', 'cat notes.md', 'https://github.com/acme/widget/pull/17'],
  ['J4 dry-run commit', 'git commit --dry-run', 'no changes added to commit'],
  ['echoed URL', 'echo https://github.com/acme/widget/pull/17', 'https://github.com/acme/widget/pull/17'],
  ['single-quoted separators', "echo 'example; gh pr create && glab mr create'", 'example'],
  ['double-quoted separators', 'echo "example | git commit -m x\\n; gh pr create"', 'example'],
  ['escaped quotes', 'echo "example \\"; gh pr create"', 'example'],
  ['escaped separator', 'echo example\\; gh pr create', 'example'],
  ['commented command', 'echo example # ; gh pr create', 'example'],
  ['command argument', 'printf "%s" gh pr create', 'gh pr create'],
  ['prefixed dry run', 'env FOO=bar command git -C repo commit --dry-run', 'would commit'],
  ['GitHub view', 'gh pr view --json url', 'https://github.com/acme/widget/pull/17'],
  ['GitLab view', 'glab mr view', 'https://gitlab.com/acme/widget/-/merge_requests/23'],
  ['command lookup', 'command -v gh pr create', 'gh'],
]) {
  test(`delivery rejects ${name}`, () => {
    const l = log()
    l.stage('pr')
    l.call('delivery', 'bash', { command })
    l.result('delivery', false, output)
    assert.equal(foldSession(l.events).delivery, null)
    assert.deepEqual(l.events.reduce(reduce, undefined).board, foldSession(l.events))
  })
}

test('delivery does not take a URL from local commit output', () => {
  const l = log()
  l.stage('pr')
  l.call('commit', 'bash', { command: 'git commit -m "See https://github.com/acme/widget/pull/17"' })
  const result = l.result('commit', false, '[main abc1234] See https://github.com/acme/widget/pull/17')
  assert.deepEqual(foldSession(l.events).delivery, { kind: 'local', at: result.time })
})

test('delivery ignores failed, uncommitted, unmatched and pre-delivery commands', () => {
  const l = log()
  l.stage('fix')
  l.call('early', 'bash', { command: 'git commit -m "fix(cli): carry seconds"' })
  l.result('early', false, 'https://github.com/acme/widget/pull/1')
  l.stage('pr')
  l.call('failed', 'bash', { command: 'gh pr create --base main' })
  l.result('failed', true, 'https://github.com/acme/widget/pull/2')
  l.call('nonzero', 'bash', { command: 'gh pr create --base main' })
  l.result('nonzero', false, 'https://github.com/acme/widget/pull/3\n[exit code: 1]')
  l.call('unknown-success', 'bash', { command: 'gh pr create --base main' })
  l.append('tool/result', { turn: 1, step: 1, message: { toolCallId: 'unknown-success', content: 'https://github.com/acme/widget/pull/4' } })
  l.result('unmatched', false, 'https://github.com/acme/widget/pull/5')
  l.call('pending', 'bash', { command: 'gh pr create --base main' })
  l.call('read', 'read', { path: 'delivery.txt' })
  l.result('read', false, 'https://github.com/acme/widget/pull/6')
  l.call('example', 'bash', { command: 'echo "git commit -m example"' })
  l.result('example', false, 'git commit -m example')
  assert.equal(foldSession(l.events).delivery, null)
})

test('latest delivery URL wins, including multiple URLs in one output; later local commits keep it', () => {
  const l = log()
  l.stage('pr')
  l.call('local', 'bash', { command: 'git commit -m "fix(cli): carry seconds"' })
  l.result('local')
  l.call('first', 'bash', { command: 'gh pr create --base main' })
  l.result('first', false, 'https://github.com/acme/widget/pull/1')
  l.stage('fix')
  l.call('latest', 'bash', { command: 'glab mr create --target-branch main' })
  const latest = l.result('latest', false, 'https://gitlab.com/acme/widget/-/merge_requests/2\nhttps://gitlab.com/acme/widget/-/merge_requests/3')
  l.call('later-local', 'bash', { command: 'git commit -m "fix(cli): follow up"' })
  l.result('later-local')
  assert.deepEqual(foldSession(l.events).delivery, { kind: 'mr', url: 'https://gitlab.com/acme/widget/-/merge_requests/3', at: latest.time })
})

test('ship delivers corrections, while read-only workflows never infer delivery from cited URLs', () => {
  for (const [workflow, stage, expected] of [
    ['maintain-verification-skill', 'ship', 'local'],
    ['investigation', 'reply', null],
    ['runtime-forensics', 'report', null],
  ]) {
    const l = log()
    l.call('stage', 'pstack_stage', { workflow, stage, note: 'Ready' })
    l.result('stage')
    l.call('commit', 'bash', { command: 'git commit -m "fix(verify): correct selector"' })
    const result = l.result('commit')
    assert.deepEqual(foldSession(l.events).delivery, expected ? { kind: expected, at: result.time } : null)
    if (expected === null) {
      l.call('reference', 'bash', { command: 'cat investigation.txt' })
      l.result('reference', false, 'https://github.com/acme/widget/pull/1')
      assert.equal(foldSession(l.events).delivery, null)
      const end = l.append('turn/end', { turn: 1 })
      assert.equal(foldSession(l.events).status, 'finished')
      assert.equal(foldSession(l.events).finishedAt, end.time)
    }
  }
})

test('finishedAt records only the finished transition and is cleared on resume', () => {
  const l = log()
  l.append('turn/start', { turn: 1 })
  l.stage('pr')
  assert.equal(foldSession(l.events).finishedAt, null)
  l.append('subagent/catalog', { childId: 'child' })
  l.append('turn/end', { turn: 1 })
  assert.equal(foldSession(l.events).finishedAt, null)
  const settled = l.append('user/message', { source: { kind: 'subagent-settled', senderSessionId: 'child' }, content: 'Done' })
  assert.equal(foldSession(l.events).finishedAt, settled.time)
  l.append('session/title', { title: 'Finished title' })
  assert.equal(foldSession(l.events).finishedAt, settled.time)
  l.append('turn/start', { turn: 2 })
  assert.equal(foldSession(l.events).finishedAt, null)
  const ended = l.append('turn/end', { turn: 2 })
  assert.equal(foldSession(l.events).finishedAt, ended.time)
})

test('old logs without committed stage and delivery evidence retain null delivery and finishedAt', () => {
  const l = log({ withSeq: false })
  l.append('user/message', { content: 'Opened https://github.com/acme/widget/pull/1' })
  l.append('todo/write', { todos: [{ content: '开 PR', status: 'completed' }] })
  l.append('turn/end', { turn: 1 })
  const board = foldSession(l.events)
  assert.equal(board.delivery, null)
  assert.equal(board.finishedAt, null)
})

test('latest chart is the last committed canvas_check that passed, with its resolved call path', () => {
  const l = log({ header: { cwd: '/work' } })
  const check = (id, path, isError, scope) => {
    l.call(id, 'canvas_check', { path, image: false }, scope)
    return l.result(id, isError, isError ? 'Error: ✗ 图 4:6' : '✓ 图 校验通过', scope)
  }
  assert.equal(foldSession(l.events).canvas, null)
  check('c1', 'docs/flow.mmd', true)
  assert.equal(foldSession(l.events).canvas, null, 'a failed check is not a chart')
  const passed = check('c2', 'docs/flow.mmd', false, { turn: 1, step: 2 })
  assert.deepEqual(foldSession(l.events).canvas, { path: '/work/docs/flow.mmd', at: passed.time })
  const newer = check('c3', '/work/app/order.mmd', false, { turn: 1, step: 3 })
  check('c4', 'docs/flow.mmd', true, { turn: 1, step: 4 })
  assert.deepEqual(foldSession(l.events).canvas, { path: '/work/app/order.mmd', at: newer.time }, 'a later failure keeps the last pass')
  // The result commits the call; a call still pending is not a chart.
  l.call('c5', 'canvas_check', { path: 'pending.mmd' }, { turn: 2, step: 1 })
  assert.equal(foldSession(l.events).canvas.path, '/work/app/order.mmd')
  // Same provider ID in another model step is a different call (callKey).
  l.result('c5', false, 'ok', { turn: 2, step: 9 })
  assert.equal(foldSession(l.events).canvas.path, '/work/app/order.mmd')
  const late = l.result('c5', false, 'ok', { turn: 2, step: 1 })
  assert.deepEqual(foldSession(l.events).canvas, { path: '/work/pending.mmd', at: late.time })
  // Other tools with a path argument never set the chart.
  l.call('w1', 'write', { path: 'other.mmd', content: 'flowchart LR' }, { turn: 3, step: 1 })
  l.result('w1', false, 'Created file', { turn: 3, step: 1 })
  assert.equal(foldSession(l.events).canvas.path, '/work/pending.mmd')
})

test('malformed canvas_check calls and results never set the chart and never throw', () => {
  const l = log({ header: { cwd: '/work' } })
  const raw = (id, args, message, step) => {
    l.append('tool/call', { turn: 1, step, callId: id, name: 'canvas_check', arguments: args })
    l.append('tool/result', { turn: 1, step, message: { role: 'tool', toolCallId: id, content: [{ type: 'text', text: 'ok' }], ...message } })
  }
  raw('m1', 'not json', { isError: false }, 1)
  raw('m2', JSON.stringify({ path: 7 }), { isError: false }, 2)
  raw('m3', JSON.stringify({ path: '' }), { isError: false }, 3)
  raw('m4', JSON.stringify({ image: true }), { isError: false }, 4)
  raw('m5', JSON.stringify(['a.mmd']), { isError: false }, 5)
  raw('m6', JSON.stringify({ path: 'no-flag.mmd' }), {}, 6)
  raw('m7', JSON.stringify({ path: 'string-flag.mmd' }), { isError: 'false' }, 7)
  raw('m8', null, { isError: false }, 8)
  l.append('tool/result', { turn: 1, step: 9, message: { role: 'tool', toolCallId: 'orphan', isError: false, content: 'ok' } })
  assert.equal(foldSession(l.events).canvas, null)
  // Object arguments (not a JSON string) follow the same reader as every other tool.
  raw('m9', { path: 'object-args.mmd' }, { isError: false }, 10)
  assert.equal(foldSession(l.events).canvas.path, '/work/object-args.mmd')
})

test('latest chart replays identically, survives own end-seed markers, and resets at a fork boundary', () => {
  const l = log({ header: { cwd: '/work' } })
  l.call('c1', 'canvas_check', { path: 'parent.mmd' })
  const parent = l.result('c1')
  const replayed = l.events.reduce(reduce, undefined)
  assert.deepEqual(replayed.board, foldSession(l.events))
  assert.deepEqual(JSON.parse(JSON.stringify(foldSession(l.events))).canvas, { path: '/work/parent.mmd', at: parent.time })
  l.append('session/end-seed', { inherited: false })
  assert.equal(foldSession(l.events).canvas.path, '/work/parent.mmd')
  l.append('session/end-seed', { inherited: true })
  assert.equal(foldSession(l.events).canvas, null, 'inherited history is not the fork\'s own chart')
  l.call('c2', 'canvas_check', { path: 'child.mmd' }, { turn: 2, step: 1 })
  l.result('c2', false, 'ok', { turn: 2, step: 1 })
  assert.equal(foldSession(l.events).canvas.path, '/work/child.mmd')
  assert.deepEqual(foldBoard([l.events]).map(board => board.canvas.path), ['/work/child.mmd'])
})

test('F13 latest chart resolves against working-directory changes at call time and replays deterministically', () => {
  const l = log({ header: { id: 's1', cwd: '/w' } })
  l.call('cd', 'working_directory', { cd: 'sub' })
  l.append('working-directory/change', { cwd: '/w/sub' })
  l.result('cd')
  l.call('chart', 'canvas_check', { path: 'plan.mmd' }, { turn: 1, step: 2 })
  // The result may arrive after another change: only the call-time cwd owns this path.
  l.append('working-directory/change', { cwd: '/elsewhere' })
  const result = l.result('chart', false, 'ok', { turn: 1, step: 2 })
  const expected = { path: '/w/sub/plan.mmd', at: result.time }
  const full = foldSession(l.events)
  assert.deepEqual(full.canvas, expected)
  assert.equal(full.cwd, '/w', 'the public project directory remains the immutable session header')
  assert.deepEqual(l.events.reduce(reduce, undefined).board, full)
  assert.deepEqual(foldSession(JSON.parse(JSON.stringify(l.events))), full)
  for (let boundary = 1; boundary < l.events.length; boundary++) {
    const prefix = l.events.slice(0, boundary).reduce(reduce, undefined)
    assert.deepEqual(l.events.slice(boundary).reduce(reduce, prefix).board, full)
  }
  l.call('absolute', 'canvas_check', { path: '/fixed/../chart.mmd' }, { turn: 1, step: 3 })
  l.result('absolute', false, 'ok', { turn: 1, step: 3 })
  assert.equal(foldSession(l.events).canvas.path, '/fixed/../chart.mmd', 'absolute arguments stay verbatim')
})

test('F13 unknown cwd never invents a relative chart address, while an absolute path needs no cwd', () => {
  const l = log()
  l.call('relative', 'canvas_check', { path: 'plan.mmd' })
  l.result('relative')
  assert.equal(foldSession(l.events).canvas, null)
  l.call('absolute', 'canvas_check', { path: '/w/plan.mmd' }, { turn: 1, step: 2 })
  l.result('absolute', false, 'ok', { turn: 1, step: 2 })
  assert.equal(foldSession(l.events).canvas.path, '/w/plan.mmd')
})

for (const { name, path, changed, cwd = '/w', expected } of [
  { name: 'cross-check home path after cd', path: '~/diagram.mmd', changed: true, expected: '~/diagram.mmd' },
  { name: 'home directory alone after cd', path: '~', changed: true, expected: '~' },
  { name: 'named user is an ordinary relative path', path: '~user/x', changed: true, expected: '/w/sub/~user/x' },
  { name: 'unchanged cwd home-path control', path: '~/diagram.mmd', changed: false, expected: '~/diagram.mmd' },
  { name: 'home path needs no cwd', path: '~/diagram.mmd', changed: false, cwd: null, expected: '~/diagram.mmd' },
  { name: 'home directory needs no cwd', path: '~', changed: false, cwd: null, expected: '~' },
]) {
  test(`home-relative chart paths: ${name}, with deterministic replay`, () => {
    const events = [
      { type: 'session', version: 4, id: 's1', createdAt: 1, cwd },
      ...(changed ? [{ type: 'working-directory/change', time: 2, seq: 0, data: { cwd: '/w/sub' } }] : []),
      { type: 'tool/call', time: 3, seq: 1, data: { turn: 1, step: 1, callId: 'c1', name: 'canvas_check', arguments: JSON.stringify({ path }) } },
      { type: 'tool/result', time: 4, seq: 2, data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'c1', isError: false, content: [] } } },
    ]
    const full = foldSession(events)
    assert.deepEqual(full.canvas, { path: expected, at: 4 })
    assert.equal(full.cwd, cwd)
    assert.deepEqual(events.reduce(reduce, undefined).board, full)
    assert.deepEqual(foldSession(JSON.parse(JSON.stringify(events))), full)
    for (let boundary = 1; boundary < events.length; boundary++) {
      const prefix = events.slice(0, boundary).reduce(reduce, undefined)
      assert.deepEqual(events.slice(boundary).reduce(reduce, prefix).board, full)
    }
  })
}
