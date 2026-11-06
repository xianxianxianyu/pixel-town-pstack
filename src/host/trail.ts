import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { BoardSession, SessionRecord } from '../shared/fold.ts'
import { auditTrail, committedCalls, exportTrail, findCommittedCall, recordObject, renderTranscript } from '../shared/trail.ts'
import type { EvidencePointer, TrailReview, TrailRow } from '../shared/trail.ts'

function oneLine(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\r\n\u2028\u2029]/u.test(value)) throw new Error(`${name} 必须是非空的一行文字。`)
  return value.trim()
}

export async function logTrail(raw: unknown, board: BoardSession, records: readonly SessionRecord[], signal: AbortSignal): Promise<string> {
  if (!board.workflow || !board.stage) throw new Error('当前会话没有进行中的 pstack 工作流，不能记录工作日志。')
  const input = recordObject(raw)
  const decision = oneLine(input.decision, 'decision'), why = oneLine(input.why, 'why'), result = oneLine(input.result, 'result')
  if (!Array.isArray(input.evidence) || !input.evidence.length) throw new Error('evidence 必须是非空的证据指针数组。')
  const evidence: EvidencePointer[] = []
  const calls = committedCalls(records)
  for (const value of input.evidence) {
    const pointer = oneLine(value, 'evidence')
    const separator = pointer.indexOf(':')
    const kind = pointer.slice(0, separator)
    let ref = pointer.slice(separator + 1)
    if (separator < 1 || !ref) throw new Error(`无效证据指针：${pointer}`)
    if (kind === 'call') {
      if (ref === 'last' || ref.startsWith('last:') || /^-\d+$/u.test(ref)) {
        const tool = ref.startsWith('last:') ? ref.slice(5) : undefined
        let remaining = ref.startsWith('-') ? Number(ref.slice(1)) : 1
        let resolved: string | undefined
        if (Number.isSafeInteger(remaining) && remaining > 0) {
          for (let i = calls.length - 1; i >= 0; i--) {
            const call = calls[i]!
            if (call.name.startsWith('pstack_') || (tool !== undefined && call.name !== tool)) continue
            if (--remaining === 0) { resolved = call.ref; break }
          }
        }
        if (resolved === undefined) throw new Error(`无法解析 ${pointer}：本会话没有匹配的已完成非 pstack_ 工具调用。`)
        ref = resolved
      } else {
        const call = findCommittedCall(calls, { kind, ref })
        if (!call) throw new Error(`call:${ref} 不是本会话已完成的工具调用。`)
        ref = call.ref
      }
      evidence.push({ kind: 'invocation', ref })
      continue
    } else if (kind === 'invocation') {
      if (!findCommittedCall(calls, { kind, ref })) throw new Error(`${pointer} 不是本会话已完成的工具调用。`)
    } else if (kind === 'file') {
      const path = ref.replace(/:[1-9]\d*$/u, '')
      if (!board.cwd && !path.startsWith('/')) throw new Error('会话缺少 cwd，不能解析相对文件证据。')
      try { await stat(resolve(board.cwd ?? '/', path)) } catch { throw new Error(`文件证据不存在：${ref}`) }
    } else if (kind === 'commit') {
      if (!/^[a-f\d]{7,40}$/iu.test(ref)) throw new Error('commit 证据必须是 7–40 位十六进制 SHA。')
    } else if (kind === 'url') {
      let url: URL
      try { url = new URL(ref) } catch { throw new Error('url 证据必须是 https URL。') }
      if (url.protocol !== 'https:' || !url.hostname) throw new Error('url 证据必须是 https URL。')
    } else throw new Error(`未知证据类型：${kind}`)
    evidence.push({ kind, ref })
  }
  if (input.supersedes !== undefined && (!Number.isSafeInteger(input.supersedes)
    || !board.trail?.rows.some(row => row.n === input.supersedes))) throw new Error('supersedes 必须是已有日志行号。')
  signal.throwIfAborted()
  const row: TrailRow = {
    n: (board.trail?.rows.at(-1)?.n ?? 0) + 1, at: Date.now(), workflow: board.workflow, stage: board.stage,
    decision, why, evidence, result, ...(input.supersedes === undefined ? {} : { supersedes: input.supersedes as number }),
  }
  return JSON.stringify({ row })
}

export function parseReview(raw: unknown, board: BoardSession): TrailReview {
  const input = recordObject(raw)
  const model = oneLine(input.model, 'review.model')
  if (!Array.isArray(input.flags)) throw new Error('review.flags 必须是数组；没有发现时传 []。')
  const flags = input.flags.map(value => {
    const flag = recordObject(value)
    if (typeof flag.text !== 'string' || !flag.text.trim()) throw new Error('review.flags.text 必须是非空文字。')
    const text = flag.text.trim()
    if (flag.rows !== undefined && (!Array.isArray(flag.rows) || !flag.rows.every(n => Number.isSafeInteger(n) && board.trail?.rows.some(row => row.n === n)))) {
      throw new Error('review.flags.rows 必须引用已有日志行号。')
    }
    return { text, ...(flag.rows === undefined ? {} : { rows: flag.rows as number[] }) }
  })
  return { at: Date.now(), model, flags }
}

async function atomicWrite(path: string, content: string, signal: AbortSignal): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', signal })
    signal.throwIfAborted()
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function saveAudit(root: string, raw: unknown, board: BoardSession, records: readonly SessionRecord[], signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  const input = recordObject(raw)
  if (input.review !== undefined) return JSON.stringify({ review: parseReview(input.review, board) })
  const id = board.sessionId
  if (!id || id === '.' || id === '..' || /[/\\\0]/u.test(id)) throw new Error('pstack_audit: invalid session id')
  const directory = join(root, 'trails')
  await mkdir(directory, { recursive: true })
  const tsv = join(directory, `${id}.tsv`), transcript = join(directory, `${id}.transcript.md`)
  await atomicWrite(tsv, exportTrail(board.trail?.rows ?? []), signal)
  await atomicWrite(transcript, renderTranscript(records), signal)
  return JSON.stringify({ audit: { at: Date.now(), findings: auditTrail(board, records) }, tsv, transcript })
}
