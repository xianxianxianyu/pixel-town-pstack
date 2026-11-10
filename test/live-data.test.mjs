import assert from 'node:assert/strict'
import test from 'node:test'
import { GOAL_PHASES, attentionItems, createBoard, evidenceRequest, mailboxItems, mapBoard, openFindings, recentLeavers, residentNameplate, sortResidents, STATUS } from '../board/live-data.js'
import { ART, CHARACTERS, PLAQUES, PROPS, plaqueForWorkflow } from '../board/art.js'
import { workflows } from '../lib/workflows.js'

function session(overrides = {}) {
  return {
    sessionId: 'session-live', title: '真实标题', cwd: '/work/project', startedAt: 1000,
    workflow: 'bug-fix', stage: 'red', status: 'working', skill: null, detail: '正在写复现测试',
    subagentCount: 2, skipped: ['plan-fix'], stageEnteredAt: 2000, lastEventAt: 3000,
    needs: null, gag: { id: 'seq:20', kind: 'test-red', text: '红灯测试失败', at: 2500 },
    ...overrides,
  }
}

const payload = (sessions = []) => ({ workflows, sessions })

test('pure mapping keeps real fields, stage art fallback and stable gag identity', () => {
  const raw = payload([session()])
  const before = structuredClone(raw)
  const mapped = mapBoard(raw)
  assert.deepEqual(raw, before)
  assert.deepEqual(mapBoard(raw), mapped)
  const resident = mapped.residents[0]
  assert.equal(resident.id, 'session-live')
  assert.equal(resident.title, '真实标题')
  assert.equal(resident.repo, 'project')
  assert.equal(resident.skill, 'tdd')
  assert.equal(resident.detail, '正在写复现测试')
  assert.equal(resident.subagents.length, 2)
  assert.equal(new Set(resident.subagents.map(child => child.id)).size, 2)
  assert.ok(resident.subagents.every(child => child.status === 'unknown'))
  assert.deepEqual(resident.event, before.sessions[0].gag)
  assert.equal(mapBoard(payload([session({ lastEventAt: 5000 })])).residents[0].event.id, resident.event.id)
  assert.equal(mapBoard(payload([session({ skill: 'actual-loaded-skill' })])).residents[0].skill, 'actual-loaded-skill')
})

test('checkpoint and interruption survive mapping while old hosts default both to null', () => {
  const checkpoint = { at: 4000, waitingFor: '要不要修', reason: 'handback', path: '/data/resume/session-live.md' }
  const interruption = { at: 5000, kind: 'interrupted' }
  const saved = mapBoard(payload([session({ status: 'paused', checkpoint })])).residents[0]
  const broken = mapBoard(payload([session({ status: 'interrupted', checkpoint, interruption })])).residents[0]
  const old = mapBoard(payload([session()])).residents[0]
  assert.deepEqual(saved.checkpoint, checkpoint)
  assert.equal(saved.interruption, null)
  assert.deepEqual(broken.checkpoint, checkpoint)
  assert.deepEqual(broken.interruption, interruption)
  assert.equal(old.checkpoint, null)
  assert.equal(old.interruption, null)
  const board = createBoard()
  assert.equal(board.nextStep({ ...saved, gate: { state: 'missing', summary: '旧门槛' } }), '存档了，等你：要不要修')
  assert.equal(board.nextStep(broken), '断了没存档，继续前先补存档')
  assert.equal(STATUS.paused.label, '已存档')
  assert.equal(STATUS.interrupted.label, '断了')
  assert.deepEqual(sortResidents([saved, old, broken, { status: 'needsYou' }]).map(item => item.status), ['needsYou', 'interrupted', 'working', 'paused'])
})

test('deliveries and finish times survive mapping; 最近离开 lists the newest 20 finished sessions', () => {
  const pr = { kind: 'pr', url: 'https://github.com/acme/app/pull/42', at: 9000 }
  const sessions = mapBoard(payload([
    session({ sessionId: 'pr', status: 'finished', delivery: pr, finishedAt: 9100 }),
    session({ sessionId: 'local', status: 'finished', delivery: { kind: 'local', at: 8000 }, finishedAt: 8100 }),
    session({ sessionId: 'read-only', status: 'finished', finishedAt: 9500 }),
    session({ sessionId: 'old-host', status: 'finished', lastEventAt: 9300 }),
    session({ sessionId: 'working', delivery: pr }),
  ])).sessions
  assert.deepEqual(sessions[0].delivery, pr)
  assert.deepEqual(sessions[1].delivery, { kind: 'local', url: null, at: 8000 })
  assert.equal(sessions[2].delivery, null)
  assert.equal(sessions[3].delivery, null)
  assert.equal(sessions[3].finishedAt, null)
  assert.deepEqual(recentLeavers(sessions).map(item => item.id), ['read-only', 'old-host', 'pr', 'local'])
  const many = Array.from({ length: 25 }, (_, index) => ({ id: `s${index}`, status: 'finished', finishedAt: index }))
  assert.deepEqual(recentLeavers(many).map(item => item.id), many.slice(5).reverse().map(item => item.id))
})

