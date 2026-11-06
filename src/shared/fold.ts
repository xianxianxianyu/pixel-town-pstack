import { LEGACY_WORKFLOW_IDS, getWorkflow, parseStageInput, transition, workflows } from './workflows.ts'
import { emptyTrail, foldTrailResult, trailEnabled } from './trail.ts'
import type { Trail } from './trail.ts'

/** Native v4 event envelopes, plus the first physical session-header record. */
export interface SessionRecord {
  readonly type: string
  readonly seq?: number
  readonly time?: number
  readonly data?: unknown
  readonly id?: string
  readonly createdAt?: number
  readonly [key: string]: unknown
}

export interface Todo {
  readonly content: string
  readonly status: string
}

export interface StageHistory {
  readonly workflow: string
  readonly stage: string
  readonly at: number
  readonly kind: 'enter' | 'handoff' | 'rollback' | 'skip' | 'rejected' | 'note'
  readonly note: string
}

export interface StageCost {
  readonly workflow: string | null
  readonly stage: string
  readonly tokens: number
  readonly steps: number
  readonly contextTokens: number
  readonly maxContext: number
  readonly children: number
}

export interface SessionCost {
  readonly tokens: number
  readonly cacheHit: number
  readonly miss: number
  readonly output: number
  readonly contextTokens: number
  readonly steps: number
  readonly maxContext: number
  readonly children: number
  readonly byStage: readonly StageCost[]
}

export interface SessionGoal {
  readonly objective: string
  readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
  readonly rounds: number
  readonly maxRounds: number
  readonly blockedReason?: { readonly code: string; readonly message: string }
  readonly updatedAt: number
}

export interface BoardSession {
  readonly sessionId: string
  readonly parentSessionId: string | null
  readonly cost: SessionCost
  readonly title: string | null
  readonly cwd: string | null
  readonly startedAt: number | null
  readonly workflow?: string
  readonly stage?: string
  /** One-based stage position; zero before the first accepted report. */
  readonly stageIndex: number
  readonly stageCount: number
  readonly stageEnteredAt: number | null
  readonly skipped: readonly string[]
  readonly history: readonly StageHistory[]
  readonly handoffFrom: { readonly workflow: string; readonly stage: string; readonly at: number } | null
  readonly checkpoint: { readonly at: number; readonly waitingFor: string; readonly reason: 'handback' | 'requested'; readonly path: string | null } | null
  readonly trail: Trail | null
  readonly goal: SessionGoal | null
  readonly interruption: { readonly kind: 'aborted' | 'error' | 'interrupted' | 'blocked' | 'max-tokens'; readonly at: number } | null
  readonly status: 'working' | 'idle' | 'needsYou' | 'finished' | 'paused' | 'interrupted'
  readonly delivery: { readonly kind: 'pr' | 'mr' | 'local'; readonly url?: string; readonly at: number } | null
  readonly finishedAt: number | null
  readonly needs: {
    readonly kind: 'question' | 'approval'
    readonly question: string
    readonly options: readonly string[]
  } | null
  readonly gag: {
    readonly id: string
    readonly kind: 'rollback' | 'test-red' | 'verify-failed' | 'compacting' | 'answered'
    readonly text: string
    readonly at: number
  } | null
  readonly skill: string | null
  readonly detail: string
  readonly lastEventAt: number | null
  readonly todos: readonly Todo[]
  readonly todoStage: string | null
  readonly source: 'reported' | 'todo' | 'none'
  readonly subagentCount: number
  readonly events: readonly { readonly type: string; readonly at: number; readonly detail: string }[]
}

interface PendingCall {
  readonly name: string
  readonly args: Record<string, unknown>
  readonly needs: BoardSession['needs']
}

interface ChildState {
  readonly createdAt: number | null
  readonly pending: boolean
}

