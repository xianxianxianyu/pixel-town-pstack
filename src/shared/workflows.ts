import { trailEnabled, trailRules } from './trail.ts'

export const DELIVERY_SKILL = 'pstack-opening-a-pr'

/** Read compatibility only: live stage reports must use the canonical ids. */
export const LEGACY_WORKFLOW_IDS: Readonly<Record<string, string>> = {
  requirement: 'feature',
  'bug-analysis': 'runtime-forensics',
}

export interface Stage {
  readonly id: string
  readonly name: string
  readonly doing: string
  readonly doneWhen: string
  readonly optional?: boolean
  readonly handback?: string
}

export interface Workflow {
  readonly id: string
  readonly name: string
  readonly skill: string
  readonly surface?: boolean
  readonly trail?: boolean
  readonly stages: readonly Stage[]
}

export const workflows = [
  {
    id: 'bug-fix', name: '查 Bug 修复', skill: 'pstack-bug-fix', surface: true,
    stages: [
      { id: 'reproduce', name: '复现',
        doing: '在同一个界面亲手复现；复现不了就造触发条件或加埋点',
        doneWhen: '稳定复现（例如 3/3）', handback: '界面够不着时帮忙复现' },
      { id: 'bisect', name: '二分定位',
        doing: '每轮切掉最多的问题空间，用证据排除候选',
        doneWhen: '存活的机制有运行时证据' },
      { id: 'plan-fix', name: '设计修复', optional: true,
        doing: '修复跨函数边界时先做架构草图，定最小改动',
        doneWhen: '修复范围和接口定下来' },
      { id: 'red', name: '红灯测试',
        doing: '先写一个失败的复现测试，提交在修复之前',
        doneWhen: '测试在当前代码上稳定失败' },
      { id: 'fix', name: '修复',
        doing: '子 agent 按限定范围实现最小修复',
        doneWhen: '改动只覆盖证据支持的部分' },
      { id: 'verify', name: '同界面验证',
        doing: '原始复现现在通过；贴出修复前失败、修复后通过的输出',
        doneWhen: '同一界面上复现消失' },
      { id: 'interrogate', name: '对抗审查', optional: true,
        doing: '不同模型试着弄坏这个 diff，只保留跑得出来的发现',
        doneWhen: '每条发现都有复现命令，或确认无发现' },
      { id: 'pr', name: '开 PR/MR',
        doing: '加载 pstack-opening-a-pr，按它整理提交并开 PR/MR（无远端时只本地提交）',
        doneWhen: '有序提交就绪；可用 forge 的 PR/MR 已打开，否则如实报告本地提交或推送' },
    ],
  },
  {
    id: 'runtime-forensics', name: '现场取证', skill: 'pstack-runtime-forensics', surface: true,
    stages: [
      { id: 'intake', name: '接案',
        doing: '用自己的话复述症状、影响范围和"查清"的标准',
        doneWhen: '症状、复现条件、成功标准三句话写清' },
      { id: 'capture', name: '采证',
        doing: '在真实环境抓信号：CPU profile、heap snapshot、日志、trace',
        doneWhen: '手里有一份真实采集的 artifact，而不是猜测' },
      { id: 'reduce', name: '缩减',
        doing: '子 agent 把大 artifact 导进 sqlite，缩减到一个热点或一条 retainer 链',
        doneWhen: '一个热点函数，或一条从泄漏对象到 GC root 的链' },
      { id: 'hypothesize', name: '排除假设',
        doing: '列出候选假设，每轮用运行时证据划掉一个',
        doneWhen: '只剩一个假设站着' },
      { id: 'prove', name: '证实机制',
        doing: '注入埋点或热补丁，让机制在运行中现形',
        doneWhen: '运行时证据证明了机制' },
      { id: 'report', name: '结案报告',
        doing: '写诊断：信号、缩减结果、证明方式、源码位置',
        doneWhen: '报告带 file:line、artifact 路径和探针输出；临时埋点已移除', handback: '要不要修' },
    ],
  },
  {
    id: 'feature', name: '实现功能', skill: 'pstack-feature', surface: true,
    stages: [
      { id: 'restate', name: '复述需求',
        doing: '复述目标、问题和预期的最小改动；证据否定需求时直接指出',
        doneWhen: '目标与成功标准写清' },
      { id: 'survey', name: '摸底',
        doing: '子 agent 并行摸清受影响的子系统',
        doneWhen: 'Overview / Key Concepts / Where Things Live 写好' },
      { id: 'sketch', name: '架构草图',
        doing: '至少两套结构不同的设计并行比较，先写调用方用法再定类型',
        doneWhen: '选定数据形状和模块归属', handback: '仅用户要求设计检查点时：认可设计' },
      { id: 'checkpoint', name: '吞吐检查点',
        doing: '填四项：阻塞步骤、独立工作流、共享可变状态、最小安全拆分',
        doneWhen: '四项都填了，不适用的写 n/a 理由' },
      { id: 'build', name: '委派实现',
        doing: '子 agent 按小单元实现，每个单元验证后再提交',
        doneWhen: '所有单元提交且各自通过' },
      { id: 'verify', name: '验证',
        doing: '在匹配的界面上真实运行新功能',
        doneWhen: '真实运行结果贴出' },
      { id: 'interrogate', name: '质询', optional: true,
        doing: '设计有争议时，上线前让不同模型来攻',
        doneWhen: '发现都被复现或排除' },
      { id: 'pr', name: '开 PR/MR',
        doing: '加载 pstack-opening-a-pr，按它整理提交并开 PR/MR（无远端时只本地提交）',
        doneWhen: '有序提交就绪；可用 forge 的 PR/MR 已打开，否则如实报告本地提交或推送' },
    ],
  },
  {
    id: 'investigation', name: '分析需求', skill: 'pstack-investigation',
    stages: [
      { id: 'scope', name: '界定问题',
        doing: '复述问题和成功标准；判断简单还是复杂；问"为什么这样设计"时加查历史',
        doneWhen: '问题、范围和交付形式写清' },
      { id: 'explore', name: '探索',
        doing: '读代码和历史收集证据；复杂问题拆 2–4 个角度并行派只读子 agent',
        doneWhen: '每个角度都有带出处的发现' },
      { id: 'explain', name: '讲解成文',
        doing: '按 概览/关键概念/工作原理/代码位置/坑 写清，或给推荐和取舍表；结论带 file:line',
        doneWhen: '讲解写完，结论都有出处' },
      { id: 'reply', name: '回复',
        doing: '去掉 AI 腔，给真实判断；前提错了直说',
        doneWhen: '回复已发出', handback: '结论指向要改代码时：要不要改' },
    ],
  },
  {
    id: 'perf-issue', name: '性能问题', skill: 'pstack-perf-issue', surface: true,
    stages: [
      { id: 'baseline', name: '测基线',
        doing: '在用户说的场景跑测量命令，每个数字过一遍基准测试检查',
        doneWhen: '基线可复现（至少 5 次）并记下结果文件' },
      { id: 'hypothesize', name: '找瓶颈',
        doing: '用 profile 或 trace 找真正耗时处；按口诀从便宜到贵选方案',
        doneWhen: '瓶颈有运行时证据，选定一个方案' },
      { id: 'fix', name: '修复',
        doing: '跨函数边界先画草图；子 agent 实现；一次只试一个改动',
        doneWhen: '改动完成，原有测试通过' },
      { id: 'remeasure', name: '复测对比',
        doing: '同命令同场景至少 5 次，比较中位数和波动；不确定不算通过',
        doneWhen: '修复后数字、差值和结果文件齐全；没变好就回到找瓶颈' },
      { id: 'pr', name: '开 PR/MR',
        doing: '加载 pstack-opening-a-pr，按它整理提交并开 PR/MR（无远端时只本地提交）',
        doneWhen: '提交就绪；回复带基线、修复后、差值、文件路径' },
    ],
  },
  {
    id: 'trace-forensics', name: '分析抓包', skill: 'pstack-trace-forensics',
    stages: [
      { id: 'load', name: '识别加载',
        doing: '认出格式（cpuprofile、heap snapshot、trace json、spindump、日志）并用对应工具加载；大文件交给子 agent 解析，只带回缩减结果',
        doneWhen: '格式确认，能读出样本、帧或节点数' },
      { id: 'transform', name: '转成可查',
        doing: '导入 sqlite，一行一个样本、帧或节点；先有可查询形态再读',
        doneWhen: '能用查询得出总量和前几名' },
      { id: 'narrow', name: '缩小原因',
        doing: '找占时最多的帧并沿调用树走到热路径；泄漏沿引用链到 GC root；卡死找在 CPU 上或阻塞的线程及其等待原因',
        doneWhen: '一个热点、一条引用链或一个卡住的线程' },
      { id: 'attribute', name: '对应源码',
        doing: '用文件自带的符号映射到 file、symbol、line；没有源码映射不算诊断',
        doneWhen: '热点对应到源码位置，或明说文件不带符号' },
      { id: 'confirm', name: '对比确认', optional: true,
        doing: '有前后两份记录就 diff 确认；没有就标为文件能支持的最强假设',
        doneWhen: '写明是已确认还是假设' },
      { id: 'report', name: '结案',
        doing: '交付带出处的诊断，不修',
        doneWhen: '报告发出', handback: '要不要修（转修 bug 或性能问题）' },
    ],
  },
  {
    id: 'blast-radius', name: '爆炸半径', skill: 'pstack-blast-radius',
    stages: [
      { id: 'read', name: '读改动',
        doing: '读 diff、增删改的符号和行为上真正变了什么（含 diff 没写明的）；用 git 历史看来由',
        doneWhen: '改动做了什么写清' },
      { id: 'keyfact', name: '找关键事实',
        doing: '找出改动之所以安全所依赖的那一两条事实',
        doneWhen: '关键事实写成一句可验证的话' },
      { id: 'beyond', name: '查 grep 之外',
        doing: '库源码与锁定版本、执行时机、数据格式、持久化数据、开关、下游多跳',
        doneWhen: '每个方向查过并记下结论' },
      { id: 'rate', name: '评估风险',
        doing: '每条风险写怎么坏、file:line、概率、代价、怎么查；已确认和已排除分开',
        doneWhen: '风险表写完' },
      { id: 'prove', name: '证明',
        doing: '写脚本或测试调用真实代码证明关键事实，记下确定性阶梯到第几级',
        doneWhen: '关键事实已证明，或标为未证明' },
      { id: 'report', name: '交付',
        doing: '改动做了什么、关键事实及证明、风险、已排除、合并前该补的测试',
        doneWhen: '报告发出' },
    ],
  },
  {
    id: 'refactoring', name: '重构', skill: 'pstack-refactoring', surface: true,
    stages: [
      { id: 'pin', name: '钉住行为',
        doing: '先摸清契约，写特征测试、快照或等价对拍；类型检查和 lint 不算',
        doneWhen: '钉子测试在当前代码上通过' },
      { id: 'shape', name: '定目标',
        doing: '说出缺的结构和今天重写会是的形状；跨函数边界先比较两种设计',
        doneWhen: '目标结构写清，并且能删掉分支或非法状态' },
      { id: 'subtract', name: '先删后加',
        doing: '删死代码、只有一个调用者的包装、多余校验',
        doneWhen: '删除完成，钉子仍通过' },
      { id: 'move', name: '小步搬移',
        doing: '每步保持钉子通过；API 调用方一次迁完并删旧 API；核对每个重命名',
        doneWhen: '达到目标结构，钉子通过' },
      { id: 'prove', name: '证明不变',
        doing: '在真实产物上做等价检查：新旧输出 diff、回放基线或冒烟',
        doneWhen: '等价证据贴出' },
      { id: 'worth', name: '值不值',
        doing: '读代码的负担有没有下降；没降就撤回',
        doneWhen: '写明保留还是撤回' },
      { id: 'pr', name: '开 PR/MR',
        doing: '加载 pstack-opening-a-pr，按它整理提交并开 PR/MR（无远端时只本地提交）',
        doneWhen: '提交就绪' },
    ],
  },
  {
    id: 'prototype', name: '出原型', skill: 'pstack-prototype', surface: true,
    stages: [
      { id: 'decide', name: '定决策',
        doing: '写清原型要帮你定的那个决策（布局、交互、密度，或行为、时机、做法）；没有要定的决策就转实现功能',
        doneWhen: '决策和判定标准写清' },
      { id: 'references', name: '找参考', optional: true,
        doing: '方向未定时找先例，归纳几种方向',
        doneWhen: '列出可选方向', handback: '方向太开放时：先挑方向' },
      { id: 'build', name: '搭原型',
        doing: '在仓库外临时目录搭一次性原型；比较时几个方案放在一个开关后面；不写测试不做抽象',
        doneWhen: '每个方案都能跑' },
      { id: 'observe', name: '观察',
        doing: '在匹配的界面观察：视觉看截图，行为看输出或计时；观察就是检验',
        doneWhen: '每个方案都有观察证据' },
      { id: 'present', name: '给结论',
        doing: '方案、证据、取舍、推荐和临时目录路径；说明原型是一次性的',
        doneWhen: '结论发出', handback: '选哪个方向' },
    ],
  },
  {
    id: 'hillclimb', name: '持续调优', skill: 'pstack-hillclimb', surface: true, trail: true,
    stages: [
      { id: 'ground', name: '定目标',
        doing: '摸清目标代码与工作负载，选能复现抱怨的场景；定一个指标、方向和停止条件（目标加最少尝试次数）',
        doneWhen: '指标、方向、停止条件写清', handback: '没给数字时：认可指标和停止条件' },
      { id: 'harness', name: '建测量',
        doing: '写一条可重复的测量命令，证明它能区分场景后冻结；记录基线和必须通过的测试；在仓库外开决策日志 decision.tsv',
        doneWhen: '基线（中位数）已记、测试通过、日志已开' },
      { id: 'loop', name: '循环尝试',
        doing: '每轮一个有机制依据的假设：改动、前后测量、跑测试；过了噪声且测试通过才保留并单独提交，否则整轮撤回；每轮记一行日志',
        doneWhen: '本轮结论已记进日志（可反复进入）' },
      { id: 'stop', name: '判断收手',
        doing: '达到停止条件，或剩下的想法不值得；卡住时先换方向再试',
        doneWhen: '写明为何停' },
      { id: 'pr', name: '开 PR/MR',
        doing: '加载 pstack-opening-a-pr，按它整理提交并开 PR/MR（无远端时只本地提交）',
        doneWhen: '提交就绪；回复带指标、基线到最终的百分比、保留和撤回轮数、日志路径' },
    ],
  },
  {
    id: 'interrogate', name: '代码审查', skill: 'pstack-interrogate', surface: true,
    stages: [
      { id: 'frame', name: '定范围',
        doing: '范围是用户点名的，否则是当前分支相对主干的改动加工作区；用自己的话复述意图',
        doneWhen: '范围和意图写清', handback: '意图不清时：问你意图' },
      { id: 'attack', name: '多方攻击',
        doing: '每个审查方在自己的 git worktree 里尝试弄坏改动，每条发现都要有一次实际运行来证明；审查方用配置的审查模型',
        doneWhen: '每个审查方都交回了发现或“无发现”' },
      { id: 'verify', name: '复核',
        doing: '在新的独立 worktree 逐条重跑命令，输出确实违背意图才保留；同根因合并',
        doneWhen: '留下的每条都复跑过' },
      { id: 'report', name: '出报告',
        doing: '意图、复核过的问题（命令、输出、怎么违背意图、谁发现的）、各审查方被剔除几条及原因；不修',
        doneWhen: '报告发出', handback: '要修哪些' },
    ],
  },
  {
    id: 'multi-phase-plan', name: '分期计划', skill: 'pstack-multi-phase-plan', trail: true,
    stages: [
      { id: 'triage', name: '判断要不要',
        doing: '只改一两个文件且做法明显就不写计划，直接说明并停下',
        doneWhen: '写明要不要计划' },
      { id: 'settle', name: '定未决问题', optional: true,
        doing: '能用原型或探针定的问题先跑掉；只有产品或偏好问题才问你',
        doneWhen: '每个问题已定或标为未证实' },
      { id: 'explore', name: '摸底',
        doing: '子 agent 摸清文件、约定、测试命令和入口，只带回指针不带原文',
        doneWhen: '每个要改的区域都有入口和测试命令' },
      { id: 'write', name: '写计划',
        doing: '按骨架写计划文件：每阶段一节（依赖、改动、验证证据框），附录记原型证据、被否方案、风险',
        doneWhen: '每个占位都填了' },
      { id: 'review', name: '自检',
        doing: '运行本技能目录的 check-plan.mjs，修完打印的每个结构问题',
        doneWhen: '脚本通过，输出已贴出' },
      { id: 'handback', name: '交还',
        doing: '贴出计划路径和脚本输出后停下；你明确说开始才执行',
        doneWhen: '交还完成', handback: '开始执行吗' },
    ],
  },
  {
    id: 'eval', name: 'eval', skill: 'pstack-eval',
    stages: [
      { id: 'frame', name: '定变量',
        doing: '写清要测的变量和成功标准；3–6 条评分表只给评审看',
        doneWhen: '变量和评分表写好' },
      { id: 'setup', name: '隔离环境',
        doing: '每个候选一个干净目录，放好变量和自然任务该有的上下文；目录、文件、提示里都不出现测试痕迹',
        doneWhen: '目录就绪且已清理痕迹' },
      { id: 'prompt', name: '写提示',
        doing: '一条像真实用户会写的请求，不泄露在测什么',
        doneWhen: '提示写好' },
      { id: 'run', name: '并行候选',
        doing: '同一提示并行派给配置的候选模型，各在自己的目录',
        doneWhen: '每个候选都交回结果' },
      { id: 'judge', name: '盲评',
        doing: '不同于所有候选模型家族的评审只看匿名标签和评分表，一次打分；无独立家族则说明限制',
        doneWhen: '评审结论拿到，或已说明无独立家族而跳过' },
      { id: 'audit', name: '核对',
        doing: '从实际文件和改动核对，不信自述；自己通读每个候选的产出，和评审结论对比',
        doneWhen: '分歧已解释' },
      { id: 'synthesize', name: '结论',
        doing: '测了什么、评分表、每个候选、评审结论、你的综合、要不要采用',
        doneWhen: '结论发出' },
    ],
  },
  {
    id: 'create-verification-skill', name: '验证工具', skill: 'pstack-create-verification-skill',
    stages: [
      { id: 'interview', name: '摸清项目',
        doing: '从代码回答五问：用户接触什么界面、怎么启动、怎么驱动、能拿到什么证据、能否并排起两个实例；只问代码答不了的',
        doneWhen: '五问都有答案', handback: '代码答不了的（账号、密钥等）：问你' },
      { id: 'generate', name: '生成技能',
        doing: '在 .dsh/skills/verify-<app>/SKILL.md 写 启动、自检、驱动、证据、清理、辅助脚本 六节，全部来自真实命令与选择器，不留占位',
        doneWhen: '六节都填了真实内容' },
      { id: 'map', name: '功能地图',
        doing: 'features/README.md 加 3–5 个用户功能，每个写子功能、怎么到达、怎么驱动、怎样算证明、坑',
        doneWhen: '地图写好' },
      { id: 'prove', name: '亲自跑通',
        doing: '按生成的技能跑一遍：启动、自检、驱动一个功能、取证、清理；清理后证据仍在；失败就修，每次失败后也跑清理',
        doneWhen: '一次完整跑通，证据路径贴出' },
      { id: 'handoff', name: '交付',
        doing: '说明技能位置、证明结果、在替身环境里没验证到的步骤；提示定期用验证巡检',
        doneWhen: '交付完成' },
    ],
  },
  {
    id: 'maintain-verification-skill', name: '验证巡检', skill: 'pstack-maintain-verification-skill',
    stages: [
      { id: 'locate', name: '找目标',
        doing: '找 .dsh/skills/verify-*（或 .agents/skills/verify-*）；没有就停下并指向验证工具',
        doneWhen: '目标确定', handback: '有多个验证技能时：选哪个' },
      { id: 'index', name: '整理索引',
        doing: '读地图 README 和各功能文件，修缺失、多余、重复、失效条目',
        doneWhen: '索引与文件一一对应' },
      { id: 'source', name: '源码核对',
        doing: '每个功能文件派一个只读子 agent，从源码解释功能、标出疑似漂移（带出处）、给一个验证配方；子 agent 不驱动、不改文件',
        doneWhen: '每个功能都有回报' },
      { id: 'reconcile', name: '合并',
        doing: '合并配方，抽查标出的漂移，扫近期改动找地图漏掉的功能（要有具体源码路径）',
        doneWhen: '待验证清单定好' },
      { id: 'live', name: '实机巡检',
        doing: '按技能自己的启动方式驱动每个功能至少一次；没自检过不驱动，出错后先自检或重置，证据留存',
        doneWhen: '每个功能都跑过' },
      { id: 'triage', name: '分类',
        doing: '描述错就改地图；能用但驱动不了就补驱动；应用真坏了就记下报告，不改文档掩盖',
        doneWhen: '每条问题已归类' },
      { id: 'ship', name: '交付',
        doing: 'changed：加载 pstack-opening-a-pr，用一次提交及一个 PR/MR 交付证明过的修正（无远端时只本地提交）；clean 或 blocked：不提交，如实报告覆盖情况',
        doneWhen: '结论是 clean、changed、blocked 之一' },
    ],
  },
] as const satisfies readonly Workflow[]

