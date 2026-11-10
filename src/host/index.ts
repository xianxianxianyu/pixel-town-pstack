import { randomUUID } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { foldBoard, foldSession } from '../shared/fold.ts'
import { DELIVERY_SKILL, LEGACY_WORKFLOW_IDS, diagramRule, getWorkflow, parseStageInput, stageIds, stageProtocol, stageResult, transition, workflowIds, workflows } from '../shared/workflows.ts'
import { existingSpillNotice, outputCapTokens, outputPreview, shouldCapOutput } from '../shared/output-cap.ts'
import { parsePauseInput, savePause } from './pause.ts'
import type { HostContext, Session, SkillCandidate } from './dsh.ts'
import { modelRoleBlock, parseAssignments } from '../shared/model-roles.ts'
import { modelSelection, modelState, saveAssignments } from './models.ts'
import { evidenceCall, trailEnabled, trailRules } from '../shared/trail.ts'
import { logTrail, saveAudit } from './trail.ts'

export const name = 'dsh-pixel-town-pstack'
export const inject = ['tools', 'sessions', 'skills']

const townPath = '/api/pixel-town-pstack/town'
const townRoot = fileURLToPath(new URL('../board/', import.meta.url))
const townAssets: Readonly<Record<string, string>> = {
  'index.html': 'text/html; charset=utf-8',
  'town.css': 'text/css; charset=utf-8',
  'town.js': 'text/javascript; charset=utf-8',
  'art.js': 'text/javascript; charset=utf-8',
  'live-data.js': 'text/javascript; charset=utf-8',
  'navigation.js': 'text/javascript; charset=utf-8',
}

export interface Config {
  /** Absolute plugin data directory, outside the user's repository. */
  readonly root: string
  /** Directory containing <name>/SKILL.md; defaults to this package's skills/. */
  readonly skillsRoot?: string
  /** Estimated text tokens (ceil(chars / 3)); defaults to 3000, zero disables. */
  readonly outputCapTokens?: number
}

function sessionRecords(session: Session) {
  // rc.5 exposes the immutable committed log directly. The header is a separate
  // storage record, so prepend its exact on-disk shape for the same replay fold.
  return [{ ...session.header, type: 'session' }, ...session.snapshotEvents()]
}

function parseSkill(raw: string, path: string): { description: string; modelInvocable: boolean; content: string; workflow?: string } {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (!frontmatter) throw new Error(`pixel-town-pstack: ${path} has no YAML frontmatter`)
  const metadata: unknown = parseYaml(frontmatter[1]!)
  if (typeof metadata !== 'object' || metadata === null || !('description' in metadata)
    || typeof metadata.description !== 'string' || !metadata.description.trim()) {
    throw new Error(`pixel-town-pstack: ${path} has no description`)
  }
  // DSH's own convention: a user-only skill answers /name but stays out of the model's catalog and skill tool.
  const userOnly = 'disable-model-invocation' in metadata ? metadata['disable-model-invocation'] : false
  if (typeof userOnly !== 'boolean') throw new Error(`pixel-town-pstack: ${path} has invalid disable-model-invocation`)
  const attributes = 'metadata' in metadata && typeof metadata.metadata === 'object' && metadata.metadata !== null
    ? metadata.metadata : null
  const workflow = attributes && 'workflow' in attributes ? attributes.workflow : undefined
  if (workflow !== undefined && typeof workflow !== 'string') throw new Error(`pixel-town-pstack: ${path} has invalid metadata.workflow`)
  const skill = { description: metadata.description, modelInvocable: !userOnly }
  const content = raw.slice(frontmatter[0].length).trim()
  if (workflow === undefined) return { ...skill, content }
  // skills/ is read live while the registry is in the running host's memory, so a newer skill can
  // name a workflow this host predates. Serve that one skill plainly instead of failing the catalog.
  if (!workflows.some(known => known.id === workflow)) {
    return { ...skill, content: `${content}\n\n> 当前宿主不认识工作流 \`${workflow}\`，按正文执行，不调用 pstack_stage；重启 DSH 加载新版小镇后才有阶段协议。` }
  }
  return { ...skill, content: `${content}\n\n${stageProtocol(workflow)}`, workflow }
}

