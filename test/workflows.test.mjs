import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workflows, stageProtocol, stageResult, parseStageInput } from '../lib/workflows.js'

const surfaceIds = ['bug-fix', 'runtime-forensics', 'feature', 'refactoring', 'perf-issue', 'hillclimb', 'prototype', 'interrogate']
const surfaceLine = '仓库里有 `.dsh/skills/verify-*` 时，复现和验证按它的启动、自检、驱动、证据步骤做；没有就跑真实命令，并在回复里建议用「验证工具」生成一个。'

test('verification workflows publish their complete ordered manifest and handbacks', () => {
  assert.equal(workflows.length, 18)
  assert.equal(new Set(workflows.map(({ id }) => id)).size, 18)
  for (const [id, name, stages, handbacks] of [
    ['create-verification-skill', '验证工具', ['interview', 'generate', 'map', 'prove', 'handoff'], ['interview']],
    ['maintain-verification-skill', '验证巡检', ['locate', 'index', 'source', 'reconcile', 'live', 'triage', 'ship'], ['locate']],
    ['create-formal-verification-skill', '形式化验证', ['target', 'tool', 'generate', 'prove', 'handoff'], ['tool']],
    ['maintain-formal-verification-skill', '形式化巡检', ['locate', 'baseline', 'changes', 'update', 'judge', 'sync', 'report'], ['baseline']],
  ]) {
    const workflow = workflows.find(workflow => workflow.id === id)
    assert.ok(workflow)
    assert.equal(workflow.name, name)
    assert.equal(workflow.skill, `pstack-${id}`)
    assert.deepEqual(workflow.stages.map(stage => stage.id), stages)
    assert.deepEqual(workflow.stages.filter(stage => stage.handback).map(stage => stage.id), handbacks)
    for (const stage of workflow.stages) {
      assert.ok(stage.name && stage.doing && stage.doneWhen)
      assert.notEqual(stage.optional, true)
      assert.deepEqual(parseStageInput({ workflow: id, stage: stage.id, note: '开始' }), { workflow: id, stage: stage.id, note: '开始' })
    }
  }
})

test('figure-it-out mirrors upstream phases A–E, keeps a decision trail and checkpoints only long runs', () => {
  const workflow = workflows.find(workflow => workflow.id === 'figure-it-out')
  assert.ok(workflow)
  assert.equal(workflow.name, '想办法')
  assert.equal(workflow.skill, 'pstack-figure-it-out')
  assert.equal(workflow.trail, true)
  assert.deepEqual(workflow.stages.map(stage => stage.id), ['frame', 'design', 'loop', 'trail', 'verify'])
  assert.deepEqual(workflow.stages.filter(stage => stage.handback).map(stage => stage.id), ['frame'])
  assert.match(workflow.stages[0].handback, /数小时/u)
  assert.match(workflow.stages.find(stage => stage.id === 'loop').doneWhen, /VERIFIED、NOT VERIFIED 或 INCONCLUSIVE/u)
  const protocol = stageProtocol('figure-it-out')
  assert.ok(protocol.includes('pstack_stage(workflow="figure-it-out"'))
  assert.ok(protocol.includes('pstack_log') && protocol.includes('pstack_audit'), 'the trail rules ride along')
  assert.match(stageResult({ workflow: 'figure-it-out', stage: 'frame', note: '定谓词' }), /工作日志：已开启。/u)
})

test('surface verification guidance appears once and only for the eight flagged workflows', () => {
  assert.deepEqual(workflows.filter(workflow => workflow.surface).map(workflow => workflow.id).sort(), [...surfaceIds].sort())
  for (const workflow of workflows) {
    const lines = stageProtocol(workflow.id).split('\n')
    const expected = surfaceIds.includes(workflow.id) ? 1 : 0
    assert.equal(lines.filter(line => line === surfaceLine).length, expected, workflow.id)
    assert.equal(lines.filter(line => line.includes('.dsh/skills/verify-*')).length, expected, workflow.id)
  }
})

test('every workflow protocol carries one diagram rule: canvas-diagram when available, otherwise a mermaid block', () => {
  for (const workflow of workflows) {
    const lines = stageProtocol(workflow.id).split('\n').filter(line => line.includes('canvas-diagram'))
    assert.equal(lines.length, 1, workflow.id)
    assert.match(lines[0], /`canvas-diagram`.*`\.mmd`.*`canvas_check`.*`present`.*没有就.*`mermaid` 代码块/u, workflow.id)
  }
})

test('delivery stages share the opening-a-pr procedure for both forges and local commits', () => {
  const delivery = workflows.flatMap(workflow => workflow.stages.filter(stage => stage.id === 'pr').map(stage => ({ workflow: workflow.id, ...stage })))
  assert.deepEqual(delivery.map(stage => stage.workflow), ['bug-fix', 'feature', 'perf-issue', 'refactoring', 'hillclimb'])
  for (const stage of delivery) {
    assert.equal(stage.name, '开 PR/MR')
    assert.equal(stage.doing, '加载 pstack-opening-a-pr，按它整理提交并开 PR/MR（无远端时只本地提交）')
    assert.match(stageResult({ workflow: stage.workflow, stage: 'pr', note: '交付' }), /加载 pstack-opening-a-pr/u)
  }
  assert.match(workflows.find(workflow => workflow.id === 'maintain-verification-skill').stages.find(stage => stage.id === 'ship').doing, /加载 pstack-opening-a-pr/u)
})
