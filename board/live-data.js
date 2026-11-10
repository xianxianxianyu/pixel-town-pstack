import { ART } from './art.js';

export const STATUS = {
  working: { label: '干活中', color: '#3b82f6', glyph: '忙' },
  needsYou: { label: '等你拍板', color: '#f59e0b', glyph: '问' },
  paused: { label: '已存档', color: '#8b5cf6', glyph: '⏸' },
  interrupted: { label: '断了', color: '#6b7280', glyph: '⚡' },
  idle: { label: '睡着了', color: '#9ca3af', glyph: '眠' },
  finished: { label: '完工', color: '#22c55e', glyph: '完' },
};

const STATUS_ORDER = { needsYou: 0, interrupted: 1, working: 2, paused: 3, idle: 4, finished: 5 };

export function sortResidents(sessions) {
  return [...sessions].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

export function residentNameplate(session, number) {
  const title = [...session.title];
  const { glyph, color } = STATUS[session.status];
  return {
    number: String(number).padStart(2, '0'),
    title: title.slice(0, 8).join('') + (title.length > 8 ? '…' : ''),
    glyph, color,
  };
}

export function mailboxItems(sessions, workflows) {
  return sessions.filter((session) => session.status === 'needsYou').map((session) => {
    const workflow = session.inTown ? workflows.find((candidate) => candidate.id === session.workflow) : null;
    const stage = workflow?.stages.find((candidate) => candidate.id === session.stage);
    return {
      id: session.id,
      title: session.title,
      context: session.inTown ? `${workflow.name} · ${stage.name}` : '其他会话',
      question: session.needs?.question ?? '请到 DSH 查看待处理事项',
      options: session.needs?.options ?? [],
    };
  });
}

// Once the turn has ended, the user's attention goes to audit findings other than `superseded`, review flags
// and a blocked goal: not while the agent is working, nor while it waits on a question (that letter is 待回答).
export const openFindings = (trail) => trail?.audit?.findings.filter((finding) => finding.kind !== 'superseded') ?? [];
export function attentionItems(sessions) {
  return sessions.filter((session) => session.status !== 'working' && session.status !== 'needsYou'
    && (openFindings(session.trail).length > 0 || (session.trail?.review?.flags.length ?? 0) > 0 || session.goal?.phase === 'blocked'));
}

// Finished sessions leave town; the newest 20 are listed, by when they finished (older hosts: last event).
export function recentLeavers(sessions, limit = 20) {
  const when = (session) => session.finishedAt ?? session.lastEventAt ?? 0;
  return sessions.filter((session) => session.status === 'finished').sort((a, b) => when(b) - when(a)).slice(0, limit);
}

// The decision trail as the host reports it; older hosts send none.
function mapTrail(trail, current) {
  if (!trail || !Array.isArray(trail.rows)) return null;
  return {
    on: Boolean(trail.on),
    rows: trail.rows.map((row) => ({
      n: row.n, at: row.at, workflow: current(row.workflow), stage: row.stage ?? null,
      decision: row.decision ?? '', why: row.why ?? '', result: row.result ?? '',
      evidence: (row.evidence ?? []).map(({ kind, ref }) => ({ kind, ref })),
      supersedes: row.supersedes ?? null, supersededBy: row.supersededBy ?? null,
    })),
    audit: trail.audit ? {
      at: trail.audit.at,
      findings: (trail.audit.findings ?? []).map(({ kind, rows, stage, detail }) => ({ kind, rows: rows ?? [], stage: stage ?? null, detail: detail ?? '' })),
    } : null,
    review: trail.review ? {
      at: trail.review.at, model: trail.review.model ?? '',
      flags: (trail.review.flags ?? []).map(({ text, rows }) => ({ text, rows: rows ?? [] })),
    } : null,
  };
}

// A provider ID is opaque: only the pointer's kind chooses the evidence endpoint selector.
export function evidenceRequest(sessionId, row, { kind, ref }) {
  return {
    key: `${row}:${kind}:${ref}`,
    label: `${kind}:${ref}`,
    url: `../evidence?${new URLSearchParams({ session: sessionId, [kind]: ref })}`,
  };
}

// DSH goal phases the board names; any other shape is ignored.
export const GOAL_PHASES = { active: '进行中', paused: '已暂停', blocked: '受阻', complete: '已完成' };
function mapGoal(goal) {
  if (!goal || !Object.hasOwn(GOAL_PHASES, goal.phase)) return null;
  const reason = goal.blockedReason;
  return {
    objective: String(goal.objective ?? ''), phase: goal.phase,
    rounds: Number.isFinite(goal.rounds) ? goal.rounds : 0, maxRounds: Number.isFinite(goal.maxRounds) ? goal.maxRounds : null,
    blockedReason: reason ? { code: reason.code ?? '', message: reason.message ?? String(reason) } : null,
    updatedAt: goal.updatedAt ?? null,
  };
}

// The latest checked chart as the host reports it; older hosts send none.
function mapCanvas(canvas) {
  if (typeof canvas?.path !== 'string' || !canvas.path) return null;
  return { path: canvas.path, name: canvas.path.split(/[\\/]/).at(-1) || canvas.path, at: canvas.at ?? null };
}

// Hosts before the rename send the old workflow ids and no table of them; every id is mapped here, once.
const OLD_HOST_WORKFLOW_IDS = { requirement: 'feature', 'bug-analysis': 'runtime-forensics' };

const basename = (cwd) => typeof cwd === 'string' ? cwd.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) : '';

