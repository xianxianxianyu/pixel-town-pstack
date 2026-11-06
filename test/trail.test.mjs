import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { apply } from '../lib/index.js'
import { foldSession } from '../lib/fold.js'
import { auditTrail, capText, committedCalls, emptyTrail, exportTrail, renderTranscript, trailRules, tsvCell } from '../lib/trail.js'
import { stageProtocol, stageResult, workflows } from '../lib/workflows.js'

const root = await mkdtemp(join(tmpdir(), 'pstack-trail-test-'))
after(() => rm(root, { recursive: true, force: true }))
await writeFile(join(root, 'evidence.txt'), 'actual evidence\n')

function harness(services = {}, configRoot = root) {
  const events = [{ type: 'session', id: 'session-trail', createdAt: 1000, cwd: root }]
  let seq = 0
  const append = (type, data) => events.push({ type, data, seq: seq++, time: Date.now() })
  const session = { header: events[0], id: events[0].id, snapshotEvents: () => events.slice(1), append }
  const tools = new Map(), routes = new Map(), commands = new Map()
  const ctx = {
    tools: { register: tool => tools.set(tool.name, tool) }, sessions: { list: () => [session] },
    skills: { registerProvider() {} }, on() {}, get: name => services[name], logger: { warn() {} },
    inject(deps, run) {
      if (deps[0] === 'commands') run({ ...ctx, commands: { register: command => commands.set(command.name, command) } })
      if (deps[0] === 'connection') run({ ...ctx, connection: { fetch: { register: route => routes.set(route.path, route) } } })
    },
  }
  apply(ctx, { root: configRoot })
  const call = (id, name, args = {}, output = 'ok', isError = false) => {
    append('tool/call', { turn: 1, step: 1, callId: id, name, arguments: JSON.stringify(args) })
    append('tool/result', { turn: 1, step: 1, message: { toolCallId: id, isError, content: [{ type: 'text', text: output }] } })
  }
  const execute = async (name, input) => {
    const id = `host-${seq}`
    append('tool/call', { turn: 1, step: 1, callId: id, name, arguments: JSON.stringify(input) })
    try {
      const result = await tools.get(name).execute(input, { agent: { session }, signal: new AbortController().signal })
      append('tool/result', { turn: 1, step: 1, message: { toolCallId: id, isError: false, content: [{ type: 'text', text: result }] } })
      return JSON.parse(name === 'pstack_stage' ? JSON.stringify(result) : result)
    } catch (error) {
      append('tool/result', { turn: 1, step: 1, message: { toolCallId: id, isError: true, content: [{ type: 'text', text: error.message }] } })
      throw error
    }
  }
  return { events, session, tools, routes, commands, append, call, execute,
    board: () => foldSession(events),
    stage: (stage = 'ground', workflow = 'hillclimb') => execute('pstack_stage', { workflow, stage, note: stage }),
  }
}
const input = { decision: '选线性去重', why: '重复扫描是热点', evidence: ['call:proof'], result: 'tests green' }