export type WorkflowId = typeof workflows[number]['id']
export type StageId = typeof workflows[number]['stages'][number]['id']
export const workflowIds = workflows.map(workflow => workflow.id)
export const stageIds = [...new Set(workflows.flatMap(workflow => workflow.stages.map(stage => stage.id)))]

export function getWorkflow(id: string): Workflow {
  const renamed = Object.hasOwn(LEGACY_WORKFLOW_IDS, id) ? LEGACY_WORKFLOW_IDS[id] : undefined
  if (renamed) throw new Error(`工作流 ${id} 已更名为 ${renamed}；请使用 ${renamed}（/pstack-${renamed}）。`)
  const workflow = workflows.find(workflow => workflow.id === id)
  if (!workflow) throw new Error(`未知工作流 ${id}。可用工作流：${workflowIds.join('、')}。`)
  return workflow
}

export interface StageInput {
  readonly workflow: WorkflowId
  readonly stage: StageId
  readonly note: string
}

export function parseStageInput(raw: unknown): StageInput {
  if (typeof raw !== 'object' || raw === null) throw new Error('pstack_stage 参数必须是对象。')
  const input = raw as Record<string, unknown>
  if (typeof input.workflow !== 'string') throw new Error('workflow 必填。')
  const workflow = getWorkflow(input.workflow)
  if (typeof input.stage !== 'string' || !workflow.stages.some(stage => stage.id === input.stage)) {
    throw new Error(`stage ${String(input.stage)} 不属于 ${workflow.id}。合法目标：${workflow.stages.map(stage => stage.id).join('、')}。`)
  }
  if (typeof input.note !== 'string' || !input.note.trim() || /[\r\n\u2028\u2029]/u.test(input.note)) {
    throw new Error('note 必须是非空的一行文字。')
  }
  // Committed older calls may carry check/repro; those fields no longer have meaning.
  return { workflow: workflow.id as WorkflowId, stage: input.stage as StageId, note: input.note.trim() }
}

