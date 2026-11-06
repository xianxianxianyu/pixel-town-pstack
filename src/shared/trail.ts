import type { BoardSession, SessionRecord } from './fold.ts'

export interface CallEvidencePointer { readonly kind: 'call' | 'invocation'; readonly ref: string }
export type EvidencePointer = CallEvidencePointer | { readonly kind: 'file' | 'commit' | 'url'; readonly ref: string }
export interface TrailRow {
  readonly n: number
  readonly at: number
  readonly workflow: string
  readonly stage: string
  readonly decision: string
  readonly why: string
  readonly evidence: readonly EvidencePointer[]
  readonly result: string
  readonly supersedes?: number
  readonly supersededBy?: number
}
export interface AuditFinding {
  readonly kind: 'no-evidence' | 'claim-contradicts' | 'unlogged-pivot' | 'unlogged-change' | 'superseded'
  readonly rows?: readonly number[]
  readonly stage?: string
  readonly detail: string
}
export interface TrailReview { readonly at: number; readonly model: string; readonly flags: readonly { readonly text: string; readonly rows?: readonly number[] }[] }
export interface Trail {
  readonly on: boolean
  readonly rows: readonly TrailRow[]
  readonly audit: { readonly at: number; readonly findings: readonly AuditFinding[] } | null
  readonly review: TrailReview | null
}
export const trailEnabled = '工作日志：已开启。'
export const trailRules = [
  '## 工作日志（show-me-your-work）',
  '在决策、完成验证、转向/撤回、阻塞和修好关卡时用 pstack_log 记一行；循环每轮一行，不记流水账。',
  'evidence 必须是指针：在证明本行的测量、测试或命令后立即优先用 call:last:bash（宿主解析并回显 invocation:<ref>）；也可用 call:last、call:-<n>、call:<providerId>（仅按原始 provider id 取最后完成的调用）或 invocation:<ref>（仅按会话内唯一 ref）；file:<path>[:line]、commit:<sha>、url:<https url> 作补充。',
  '只追加不改删；错了用 supersedes:<旧行号> 追加纠正。交还前调用 pstack_audit，对照 transcript 补缺，发现不实就用 superseding 行纠正日志，不改故事；再审计。',
  '把返回的 TSV 和 transcript 两个路径交给配置的审查方 subagent（优先不同模型家族），检查证据薄弱、验证缺失/无证明、回看风险和用户易漏的缺口；结果到达后记录 pstack_audit({review:{model,flags:[{text,rows?}]}})。',
  '派出复核子 agent 后，只写一行说明正在等谁复核并结束回复；结果会自动送达，不要轮询、列出 agents、调用 wait 或 interrupt_agent 中断复核。',
  '最后以 Attention 结尾：独立一行 reviewed by <model>，再列指向行或时刻的 flags，或 No flags；同家族时写明“复核与干活同一模型家族”，不冒充跨模型；不能自审代替。',
].join('\n')
export const emptyTrail = (): Trail => ({ on: true, rows: [], audit: null, review: null })

export function recordObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export function recordText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map(recordObject).filter(block => block.type === 'text').map(block => String(block.text ?? '')).join('\n')
}
export function recordArgs(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return recordObject(value)
  try { return recordObject(JSON.parse(value)) } catch { return {} }
}

/** Accepted host results own rows; unrecognized historical results are ignored. */
export function foldTrailResult(previous: Trail | null, output: string): Trail | null {
  const value = recordArgs(output)
  const trail = previous ?? emptyTrail()
  if (value.row !== undefined) {
    const row = recordObject(value.row)
    const evidence = row.evidence ?? []
    if (!Number.isSafeInteger(row.n) || row.n !== (trail.rows.at(-1)?.n ?? 0) + 1 || typeof row.at !== 'number'
      || !['workflow', 'stage', 'decision', 'why', 'result'].every(key => typeof row[key] === 'string')
      || !Array.isArray(evidence) || !evidence.every(pointer => {
        const item = recordObject(pointer)
        return ['call', 'invocation', 'file', 'commit', 'url'].includes(String(item.kind)) && typeof item.ref === 'string'
      }) || (row.supersedes !== undefined && !trail.rows.some(old => old.n === row.supersedes))) return previous
    const accepted = { ...row, evidence } as unknown as TrailRow
    return { ...trail, rows: [...trail.rows.map(old => old.n === accepted.supersedes ? { ...old, supersededBy: accepted.n } : old), accepted] }
  }
  if (value.audit !== undefined) {
    const audit = recordObject(value.audit)
    if (typeof audit.at === 'number' && Array.isArray(audit.findings) && audit.findings.every(value => {
      const finding = recordObject(value)
      return ['no-evidence', 'claim-contradicts', 'unlogged-pivot', 'unlogged-change', 'superseded'].includes(String(finding.kind))
        && typeof finding.detail === 'string'
    })) return { ...trail, audit: audit as unknown as NonNullable<Trail['audit']> }
  }
  if (value.review !== undefined) {
    const review = recordObject(value.review)
    if (typeof review.at === 'number' && typeof review.model === 'string' && Array.isArray(review.flags)
      && review.flags.every(flag => typeof recordObject(flag).text === 'string')) return { ...trail, review: review as unknown as TrailReview }
  }
  return previous
}
export interface CommittedCall {
  readonly ref: string
  readonly providerId: string
  readonly name: string
  readonly args: Record<string, unknown>
  readonly output: string
  readonly isError: boolean
  readonly at: number
  readonly workflow?: string
  readonly stage?: string
}

