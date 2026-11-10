import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import {
  openFileFromMessage, openSessionLink, requestOpenFile, sessionFromMessage, startSessionFromMessage,
  workspacesFromMessage, workspacesRequestFromMessage,
} from '../board/navigation.js'
import { workflows } from '../lib/workflows.js'

const origin = 'http://127.0.0.1:3998'
const request = { type: 'pixel-town-pstack/open-session', sessionId: 'session-example' }
const workspaceRequest = { type: 'pixel-town-pstack/workspaces' }
const startRequest = { type: 'pixel-town-pstack/start-session', skill: 'example-skill' }
const workspaceItem = { id: 'workspace-project', title: 'Project', path: '/projects/project' }
const fileRequest = { type: 'pixel-town-pstack/open-file', sessionId: 'session-example', path: 'docs/flow.mmd' }

function assertTrustedSender(validate, data, rejected) {
  const frame = {}
  const event = { origin, source: frame, data }
  assert.equal(validate({ ...event, origin: 'https://other.example' }, frame, origin), rejected)
  assert.equal(validate({ ...event, source: {} }, frame, origin), rejected)
  assert.equal(validate({ ...event, source: null }, frame, origin), rejected)
  assert.equal(validate({ ...event, source: null }, null, origin), rejected)
}

test('embedded links post the session to the exact same-origin parent without storage or new tabs', () => {
  const sent = []
  let prevented = false
  const environment = {
    location: { origin, search: '?embed=1' },
    parent: { location: { origin }, postMessage: (...args) => sent.push(args) },
    localStorage: { setItem: () => assert.fail('embedded navigation must not write storage') },
  }
  openSessionLink('session-example', { preventDefault: () => { prevented = true } }, environment)
  assert.equal(prevented, true)
  assert.deepEqual(sent, [[request, origin]])
  environment.parent.location.origin = 'https://other.example'
  assert.throws(() => openSessionLink('session-example', { preventDefault() {} }, environment), /own DSH origin/)
  assert.equal(sent.length, 1)
  Object.defineProperty(environment.parent, 'location', { get() { throw new Error('Blocked cross-origin access') } })
  assert.throws(() => openSessionLink('session-example', { preventDefault() {} }, environment), /cross-origin/)
  assert.equal(sent.length, 1)
})

test('standalone links preserve DSH startup selection and native new-tab behavior, even with embed in the URL', () => {
  for (const search of ['', '?embed=1']) {
    const writes = []
    const environment = { location: { origin, search }, localStorage: { setItem: (...args) => writes.push(args) } }
    environment.parent = environment
    openSessionLink('session-example', { preventDefault: () => assert.fail('standalone link should navigate normally') }, environment)
    assert.deepEqual(writes, [['dsh.sessions.current', '{"sessionId":"session-example"}']])
  }
})

test('parent accepts only the current same-origin iframe and the open-session payload shape', () => {
  const frame = {}
  const valid = { origin, source: frame, data: request }
  assert.equal(sessionFromMessage(valid, frame, origin), 'session-example')
  for (const data of [null, [], 'session-example', {}, { type: 'other', sessionId: 'session-example' },
    { type: request.type }, { ...request, sessionId: 7 }, { ...request, sessionId: '' }, { ...request, sessionId: '  ' },
    { ...request, extra: true }, Object.create(request)]) {
    assert.equal(sessionFromMessage({ ...valid, data }, frame, origin), undefined)
  }
  assert.equal(sessionFromMessage({ ...valid, origin: 'https://other.example' }, frame, origin), undefined)
  assert.equal(sessionFromMessage({ ...valid, source: {} }, frame, origin), undefined)
  assert.equal(sessionFromMessage({ ...valid, source: null }, null, origin), undefined)
})

