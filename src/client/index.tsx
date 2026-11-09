import { useEffect, useRef, useState } from 'react'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import { openFileFromMessage, sessionFromMessage, startSessionFromMessage, workspacesRequestFromMessage } from '../../board/navigation.js'
import { DELIVERY_SKILL, workflows } from '../shared/workflows.ts'
import type { ClientContext } from './dsh.ts'
import { NS, en, zh } from './locales.ts'

export const inject = ['slots', 'locale', 'uiWorkspace', 'workspaces', 'sessions', 'sidebarRight']
const PANEL_ID = 'pixel-town-pstack.town'
const ON_SCREEN_TIMEOUT_MS = 2000

type TownProps = {
  readonly openSession: ClientContext['uiWorkspace']['openSession']
  readonly openFile: (sessionId: string, path: string) => Promise<void>
  readonly startSession: ClientContext['uiWorkspace']['startSession']
  readonly workspaces: ClientContext['workspaces']
  readonly t: (key: string) => string
  readonly workspaceT: (key: string) => string
}

function PixelHouse({ size }: { readonly size: number; readonly active: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
    <path d="M2 10h4V6h4V2h4v4h4v4h4v12h-8v-8h-4v8H2V10Zm2 2v4h4v-4H4Zm12 0v4h4v-4h-4Z" />
  </svg>
}

/** Resolve once the right Sidebar names `sessionId` as the Session on screen; reject after the timeout. */
function onScreen(mounted: ClientContext['sidebarRight']['mounted'], sessionId: string): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  if (mounted.getSnapshot() === sessionId) {
    resolve()
    return promise
  }
  const timer = setTimeout(() => {
    unsubscribe()
    reject(new Error(`session ${sessionId} was not on screen within ${ON_SCREEN_TIMEOUT_MS} ms`))
  }, ON_SCREEN_TIMEOUT_MS)
  const unsubscribe = mounted.subscribe(() => {
    if (mounted.getSnapshot() !== sessionId) return
    clearTimeout(timer)
    unsubscribe()
    resolve()
  })
  return promise
}

function TownPage({ openSession, openFile, startSession, workspaces, t, workspaceT }: TownProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [failed, setFailed] = useState<'openFailed' | 'startFailed'>()
  useEffect(() => {
    const origin = window.location.origin
    const publishWorkspaces = (): void => {
      const target = frame.current?.contentWindow
      if (!target) return
      const defaultTitle = workspaceT('workspace.defaultName')
      target.postMessage({
        type: 'pixel-town-pstack/workspaces',
        items: workspaces.list.getSnapshot().items.map(workspace => ({
          id: workspace.workspaceId,
          // DSH's inline-only workspaceDisplayTitle helper is not in its module table.
          title: workspace.title === 'default-workspace'
            ? (defaultTitle === 'workspace.defaultName' ? '默认工作区' : defaultTitle)
            : workspace.title || workspace.path,
          path: workspace.path,
        })),
      }, origin)
    }
    const onMessage = (event: MessageEvent<unknown>): void => {
      const source = frame.current?.contentWindow ?? null
      if (workspacesRequestFromMessage(event, source, origin)) {
        publishWorkspaces()
        return
      }
      const start = startSessionFromMessage(event, source, origin)
      if (start !== undefined) {
        if (start.skill !== DELIVERY_SKILL && !workflows.some(workflow => workflow.skill === start.skill)) return
        if (start.workspaceId !== undefined
          && !workspaces.list.getSnapshot().items.some(workspace => workspace.workspaceId === start.workspaceId)) return
        try {
          startSession(start.workspaceId, { prompt: `/${start.skill} `, whenDraftExists: 'append' })
          setFailed(undefined)
        } catch (error) {
          console.error('[pixel-town-pstack] could not start session', error)
          setFailed('startFailed')
        }
        return
      }
      const file = openFileFromMessage(event, source, origin)
      if (file !== undefined) {
        openFile(file.sessionId, file.path).then(() => { setFailed(undefined) }, (error: unknown) => {
          console.error('[pixel-town-pstack] could not open file', error)
          setFailed('openFailed')
        })
        return
      }
      const sessionId = sessionFromMessage(event, source, origin)
      if (sessionId === undefined) return
      try {
        openSession(sessionId)
        setFailed(undefined)
      } catch (error) {
        console.error('[pixel-town-pstack] could not open session', error)
        setFailed('openFailed')
      }
    }
    window.addEventListener('message', onMessage)
    const unsubscribe = workspaces.list.subscribe(publishWorkspaces)
    publishWorkspaces()
    return () => {
      window.removeEventListener('message', onMessage)
      unsubscribe()
    }
  }, [openSession, openFile, startSession, workspaces, workspaceT])
  return <section aria-label={t('panel')} style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
    {failed && <p role="alert" style={{ margin: 0, padding: 12 }}>{t(failed)}</p>}
    <iframe ref={frame} title={t('panel')} src="/api/pixel-town-pstack/town/?embed=1" style={{ display: 'block', width: '100%', flex: 1, minHeight: 0, border: 0 }} />
  </section>
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pixel-town-pstack: dictionaries')
  const t = ctx.locale.bind(NS)
  const workspaceT = ctx.locale.bind('workspace')
  // ui-workspace owns session retention, persistence and revealing the conversation.
  const openSession = (sessionId: string): void => { ctx.uiWorkspace.openSession(sessionId) }
  // The Sidebar names an arriving Session before React renders it, and that render
  // mints the Session's sidebar store; open the file in a later task, after it.
  const openFile = async (sessionId: string, path: string): Promise<void> => {
    ctx.uiWorkspace.openSession(sessionId)
    await onScreen(ctx.sidebarRight.mounted, sessionId)
    const rendered = Promise.withResolvers<void>()
    setTimeout(rendered.resolve, 0)
    await rendered.promise
    // A later navigation took the screen: never open this file beside another Session.
    if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) return
    // Same address as DSH's own file links (ui-chat openFile), so an open tab is revealed, not duplicated.
    const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    ctx.sidebarRight.openResource(fileAddressFor(sessionId, cwd, path), { revealIfOpened: true })
  }
  const startSession: TownProps['startSession'] = (workspaceId, options): void => { ctx.uiWorkspace.startSession(workspaceId, options) }
  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ openSession, openFile, startSession, workspaces: ctx.workspaces, workspaceT }) },
    TownPage as never,
  ))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
    { name: 'sidebar.panellist', id: PANEL_ID, order: 6, locale: NS, label: () => t('panel') },
    PixelHouse as never,
  ))
}