export interface StagePosition {
  readonly workflow?: string
  readonly stage?: string
  readonly skipped?: readonly string[]
  readonly history?: readonly { readonly workflow: string; readonly stage: string; readonly kind: string }[]
}

export interface Transition {
  readonly kind: 'enter' | 'handoff' | 'rollback' | 'note'
  readonly index: number
  /** Complete skipped-stage list after this move, including earlier skips. */
  readonly skipped: readonly string[]
  /** Only this move's bypassed stages, for append-only skip history. */
  readonly newlySkipped: readonly string[]
}

/** Describe the report, never enforce an order. The manifest only supplies display order. */
export function transition(current: StagePosition, input: StageInput): Transition {
  const workflow = getWorkflow(input.workflow)
  const target = workflow.stages.findIndex(stage => stage.id === input.stage)
  const switching = current.workflow !== undefined && current.workflow !== input.workflow
  const from = current.workflow === input.workflow
    ? workflow.stages.findIndex(stage => stage.id === current.stage) : -1
  const visited = new Set((current.history ?? [])
    .filter(entry => entry.workflow === input.workflow && entry.kind !== 'skip' && entry.kind !== 'rejected')
    .map(entry => entry.stage))
  if (from >= 0) visited.add(current.stage!)
  const skipped = workflow.stages.slice(0, target).filter(stage => !visited.has(stage.id)).map(stage => stage.id)
  const previous = switching ? [] : current.skipped ?? []
  return {
    kind: switching ? 'handoff' : target === from ? 'note' : target < from ? 'rollback' : 'enter',
    index: target + 1,
    skipped,
    newlySkipped: skipped.filter(stage => !previous.includes(stage)),
  }
}