for (const pointer of ['call:proof', 'file:evidence.txt', 'file:evidence.txt:1', `file:${join(root, 'evidence.txt')}:1`, 'commit:abcdef0', 'url:https://example.com/proof']) {
  test(`pstack_log accepts ${pointer.split(':', 1)[0]} evidence ${pointer}`, async () => {
    const h = harness(); await h.stage(); h.call('proof', 'bash', { command: 'node --test' })
    const { row } = await h.execute('pstack_log', { ...input, evidence: [pointer] })
    assert.equal(row.n, 1); assert.equal(row.workflow, 'hillclimb'); assert.equal(row.stage, 'ground')
    assert.equal(row.evidence[0].ref, pointer.slice(pointer.indexOf(':') + 1))
    assert.equal(h.board().trail.rows.length, 1)
  })
}
for (const [pointer, id] of [
  ['call:last', 'bash-new'], ['call:last:bash', 'bash-new'], ['call:last:read', 'read-proof'],
  ['call:-1', 'bash-new'], ['call:-2', 'read-proof'], ['call:-3', 'bash-old'],
]) {
  test(`pstack_log resolves ${pointer}, stores and echoes the absolute id, and excludes pstack calls`, async () => {
    const h = harness(); await h.stage()
    h.call('bash-old', 'bash', { command: 'baseline' }, 'baseline proof')
    h.call('audit-noise', 'pstack_audit', {}, '{}')
    h.call('read-proof', 'read', { path: 'evidence.txt' }, 'read proof')
    h.call('bash-new', 'bash', { command: 'node --test' }, 'tests passed')
    h.call('log-noise', 'pstack_log', {}, '{}')
    h.append('tool/call', { turn: 1, step: 1, callId: 'pending', name: 'bash', arguments: '{}' })
    const { row } = await h.execute('pstack_log', { ...input, evidence: [pointer] })
    assert.deepEqual(row.evidence, [{ kind: 'call', ref: id }])
    assert.deepEqual(h.board().trail.rows[0].evidence, row.evidence)
    const echoedAgain = await h.execute('pstack_log', { ...input, evidence: [`call:${row.evidence[0].ref}`] })
    assert.deepEqual(echoedAgain.row.evidence, row.evidence)
    const response = await h.routes.get('/api/pixel-town-pstack/evidence').fetch(
      new Request(`https://host/api/pixel-town-pstack/evidence?session=session-trail&call=${id}`))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).name, id === 'read-proof' ? 'read' : 'bash')
  })
}
for (const pointer of ['call:last:unknown', 'call:last:pstack_stage', 'call:last:', 'call:-0', 'call:-2', 'call:-9007199254740992']) {
  test(`unresolvable relative pointer ${pointer} rejects in Chinese without a row`, async () => {
    const h = harness(); await h.stage(); h.call('proof', 'bash')
    await assert.rejects(h.execute('pstack_log', { ...input, evidence: [pointer] }), /无法解析.*没有匹配的已完成/u)
    assert.deepEqual(h.board().trail.rows, [])
  })
}
test('relative pointers reject when there are no committed non-pstack calls', async () => {
  const h = harness(); await h.stage()
  h.append('tool/call', { turn: 1, step: 1, callId: 'pending', name: 'bash', arguments: '{}' })
  for (const pointer of ['call:last', 'call:last:bash', 'call:-1']) {
    await assert.rejects(h.execute('pstack_log', { ...input, evidence: [pointer] }), /无法解析/u)
  }
  assert.deepEqual(h.board().trail.rows, [])
})
test('call:last follows commit order rather than call start order', async () => {
  const h = harness(); await h.stage()
  h.append('tool/call', { turn: 1, step: 1, callId: 'slow', name: 'bash', arguments: '{}' })
  h.call('quick', 'read', {}, 'quick proof')
  h.append('tool/result', { turn: 1, step: 1, message: { toolCallId: 'slow', isError: false, content: [{ type: 'text', text: 'slow proof' }] } })
  const { row } = await h.execute('pstack_log', { ...input, evidence: ['call:last'] })
  assert.deepEqual(row.evidence, [{ kind: 'call', ref: 'slow' }])
})
for (const change of [
  { evidence: ['call:unknown'] }, { evidence: [] }, { evidence: ['file:missing.txt'] },
  { evidence: ['commit:xyz'] }, { evidence: ['url:http://example.com'] }, { evidence: ['because it passed'] },
  { supersedes: 9 }, { supersedes: 0 }, { decision: 'two\nlines' }, { why: '' }, { result: ' ' },
]) {
  test(`pstack_log rejects invalid input without leaving a row: ${JSON.stringify(change)}`, async () => {
    const h = harness(); await h.stage(); h.call('proof', 'bash')
    await assert.rejects(h.execute('pstack_log', { ...input, ...change }))
    assert.deepEqual(h.board().trail.rows, [])
  })
}
test('pstack_log rejects absent workflow and uncommitted calls in Chinese', async () => {
  const h = harness()
  await assert.rejects(h.execute('pstack_log', input), /没有进行中的 pstack 工作流/u)
  assert.equal(h.board().trail, null)
  await h.stage()
  h.append('tool/call', { turn: 1, step: 1, callId: 'pending', name: 'bash', arguments: '{}' })
  await assert.rejects(h.execute('pstack_log', { ...input, evidence: ['call:pending'] }), /不是本会话已完成/u)
})
test('append-only correction preserves old row and marks supersession', async () => {
  const h = harness(); await h.stage(); h.call('proof', 'bash')
  await h.execute('pstack_log', input)
  await h.execute('pstack_log', { ...input, result: 'INCONCLUSIVE', supersedes: 1 })
  assert.equal(h.board().trail.rows[0].result, 'tests green')
  assert.equal(h.board().trail.rows[0].supersededBy, 2)
  assert.deepEqual(auditTrail(h.board(), h.events).map(f => f.kind), ['superseded'])
})
test('old workflow logs remain trail:null; new trail manifests opt in only on new stage output', () => {
  const h = harness()
  h.call('old', 'pstack_stage', { workflow: 'hillclimb', stage: 'ground', note: 'old' }, 'ok')
  assert.equal(h.board().trail, null)
  assert.equal(workflows.find(w => w.id === 'hillclimb').trail, true)
  assert.equal(workflows.find(w => w.id === 'multi-phase-plan').trail, true)
  h.call('new', 'pstack_stage', { workflow: 'hillclimb', stage: 'ground', note: 'new' }, stageResult({ workflow: 'hillclimb', stage: 'ground', note: 'new' }))
  assert.equal(h.board().trail.on, true)
})
test('trail protocol is compact and includes evidence, non-polling review and same-family Attention', () => {
  assert.equal(trailRules.split('\n').length, 7)
  assert.match(trailRules, /命令后立即优先用 call:last:bash/u)
  assert.match(trailRules, /一行.*结束回复；结果会自动送达，不要轮询、列出 agents、调用 wait 或 interrupt_agent/u)
  assert.match(trailRules, /Attention.*复核与干活同一模型家族/u)
  assert.match(stageProtocol('hillclimb'), /pstack_audit.*superseding/su)
  assert.match(stageProtocol('multi-phase-plan'), /Attention.*reviewed by/su)
  assert.doesNotMatch(stageProtocol('bug-fix'), /show-me-your-work/u)
})
test('trail command rejects absent workflow, then steers running agents and follows up idle agents', async () => {
  const h = harness(), messages = []
  const agent = { session: h.session, status: 'running', steer: m => messages.push(['steer', m]), followup: m => messages.push(['followup', m]) }
  const command = h.commands.get('pstack-trail')
  assert.equal((await command.handler({ agent, rawInput: '' })).kind, 'error')
  await h.stage('reproduce', 'bug-fix')
  assert.equal((await command.handler({ agent, rawInput: '记下取舍' })).kind, 'success')
  agent.status = 'idle'
  await command.handler({ agent, rawInput: '' })
  assert.deepEqual(messages.map(([kind]) => kind), ['steer', 'followup'])
  assert.match(messages[0][1].content[0].text, /审查方.*没有换模型/su)
  assert.ok(messages[0][1].content[0].text.includes(trailRules))
  h.append('user/message', messages[0][1])
  assert.equal(h.board().trail.on, true)
})
test('trail opt-in injects the same catalog-lowered reviewer effort as trail skills', async () => {
  const configRoot = await mkdtemp(join(root, 'opt-in-'))
  const route = { provider: 'vendor', model: 'review-model' }
  await writeFile(join(configRoot, 'models.json'), JSON.stringify({ version: 1, roles: {
    worker: [], reviewer: [route], candidate: [], judge: [],
  } }))
  const h = harness({
    subagentModelSelection: { current: () => ({ enabled: true, allowedModels: [route] }) },
    llm: { resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }], defaultEffort: 'high' } }) },
  }, configRoot)
  await h.stage('reproduce', 'bug-fix')
  const messages = []
  await h.commands.get('pstack-trail').handler({
    agent: { session: h.session, status: 'idle', followup: message => messages.push(message) }, rawInput: '',
  })
  assert.match(messages[0].content[0].text, /审查方用 vendor\/review-model（reasoning_effort=medium，比该模型默认低一档）/u)
})