test('start-session validates exact shapes without choosing skills or normalizing identities', () => {
  const frame = {}
  const event = { origin, source: frame, data: startRequest }
  assert.deepEqual(startSessionFromMessage(event, frame, origin), { skill: 'example-skill' })
  assert.deepEqual(startSessionFromMessage({
    ...event, data: { ...startRequest, workspaceId: 'workspace-project' },
  }, frame, origin), { skill: 'example-skill', workspaceId: 'workspace-project' })
  assert.deepEqual(startSessionFromMessage({
    ...event, data: { ...startRequest, skill: ' padded ', workspaceId: ' padded ' },
  }, frame, origin), { skill: ' padded ', workspaceId: ' padded ' })
  for (const data of [
    null, undefined, [], 'example-skill', {}, { type: 'other', skill: 'example-skill' },
    { type: startRequest.type }, { ...startRequest, extra: true }, Object.create(startRequest),
    ...[null, undefined, 7, '', ' \t\n', {}, []].map(skill => ({ ...startRequest, skill })),
    ...[null, undefined, 7, '', ' \t\n', {}, []].map(workspaceId => ({ ...startRequest, workspaceId })),
    { ...startRequest, workspaceId: 'workspace-project', submit: true },
  ]) {
    assert.equal(startSessionFromMessage({ ...event, data }, frame, origin), undefined)
  }
  assertTrustedSender(startSessionFromMessage, startRequest, undefined)
})

test('workspace requests accept only an exact type-only message from the current iframe', () => {
  const frame = {}
  const event = { origin, source: frame, data: workspaceRequest }
  assert.equal(workspacesRequestFromMessage(event, frame, origin), true)
  for (const data of [
    null, undefined, [], 'pixel-town-pstack/workspaces', {}, { type: 'other' },
    { ...workspaceRequest, items: [] }, { ...workspaceRequest, extra: true }, Object.create(workspaceRequest),
  ]) {
    assert.equal(workspacesRequestFromMessage({ ...event, data }, frame, origin), false)
  }
  assertTrustedSender(workspacesRequestFromMessage, workspaceRequest, false)
})

test('workspace responses require an exact parent message and fully valid id/title/path rows', () => {
  const parent = {}
  const items = [workspaceItem, { id: 'workspace-home', title: 'Default workspace', path: '/home/default-workspace' }]
  const event = { origin, source: parent, data: { ...workspaceRequest, items } }
  assert.equal(workspacesFromMessage(event, parent, origin), items, 'validation must not copy the projection')
  assert.deepEqual(workspacesFromMessage({ ...event, data: { ...workspaceRequest, items: [] } }, parent, origin), [])
  const invalidRows = [null, undefined, [], 'workspace-project', {}, Object.create(workspaceItem), { ...workspaceItem, extra: true }]
  for (const key of ['id', 'title', 'path']) {
    const missing = { ...workspaceItem }
    delete missing[key]
    invalidRows.push(missing)
    for (const value of [null, undefined, 7, '', ' \t\n', {}, []]) invalidRows.push({ ...workspaceItem, [key]: value })
  }
  for (const data of [
    null, undefined, [], 'workspaces', {}, workspaceRequest, { type: 'other', items },
    { ...workspaceRequest, items: null }, { ...workspaceRequest, items: {} },
    { ...workspaceRequest, items, extra: true }, Object.create(event.data),
    ...invalidRows.map(item => ({ ...workspaceRequest, items: [workspaceItem, item] })),
  ]) {
    assert.equal(workspacesFromMessage({ ...event, data }, parent, origin), undefined)
  }
  assertTrustedSender(workspacesFromMessage, event.data, undefined)
})

