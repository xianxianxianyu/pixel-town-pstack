import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, request } from 'node:http'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { apply } from '../lib/index.js'
import { foldSession, reduce } from '../lib/fold.js'
import { stageProtocol, workflows } from '../lib/workflows.js'
import { PLAQUES } from '../board/art.js'

const dataRoot = await mkdtemp(join(tmpdir(), 'pstack-test-'))
after(() => rm(dataRoot, { recursive: true, force: true }))

function log() {
  const events = [{ type: 'session', version: 4, id: 'session-test', createdAt: 1000, isSeeded: false }]
  let seq = 0
  return {
    events,
    append(type, data) {
      const event = { type, seq, time: 1001 + seq++, data }
      events.push(event)
      return event
    },
    call(id, name, args) { return this.append('tool/call', { turn: 1, step: 1, callId: id, name, arguments: JSON.stringify(args) }) },
    result(id, isError = false, text = 'ok') {
      return this.append('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: id, content: [{ type: 'text', text }], isError } })
    },
    stage(id, stage, note = stage, isError = false) {
      this.call(id, 'pstack_stage', { workflow: 'bug-fix', stage, note })
      this.result(id, isError)
    },
  }
}

function host({ connection = false, webServer = false, commands = false, spillStore, subagentModelSelection, llm, config = {} } = {}) {
  const journal = log()
  let route, provider, postExecute, command
  const tools = new Map()
  const webRoutes = new Map()
  const routes = new Map()
  const disposers = []
  let sessionReads = 0
  const session = {
    id: 'session-test', header: journal.events[0],
    snapshotEvents: () => journal.events.slice(1),
    append(type, data) { return journal.append(type, data) },
  }
  const ctx = {
    tools: { register(value) { tools.set(value.name, value) } },
    sessions: { list() { sessionReads++; return [session] } },
    skills: { registerProvider(factory) { provider = factory() } },
    get(name) { return { spillStore, subagentModelSelection, llm }[name] },
    logger: { warn() {} },
    on(name, listener, options) {
      assert.equal(name, 'tools/post-execute')
      assert.deepEqual(options, { prepend: true })
      postExecute = listener
    },
    inject(deps, run) {
      if (deps[0] === 'connection') {
        assert.deepEqual(deps, ['connection'])
        if (connection) run({ ...ctx, connection: { fetch: { register(value) {
          routes.set(value.path, value)
          if (value.path === '/api/pixel-town-pstack/board') route = value
        } } } })
      } else if (deps[0] === 'commands') {
        if (commands) run({ ...ctx, commands: { register(value) { command = value } } })
      } else {
        assert.deepEqual(deps, ['webServer'])
        if (webServer) run({ ...ctx, webServer: {
          register(value) {
            assert.equal(webRoutes.has(value.path), false)
            webRoutes.set(value.path, value)
            return () => { webRoutes.delete(value.path) }
          },
        } })
      }
    },
    effect(callback) { disposers.push(callback()) },
  }
  apply(ctx, { root: dataRoot, ...config })
  let calls = 0
  return {
    journal, session, tools, get command() { return command }, get route() { return route }, get provider() { return provider },
    routes,
    get webRoutes() { return [...webRoutes.values()] },
    get sessionReads() { return sessionReads },
    dispose() { for (const dispose of disposers.splice(0).reverse()) dispose() },
    async output(name, args, text, { agent = { session }, decision = { kind: 'accept' }, isError = false, content = [{ type: 'text', text }] } = {}) {
      const id = `output-${++calls}`
      journal.call(id, name, args)
      const result = { isError, content }
      const accepted = await postExecute({ name, arguments: args, callId: id, agent, signal: new AbortController().signal }, result, async () => decision)
      const blocks = accepted.kind === 'block' ? accepted.feedback : accepted.content ?? content
      journal.append('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: id, content: blocks, isError: accepted.kind === 'block' || isError } })
      return accepted
    },
    async pause(input) {
      const id = `pause-${++calls}`
      journal.call(id, 'pstack_pause', input)
      try {
        const result = await tools.get('pstack_pause').execute(input, { signal: new AbortController().signal, agent: { session } })
        journal.result(id, false, result)
        return result
      } catch (error) {
        journal.result(id, true, error.message)
        throw error
      }
    },
    async enter(stage, note = stage, extra = {}) {
      const input = { workflow: 'bug-fix', stage, note, ...extra }
      const id = String(++calls)
      journal.call(id, 'pstack_stage', input)
      const start = journal.events.length
      let text
      try {
        text = await tools.get('pstack_stage').execute(input, { signal: new AbortController().signal, agent: { session } })
      } catch (error) {
        assert.deepEqual(journal.events.slice(start), [], 'rejected stages append nothing')
        journal.result(id, true, error.message)
        throw error
      }
      assert.deepEqual(journal.events.slice(start).map(event => event.type), ['todo/write'], 'accepted stages append exactly one todo/write')
      journal.result(id, false, text)
      return text
    },
  }
}

const pauseInput = {
  waiting_for: '要不要修', reason: 'handback',
  resume: {
    intent: '查清报告变慢的原因，先不修', done: '已定位每次事件重复扫描历史记录',
    state: '停在报告阶段，证据已保留', next: '等用户决定是否修复',
    files: ['report.js:18'], gotchas: '不要把诊断当作修复授权', uncommitted: ['report.js', 'notes/local.txt'],
  },
}

test('pause writes the latest readable copy outside the repo; committed events own paused state', async () => {
  const root = await mkdtemp(join(dataRoot, 'pause-'))
  const repo = await mkdtemp(join(dataRoot, 'repo-'))
  await writeFile(join(repo, 'report.js'), 'uncommitted user code\n')
  const h = host({ config: { root } })
  h.session.header.cwd = repo
  h.journal.append('turn/start', { turn: 1 })
  await h.enter('reproduce')
  const result = await h.pause(pauseInput)
  const path = join(root, 'resume', 'session-test.md')
  assert.equal(result.split('\n')[0], path)
  assert.match(result, /结束回复.*ask_user_question/u)
  const note = await readFile(path, 'utf8')
  for (const value of [...Object.values(pauseInput.resume).flat(), '要不要修', 'handback', 'bug-fix / reproduce']) assert.ok(note.includes(value), value)
  assert.match(note, /不提交、不 stash、不修改代码/u)
  assert.deepEqual(await readdir(repo), ['report.js'])
  assert.equal(await readFile(join(repo, 'report.js'), 'utf8'), 'uncommitted user code\n')
  assert.equal(foldSession(h.journal.events).status, 'working', 'saving alone does not end a turn')
  h.journal.append('turn/end', { reason: { kind: 'completed' } })
  const saved = foldSession(h.journal.events)
  assert.equal(saved.status, 'paused')
  assert.deepEqual(saved.checkpoint, { at: h.journal.events.at(-2).time, waitingFor: '要不要修', reason: 'handback', path })
  assert.equal(saved.interruption, null)
  h.journal.append('turn/start', { turn: 2 })
  assert.equal(foldSession(h.journal.events).status, 'working')
  assert.deepEqual(foldSession(h.journal.events).checkpoint, saved.checkpoint, 'new turns keep checkpoint history')
  await h.pause({ ...pauseInput, reason: 'requested', waiting_for: '明天继续', resume: { ...pauseInput.resume, next: '明天重新打开报告', uncommitted: [] } })
  h.journal.append('turn/end', { reason: { kind: 'completed' } })
  assert.match(await readFile(path, 'utf8'), /明天重新打开报告/u)
  assert.deepEqual(await readdir(join(root, 'resume')), ['session-test.md'], 'atomic writes leave no scratch files')
  await rm(path)
  assert.equal(foldSession(h.journal.events).status, 'paused', 'file is only a readable copy')
  assert.equal(foldSession(h.journal.events).checkpoint.reason, 'requested')
})

test('pending questions outrank pause and interruption until their matching result arrives', async () => {
  const h = host()
  h.journal.append('turn/start', {})
  await h.enter('reproduce')
  await h.pause(pauseInput)
  h.journal.call('question', 'ask_user_question', { questions: [{ question: '修吗？', options: [{ label: '修' }, { label: '不修' }] }] })
  h.journal.append('turn/end', { reason: { kind: 'aborted' } })
  assert.equal(foldSession(h.journal.events).status, 'needsYou')
  assert.equal(foldSession(h.journal.events).interruption, null)
  h.journal.result('question')
  assert.equal(foldSession(h.journal.events).status, 'paused')
  h.journal.append('turn/start', {})
  h.journal.call('question-2', 'ask_user_question', { question: '继续？' })
  h.journal.append('turn/end', { reason: { kind: 'error' } })
  assert.equal(foldSession(h.journal.events).status, 'needsYou')
  h.journal.result('question-2')
  assert.equal(foldSession(h.journal.events).status, 'interrupted')
})

test('every interruption kind needs a checkpoint after this turn start; old saves do not hide it', async () => {
  for (const kind of ['aborted', 'error', 'interrupted', 'blocked', 'max-tokens']) {
    const h = host()
    h.journal.append('turn/start', {})
    await h.enter('reproduce')
    await h.pause(pauseInput)
    h.journal.append('turn/end', { reason: { kind: 'completed' } })
    const prior = foldSession(h.journal.events).checkpoint
    h.journal.append('turn/start', {})
    const end = h.journal.append('turn/end', { reason: { kind } })
    assert.equal(foldSession(h.journal.events).status, 'interrupted', kind)
    assert.deepEqual(foldSession(h.journal.events).interruption, { kind, at: end.time })
    assert.deepEqual(foldSession(h.journal.events).checkpoint, prior)
    await h.pause({ ...pauseInput, reason: 'requested' })
    assert.equal(foldSession(h.journal.events).status, 'paused', `${kind}: save after turn start clears interruption`)
    assert.equal(foldSession(h.journal.events).interruption, null)
    h.journal.append('turn/start', {})
    assert.equal(foldSession(h.journal.events).status, 'working', `${kind}: resume`)
  }
})

test('same-timestamp ordering, rejected pauses and legacy logs preserve checkpoint semantics', () => {
  const journal = log()
  journal.stage('stage', 'reproduce')
  journal.append('turn/start', {})
  journal.call('pause', 'pstack_pause', pauseInput)
  journal.result('pause')
  journal.append('turn/end', { reason: { kind: 'completed' } })
  for (const event of journal.events.slice(1)) event.time = 1001
  assert.equal(foldSession(journal.events).status, 'paused')
  assert.equal(foldSession(journal.events).checkpoint.path, null, 'old successful results need not have a path')
  journal.append('turn/start', {})
  journal.call('rejected', 'pstack_pause', pauseInput)
  journal.result('rejected', true, 'write failed')
  journal.append('turn/end', { reason: { kind: 'error' } })
  assert.equal(foldSession(journal.events).status, 'interrupted')
  assert.equal(foldSession(log().events).checkpoint, null)
  assert.equal(foldSession(log().events).interruption, null)
})

test('pause rejects inactive workflows and malformed inputs before creating a note', async () => {
  const root = await mkdtemp(join(dataRoot, 'rejected-'))
  const h = host({ config: { root } })
  await assert.rejects(h.pause(pauseInput), /没有进行中的/u)
  assert.deepEqual(await readdir(root), [])
  await h.enter('reproduce')
  for (const input of [
    { ...pauseInput, waiting_for: 'two\nlines' }, { ...pauseInput, reason: 'wrong' },
    { ...pauseInput, resume: { ...pauseInput.resume, uncommitted: 'report.js' } },
    { ...pauseInput, resume: { ...pauseInput.resume, next: '' } },
  ]) await assert.rejects(h.pause(input))
  assert.deepEqual(await readdir(root), [])
  assert.equal(foldSession(h.journal.events).checkpoint, null)
  for (const root of [undefined, '', 'relative/path', 1]) assert.throws(() => host({ config: { root } }), /root must be an absolute directory/u)
})

test('optional pause command steers running agents, follows up idle ones, and refuses no-workflow sessions', async () => {
  const h = host({ commands: true })
  assert.equal(h.command.name, 'pstack-pause')
  const delivered = []
  const agent = { session: h.session, status: 'running', steer: message => delivered.push(['steer', message]), followup: message => delivered.push(['followup', message]) }
  assert.equal(h.command.handler({ agent, rawInput: '' }).kind, 'error')
  assert.deepEqual(delivered, [])
  await h.enter('reproduce')
  assert.equal(h.command.handler({ agent, rawInput: '  明天再说  ' }).kind, 'success')
  agent.status = 'idle'
  h.command.handler({ agent, rawInput: '' })
  assert.deepEqual(delivered.map(([method]) => method), ['steer', 'followup'])
  assert.notEqual(delivered[0][1].id, delivered[1][1].id)
  for (const [, message] of delivered) {
    assert.equal(message.role, 'user')
    assert.equal(message.source.kind, 'user')
    assert.ok(Object.isFrozen(message))
    assert.match(message.content[0].text, /安全边界.*interrupt_agent.*不可逆.*不改动代码.*不 commit、不 stash.*git status --short.*pstack_pause.*requested.*结束回复/u)
  }
  assert.match(delivered[0][1].content[0].text, /用户暂停原因：明天再说/u)
  assert.equal(host().command, undefined, 'headless loading needs no commands service')
})

function spillRecorder() {
  const saved = []
  return {
    saved,
    async saveText(input) {
      saved.push(input)
      return { locator: '/spill/full-output.txt', bytes: Buffer.byteLength(input.content), retrievalHint: '用 grep 或 read offset/limit 取需要的部分' }
    },
  }
}

const largeOutput = `HEAD\n${'中间'.repeat(6000)}\nTAIL`

test('output capping belongs only to the calling session with an unfinished workflow', async () => {
  const store = spillRecorder()
  const h = host({ spillStore: store })
  assert.deepEqual(await h.output('bash', { command: 'list-files' }, largeOutput), { kind: 'accept' })
  await h.enter('reproduce', '开始')
  const unrelated = host()
  assert.deepEqual(await h.output('read', { path: 'large.txt' }, largeOutput, { agent: { session: unrelated.session } }), { kind: 'accept' })
  const capped = await h.output('bash', { command: 'list-files' }, largeOutput)
  const preview = capped.content[0].text
  assert.ok(preview.startsWith('HEAD\n'))
  assert.match(preview, /TAIL\n（输出/u)
  assert.ok(preview.length <= 9000)
  assert.match(preview, /完整内容在 \/spill\/full-output.txt，用 grep 或 read offset\/limit/u)
  assert.equal(store.saved.length, 1)
  assert.equal(store.saved[0].content, largeOutput)
  assert.deepEqual(store.saved[0].owner, { sessionId: 'session-test' })
  assert.equal(store.saved[0].source.toolName, 'bash')
  assert.equal(store.saved[0].source.kind, 'tool')

  const finished = host({ spillStore: store })
  await finished.enter('pr', '工作完成')
  finished.journal.append('turn/end', {})
  assert.equal(foldSession(finished.journal.events).status, 'finished')
  assert.deepEqual(await finished.output('read', { path: 'large.txt' }, largeOutput), { kind: 'accept' })
  assert.equal(store.saved.length, 1)
})

test('legacy check commands have no output-cap exemption', async () => {
  const store = spillRecorder()
  const h = host({ spillStore: store })
  await h.enter('verify', '旧参数不登记检查', { check: { command: 'sh bug.sh', expect: 'right' } })
  const output = `${'x'.repeat(12000)}right${'y'.repeat(12000)}`
  const result = await h.output('bash', { command: 'cd /tmp && sh   bug.sh ; echo done' }, output)
  assert.ok(result.content[0].text.length <= 9000)
  assert.match(result.content[0].text, /完整内容在 \/spill\/full-output.txt/u)
  assert.equal(store.saved.length, 1)
  assert.equal(store.saved[0].content, output)
  await h.enter('pr', '只上报进度，不解析命令结果')
  assert.equal(foldSession(h.journal.events).stage, 'pr')
})

test('read recovery points to offset/limit on the original file rather than re-reading the spill', async () => {
  const store = spillRecorder()
  const h = host({ spillStore: store })
  await h.enter('reproduce')
  const result = await h.output('read', { path: '/source/large.ts' }, largeOutput)
  assert.match(result.content[0].text, /对原文件用 read 的 offset\/limit.*不要读取此溢出路径/u)
  assert.equal(store.saved[0].content, largeOutput)
})

test('all text tool names are bounded, including kb_read, grep, glob and unknown tools', async () => {
  const store = spillRecorder()
  const h = host({ spillStore: store })
  await h.enter('reproduce')
  for (const name of ['kb_read', 'grep', 'glob', 'custom_text_tool']) {
    const result = await h.output(name, {}, largeOutput)
    assert.ok(result.content[0].text.length <= 9000, name)
  }
  assert.equal(store.saved.length, 4)
})

test('without spill storage or with zero cap, output passes through', async () => {
  const store = spillRecorder()
  for (const options of [{}, { spillStore: store, config: { outputCapTokens: 0 } }]) {
    const h = host(options)
    await h.enter('reproduce')
    assert.deepEqual(await h.output('read', {}, largeOutput), { kind: 'accept' })
  }
  assert.equal(store.saved.length, 0)
})

test('pstack_stage stays untouched while existing spill previews shrink without another save', async () => {
  const store = spillRecorder()
  const h = host({ spillStore: store })
  await h.enter('reproduce')
  assert.deepEqual(await h.output('pstack_stage', { workflow: 'bug-fix', stage: 'reproduce', note: 'same stage' }, largeOutput), { kind: 'accept' })
  for (const omission of ['Omitted 40000 bytes.', 'Omitted 40000 bytes. Omitted 2 images.', 'More bytes were omitted.']) {
    const notice = `(${omission} Full formatted result stored at: /spill/existing.txt. Use read with offset/limit, or grep this path to search within it.)`
    const text = `${largeOutput}\n\n${notice}`
    const preview = (await h.output('bash', { command: 'list' }, text)).content[0].text
    assert.ok(preview.length <= 9000)
    assert.ok(preview.startsWith('HEAD\n'))
    assert.ok(preview.endsWith(notice))
    assert.equal(preview.split(notice).length, 2)
    assert.match(preview, /TAIL\n/u)
    const tighter = host({ spillStore: store, config: { outputCapTokens: 1000 } })
    await tighter.enter('reproduce')
    const shrunkAgain = (await tighter.output('bash', {}, preview)).content[0].text
    assert.ok(shrunkAgain.length <= 3000)
    assert.ok(shrunkAgain.endsWith(notice))
  }
  assert.equal(store.saved.length, 0)
})

test('existing recovery remains usable without a backend, but an oversized locator is not cut', async () => {
  const notice = '(Omitted 40000 bytes. Full formatted result stored at: /spill/existing.txt. Use read with offset/limit.)'
  const text = `${largeOutput}\n\n${notice}`
  const h = host()
  await h.enter('reproduce')
  const preview = (await h.output('bash', {}, text)).content[0].text
  assert.ok(preview.length <= 9000)
  assert.ok(preview.endsWith(notice))
  const tinyStore = spillRecorder()
  const tiny = host({ spillStore: tinyStore, config: { outputCapTokens: 1 } })
  await tiny.enter('reproduce')
  assert.deepEqual(await tiny.output('bash', {}, text), { kind: 'accept' })
  assert.equal(tinyStore.saved.length, 0)
})

test('post-execute respects downstream blocking, values, replacement content and extra contexts', async () => {
  const store = spillRecorder()
  const h = host({ spillStore: store })
  await h.enter('reproduce')
  for (const decision of [
    { kind: 'block', feedback: [{ type: 'text', text: largeOutput }] },
    { kind: 'accept', value: 'canonical value' },
    { kind: 'accept', content: [{ type: 'text', text: 'small replacement' }] },
  ]) {
    assert.equal(await h.output('read', {}, largeOutput, { decision }), decision)
  }
  const additionalContexts = [{ role: 'user', content: [{ type: 'text', text: 'context' }] }]
  const decision = { kind: 'accept', additionalContexts, content: [{ type: 'text', text: largeOutput }] }
  const result = await h.output('read', {}, 'small original', { decision })
  assert.equal(result.additionalContexts, additionalContexts)
  assert.equal(store.saved[0].content, largeOutput)
})

test('non-text blocks, failed storage and tiny unrecoverable budgets preserve output', async () => {
  const store = spillRecorder()
  const h = host({ spillStore: store })
  await h.enter('reproduce')
  const mixed = [{ type: 'text', text: largeOutput }, { type: 'image', attachment: { id: 'image' } }]
  assert.deepEqual(await h.output('read', {}, largeOutput, { content: mixed }), { kind: 'accept' })
  assert.equal(store.saved.length, 0)
  const failed = host({ spillStore: { async saveText() { throw new Error('disk full') } } })
  await failed.enter('reproduce')
  assert.deepEqual(await failed.output('bash', {}, largeOutput), { kind: 'accept' })
  const tiny = host({ spillStore: store, config: { outputCapTokens: 1 } })
  await tiny.enter('reproduce')
  assert.deepEqual(await tiny.output('read', {}, largeOutput), { kind: 'accept' })
})

test('output cap validates configuration and rounds character estimates conservatively', async () => {
  for (const value of [-1, 1.5, NaN, Infinity, '3000', null, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => host({ config: { outputCapTokens: value } }), /outputCapTokens/u)
  }
  const store = spillRecorder()
  const h = host({ spillStore: store, config: { outputCapTokens: 100 } })
  await h.enter('reproduce')
  assert.deepEqual(await h.output('grep', {}, '界'.repeat(300)), { kind: 'accept' })
  assert.ok((await h.output('grep', {}, '界'.repeat(301))).content[0].text.length <= 300)
  const emoji = (await h.output('grep', {}, '😀'.repeat(1000))).content[0].text
  assert.equal(emoji.isWellFormed(), true)
})

async function townServer(t, h) {
  // Dispatch directly to the captured handler, preserving raw traversal paths
  // that URL-based clients or routers would otherwise normalize before it.
  const server = createServer((req, res) => {
    const route = h.webRoutes[0]
    if (!route) {
      res.writeHead(404)
      res.end()
      return
    }
    Promise.resolve(route.handler(req, res)).catch(error => res.destroy(error))
  })
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  return (path, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('error', reject)
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('reports can start anywhere, skip required stages, update notes and roll back', async () => {
  const h = host()
  await h.enter('fix', '直接进入修复')
  let state = foldSession(h.journal.events)
  assert.equal(state.stage, 'fix')
  assert.equal(state.stageIndex, 5)
  assert.deepEqual(state.skipped, ['reproduce', 'bisect', 'plan-fix', 'red'])
  const at = state.stageEnteredAt
  await h.enter('fix', '补充修复进度')
  state = foldSession(h.journal.events)
  assert.equal(state.stageEnteredAt, at)
  assert.equal(state.detail, '补充修复进度')
  assert.equal(state.history.at(-1).kind, 'note')
  await h.enter('reproduce', '返回最初现场')
  state = foldSession(h.journal.events)
  assert.equal(state.history.at(-1).kind, 'rollback')
  assert.equal(state.history.filter(entry => entry.kind === 'rollback').length, 1)
  assert.deepEqual(state.skipped, [])
  await h.enter('pr', '汇总已有工作')
  h.journal.append('turn/end', { turn: 1 })
  state = foldSession(h.journal.events)
  assert.equal(state.stage, 'pr')
  assert.deepEqual(state.skipped, ['bisect', 'plan-fix', 'red', 'verify', 'interrogate'])
  assert.equal(state.status, 'finished')
})

test('every manifest stage accepts a first report and reverse-order reports', async () => {
  for (const workflow of workflows) {
    const h = host()
    for (const stage of workflow.stages.toReversed()) {
      await host().enter(stage.id, '从当前工作开始', { workflow: workflow.id })
      await h.enter(stage.id, '按实际进度回报', { workflow: workflow.id })
      const board = foldSession(h.journal.events)
      assert.equal(board.workflow, workflow.id)
      assert.equal(board.stage, stage.id)
    }
  }
})

test('each workflow publishes its manifest headings and initial task status', async () => {
  for (const workflow of workflows) {
    const h = host()
    await h.enter(workflow.stages[0].id, '开始工作流', { workflow: workflow.id })
    const todos = workflow.stages.map((stage, index) => ({
      content: `${index + 1}. ${stage.name} (${stage.id})`,
      status: index === 0 ? 'in_progress' : 'pending',
    }))
    assert.deepEqual(h.journal.events.filter(event => event.type === 'todo/write').map(event => event.data), [{ todos }])
    assert.deepEqual(foldSession(h.journal.events).todos, todos)
  }
})

test('todos distinguish current, visited, skipped and unvisited stages across rollbacks', async () => {
  const h = host()
  const headings = [
    '1. 复现 (reproduce)', '2. 二分定位 (bisect)', '3. 设计修复 (plan-fix)', '4. 红灯测试 (red)',
    '5. 修复 (fix)', '6. 同界面验证 (verify)', '7. 对抗审查 (interrogate)', '8. 开 PR/MR (pr)',
  ]
  const assertTodos = (statuses, skipped = []) => {
    const todos = headings.map((content, index) => ({
      content: content + (skipped.includes(index) ? '（跳过）' : ''), status: statuses[index],
    }))
    assert.deepEqual(h.journal.events.filter(event => event.type === 'todo/write').at(-1).data, { todos })
    assert.deepEqual(foldSession(h.journal.events).todos, todos)
  }
  await h.enter('fix')
  assertTodos(['completed', 'completed', 'completed', 'completed', 'in_progress', 'pending', 'pending', 'pending'], [0, 1, 2, 3])
  await h.enter('bisect', '回退但保留做过的修复')
  assertTodos(['completed', 'in_progress', 'pending', 'pending', 'completed', 'pending', 'pending', 'pending'], [0])
  await h.enter('bisect', '补充定位说明')
  assertTodos(['completed', 'in_progress', 'pending', 'pending', 'completed', 'pending', 'pending', 'pending'], [0])
  await h.enter('pr', '直接汇总')
  assertTodos(['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'in_progress'], [0, 2, 3, 5, 6])
  await h.enter('red', '进入此前跳过的阶段')
  assertTodos(['completed', 'completed', 'completed', 'in_progress', 'completed', 'pending', 'pending', 'completed'], [0, 2])
  await h.enter('plan-fix')
  assertTodos(['completed', 'completed', 'in_progress', 'completed', 'completed', 'pending', 'pending', 'completed'], [0])
  await h.enter('reproduce')
  assertTodos(['in_progress', 'completed', 'completed', 'completed', 'completed', 'pending', 'pending', 'completed'])
})

test('todo publication does not commit a stage before its successful tool result', async () => {
  const h = host()
  await h.enter('reproduce')
  await h.enter('bisect')
  const beforeResult = h.journal.events.slice(0, -1)
  assert.equal(beforeResult.at(-1).type, 'todo/write')
  const pending = foldSession(beforeResult)
  assert.equal(pending.stage, 'reproduce')
  assert.equal(pending.source, 'reported')
  assert.equal(pending.todos[1].status, 'in_progress')
  assert.equal(pending.history.at(-1).stage, 'reproduce')
  const committed = foldSession(h.journal.events)
  assert.equal(committed.stage, 'bisect')
  assert.equal(committed.history.at(-1).stage, 'bisect')
})

test('invalid inputs leave the published task list untouched', async () => {
  const h = host()
  await h.enter('fix')
  const writes = h.journal.events.filter(event => event.type === 'todo/write')
  const todos = foldSession(h.journal.events).todos
  await assert.rejects(h.enter('reproduce', ''), /note/u)
  await assert.rejects(h.enter('missing-stage'), /不属于 bug-fix/u)
  await assert.rejects(h.enter('intake', '未知工作流', { workflow: 'missing-workflow' }), /未知工作流/u)
  assert.deepEqual(h.journal.events.filter(event => event.type === 'todo/write'), writes)
  assert.deepEqual(foldSession(h.journal.events).todos, todos)
})

test('live stage calls reject legacy workflow ids and name their replacements', async () => {
  const h = host()
  for (const [oldId, newId, stage] of [['requirement', 'feature', 'restate'], ['bug-analysis', 'runtime-forensics', 'intake']]) {
    assert.equal(h.tools.get('pstack_stage').parameters.properties.workflow.enum.includes(oldId), false)
    assert.ok(h.tools.get('pstack_stage').parameters.properties.workflow.enum.includes(newId))
    await assert.rejects(h.enter(stage, '旧名称', { workflow: oldId }), new RegExp(`已更名为 ${newId}`))
  }
  assert.equal(foldSession(h.journal.events).workflow, undefined)
  assert.deepEqual(h.journal.events.filter(event => event.type === 'todo/write'), [])
})

test('unknown workflow, foreign stage, and missing or multiline notes fail at the tool boundary', async () => {
  const h = host()
  await assert.rejects(h.enter('reproduce', 'note', { workflow: 'no-such-workflow' }), /未知工作流/u)
  await assert.rejects(h.enter('archaeology', 'retired workflow', { workflow: 'adr' }), /未知工作流 adr/u)
  await assert.rejects(h.enter('capture'), /不属于 bug-fix/u)
  await assert.rejects(h.enter('reproduce', ''), /note/u)
  await assert.rejects(h.enter('reproduce', 'one\ntwo'), /一行/u)
  await assert.rejects(h.enter('reproduce', 'note', { note: undefined }), /note/u)
  assert.equal(foldSession(h.journal.events).stage, undefined)
})

test('stage calls only take effect after their own successful committed result', () => {
  const l = log()
  l.call('stage-1', 'pstack_stage', { workflow: 'bug-fix', stage: 'reproduce', note: '真实复现' })
  assert.equal(foldSession(l.events).stage, undefined)
  l.call('other', 'bash', { command: 'true' })
  l.result('other')
  assert.equal(foldSession(l.events).stage, undefined)
  l.result('stage-1')
  l.stage('stage-2', 'fix', '工具结果被拒绝', true)
  const state = foldSession(l.events)
  assert.equal(state.stage, 'reproduce')
  assert.equal(state.detail, '真实复现')
  assert.equal(state.history.at(-1).stage, 'fix')
  assert.equal(state.history.at(-1).kind, 'rejected')
})

test('todo inference selects the best in-progress match without overriding reported stage', () => {
  const l = log()
  l.append('todo/write', { todos: [
    { content: '复现', status: 'completed' },
    { content: '设计修复：定最小改动', status: 'in_progress' },
    { content: '修复', status: 'pending' },
  ] })
  let state = foldSession(l.events)
  assert.equal(state.todoStage, 'plan-fix')
  assert.equal(state.source, 'todo')
  assert.equal(state.todos.length, 3)
  l.stage('first', 'reproduce')
  state = foldSession(l.events)
  assert.equal(state.stage, 'reproduce')
  assert.equal(state.todoStage, 'plan-fix')
  assert.equal(state.source, 'reported')
  l.append('todo/write', { todos: [{ content: '每轮切掉最多的问题空间，用证据排除候选', status: 'in_progress' }] })
  assert.equal(foldSession(l.events).todoStage, 'bisect')
  l.append('todo/write', { todos: [{ content: '预约晚餐', status: 'in_progress' }] })
  assert.equal(foldSession(l.events).todoStage, null)
})

test('skill tool and user slash messages, fallback detail, and unique subagent count', () => {
  const l = log()
  l.call('bash', 'bash', { command: 'git status', description: '检查工作区' })
  assert.equal(foldSession(l.events).detail, '检查工作区')
  l.call('skill', 'skill', { name: 'pstack-bug-fix' })
  assert.equal(foldSession(l.events).skill, 'pstack-bug-fix')
  l.append('user/message', { content: [{ type: 'text', text: '/architect 修复设计' }], source: { kind: 'user' } })
  l.append('subagent/catalog', { childId: 'child-a', version: 0, mode: 'one-shot' })
  l.append('subagent/catalog', { childId: 'child-a', version: 0, mode: 'one-shot' })
  l.append('subagent/catalog', { childId: 'child-b', version: 0, mode: 'one-shot' })
  const state = foldSession(l.events)
  assert.equal(state.skill, 'architect')
  assert.equal(state.subagentCount, 2)
})

test('working, human waits, tool errors and idle status stay observational', () => {
  const l = log()
  l.append('turn/start', { turn: 1 })
  assert.equal(foldSession(l.events).status, 'working')
  l.call('question', 'ask_user_question', { question: '继续吗？' })
  l.append('approval/asked', { id: 'approval-a', toolName: 'bash' })
  l.append('approval/asked', { id: 'approval-b', toolName: 'bash' })
  assert.equal(foldSession(l.events).status, 'needsYou')
  l.result('question')
  l.append('approval/decided', { id: 'approval-a', outcome: 'allowed-once' })
  assert.equal(foldSession(l.events).status, 'needsYou')
  l.append('approval/decided', { id: 'approval-b', outcome: 'rejected' })
  assert.equal(foldSession(l.events).status, 'working')
  for (let index = 0; index < 3; index++) {
    l.call(`error-${index}`, 'bash', { command: 'false' })
    l.result(`error-${index}`, true)
  }
  assert.equal(foldSession(l.events).status, 'working')
  l.call('success', 'bash', { command: 'true' })
  l.result('success')
  assert.equal(foldSession(l.events).status, 'working')
  l.append('turn/end', { turn: 1 })
  assert.equal(foldSession(l.events).status, 'idle')
})

test('pure deterministic fold, incremental equivalence, and last twenty notable events', () => {
  const l = log()
  l.stage('first', 'reproduce')
  for (let index = 0; index < 25; index++) {
    l.call(`tool-${index}`, 'bash', { command: `echo ${index}` })
    l.result(`tool-${index}`)
  }
  const original = structuredClone(l.events)
  const first = foldSession(l.events)
  const second = foldSession(l.events)
  assert.deepEqual(first, second)
  assert.deepEqual(l.events, original)
  const incremental = l.events.reduce(reduce, undefined)
  assert.deepEqual(incremental.board, first)
  assert.equal(first.events.length, 20)
  assert.equal(first.lastEventAt, l.events.at(-1).time)
})

test('headless works without optional services; authenticated board returns the canonical manifest and current sessions', async () => {
  const headless = host()
  assert.equal(headless.route, undefined)
  assert.deepEqual(headless.webRoutes, [])
  await headless.enter('reproduce')
  const h = host({ connection: true })
  assert.equal(h.route.path, '/api/pixel-town-pstack/board')
  assert.deepEqual(h.route.methods, ['GET'])
  assert.equal(h.route.requestBody, 'buffered')
  assert.deepEqual(h.webRoutes, [])
  await h.enter('reproduce')
  await h.enter('bisect')
  const response = await h.route.fetch(new Request('http://localhost/api/pixel-town-pstack/board'))
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.deepEqual(Object.keys(payload).sort(), ['deliverySkill', 'legacyWorkflowIds', 'sessions', 'workflows'])
  assert.equal(payload.deliverySkill, 'pstack-opening-a-pr')
  assert.deepEqual(payload.legacyWorkflowIds, { requirement: 'feature', 'bug-analysis': 'runtime-forensics' })
  assert.deepEqual(payload.workflows, workflows)
  const { sessions } = payload
  assert.equal(sessions[0].sessionId, 'session-test')
  assert.equal(sessions[0].stage, 'bisect')
  assert.equal(sessions[0].stageIndex, 2)
  assert.equal(sessions[0].stageCount, 8)
  assert.equal(h.sessionReads, 1)
  await h.enter('red')
  const refreshed = await h.route.fetch(new Request('http://localhost/api/pixel-town-pstack/board'))
  assert.equal((await refreshed.json()).sessions[0].stage, 'red')
})

test('every plaque has a short plain Chinese summary with explicit handback boundaries', () => {
  assert.deepEqual(Object.keys(PLAQUES), [
    'investigation', 'prototype', 'multi-phase-plan', 'feature', 'refactoring',
    'interrogate', 'blast-radius', 'eval', 'create-verification-skill', 'maintain-verification-skill',
    'runtime-forensics', 'trace-forensics', 'bug-fix', 'perf-issue', 'hillclimb',
  ])
  for (const { id, summary } of Object.values(PLAQUES)) {
    assert.equal(typeof summary, 'string', `${id}: summary is required`)
    assert.match(summary, /\p{Script=Han}/u, `${id}: explain the work in Chinese`)
    assert.doesNotMatch(summary, /[<>\r\n`#*]/u, `${id}: summary is plain prose`)
    const sentences = summary.match(/[^。！？]+[。！？]/gu) ?? []
    assert.ok(sentences.length >= 2 && sentences.length <= 3, `${id}: use two or three sentences`)
    assert.equal(sentences.join(''), summary, `${id}: finish each sentence`)
  }
  assert.match(PLAQUES.feature.summary, /只有[^。]*要求设计检查点[^。]*才[^。]*停在设计阶段/u)
  assert.match(PLAQUES['bug-fix'].summary, /只有[^。]*无法到达出问题的界面[^。]*才[^。]*请你[^。]*复现/u)
  assert.match(PLAQUES['runtime-forensics'].summary, /诊断报告[^。]*问你[^。]*修复[。？]$/u)
  assert.match(PLAQUES['maintain-verification-skill'].summary, /应用真坏了就带证据报告，不改产品代码/u)
})

test('public town serves only packaged shell bytes with MIME and HEAD support, without a connection', async t => {
  const h = host({ webServer: true })
  assert.equal(h.route, undefined)
  assert.equal(h.webRoutes.length, 1)
  assert.equal(h.webRoutes[0].kind, 'prefix')
  assert.equal(h.webRoutes[0].path, '/api/pixel-town-pstack/town')
  await h.enter('reproduce', 'private session note must not enter the public shell')
  const get = await townServer(t, h)
  const assets = [
    ['index.html', 'text/html; charset=utf-8'],
    ['town.css', 'text/css; charset=utf-8'],
    ['town.js', 'text/javascript; charset=utf-8'],
    ['art.js', 'text/javascript; charset=utf-8'],
    ['live-data.js', 'text/javascript; charset=utf-8'],
    ['navigation.js', 'text/javascript; charset=utf-8'],
  ]
  for (const [filename, mime] of assets) {
    const expected = await readFile(new URL(`../board/${filename}`, import.meta.url))
    const path = `/api/pixel-town-pstack/town/${filename}`
    const response = await get(path)
    assert.equal(response.status, 200, path)
    assert.equal(response.headers['content-type'], mime, path)
    assert.equal(Number(response.headers['content-length']), expected.length, path)
    assert.deepEqual(response.body, expected, path)
    const head = await get(path, 'HEAD')
    assert.equal(head.status, 200, path)
    assert.equal(head.headers['content-type'], mime, path)
    assert.equal(Number(head.headers['content-length']), expected.length, path)
    assert.equal(head.body.length, 0, path)
  }
  const index = await readFile(new URL('../board/index.html', import.meta.url))
  const html = index.toString()
  assert.doesNotMatch(html, /<header\b|<footer\b|class="panel-top"/)
  assert.match(html, /id="map-mailbox"[^>]*aria-label="收件箱：/)
  assert.match(html, /id="map-notice"[^>]*aria-label="告示牌：/)
  assert.match(html, /id="notice-stats"/)
  assert.match(html, /id="connection-banner"[^>]*role="alert"/)
  const stageStart = html.indexOf('id="town-stage"')
  assert(stageStart >= 0)
  for (const id of ['connection-banner', 'town-ground', 'town-sprites', 'map-notice', 'map-mailbox', 'town', 'save-points', 'town-tint', 'town-glow', 'empty-state']) {
    assert(html.indexOf(`id="${id}"`, stageStart) > stageStart, `${id} belongs to the fixed map stage`)
  }
  assert(html.indexOf('id="town-popover"') > html.indexOf('</main>'), 'panels remain unscaled viewport overlays')
  assert.match(html, /id="town-glow"[^>]*><\/canvas>\s*<p id="empty-state"[\s\S]*?<\/p>\s*<\/div>\s*<\/div>\s*<\/section>/)
  assert.doesNotMatch(html, /id="town-count"|id="notice-count"|id="connection-label"/)
  const root = await get('/api/pixel-town-pstack/town/?cache=1')
  assert.equal(root.status, 200)
  assert.deepEqual(root.body, index)
  assert.equal(h.sessionReads, 0)
})

test('town redirects its bare prefix, rejects other methods, and disposes its independent route', async t => {
  const h = host({ connection: true, webServer: true })
  const get = await townServer(t, h)
  for (const method of ['GET', 'HEAD']) {
    const redirect = await get('/api/pixel-town-pstack/town', method)
    assert.equal(redirect.status, 308)
    assert.equal(redirect.headers.location, '/api/pixel-town-pstack/town/')
    assert.equal(redirect.body.length, 0)
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    for (const path of ['/api/pixel-town-pstack/town', '/api/pixel-town-pstack/town/town.js']) {
      const response = await get(path, method)
      assert.equal(response.status, 405, `${method} ${path}`)
      assert.equal(response.headers.allow, 'GET, HEAD')
      assert.equal(response.body.length, 0)
    }
  }
  assert.equal(h.route.path, '/api/pixel-town-pstack/board')
  h.dispose()
  assert.deepEqual(h.webRoutes, [])
  assert.equal((await get('/api/pixel-town-pstack/town/')).status, 404)
  h.dispose()
})

test('town rejects missing, non-public, inherited, and traversal paths without reading sessions', async t => {
  const h = host({ webServer: true })
  const get = await townServer(t, h)
  const rejected = [
    'missing.js', 'mock-data.js', 'package.json', 'board', 'src/host/index.ts', 'live-data.js.map',
    'constructor', 'toString', '__proto__',
    '../package.json', './index.html', 'sub/../index.html',
    '%2e%2e/package.json', '%2E/index.html', '%2findex.html', '%5cindex.html',
    'town.js%2f..%2findex.html', '..\\index.html', '/index.html',
    '%252e%252e%252fpackage.json', '%69ndex.html', '%', 'index.html%00', 'index.html/',
  ].map(path => `/api/pixel-town-pstack/town/${path}`)
  rejected.push('/api/pixel-town-pstack/town\\index.html', '/api/pixel-town-pstack/board', '/api/pixel-town-pstack/townish/index.html')
  for (const path of rejected) {
    for (const method of ['GET', 'HEAD']) {
      const response = await get(path, method)
      assert.equal(response.status, 404, `${method} ${path}`)
      assert.equal(response.body.length, 0, path)
    }
  }
  assert.equal(h.sessionReads, 0)
})

test('the published package declares its public release contract and includes the live board assets', async () => {
  const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(metadata.name, 'dsh-pixel-town-pstack')
  assert.equal(metadata.version, '0.1.0')
  assert.equal(metadata.license, 'AGPL-3.0-or-later')
  assert.equal(metadata.author, 'xianxianxianyu')
  assert.deepEqual(metadata.repository, {
    type: 'git',
    url: 'git+https://github.com/xianxianxianyu/pixel-town-pstack.git',
  })
  assert.equal(metadata.homepage, 'https://github.com/xianxianxianyu/pixel-town-pstack#readme')
  assert.equal(metadata.bugs.url, 'https://github.com/xianxianxianyu/pixel-town-pstack/issues')
  assert.deepEqual(metadata.engines, { node: '>=22.13.0', dsh: '>=0.2.1-rc.5 <0.3.0' })
  for (const keyword of ['dsh', 'pixel-town', 'pstack']) assert.ok(metadata.keywords.includes(keyword))
  assert.ok(metadata.files.includes('board'))
  assert.ok(metadata.files.includes('THIRD_PARTY_NOTICES.md'))
})

test('provider exposes the actual packaged skill with its directory resources', async () => {
  const h = host()
  assert.equal(h.provider.name, 'pixel-town-pstack')
  const candidates = await h.provider.list({})
  const candidate = candidates.find(candidate => candidate.name === 'pstack-bug-fix')
  assert.ok(candidate)
  assert.equal(candidate.provider, 'pixel-town-pstack')
  assert.equal(candidate.resourceBase.kind, 'directory')
  assert.equal(candidate.resourceBase.path, fileURLToPath(new URL('../skills/pstack-bug-fix', import.meta.url)))
  const skill = await h.provider.get(candidate, {})
  assert.match(skill.content, /pstack_stage/u)
  assert.ok(skill.description)
})

test('stage schema exposes only progress fields and ignores legacy check payloads', async () => {
  const h = host()
  const schema = h.tools.get('pstack_stage').parameters
  assert.deepEqual(Object.keys(schema.properties).sort(), ['note', 'stage', 'workflow'])
  assert.deepEqual(schema.required, ['workflow', 'stage', 'note'])
  assert.equal(schema.additionalProperties, false)
  for (const check of [null, {}, 'old contract', { command: 'sh\nbug.sh', expect: '' }]) {
    await h.enter('verify', '旧字段无效但进度有效', { check })
    const board = foldSession(h.journal.events)
    assert.equal(board.stage, 'verify')
    assert.equal(Object.hasOwn(board, 'check'), false)
    assert.equal(Object.hasOwn(board, 'gate'), false)
    assert.equal(Object.hasOwn(board.history.at(-1), 'check'), false)
  }
  h.journal.call('failed-test', 'bash', { command: 'sh bug.sh' })
  h.journal.result('failed-test', true, 'still broken')
  await h.enter('pr', '工具失败不构成阶段门槛')
  assert.equal(foldSession(h.journal.events).stage, 'pr')
})

test('legacy accepted reports replay and continue without registering checks', async () => {
  const h = host()
  h.journal.call('legacy', 'pstack_stage', {
    workflow: 'bug-fix', stage: 'reproduce', note: 'legacy',
    check: { command: 'sh bug.sh', expect: 'right' }, repro: { command: 'old', expect: 'old' },
  })
  h.journal.result('legacy')
  for (const stage of ['bisect', 'red', 'fix', 'verify']) h.journal.stage(`old-${stage}`, stage)
  await h.enter('pr')
  const board = foldSession(h.journal.events)
  assert.equal(board.stage, 'pr')
  assert.equal(Object.hasOwn(board, 'check'), false)
  assert.equal(Object.hasOwn(board, 'gate'), false)
})

async function enterWorkflow(h, workflow, stages) {
  for (const stage of stages) await h.enter(stage, stage, { workflow })
}

test('wave-one manifests preserve the named paths and fixed decision points', () => {
  const expected = [
    ['trace-forensics', '分析抓包', ['load', 'transform', 'narrow', 'attribute', 'confirm', 'report']],
    ['blast-radius', '爆炸半径', ['read', 'keyfact', 'beyond', 'rate', 'prove', 'report']],
    ['refactoring', '重构', ['pin', 'shape', 'subtract', 'move', 'prove', 'worth', 'pr']],
  ]
  for (const [id, name, stages] of expected) {
    const workflow = workflows.find(workflow => workflow.id === id)
    assert.equal(workflow.name, name)
    assert.equal(workflow.skill, `pstack-${id}`)
    assert.deepEqual(workflow.stages.map(stage => stage.id), stages)
    assert.deepEqual(workflow.stages.filter(stage => stage.optional).map(stage => stage.id), id === 'trace-forensics' ? ['confirm'] : [])
    assert.deepEqual(workflow.stages.filter(stage => stage.handback).map(stage => stage.id), id === 'trace-forensics' ? ['report'] : [])
    for (const stage of workflow.stages) {
      assert.ok(stage.name && stage.doing && stage.doneWhen)
    }
  }
  const explore = workflows.find(workflow => workflow.id === 'investigation').stages.find(stage => stage.id === 'explore')
  assert.equal(explore.name, '探索')
  assert.equal(explore.optional, undefined)
  assert.equal(explore.doing, '读代码和历史收集证据；复杂问题拆 2–4 个角度并行派只读子 agent')
  assert.equal(explore.doneWhen, '每个角度都有带出处的发现')
})

test('provider routes fifteen workflows and the plain shared delivery skill', async () => {
  const h = host()
  const candidates = await h.provider.list({})
  const expected = ['blast-radius', 'bug-fix', 'create-verification-skill', 'eval', 'feature', 'hillclimb', 'interrogate', 'investigation', 'maintain-verification-skill', 'multi-phase-plan', 'perf-issue', 'prototype', 'refactoring', 'runtime-forensics', 'trace-forensics']
  assert.deepEqual(workflows.map(workflow => workflow.id).sort(), expected)
  assert.deepEqual(candidates.map(candidate => candidate.name), [...expected, 'opening-a-pr'].sort().map(id => `pstack-${id}`))
  const delivery = candidates.find(candidate => candidate.name === 'pstack-opening-a-pr')
  const shared = await h.provider.get(delivery, {})
  assert.match(shared.content, /# Opening a PR\/MR/u)
  assert.doesNotMatch(shared.content, /## 阶段协议|pstack_stage|metadata\.workflow/u)
  for (const workflow of workflows) {
    const protocol = stageProtocol(workflow.id)
    assert.match(protocol, /## 阶段协议 \(stage protocol\)/u)
    assert.ok(protocol.includes('pstack_stage'))
    assert.ok(protocol.includes('todo_write'))
    assert.ok(protocol.includes('pstack_pause'))
    assert.ok(protocol.includes('ask_user_question'))
    assert.ok(protocol.includes('git status --short'))
    assert.match(protocol, /每步首次行动前必须报告，每次重新进入也要再报告（包括 loop 的每轮）/u)
    assert.match(protocol, /跳过时在下一条 note 写 skip: <步骤及原因>/u)
    assert.doesNotMatch(protocol, /check:|合法交接|退出门槛通过/u)
    for (const [index, stage] of workflow.stages.entries()) {
      assert.ok(protocol.includes(`${index + 1}. ${stage.name} (${stage.id})`))
      if (stage.handback) assert.ok(protocol.includes(stage.handback))
    }
    const candidate = candidates.find(item => item.name === workflow.skill)
    assert.ok(candidate, workflow.skill)
    const skill = await h.provider.get(candidate, {})
    assert.ok(skill.content.includes(protocol))
    assert.equal(skill.content.split('## 阶段协议 (stage protocol)').length, 2)
  }
})

test('wave-two manifests expose every fixed stage and optional path', () => {
  const expected = [
    ['prototype', '出原型', ['decide', 'references', 'build', 'observe', 'present'], ['references']],
    ['hillclimb', '持续调优', ['ground', 'harness', 'loop', 'stop', 'pr'], []],
    ['interrogate', '代码审查', ['frame', 'attack', 'verify', 'report'], []],
    ['multi-phase-plan', '分期计划', ['triage', 'settle', 'explore', 'write', 'review', 'handback'], ['settle']],
    ['eval', 'eval', ['frame', 'setup', 'prompt', 'run', 'judge', 'audit', 'synthesize'], []],
  ]
  for (const [id, name, stages, optional] of expected) {
    const workflow = workflows.find(item => item.id === id)
    assert.equal(workflow.name, name)
    assert.equal(workflow.skill, `pstack-${id}`)
    assert.deepEqual(workflow.stages.map(stage => stage.id), stages)
    assert.deepEqual(workflow.stages.filter(stage => stage.optional).map(stage => stage.id), optional)
    assert.ok(workflow.stages.every(stage => stage.doing && stage.doneWhen))
  }
})

const emptyRoles = () => ({ worker: [], reviewer: [], candidate: [], judge: [] })
const pro = { provider: 'deepseek-account', model: 'deepseek-v4-pro' }
const flash = { provider: 'deepseek-account', model: 'deepseek-flash' }

test('model routes treat a missing file as empty, report invalid files and discover optional services', async () => {
  const root = await mkdtemp(join(dataRoot, 'models-'))
  const h = host({ connection: true, config: { root } })
  const route = h.routes.get('/api/pixel-town-pstack/models')
  assert.deepEqual(route.methods, ['GET', 'PUT'])
  assert.equal(route.requestBody, 'buffered')
  const request = new Request('http://localhost/api/pixel-town-pstack/models')
  const initial = await (await route.fetch(request)).json()
  assert.deepEqual(initial.assignments, emptyRoles())
  assert.deepEqual(initial.selection, { available: false, enabled: false, allowedModels: [] })
  assert.deepEqual(initial.roles.map(role => [role.id, role.maxRoutes]), [['worker', 1], ['reviewer', 3], ['candidate', 4], ['judge', 1]])
  assert.equal(initial.error, undefined)
  for (const invalid of ['not json', '{"version":2,"roles":{}}', '{"version":1,"roles":{"worker":"bad"}}']) {
    await writeFile(join(root, 'models.json'), invalid)
    const response = await route.fetch(request)
    assert.equal(response.status, 200)
    const state = await response.json()
    assert.deepEqual(state.assignments, emptyRoles())
    assert.match(state.error, /无法读取模型分工 models\.json/u)
  }
})

test('model PUT validates shape, caps, duplicate routes and the enabled selection allowlist', async () => {
  const root = await mkdtemp(join(dataRoot, 'models-put-'))
  let enabled = true
  const h = host({
    connection: true, config: { root },
    subagentModelSelection: { current: () => ({ enabled, allowedModels: [pro, flash] }) },
    llm: { resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high' }, { id: 'max' }] } }) },
  })
  const route = h.routes.get('/api/pixel-town-pstack/models')
  const put = body => route.fetch(new Request('http://localhost/api/pixel-town-pstack/models', { method: 'PUT', body: JSON.stringify(body) }))
  const bad = [
    null, [], {}, { assignments: [] }, { assignments: { worker: [] } },
    { assignments: { ...emptyRoles(), worker: ['wrong'] } },
    { assignments: { ...emptyRoles(), judge: [{ ...pro, reasoning_effort: 9 }] } },
    { assignments: { ...emptyRoles(), extra: [] } },
    { assignments: { ...emptyRoles(), worker: [pro, flash] } },
    { assignments: { ...emptyRoles(), reviewer: [pro, flash, { provider: 'p', model: 'a' }, { provider: 'p', model: 'b' }] } },
    { assignments: { ...emptyRoles(), reviewer: [pro, { ...pro, reasoning_effort: 'high' }] } },
    { assignments: { ...emptyRoles(), candidate: [{ provider: 'other', model: 'unauthorized' }] } },
  ]
  for (const body of bad) {
    const response = await put(body)
    assert.equal(response.status, 400, JSON.stringify(body))
    assert.match((await response.json()).error, /模型分工未保存/u)
  }
  assert.deepEqual(await readdir(root), [], 'invalid requests never create storage')
  const assignments = { ...emptyRoles(), worker: [flash], reviewer: [pro, flash], judge: [{ ...pro, reasoning_effort: 'high' }] }
  const saved = await put({ assignments })
  assert.equal(saved.status, 200)
  const state = await saved.json()
  assert.deepEqual(state.assignments, assignments)
  assert.deepEqual(state.selection.allowedModels[0], { ...pro, reasoningEfforts: ['high', 'max'] })
  assert.deepEqual(JSON.parse(await readFile(join(root, 'models.json'), 'utf8')), { version: 1, roles: assignments })
  assert.deepEqual(await readdir(root), ['models.json'], 'atomic writes leave no temp files')
  enabled = false
  const disabled = { ...emptyRoles(), worker: [{ provider: 'other', model: 'saved-for-later' }] }
  assert.equal((await put({ assignments: disabled })).status, 200, 'disabled selection preserves assignments without enforcing its inactive list')
  assert.deepEqual((await (await route.fetch(new Request('http://localhost/api/pixel-town-pstack/models'))).json()).assignments, disabled)
})

for (const { name, reasoning, explicit, expected, lowered = false, unavailable = false } of [
  { name: 'known default', reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' }, expected: 'medium', lowered: true },
  { name: 'catalog-specific level ordering', reasoning: { efforts: ['minimal', 'standard', 'extended'], defaultEffort: 'extended' }, expected: 'standard', lowered: true },
  { name: 'lowest default', reasoning: { efforts: ['low', 'high'], defaultEffort: 'low' } },
  { name: 'unknown levels' },
  { name: 'unknown default', reasoning: { efforts: ['low', 'high'] } },
  { name: 'temporarily unavailable catalog', unavailable: true },
  { name: 'explicit route effort', reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' }, explicit: 'high', expected: 'high' },
]) {
  test(`reviewer judgment effort respects ${name} without changing stored routes or other roles`, async () => {
    const root = await mkdtemp(join(dataRoot, 'models-effort-'))
    const reviewer = { ...pro, ...(explicit ? { reasoning_effort: explicit } : {}) }
    const assignments = { worker: [pro], reviewer: [reviewer], candidate: [pro], judge: [pro] }
    const stored = JSON.stringify({ version: 1, roles: assignments })
    await writeFile(join(root, 'models.json'), stored)
    const h = host({
      connection: true, config: { root },
      subagentModelSelection: { current: () => ({ enabled: true, allowedModels: [pro] }) },
      llm: { resolveModelInfo: async (provider, model) => {
        assert.equal(provider, pro.provider); assert.equal(model, pro.model)
        if (unavailable) throw new Error('catalog offline')
        return reasoning ? { reasoning: { ...reasoning, efforts: reasoning.efforts.map(id => ({ id })) } } : {}
      } },
    })
    const candidates = await h.provider.list({})
    const block = async id => (await h.provider.get(candidates.find(candidate => candidate.name === `pstack-${id}`), {}))
      .content.split('子 agent 模型（小镇告示牌 → 模型分工）：')[1]
    for (const workflow of ['hillclimb', 'multi-phase-plan', 'interrogate']) {
      const text = await block(workflow)
      if (expected) assert.ok(text.includes(`审查方用 ${pro.provider}/${pro.model}（reasoning_effort=${expected}`), text)
      else assert.doesNotMatch(text, /reasoning_effort/u)
      assert.equal(text.includes('比该模型默认低一档'), lowered)
      assert.equal(text.includes('并填上述 reasoning_effort'), expected !== undefined)
      assert.doesNotMatch(text, /干活的子 agent用 [^\n]+reasoning_effort/u)
    }
    const blast = await block('blast-radius')
    if (explicit) assert.ok(blast.includes(`reasoning_effort=${explicit}`))
    else assert.doesNotMatch(blast, /reasoning_effort/u)
    assert.doesNotMatch(blast, /比该模型默认低一档/u)
    for (const workflow of ['bug-fix', 'eval']) assert.doesNotMatch(await block(workflow), /reasoning_effort|比该模型默认低一档/u)
    const state = await (await h.routes.get('/api/pixel-town-pstack/models').fetch(new Request('http://localhost/api/pixel-town-pstack/models'))).json()
    assert.deepEqual(state.assignments, assignments)
    assert.equal(state.selection.allowedModels[0].defaultReasoningEffort, reasoning?.defaultEffort)
    assert.equal(await readFile(join(root, 'models.json'), 'utf8'), stored)
  })
}

test('loaded skills inject only their workflow roles, omit empty workers and explain defaults', async () => {
  const root = await mkdtemp(join(dataRoot, 'models-skill-'))
  let enabled = true
  const h = host({ config: { root }, subagentModelSelection: { current: () => ({ enabled, allowedModels: [pro, flash] }) } })
  const candidates = await h.provider.list({})
  const content = async id => (await h.provider.get(candidates.find(candidate => candidate.name === `pstack-${id}`), {})).content
  for (const workflow of workflows) {
    const text = await content(workflow.id)
    if (workflow.id === 'interrogate') assert.match(text, /未分配模型；派 2 个审查方，都用默认模型/u)
    else if (workflow.id === 'eval') {
      assert.match(text, /未分配模型；派 1 个候选，都用默认模型/u)
      assert.match(text, /无其他可用家族时跳过独立盲评/u)
    } else if (workflow.trail) assert.match(text, /审查方：未分配模型；用默认模型.*没有换模型/u)
    else assert.doesNotMatch(text, /子 agent 模型（小镇告示牌/u)
  }
  const assignments = { worker: [flash], reviewer: [pro, flash], candidate: [flash], judge: [{ ...pro, reasoning_effort: 'high' }] }
  await writeFile(join(root, 'models.json'), JSON.stringify({ version: 1, roles: assignments }))
  for (const workflow of workflows) {
    const block = (await content(workflow.id)).split('子 agent 模型（小镇告示牌 → 模型分工）：')[1]
    assert.ok(block, workflow.id)
    assert.match(block, /在 subagent 调用里填 provider 和 model/u)
    assert.match(block, /没有这些字段或调用被拒时，.*用默认模型/u)
    if (['interrogate', 'blast-radius'].includes(workflow.id)) {
      assert.match(block, /审查方用 deepseek-account\/deepseek-v4-pro、deepseek-account\/deepseek-flash/u)
      if (workflow.id === 'interrogate') assert.match(block, /每条配置派 1 个，共 2 个，不增减席位/u)
      assert.doesNotMatch(block, /干活的子 agent|eval 候选|eval 评审/u)
    } else if (workflow.id === 'eval') {
      assert.match(block, /eval 候选用 deepseek-account\/deepseek-flash/u)
      assert.match(block, /eval 评审用 deepseek-account\/deepseek-v4-pro（reasoning_effort=high）/u)
      assert.match(block, /每条配置派 1 个，共 1 个，不增减席位/u)
      assert.match(block, /评审不得与任何候选同模型或同家族/u)
      assert.doesNotMatch(block, /审查方|干活的子 agent/u)
    } else {
      assert.match(block, /干活的子 agent用 deepseek-account\/deepseek-flash/u)
      if (workflow.trail) assert.match(block, /审查方用 deepseek-account\/deepseek-v4-pro、deepseek-account\/deepseek-flash/u)
      else assert.doesNotMatch(block, /审查方/u)
      assert.doesNotMatch(block, /eval 候选|eval 评审/u)
    }
  }
  enabled = false
  for (const id of ['interrogate', 'eval']) {
    const block = (await content(id)).split('子 agent 模型（小镇告示牌 → 模型分工）：')[1]
    assert.match(block, id === 'interrogate'
      ? /模型选择未开启；派 2 个审查方，都用默认模型/u
      : /模型选择未开启；派 1 个候选，都用默认模型/u)
    assert.doesNotMatch(block, /在 subagent 调用里填/u)
  }
  const absent = host({ config: { root } })
  const text = (await absent.provider.get(candidates.find(candidate => candidate.name === 'pstack-interrogate'), {})).content
  assert.match(text, /当前宿主未提供模型选择；派 2 个审查方，都用默认模型/u)
  for (const count of [1, 3]) {
    const reviewer = Array.from({ length: count }, (_, i) => ({ provider: 'vendor', model: `model-${i}` }))
    await writeFile(join(root, 'models.json'), JSON.stringify({ version: 1, roles: { ...emptyRoles(), reviewer } }))
    assert.ok((await content('interrogate')).includes(`派 ${count} 个审查方，都用默认模型`), 'fallback preserves configured seats')
    const configured = host({ config: { root }, subagentModelSelection: { current: () => ({ enabled: true, allowedModels: reviewer }) } })
    const configuredText = (await configured.provider.get(candidates.find(candidate => candidate.name === 'pstack-interrogate'), {})).content
    assert.ok(configuredText.includes(`每条配置派 1 个，共 ${count} 个，不增减席位`))
  }
})

test('retired ADR logs clear the active workflow without breaking the board route or usage', async () => {
  const h = host({ connection: true })
  await enterWorkflow(h, 'feature', ['restate', 'survey', 'sketch'])
  for (const stage of ['archaeology', 'current', 'options', 'blast', 'crossexam', 'write', 'decide']) {
    h.journal.call(`old-${stage}`, 'pstack_stage', { workflow: 'adr', stage, note: 'committed stage' })
    h.journal.result(`old-${stage}`)
  }
  h.journal.append('assistant/message', { usage: { inputTokens: 7, cacheReadTokens: 11, outputTokens: 5 } })
  h.journal.append('turn/end', { turn: 1 })
  const board = foldSession(h.journal.events)
  assert.equal(board.workflow, undefined)
  assert.equal(board.stage, undefined)
  assert.equal(board.stageIndex, 0)
  assert.equal(board.stageCount, 0)
  assert.equal(board.stageEnteredAt, null)
  assert.equal(Object.hasOwn(board, 'check'), false)
  assert.equal(Object.hasOwn(board, 'gate'), false)
  assert.equal(board.handoffFrom, null)
  assert.deepEqual(board.skipped, [])
  assert.equal(board.status, 'idle')
  assert.equal(board.cost.tokens, 23)
  assert.deepEqual([board.cost.miss, board.cost.cacheHit, board.cost.output, board.cost.steps], [7, 11, 5, 1])
  assert.deepEqual(board.cost.byStage.map(({ workflow, stage, tokens }) => ({ workflow, stage, tokens })), [
    { workflow: 'adr', stage: 'decide', tokens: 23 },
  ])
  assert.deepEqual(h.journal.events.reduce(reduce, undefined).board, board)
  const payload = await (await h.route.fetch()).json()
  assert.deepEqual(payload.workflows, workflows)
  assert.equal(Object.hasOwn(payload, 'handoffs'), false)
  assert.equal(payload.sessions[0].workflow, undefined)
  assert.deepEqual(payload.sessions[0].cost, board.cost)
  await h.enter('checkpoint', '直接继续当前工作', { workflow: 'feature' })
  assert.equal(foldSession(h.journal.events).workflow, 'feature')
})

test('workflow switches accept arbitrary source and target stages and retain visited todos', async () => {
  const h = host()
  await h.enter('fix')
  await h.enter('prove', '转去解释现象', { workflow: 'runtime-forensics' })
  let board = foldSession(h.journal.events)
  assert.equal(board.history.at(-1).kind, 'handoff')
  assert.deepEqual(board.handoffFrom, { workflow: 'bug-fix', stage: 'fix', at: board.stageEnteredAt })
  assert.deepEqual(board.skipped, ['intake', 'capture', 'reduce', 'hypothesize'])
  const source = board.handoffFrom
  await h.enter('prove', '补充解释', { workflow: 'runtime-forensics' })
  assert.deepEqual(foldSession(h.journal.events).handoffFrom, source)
  await h.enter('bisect', '回到修复流程')
  board = foldSession(h.journal.events)
  assert.deepEqual(board.handoffFrom, { workflow: 'runtime-forensics', stage: 'prove', at: board.stageEnteredAt })
  assert.deepEqual(board.skipped, ['reproduce'])
  assert.deepEqual(board.todos.map(todo => todo.status), [
    'completed', 'in_progress', 'pending', 'pending', 'completed', 'pending', 'pending', 'pending',
  ])
  assert.equal(board.todos[0].content, '1. 复现 (reproduce)（跳过）')
  assert.equal(board.todos[4].content, '5. 修复 (fix)')
  await h.enter('build', '切换到需求实现', { workflow: 'feature' })
  board = foldSession(h.journal.events)
  assert.deepEqual(board.handoffFrom, { workflow: 'bug-fix', stage: 'bisect', at: board.stageEnteredAt })
  assert.deepEqual(board.skipped, ['restate', 'survey', 'sketch', 'checkpoint'])
  await h.enter('explain', '先回答代码问题', { workflow: 'investigation' })
  await h.enter('remeasure', '再报告性能测量', { workflow: 'perf-issue' })
  board = foldSession(h.journal.events)
  assert.deepEqual(board.handoffFrom, { workflow: 'investigation', stage: 'explain', at: board.stageEnteredAt })
  assert.deepEqual(board.skipped, ['baseline', 'hypothesize', 'fix'])
  assert.equal(board.history.filter(entry => entry.kind === 'rollback').length, 0, 'switches are not same-workflow rollbacks')
})

test('last stage does not finish until its turn ends, and a pending question retains needsYou', async () => {
  const h = host()
  await h.enter('prove', '整理已有诊断', { workflow: 'runtime-forensics' })
  await h.enter('report', '结案报告', { workflow: 'runtime-forensics' })
  assert.equal(foldSession(h.journal.events).status, 'idle')
  h.journal.append('turn/start', { turn: 1 })
  assert.equal(foldSession(h.journal.events).status, 'working')
  h.journal.call('pending-question', 'ask_user_question', { questions: [{ id: 'continue', question: '要修复吗？' }] })
  h.journal.append('turn/end', { turn: 1 })
  assert.equal(foldSession(h.journal.events).status, 'needsYou')
  h.journal.result('pending-question')
  assert.equal(foldSession(h.journal.events).status, 'finished')
})

test('already-accepted returns from retired ADR resume at their recorded stage', async () => {
  const h = host()
  await enterWorkflow(h, 'feature', ['restate', 'survey', 'sketch'])
  h.journal.call('old-adr', 'pstack_stage', { workflow: 'adr', stage: 'decide', note: 'legacy decision', check: { command: 'old', expect: 'old' } })
  h.journal.result('old-adr')
  h.journal.call('old-return', 'pstack_stage', { workflow: 'feature', stage: 'checkpoint', note: 'legacy handoff' })
  h.journal.result('old-return')
  const board = foldSession(h.journal.events)
  assert.equal(board.workflow, 'feature')
  assert.equal(board.stage, 'checkpoint')
  assert.equal(board.stageIndex, 4)
  assert.equal(Object.hasOwn(board, 'check'), false)
  assert.equal(Object.hasOwn(board, 'gate'), false)
  await h.enter('build', '继续实现', { workflow: 'feature' })
  assert.equal(foldSession(h.journal.events).stage, 'build')
})