test('the latest chart keeps the host path and names its file; old hosts and malformed values map to null', () => {
  const mapped = mapBoard(payload([
    session({ sessionId: 'posix', canvas: { path: '/work/project/docs/order flow.mmd', at: 7000 } }),
    session({ sessionId: 'relative', canvas: { path: 'docs\\pay.mmd', at: 7100 } }),
    session({ sessionId: 'bare', canvas: { path: 'flow.mmd', at: 7200 } }),
    session({ sessionId: 'old-host' }),
    ...[null, {}, { path: '' }, { path: 7, at: 1 }, 'flow.mmd'].map((canvas, index) => session({ sessionId: `bad-${index}`, canvas })),
  ])).sessions
  assert.deepEqual(mapped.slice(0, 3).map(item => item.canvas), [
    { path: '/work/project/docs/order flow.mmd', name: 'order flow.mmd', at: 7000 },
    { path: 'docs\\pay.mmd', name: 'pay.mmd', at: 7100 },
    { path: 'flow.mmd', name: 'flow.mmd', at: 7200 },
  ])
  assert.deepEqual(mapped.slice(3).map(item => item.canvas), Array(6).fill(null))
})

test('decision trails keep the host shape and only ended turns with open findings or flags need attention', () => {
  const trail = {
    on: true,
    rows: [
      { n: 1, at: 1000, workflow: 'bug-fix', stage: 'fix', decision: '第 1 轮修复', why: '根因在缓存键', evidence: [{ kind: 'call', ref: 'call_1' }, { kind: 'url', ref: 'https://example.test/pr/1' }], result: 'tests green', supersededBy: 2 },
      { n: 2, at: 2000, workflow: 'bug-fix', stage: 'fix', decision: '更正 #1', why: '测试其实失败了', evidence: [{ kind: 'commit', ref: 'abc1234' }], result: 'reverted', supersedes: 1 },
    ],
    audit: { at: 3000, findings: [{ kind: 'superseded', rows: [1], detail: '#1 已更正' }] },
    review: { at: 4000, model: 'vendor/model', flags: [] },
  }
  const flagged = { ...trail, review: { ...trail.review, flags: [{ text: '没有复测', rows: [2] }] } }
  const finding = { ...trail, audit: { at: 3000, findings: [{ kind: 'unlogged-change', stage: 'fix', detail: '改了文件没记' }] }, review: null }
  const mapped = mapBoard(payload([
    session({ sessionId: 'clean', status: 'finished', trail }),
    session({ sessionId: 'flagged', status: 'idle', trail: flagged }),
    session({ sessionId: 'finding', status: 'finished', trail: finding }),
    session({ sessionId: 'working', status: 'working', trail: flagged }),
    session({ sessionId: 'asking', status: 'needsYou', trail: flagged }),
    session({ sessionId: 'old', status: 'finished' }),
  ]))
  const [clean] = mapped.sessions
  assert.deepEqual(clean.trail.rows.map(({ n, supersedes, supersededBy }) => [n, supersedes, supersededBy]), [[1, null, 2], [2, 1, null]])
  assert.deepEqual(clean.trail.rows[0].evidence, trail.rows[0].evidence)
  assert.deepEqual(clean.trail.review, trail.review)
  assert.deepEqual(openFindings(clean.trail), [])
  assert.deepEqual(mapped.sessions[2].trail.audit.findings, [{ kind: 'unlogged-change', rows: [], stage: 'fix', detail: '改了文件没记' }])
  assert.equal(mapped.sessions[2].trail.review, null)
  assert.equal(mapped.sessions[5].trail, null)
  assert.deepEqual(attentionItems(mapped.sessions).map(item => item.id), ['flagged', 'finding'])
})

test('trail projection preserves invocation and historical call namespaces even for identical refs', () => {
  const raw = payload([session({
    trail: {
      on: true,
      rows: [{
        n: 1, at: 1000, workflow: 'bug-fix', stage: 'fix', decision: '保留证据身份',
        evidence: [
          { kind: 'call', ref: 'seq:42' },
          { kind: 'invocation', ref: 'seq:42' },
          { kind: 'call', ref: 'tuple:%5B%22message-id%22%2C0%2C%22call-id%22%5D' },
          { kind: 'invocation', ref: 'tuple:%5B%22message-id%22%2C0%2C%22call-id%22%5D' },
          { kind: 'call', ref: 'call_1' },
        ],
      }],
    },
  })])
  const before = structuredClone(raw)
  const mapped = mapBoard(raw)
  assert.deepEqual(mapped.sessions[0].trail.rows[0].evidence, [
    { kind: 'call', ref: 'seq:42' },
    { kind: 'invocation', ref: 'seq:42' },
    { kind: 'call', ref: 'tuple:%5B%22message-id%22%2C0%2C%22call-id%22%5D' },
    { kind: 'invocation', ref: 'tuple:%5B%22message-id%22%2C0%2C%22call-id%22%5D' },
    { kind: 'call', ref: 'call_1' },
  ])
  assert.deepEqual(raw, before)
})

test('evidence requests distinguish mixed chips in the same row and preserve row and session identity', () => {
  const historical = evidenceRequest('session-live', 1, { kind: 'call', ref: 'seq:42' })
  const canonical = evidenceRequest('session-live', 1, { kind: 'invocation', ref: 'seq:42' })
  assert.deepEqual(historical, {
    key: '1:call:seq:42',
    label: 'call:seq:42',
    url: '../evidence?session=session-live&call=seq%3A42',
  })
  assert.deepEqual(canonical, {
    key: '1:invocation:seq:42',
    label: 'invocation:seq:42',
    url: '../evidence?session=session-live&invocation=seq%3A42',
  })
  assert.notEqual(historical.key, canonical.key)
  assert.equal(evidenceRequest('session-live', 2, { kind: 'invocation', ref: 'seq:42' }).key, '2:invocation:seq:42')
  assert.equal(evidenceRequest('another-session', 1, { kind: 'invocation', ref: 'seq:42' }).url,
    '../evidence?session=another-session&invocation=seq%3A42')
})