test('open-file requests go to the parent at the town origin and are accepted only in their exact shape', () => {
  const sent = []
  const environment = { location: { origin, search: '?embed=1' }, parent: { postMessage: (...args) => sent.push(args) } }
  requestOpenFile('session-example', 'docs/flow.mmd', environment)
  assert.deepEqual(sent, [[fileRequest, origin]])
  const frame = {}
  const event = { origin, source: frame, data: fileRequest }
  assert.deepEqual(openFileFromMessage(event, frame, origin), { sessionId: 'session-example', path: 'docs/flow.mmd' })
  assert.deepEqual(openFileFromMessage({ ...event, data: { ...fileRequest, path: ' /abs path/图 1.mmd ' } }, frame, origin),
    { sessionId: 'session-example', path: ' /abs path/图 1.mmd ' }, 'the path is passed on unchanged')
  for (const data of [
    null, undefined, [], 'docs/flow.mmd', {}, { type: 'other', sessionId: 'session-example', path: 'a.mmd' },
    request, { type: fileRequest.type, sessionId: 'session-example' }, { type: fileRequest.type, path: 'a.mmd' },
    { ...fileRequest, extra: true }, Object.create(fileRequest),
    ...[null, undefined, 7, '', ' \t\n', {}, []].flatMap(value => [{ ...fileRequest, path: value }, { ...fileRequest, sessionId: value }]),
  ]) {
    assert.equal(openFileFromMessage({ ...event, data }, frame, origin), undefined)
  }
  assertTrustedSender(openFileFromMessage, fileRequest, undefined)
  assert.equal(sessionFromMessage(event, frame, origin), undefined, 'an open-file request never opens only the session')
})

// Exercise the package's built artifact and loader contract, never a separately compiled test entry.
async function mountPublishedClient(t, { defaultTitle = 'Default workspace' } = {}) {
  const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const require = createRequire(import.meta.url)
  const sent = []
  const frame = { postMessage: (data, targetOrigin) => sent.push([structuredClone(data), targetOrigin]) }
  const frameRef = { current: { contentWindow: frame } }
  const effects = []
  const errors = []
  const window = Object.assign(new EventTarget(), { location: { origin } })
  let loaded
  let failure
  window.__ModuleLoader__ = { load: module => { loaded = module } }
  // Late-bound timers, so a test's mock.timers governs the bundle as well.
  runInNewContext(bundle, {
    window, console: { ...console, error: (...args) => errors.push(args) }, URLSearchParams,
    setTimeout: (...args) => setTimeout(...args), clearTimeout: (...args) => clearTimeout(...args),
  })
  assert.equal(loaded.id, metadata.name)
  const client = loaded.factory(id => {
    assert.ok(['react', 'react/jsx-runtime'].includes(id), `unexpected runtime dependency: ${id}`)
    if (id === 'react') return {
      ...require(id),
      useRef: () => frameRef,
      useState: () => [failure, value => { failure = value }],
      useEffect: install => effects.push(install),
    }
    return require(id)
  })
  assert.deepEqual(Array.from(client.inject), ['slots', 'locale', 'uiWorkspace', 'workspaces', 'sessions', 'sidebarRight'])
  const registrations = []
  const dictionaries = []
  const opened = []
  const started = []
  const resources = []
  const listeners = new Set()
  const screenListeners = new Set()
  let unsubscribed = 0
  let screen
  let snapshot = { items: [{ workspaceId: 'workspace-project', title: 'Project', path: '/projects/project' }] }
  const ctx = {
    effect: install => install(),
    slots: {
      inject: (owner, install) => { assert.ok(['main', 'sidebar.panellist'].includes(owner)); return install() },
      register: (options, component) => { registrations.push({ options, component }); return () => {} },
    },
    locale: {
      register: (namespace, dictionary) => { dictionaries.push({ namespace, dictionary }); return () => {} },
      bind: namespace => {
        assert.ok(['pixel-town-pstack', 'workspace'].includes(namespace))
        return key => namespace === 'workspace'
          ? (assert.equal(key, 'workspace.defaultName'), defaultTitle)
          : dictionaries[0].dictionary.zh[key]
      },
    },
    workspaces: {
      list: {
        getSnapshot() { assert.equal(this, ctx.workspaces.list); return snapshot },
        subscribe(listener) {
          assert.equal(this, ctx.workspaces.list)
          listeners.add(listener)
          return () => { unsubscribed++; listeners.delete(listener) }
        },
      },
    },
    uiWorkspace: {
      openSession(sessionId) { assert.equal(this, ctx.uiWorkspace); opened.push(sessionId) },
      startSession(workspaceId, options) {
        assert.equal(this, ctx.uiWorkspace)
        started.push([workspaceId, structuredClone(options)])
      },
    },
    sessions: {
      list: {
        getSnapshot() {
          assert.equal(this, ctx.sessions.list)
          return { byId: { 'session-example': { cwd: '/projects/project' }, 'session-unknown-cwd': {} } }
        },
      },
    },
    sidebarRight: {
      mounted: {
        getSnapshot() { assert.equal(this, ctx.sidebarRight.mounted); return screen },
        subscribe(listener) {
          assert.equal(this, ctx.sidebarRight.mounted)
          screenListeners.add(listener)
          return () => { screenListeners.delete(listener) }
        },
      },
      openResource(address, options) { assert.equal(this, ctx.sidebarRight); resources.push([address, structuredClone(options)]) },
    },
  }
  client.apply(ctx)
  const main = registrations.find(entry => entry.options.name === 'main')
  const props = { ...main.options.inject(), t: ctx.locale.bind('pixel-town-pstack') }
  const render = () => main.component(props)
  const page = render()
  assert.equal(effects.length, 1)
  let cleanup = effects[0]()
  const unmount = () => { cleanup?.(); cleanup = undefined }
  t.after(unmount)
  const send = (data, source = frame, messageOrigin = origin) =>
    window.dispatchEvent(Object.assign(new Event('message'), { data, source, origin: messageOrigin }))
  return {
    metadata, main, registrations, dictionaries, ctx, page, render, frame, frameRef, send,
    sent, opened, started, resources, errors, listeners, screenListeners, unmount,
    get unsubscribed() { return unsubscribed },
    get failure() { return failure },
    updateWorkspaces(items, notify = true) {
      snapshot = { items }
      if (notify) for (const listener of listeners) listener()
    },
    // The Sidebar names the Session on screen and notifies synchronously, as DSH's snapshot store does.
    showSession(sessionId) {
      screen = sessionId
      for (const listener of [...screenListeners]) listener()
    },
  }
}

