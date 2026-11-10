// Host stages describe the session trail; plaque summaries explain the available pstack work.
export const ART = {
  feature: {
    name: '实现功能', theme: '工地', color: '#0ea5e9',
    stages: {
      restate: { skills: ['in-your-own-words'] },
      survey: { skills: ['how'] },
      sketch: { skills: ['architect', 'arena'] },
      checkpoint: { skills: ['principle-separate-before-serializing-shared-state'] },
      build: { skills: ['subagent', 'principle-sequence-verifiable-units'] },
      verify: { skills: ['principle-prove-it-works'] },
      interrogate: { skills: ['interrogate'] },
      pr: { skills: ['opening-a-pr'] },
    },
  },
  'runtime-forensics': {
    name: '现场取证', theme: '灭虫急诊站', color: '#3f9e95',
    stages: {
      intake: { skills: ['in-your-own-words'] },
      capture: { skills: ['runtime-forensics', 'control-cli', 'control-ui'] },
      reduce: { skills: ['trace-forensics', 'principle-guard-the-context-window'] },
      hypothesize: { skills: ['how', 'why', 'principle-attack-the-premise'] },
      prove: { skills: ['principle-prove-it-works'] },
      report: { skills: ['technical-writing', 'unslop'] },
    },
  },
  'bug-fix': {
    name: '查 Bug 修复', theme: '灭虫急诊站', color: '#ef4444',
    stages: {
      reproduce: { skills: ['control-cli', 'control-ui'] },
      bisect: { skills: ['how', 'why'] },
      'plan-fix': { skills: ['architect'] },
      red: { skills: ['tdd', 'principle-sequence-verifiable-units'] },
      fix: { skills: ['subagent'] },
      verify: { skills: ['principle-prove-it-works'] },
      interrogate: { skills: ['interrogate'] },
      pr: { skills: ['opening-a-pr', 'no-comments', 'unslop'] },
    },
  },
  investigation: {
    name: '分析需求', theme: '工地', color: '#0ea5e9',
    stages: {
      scope: { skills: ['in-your-own-words'] },
      explore: { skills: ['how', 'why'] },
      explain: { skills: ['technical-writing'] },
      reply: { skills: ['unslop'] },
    },
  },
  'perf-issue': {
    name: '性能问题', theme: '灭虫急诊站', color: '#3f9e95',
    stages: {
      baseline: { skills: ['benchmark-checklist', 'runtime-forensics'] },
      hypothesize: { skills: ['how', 'why', 'principle-attack-the-premise'] },
      fix: { skills: ['subagent', 'principle-fix-root-causes'] },
      remeasure: { skills: ['benchmark-checklist', 'principle-prove-it-works'] },
      pr: { skills: ['opening-a-pr'] },
    },
  },
  'trace-forensics': {
    name: '分析抓包', theme: '灭虫急诊站', color: '#3f9e95',
    stages: {
      load: { skills: ['principle-guard-the-context-window'] },
      transform: { skills: ['trace-forensics'] },
      narrow: { skills: ['trace-forensics'] },
      attribute: { skills: ['how'] },
      confirm: { skills: ['principle-prove-it-works'] },
      report: { skills: ['technical-writing', 'unslop'] },
    },
  },
  'blast-radius': {
    name: '爆炸半径', theme: '侦探社', color: '#9270bb',
    stages: {
      read: { skills: ['how', 'why'] },
      keyfact: { skills: ['blast-radius'] },
      beyond: { skills: ['blast-radius', 'how'] },
      rate: { skills: ['why'] },
      prove: { skills: ['principle-prove-it-works'] },
      report: { skills: ['unslop'] },
    },
  },
  refactoring: {
    name: '重构', theme: '工地', color: '#0ea5e9',
    stages: {
      pin: { skills: ['how', 'principle-prove-it-works'] },
      shape: { skills: ['architect', 'principle-model-the-domain', 'principle-foundational-thinking', 'principle-redesign-from-first-principles'] },
      subtract: { skills: ['principle-subtract-before-you-add', 'principle-laziness-protocol'] },
      move: { skills: ['principle-migrate-callers-then-delete-legacy-apis', 'principle-sequence-verifiable-units'] },
      prove: { skills: ['principle-prove-it-works'] },
      worth: { skills: ['principle-minimize-reader-load'] },
      pr: { skills: ['opening-a-pr', 'principle-sequence-verifiable-units'] },
    },
  },
  prototype: {
    name: '出原型', theme: '工地', color: '#0ea5e9',
    stages: {
      decide: { skills: ['in-your-own-words'], prop: '决策卡', gag: 'check' },
      references: { skills: ['how'], prop: '参考图册', gag: 'map' },
      build: { skills: ['principle-exhaust-the-design-space'], prop: '一次性原型台', gag: 'lift' },
      observe: { skills: ['show-me-your-work'], prop: '观察记录', gag: 'compare' },
      present: { skills: ['technical-writing', 'unslop'], prop: '方案对照板', gag: 'stamp' },
    },
  },
  hillclimb: {
    name: '持续调优', theme: '灭虫急诊站', color: '#3f9e95',
    stages: {
      ground: { skills: ['how', 'in-your-own-words'], prop: '目标旗', gag: 'check' },
      harness: { skills: ['benchmark-checklist'], prop: '基线计量表', gag: 'record' },
      loop: { skills: ['benchmark-checklist', 'principle-fix-root-causes'], prop: '尝试日志', gag: 'spark' },
      stop: { skills: ['principle-attack-the-premise'], prop: '收手标记', gag: 'thumb' },
      pr: { skills: ['technical-writing'], prop: '保留改动包', gag: 'parcel' },
    },
  },
  interrogate: {
    name: '代码审查', theme: '侦探社', color: '#9270bb',
    stages: {
      frame: { skills: ['in-your-own-words'], prop: '范围卷宗', gag: 'ink' },
      attack: { skills: ['interrogate'], prop: '复现放大镜', gag: 'thump' },
      verify: { skills: ['principle-prove-it-works'], prop: '证据核对表', gag: 'check' },
      report: { skills: ['technical-writing', 'unslop'], prop: '问题报告', gag: 'stamp' },
    },
  },
  'multi-phase-plan': {
    name: '分期计划', theme: '工地', color: '#0ea5e9',
    stages: {
      triage: { skills: ['principle-laziness-protocol'], prop: '规模尺', gag: 'check' },
      settle: { skills: ['architect'], prop: '原型探针', gag: 'compare' },
      explore: { skills: ['how'], prop: '区域地图', gag: 'map' },
      write: { skills: ['technical-writing'], prop: '分期计划板', gag: 'ink' },
      review: { skills: ['principle-sequence-verifiable-units'], prop: '证据勾选框', gag: 'check' },
      handback: { skills: ['unslop'], prop: '计划交接包', gag: 'parcel' },
    },
  },
  eval: {
    name: 'eval', theme: '侦探社', color: '#9270bb',
    stages: {
      frame: { skills: ['in-your-own-words'], prop: '变量与评分表', gag: 'check' },
      setup: { skills: ['principle-separate-before-serializing-shared-state'], prop: '隔离目录', gag: 'cut' },
      prompt: { skills: ['technical-writing'], prop: '自然任务卡', gag: 'ink' },
      run: { skills: ['subagent'], prop: '候选工作台', gag: 'lift' },
      judge: { skills: ['arena'], prop: '匿名天平', gag: 'compare' },
      audit: { skills: ['principle-prove-it-works'], prop: '产出核对表', gag: 'check' },
      synthesize: { skills: ['technical-writing', 'unslop'], prop: '综合结论', gag: 'stamp' },
    },
  },
  'create-verification-skill': {
    name: '验证工具', theme: '侦探社', color: '#9270bb',
    stages: {
      interview: { skills: ['create-verification-skill', 'how'], prop: '五问清单', gag: 'echo' },
      generate: { skills: ['create-verification-skill', 'principle-build-the-lever'], prop: '验证手册', gag: 'ink' },
      map: { skills: ['create-verification-skill'], prop: '功能地图', gag: 'map' },
      prove: { skills: ['principle-prove-it-works'], prop: '证据袋', gag: 'check' },
      handoff: { skills: ['technical-writing', 'unslop'], prop: '交接清单', gag: 'parcel' },
    },
  },
  'maintain-verification-skill': {
    name: '验证巡检', theme: '侦探社', color: '#9270bb',
    stages: {
      locate: { skills: ['maintain-verification-skill'], prop: '技能目录', gag: 'map' },
      index: { skills: ['maintain-verification-skill'], prop: '地图索引', gag: 'ink' },
      source: { skills: ['subagent', 'how'], prop: '源码卷宗', gag: 'sift' },
      reconcile: { skills: ['principle-attack-the-premise'], prop: '待验证清单', gag: 'compare' },
      live: { skills: ['principle-prove-it-works'], prop: '巡检提灯', gag: 'spark' },
      triage: { skills: ['principle-fix-root-causes'], prop: '分类标签', gag: 'stamp' },
      ship: { skills: ['opening-a-pr', 'unslop'], prop: '巡检报告', gag: 'parcel' },
    },
  },
  'create-formal-verification-skill': {
    name: '形式化验证', theme: '侦探社', color: '#9270bb',
    stages: {
      target: { skills: ['create-formal-verification-skill', 'how'], prop: '关键性质卷宗', gag: 'map' },
      tool: { skills: ['create-formal-verification-skill'], prop: '验证工具箱', gag: 'compare' },
      generate: { skills: ['create-formal-verification-skill', 'statechart'], prop: '模型与覆盖记录', gag: 'ink' },
      prove: { skills: ['principle-prove-it-works'], prop: '破坏性验证证据', gag: 'check' },
      handoff: { skills: ['technical-writing', 'unslop'], prop: '性质与边界说明', gag: 'parcel' },
    },
  },
  'maintain-formal-verification-skill': {
    name: '形式化巡检', theme: '侦探社', color: '#9270bb',
    stages: {
      locate: { skills: ['maintain-formal-verification-skill'], prop: '覆盖与同步记录', gag: 'map' },
      baseline: { skills: ['principle-prove-it-works'], prop: '原始检查结果', gag: 'check' },
      changes: { skills: ['maintain-formal-verification-skill', 'how'], prop: '覆盖代码变更', gag: 'sift' },
      update: { skills: ['maintain-formal-verification-skill', 'statechart'], prop: '模型修订稿', gag: 'ink' },
      judge: { skills: ['principle-prove-it-works'], prop: '反例与故障核对表', gag: 'compare' },
      sync: { skills: ['maintain-formal-verification-skill'], prop: '同步提交印章', gag: 'stamp' },
      report: { skills: ['technical-writing', 'unslop'], prop: '漂移与缺陷报告', gag: 'parcel' },
    },
  },
  'figure-it-out': {
    name: '想办法', theme: '工地', color: '#0ea5e9',
    stages: {
      frame: { skills: ['figure-it-out', 'principle-prove-it-works'], prop: '完成判据', gag: 'check' },
      design: { skills: ['principle-foundational-thinking', 'architect'], prop: '阶段清单', gag: 'map' },
      loop: { skills: ['principle-sequence-verifiable-units'], prop: '实验记录', gag: 'spark' },
      trail: { skills: ['show-me-your-work'], prop: '工作日志', gag: 'ink' },
      verify: { skills: ['principle-prove-it-works', 'principle-encode-lessons-in-structure'], prop: '验收章', gag: 'stamp' },
    },
  },
};