// Diagrams follow the dsh-canvas public contract (skill name, tool, file suffix) and fall back to plain Mermaid.
const diagramRule = '要画图（流程、状态、架构、依赖）时：可用技能里有 `canvas-diagram` 就先加载它，把图写成 `.mmd` 文件，`canvas_check` 通过后用 `present` 交付；没有就直接输出 `mermaid` 代码块。'

export function stageProtocol(id: string): string {
  const workflow = getWorkflow(id)
  return [
    '## 阶段协议 (stage protocol)',
    '',
    'pstack_stage 自动维护任务清单；不要为 playbook 步骤调用 todo_write。',
    ...workflow.stages.map((stage, index) => `${index + 1}. ${stage.name} (${stage.id})${stage.optional ? ' — optional' : ''}`),
    '',
    `进入每步：pstack_stage(workflow="${workflow.id}", stage="<id>", note="<一行中文说明>")，与本步首个实际工具调用放在同一回复中，先报告再执行。最后一步没有工具调用时，与最终回复一起报告。`,
    '每步首次行动前必须报告，每次重新进入也要再报告（包括 loop 的每轮）；跳过时在下一条 note 写 skip: <步骤及原因>。',
    '阶段只报告进度，不设门槛；可以回退或随时换工作流，小镇会记录实际路径。',
    '启动子 agent 后不轮询；有独立工作就继续，否则说明等待谁并结束回复，结果自动到达。',
    '验证与交付按本技能的 Reply / done 标准执行；最后一步到达、回复结束且助手全部返回后显示完工。',
    diagramRule,
    ...(workflow.surface ? ['仓库里有 `.dsh/skills/verify-*` 时，复现和验证按它的启动、自检、驱动、证据步骤做；没有就跑真实命令，并在回复里建议用「验证工具」生成一个。'] : []),
    '',
    '## 存档',
    '固定停点需要人作决定时：先 pstack_pause(reason="handback", waiting_for="<等待决定>")，再 ask_user_question。',
    ...workflow.stages.filter(stage => stage.handback !== undefined).map(stage => `- 固定停点 ${stage.id}：${stage.handback}。`),
    '存档绝不 commit、stash 或修改代码；git status --short 的未提交路径只列入 resume.uncommitted，不碰它们。',
    ...(workflow.trail ? ['', trailRules] : []),
  ].join('\n')
}

export function stageResult(input: StageInput): string {
  const workflow = getWorkflow(input.workflow)
  const index = workflow.stages.findIndex(stage => stage.id === input.stage)
  const stage = workflow.stages[index]!
  return `已报告 ${index + 1}/${workflow.stages.length} ${stage.name}。本步要做：${stage.doing}。完成标准：${stage.doneWhen}。${stage.handback ? `固定停点：${stage.handback}；需要决定时先存档再询问。` : ''}${workflow.trail ? `\n${trailEnabled}` : ''}`
}