test('published client registers DSH slots and preserves open-session navigation and errors', async t => {
  const runtime = await mountPublishedClient(t)
  const { metadata, main, registrations, dictionaries, page, send, frame, opened, ctx, errors, render } = runtime
  assert.equal(metadata.exports['./client'], './lib/client.js')
  assert.equal(metadata.dsh.client.platform, 'web')
  assert.ok(metadata.files.includes('lib') || metadata.files.includes('lib/client.js'))
  assert.ok(metadata.files.includes('board'))
  assert.equal(import.meta.resolve('dsh-pixel-town-pstack/client'), new URL('../lib/client.js', import.meta.url).href)
  assert.equal(dictionaries[0].namespace, 'pixel-town-pstack')
  assert.equal(dictionaries[0].dictionary.en.panel, 'Pixel Town')
  const sidebar = registrations.find(entry => entry.options.name === 'sidebar.panellist')
  assert.equal(sidebar.options.id, main.options.key)
  assert.equal(sidebar.options.label(), '像素小镇')
  assert.equal(sidebar.component({ size: 20, active: true }).type, 'svg')
  const iframe = page.props.children.find(child => child?.type === 'iframe')
  assert.equal(iframe.props.src, '/api/pixel-town-pstack/town/?embed=1')
  assert.equal(iframe.props.title, '像素小镇')
  send(request, {}, origin)
  send(request, frame, 'https://other.example')
  send({ type: request.type, sessionId: null })
  send({ ...request, extra: true })
  assert.deepEqual(opened, [])
  send(request)
  assert.deepEqual(opened, ['session-example'])
  const openSession = ctx.uiWorkspace.openSession
  const error = new Error('cannot open')
  ctx.uiWorkspace.openSession = () => { throw error }
  send(request)
  assert.equal(errors[0][0], '[pixel-town-pstack] could not open session')
  assert.equal(errors[0][1], error)
  assert.equal(render().props.children.find(child => child?.props?.role === 'alert').props.children, dictionaries[0].dictionary.zh.openFailed)
  ctx.uiWorkspace.openSession = openSession
  send(request)
  assert.equal(render().props.children.some(child => child?.props?.role === 'alert'), false)
})