// Sources are relative to upstream pstack/skills.
export const PLAQUES = {
  investigation: {
    id: 'investigation', name: '分析需求', building: 'construction', source: 'poteto-mode/playbooks/investigation.md', kind: 'playbook',
    summary: '想弄清现有代码怎样工作，或判断一个需求值不值得做时用这个。它只阅读和分析，不修改代码。你会得到有出处的说明，或列出各方案利弊的建议，再决定下一步。',
  },
  prototype: {
    id: 'prototype', name: '出原型', building: 'construction', source: 'poteto-mode/playbooks/prototype.md', kind: 'playbook',
    summary: '拿不准界面、交互或技术做法时，先用一次性原型比较几个方向。它会在独立目录里做出可体验的版本，展示实际效果和各自的取舍。你会得到推荐方向和原型文件，正式可用的功能另走实现流程。',
  },
  'multi-phase-plan': {
    id: 'multi-phase-plan', name: '分期计划', building: 'construction', source: 'poteto-mode/playbooks/multi-phase-plan.md', kind: 'playbook',
    summary: '改动较大、需要分几批交付时，用它把工作拆成可以逐项执行的计划。它会先研究代码和未定问题，写清每一阶段的依赖、改动范围和验收办法。交付的是检查过的计划，不是代码，等你明确说开始后才进入实施。',
  },
  feature: {
    id: 'feature', name: '实现功能', building: 'construction', source: 'poteto-mode/playbooks/feature.md', kind: 'playbook',
    summary: '需要新增功能或改变现有行为时，会先了解代码、确定设计，再完成实现并在真实使用场景中验证。只有你明确要求设计检查点时，才会停在设计阶段等你确认。你会拿到可用的功能，以及方案选择和验证结果的说明。',
  },
  refactoring: {
    id: 'refactoring', name: '重构', building: 'construction', source: 'poteto-mode/playbooks/refactoring.md', kind: 'playbook',
    summary: '代码越来越难读，但现有功能应保持不变时，用它整理结构。它会先记录现有行为，删除多余代码，再分小步调整并检查行为是否一致。你会得到更容易维护的代码，以及功能没有被改变的验证结果。',
  },
  'figure-it-out': {
    id: 'figure-it-out', name: '想办法', building: 'construction', source: 'figure-it-out/SKILL.md', kind: 'skill',
    summary: '活儿大、跨很多地方，或者你想放手离开回头再验收时用这个；没有合适的木牌时也走这里。它先写下可检验的完成标准，再为这件事设计专属的分步流程，每步当实验做，推进才保留。你会拿到设计的流程、逐步的验证结论和一份可审计的工作日志。',
  },
  interrogate: {
    id: 'interrogate', name: '代码审查', building: 'detective', source: 'interrogate/SKILL.md', kind: 'skill',
    summary: '想在交付前找出代码改动或设计中的漏洞时，用它做多方审查。不同审查者会尝试把问题实际复现出来，无法证实的猜测不会当成已确认的问题。你会收到合并后的问题和复现证据，由你决定后续修复，不会直接改代码。',
  },
  'blast-radius': {
    id: 'blast-radius', name: '爆炸半径', building: 'detective', source: 'blast-radius/SKILL.md', kind: 'skill',
    summary: '担心一处改动会影响别处时，用它追查调用关系、数据约定和运行时行为。它会找出改动安全所依赖的关键事实，并尽量用真实代码验证，而不只列出可能受影响的文件。你会得到已确认风险、已排除风险和仍未证实之处，以及合并前该做的检查。',
  },
  eval: {
    id: 'eval', name: 'eval', building: 'detective', source: 'poteto-mode/playbooks/eval.md', kind: 'playbook',
    summary: '想知道不同模型或做法哪一个更适合真实任务时，用它做公平对比。它会让候选完成同一请求，隐藏候选身份后按统一标准评审，并核对实际产出和执行记录。你会得到各方案的表现、评审结论和是否采用的建议。',
  },
  'create-verification-skill': {
    id: 'create-verification-skill', name: '验证工具', building: 'detective', source: 'create-verification-skill/SKILL.md', kind: 'skill',
    summary: '为这个项目生成一套能反复跑的验证步骤，覆盖启动、自检、用户操作、取证和清理。亲自跑通一个真实功能，确认清理后证据还在，再交付功能地图和没验证到的地方。',
  },
  'maintain-verification-skill': {
    id: 'maintain-verification-skill', name: '验证巡检', building: 'detective', source: 'maintain-verification-skill/SKILL.md', kind: 'skill',
    summary: '按源码逐项核对功能地图，再在真实应用里把每个功能走一遍。只改验证说明和脚本，应用真坏了就带证据报告，不改产品代码。最后说明是无需改动、已修正还是受阻。',
  },
  'create-formal-verification-skill': {
    id: 'create-formal-verification-skill', name: '形式化验证', building: 'detective', source: 'create-formal-verification-skill/SKILL.md', kind: 'skill',
    summary: '找出代码中出错代价高、普通测试难覆盖的承诺，选合适的模型检查器或证明工具，生成项目专用的验证技能。用真实代码的破坏性改动证明检查能抓住问题，再说明性质、边界、假设和重跑命令；发现产品缺陷只报告，不擅自修代码。',
  },
  'maintain-formal-verification-skill': {
    id: 'maintain-formal-verification-skill', name: '形式化巡检', building: 'detective', source: 'maintain-formal-verification-skill/SKILL.md', kind: 'skill',
    summary: '代码变了以后，按上次同步提交追查覆盖范围内的每项改动，让模型、性质和验证技能重新对应真实代码。先留基线，再更新和重跑，区分验证漂移与产品缺陷；只改验证文件，不为过关削弱性质，并逐项报告已同步、已更新、发现缺陷或受阻。',
  },
  'runtime-forensics': {
    id: 'runtime-forensics', name: '现场取证', building: 'clinic', source: 'poteto-mode/playbooks/runtime-forensics.md', kind: 'playbook',
    summary: '程序正在卡顿、漏内存或显示异常，需要现场查原因时用这个。它会在出问题的界面采集运行数据，验证原因并对应到源码，而不是只看代码猜测。最后给你一份带证据和源码位置的诊断报告，再问你要不要修复。',
  },
  'trace-forensics': {
    id: 'trace-forensics', name: '分析抓包', building: 'clinic', source: 'poteto-mode/playbooks/trace-forensics.md', kind: 'playbook',
    summary: '手里已经有性能记录、内存快照或卡住时的线程记录，想知道问题在哪时用这个。它会分析已有文件，找出耗时或占用内存的来源并对应到源码，不重新采集现场。你会拿到带源码位置的诊断，明确哪些已被前后记录证实、哪些仍是假设，不会直接开始修复。',
  },
  'bug-fix': {
    id: 'bug-fix', name: '修 bug', building: 'clinic', source: 'poteto-mode/playbooks/bug-fix.md', kind: 'playbook',
    summary: '功能出错、希望查明原因并修好时，用它复现问题、定位根因，再做有证据支持的最小修复。它会先自行操作，只有已尽力尝试仍无法到达出问题的界面时，才会说明具体原因并请你帮助复现。你会拿到修复结果，以及同一场景从失败到通过的验证证据。',
  },
  'perf-issue': {
    id: 'perf-issue', name: '性能问题', building: 'clinic', source: 'poteto-mode/playbooks/perf-issue.md', kind: 'playbook',
    summary: '遇到一次明确的卡顿或性能下降，想有依据地修好时用这个。它会先测量当前表现，找出真正耗时的地方，再修改代码并用相同场景复测。你会得到修复前后的数据、差异和记录文件，而不是只凭感觉说变快了。',
  },
  hillclimb: {
    id: 'hillclimb', name: '持续调优', building: 'clinic', source: 'poteto-mode/playbooks/hillclimb.md', kind: 'playbook',
    summary: '想围绕一个可测量的目标持续改进，而不只是修一次性能问题时用这个。它会固定测量方法，每轮只尝试一个想法，确认有效且没有破坏原有功能才保留，否则撤回。达到约定条件或继续尝试已不值得时，会交付最终结果、保留的改动和每轮尝试记录。',
  },
};

