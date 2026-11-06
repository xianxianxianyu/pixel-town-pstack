import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptyAssignments, modelRoles, parseAssignments, type ModelAssignments, type ModelSelection } from '../shared/model-roles.ts'
import type { HostContext } from './dsh.ts'

export async function readAssignments(root: string): Promise<{ assignments: ModelAssignments; error?: string }> {
  try {
    const stored: unknown = JSON.parse(await readFile(join(root, 'models.json'), 'utf8'))
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)
      || !('version' in stored) || stored.version !== 1 || !('roles' in stored)) {
      throw new Error('文件必须是 version: 1 的角色配置。')
    }
    return { assignments: parseAssignments(stored.roles) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { assignments: emptyAssignments() }
    return { assignments: emptyAssignments(), error: `无法读取模型分工 models.json：${error instanceof Error ? error.message : String(error)}` }
  }
}

export function modelSelection(ctx: HostContext): ModelSelection {
  const service = ctx.get('subagentModelSelection')
  return service ? { available: true, ...service.current() } : { available: false, enabled: false, allowedModels: [] }
}

export async function modelState(ctx: HostContext, root: string) {
  const selection = modelSelection(ctx)
  const llm = ctx.get('llm')
  const allowedModels = await Promise.all(selection.allowedModels.map(async route => {
    if (!llm) return route
    try {
      const info = await llm.resolveModelInfo(route.provider, route.model)
      return { ...route, ...(info.reasoning ? {
        reasoningEfforts: info.reasoning.efforts.map(effort => effort.id),
        ...(info.reasoning.defaultEffort === undefined ? {} : { defaultReasoningEffort: info.reasoning.defaultEffort }),
      } : {}) }
    } catch (error) {
      // A temporarily unavailable catalog must not hide authorized routes or saved assignments.
      ctx.logger.warn(`pixel-town-pstack: model catalog ${route.provider}/${route.model}: ${String(error)}`)
      return route
    }
  }))
  return { roles: modelRoles, ...await readAssignments(root), selection: { ...selection, allowedModels } }
}

export async function saveAssignments(root: string, assignments: ModelAssignments): Promise<void> {
  await mkdir(root, { recursive: true })
  const temporary = join(root, `.models.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify({ version: 1, roles: assignments }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, join(root, 'models.json'))
  } finally {
    await rm(temporary, { force: true })
  }
}
