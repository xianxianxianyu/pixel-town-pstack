// Public screenshot data: invented sessions only, independent of DSH persistence.
import { DELIVERY_SKILL, workflows } from '../../lib/workflows.js'

const now = Date.now()
const resident = (id, title, workflow, stage, extra = {}) => ({
  sessionId: `demo-${id}`, title, cwd: '/workspace/demo-project',
  workflow, stage, status: 'working', skill: null, detail: '按步骤完成当前任务',
  subagentCount: 0, skipped: [], needs: null, gag: null,
  startedAt: now - 600000, stageEnteredAt: now - 60000, lastEventAt: now,
  history: [], ...extra,
})

export const townFixture = {
  workflows,
  deliverySkill: DELIVERY_SKILL,
  sessions: [
    resident('feature', '添加搜索筛选', 'feature', 'build', { subagentCount: 1 }),
    resident('bug', '修复分页边界', 'bug-fix', 'verify', {
      detail: '分页边界已修复，正在验证空列表与最后一页。',
      goal: { objective: '修复分页边界并通过回归测试', phase: 'active', rounds: 2, maxRounds: 5, updatedAt: now },
      history: [
        { workflow: 'bug-fix', stage: 'reproduce', kind: 'enter', at: now - 480000, note: '最后一页漏掉一项' },
        { workflow: 'bug-fix', stage: 'red', kind: 'enter', at: now - 360000, note: '边界测试失败' },
        { workflow: 'bug-fix', stage: 'fix', kind: 'enter', at: now - 180000, note: '调整切片终点' },
        { workflow: 'bug-fix', stage: 'verify', kind: 'enter', at: now - 60000, note: '复测原始入口' },
      ],
      trail: { on: true, rows: [
        { n: 1, at: now - 360000, workflow: 'bug-fix', stage: 'red', decision: '添加最后一页的回归测试', why: '复现少返回一项的边界条件', result: '测试稳定失败', evidence: [{ kind: 'url', ref: 'https://example.org/demo/red-test' }] },
        { n: 2, at: now - 180000, workflow: 'bug-fix', stage: 'fix', decision: '使用排他的切片终点', why: '页面长度应包含末尾元素', result: '原始复现与边界测试通过', evidence: [{ kind: 'url', ref: 'https://example.org/demo/green-test' }] },
      ], audit: null, review: null },
    }),
    resident('research', '比较缓存方案', 'investigation', 'explain'),
    resident('forensics', '检查内存曲线', 'runtime-forensics', 'capture'),
    resident('review', '审查输入校验', 'interrogate', 'report', {
      status: 'needsYou', needs: { question: '要采用更严格的输入校验吗？', options: ['采用', '保留现状'] },
    }),
    resident('plan', '规划设置页面', 'multi-phase-plan', 'handback', {
      status: 'paused', checkpoint: { at: now, reason: 'handback', waitingFor: '确认任务范围', path: '/workspace/demo-notes/resume.md' },
    }),
  ],
}