// Every workflow id is its plaque id (old hosts' ids are mapped in mapBoard before they get here).
export const plaqueForWorkflow = (workflow) => (Object.hasOwn(PLAQUES, workflow) ? PLAQUES[workflow] : null);

// ---------- Pixel sprites ----------
// One 32-colour palette, light from the top left. Every sprite is rows of palette keys
// ('.' transparent; short rows pad right). The town rasterizes them once onto offscreen canvases.
export const PALETTE = {
  0: '#241a26',
  1: '#264a3a', 2: '#3b7044', 3: '#5c9a48', 4: '#93c35a', 5: '#cfe08a',
  w: '#4a2c2a', x: '#7c4a33', y: '#b0703e', z: '#dca060',
  a: '#45435a', b: '#77768a', c: '#aeaab8', d: '#e0dbd6',
  e: '#8f6a4a', f: '#c49a66', g: '#ead2a2', W: '#fff8e6',
  R: '#6e2438', r: '#c2413f', o: '#f07e5e',
  B: '#2b4a7c', u: '#4c86c6', i: '#92d2ee',
  Y: '#d9952a', j: '#f8d55a',
  P: '#563d7c', p: '#9270bb',
  M: '#3f9e95', m: '#a6e3c8',
  K: '#c27a58', k: '#f4c39a',
};