test('evidence request selectors follow kind alone and encode refs without reinterpreting provider IDs', () => {
  const refs = [
    'call_1',
    'seq:42',
    'tuple:%5B%22message-id%22%2C0%2C%22call-id%22%5D',
    'invocation:seq:42',
    'call:last',
    'provider:part&invocation=seq:7? space+#/%雪',
  ]
  for (const kind of ['call', 'invocation']) {
    for (const ref of refs) {
      const request = evidenceRequest('session &+#/雪', 3, { kind, ref })
      const url = new URL(request.url, 'https://example.test/api/pixel-town-pstack/town/')
      assert.equal(url.pathname, '/api/pixel-town-pstack/evidence')
      assert.deepEqual([...url.searchParams], [['session', 'session &+#/雪'], [kind, ref]])
      assert.equal(request.key, `3:${kind}:${ref}`)
      assert.equal(request.label, `${kind}:${ref}`)
    }
  }
})

test('goals keep the native DSH shape; a blocked goal needs the user once the turn has ended', () => {
  const goal = (phase, extra = {}) => ({ objective: '把缓存做完', phase, rounds: 2, maxRounds: 5, updatedAt: 7000, ...extra })
  const blockedReason = { code: 'max-rounds', message: '轮次用完了' }
  const mapped = mapBoard(payload([
    session({ sessionId: 'active', goal: goal('active') }),
    session({ sessionId: 'paused', status: 'paused', goal: goal('paused') }),
    session({ sessionId: 'complete', status: 'idle', goal: goal('complete') }),
    session({ sessionId: 'blocked', status: 'idle', goal: goal('blocked', { blockedReason }) }),
    session({ sessionId: 'blocked-working', status: 'working', goal: goal('blocked', { blockedReason }) }),
    session({ sessionId: 'blocked-asking', status: 'needsYou', goal: goal('blocked', { blockedReason }) }),
    session({ sessionId: 'unknown', goal: goal('dreaming') }),
    session({ sessionId: 'old' }),
  ]))
  const [active, paused, complete, blocked] = mapped.sessions
  assert.deepEqual(active.goal, { objective: '把缓存做完', phase: 'active', rounds: 2, maxRounds: 5, blockedReason: null, updatedAt: 7000 })
  assert.equal(paused.goal.phase, 'paused')
  assert.equal(complete.goal.phase, 'complete')
  assert.deepEqual(blocked.goal.blockedReason, blockedReason)
  assert.equal(mapped.sessions[6].goal, null)
  assert.equal(mapped.sessions[7].goal, null)
  assert.deepEqual(Object.keys(GOAL_PHASES), ['active', 'paused', 'blocked', 'complete'])
  assert.deepEqual(Object.values(GOAL_PHASES), ['进行中', '已暂停', '受阻', '已完成'])
  assert.deepEqual(attentionItems(mapped.sessions).map(item => item.id), ['blocked'])
})

test('old hosts: pre-rename workflow ids reach the renamed plaques at the mapping boundary', () => {
  const oldIds = { feature: 'requirement', 'runtime-forensics': 'bug-analysis' }
  const oldWorkflows = workflows.map(workflow => oldIds[workflow.id] ? { ...workflow, id: oldIds[workflow.id], skill: `pstack-${oldIds[workflow.id]}` } : workflow)
  const trail = { on: true, rows: [{ n: 1, at: 1000, workflow: 'requirement', stage: 'build', decision: '先写测试', why: '', evidence: [], result: '' }], audit: null, review: null }
  const old = mapBoard({ workflows: oldWorkflows, sessions: [
    session({ sessionId: 'feature', workflow: 'requirement', stage: 'build', trail,
      history: [{ workflow: 'requirement', stage: 'restate', at: 1000, kind: 'enter' }],
      cost: { tokens: 10, steps: 1, maxContext: 10, children: 0, byStage: [{ workflow: 'requirement', stage: 'build', tokens: 10, steps: 1 }] } }),
    session({ sessionId: 'forensics', workflow: 'bug-analysis', stage: 'capture', handoffFrom: { workflow: 'bug-analysis', stage: 'intake', at: 900 } }),
  ] })
  assert.deepEqual(old.residents.map(s => [s.id, s.workflow, plaqueForWorkflow(s.workflow)?.name]), [['feature', 'feature', '实现功能'], ['forensics', 'runtime-forensics', '现场取证']])
  const [feature, forensics] = old.residents
  assert.deepEqual([feature.history[0].workflow, feature.cost.byStage[0].workflow, feature.trail.rows[0].workflow, forensics.handoffFrom.workflow], ['feature', 'feature', 'feature', 'runtime-forensics'])
  // The plaque keeps the command the old host knows; it has no delivery skill and no goals.
  assert.equal(old.workflows.find(w => w.id === 'feature').skill, 'pstack-requirement')
  assert.equal(old.workflows.some(w => w.id === 'requirement' || w.id === 'bug-analysis'), false)
  assert.equal(old.deliverySkill, null)
  assert.equal(feature.goal, null)
  assert.equal(plaqueForWorkflow('requirement'), null)
  // A host's own table replaces the built-in one, and a definition under the current id beats a legacy one.
  const table = mapBoard({ workflows: [{ ...workflows.find(w => w.id === 'bug-fix'), id: 'old-fix', skill: 'pstack-old-fix' }, ...workflows],
    legacyWorkflowIds: { 'old-fix': 'bug-fix' }, deliverySkill: 'pstack-opening-a-pr', sessions: [
      session({ sessionId: 'aliased', workflow: 'old-fix' }), session({ sessionId: 'untabled', workflow: 'requirement', stage: 'build' })] })
  assert.deepEqual(table.residents.map(s => [s.id, s.workflow]), [['aliased', 'bug-fix']])
  assert.deepEqual(table.others.map(s => s.id), ['untabled'])
  assert.equal(table.workflows.find(w => w.id === 'bug-fix').skill, 'pstack-bug-fix')
  assert.equal(table.deliverySkill, 'pstack-opening-a-pr')
})

