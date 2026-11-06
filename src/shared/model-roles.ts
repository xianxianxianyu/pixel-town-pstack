import { getWorkflow } from './workflows.ts'

export const modelRoles = [
  { id: 'worker', name: '干活的子 agent', usedBy: '探索、实现、解析大文件（委派工作的工作流）', maxRoutes: 1 },
  { id: 'reviewer', name: '审查方', usedBy: '代码审查；工作日志交还前审查；爆炸半径的可选第二意见', maxRoutes: 3 },
  { id: 'candidate', name: 'eval 候选', usedBy: 'eval 的候选执行者', maxRoutes: 4 },
  { id: 'judge', name: 'eval 评审', usedBy: 'eval 的匿名盲评', maxRoutes: 1 },
] as const

export type ModelRole = typeof modelRoles[number]['id']
export interface ModelRoute {
  readonly provider: string
  readonly model: string
  readonly reasoning_effort?: string
}
export interface AllowedModel {
  readonly provider: string
  readonly model: string
  readonly reasoningEfforts?: readonly string[]
  readonly defaultReasoningEffort?: string
}
export type ModelAssignments = Record<ModelRole, readonly ModelRoute[]>
export interface ModelSelection {
  readonly available: boolean
  readonly enabled: boolean
  readonly allowedModels: readonly AllowedModel[]
}

export function emptyAssignments(): ModelAssignments {
  return { worker: [], reviewer: [], candidate: [], judge: [] }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Provider/model identify a route; effort does not make a second model. */
function routeKey(route: Pick<ModelRoute, 'provider' | 'model'>): string {
  return JSON.stringify([route.provider, route.model])
}

export function parseAssignments(raw: unknown, selection?: ModelSelection): ModelAssignments {
  if (!object(raw) || Object.keys(raw).length !== modelRoles.length
    || Object.keys(raw).some(id => !modelRoles.some(role => role.id === id))) {
    throw new Error('assignments 必须包含 worker、reviewer、candidate、judge 四个角色数组。')
  }
  const assignments = emptyAssignments()
  for (const role of modelRoles) {
    const routes = raw[role.id]
    if (!Array.isArray(routes)) throw new Error(`${role.name}必须是模型数组。`)
    if (routes.length > role.maxRoutes) throw new Error(`${role.name}最多分配 ${role.maxRoutes} 个模型。`)
    const seen = new Set<string>()
    assignments[role.id] = routes.map((route: unknown) => {
      if (!object(route) || Object.keys(route).some(key => !['provider', 'model', 'reasoning_effort'].includes(key))
        || typeof route.provider !== 'string' || !route.provider.trim()
        || typeof route.model !== 'string' || !route.model.trim()
        || (route.reasoning_effort !== undefined && (typeof route.reasoning_effort !== 'string' || !route.reasoning_effort.trim()))) {
        throw new Error(`${role.name}的模型必须含非空 provider、model，reasoning_effort 可选。`)
      }
      const parsed: ModelRoute = {
        provider: route.provider, model: route.model,
        ...(route.reasoning_effort === undefined ? {} : { reasoning_effort: route.reasoning_effort as string }),
      }
      const key = routeKey(parsed)
      if (seen.has(key)) throw new Error(`${role.name}不能重复分配同一个模型。`)
      seen.add(key)
      if (selection?.enabled && !selection.allowedModels.some(allowed => routeKey(allowed) === key)) {
        throw new Error(`${role.name}的 ${parsed.provider}/${parsed.model} 不在 DSH 已勾选的可用模型中。`)
      }
      return parsed
    })
  }
  return assignments
}

/** Append only the roles this workflow consumes; ordinary empty workers cost no tokens. */
export function modelRoleBlock(workflow: string, assignments: ModelAssignments, selection: ModelSelection, optedIn = false): string {
  const trail = optedIn || getWorkflow(workflow).trail === true
  const roles: ModelRole[] = workflow === 'interrogate' || workflow === 'blast-radius' ? ['reviewer']
    : workflow === 'eval' ? ['candidate', 'judge'] : ['worker']
  if (trail && !roles.includes('reviewer')) roles.push('reviewer')
  const required = workflow === 'interrogate' || workflow === 'eval'
  const lines: string[] = []
  for (const id of roles) {
    const assigned = assignments[id]
    if (!assigned.length && !required && !(trail && id === 'reviewer')) continue
    const name = modelRoles.find(role => role.id === id)!.name
    const reason = !selection.available ? '当前宿主未提供模型选择'
      : !selection.enabled ? '模型选择未开启'
      : !assigned.length ? '未分配模型'
      : assigned.some(route => !selection.allowedModels.some(allowed => routeKey(allowed) === routeKey(route))) ? '分配的模型已不在 DSH 可用列表中' : undefined
    const seats = workflow === 'interrogate' ? `派 ${assigned.length || 2} 个审查方，都用默认模型`
      : id === 'candidate' ? `派 ${assigned.length || 1} 个候选，都用默认模型` : '用默认模型'
    if (reason) {
      lines.push(id === 'judge'
        ? `${name}：${reason}；不派同模型或同家族评审；无其他可用家族时跳过独立盲评，并在回复里写明限制。`
        : `${name}：${reason}；${seats}，并在回复里写明没有换模型。`)
      continue
    }
    const routes = assigned.map(route => {
      const allowed = selection.allowedModels.find(allowed => routeKey(allowed) === routeKey(route))
      const defaultIndex = allowed?.reasoningEfforts?.indexOf(allowed.defaultReasoningEffort ?? '') ?? -1
      const lowered = route.reasoning_effort === undefined && id === 'reviewer'
        && (trail || workflow === 'interrogate') && defaultIndex > 0
      const effort = route.reasoning_effort ?? (lowered ? allowed!.reasoningEfforts![defaultIndex - 1] : undefined)
      return { effort, text: `${route.provider}/${route.model}${effort ? `（reasoning_effort=${effort}${lowered ? '，比该模型默认低一档' : ''}）` : ''}` }
    })
    const count = id === 'candidate' || workflow === 'interrogate' ? `，每条配置派 1 个，共 ${assigned.length} 个，不增减席位` : ''
    const fallback = id === 'judge'
      ? '评审不得与任何候选同模型或同家族；没有这些字段、调用被拒或无独立家族时，跳过独立盲评并在回复里写明限制。'
      : `没有这些字段或调用被拒时，${seats}，并在回复里写明没有换模型。`
    lines.push(`${name}用 ${routes.map(route => route.text).join('、')}${count}；在 subagent 调用里填 provider 和 model${routes.some(route => route.effort) ? '，并填上述 reasoning_effort' : ''}。${fallback}`)
  }
  return lines.length ? `子 agent 模型（小镇告示牌 → 模型分工）：${lines.join('\n')}` : ''
}