const rgba = Object.fromEntries(Object.entries(PALETTE).map(([key, hex]) => [key, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]));

/**
 * Rasterize layers of palette rows into RGBA. Layers paint in order; `map` renames keys
 * (outfit roles) before lookup. `outline` wraps the silhouette in a 1px palette-0 edge.
 */
export function rasterize(layers, { map = {}, outline = true } = {}) {
  const pad = outline ? 1 : 0;
  let w = 0, h = 0;
  for (const { rows, x = 0, y = 0 } of layers) {
    h = Math.max(h, y + rows.length);
    for (const row of rows) w = Math.max(w, x + row.length);
  }
  const W = w + pad * 2, H = h + pad * 2;
  const keys = new Array(W * H).fill(null);
  for (const { rows, x = 0, y = 0 } of layers) rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const key = map[row[c]] ?? row[c];
      if (key !== '.') keys[(y + r + pad) * W + x + c + pad] = key;
    }
  });
  if (outline) {
    const solid = keys.map((key) => key !== null);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (solid[r * W + c]) continue;
      if ((c > 0 && solid[r * W + c - 1]) || (c < W - 1 && solid[r * W + c + 1]) || (r > 0 && solid[(r - 1) * W + c]) || (r < H - 1 && solid[(r + 1) * W + c])) keys[r * W + c] = '0';
    }
  }
  const data = new Uint8ClampedArray(W * H * 4);
  keys.forEach((key, i) => {
    if (key === null) return;
    const color = rgba[key];
    if (!color) throw new Error(`Unknown palette key "${key}"`);
    data.set([...color, 255], i * 4);
  });
  return { w: W, h: H, data };
}