test('manifest alone supplies stage structure; absent workflows have no stages or residents', () => {
  const manifest = [{ id: 'bug-fix', name: '来自主机的工作流', stages: [
    { id: 'verify', name: '主机第一站', doing: '执行真实命令', doneWhen: '输出通过', optional: true },
    { id: 'red', name: '主机第二站', doing: '让测试失败', doneWhen: '失败输出已见' },
  ] }]
  const mapped = mapBoard({ workflows: manifest, sessions: [session(), session({ sessionId: 'closed', workflow: 'adr', stage: 'decide' })] })
  const bugFix = mapped.workflows.find(workflow => workflow.id === 'bug-fix')
  assert.equal(bugFix.name, '来自主机的工作流')
  assert.deepEqual(bugFix.stages.map(({ id, name, doing, doneWhen, optional }) => ({ id, name, doing, doneWhen, ...(optional === undefined ? {} : { optional }) })), manifest[0].stages)
  assert.deepEqual(bugFix.stages[1].skills, ['tdd', 'principle-sequence-verifiable-units'])
  const closed = mapped.workflows.filter(workflow => !workflow.available)
  assert.deepEqual(closed.map(workflow => workflow.id), Object.keys(ART).filter(id => id !== 'bug-fix'))
  assert.ok(closed.every(workflow => workflow.stages.length === 0))
  assert.deepEqual(mapped.residents.map(item => item.id), ['session-live'])
  assert.deepEqual(mapped.others.map(item => item.id), ['closed'])
  for (const art of Object.values(ART)) for (const stage of Object.values(art.stages)) {
    assert.equal(stage.name, undefined)
    assert.equal(stage.doing, undefined)
    assert.equal(stage.doneWhen, undefined)
  }
})

test('no-workflow sessions stay in other sessions and titles fall back to cwd basename', () => {
  const question = { kind: 'question', question: '继续吗？', options: ['继续', '停止'] }
  const raw = session({ workflow: undefined, stage: undefined, title: null, cwd: '/work/a-repo/', status: 'needsYou', needs: question })
  const mapped = mapBoard(payload([raw]))
  assert.equal(mapped.residents.length, 0)
  assert.equal(mapped.others[0].title, 'a-repo')
  assert.equal(mapped.others[0].repo, 'a-repo')
  assert.equal(mapped.others[0].status, 'needsYou')
  assert.equal(mapped.others[0].detail, raw.detail)
  assert.deepEqual(mapped.others[0].needs, question)
  assert.equal(mapBoard(payload([session({ title: null, cwd: null })])).sessions[0].title, 'session-live')
  assert.deepEqual(mapBoard(payload()).sessions, [])
  assert.throws(() => mapBoard({ sessions: [] }), /Invalid DSH/)
})

test('resident ordering prioritizes attention, preserves ties and leaves input untouched', () => {
  const residents = [
    { id: 'finished-first', status: 'finished' },
    { id: 'working-first', status: 'working' },
    { id: 'idle-first', status: 'idle' },
    { id: 'interrupted-first', status: 'interrupted' },
    { id: 'needs-first', status: 'needsYou' },
    { id: 'working-second', status: 'working' },
    { id: 'needs-second', status: 'needsYou' },
    { id: 'finished-second', status: 'finished' },
    { id: 'paused-first', status: 'paused' },
    { id: 'idle-second', status: 'idle' },
  ]
  const before = structuredClone(residents)
  assert.deepEqual(sortResidents(residents).map(item => item.id), [
    'needs-first', 'needs-second', 'interrupted-first',
    'working-first', 'working-second', 'paused-first', 'idle-first', 'idle-second',
    'finished-first', 'finished-second',
  ])
  assert.deepEqual(residents, before)
  assert.deepEqual(sortResidents([]), [])
})

test('nameplates use the status glyph and color without changing the resident', () => {
  for (const [status, glyph, color] of [
    ['working', '忙', '#3b82f6'],
    ['needsYou', '问', '#f59e0b'],
    ['paused', '⏸', '#8b5cf6'],
    ['interrupted', '⚡', '#6b7280'],
    ['idle', '眠', '#9ca3af'],
    ['finished', '完', '#22c55e'],
  ]) {
    const resident = { title: '修复登录', status }
    const before = structuredClone(resident)
    assert.equal(STATUS[status].glyph, glyph)
    assert.equal(STATUS[status].color, color)
    assert.deepEqual(residentNameplate(resident, 7), { number: '07', title: '修复登录', glyph, color })
    assert.deepEqual(resident, before)
  }
})

test('nameplates truncate only after eight Unicode code points and retain longer numbers', () => {
  assert.deepEqual(residentNameplate({ title: '甲😀乙🚀丙🧪丁🌙戊', status: 'working' }, 123), {
    number: '123', title: '甲😀乙🚀丙🧪丁🌙…', glyph: '忙', color: '#3b82f6',
  })
  assert.equal(residentNameplate({ title: '甲😀乙🚀丙🧪丁🌙', status: 'idle' }, 1).title, '甲😀乙🚀丙🧪丁🌙')
  assert.equal(residentNameplate({ title: '123456789', status: 'idle' }, 1).title, '12345678…')
  assert.deepEqual(residentNameplate({ title: '', status: 'finished' }, 0), {
    number: '00', title: '', glyph: '完', color: '#22c55e',
  })
})