/** Explicit continuation, not serialized into the public board or hidden in a cache. */
export interface FoldState {
  readonly board: BoardSession
  readonly pending: ReadonlyMap<string, PendingCall>
  readonly approvals: ReadonlyMap<string, NonNullable<BoardSession['needs']>>
  readonly children: ReadonlyMap<string, ChildState>
  readonly active: boolean
  readonly turnEnded: boolean
  readonly turnStartOrdinal: number
  readonly checkpointOrdinal: number
  readonly turnInterruption: BoardSession['interruption']
  readonly lastToolDetail: string
  /** Accepted stage note, independent of the temporary child-waiting display. */
  readonly stageDetail: string
  readonly ordinal: number
  /** Native refs admit goal rounds; they are not part of the town's public view. */
  readonly goalRef: { readonly id: string; readonly revision: number } | null
}

function initial(): FoldState {
  return {
    board: {
      sessionId: '', parentSessionId: null, title: null, cwd: null, startedAt: null,
      cost: { tokens: 0, cacheHit: 0, miss: 0, output: 0, contextTokens: 0, steps: 0, maxContext: 0, children: 0, byStage: [] },
      stageIndex: 0, stageCount: 0, stageEnteredAt: null,
      skipped: [], history: [], status: 'idle', needs: null, gag: null, detail: '', lastEventAt: null,
      todos: [], skill: null, todoStage: null, source: 'none', subagentCount: 0, events: [],
      handoffFrom: null, checkpoint: null, interruption: null, trail: null, goal: null,
      delivery: null, finishedAt: null,
    },
    pending: new Map(), approvals: new Map(), children: new Map(),
    active: false, turnEnded: false, lastToolDetail: '', stageDetail: '', ordinal: 0,
    turnStartOrdinal: 0, checkpointOrdinal: 0, turnInterruption: null, goalRef: null,
  }
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function tokenCount(value: unknown): number {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid assistant token usage')
  return value
}

function addCost(cost: SessionCost, delta: Omit<SessionCost, 'byStage'>, workflow: string | null, stage: string): SessionCost {
  const index = cost.byStage.findIndex(row => row.workflow === workflow && row.stage === stage)
  const previous = cost.byStage[index]
  const row: StageCost = {
    workflow, stage,
    tokens: (previous?.tokens ?? 0) + delta.tokens,
    steps: (previous?.steps ?? 0) + delta.steps,
    contextTokens: (previous?.contextTokens ?? 0) + delta.contextTokens,
    maxContext: Math.max(previous?.maxContext ?? 0, delta.maxContext),
    children: (previous?.children ?? 0) + delta.children,
  }
  const byStage = [...cost.byStage]
  if (index < 0) byStage.push(row)
  else byStage[index] = row
  return {
    tokens: cost.tokens + delta.tokens,
    cacheHit: cost.cacheHit + delta.cacheHit,
    miss: cost.miss + delta.miss,
    output: cost.output + delta.output,
    contextTokens: cost.contextTokens + delta.contextTokens,
    steps: cost.steps + delta.steps,
    maxContext: Math.max(cost.maxContext, delta.maxContext),
    children: cost.children + delta.children,
    byStage,
  }
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map(block => object(block)).filter(block => block.type === 'text').map(block => String(block.text ?? '')).join('\n')
}

function argumentsOf(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return object(value)
  try { return object(JSON.parse(value)) } catch { return {} }
}

function historicalWorkflow(id: string): string {
  return Object.hasOwn(LEGACY_WORKFLOW_IDS, id) ? LEGACY_WORKFLOW_IDS[id]! : id
}

function historicalSkill(name: string): string {
  return name.startsWith('pstack-') ? `pstack-${historicalWorkflow(name.slice(7))}` : name
}

/** The sole compatibility boundary for already-committed legacy stage reports. */
function committedStageInput(args: Record<string, unknown>) {
  if (args.workflow === 'adr') return null
  const workflow = typeof args.workflow === 'string' ? historicalWorkflow(args.workflow) : args.workflow
  return parseStageInput(workflow === args.workflow ? args : { ...args, workflow })
}

function questionNeeds(args: Record<string, unknown>): NonNullable<BoardSession['needs']> {
  const questions: string[] = [], options: string[] = []
  for (const value of Array.isArray(args.questions) ? args.questions : []) {
    const question = object(value)
    if (typeof question.question === 'string') questions.push(question.question)
    for (const value of Array.isArray(question.options) ? question.options : []) {
      const option = object(value)
      if (typeof option.label === 'string') options.push(option.label)
    }
  }
  return { kind: 'question', question: questions.join('\n'), options }
}

// Recognize test invocations, not arbitrary shell errors. Inspect the complete
// result below: a runner's only failure evidence may be its final summary.
const testCommands = [
  /\bnode\s+(?:[^\n;&|]*\s)?--test(?=\s|=|$)/u,
  /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test(?=\s|:|$)/u,
  /\b(?:vitest|jest|pytest)(?=\s|$)/u,
  /\b(?:go|cargo)\s+test(?=\s|$)/u,
]
const testFailure = /ℹ\s+fail\s+[1-9]\d*|✖|\bnot ok\b|\bAssertionError\b|\bFAILED\b|\bexit=[1-9]\d*/u

// Provider call IDs are scoped to a model step, not assumed globally unique.
function callKey(data: Record<string, unknown>, id: unknown): string {
  return JSON.stringify([data.turn, data.step, id])
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length)
  const grams = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)))
  const left = grams(a), right = grams(b)
  const overlap = [...left].filter(gram => right.has(gram)).length
  const score = 2 * overlap / (left.size + right.size || 1)
  return overlap >= 2 && score >= 0.35 ? score : 0
}