test('published client answers workspace requests, pushes current snapshots, and tears down both subscriptions', async t => {
  const runtime = await mountPublishedClient(t)
  const { send, frame, sent, opened, started, listeners, frameRef } = runtime
  assert.equal(listeners.size, 1)
  assert.deepEqual(sent, [[{ ...workspaceRequest, items: [workspaceItem] }, origin]])
  sent.length = 0
  send(workspaceRequest, {}, origin)
  send(workspaceRequest, frame, 'https://other.example')
  send({ ...workspaceRequest, items: [] })
  send({ type: 'other' })
  assert.deepEqual(sent, [])
  send(workspaceRequest)
  assert.deepEqual(sent, [[{ ...workspaceRequest, items: [workspaceItem] }, origin]])
  runtime.updateWorkspaces([
    { workspaceId: 'default', title: 'default-workspace', path: '/home/default-workspace' },
    { workspaceId: 'renamed', title: 'My workspace', path: '/projects/renamed' },
    { workspaceId: 'untitled', title: '', path: '/projects/untitled' },
  ])
  assert.deepEqual(sent.at(-1), [{ ...workspaceRequest, items: [
    { id: 'default', title: 'Default workspace', path: '/home/default-workspace' },
    { id: 'renamed', title: 'My workspace', path: '/projects/renamed' },
    { id: 'untitled', title: '/projects/untitled', path: '/projects/untitled' },
  ] }, origin])
  runtime.updateWorkspaces([])
  assert.deepEqual(sent.at(-1), [{ ...workspaceRequest, items: [] }, origin])
  const replacementSent = []
  const replacement = { postMessage: (...args) => replacementSent.push(structuredClone(args)) }
  frameRef.current = { contentWindow: replacement }
  const count = sent.length
  send(workspaceRequest)
  send(request)
  assert.equal(sent.length, count)
  assert.deepEqual(opened, [])
  send(workspaceRequest, replacement)
  assert.deepEqual(replacementSent, [[{ ...workspaceRequest, items: [] }, origin]])
  runtime.unmount()
  assert.equal(runtime.unsubscribed, 1)
  assert.equal(listeners.size, 0)
  send(request, replacement)
  send({ type: startRequest.type, skill: workflows[0].skill }, replacement)
  send(workspaceRequest, replacement)
  runtime.updateWorkspaces([{ workspaceId: 'later', title: 'Later', path: '/later' }])
  assert.deepEqual(opened, [])
  assert.deepEqual(started, [])
  assert.equal(sent.length, count)
  assert.equal(replacementSent.length, 1)
})

test('published client uses the localized default title fallback when DSH returns the locale key', async t => {
  const runtime = await mountPublishedClient(t, { defaultTitle: 'workspace.defaultName' })
  runtime.updateWorkspaces([{ workspaceId: 'default', title: 'default-workspace', path: '/home/default-workspace' }])
  assert.deepEqual(runtime.sent.at(-1), [{
    ...workspaceRequest,
    items: [{ id: 'default', title: '默认工作区', path: '/home/default-workspace' }],
  }, origin])
})