test('mailbox content and count include only waiting sessions in input order, including other sessions', () => {
  const manifest = [{ id: 'bug-fix', name: '测试修理铺', stages: [{ id: 'red', name: '复现站' }] }]
  const mapped = mapBoard({ workflows: manifest, sessions: [
    session({
      sessionId: 'other-waiting', title: '待批准的其他会话', workflow: undefined, stage: undefined,
      status: 'needsYou', needs: { kind: 'approval', question: '允许写入配置吗？', options: ['允许', '拒绝'] },
    }),
    session({ sessionId: 'working', needs: { question: '旧问题不应出现在信箱', options: ['旧选项'] } }),
    session({
      sessionId: 'resident-waiting', title: '待回答的居民', status: 'needsYou',
      needs: { kind: 'question', question: '使用哪个复现环境？', options: ['本地', '测试机'] },
    }),
    ...['paused', 'interrupted', 'idle', 'finished'].map(status => session({ sessionId: status, status })),
  ] })
  const before = structuredClone(mapped)
  const letters = mailboxItems(mapped.sessions, mapped.workflows)
  assert.equal(letters.length, 2)
  assert.deepEqual(letters, [
    {
      id: 'other-waiting', title: '待批准的其他会话', context: '其他会话',
      question: '允许写入配置吗？', options: ['允许', '拒绝'],
    },
    {
      id: 'resident-waiting', title: '待回答的居民', context: '测试修理铺 · 复现站',
      question: '使用哪个复现环境？', options: ['本地', '测试机'],
    },
  ])
  assert.deepEqual(mapped, before)
})

test('mailbox missing questions and options fall back without replacing present empty values', () => {
  const sessions = [
    { id: 'missing', title: '未提供问题', status: 'needsYou', inTown: false },
    { id: 'null', title: '空问题', status: 'needsYou', inTown: false, needs: null },
    { id: 'partial', title: '仅有问题', status: 'needsYou', inTown: false, needs: { question: '继续吗？' } },
    { id: 'null-fields', title: '空字段', status: 'needsYou', inTown: false, needs: { question: null, options: null } },
    { id: 'empty', title: '保留空值', status: 'needsYou', inTown: false, needs: { question: '', options: [] } },
  ]
  const before = structuredClone(sessions)
  assert.deepEqual(mailboxItems(sessions, []), [
    { id: 'missing', title: '未提供问题', context: '其他会话', question: '请到 DSH 查看待处理事项', options: [] },
    { id: 'null', title: '空问题', context: '其他会话', question: '请到 DSH 查看待处理事项', options: [] },
    { id: 'partial', title: '仅有问题', context: '其他会话', question: '继续吗？', options: [] },
    { id: 'null-fields', title: '空字段', context: '其他会话', question: '请到 DSH 查看待处理事项', options: [] },
    { id: 'empty', title: '保留空值', context: '其他会话', question: '', options: [] },
  ])
  assert.deepEqual(sessions, before)
})

test('mailbox is empty with a zero badge count when no sessions need a reply', () => {
  const populated = mapBoard(payload(['working', 'paused', 'interrupted', 'idle', 'finished'].map(status => session({ sessionId: status, status }))))
  for (const mapped of [mapBoard(payload()), populated]) {
    const letters = mailboxItems(mapped.sessions, mapped.workflows)
    assert.deepEqual(letters, [])
    assert.equal(letters.length, 0)
  }
})

