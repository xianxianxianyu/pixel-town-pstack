import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BoardSession } from '../shared/fold.ts'

interface Resume {
  readonly intent: string
  readonly done: string
  readonly state: string
  readonly next: string
  readonly files: readonly string[]
  readonly gotchas?: string
  readonly uncommitted: readonly string[]
}

export interface PauseInput {
  readonly waiting_for: string
  readonly reason: 'handback' | 'requested'
  readonly resume: Resume
}

export function parsePauseInput(raw: unknown): PauseInput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('pstack_pause 参数必须是对象。')
  const input = raw as Record<string, unknown>
  if (typeof input.waiting_for !== 'string' || !input.waiting_for.trim() || /[\r\n\u2028\u2029]/u.test(input.waiting_for)) {
    throw new Error('waiting_for 必须是非空的一行文字。')
  }
  if (input.reason !== 'handback' && input.reason !== 'requested') throw new Error('reason 必须是 handback 或 requested。')
  if (typeof input.resume !== 'object' || input.resume === null || Array.isArray(input.resume)) throw new Error('resume 必须是对象。')
  const resume = input.resume as Record<string, unknown>
  for (const key of ['intent', 'done', 'state', 'next'] as const) {
    if (typeof resume[key] !== 'string' || !resume[key].trim()) throw new Error(`resume.${key} 必须是非空文字。`)
  }
  for (const key of ['files', 'uncommitted'] as const) {
    if (!Array.isArray(resume[key]) || !resume[key].every(value => typeof value === 'string' && value.trim())) {
      throw new Error(`resume.${key} 必须是路径数组（可以为空）。`)
    }
  }
  if (resume.gotchas !== undefined && typeof resume.gotchas !== 'string') throw new Error('resume.gotchas 必须是文字。')
  return { waiting_for: input.waiting_for.trim(), reason: input.reason, resume: resume as unknown as Resume }
}

/** Only the readable copy lives here; the accepted tool result owns checkpoint state. */
export async function savePause(root: string, board: BoardSession, input: PauseInput, signal: AbortSignal): Promise<string> {
  const id = board.sessionId
  if (!id || id === '.' || id === '..' || /[/\\\0]/u.test(id)) throw new Error('pstack_pause: invalid session id')
  const directory = join(root, 'resume')
  const path = join(directory, `${id}.md`)
  const temporary = join(directory, `.${id}.${randomUUID()}.tmp`)
  const { resume } = input
  const list = (paths: readonly string[]) => paths.length ? paths.map(path => `- ${path}`).join('\n') : '（无）'
  const markdown = [
    '# 续接存档', '', `会话：${id}`, `工作流：${board.workflow} / ${board.stage}`, `存档时间：${new Date().toISOString()}`,
    `原因：${input.reason}`, `等你：${input.waiting_for}`, '',
    '## 意图', resume.intent, '', '## 已完成', resume.done, '', '## 当前状态', resume.state, '',
    '## 下一步', resume.next, '', '## 相关文件', list(resume.files), '', '## 注意事项', resume.gotchas || '（无）', '',
    '## 未提交改动（git status --short；只列出，不改动）', list(resume.uncommitted), '',
    '存档不提交、不 stash、不修改代码。已提交的 pstack_pause 工具调用是事实来源；本文件是最新存档的可读副本。', '',
  ].join('\n')
  signal.throwIfAborted()
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temporary, markdown, { encoding: 'utf8', flag: 'wx', signal })
    signal.throwIfAborted()
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
  return `${path}\n已存档；现在结束回复；需要人做决定时先用 ask_user_question 提问。`
}
