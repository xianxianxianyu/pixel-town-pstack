// @ts-check
const OPEN_SESSION = 'pixel-town-pstack/open-session';
const START_SESSION = 'pixel-town-pstack/start-session';
const WORKSPACES = 'pixel-town-pstack/workspaces';
const OPEN_FILE = 'pixel-town-pstack/open-file';

/**
 * @param {MessageEvent<unknown>} event
 * @param {Window | null} source
 * @param {string} origin
 * @param {string} type
 * @returns {Record<string, unknown> | undefined}
 */
function messageData(event, source, origin, type) {
  if (source === null || event.source !== source || event.origin !== origin) return;
  const data = event.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)
    || !Object.hasOwn(data, 'type') || !('type' in data) || data.type !== type) return;
  return /** @type {Record<string, unknown>} */ (data);
}

/** @param {unknown} value @returns {value is string} */
function nonemptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Embedded links stay in the app; standalone links keep their native new-tab behavior.
 * DSH's standalone startup restores this key (ui-workspace navigation.ts:160,443).
 * @param {string} sessionId
 * @param {Pick<MouseEvent, 'preventDefault'>} event
 * @param {Window} environment
 */
export function openSessionLink(sessionId, event, environment = window) {
  if (environment.parent !== environment && new URLSearchParams(environment.location.search).get('embed') === '1') {
    event.preventDefault();
    // Reading a cross-origin parent's location throws before any message is sent.
    if (environment.parent.location.origin !== environment.location.origin) {
      throw new Error('The town must be embedded by its own DSH origin');
    }
    environment.parent.postMessage({ type: OPEN_SESSION, sessionId }, environment.location.origin);
    return;
  }
  environment.localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId }));
}

/**
 * Accept only the current town frame, not another same-origin window or a stale iframe.
 * @param {MessageEvent<unknown>} event
 * @param {Window | null} frame
 * @param {string} origin
 * @returns {string | undefined}
 */
export function sessionFromMessage(event, frame, origin) {
  const data = messageData(event, frame, origin, OPEN_SESSION);
  if (data === undefined || Object.keys(data).length !== 2
    || !Object.hasOwn(data, 'sessionId') || !nonemptyString(data.sessionId)) return;
  return data.sessionId;
}

/**
 * Ask the embedding DSH to open one of a session's files beside its conversation.
 * The target origin keeps the request inside the town's own DSH origin.
 * @param {string} sessionId
 * @param {string} path
 * @param {Window} environment
 */
export function requestOpenFile(sessionId, path, environment = window) {
  environment.parent.postMessage({ type: OPEN_FILE, sessionId, path }, environment.location.origin);
}

/**
 * Accept only the current town frame's exact open-file request; the path is passed on unchanged.
 * @param {MessageEvent<unknown>} event
 * @param {Window | null} frame
 * @param {string} origin
 * @returns {{ sessionId: string, path: string } | undefined}
 */
export function openFileFromMessage(event, frame, origin) {
  const data = messageData(event, frame, origin, OPEN_FILE);
  if (data === undefined || Object.keys(data).length !== 3
    || !Object.hasOwn(data, 'sessionId') || !nonemptyString(data.sessionId)
    || !Object.hasOwn(data, 'path') || !nonemptyString(data.path)) return;
  return { sessionId: data.sessionId, path: data.path };
}

/**
 * Validate the wire request only; the client owns skill and workspace authorization.
 * @param {MessageEvent<unknown>} event
 * @param {Window | null} frame
 * @param {string} origin
 * @returns {{ skill: string, workspaceId?: string } | undefined}
 */
export function startSessionFromMessage(event, frame, origin) {
  const data = messageData(event, frame, origin, START_SESSION);
  if (data === undefined || !Object.hasOwn(data, 'skill') || !nonemptyString(data.skill)) return;
  if (Object.hasOwn(data, 'workspaceId')) {
    if (Object.keys(data).length !== 3 || !nonemptyString(data.workspaceId)) return;
    return { skill: data.skill, workspaceId: data.workspaceId };
  }
  if (Object.keys(data).length !== 2) return;
  return { skill: data.skill };
}

/**
 * @param {MessageEvent<unknown>} event
 * @param {Window | null} frame
 * @param {string} origin
 * @returns {boolean}
 */
export function workspacesRequestFromMessage(event, frame, origin) {
  const data = messageData(event, frame, origin, WORKSPACES);
  return data !== undefined && Object.keys(data).length === 1;
}

/** @typedef {{ id: string, title: string, path: string }} WorkspaceItem */

/**
 * Accept only the expected parent's complete workspace projection.
 * @param {MessageEvent<unknown>} event
 * @param {Window | null} parent
 * @param {string} origin
 * @returns {WorkspaceItem[] | undefined}
 */
export function workspacesFromMessage(event, parent, origin) {
  const data = messageData(event, parent, origin, WORKSPACES);
  if (data === undefined || Object.keys(data).length !== 2
    || !Object.hasOwn(data, 'items') || !Array.isArray(data.items)) return;
  for (const item of data.items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)
      || Object.keys(item).length !== 3
      || !Object.hasOwn(item, 'id') || !nonemptyString(item.id)
      || !Object.hasOwn(item, 'title') || !nonemptyString(item.title)
      || !Object.hasOwn(item, 'path') || !nonemptyString(item.path)) return;
  }
  return data.items;
}