function callKey(data: Record<string, unknown>, providerId: string): string {
  return JSON.stringify([data.turn, data.step, providerId])
}
function callRef(event: SessionRecord, key: string): string {
  return event.seq === undefined ? `tuple:${encodeURIComponent(key)}` : `seq:${event.seq}`
}

/** Pair by native turn/step/id, never infer an output from the next message. */
export function committedCalls(records: Iterable<SessionRecord>): CommittedCall[] {
  const calls: CommittedCall[] = []
  const pending = new Map<string, Omit<CommittedCall, 'output' | 'isError'>>()
  let workflow: string | undefined, stage: string | undefined
  for (const event of records) {
    const data = recordObject(event.data)
    if (event.type === 'session/end-seed' && data.inherited === true) {
      calls.length = 0; pending.clear(); workflow = undefined; stage = undefined
    } else if (event.type === 'tool/call') {
      const providerId = String(data.callId)
      const key = callKey(data, providerId)
      pending.set(key, {
        ref: callRef(event, key), providerId, name: String(data.name), args: recordArgs(data.arguments), at: event.time ?? 0, workflow, stage,
      })
    } else if (event.type === 'tool/result') {
      const message = recordObject(data.message)
      const key = callKey(data, String(message.toolCallId))
      const call = pending.get(key)
      if (!call) continue
      pending.delete(key)
      const result = { ...call, output: recordText(message.content), isError: message.isError === true }
      calls.push(result)
      if (call.name === 'pstack_stage' && message.isError === false) {
        workflow = typeof call.args.workflow === 'string' ? call.args.workflow : undefined
        stage = typeof call.args.stage === 'string' ? call.args.stage : undefined
      }
    }
  }
  return calls
}

/** Disjoint namespaces: invocation refs are unique; raw provider IDs retain last-match lookup. */
export function findCommittedCall(calls: readonly CommittedCall[], pointer: CallEvidencePointer): CommittedCall | undefined {
  return pointer.kind === 'invocation'
    ? calls.find(call => call.ref === pointer.ref)
    : calls.findLast(call => call.providerId === pointer.ref)
}

export function capText(text: string, limit: number): string {
  if (text.length <= limit) return text
  const marker = '\n[… capped; middle omitted …]\n'
  const head = Math.ceil((limit - marker.length) / 2)
  return text.slice(0, head) + marker + text.slice(-(limit - marker.length - head))
}
export function evidenceCall(records: Iterable<SessionRecord>, pointer: CallEvidencePointer) {
  const call = findCommittedCall(committedCalls(records), pointer)
  return call && { name: call.name, args: capText(JSON.stringify(call.args, null, 2), 2000), isError: call.isError, output: capText(call.output, 6000) }
}

