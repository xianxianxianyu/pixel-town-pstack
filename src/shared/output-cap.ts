import type { BoardSession } from './fold.ts'

/** CJK-conscious estimate, not a tokenizer: ceil(UTF-16 characters / 3). */
export function outputCapTokens(value: unknown = 3000): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > Math.floor(Number.MAX_SAFE_INTEGER / 3)) {
    throw new Error('pixel-town-pstack: outputCapTokens must be a non-negative safe integer with a safe character budget')
  }
  return value
}

// Persisted dsh-spill-policy notice convention; keep this runtime-independent so
// the offline estimator and host recognize the same historical locator notices.
const spillNotice = /(?:^|\n)(\((?:Omitted \d+ bytes\.|More bytes were omitted\.)?(?: Omitted \d+ images\.)? Full formatted result stored at: [\s\S]+\. [\s\S]+\))$/u

export function existingSpillNotice(text: string): string | undefined {
  return spillNotice.exec(text)?.[1]
}

export function shouldCapOutput(
  board: Pick<BoardSession, 'workflow' | 'status'>,
  name: string,
  text: string,
  cap: number,
): boolean {
  return cap > 0 && text.length > cap * 3 && board.workflow !== undefined && board.status !== 'finished'
    && name !== 'pstack_stage' && name !== 'pstack_pause'
}

/** Includes the notice in the budget; recovery must fit or nothing is hidden. */
export function outputPreview(
  text: string,
  name: string,
  recovery: { readonly locator: string; readonly retrievalHint: string } | string,
  cap: number,
): string | undefined {
  let notice: string
  if (typeof recovery === 'string') {
    // Existing full output is already recoverable: retain its exact notice,
    // and budget only the preview preceding it. Never spill a spill preview.
    notice = recovery
    text = text.slice(0, text.length - notice.length).trimEnd()
  } else {
    const hint = name === 'read'
      ? '请对原文件用 read 的 offset/limit 按需读取，不要读取此溢出路径'
      : recovery.retrievalHint.replace(/[\r\n\u2028\u2029]+/gu, ' ')
    notice = `（输出 ${text.length} 字符，只保留首尾；完整内容在 ${recovery.locator}，${hint}）`
  }
  const available = cap * 3 - notice.length
  if (available < 0) return undefined
  const gap = '\n[…]\n'
  const budget = Math.max(0, available - gap.length - 1)
  if (budget === 0) return notice
  let head = Math.ceil(budget / 2)
  let tail = text.length - Math.floor(budget / 2)
  // Never split a surrogate pair at either end of the omitted interval.
  if (/[\uD800-\uDBFF]/u.test(text.charAt(head - 1))) head--
  if (/[\uDC00-\uDFFF]/u.test(text.charAt(tail))) tail++
  return `${text.slice(0, head)}${gap}${text.slice(tail)}\n${notice}`
}