test('published client starts only manifest or delivery skills and currently registered workspaces without submitting', async t => {
  const runtime = await mountPublishedClient(t)
  const { send, frame, started } = runtime
  const skill = workflows[0].skill
  const valid = { type: startRequest.type, skill, workspaceId: 'workspace-project' }
  send(valid, {}, origin)
  send(valid, frame, 'https://other.example')
  for (const data of [
    { type: 'other', skill }, { ...valid, submit: true }, { ...valid, workspaceId: 'missing' },
    { ...valid, workspaceId: ' workspace-project ' }, { ...valid, workspaceId: null },
    ...[null, undefined, 1, '', ' ', 'uninstalled-skill', `/${skill}`, `${skill} `, `${skill}\nother-command`]
      .map(value => ({ ...valid, skill: value })),
  ]) send(data)
  assert.deepEqual(started, [])
  const skills = ['pstack-bug-fix', 'pstack-runtime-forensics', 'pstack-feature', 'pstack-investigation', 'pstack-perf-issue', 'pstack-trace-forensics', 'pstack-blast-radius', 'pstack-refactoring', 'pstack-prototype', 'pstack-hillclimb', 'pstack-interrogate', 'pstack-multi-phase-plan', 'pstack-eval', 'pstack-create-verification-skill', 'pstack-maintain-verification-skill', 'pstack-create-formal-verification-skill', 'pstack-maintain-formal-verification-skill', 'pstack-figure-it-out']
  assert.deepEqual(workflows.map(workflow => workflow.skill).sort(), skills.toSorted())
  for (const skill of [...skills, 'pstack-opening-a-pr']) {
    send({ ...valid, skill })
    assert.deepEqual(started.at(-1), ['workspace-project', { prompt: `/${skill} `, whenDraftExists: 'append' }])
  }
  send({ type: startRequest.type, skill })
  assert.deepEqual(started.at(-1), [undefined, { prompt: `/${skill} `, whenDraftExists: 'append' }])
  const count = started.length
  // Snapshot reads must authorize against removal even before its notification is delivered.
  runtime.updateWorkspaces([{ workspaceId: 'new-workspace', title: 'New', path: '/new' }], false)
  send(valid)
  assert.equal(started.length, count)
  send({ ...valid, workspaceId: 'new-workspace' })
  assert.deepEqual(started.at(-1), ['new-workspace', { prompt: `/${skill} `, whenDraftExists: 'append' }])
  runtime.updateWorkspaces([])
  send({ ...valid, workspaceId: 'new-workspace' })
  assert.equal(started.length, count + 1)
  send({ type: startRequest.type, skill })
  assert.deepEqual(started.at(-1), [undefined, { prompt: `/${skill} `, whenDraftExists: 'append' }])
  assert.deepEqual(runtime.opened, [], 'starting must not take the open-existing-session path')
})

test('published client logs start failures, displays its dedicated localized alert, and clears it on success', async t => {
  const runtime = await mountPublishedClient(t)
  const { ctx, send, errors, dictionaries, render } = runtime
  const startSession = ctx.uiWorkspace.startSession
  const error = new Error('draft preparation failed')
  ctx.uiWorkspace.startSession = () => { throw error }
  const data = { type: startRequest.type, skill: workflows[0].skill, workspaceId: 'workspace-project' }
  send(data)
  assert.equal(errors.length, 1)
  assert.equal(errors[0][0], '[pixel-town-pstack] could not start session')
  assert.equal(errors[0][1], error)
  assert.equal(dictionaries[0].dictionary.en.startFailed, 'Could not prepare a new session. Select a workspace and try again.')
  assert.equal(render().props.children.find(child => child?.props?.role === 'alert').props.children, dictionaries[0].dictionary.zh.startFailed)
  ctx.uiWorkspace.startSession = startSession
  send(data)
  assert.equal(render().props.children.some(child => child?.props?.role === 'alert'), false)
  assert.equal(runtime.started.length, 1)
})

const settle = () => new Promise(resolve => { setImmediate(resolve) })
// One task after the Sidebar names the Session: the render that mints its store has run.
async function nextTask(t) {
  await settle()
  t.mock.timers.tick(0)
  await settle()
}

test('published client opens a checked file beside its session only after the Sidebar names it, even once the town unmounts', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const runtime = await mountPublishedClient(t)
  const { send, frame, opened, resources, screenListeners } = runtime
  send(fileRequest, {}, origin)
  send(fileRequest, frame, 'https://other.example')
  send({ ...fileRequest, extra: true })
  assert.deepEqual(opened, [])
  assert.equal(screenListeners.size, 0)
  send({ ...fileRequest, path: '/projects/project/docs/flow.mmd' })
  assert.deepEqual(opened, ['session-example'], 'the conversation opens first')
  // ui-workspace swaps the town out of the main column; the pending open belongs to the plugin, not the page.
  runtime.unmount()
  runtime.showSession('session-other')
  await nextTask(t)
  assert.deepEqual(resources, [], 'another Session on screen is not the target')
  runtime.showSession('session-example')
  assert.equal(screenListeners.size, 0)
  await settle()
  assert.deepEqual(resources, [], 'the open waits for the task after the Session is named')
  await nextTask(t)
  assert.deepEqual(resources, [['dsh-resource://file/session/session-example/docs/flow.mmd', { revealIfOpened: true }]])
  assert.equal(runtime.failure, undefined)
  assert.deepEqual(runtime.errors, [])
})