/** Pure projection shared by live polling and offline replay. Art never supplies stage structure. */
export function mapBoard(payload) {
  if (!payload || !Array.isArray(payload.workflows) || !Array.isArray(payload.sessions)) {
    throw new Error('Invalid DSH board response');
  }
  const legacy = payload.legacyWorkflowIds ?? OLD_HOST_WORKFLOW_IDS;
  const current = (id) => (typeof id === 'string' && Object.hasOwn(legacy, id) ? legacy[id] : id) ?? null;
  // A definition under the current id wins over one still sent under a legacy id.
  const manifest = new Map();
  for (const definition of payload.workflows) {
    const id = current(definition.id);
    if (!manifest.has(id) || definition.id === id) manifest.set(id, definition);
  }
  const ids = [...new Set([...Object.keys(ART), ...manifest.keys()])];
  const workflows = ids.map((id) => {
    const definition = manifest.get(id);
    const art = ART[id];
    return {
      id, name: definition?.name ?? art.name, skill: definition?.skill, available: Boolean(definition),
      theme: art?.theme ?? '', summary: art?.summary ?? '', color: art?.color ?? '#718074', emoji: art?.emoji ?? '',
      stages: (definition?.stages ?? []).map((stage) => ({
        id: stage.id, name: stage.name, doing: stage.doing, doneWhen: stage.doneWhen,
        ...(stage.optional === undefined ? {} : { optional: stage.optional }),
        ...(stage.handback === undefined ? {} : { handback: stage.handback }),
        skills: art?.stages[stage.id]?.skills ?? [],
        prop: art?.stages[stage.id]?.prop ?? '',
        gag: art?.stages[stage.id]?.gag ?? '',
      })),
    };
  });
  const byId = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const sessions = payload.sessions.map((raw) => {
    const session = { ...raw, workflow: current(raw.workflow) };
    const stage = byId.get(session.workflow)?.stages.find((candidate) => candidate.id === session.stage);
    const history = (session.history ?? []).filter((entry) => entry.kind !== 'rejected')
      .map(({ workflow, stage, at, kind, note }) => ({ workflow: current(workflow), stage, at, kind, note }));
    return {
      id: session.sessionId,
      title: session.title || basename(session.cwd) || session.sessionId,
      repo: basename(session.cwd) || '—',
      workflow: session.workflow ?? null, stage: session.stage ?? null,
      status: session.status === 'stuck' ? 'idle' : session.status, skill: session.skill || stage?.skills[0] || '',
      detail: session.detail, needs: session.needs,
      handoffFrom: session.handoffFrom ? { ...session.handoffFrom, workflow: current(session.handoffFrom.workflow) } : null,
      checkpoint: session.checkpoint ?? null, interruption: session.interruption ?? null,
      cost: session.cost ? { ...session.cost, byStage: (session.cost.byStage ?? []).map((entry) => ({ ...entry, workflow: current(entry.workflow) })) } : null,
      trail: mapTrail(session.trail, current), goal: mapGoal(session.goal),
      delivery: session.delivery ? { kind: session.delivery.kind, url: session.delivery.url ?? null, at: session.delivery.at } : null,
      canvas: mapCanvas(session.canvas),
      finishedAt: session.finishedAt ?? null,
      subagents: Array.from({ length: session.subagentCount }, (_, index) => ({ id: `${session.sessionId}:child:${index}`, role: `助手 ${index + 1}`, status: 'unknown' })),
      skipped: [...session.skipped], history,
      rollbackCount: session.rollbackCount ?? history.filter((entry) => entry.kind === 'rollback').length,
      startedAt: session.startedAt,
      stageEnteredAt: session.stageEnteredAt, lastEventAt: session.lastEventAt,
      event: session.gag?.text.startsWith('被拦下') ? null : session.gag,
      inTown: Boolean(ART[session.workflow] && byId.get(session.workflow)?.available && stage),
    };
  });
  const skill = (value) => typeof value === 'string' && value.trim() ? value : null;
  // Hosts advertise the skills their own client will prefill; older hosts send neither or only delivery.
  return { workflows, deliverySkill: skill(payload.deliverySkill), entrySkill: skill(payload.entrySkill), sessions, residents: sessions.filter((session) => session.inTown), others: sessions.filter((session) => !session.inTown) };
}

