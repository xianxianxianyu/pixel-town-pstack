import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SessionRecord } from '../shared/fold.ts'
import type { AllowedModel } from '../shared/model-roles.ts'

/** Only the rc.5 Host seams used here; no DSH runtime dependency is bundled. */
export interface Session {
  readonly id: string
  readonly header: { readonly id: string; readonly createdAt: number; readonly [key: string]: unknown }
  snapshotEvents(): readonly SessionRecord[]
  append(type: 'todo/write', data: {
    readonly todos: readonly { readonly content: string; readonly status: 'pending' | 'in_progress' | 'completed' }[]
  }): void
}

export interface ToolExecution {
  readonly callId: string
  readonly name: string
  readonly arguments: unknown
  readonly signal: AbortSignal
  readonly agent?: { readonly session: Session }
}

export type ContentBlock = { readonly type: string; readonly text?: string; readonly [key: string]: unknown }
export type PostToolDecision =
  | { readonly kind: 'accept'; readonly content?: readonly ContentBlock[]; readonly value?: never; readonly additionalContexts?: readonly unknown[] }
  | { readonly kind: 'accept'; readonly value: unknown; readonly content?: never; readonly additionalContexts?: readonly unknown[] }
  | { readonly kind: 'block'; readonly feedback: readonly ContentBlock[]; readonly additionalContexts?: readonly unknown[] }

export interface SpillStore {
  saveText(input: {
    readonly owner: { readonly sessionId: string }
    readonly source: { readonly kind: 'tool'; readonly toolName: string; readonly callId: string; readonly label: 'result' }
    readonly suggestedName: string
    readonly content: string
  }): Promise<{ readonly locator: string; readonly bytes: number; readonly retrievalHint: string }>
}

export interface Tool {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    readonly render: (args: unknown, value: string) => { type: 'text'; text: string }[]
  }
  readonly isConcurrencySafe: () => boolean
  execute(args: unknown, exec: { readonly signal: AbortSignal; readonly agent?: { readonly session: Session } }): Promise<string>
}

export interface Connection {
  readonly fetch: {
    register(route: {
      readonly path: string
      readonly methods: readonly ('GET' | 'PUT')[]
      readonly requestBody: 'buffered'
      readonly fetch: (request: Request) => Promise<Response>
    }): () => void
  }
}

export interface WebServer {
  register(route: {
    readonly kind: 'prefix'
    readonly path: string
    readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

export interface SkillCandidate {
  readonly name: string
  readonly description: string
  readonly invocation: { readonly modelInvocable: boolean; readonly userInvocable: boolean }
  readonly provider: string
  readonly source: 'bundled'
  readonly rank: number
  readonly resourceBase: { readonly kind: 'directory'; readonly path: string }
  readonly locator: string
  readonly path: string
}

interface UserMessage {
  readonly id: string
  readonly role: 'user'
  readonly source: { readonly kind: string; readonly name?: string; readonly form?: string }
  readonly content: readonly ContentBlock[]
}

type PreStepDecision =
  | { readonly kind: 'enter'; readonly messages: readonly UserMessage[] }
  | { readonly kind: 'reject' }

interface Commands {
  register(definition: {
    readonly name: string
    readonly description: string
    readonly input: { readonly hint: string }
    handler(invocation: {
      readonly rawInput: string
      readonly agent: {
        readonly session: Session
        readonly status: 'running' | 'idle'
        steer(message: UserMessage): void
        followup(message: UserMessage): void
      }
    }): { readonly kind: 'success' | 'error'; readonly text: string } | Promise<{ readonly kind: 'success' | 'error'; readonly text: string }>
  }): () => void
}

export interface HostContext {
  readonly tools: { register(tool: Tool): () => void }
  get(name: 'spillStore'): SpillStore | undefined
  get(name: 'subagentModelSelection'): {
    current(): { readonly enabled: boolean; readonly allowedModels: readonly AllowedModel[] }
  } | undefined
  get(name: 'llm'): {
    resolveModelInfo(provider: string, model: string): Promise<{
      readonly reasoning?: { readonly efforts: readonly { readonly id: string }[]; readonly defaultEffort?: string }
    }>
  } | undefined
  readonly logger: { warn(message: string): void }
  on(event: 'tools/post-execute', listener: (
    exec: ToolExecution,
    result: { readonly content: readonly ContentBlock[]; readonly isError: boolean },
    next: () => Promise<PostToolDecision>,
  ) => Promise<PostToolDecision>, options?: { readonly prepend: boolean }): () => void
  on(event: 'agent/pre-step', listener: (
    input: { readonly agent: { readonly session: Session }; readonly messages: readonly UserMessage[]; readonly signal: AbortSignal },
    next: () => Promise<PreStepDecision>,
  ) => Promise<PreStepDecision>, options?: { readonly prepend: boolean }): () => void
  readonly sessions: { list(): Session[] }
  readonly skills: {
    registerProvider(factory: () => {
      readonly name: string
      list(options: { readonly signal?: AbortSignal }): Promise<SkillCandidate[]>
      get(candidate: SkillCandidate, options: { readonly signal?: AbortSignal }): Promise<Omit<SkillCandidate, 'rank' | 'locator'> & { content: string }>
    }): () => void
  }
  inject(dependencies: readonly ['connection'], apply: (ctx: HostContext & { readonly connection: Connection }) => void): unknown
  inject(dependencies: readonly ['webServer'], apply: (ctx: HostContext & { readonly webServer: WebServer }) => void): unknown
  inject(dependencies: readonly ['commands'], apply: (ctx: HostContext & { readonly commands: Commands }) => void): unknown
  effect(callback: () => () => void, label: string): unknown
}