test('published client builds DSH file addresses from the session workspace root', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const runtime = await mountPublishedClient(t)
  const cases = [
    ['session-example', 'docs/order flow#1.mmd', 'dsh-resource://file/session/session-example/docs/order%20flow%231.mmd'],
    ['session-example', './docs/flow.mmd', 'dsh-resource://file/session/session-example/docs/flow.mmd'],
    ['session-example', '/elsewhere/flow.mmd', 'dsh-resource://file/session/session-example//elsewhere/flow.mmd'],
    ['session-unknown-cwd', '/projects/project/flow.mmd', 'dsh-resource://file/session/session-unknown-cwd//projects/project/flow.mmd'],
  ]
  for (const [sessionId, path, address] of cases) {
    runtime.showSession(sessionId)
    runtime.send({ ...fileRequest, sessionId, path })
    await nextTask(t)
    assert.deepEqual(runtime.resources.at(-1), [address, { revealIfOpened: true }], path)
  }
  assert.equal(runtime.resources.length, cases.length)
})

test('published client shows the open failure after 2 s off screen, and never opens into a superseding session', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const runtime = await mountPublishedClient(t)
  const { send, resources, errors, dictionaries, render } = runtime
  send(fileRequest)
  t.mock.timers.tick(1999)
  await settle()
  assert.equal(runtime.failure, undefined)
  t.mock.timers.tick(1)
  await settle()
  assert.equal(runtime.screenListeners.size, 0)
  assert.equal(runtime.failure, 'openFailed')
  assert.equal(errors[0][0], '[pixel-town-pstack] could not open file')
  assert.match(String(errors[0][1]), /not on screen within 2000 ms/)
  assert.equal(render().props.children.find(child => child?.props?.role === 'alert').props.children, dictionaries[0].dictionary.zh.openFailed)
  runtime.showSession('session-example')
  await nextTask(t)
  assert.deepEqual(resources, [], 'a timed-out request stays abandoned')
  runtime.showSession(undefined)
  send(fileRequest)
  runtime.showSession('session-example')
  runtime.showSession('session-other')
  await nextTask(t)
  assert.deepEqual(resources, [], 'a later navigation took the screen before the open')
  assert.equal(errors.length, 1)
  runtime.showSession('session-example')
  send(fileRequest)
  await nextTask(t)
  assert.equal(resources.length, 1)
  assert.equal(render().props.children.some(child => child?.props?.role === 'alert'), false, 'success clears the alert')
})

test('published client reports openSession and openResource failures with the open alert', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const runtime = await mountPublishedClient(t)
  const { ctx, send, errors } = runtime
  const openSession = ctx.uiWorkspace.openSession
  const refused = new Error('cannot open')
  ctx.uiWorkspace.openSession = () => { throw refused }
  send(fileRequest)
  await settle()
  assert.deepEqual([errors[0][0], errors[0][1], runtime.failure], ['[pixel-town-pstack] could not open file', refused, 'openFailed'])
  assert.equal(runtime.screenListeners.size, 0)
  ctx.uiWorkspace.openSession = openSession
  const unclaimed = new Error('sidebarRight: no registered tab type claims')
  ctx.sidebarRight.openResource = () => { throw unclaimed }
  runtime.showSession('session-example')
  send(fileRequest)
  await nextTask(t)
  assert.deepEqual([errors[1][1], runtime.failure], [unclaimed, 'openFailed'])
})