function auditRow(overrides = {}, callOutput = 'ok', isError = false) {
  const h = harness()
  h.call('proof', 'bash', { command: 'node --test' }, callOutput, isError)
  const row = { n: 1, at: Date.now(), workflow: 'hillclimb', stage: 'ground', ...input, evidence: [{ kind: 'call', ref: 'proof' }], ...overrides }
  return auditTrail({ ...h.board(), trail: { ...emptyTrail(), rows: [row] } }, h.events)
}
test('no-evidence catches foreign rows but not populated rows', () => {
  assert.deepEqual(auditRow({ evidence: [] }).map(f => f.kind), ['no-evidence'])
  assert.deepEqual(auditRow(), [])
})
test('foreign committed rows with absent evidence remain auditable rather than disappearing', () => {
  const h = harness()
  h.call('foreign', 'pstack_log', {}, JSON.stringify({ row: {
    n: 1, at: 1001, workflow: 'hillclimb', stage: 'ground', decision: 'done', why: 'old import', result: 'open',
  } }))
  assert.deepEqual(h.board().trail.rows[0].evidence, [])
  assert.deepEqual(auditTrail(h.board(), h.events).map(f => f.kind), ['no-evidence'])
})
for (const output of ['FAIL suite', 'not ok 1', '1 test failed', 'Error: assertion', 'output\n[exit code: 2]']) {
  test(`claim-contradicts catches conservative failure ${output}`, () => {
    assert.deepEqual(auditRow({}, output).map(f => f.kind), ['claim-contradicts'])
    assert.deepEqual(auditRow({ result: 'INCONCLUSIVE' }, output), [])
  })
}
test('claim-contradicts catches isError, but not successful output or negated success', () => {
  assert.equal(auditRow({}, 'denied', true)[0].kind, 'claim-contradicts')
  for (const output of ['all tests passed', '0 failures', '0 failed', '0 tests failed', '# fail 0', 'ℹ fail 0', 'failover enabled', 'output\n[exit code: 0]']) assert.deepEqual(auditRow({}, output), [])
  for (const result of ['not ok', 'not fixed', '未通过', '未成功']) assert.deepEqual(auditRow({ result }, 'FAIL'), [])
})
test('claim-contradicts recognizes each success spelling but not unrelated outcomes', () => {
  for (const result of ['PASS', 'green', '通过', 'ok', 'fixed', '成功']) {
    assert.equal(auditRow({ result }, 'Error: failed')[0].kind, 'claim-contradicts')
  }
  for (const result of ['open', 'reverted', 'INCONCLUSIVE', 'passage surveyed']) {
    assert.deepEqual(auditRow({ result }, 'Error: failed'), [])
  }
})
for (const kind of ['rollback', 'skip', 'handoff']) {
  test(`unlogged-pivot detects ${kind} until a same-stage later row exists`, () => {
    const h = harness(), at = Date.now(), entry = { workflow: 'hillclimb', stage: 'loop', at, kind, note: 'pivot' }
    const row = { n: 1, at, workflow: 'hillclimb', stage: 'loop', ...input, evidence: [{ kind: 'file', ref: 'evidence.txt' }] }
    const board = { ...h.board(), history: [entry], trail: emptyTrail() }
    assert.equal(auditTrail(board, [])[0].kind, 'unlogged-pivot')
    assert.deepEqual(auditTrail({ ...board, trail: { ...emptyTrail(), rows: [row] } }, []), [])
    assert.equal(auditTrail({ ...board, trail: { ...emptyTrail(), rows: [{ ...row, at: at - 1 }] } }, [])[0].kind, 'unlogged-pivot')
  })
}
for (const [name, args] of [['write', {}], ['edit', {}], ['bash', { command: 'git commit -m fix' }], ['bash', { command: 'git revert HEAD' }], ['bash', { command: 'git reset --hard HEAD' }]]) {
  test(`unlogged-change detects ${name} ${args.command ?? ''} and clears with a stage row`, async () => {
    const h = harness(); await h.stage(); h.call('proof', name, args)
    assert.equal(auditTrail(h.board(), h.events)[0].kind, 'unlogged-change')
    await h.execute('pstack_log', input)
    assert.deepEqual(auditTrail(h.board(), h.events), [])
  })
}
test('unlogged-change ignores failed edits and read-only calls', async () => {
  const h = harness(); await h.stage()
  h.call('bad', 'edit', {}, 'denied', true); h.call('read', 'read', {}); h.call('git', 'bash', { command: 'git status --short' })
  h.call('echo', 'bash', { command: 'echo \"git commit -m example\"' })
  h.call('exit', 'bash', { command: 'git revert HEAD' }, '[exit code: 1]')
  assert.deepEqual(auditTrail(h.board(), h.events), [])
})
test('TSV matches upstream cell hygiene and preserves six columns', () => {
  assert.equal(tsvCell('a\tb\nc\rd'), 'a b c d')
  for (const prefix of ['=', '+', '-', '@']) assert.equal(tsvCell(`${prefix}formula`), `'${prefix}formula`)
  assert.equal(tsvCell(' =not-leading'), ' =not-leading')
  const tsv = exportTrail([{ n: 1, at: 0, workflow: 'hillclimb', stage: 'loop', decision: '=x\ty', why: '@z\nq', evidence: [{ kind: 'file', ref: 'a\rb' }], result: '+done', supersedes: 1 }])
  assert.equal(tsv, "ts\tphase\tdecision\twhy\tevidence\tresult\n1970-01-01T00:00:00Z\thillclimb/loop\t'=x y\t'@z q\tfile:a b\t'+done (supersedes #1)\n")
})
test('transcript omits reasoning, includes both message roles and caps arguments/results with head and tail', () => {
  const h = harness()
  h.append('user/message', { content: [{ type: 'text', text: 'user intent' }] })
  h.append('assistant/message', { message: { content: [{ type: 'reasoning', text: 'SECRET REASONING' }, { type: 'text', text: 'assistant conclusion' }] } })
  const output = 'HEAD' + 'x'.repeat(10000) + 'TAIL'
  h.call('huge', 'bash', { command: 'a'.repeat(5000) }, output)
  const transcript = renderTranscript(h.events)
  assert.match(transcript, /user intent/u); assert.match(transcript, /assistant conclusion/u)
  assert.doesNotMatch(transcript, /SECRET REASONING/u)
  assert.match(transcript, /Tool call huge · bash/u); assert.match(transcript, /HEAD.*capped.*TAIL/su)
  assert.equal(capText(output, 4000).length, 4000)
  assert.ok(transcript.length < 7000)
})
test('audit atomically exports real TSV/transcript and records review flags and No flags', async () => {
  const h = harness(); await h.stage(); h.call('proof', 'bash', { command: 'node --test' }, 'actual proof')
  await h.execute('pstack_log', input)
  const audit = await h.execute('pstack_audit', {})
  assert.match(await readFile(audit.tsv, 'utf8'), /call:proof/u)
  assert.match(await readFile(audit.transcript, 'utf8'), /actual proof/u)
  assert.deepEqual(h.board().trail.audit.findings, [])
  assert.equal((await readdir(join(root, 'trails'))).some(name => name.endsWith('.tmp')), false)
  await h.execute('pstack_audit', { review: { model: 'other-family/model', flags: [{ text: 'Weak evidence at row 1\nVerification output is absent.', rows: [1] }] } })
  assert.equal(h.board().trail.review.model, 'other-family/model')
  assert.deepEqual(h.board().trail.review.flags[0].rows, [1])
  assert.equal(h.board().trail.review.flags[0].text, 'Weak evidence at row 1\nVerification output is absent.')
  await h.execute('pstack_audit', { review: { model: 'reviewer/model', flags: [] } })
  assert.deepEqual(h.board().trail.review.flags, [])
  await assert.rejects(h.execute('pstack_audit', { review: { model: 'reviewer', flags: [{ text: 'bad ref', rows: [999] }] } }))
})
test('authenticated evidence route returns capped committed output and 404s for unknown session/call', async () => {
  const h = harness(); h.call('proof', 'bash', { command: 'x'.repeat(5000) }, 'HEAD' + 'z'.repeat(10000) + 'TAIL')
  const route = h.routes.get('/api/pixel-town-pstack/evidence')
  const response = await route.fetch(new Request('https://host/api/pixel-town-pstack/evidence?session=session-trail&call=proof'))
  const data = await response.json()
  assert.equal(data.name, 'bash'); assert.equal(data.isError, false)
  assert.equal(data.args.length, 2000); assert.equal(data.output.length, 6000)
  assert.match(data.output, /^HEAD.*TAIL$/su)
  for (const query of ['session=unknown&call=proof', 'session=session-trail&call=unknown']) assert.equal((await route.fetch(new Request(`https://host/api/pixel-town-pstack/evidence?${query}`))).status, 404)
})
test('call pairing respects model-step identity and inherited session boundaries', () => {
  const h = harness(); h.call('same', 'read', {}, 'first')
  h.append('tool/call', { turn: 1, step: 2, callId: 'same', name: 'write', arguments: '{}' })
  h.append('tool/result', { turn: 1, step: 3, message: { toolCallId: 'same', isError: false, content: [{ type: 'text', text: 'wrong step' }] } })
  assert.equal(committedCalls(h.events).length, 1)
  h.append('session/end-seed', { inherited: true })
  assert.deepEqual(committedCalls(h.events), [])
})