// Characters are 14×22 before the outline: head rows 0-9, torso 10-16, legs 17-21.
// Role keys: H hat, h hat shade, T hat light, N hat band, Q hair, C coat, c coat shade,
// D coat light, A accent, L legs, l leg shade, S shoes. Faces paint over rows 6 and 8.
const legs = {
  stand: ['....LL..Ll', '....LL..Ll', '....Ll..Ll', '....Ll..Ll', '...SSS..SSS'],
  stepA: ['....LL..Ll', '....LL..Ll', '....Ll..Ll', '...SSS..Ll', '........SSS'],
  stepB: ['....LL..Ll', '....LL..Ll', '....Ll..Ll', '....Ll..SSS', '...SSS'],
  seated: ['...LLLLLLll', '...SSS..SSS'],
};
export const CHARACTERS = {
  outfits: {
    detective: {
      map: { H: 'x', h: 'w', T: 'y', N: '0', Q: 'w', C: 'f', c: 'e', D: 'g', A: 'W', L: 'b', l: 'a', S: 'w' },
      head: ['....hHHHHh', '...hTTTTTHh', '...NNNNNNNN', '.hHHHHHHHHHHh', '..hhhhhhhhhh', '...QQkkkkQQ', '...QkkkkkkK', '...kkkkkkkK', '...kokkkkoK', '....KkkkkK'],
      torso: ['....DCAACc', '....DCApCc', '....CCApCc', '....wwwwww', '....CCCCCc', '....CCCCCc', '....CCc.Cc'],
    },
    clinic: {
      map: { H: 'W', h: 'c', T: 'W', Q: 'x', C: 'r', c: 'R', D: 'o', A: 'W', L: 'r', l: 'R', S: 'Y' },
      head: ['', '....hHHHHh', '...hHHHrHHh', '...hHHrrrHh', '..QQhHHrHhQQ', '..QQkkkkkkQQ', '...QkkkkkkK', '...kkkkkkkK', '...kokkkkoK', '....KkkkkK'],
      torso: ['....DCAACc', '....DCCACc', '....CCCACc', '....jYjjYj', '....CCCCCc', '....CCCCCc', '....CCCcCc'],
    },
    construction: {
      map: { H: 'j', h: 'Y', T: 'W', Q: 'e', C: 'i', c: 'u', D: 'W', A: 'i', L: 'u', l: 'B', S: 'w' },
      head: ['', '....hHHHHh', '...hTTHHHHh', '..hHTHHHHHHh', '.hhhhhhhhhhhh', '...QkkkkkkQ', '...QkkkkkkK', '...kkkkkkkK', '...kokkkkoK', '....KkkkkK'],
      torso: ['....ooCCor', '....ooCCor', '....jjCCjj', '....ooCCor', '....ooCCrr', '....eeeeee', '....LLLLLl'],
    },
  },
  legs,
  // [first row, rows]
  arms: {
    down: [10, ['..DC......Cc', '..CC......Cc', '..CC......Cc', '..Cc......Cc', '..Cc......cc', '..kK......kK']],
    watch: [10, ['..DC......Cc', '..CC......Cc', '...CC....Cc', '....kk0Wkk', '......0a']],
    work1: [10, ['..DC.....CCc', '..CC.....Cc', '..CC....kK', '..Cc', '..Cc', '..kK']],
    work2: [8, ['...........kK', '..........Cc', '..DC......Cc', '..CC', '..CC', '..Cc', '..Cc', '..kK']],
    wave1: [5, ['...........kK', '...........Cc', '...........Cc', '..........Cc', '..........Cc', '..DC......Cc', '..CC', '..CC', '..Cc', '..Cc', '..kK']],
    wave2: [5, ['............kK', '............Cc', '...........Cc', '..........Cc', '..........Cc', '..DC......Cc', '..CC', '..CC', '..Cc', '..Cc', '..kK']],
    cheer: [5, ['kK..........kK', 'Cc..........Cc', '.Cc........Cc', '.Cc........Cc', '..Cc......Cc', '..DC......Cc']],
  },
  faces: {
    open: [6, ['.....0..0']],
    closed: [6, ['....KK..KK']],
    worried: [6, ['.....0..0', '', '......00']],
    smile: [6, ['.....0..0', '', '.....R..R', '......RR']],
  },
  minion: ['..jjj', '.jWjjY', '.j0j0Y', '..YYY', '.CCCCc', 'kCCCCck', '.CCCCc', '.w...w'],
};

/** Layers for one character frame. `bob` lowers head, torso and arms by a pixel. */
export function characterLayers(workflow, { arms = 'down', legs: legPose = 'stand', face = 'open', bob = 0, droop = 0 } = {}) {
  const outfit = CHARACTERS.outfits[workflow];
  const [armRow, armRows] = CHARACTERS.arms[arms];
  const [faceRow, faceRows] = CHARACTERS.faces[face];
  const top = bob + droop;
  return {
    map: outfit.map,
    layers: [
      { rows: (outfit.legs ?? CHARACTERS.legs)[legPose], y: 17 },
      { rows: outfit.torso, y: 10 + bob },
      { rows: outfit.head, y: top },
      { rows: faceRows, y: faceRow + top },
      { rows: armRows, y: armRow + bob },
    ],
  };
}