function environment(fetcher) {
  const document = new EventTarget()
  document.hidden = false
  const timers = new Map()
  let id = 0
  const calls = []
  return {
    document, timers, calls,
    fetch(url, options) { calls.push({ url, options }); return fetcher(url, options) },
    setTimeout(fn, delay) { timers.set(++id, { fn, delay }); return id },
    clearTimeout(key) { timers.delete(key) },
    async fire() {
      assert.equal(timers.size, 1)
      const [key, timer] = [...timers][0]
      assert.equal(timer.delay, 1500)
      timers.delete(key)
      await timer.fn()
    },
    hidden(value) { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')) },
  }
}

function publication(board, trigger) {
  const deferred = Promise.withResolvers()
  let initial = true
  const unsubscribe = board.subscribe(snapshot => { if (!initial) deferred.resolve(snapshot) })
  initial = false
  trigger()
  return deferred.promise.finally(unsubscribe)
}

test('cost is mapped unchanged and totals follow the current snapshot including other sessions', async () => {
  const cost = {
    tokens: 1000, steps: 3, cacheHit: 800, miss: 150, output: 50,
    contextTokens: 950, maxContext: 500, children: 1,
    byStage: [{ workflow: 'bug-fix', stage: 'red', tokens: 1000, steps: 3, contextTokens: 950, maxContext: 500, children: 1 }],
  }
  assert.deepEqual(mapBoard(payload([session({ cost })])).sessions[0].cost, cost)
  assert.equal(mapBoard(payload([session()])).sessions[0].cost, null)
  let current = payload([
    session({ cost }),
    session({ sessionId: 'other', workflow: undefined, stage: undefined, cost: { ...cost, tokens: 2000, steps: 4 } }),
    session({ sessionId: 'legacy' }),
  ])
  const env = environment(async () => Response.json(current))
  const board = createBoard(env)
  assert.deepEqual(board.totalCost(), { tokens: 0, steps: 0 })
  await publication(board, () => board.start())
  assert.deepEqual(board.totalCost(), { tokens: 3000, steps: 7 })
  current = payload([session({ cost })])
  await env.fire()
  assert.deepEqual(board.totalCost(), { tokens: 1000, steps: 3 })
  board.stop()
})

test('polling is read-only, sequential, 1500 ms after completion, and resumes when visible', async () => {
  const env = environment(async () => Response.json(payload([session()])))
  const board = createBoard(env)
  await publication(board, () => board.start())
  assert.equal(board.connection.status, 'live')
  assert.equal(board.snapshot().length, 1)
  assert.equal(board.currentStage(board.snapshot()[0]).id, 'red')
  assert.equal(board.stageIndex(board.snapshot()[0]), 3)
  assert.equal(env.calls.length, 1)
  assert.equal(env.calls[0].url, '../board')
  assert.equal(env.calls[0].options.credentials, 'same-origin')
  assert.equal(env.calls[0].options.cache, 'no-store')
  board.start()
  assert.equal(env.calls.length, 1)
  await env.fire()
  assert.equal(env.calls.length, 2)
  env.hidden(true)
  assert.equal(env.timers.size, 0)
  board.retry()
  assert.equal(env.calls.length, 2)
  await publication(board, () => env.hidden(false))
  assert.equal(env.calls.length, 3)
  board.stop()
  assert.equal(env.timers.size, 0)
  env.hidden(false)
  assert.equal(env.calls.length, 3)
  assert.equal(board.answer, undefined)
  assert.equal(board.poke, undefined)
  assert.equal(board.tick, undefined)
})

test('401 and unreachable responses are errors, not empty successes, and retry recovers', async () => {
  let response = () => new Response('unauthorized', { status: 401 })
  const env = environment(async () => response())
  const board = createBoard(env)
  await publication(board, () => board.start())
  assert.equal(board.connection.status, 'error')
  assert.equal(board.connection.updatedAt, null)
  response = () => Response.json(payload([session()]))
  await publication(board, () => board.retry())
  assert.equal(board.connection.status, 'live')
  response = () => { throw new TypeError('Failed to fetch') }
  await env.fire()
  assert.equal(board.connection.status, 'error')
  assert.equal(board.snapshot()[0].id, 'session-live')
  response = () => Response.json(payload())
  await publication(board, () => board.retry())
  assert.equal(board.connection.status, 'live')
  assert.deepEqual(board.snapshot(), [])
  board.stop()
})

test('an in-flight request cannot overlap or publish after hiding or stopping', async () => {
  const responses = []
  const env = environment(() => { const deferred = Promise.withResolvers(); responses.push(deferred); return deferred.promise })
  const board = createBoard(env)
  board.start()
  board.retry()
  board.start()
  assert.equal(env.calls.length, 1)
  assert.equal(env.timers.size, 0)
  env.hidden(true)
  assert.equal(env.calls[0].options.signal.aborted, true)
  responses[0].resolve(Response.json(payload([session()])))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(board.connection.status, 'loading')
  assert.deepEqual(board.snapshot(), [])
  env.hidden(false)
  assert.equal(env.calls.length, 2)
  board.stop()
  responses[1].resolve(Response.json(payload([session()])))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(board.snapshot(), [])
  assert.equal(env.timers.size, 0)
})

test('legacy enforcement fields and blocked gags are ignored while stuck becomes idle', async () => {
  const gate = { stage: 'verify', state: 'failed', message: '旧检查失败', summary: '旧门槛' }
  const check = { command: 'sh bug.sh', expect: 'right' }
  const raw = {
    ...payload([session({ stage: 'verify', status: 'stuck', gate, check,
      gag: { id: 'legacy-block', kind: 'objection', text: '被拦下：旧检查失败', at: 4000 },
      history: [
        { workflow: 'bug-fix', stage: 'fix', at: 2000, kind: 'enter', note: '修复', check },
        { workflow: 'bug-fix', stage: 'verify', at: 3000, kind: 'rejected', note: '旧门槛' },
      ],
    })]),
    workflows: workflows.map(workflow => ({ ...workflow, checkLabel: '旧契约',
      stages: workflow.stages.map(stage => ({ ...stage, registersCheck: true, exit: 'check-holds-here', rollbackTo: [{ stage: 'fix' }] })),
    })),
    handoffs: [{ from: ['bug-fix', 'verify'], label: '旧交接限制' }],
  }
  const before = structuredClone(raw)
  const env = environment(async () => Response.json(raw))
  const board = createBoard(env)
  await publication(board, () => board.start())
  const resident = board.snapshot()[0]
  assert.equal(resident.status, 'idle')
  assert.equal(resident.event, null)
  assert.equal(resident.gate, undefined)
  assert.equal(resident.check, undefined)
  assert.equal(resident.rollbackCount, 0)
  assert.deepEqual(resident.history, [{ workflow: 'bug-fix', stage: 'fix', at: 2000, kind: 'enter', note: '修复' }])
  assert.equal(board.nextStep(resident), '会话暂停了，去 DSH 看看')
  assert.match(board.nextStep({ ...resident, status: 'working', gate }), /对抗审查/u)
  assert.equal(board.nextStep({ ...resident, status: 'finished', gate }), '完工，没有下一步')
  assert.equal(board.HANDOFFS, undefined)
  assert.equal(STATUS.stuck, undefined)
  assert.equal(mapBoard(raw).handoffs, undefined)
  for (const workflow of board.WORKFLOWS) {
    assert.equal(workflow.checkLabel, undefined)
    for (const stage of workflow.stages) {
      assert.equal(stage.exit, undefined)
      assert.equal(stage.registersCheck, undefined)
      assert.equal(stage.rollbackTo, undefined)
    }
  }
  assert.deepEqual(raw, before)
  const objection = { id: 'review-objection', kind: 'objection', text: '审稿人发现边界问题', at: 4000 }
  assert.deepEqual(mapBoard(payload([session({ gag: objection })])).sessions[0].event, objection)
  board.stop()
})

test('eighteen workflows are available without a handoff table and keep switch provenance', async () => {
  const from = { workflow: 'runtime-forensics', stage: 'capture', at: 3000 }
  const raw = payload([
    session({ handoffFrom: from }),
    session({ sessionId: 'analysis', workflow: 'runtime-forensics', stage: 'report' }),
    session({ sessionId: 'feature', workflow: 'feature', stage: 'checkpoint' }),
    session({ sessionId: 'investigation', workflow: 'investigation', stage: 'reply' }),
    session({ sessionId: 'perf-issue', workflow: 'perf-issue', stage: 'baseline' }),
    session({ sessionId: 'trace-forensics', workflow: 'trace-forensics', stage: 'report' }),
    session({ sessionId: 'blast-radius', workflow: 'blast-radius', stage: 'prove' }),
    session({ sessionId: 'refactoring', workflow: 'refactoring', stage: 'move' }),
    session({ sessionId: 'prototype', workflow: 'prototype', stage: 'build' }),
    session({ sessionId: 'hillclimb', workflow: 'hillclimb', stage: 'loop' }),
    session({ sessionId: 'interrogate', workflow: 'interrogate', stage: 'attack' }),
    session({ sessionId: 'multi-phase-plan', workflow: 'multi-phase-plan', stage: 'write' }),
    session({ sessionId: 'eval', workflow: 'eval', stage: 'judge' }),
    session({ sessionId: 'create-verification-skill', workflow: 'create-verification-skill', stage: 'prove' }),
    session({ sessionId: 'maintain-verification-skill', workflow: 'maintain-verification-skill', stage: 'live' }),
    session({ sessionId: 'create-formal-verification-skill', workflow: 'create-formal-verification-skill', stage: 'prove' }),
    session({ sessionId: 'maintain-formal-verification-skill', workflow: 'maintain-formal-verification-skill', stage: 'judge' }),
    session({ sessionId: 'figure-it-out', workflow: 'figure-it-out', stage: 'loop' }),
    session({ sessionId: 'adr', workflow: 'adr', stage: 'decide' }),
  ])
  const mapped = mapBoard(raw)
  assert.deepEqual(mapped.workflows.filter(workflow => workflow.available).map(workflow => workflow.id).sort(), [
    'blast-radius', 'bug-fix', 'create-formal-verification-skill', 'create-verification-skill', 'eval', 'feature', 'figure-it-out', 'hillclimb', 'interrogate', 'investigation',
    'maintain-formal-verification-skill', 'maintain-verification-skill', 'multi-phase-plan', 'perf-issue', 'prototype', 'refactoring', 'runtime-forensics', 'trace-forensics',
  ])
  assert.equal(mapped.residents.length, 18)
  assert.deepEqual(mapped.others.map(session => session.id), ['adr'])
  assert.deepEqual(mapped.residents[0].handoffFrom, from)
  assert.equal(mapped.residents[1].handoffFrom, null)
  const env = environment(async () => Response.json(raw))
  const board = createBoard(env)
  await publication(board, () => board.start())
  assert.equal(board.nextStep({ ...board.snapshot()[1], status: 'finished' }), '完工，没有下一步')
  assert.match(board.nextStep({
    ...mapped.others[0], status: 'needsYou',
    needs: { question: '采纳吗？' },
  }), /等你回答：采纳吗/u)
  board.stop()
})

test('all eighteen workflows have complete stage art and plaque identities remain stable', () => {
  const mapped = mapBoard(payload())
  assert.equal(Object.keys(ART).length, 18)
  for (const workflow of workflows) {
    assert.deepEqual(Object.keys(ART[workflow.id].stages), workflow.stages.map(stage => stage.id))
    assert.ok(mapped.workflows.find(candidate => candidate.id === workflow.id).stages.every(stage => stage.skills.length > 0))
  }
  assert.equal(plaqueForWorkflow('feature'), PLAQUES.feature)
  assert.equal(plaqueForWorkflow('runtime-forensics'), PLAQUES['runtime-forensics'])
  assert.equal(plaqueForWorkflow('bug-fix'), PLAQUES['bug-fix'])
  for (const [id, name, building, stages] of [
    ['investigation', '分析需求', 'construction', ['scope', 'explore', 'explain', 'reply']],
    ['perf-issue', '性能问题', 'clinic', ['baseline', 'hypothesize', 'fix', 'remeasure', 'pr']],
    ['trace-forensics', '分析抓包', 'clinic', ['load', 'transform', 'narrow', 'attribute', 'confirm', 'report']],
    ['blast-radius', '爆炸半径', 'detective', ['read', 'keyfact', 'beyond', 'rate', 'prove', 'report']],
    ['refactoring', '重构', 'construction', ['pin', 'shape', 'subtract', 'move', 'prove', 'worth', 'pr']],
    ['prototype', '出原型', 'construction', ['decide', 'references', 'build', 'observe', 'present']],
    ['hillclimb', '持续调优', 'clinic', ['ground', 'harness', 'loop', 'stop', 'pr']],
    ['interrogate', '代码审查', 'detective', ['frame', 'attack', 'verify', 'report']],
    ['multi-phase-plan', '分期计划', 'construction', ['triage', 'settle', 'explore', 'write', 'review', 'handback']],
    ['eval', 'eval', 'detective', ['frame', 'setup', 'prompt', 'run', 'judge', 'audit', 'synthesize']],
    ['create-verification-skill', '验证工具', 'detective', ['interview', 'generate', 'map', 'prove', 'handoff']],
    ['maintain-verification-skill', '验证巡检', 'detective', ['locate', 'index', 'source', 'reconcile', 'live', 'triage', 'ship']],
    ['create-formal-verification-skill', '形式化验证', 'detective', ['target', 'tool', 'generate', 'prove', 'handoff']],
    ['maintain-formal-verification-skill', '形式化巡检', 'detective', ['locate', 'baseline', 'changes', 'update', 'judge', 'sync', 'report']],
    ['figure-it-out', '想办法', 'construction', ['frame', 'design', 'loop', 'trail', 'verify']],
  ]) {
    const workflow = mapped.workflows.find(workflow => workflow.id === id)
    assert.equal(workflow.available, true)
    assert.equal(workflow.name, name)
    assert.equal(workflow.skill, `pstack-${id}`)
    assert.deepEqual(workflow.stages.map(stage => stage.id), stages)
    assert.deepEqual(Object.keys(ART[id].stages), stages)
    assert.ok(workflow.stages.every(stage => stage.skills.length > 0))
    assert.ok(workflow.theme && workflow.color)
    assert.equal(plaqueForWorkflow(id), PLAQUES[id])
    assert.equal(PLAQUES[id].id, id)
    assert.equal(PLAQUES[id].name, name)
    assert.equal(PLAQUES[id].building, building)
    assert.ok(PROPS[id].length > 0)
    assert.ok(CHARACTERS.outfits[building])
  }
  const explore = mapped.workflows.find(workflow => workflow.id === 'investigation').stages.find(stage => stage.id === 'explore')
  assert.equal(explore.name, '探索')
  assert.equal(explore.optional, undefined)
  const trace = mapped.workflows.find(workflow => workflow.id === 'trace-forensics')
  assert.equal(trace.stages.find(stage => stage.id === 'confirm').optional, true)
  assert.equal(trace.stages.at(-1).handback, '要不要修（转修 bug 或性能问题）')
})

test('older hosts leave the new workflow plaques unavailable and do not invent residents', () => {
  const ids = ['trace-forensics', 'blast-radius', 'refactoring', 'create-verification-skill', 'maintain-verification-skill', 'create-formal-verification-skill', 'maintain-formal-verification-skill']
  const mapped = mapBoard({
    workflows: workflows.filter(workflow => !ids.includes(workflow.id)),
    sessions: [session(), ...ids.map(id => session({ sessionId: id, workflow: id, stage: 'report' }))],
  })
  assert.deepEqual(mapped.residents.map(resident => resident.id), ['session-live'])
  assert.deepEqual(mapped.others.map(resident => resident.id), ids)
  for (const id of ids) {
    const workflow = mapped.workflows.find(candidate => candidate.id === id)
    assert.equal(workflow.available, false)
    assert.equal(workflow.skill, undefined)
    assert.deepEqual(workflow.stages, [])
    assert.equal(plaqueForWorkflow(id), PLAQUES[id])
  }
})

test('stage trail preserves skips, revisits and rollback history across workflow switches', async () => {
  const history = [
    { workflow: 'bug-fix', stage: 'reproduce', at: 1000, kind: 'enter', note: '复现' },
    { workflow: 'bug-fix', stage: 'bisect', at: 2000, kind: 'skip', note: '直接修复' },
    { workflow: 'bug-fix', stage: 'plan-fix', at: 2000, kind: 'skip', note: '直接修复' },
    { workflow: 'bug-fix', stage: 'red', at: 2000, kind: 'skip', note: '直接修复' },
    { workflow: 'bug-fix', stage: 'fix', at: 2000, kind: 'enter', note: '修复' },
    { workflow: 'bug-fix', stage: 'verify', at: 3000, kind: 'enter', note: '验证' },
    { workflow: 'bug-fix', stage: 'bisect', at: 4000, kind: 'rollback', note: '重查根因' },
    { workflow: 'investigation', stage: 'scope', at: 5000, kind: 'handoff', note: '调查' },
    { workflow: 'bug-fix', stage: 'fix', at: 6000, kind: 'handoff', note: '回到修复' },
  ]
  let current = payload([session({ stage: 'fix', skipped: ['plan-fix', 'red'], history, rollbackCount: 1 })])
  const env = environment(async () => Response.json(current))
  const board = createBoard(env)
  await publication(board, () => board.start())
  const states = () => board.workflow('bug-fix').stages.map(stage => [stage.id, board.stageState(board.snapshot()[0], stage.id)])
  assert.deepEqual(states(), [
    ['reproduce', 'done'], ['bisect', 'done'], ['plan-fix', 'skipped'], ['red', 'skipped'],
    ['fix', 'active'], ['verify', 'done'], ['interrogate', 'pending'], ['pr', 'pending'],
  ])
  assert.deepEqual(board.snapshot()[0].history, history)
  assert.equal(board.snapshot()[0].rollbackCount, 1)
  current = payload([session({ stage: 'bisect', skipped: [], history: history.slice(0, 7) })])
  await env.fire()
  assert.equal(board.snapshot()[0].rollbackCount, 1)
  assert.deepEqual(states(), [
    ['reproduce', 'done'], ['bisect', 'active'], ['plan-fix', 'pending'], ['red', 'pending'],
    ['fix', 'done'], ['verify', 'done'], ['interrogate', 'pending'], ['pr', 'pending'],
  ])
  const legacy = mapBoard(payload([session()])).sessions[0]
  assert.deepEqual(legacy.history, [])
  assert.equal(legacy.rollbackCount, 0)
  board.stop()
})