const success = /\b(?:pass(?:ed)?|green|ok|fixed|success(?:ful)?)\b|通过|成功/iu
const negatedSuccess = /\b(?:not|no|never)\s+(?:pass(?:ed)?|green|ok|fixed|success(?:ful)?)\b|未通过|不通过|未成功|不成功/iu
const failure = /\bFAIL(?:ED)?\b|\bnot ok\b|\bfailed\b|\bError:/iu
const nonzeroExit = /\[exit code: [1-9]\d*\]\s*$/u
function failedOutput(output: string): boolean {
  // TAP/Node summaries report “fail 0”; zero failures are not contradictory evidence.
  return nonzeroExit.test(output) || failure.test(output.replace(/\b(?:fail(?:ed|ures?)?\s*[:=]?\s*0|0\s+(?:tests?\s+)?fail(?:ed|ures?)?)\b/giu, ''))
}
const fileTools: Readonly<Record<string, true>> = { write: true, edit: true, write_file: true, edit_file: true, apply_patch: true }
/** Findings are evidence to investigate, never gates or a replacement for review. */
export function auditTrail(board: BoardSession, records: Iterable<SessionRecord>): AuditFinding[] {
  const rows = board.trail?.rows ?? []
  const calls = committedCalls(records)
  const findings: AuditFinding[] = []
  for (const row of rows) {
    if (row.supersededBy !== undefined) {
      findings.push({ kind: 'superseded', rows: [row.n, row.supersededBy], detail: `第 ${row.n} 行已由第 ${row.supersededBy} 行纠正。` })
      continue
    }
    if (!row.evidence.length) findings.push({ kind: 'no-evidence', rows: [row.n], detail: `第 ${row.n} 行没有证据指针。` })
    if (success.test(row.result) && !negatedSuccess.test(row.result)) {
      for (const pointer of row.evidence) {
        if (pointer.kind !== 'call' && pointer.kind !== 'invocation') continue
        const call = findCommittedCall(calls, pointer)
        if (call && (call.isError || failedOutput(call.output))) {
          findings.push({ kind: 'claim-contradicts', rows: [row.n], detail: `第 ${row.n} 行声称成功，但 ${pointer.kind}:${pointer.ref} 显示失败。` })
        }
      }
    }
  }
  for (const entry of board.history) {
    if (['rollback', 'skip', 'handoff'].includes(entry.kind)
      && !rows.some(row => row.workflow === entry.workflow && row.stage === entry.stage && row.at >= entry.at && row.supersededBy === undefined)) {
      findings.push({ kind: 'unlogged-pivot', stage: entry.stage, detail: `${entry.workflow}/${entry.stage} 的 ${entry.kind}（${entry.at}）没有该时刻之后的日志。` })
    }
  }
  const changed = new Set<string>()
  for (const call of calls) {
    if (call.isError || nonzeroExit.test(call.output) || !call.workflow || !call.stage) continue
    const changing = Object.hasOwn(fileTools, call.name) || call.name === 'bash' && typeof call.args.command === 'string'
      && /(?:^|[;&|\n])\s*git\s+(?:-C\s+(?:"[^"]*"|'[^']*'|\S+)\s+)?(?:commit|revert|reset)\b/u.test(call.args.command)
    const key = `${call.workflow}/${call.stage}`
    if (changing && !changed.has(key) && !rows.some(row => row.workflow === call.workflow && row.stage === call.stage && row.supersededBy === undefined)) {
      changed.add(key)
      findings.push({ kind: 'unlogged-change', stage: call.stage, detail: `${key} 有成功的文件变更（invocation:${call.ref}），但没有日志。` })
    }
  }
  return findings
}

/** Match upstream log.sh: tr tabs/LF/CR to spaces, then guard formula-leading cells. */
export function tsvCell(value: string): string {
  const clean = value.replace(/[\t\n\r]/gu, ' ')
  return /^[=+@-]/u.test(clean) ? `'${clean}` : clean
}
export function exportTrail(rows: readonly TrailRow[]): string {
  return 'ts\tphase\tdecision\twhy\tevidence\tresult\n' + rows.map(row => [
    new Date(row.at).toISOString().replace(/\.\d{3}Z$/u, 'Z'), `${row.workflow}/${row.stage}`,
    row.decision, row.why, row.evidence.map(pointer => `${pointer.kind}:${pointer.ref}`).join('; '),
    `${row.result}${row.supersedes === undefined ? '' : ` (supersedes #${row.supersedes})`}`,
  ].map(tsvCell).join('\t')).map(line => `${line}\n`).join('')
}

function fence(text: string): string {
  const ticks = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/gu)].map(match => match[0].length + 1)))
  return `${ticks}\n${text}\n${ticks}`
}
export function renderTranscript(records: Iterable<SessionRecord>): string {
  const lines = ['# Session transcript', '', 'Reasoning omitted. Tool arguments capped at 2,000 characters; each result at 4,000 (head and tail).', 'invocation:<ref> identifies one invocation; call:<providerId> is a legacy provider ID (last committed match).', '']
  const pending = new Map<string, string>()
  for (const event of records) {
    const data = recordObject(event.data)
    if (event.type === 'session/end-seed' && data.inherited === true) pending.clear()
    else if (event.type === 'session') lines.push(`Session: ${event.id ?? ''}`, `Workspace: ${event.cwd ?? ''}`, '')
    else if (event.type === 'user/message' || event.type === 'assistant/message') {
      const message = event.type === 'assistant/message' ? recordObject(data.message) : data
      const text = recordText(message.content)
      if (text) lines.push(`## ${event.type === 'user/message' ? 'User' : 'Assistant'} · ${event.time}`, '', text, '')
    } else if (event.type === 'tool/call') {
      const key = callKey(data, String(data.callId)), ref = callRef(event, key)
      pending.set(key, ref)
      lines.push(`## Tool call ${data.callId} · ${data.name} · invocation:${ref} · call:${data.callId} · ${event.time}`, '', fence(capText(JSON.stringify(recordArgs(data.arguments), null, 2), 2000)), '')
    } else if (event.type === 'tool/result') {
      const message = recordObject(data.message)
      const key = callKey(data, String(message.toolCallId)), ref = pending.get(key)
      pending.delete(key)
      lines.push(`## Tool result ${message.toolCallId}${ref === undefined ? '' : ` · invocation:${ref}`} · call:${message.toolCallId} · isError=${message.isError} · ${event.time}`, '', fence(capText(recordText(message.content), 4000)), '')
    }
  }
  return lines.join('\n')
}
