#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { foldBoard, foldSession } from '../lib/fold.js'

async function readRecords(path) {
  if (!path.endsWith('.zstd')) {
    const records = []
    for await (const line of createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })) {
      if (line.trim()) records.push(JSON.parse(line))
    }
    return records
  }
  const child = spawn('zstd', ['-dc', '--', path], { stdio: ['ignore', 'pipe', 'pipe'] })
  let errors = ''
  child.stderr.setEncoding('utf8').on('data', text => { errors += text })
  const finished = once(child, 'close')
  // Attach a handler before reading so a missing zstd cannot become an
  // unhandled rejection while the stdout iterator is closing.
  finished.catch(() => {})
  const records = []
  try {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      if (line.trim()) records.push(JSON.parse(line))
    }
  } catch (error) {
    child.kill()
    await finished.catch(() => {})
    throw error
  }
  const [code] = await finished
  if (code !== 0) throw new Error(`zstd exited ${code}: ${errors.trim()}`)
  return records
}

async function costReport(path, records) {
  const parent = foldSession(records)
  const workspace = dirname(dirname(path))
  const logs = [records]
  for (const entry of await readdir(workspace, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = join(workspace, entry.name)
    const filename = (await readdir(directory)).find(name => /^session\.v4\.jsonl(?:\.zstd)?$/.test(name))
    if (!filename) continue
    const candidate = join(directory, filename)
    if (candidate !== path) logs.push(await readRecords(candidate))
  }
  const sessions = logs.map(foldSession)
  const byParent = new Map()
  for (const session of sessions) {
    const siblings = byParent.get(session.parentSessionId) ?? []
    siblings.push(session)
    byParent.set(session.parentSessionId, siblings)
  }
  const children = []
  const collect = (id) => {
    for (const child of byParent.get(id) ?? []) {
      children.push(child)
      collect(child.sessionId)
    }
  }
  collect(parent.sessionId)
  const included = new Set([parent.sessionId, ...children.map(child => child.sessionId)])
  // The selected session is this report's root, even when it is itself a subagent.
  const selected = logs.filter(log => included.has(log[0]?.id)).map(log =>
    log[0]?.id === parent.sessionId ? [{ ...log[0], parentSession: undefined }, ...log.slice(1)] : log)
  const combined = foldBoard(selected)[0]
  return {
    sessionId: parent.sessionId,
    history: parent.history,
    skipped: parent.skipped,
    status: parent.status,
    parent: parent.cost,
    children: children.map(child => ({ sessionId: child.sessionId, cost: child.cost })),
    cost: combined.cost,
  }
}

function printCost(report) {
  const summary = (label, cost) => console.log(`${label}\tmiss=${cost.miss}\tcache=${cost.cacheHit}\toutput=${cost.output}\ttokens=${cost.tokens}\tsteps=${cost.steps}`)
  console.log(`Session ${report.sessionId}`)
  summary('parent', report.parent)
  for (const child of report.children) summary(`child ${child.sessionId}`, child.cost)
  summary('children subtotal', report.children.reduce((sum, child) => ({
    miss: sum.miss + child.cost.miss, cacheHit: sum.cacheHit + child.cost.cacheHit,
    output: sum.output + child.cost.output, tokens: sum.tokens + child.cost.tokens, steps: sum.steps + child.cost.steps,
  }), { miss: 0, cacheHit: 0, output: 0, tokens: 0, steps: 0 }))
  summary(`total (${report.cost.children} children)`, report.cost)
  console.log('Stage usage (includes descendants at their ancestor spawn stage):')
  console.log('stage\ttokens\tsteps\tavg context\tmax context\tchildren')
  for (const stage of [...report.cost.byStage].sort((a, b) => b.tokens - a.tokens)) {
    console.log(`${stage.workflow ? `${stage.workflow}/` : ''}${stage.stage}\t${stage.tokens}\t${stage.steps}\t${stage.steps ? Math.round(stage.contextTokens / stage.steps) : 0}\t${stage.maxContext}\t${stage.children}`)
  }
  console.log('Context = cache hit + cache miss; tokens also include output. Repeated context is counted per message, not unique text.')
}

const args = process.argv.slice(2)
const jsonOnly = args.includes('--json')
const costOnly = args.includes('--cost')
const paths = args.filter(arg => arg !== '--json' && arg !== '--cost')
if (paths.length !== 1) {
  console.error('Usage: node scripts/replay.mjs <session.v4.jsonl[.zstd] | session dir> [--json] [--cost]')
  process.exitCode = 1
} else {
  try {
    const input = resolve(paths[0])
    const path = (await stat(input)).isDirectory()
      ? join(input, (await readdir(input)).find(name => /^session\.v4\.jsonl(?:\.zstd)?$/.test(name)) ?? 'session.v4.jsonl.zstd')
      : input
    const records = await readRecords(path)
    if (costOnly) {
      const report = await costReport(path, records)
      if (jsonOnly) console.log(JSON.stringify(report, null, 2))
      else printCost(report)
    } else {
      const state = foldSession(records)
      if (!jsonOnly) {
        const start = records.find(record => record.type === 'session')?.createdAt
          ?? records.find(record => typeof record.time === 'number')?.time ?? 0
        const offset = time => `+${((time - start) / 1000).toFixed(3)}s`
        console.log(`Session ${state.sessionId || '(unknown)'}`)
        console.log('Stage timeline:')
        for (const entry of state.history) {
          console.log(`${offset(entry.at)}\t${entry.kind}\t${entry.workflow}/${entry.stage}\t${entry.note}`)
        }
        console.log('Rejected calls:')
        for (const entry of state.history.filter(entry => entry.kind === 'rejected')) {
          console.log(`${offset(entry.at)}\t${entry.stage}\t${entry.note}`)
        }
        console.log('Todo snapshots:')
        for (const record of records.filter(record => record.type === 'todo/write')) {
          console.log(`${offset(record.time)}\t${JSON.stringify(record.data.todos)}`)
        }
        console.log('Final BoardSession:')
      }
      console.log(JSON.stringify(state, null, 2))
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