// One prop per plaque. Bottom row stands on the floor; no workflow-stage art.
export const PROPS = {
  investigation: [
    '......jjj', '....bjjjjjY', '..ccbjj0jjY.......WWWWWWW', '....bYYYYY........WuuWuWW', '.....aaaa.........WuWWuWW', '......ab..........WuuuuWW', '.....x.yx.........WWWWWWW', '....x..y.x......zzzzzzzzzy', '....x..y..x.....yxxxxxxxxw', '...x...y..x......xw....xw', '...x...y...x.....xw....xw', '..x....y...x....ww....ww',
  ],
  prototype: [
    '...ggg..........gggg', '..gWWWg.........gWWg', '.gWWWWWg........gWWg.......j', '.gWWWWWg....gggggggg.......b', '.eeeeeee....effffffe......b', '.....................aabaaa', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzy', 'zyyyyyyyyyyyyyyyyyyyyyyyyyyx', 'yxxxxxxxxxxxxxxxxxxxxxxxxxxw', '.xw......................xw', '.xwyyyyyyyyyyyyyyyyyyyyyyxw', '.ww......................ww',
  ],
  'multi-phase-plan': [
    'zzzzzzzzzzzzzzzzzzzzzzzy', 'zWWWWWWWWWWWWWWWWWWWWWx', 'zWcWcWcWcWcWcWcWcWcWWx', 'zWrRRRRRWWWWWWWWWWWWWx', 'zWcWcWcWcWcWcWcWcWcWWx', 'zWWWWWuBBBBBBBWWWWWWWx', 'zWcWcWcWcWcWcWcWcWcWWx', 'zWWWWWWWWWWmMMMMMMWWWx', 'zWcWcWcWcWcWcWcWcWcWWx', 'yxxxxxxxxxxxxxxxxxxxxxxw', '..xw................xw', '..xw................xw', '.ww..................ww',
  ],
  feature: [
    'jjjjjjjjjjjjjjjjjjjYjjjaa', 'Y.Y.Y.Y.Y.Y.Y.Y.Y.jYY.aaa', 'jjjjjjjjjjjjjjjjjjjYjjjaa', '..b...............jY', '..b...............Yj', '..b...............jY', '.ccc..............Yj', 'bdddddc...........jY', 'bccccccb..........Yj', '..................jY', '..................Yj', '...........ddddddcjY', '...........ccccccbYj', '..........dddddddcjY', '..........cccccccbYj', '.........aaaaaaaaaaaaa',
  ],
  refactoring: [
    '.b................b', '.bccccccccccccccccb', '.b.x..........x...b', '.b..x........x....b', '.b...x......x.....b', '.b....x....x......b', '.bzzzzzzzzzzzzzzzzy', '.b.y.............xb', '.b..y............xb...cccc', '.b...y...........xb...cbba', '.b....y..........xb....yx', '.b.....y.........xb....yx', 'abbba..........abbba...yx',
  ],
  // A blueprint easel with a three-box flow drawn on it, and the idea's bulb beside it.
  'figure-it-out': [
    '..................jj', '.................jWjY', '.................jjjY', '..................YY', 'BBBBBBBBBBBBBBBB..ab', 'BuuuuuuuuuuuuuuB', 'BuWWWuuuuuuWWWuB', 'BuWuWiiiiiiWuWuB', 'BuWWWuuuuuuWWWuB', 'BuuuuuuuuuuuiuuB', 'BuuuuWWWiiiiiuuB', 'BuuuuWuWuuuuuuuB', 'BuuuuWWWuuuuuuuB', 'BBBBBBBBBBBBBBBB', '..xw........xw', '..xw........xw', '.xw..........xw',
  ],
  interrogate: [
    '.......cddddc', '......cdiiiiWc', '.....cdiiiiiiWc', '.....cdiiWiiiWc', '.....cdiiiiiiWc', '......cddiiidc', '.......cccccc', '..gWWWWWWWyxWWWWWg......r', '..gWrrrWWWWyxW333g.....r', '..gWWWWWWWWWyxWWWg....r', '..gW333WWWWrrrWWWg...r', '..gWWWWWWWWWWWWWWg..r', 'zzzzzzzzzzzzzzzzzzzzzzzzzy', 'yxxxxxxxxxxxxxxxxxxxxxxxxw', '.xw....................xw.', '.ww....................ww.',
  ],
  'blast-radius': [
    '..gggggggggggggggg', '..g33uu3333uu3333g', '..g3uurrRRRru3333g', '..g3ur333333ru333g.......j.o', '..g3r333b3333r333g......b', '..g3r33b.b333r333g.....aa', '..g3urbbbbb3ru333g...aaaaaa', '..g33urrRRRru3333g..abaaaaaa', '..gggggggggggggggg..abaaaaaa', '....xw.......xw.....aaaaaaa', '....xw.......xw......aaaaa', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzy', 'yxxxxxxxxxxxxxxxxxxxxxxxxxxw', '.xw......................xw.', '.ww......................ww.',
  ],
  eval: [
    '............jjj', '...........jWjjY', '...........00000', '.....jjjjjjjjjjjjjjjjjj', '.....Y......jY.......Y', '....Y.Y.....jY......Y.Y', '...Y...Y....jY.....Y...Y', '..Y.....Y...jY....Y.....Y', '.ccccccccc..jY...ccccccccc', '..cdddddcc..jY....cdddddcc', '...ccccc....jY.....ccccc', '..........jjjjjY', '.........jjjjjjjY', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzy', 'yxxxxxxxxxxxxxxxxxxxxxxxxxxw', '.xw......................xw.', '.ww......................ww.',
  ],
  'create-verification-skill': [
    '....cbbbc', '.yyycWWWcyyy', '.yWWWWWWWWWx', '.yWbbbbWW33x.....dddd', '.yWWWWWW33Wx...ddWWWWdd', '.yWW3WW33WWx..dW3WWWWrWd', '.yWW3333WWWx..dW3WW0WrWd', '.yWWW33WWWWx..dWWW0WWWWd', '.yWWWWWWWWWx..dddddddddd', '.yWbbbbbbWWx.rrrrrrrrrrrR', '.yWWWWWWWWWx.rooooojooorR', '.yxxxxxxxxxw.RRRRRRRRRRRR', 'zzzzzzzzzzzzzzzzzzzzzzzzzy', 'yxxxxxxxxxxxxxxxxxxxxxxxxw', '.xw....................xw', '.ww....................ww',
  ],
  'maintain-verification-skill': [
    '...aa', '..abba', '.abjjba', '.abjWba', '.abjjba..xy............yx', '.abjjba..xyggggggggggggyx', '..abba...xyg3gguuggggRgyx', '...xy....xygg3gugrrrgrgyx', '...xy....xyRrrgugrgggggyx', '...xy....xyggrrrrrggg3gyx', '...xy....xyggggguggggggyx', '..xxyy...xy............yx', 'zzzzzzzzzzzzzzzzzzzzzzzzzzy', 'yxxxxxxxxxxxxxxxxxxxxxxxxxw', '.xw.....................xw', '.ww.....................ww',
  ],
  'create-formal-verification-skill': [
    '..yyyyyyyyyyyyyyyyyyyyyx', '..yWWWWWWWWWWWWWWWWWWWx', '..yWuuuuWWWWWppppWWWWWx', '..yWuWWuWWWWWpWWpWWWWWx', '..yWuuuuuuuWWppppWWWWWx', '..yWWWWWWWuWWWWpWWWWWWx', '..yWWWWWWWuuuuupWWWW3Wx', '..yWWWWWWWWWWWWpWWW3WWx', '..yWWWWWWWWWWWWpW33WWWx', '..yxxxxxxxxxxxxxxxxxxxw', '....xw............xw', '....xw............xw', 'zzzzzzzzzzzzzzzzzzzzzzzzy', 'yxxxxxxxxxxxxxxxxxxxxxxxw', '.xw...................xw', '.ww...................ww',
  ],
  'maintain-formal-verification-skill': [
    '..yyyyyyyyyyyyyyyyyx', '..yWuuuuWWrrrWWpppWx', '..yWuWWuWWrWrWWpWpWx', '..yWuuuuuurWrrrpppWx', '..yWWWWWWWWWWWWWWWx....jj', '..yWbbbbbbbbWWWWWWx...jWjY', '..yWWWWWWWWWWWWWWWx....jY', '..yW333WWrrrrWWWWWx....b', '..yxxxxxxxxxxxxxxxw...bbb', '....xw.........xw....bWjb', '....xw.........xw....bjjb', '....xw.........xw.....bb', 'zzzzzzzzzzzzzzzzzzzzzzzzy', 'yxxxxxxxxxxxxxxxxxxxxxxxw', '.xw...................xw', '.ww...................ww',
  ],
  'runtime-forensics': [
    'ddddddddddddddddc', 'dcaaaaaaaaaaaaacb', 'dcaBBBBBBBBBoracb', 'dcaBBBBBBBBBrRacb', 'dcaBBBBBBBBBBBacb', 'dcaBBBB4BBBBBBacb', 'dcaBBB4B4BBBBBacb', 'dca444BBB4B444acb', 'dcaBBBBBBB4BBBacb', 'dcaaaaaaaaaaaaacb', 'dcccjcjcccccccccb', 'cbbbbbbbbbbbbbbbb', '.zzzzzzzzzzzzzzzy', '.yxxxxxxxxxxxxxxw', '.xw...........xw', '.xyyyyyyyyyyyyyw', '.ww...........ww',
  ],
  'trace-forensics': [
    '......xxxxxxxxxxxxxxx', '..ee..xgffgfgffgfgfex', '.efge.xfgfffjffgfffex', 'efggfexbcbcbcbcbcbcbx', 'efggfezzzzzzzzzzzzzzy', 'efgffeyxxxxxxxxxxxxxw', 'effffe.w....j......w', '.eeee..w....Y......w', '.......w...ccc.....w', '......yzzzciWiczzzzy', '......yxxxciYicxxxxxw', '......xwwwcccccwwwww',
  ],
  'bug-fix': [
    '..........j.o', '...........j', '.......ccb.oj', '......cbbbb.......0..0', '.....cb............00', '....cb............2332', '...ccb...........234432', '..bccb..........02333320', 'dddddddddddddddddddddddc', 'dWWWWWWWWWWWWWWWWWWWWWc', 'cbbbbbbbbbbbbbbbbbbbbbb', '.a..................a', '.a..................a', 'aaa................aaa',
  ],
  'perf-issue': [
    '....ccc', '.....b..........cccddddccc', '...ddddd.......cdWWWWWWWWdc', '..dWWWWdW.....cdW3WWWWWrWWc', '.dWWWbWWd....cdWWW3WWWrrWWWc', '.dWWWbWWd....cWWWWWbWrWWWWWc', '.dWWWbbbWd...cWWWWWWbWWWWWWc', '..dWWWWWd.....cWWWWWWWWWWWc', '...ddddd.......ccccccccccc', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzy', 'yxxxxxxxxxxxxxxxxxxxxxxxxxxw', '.xw......................xw', '.ww......................ww',
  ],
  hillclimb: [
    '.....................brrr', '.....................brro', '.....................brr', '...................ccb', '..................cddc', '.................cdddc', '...............ccddjdc', '..............cdddddcc', '............ccddjddccc', '...........cddddddcccc', '.........ccddjddddcccc', '.......ccdddddddcccccc', '.....ccddddjdddccccccc', '...ccdddddddddcccccccc', '.ccddddjdddddccccccccc',
  ],
};