export function createBoard(environment = globalThis) {
  let view = mapBoard({ workflows: [], sessions: [] });
  let connection = { status: 'loading', updatedAt: null };
  let started = false;
  let timer = null;
  let request = null;
  const listeners = new Set();
  const workflow = (id) => view.workflows.find((candidate) => candidate.id === id);
  const stageIndex = (session) => workflow(session.workflow)?.stages.findIndex((stage) => stage.id === session.stage) ?? -1;
  const currentStage = (session) => workflow(session.workflow)?.stages[stageIndex(session)] ?? null;
  const nextStage = (session) => workflow(session.workflow)?.stages[stageIndex(session) + 1] ?? null;
  const minutes = (time) => time === null ? '—' : Math.max(0, Math.round((Date.now() - time) / 60000));
  const emit = () => { for (const listener of listeners) listener(view.sessions); };
  const clearTimer = () => { environment.clearTimeout(timer); timer = null; };
  const cancel = () => { clearTimer(); request?.abort(); request = null; };
  const schedule = () => {
    if (started && !environment.document.hidden && !request) timer = environment.setTimeout(poll, 1500);
  };
  async function poll() {
    clearTimer();
    if (!started || environment.document.hidden || request) return;
    const controller = new AbortController();
    request = controller;
    try {
      const response = await environment.fetch('../board', {
        credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      });
      if (!response.ok) throw new Error(`DSH HTTP ${response.status}`);
      const mapped = mapBoard(await response.json());
      if (request !== controller) return;
      view = mapped;
      connection = { status: 'live', updatedAt: Date.now() };
    } catch (error) {
      if (request !== controller) return;
      connection = { status: 'error', updatedAt: connection.updatedAt };
    } finally {
      if (request === controller) {
        request = null;
        emit();
        schedule();
      }
    }
  }
  const visibility = () => {
    if (environment.document.hidden) cancel();
    else void poll();
  };
  return {
    STATUS,
    get WORKFLOWS() { return view.workflows; },
    get deliverySkill() { return view.deliverySkill; },
    get entrySkill() { return view.entrySkill; },
    get connection() { return connection; },
    workflow, stageIndex, currentStage, nextStage,
    stageState(session, stageId) {
      const index = workflow(session.workflow)?.stages.findIndex((stage) => stage.id === stageId) ?? -1;
      if (index >= 0 && index === stageIndex(session)) return session.status === 'finished' ? 'done' : 'active';
      if (session.skipped.includes(stageId)) return 'skipped';
      if ((index >= 0 && index < stageIndex(session)) || session.history.some((entry) => entry.workflow === session.workflow && entry.stage === stageId && entry.kind !== 'skip')) return 'done';
      return 'pending';
    },
    nextStep(session) {
      if (session.status === 'needsYou') return `等你回答：${session.needs?.question ?? '请到 DSH 查看'}`;
      if (session.status === 'paused') return `存档了，等你：${session.checkpoint?.waitingFor ?? '继续'}`;
      if (session.status === 'interrupted') return '断了没存档，继续前先补存档';
      if (session.status === 'idle') return '会话暂停了，去 DSH 看看';
      if (session.status === 'finished') return '完工，没有下一步';
      const next = nextStage(session);
      return next ? `${next.name}：${next.doing}` : '收尾';
    },
    minutesIn: (session) => minutes(session.stageEnteredAt ?? session.startedAt),
    minutesSinceEvent: (session) => minutes(session.lastEventAt),
    snapshot: () => view.sessions,
    totalCost: () => view.sessions.reduce((total, session) => ({
      tokens: total.tokens + (session.cost?.tokens ?? 0),
      steps: total.steps + (session.cost?.steps ?? 0),
    }), { tokens: 0, steps: 0 }),
    subscribe(listener) { listeners.add(listener); listener(view.sessions); return () => listeners.delete(listener); },
    start() {
      if (started) return;
      started = true;
      environment.document.addEventListener('visibilitychange', visibility);
      void poll();
    },
    stop() {
      started = false;
      cancel();
      environment.document.removeEventListener('visibilitychange', visibility);
    },
    retry() { void poll(); },
  };
}

if (typeof window !== 'undefined') window.PstackBoard = createBoard();