export function apply(ctx: HostContext, config: Config): void {
  if (typeof config?.root !== 'string' || !isAbsolute(config.root)) throw new Error('pixel-town-pstack: root must be an absolute directory')
  const skillsRoot = config.skillsRoot ?? fileURLToPath(new URL('../skills/', import.meta.url))
  if (typeof skillsRoot !== 'string' || !isAbsolute(skillsRoot)) throw new Error('pixel-town-pstack: skillsRoot must be an absolute directory')
  const cap = outputCapTokens(config.outputCapTokens)

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (cap === 0 || decision.kind !== 'accept' || Object.hasOwn(decision, 'value')
      || exec.name.startsWith('pstack_') || exec.agent === undefined) return decision
    const content = decision.content ?? result.content
    if (!content.every(block => block.type === 'text' && typeof block.text === 'string')) return decision
    const text = content.map(block => block.text).join('')
    if (text.length <= cap * 3) return decision
    // Optional discovery follows DSH's spill consumers; no plugin-owned output spills.
    const store = ctx.get('spillStore')
    const notice = existingSpillNotice(text)
    if (store === undefined && notice === undefined) return decision
    const session = exec.agent.session
    const board = foldSession(sessionRecords(session))
    if (!shouldCapOutput(board, exec.name, text, cap)) return decision
    exec.signal.throwIfAborted()
    try {
      const recovery = notice ?? await store!.saveText({
        owner: { sessionId: session.header.id },
        source: { kind: 'tool', toolName: exec.name, callId: exec.callId, label: 'result' },
        suggestedName: `${exec.name}.txt`, content: text,
      })
      exec.signal.throwIfAborted()
      const preview = outputPreview(text, exec.name, recovery, cap)
      if (preview === undefined) return decision
      return { kind: 'accept', content: [{ type: 'text', text: preview }], additionalContexts: decision.additionalContexts }
    } catch (error) {
      exec.signal.throwIfAborted()
      ctx.logger.warn(`pixel-town-pstack: output spill failed; keeping inline content: ${String(error)}`)
      return decision
    }
  }, { prepend: true })

  ctx.tools.register({
    name: 'pstack_stage',
    description: '上报 pstack playbook 当前进度并自动同步任务清单；不要另调 todo_write。可从任意阶段开始、跳步、回退或切换工作流；同一步再次调用只更新说明。不检查执行证据，也不阻止推进。具体做法和固定交还停点见对应技能。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        workflow: { type: 'string', enum: workflowIds },
        stage: { type: 'string', enum: stageIds },
        note: { type: 'string', minLength: 1, description: '用一行文字说明现在正在做什么。' },
      },
      required: ['workflow', 'stage', 'note'],
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    // Exclusive scheduling preserves committed report order; the tool itself
    // never appends or caches stage state.
    isConcurrencySafe: () => false,
    async execute(raw, exec) {
      exec.signal.throwIfAborted()
      const input = parseStageInput(raw)
      if (!exec.agent) throw new Error('pstack_stage requires a calling agent session')
      const board = foldSession(sessionRecords(exec.agent.session))
      const move = transition(board, input)
      const visited = new Set(board.history
        .filter(entry => entry.workflow === input.workflow && entry.kind !== 'skip' && entry.kind !== 'rejected')
        .map(entry => entry.stage))
      exec.agent.session.append('todo/write', {
        todos: getWorkflow(input.workflow).stages.map((stage, index) => {
          const skipped = move.skipped.includes(stage.id)
          return {
            content: `${index + 1}. ${stage.name} (${stage.id})${skipped ? '（跳过）' : ''}`,
            status: stage.id === input.stage ? 'in_progress' : skipped || visited.has(stage.id) ? 'completed' : 'pending',
          }
        }),
      })
      return stageResult(input)
    },
  })

  ctx.tools.register({
    name: 'pstack_pause',
    description: '存档后交还给人或暂停。只写仓库外的续接笔记，不 commit、不 stash、不改代码。先读取 git status --short，将未提交路径列在 resume.uncommitted（没有则 []）；调用成功后结束回复，需要人决定则用 ask_user_question 提问。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        waiting_for: { type: 'string', minLength: 1, description: '一行写清等人决定或做什么。' },
        reason: { type: 'string', enum: ['handback', 'requested'] },
        resume: {
          type: 'object', additionalProperties: false,
          properties: {
            intent: { type: 'string', minLength: 1 },
            done: { type: 'string', minLength: 1 },
            state: { type: 'string', minLength: 1 },
            next: { type: 'string', minLength: 1 },
            files: { type: 'array', items: { type: 'string', minLength: 1 } },
            gotchas: { type: 'string' },
            uncommitted: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'git status --short 中的未提交路径；不改动它们。' },
          },
          required: ['intent', 'done', 'state', 'next', 'files', 'uncommitted'],
        },
      },
      required: ['waiting_for', 'reason', 'resume'],
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    isConcurrencySafe: () => false,
    async execute(raw, exec) {
      exec.signal.throwIfAborted()
      const input = parsePauseInput(raw)
      if (!exec.agent) throw new Error('pstack_pause requires a calling agent session')
      const board = foldSession(sessionRecords(exec.agent.session))
      if (board.workflow === undefined) throw new Error('当前会话没有进行中的 pstack 工作流，不能存档。')
      return savePause(config.root, board, input, exec.signal)
    },
  })

  ctx.tools.register({
    name: 'pstack_log',
    description: '追加工作日志的一条决策或验证结果；证据优先 call:last:bash，也可 call:last、call:last:<工具名>、call:-<n>（倒数第 n 个，排除 pstack_*），或 call:<providerId>（仅按原始 provider id 取最后完成的调用）；宿主统一存为 kind=invocation 的会话内唯一 ref 并回显，可用 invocation:<ref> 精确重引。其他证据：存在的 file:、commit:、https 的 url:。错行只能用 supersedes 追加纠正。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        decision: { type: 'string', minLength: 1 }, why: { type: 'string', minLength: 1 },
        evidence: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
        result: { type: 'string', minLength: 1 }, supersedes: { type: 'integer', minimum: 1 },
      },
      required: ['decision', 'why', 'evidence', 'result'],
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    isConcurrencySafe: () => false,
    async execute(raw, exec) {
      exec.signal.throwIfAborted()
      if (!exec.agent) throw new Error('当前会话没有进行中的 pstack 工作流，不能记录工作日志。')
      const records = sessionRecords(exec.agent.session)
      return logTrail(raw, foldSession(records), records, exec.signal)
    },
  })
  ctx.tools.register({
    name: 'pstack_audit',
    description: '不带 review 时机械审计并原子导出 TSV 和不含推理的 transcript，返回发现和两个路径。审查子 agent 读完后，用 review 记录其真实模型与 flags（没有发现用 []）。发现不是关卡；纠正用 pstack_log 的 supersedes。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        review: {
          type: 'object', additionalProperties: false,
          properties: {
            model: { type: 'string', minLength: 1 },
            flags: { type: 'array', items: { type: 'object', additionalProperties: false,
              properties: { text: { type: 'string', minLength: 1 }, rows: { type: 'array', items: { type: 'integer', minimum: 1 } } },
              required: ['text'],
            } },
          },
          required: ['model', 'flags'],
        },
      },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    isConcurrencySafe: () => false,
    async execute(raw, exec) {
      if (!exec.agent) throw new Error('pstack_audit requires a calling agent session')
      const records = sessionRecords(exec.agent.session)
      return saveAudit(config.root, raw, foldSession(records), records, exec.signal)
    },
  })

  // Commands are UI-only; omitting this service must not prevent headless loading.
  ctx.inject(['commands'], commandCtx => {
    commandCtx.commands.register({
      name: 'pstack-trail', description: '从现在开始保留决策日志，交还前审计与独立审查', input: { hint: '[note]' },
      async handler({ agent, rawInput }) {
        const board = foldSession(sessionRecords(agent.session))
        if (board.workflow === undefined) return { kind: 'error', text: '当前会话没有进行中的 pstack 工作流，不能开启工作日志。' }
        const models = await modelState(ctx, config.root)
        const roles = modelRoleBlock(board.workflow, models.assignments, models.selection, true)
        const instruction = `${trailEnabled}\n从现在开始保留工作日志。\n${trailRules}\n${roles}${rawInput.trim() ? `\n用户备注：${rawInput.trim()}` : ''}`
        const message = Object.freeze({
          id: randomUUID(), role: 'user' as const, source: Object.freeze({ kind: 'user' as const }),
          content: Object.freeze([Object.freeze({ type: 'text' as const, text: instruction })]),
        })
        if (agent.status === 'running') agent.steer(message)
        else agent.followup(message)
        return { kind: 'success', text: '已请求开启工作日志；交还前将审计并交给审查方。' }
      },
    })
    commandCtx.commands.register({
      name: 'pstack-pause', description: '安全停下并存档，不改动代码', input: { hint: '[reason]' },
      handler({ agent, rawInput }) {
        if (foldSession(sessionRecords(agent.session)).workflow === undefined) {
          return { kind: 'error', text: '当前会话没有进行中的 pstack 工作流，不能存档。' }
        }
        const instruction = '请安全暂停：在安全边界停下；用 interrupt_agent 中断仍在运行的子 agent；不采取不可逆操作；不改动代码，不 commit、不 stash；只读 git status --short，把未提交路径列入续接笔记；调用 pstack_pause，reason 必须为 \"requested\"，写清 intent、done、state、next、files、gotchas 和 uncommitted；然后立即结束回复。'
        // Match DSH's immutable createUserMessage wire shape without bundling its runtime.
        const message = Object.freeze({
          id: randomUUID(), role: 'user' as const, source: Object.freeze({ kind: 'user' as const }),
          content: Object.freeze([Object.freeze({ type: 'text' as const, text: `${instruction}${rawInput.trim() ? `\n用户暂停原因：${rawInput.trim()}` : ''}` })]),
        })
        if (agent.status === 'running') agent.steer(message)
        else agent.followup(message)
        return { kind: 'success', text: '已请求安全暂停，存档完成后会停下。' }
      },
    })
  })

  ctx.inject(['connection'], routeCtx => {
    routeCtx.connection.fetch.register({
      path: '/api/pixel-town-pstack/board', methods: ['GET'], requestBody: 'buffered',
      async fetch() {
        return Response.json({ workflows, deliverySkill: DELIVERY_SKILL, legacyWorkflowIds: LEGACY_WORKFLOW_IDS, sessions: foldBoard(routeCtx.sessions.list().map(sessionRecords)) })
      },
    })
    routeCtx.connection.fetch.register({
      path: '/api/pixel-town-pstack/evidence', methods: ['GET'], requestBody: 'buffered',
      async fetch(request) {
        const query = new URL(request.url).searchParams
        const invocation = query.get('invocation'), providerId = query.get('call')
        if ((invocation === null) === (providerId === null)) {
          return Response.json({ error: 'Specify exactly one evidence selector: invocation or call' }, { status: 400 })
        }
        const session = routeCtx.sessions.list().find(session => session.header.id === query.get('session'))
        const evidence = session && evidenceCall(sessionRecords(session), invocation === null
          ? { kind: 'call', ref: providerId! } : { kind: 'invocation', ref: invocation })
        return evidence ? Response.json(evidence) : Response.json({ error: 'Evidence not found' }, { status: 404 })
      },
    })
    routeCtx.connection.fetch.register({
      path: '/api/pixel-town-pstack/models', methods: ['GET', 'PUT'], requestBody: 'buffered',
      async fetch(request) {
        if (request.method === 'PUT') {
          let assignments
          try {
            const body: unknown = await request.json()
            if (typeof body !== 'object' || body === null || Array.isArray(body)
              || Object.keys(body).length !== 1 || !('assignments' in body)) {
              throw new Error('请求必须是 { assignments } 对象。')
            }
            assignments = parseAssignments(body.assignments, modelSelection(routeCtx))
          } catch (error) {
            return Response.json({ error: `模型分工未保存：${error instanceof Error ? error.message : String(error)}` }, { status: 400 })
          }
          await saveAssignments(config.root, assignments)
        }
        return Response.json(await modelState(routeCtx, config.root))
      },
    })
  })

  // Only the packaged shell is public; session data stays on ConnectionFetch.
  ctx.inject(['webServer'], routeCtx => {
    routeCtx.effect(() => routeCtx.webServer.register({
      kind: 'prefix',
      path: townPath,
      async handler(req, res) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' })
          res.end()
          return
        }
        // Match raw paths, not URL-normalized or decoded paths: encoded separators
        // and dot segments must never become an allowed asset or filesystem path.
        const pathname = (req.url ?? '').split('?', 1)[0]!
        if (pathname === townPath) {
          res.writeHead(308, { Location: `${townPath}/` })
          res.end()
          return
        }
        const filename = pathname === `${townPath}/` ? 'index.html'
          : pathname.startsWith(`${townPath}/`) ? pathname.slice(townPath.length + 1) : ''
        const contentType = Object.hasOwn(townAssets, filename) ? townAssets[filename] : undefined
        if (contentType === undefined) {
          res.writeHead(404)
          res.end()
          return
        }
        let body: Buffer | undefined
        let size: number
        try {
          const path = join(townRoot, filename)
          if (req.method === 'HEAD') size = (await stat(path)).size
          else {
            body = await readFile(path)
            size = body.length
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          res.writeHead(404)
          res.end()
          return
        }
        res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': size })
        res.end(body)
      },
    }), 'pixel-town-pstack: public town assets')
  })

  ctx.skills.registerProvider(() => ({
    name: 'pixel-town-pstack',
    async list({ signal }) {
      const entries = await readdir(skillsRoot, { withFileTypes: true })
      const candidates: SkillCandidate[] = []
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory()) continue
        const directory = join(skillsRoot, entry.name)
        const path = join(directory, 'SKILL.md')
        let raw: string
        try {
          raw = await readFile(path, { encoding: 'utf8', signal })
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw error
        }
        const { description, modelInvocable } = parseSkill(raw, path)
        candidates.push({
          name: entry.name, description, invocation: { modelInvocable, userInvocable: true },
          provider: 'pixel-town-pstack', source: 'bundled', rank: 600,
          resourceBase: { kind: 'directory', path: directory }, locator: path, path,
        })
      }
      return candidates
    },
    async get(candidate, { signal }) {
      const { rank: _rank, locator, ...summary } = candidate
      const raw = await readFile(locator, { encoding: 'utf8', signal })
      const { workflow, modelInvocable: _modelInvocable, ...skill } = parseSkill(raw, locator)
      const models = workflow === undefined ? undefined : await modelState(ctx, config.root)
      const block = workflow === undefined || !models ? '' : modelRoleBlock(workflow, models.assignments, models.selection)
      const statechart = candidate.name === 'pstack-statechart' ? [
        '## Installed statechart resources',
        '',
        'Use these resolved absolute paths; do not guess the installation directory. Set these variables in the shell used for the doctor and pipeline commands:',
        '```sh',
        ...[
          ['STATECHART_SCRIPT', join(dirname(locator), 'scripts', 'statechart')],
          ['STATECHART_DOCTOR', join(dirname(locator), 'scripts', 'doctor.mjs')],
          ['STATECHART_RENDER', join(dirname(locator), 'references', 'render.md')],
        ].map(([key, value]) => `${key}='${value!.replaceAll("'", "'\\''")}'`),
        '```',
        '',
        diagramRule,
      ].join('\n') : ''
      return { ...summary, ...skill, content: [skill.content, block, statechart].filter(Boolean).join('\n\n') }
    },
  }))
}