// Scenery, status overlays, gag motifs and ambient critters.
const doublePixels = (rows) => rows.flatMap((row) => {
  const wide = [...row].map((pixel) => pixel + pixel).join('');
  return [wide, wide];
});
export const SPRITES = {
  save: ['BBBBBBB.', 'BWWWWBBu', 'BWBBWBuu', 'BWWWWBuu', 'BBBBBBuu', 'BWWWWBuu', 'BWbbWBuu', 'BWWWWBuu'],
  pause: ['WWWWWWWWW', 'WPPWWPPWW', 'WPPWWPPWW', 'WPPWWPPWW', 'WPPWWPPWW', 'WWWWWWWWW'],
  lightning: ['....jj', '...jj', '..jj', '.jjjjj', '...jj', '..jj', '.jj'],
  punchClock: ['.zzzzzzzzzz', '.yggggggggx', '.yg.WWWW.gx', '.ygWW0WWWgx', '.ygWW00WWgx', '.ygWWWWWWgx', '.yg.WWWW.gx', '.yggggggggx', '.yg000000gx', '.yggWWWWggx', '.yggWrrWggx', '.yggWWWWggx', '.yxxxxxxxxw', '...a....a'],
  caseCabinet: ['zzzzzzzzzzzz', 'yggggggggggx', 'ygfffffffegx', 'ygffWWfffegx', 'yggggggggggx', 'ygfffffffegx', 'ygffWWfffegx', 'yggggggggggx', 'ygfffffffegx', 'ygffWWfffegx', 'yxxxxxxxxxxw', '.w........w'],
  medicalRack: ['.c........c', '.c.WWWWWW.c', '.c.WrrWWW.c', '.c.WWrWWW.c', '.cWWWWWWWWc', '.cbbbbbbbbc', '.c.WWWWWW.c', '.c.WrrWWW.c', '.c.WWrWWW.c', '.cWWWWWWWWc', '.cbbbbbbbbc', 'aaa......aaa'],
  chair: ['yyyyyyyyyy', 'yxxxxxxxxw', 'yxxxxxxxxw', 'yxxxxxxxxw', 'zzzzzzzzzy', '.a......a', '.a......a'],
  questionSign: ['ggggggggg', 'gWWW0WWWg', 'gWW0W0WWg', 'gWWWW0WWg', 'gWWW0WWWg', 'gWWWWWWWg', 'gWWW0WWWg', 'ggggggggg', '....y', '....y'],
  mailbox: doublePixels(['..rrrrrrrr', '.roooooorrR', 'roRRRRRRrrR', 'ro000000rrR', 'rorrrrrrrrR', 'rorrrrrrrrR', 'rorrrrrrrrR', 'rorrrrrrrrR', 'rrrrrrrrrrR', 'RRRRRRRRRRR', '....xyx', '....xyw', '....xyw', '....xyw', '....xyw', '...wxyww', '..wwwwwww']),
  flagUp: doublePixels(['.jjj', '.jYY', '.jYY', '.b', '.b', '.b', '.b']),
  flagDown: doublePixels(['', '', '', '', '', 'bbbb', '.jjY', '.jYY']),
  lamp: ['..000', '.0bbb0', '0bgggb0', '0bgWgb0', '0bgggb0', '.0bbb0', '..bb0', '..bb0', '..bb0', '..bb0', '..bb0', '..bb0', '..bb0', '..bb0', '..bb0', '..bb0', '..bb0', '..bb0', '.bbbb0', 'aaaaaa0'],
  lampLit: ['..000', '.0bbb0', '0bjjjb0', '0bjWjb0', '0bjjjb0', '.0bbb0'],
  windowLit: ['jjWjYYYY', 'jWjjYYYY', 'jjjjYYYY', 'WWWWWWWW', 'jjjjYYYY', 'jjjjYYYY'],
  lantern: ['.b.', 'bgb', 'bWb', 'bgb', '.b.', '.x.', '.x.', '.x.', '.x.', '.x.', 'xxx'],
  lanternLit: ['.b.', 'bjb', 'bWb', 'bjb', '.b.'],
  envelope: ['WWWWWWW', 'WdWWWdW', 'WWdWdWW', 'WWWrWWW', 'WWWWWWW'],
  // Run-mode badges: an active DSH goal (a flag) and the decision trail being kept (an open ledger).
  goalBadge: ['WWWWWW', 'WbrrrW', 'WbrorW', 'WbrrWW', 'WbWWWW', 'WbWWWW'],
  trailBadge: ['.WW.WW.', 'WbbWbbW', 'WWWxWWW', 'WbbxbbW', 'WWWxWWW', 'xxxxxxx'],
  bench: ['zzzzzzzzzzzzzzzzzzy', 'yxxxxxxxxxxxxxxxxxw', 'zzzzzzzzzzzzzzzzzzy', 'yxxxxxxxxxxxxxxxxxw', '.a...............a', '.a...............a'],
  chimney: ['bccccccb', 'abbbbbba', '.rorroR', '.rRRRRR', '.roroRR', '.rRRRRR', '.rorroR', '.rRRRRR', '.roroRR', '.rRRRRR'],
  pine: ['....3', '...321', '..32211', '...321', '..32211', '.3222111', '..32211', '.3222111', '322221111', '..32211', '.32222111', '32222211111', '....x', '....x'],
  planter: ['.o...j...p.', 'ojo.jWj.pWp', '32333233323', 'yzzzzzzzzzy', 'xyyyyyyyyyx', 'wxxxxxxxxxw'],
  bang: ['.WWWWW', 'WWWrWWW', 'WWWrWWW', 'WWWrWWW', 'WWWWWWW', 'WWWrWWW', '.WWWWW', '..WW', '..W'],
  clock: ['.WWWWW', 'WWWaWWW', 'WWWaWWW', 'WWWaaaW', 'WWWWWWW', '.WWWWW'],
  zBig: ['WWWW', '...W', '..W', '.W', 'WWWW'],
  zSmall: ['WWW', '.W', 'WWW'],
  sweat: ['.i', 'iii', 'iWi', '.i'],
  puff: ['.dd.', 'dcdd', 'dccd', '.cc.'],
  puffSmall: ['dd', 'cd'],
  sparkle: ['..j', '..j', 'jjWjj', '..j', '..j'],
  sparkleSmall: ['.j', 'jWj', '.j'],
  bird1: ['0...0', '.0.0', '..0'],
  bird2: ['', '00000', '..0'],
  butterfly1: ['o.o', '.0', 'o.o'],
  butterfly2: ['.o', '.0', '.o'],
  smoke1: ['.cd', 'cddd', '.dd'],
  smoke2: ['..dd', '.dddd', 'ddddd', '.ddd'],
  smoke3: ['.dd.dd', 'dddddd', '.dddd'],
  // Stage gag motifs, named by town.js stage motions.
  ink: ['WWWWWW', 'WbbbWW', 'WWWWWW', 'WbbWWW', 'WWWWWW'],
  record: ['.or', 'rrrR', 'rrrR', '.RR'],
  sift: ['.j', 'jjY', 'YY'],
  cross: ['r...r', '.r.r', '..r', '.r.r', 'r...r'],
  spring: ['0....0', '.0..0', '.2332', '234432', '233332', '.2..2'],
  stamp: ['.oo', 'orrr', 'rrrR', 'rrrR'],
  cut: ['dddddxx', 'ccccbxw'],
  crumple: ['.dW', 'dWcd', 'cdcc', '.cc'],
  thumb: ['..k', '..k', 'kkkkk', 'kkkkK', 'kkkkK', '.KKK'],
  spark: ['j...j', '..W', 'j.j.j', '..j'],
  confetti: ['o...j', '..i', 'p...3', '..r'],
  thump: ['rr', 'rr', 'rr', 'rr', '', 'rr'],
  parcel: ['ggWgg', 'ffWff', 'WWWWW', 'ffWfe', 'eeWee'],
  echo: ['WWWWWWW', 'W0W0W0W', 'WWWWWWW', '.WW'],
  map: ['33uu', '3uu3', 'uu33'],
  compare: ['iiii..pppp', 'iBBi..pPPp', 'iiii..pppp'],
  check: ['.....3', '....3', '3..3', '.33'],
  lift: ['dddddc', 'ccccccb', '.dddddc', '.cccccb'],
};
