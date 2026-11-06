import type { ComponentType } from 'react'

/** The fields read from the public Workspace Controller snapshot. */
export interface WorkspaceView {
  readonly workspaceId: string
  readonly title: string
  readonly path: string
}

export interface Workspaces {
  readonly list: {
    getSnapshot(): { readonly items: readonly WorkspaceView[] }
    subscribe(listener: () => void): () => void
  }
}

export interface StartSessionOptions {
  readonly prompt: string
  readonly whenDraftExists: 'append'
}

/** The public DSH rc.5 browser services consumed by this plugin. */
export interface ClientContext {
  readonly slots: {
    inject(owner: string, install: () => unknown): unknown
    register(options: {
      readonly name: string
      readonly id?: string
      readonly key?: string
      readonly order?: number
      readonly locale?: string
      readonly label?: () => string
      readonly inject?: () => object
    }, component: ComponentType<never>): () => void
  }
  readonly locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): (key: string) => string
  }
  readonly workspaces: Workspaces
  /** Public ui-workspace/client UiWorkspace capability, not its private navigation state. */
  readonly uiWorkspace: {
    openSession(sessionId: string): void
    startSession(workspaceId?: string, options?: StartSessionOptions): void
  }
  effect(install: () => (() => void) | void, label?: string): () => void
}