function inferTodo(todos: readonly Todo[], workflow?: string): string | undefined {
  const candidates = workflow === undefined ? workflows : [getWorkflow(workflow)]
  let best: string | undefined
  let bestScore = 0
  for (const todo of todos) {
    if (todo.status !== 'in_progress') continue
    const content = normalized(todo.content)
    for (const candidate of candidates) {
      for (const stage of candidate.stages) {
        const score = Math.max(similarity(content, normalized(stage.name)), similarity(content, normalized(stage.doing)))
        if (score > bestScore) { bestScore = score; best = stage.id }
      }
    }
  }
  return best
}

function deliveryResult(board: BoardSession, command: string, output: string, at: number): BoardSession['delivery'] {
  if (board.workflow === undefined || /\[exit code: [1-9]\d*\]\s*$/u.test(output)) return board.delivery
  const workflow = getWorkflow(board.workflow)
  if (!workflow.stages.some(stage => stage.id === 'pr' || stage.id === 'ship')) return board.delivery
  const inDelivery = board.stageIndex === board.stageCount || board.history.some(entry =>
    entry.workflow === board.workflow && (entry.stage === 'pr' || entry.stage === 'ship')
    && entry.kind !== 'rejected' && entry.kind !== 'skip')
  if (!inDelivery) return board.delivery
  let url: string | undefined
  for (const match of output.matchAll(/https:\/\/[^\s<>"'`]+\/(?:pull\/\d+|-\/merge_requests\/\d+)/gu)) url = match[0]
  if (url !== undefined) return { kind: url.includes('/-/merge_requests/') ? 'mr' : 'pr', url, at }
  // A later local commit or URL-less CLI response must not erase a known link.
  if (board.delivery?.url !== undefined) return board.delivery
  if (/\bgh\s+pr\s+create\b/u.test(command)) return { kind: 'pr', at }
  if (/\bglab\s+mr\s+create\b/u.test(command)) return { kind: 'mr', at }
  if (/(?:^|[;&|\n])\s*git\s+(?:-C\s+(?:"[^"]*"|'[^']*'|\S+)\s+)?commit\b/u.test(command)) return { kind: 'local', at }
  return board.delivery
}

/** Pure incremental reducer; pass undefined for the first record. */
export function reduce(previous: FoldState | undefined, event: SessionRecord): FoldState {
  const state = previous ?? initial()
  const ordinal = state.ordinal + 1
  if (event.type === 'session') {
    return {
      ...state, ordinal,
      board: {
        ...state.board, sessionId: event.id ?? '',
        parentSessionId: typeof event.parentSession === 'string' ? event.parentSession : null,
        cwd: typeof event.cwd === 'string' ? event.cwd : null,
        startedAt: event.createdAt ?? null, lastEventAt: event.createdAt ?? null,
      },
    }
  }
  const at = event.time
  if (typeof at !== 'number') throw new Error(`Session event ${event.type} has no numeric time`)
  const data = object(event.data)
  let board: BoardSession = { ...state.board, lastEventAt: at }
  let pending = state.pending, approvals = state.approvals, children = state.children
  let active = state.active, turnEnded = state.turnEnded, lastToolDetail = state.lastToolDetail
  let stageDetail = state.stageDetail
  let turnStartOrdinal = state.turnStartOrdinal, checkpointOrdinal = state.checkpointOrdinal, turnInterruption = state.turnInterruption
  let goalRef = state.goalRef
  let notable: string | undefined
  let gag: Pick<NonNullable<BoardSession['gag']>, 'kind' | 'text'> | undefined

  switch (event.type) {
    case 'goal/change': {
      // DSH packages/goal/goal/src/fold.ts:271-305: each mutation carries the
      // complete snapshot; clear removes it. Future versions are display-ignored.
      if (data.kind !== 'goal/change' || data.version !== 1) break
      if (data.operation === 'clear') {
        board = { ...board, goal: null }
        goalRef = null
        break
      }
      const goal = object(data.goal)
      const phase = goal.phase
      const reason = object(goal.blockedReason)
      if (!['create', 'edit', 'pause', 'resume', 'complete', 'block'].includes(String(data.operation))
        || typeof goal.id !== 'string' || !goal.id
        || typeof goal.revision !== 'number' || !Number.isSafeInteger(goal.revision) || goal.revision < 1
        || typeof goal.objective !== 'string' || !goal.objective.trim()
        || (phase !== 'active' && phase !== 'paused' && phase !== 'blocked' && phase !== 'complete')
        || typeof goal.maxGoalRounds !== 'number' || !Number.isSafeInteger(goal.maxGoalRounds) || goal.maxGoalRounds < 1
        || typeof data.roundsStarted !== 'number' || !Number.isSafeInteger(data.roundsStarted) || data.roundsStarted < 0
        || typeof data.updatedAt !== 'number' || !Number.isSafeInteger(data.updatedAt) || data.updatedAt < 0
        || (phase === 'blocked' && (typeof reason.code !== 'string' || typeof reason.message !== 'string'))) {
        throw new Error('Invalid goal/change snapshot')
      }
      goalRef = { id: goal.id, revision: goal.revision }
      board = { ...board, goal: {
        objective: goal.objective, phase, rounds: data.roundsStarted,
        maxRounds: goal.maxGoalRounds, updatedAt: data.updatedAt,
        ...(phase === 'blocked' ? { blockedReason: { code: reason.code as string, message: reason.message as string } } : {}),
      } }
      break
    }
    case 'assistant/message': {
      const usage = object(data.usage)
      // Native inputTokens is the cache miss, not input inclusive of cache hits.
      const miss = tokenCount(usage.inputTokens), cacheHit = tokenCount(usage.cacheReadTokens), output = tokenCount(usage.outputTokens)
      const contextTokens = miss + cacheHit
      const reported = board.workflow === undefined
        ? board.history.findLast(entry => entry.kind !== 'rejected' && entry.kind !== 'skip') : undefined
      board = {
        ...board,
        cost: addCost(board.cost, {
          tokens: contextTokens + output, cacheHit, miss, output, contextTokens,
          steps: 1, maxContext: contextTokens, children: 0,
        }, board.workflow ?? reported?.workflow ?? null, board.stage ?? reported?.stage ?? 'pre'),
      }
      break
    }
    case 'session/title':
      board = { ...board, title: typeof data.title === 'string' ? data.title : null }
      break
    case 'turn/start':
      active = true
      turnEnded = false
      turnStartOrdinal = ordinal
      turnInterruption = null
      notable = 'working'
      break
    case 'turn/end': {
      active = false
      turnEnded = true
      const kind = object(data.reason).kind
      turnInterruption = kind === 'aborted' || kind === 'error' || kind === 'interrupted' || kind === 'blocked' || kind === 'max-tokens'
        ? { kind, at } : null
      notable = 'turn ended'
      break
    }
    case 'tool/call': {
      const name = String(data.name ?? '')
      const args = argumentsOf(data.arguments)
      pending = new Map(pending).set(callKey(data, data.callId), {
        name, args, needs: name === 'ask_user_question' ? questionNeeds(args) : null,
      })
      lastToolDetail = typeof args.description === 'string' ? args.description : typeof args.command === 'string' ? args.command : ''
      if (name === 'send_message' && typeof args.agent_id === 'string') {
        const child = children.get(args.agent_id)
        if (child !== undefined && !child.pending) children = new Map(children).set(args.agent_id, { ...child, pending: true })
      }
      if (name === 'skill' && typeof args.name === 'string') board = { ...board, skill: historicalSkill(args.name) }
      notable = `${name}${lastToolDetail ? `: ${lastToolDetail}` : ''}`
      break
    }
    case 'tool/result': {
      const message = object(data.message)
      const key = callKey(data, message.toolCallId)
      const call = pending.get(key)
      const remaining = new Map(pending)
      remaining.delete(key)
      pending = remaining
      const isError = message.isError === true
      const resultText = text(message.content)
      const command = call?.name === 'bash' ? call.args.command : undefined
      notable = `${call?.name ?? String(message.toolCallId)}: ${isError ? 'error: ' : ''}${resultText}`
      if (typeof command === 'string' && message.isError === false) {
        board = { ...board, delivery: deliveryResult(board, command, resultText, at) }
      }
      if (call?.name === 'pstack_stage') {
        if (isError) {
          board = {
            ...board,
            history: [...board.history, {
              workflow: historicalWorkflow(String(call.args.workflow ?? '')), stage: String(call.args.stage ?? ''), at, kind: 'rejected',
              note: `${typeof call.args.note === 'string' ? call.args.note : ''}${resultText ? ` — ${resultText}` : ''}`,
            }],
          }
        } else if (message.isError === false) {
          const input = committedStageInput(call.args)
          if (input === null) {
            // Retired ADR reports are historical facts, not an active workflow.
            // Keep their visits for usage attribution, but never expose a plaque.
            stageDetail = ''
            board = {
              ...board, workflow: undefined, stage: undefined,
              stageIndex: 0, stageCount: 0, stageEnteredAt: null,
              skipped: [], handoffFrom: null,
              history: [...board.history, {
                workflow: 'adr', stage: String(call.args.stage ?? ''), at, kind: 'enter',
                note: String(call.args.note ?? ''),
              }],
            }
            break
          }
          const workflow = getWorkflow(input.workflow)
          const move = transition(board, input)
          if (move.kind === 'rollback') {
            gag = { kind: 'rollback', text: `退回「${workflow.stages[move.index - 1]!.name}」` }
          }
          stageDetail = input.note
          board = {
            ...board, workflow: input.workflow, stage: input.stage,
            stageIndex: move.index, stageCount: workflow.stages.length,
            stageEnteredAt: move.kind === 'note' ? board.stageEnteredAt : at,
            handoffFrom: move.kind === 'handoff'
              ? { workflow: board.workflow!, stage: board.stage!, at }
              : board.handoffFrom,
            skipped: move.skipped,
            trail: resultText.includes(trailEnabled) ? board.trail ?? emptyTrail() : board.trail,
            history: [
              ...board.history,
              ...move.newlySkipped.map(stage => ({ workflow: input.workflow, stage, at, kind: 'skip' as const, note: input.note })),
              { workflow: input.workflow, stage: input.stage, at, kind: move.kind, note: input.note },
            ],
          }
        }
      } else if ((call?.name === 'pstack_log' || call?.name === 'pstack_audit') && message.isError === false) {
        board = { ...board, trail: foldTrailResult(board.trail, resultText) }
      } else if (call?.name === 'pstack_pause' && message.isError === false && board.workflow !== undefined) {
        const { waiting_for: waitingFor, reason } = call.args
        // Old or malformed historical calls never invent a valid checkpoint.
        if (typeof waitingFor === 'string' && waitingFor.trim() && !/[\r\n\u2028\u2029]/u.test(waitingFor)
          && (reason === 'handback' || reason === 'requested')) {
          const firstLine = resultText.split('\n', 1)[0] ?? ''
          board = { ...board, checkpoint: { at, waitingFor: waitingFor.trim(), reason, path: firstLine.startsWith('/') ? firstLine : null } }
          checkpointOrdinal = ordinal
        }
      } else if (call?.name === 'ask_user_question') {
        gag = { kind: 'answered', text: '已收到回答' }
      } else if (gag === undefined && typeof command === 'string'
        && testCommands.some(pattern => pattern.test(command))
        && (isError || testFailure.test(resultText))) {
        gag = board.stage === 'red'
          ? { kind: 'test-red', text: '红灯测试失败' }
          : { kind: 'verify-failed', text: '测试未通过' }
      }
      break
    }
    case 'user/message': {
      const source = object(data.source)
      // Mirror DSH packages/goal/goal/src/fold.ts:321-330 and index.ts:148-153:
      // an admitted source.round replaces the count; it is not every user turn.
      // A round does not change updatedAt (only goal/change does).
      if (source.kind === 'goal') {
        const goal = board.goal
        if (goal === null || goalRef === null || goal.phase !== 'active' || source.goalId !== goalRef.id
          || source.revision !== goalRef.revision || source.round !== goal.rounds + 1
          || source.round > goal.maxRounds) {
          throw new Error(`goal round at session event ${event.seq} is not the next admitted round of the active goal`)
        }
        board = { ...board, goal: { ...goal, rounds: source.round } }
      }
      if (source.kind === 'subagent-settled' && typeof source.senderSessionId === 'string') {
        const child = children.get(source.senderSessionId)
        if (child?.pending) children = new Map(children).set(source.senderSessionId, { ...child, pending: false })
      }
      const content = text(data.content)
      if (source.kind === 'user' && content.startsWith(`${trailEnabled}\n`)) board = { ...board, trail: board.trail ?? emptyTrail() }
      const slash = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/u.exec(content)
      if (slash && (source.kind === undefined || source.kind === 'user')) board = { ...board, skill: historicalSkill(slash[1]!) }
      if (source.kind === 'skill-invocation' && typeof source.name === 'string') board = { ...board, skill: historicalSkill(source.name) }
      if (slash) notable = content
      break
    }
    case 'todo/write': {
      const todos = Array.isArray(data.todos) ? data.todos.map(value => object(value)).map(todo => ({ content: String(todo.content ?? ''), status: String(todo.status ?? '') })) : []
      board = { ...board, todos }
      notable = JSON.stringify(todos)
      break
    }
    case 'approval/asked': {
      const question = `${String(data.toolName)}: ${String(data.reason ?? 'approval requested')}`
      approvals = new Map(approvals).set(String(data.id), { kind: 'approval', question, options: [] })
      notable = question
      break
    }
    case 'approval/decided': {
      const remaining = new Map(approvals)
      if (remaining.delete(String(data.id))) gag = { kind: 'answered', text: '审批已处理' }
      approvals = remaining
      notable = String(data.outcome)
      break
    }
    case 'subagent/catalog':
      if (typeof data.childId === 'string') {
        const child = children.get(data.childId)
        const createdAt = child?.createdAt ?? (typeof data.childCreatedAt === 'number' ? data.childCreatedAt : null)
        children = new Map(children).set(data.childId, { createdAt, pending: child?.pending ?? true })
      }
      notable = String(data.childId ?? '')
      break
    case 'compaction/start':
      gag = { kind: 'compacting', text: '正在压缩上下文' }
      notable = event.type
      break
    case 'compaction/end':
      notable = event.type
      break
    case 'session/end-seed':
      // Forks copy the parent's events, then mark the inherited boundary. A
      // child's header and durable goal survive; inherited live progress does not.
      if (data.inherited === true) {
        const fresh = initial()
        return {
          ...fresh, ordinal, goalRef,
          board: {
            ...fresh.board, sessionId: board.sessionId, cwd: board.cwd, goal: board.goal,
            parentSessionId: board.parentSessionId,
            startedAt: board.startedAt, lastEventAt: at,
          },
        }
      }
      break
  }

  // Show the oldest pending question first, then the oldest unresolved approval.
  // Both remain recorded until their own matching result or decision arrives.
  let needs: BoardSession['needs'] = null
  for (const call of pending.values()) {
    if (call.needs !== null) { needs = call.needs; break }
  }
  needs ??= approvals.values().next().value ?? null
  const terminal = board.stage !== undefined && board.stageIndex === board.stageCount
  let pendingChildren = 0
  for (const child of children.values()) if (child.pending) pendingChildren += 1
  const waiting = !active && pendingChildren > 0
  const savedThisTurn = checkpointOrdinal > turnStartOrdinal
  const status: BoardSession['status'] = needs !== null ? 'needsYou'
    : turnEnded && turnInterruption !== null && !savedThisTurn ? 'interrupted'
    : turnEnded && savedThisTurn ? 'paused'
    : waiting ? 'working'
    : !active && terminal ? turnEnded ? 'finished' : 'idle'
    : active ? 'working' : 'idle'
  const todoStage = event.type === 'todo/write' || board.workflow !== state.board.workflow
    ? inferTodo(board.todos, board.workflow) ?? null : board.todoStage
  board = {
    ...board, status, needs, todoStage, interruption: status === 'interrupted' ? turnInterruption : null,
    finishedAt: status === 'finished' ? state.board.status === 'finished' ? state.board.finishedAt : at : null,
    gag: gag === undefined ? board.gag : {
      ...gag, at,
      id: JSON.stringify([board.sessionId, event.seq === undefined ? 'record' : 'seq', event.seq ?? ordinal]),
    },
    source: board.stage !== undefined ? 'reported' : todoStage !== null ? 'todo' : 'none',
    detail: needs === null && waiting ? `等 ${pendingChildren} 个助手回来`
      : board.stage !== undefined ? stageDetail : lastToolDetail,
    subagentCount: children.size,
    events: notable === undefined ? board.events : [...board.events, { type: event.type, at, detail: notable }].slice(-20),
  }
  return { board, pending, approvals, children, active, turnEnded, turnStartOrdinal, checkpointOrdinal, turnInterruption, lastToolDetail, stageDetail, ordinal, goalRef }
}

export function foldSession(events: Iterable<SessionRecord>): BoardSession {
  let state: FoldState | undefined
  for (const event of events) state = reduce(state, event)
  return (state ?? initial()).board
}

/** Fold attached sessions once; descendants belong to a root, never a second resident. */
export function foldBoard(logs: Iterable<Iterable<SessionRecord>>): BoardSession[] {
  const states: FoldState[] = []
  const children = new Map<string, FoldState[]>()
  for (const events of logs) {
    let state: FoldState | undefined
    for (const event of events) state = reduce(state, event)
    state ??= initial()
    states.push(state)
    const parent = state.board.parentSessionId
    if (parent !== null) {
      const siblings = children.get(parent)
      if (siblings) siblings.push(state)
      else children.set(parent, [state])
    }
  }

  const rollup = (state: FoldState): BoardSession => {
    const board = state.board
    let cost = board.cost
    for (const child of children.get(board.sessionId) ?? []) {
      const childCost = rollup(child).cost
      const createdAt = state.children.get(child.board.sessionId)?.createdAt ?? child.board.startedAt
      let workflow: string | null = null, stage = 'pre'
      // Only accepted movements change the active stage. Skipped/rejected rows
      // are not visits; catalog delivery can occur after the actual spawn time.
      for (const entry of board.history) {
        if (createdAt !== null && entry.at <= createdAt
          && (entry.kind === 'enter' || entry.kind === 'handoff' || entry.kind === 'rollback')) {
          workflow = entry.workflow
          stage = entry.stage
        }
      }
      cost = addCost(cost, { ...childCost, children: childCost.children + 1 }, workflow, stage)
    }
    return { ...board, cost }
  }
  // An orphan subtree has no attached root and contributes to no resident.
  return states.filter(state => state.board.parentSessionId === null).map(rollup)
}
