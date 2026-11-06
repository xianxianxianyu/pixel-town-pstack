---
name: pstack-multi-phase-plan
description: "Use /pstack-multi-phase-plan to deliver an evidence-backed checklist of independently verifiable phases and dependencies. Produce the plan, not implementation."
metadata:
  workflow: multi-phase-plan
---

# Multi-phase plan (pstack)

Adapted from the pstack multi-phase-plan playbook, prototype, how, technical-writing, unslop, and its cited engineering principles (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Own the plan, not the code. One checkbox is one unit with evidence the user can inspect. Do not implement the plan until the user explicitly says to start.

## Steps

### 1. 判断要不要 (triage)

For an obvious one- or two-file change, say a plan is unnecessary and stop without implementing. Otherwise state the outcome, scope, non-goals, and constraints requiring phases.

Done when: the need for a plan, or the reason to skip it, is explicit.

### 2. 定未决问题 (settle)

Skip if settled. Probe empirical questions outside production source; save commands, inputs, outputs, artifacts, and applicable branch/revision. Log prototype-settled forks and rejected alternatives with `pstack_log` evidence pointers.

Compare distinct designs for ownership, interface, or experience choices. Ask the user only about product or preferences no run can settle; offer options. Mark unresolved claims unproven and dependent work conditional.

Done when: each open question has a decision and evidence, or an explicit unproven status and consequence.

### 3. 摸底 (explore)

Map affected regions, then use read-only `subagent`s for independent areas. Require file pointers, conventions, entry points, test commands, and constraints, not source dumps.

Connect inputs, state changes, callers, and user-visible results. Resolve shared contracts before dependent phases. Include all callers and obsolete paths in a contract migration; do not plan internal compatibility wrappers by default.

Done when: every affected region has grounded entry points, conventions, dependencies, and verification commands.

### 4. 写计划 (write)

Use the user's path or an existing planning location; otherwise report the chosen file. Keep skeleton headings in order. Give each phase one verifiable change, a unique `(P1)`-style ID, and disjoint files for parallel work.

Declare `依赖: 无` or comma-separated IDs such as `依赖: P1, P2` per phase. These declarations define the graph; all IDs must resolve without cycles.

Use real symbols, paths, commands, and pass predicates. Each unchecked box needs nonempty `Evidence:` on its line or an indented continuation: diff, log, screenshot, test result, or revision. Check only after evidence exists.

Require unit checks and a real-interface scenario proving the user's end state. Compare baseline and changed code on the same scenario; if absent on baseline, record that and prove the added behavior. Measure relevant performance or explain why not. Never divide timings for different workloads.

Put explanation in appendices; name reversible intermediate breakage and the phase restoring the invariant.

```markdown
# <Outcome> plan

<What changes, for whom, constraints, and non-goals.>

## How to read this

Check each box only when its evidence exists. Start only on explicit go.
Each phase requires unit and live evidence, plus relevant performance
checks or a reason they do not apply.

## Program checklist

- [ ] Record explicit go. Evidence: <user instruction>.
- [ ] Pin baseline. Evidence: <revision and artifacts>.
- [ ] Set file ownership. Evidence: <phase-to-path map>.

## Dependency graph

<IDs and edges; identify independent roots and user review gates.>

## <Verb phrase> (P1)

依赖: <IDs, or 无>
Files: <edit/create/delete paths and owned boundaries>.

### Change

- [ ] <Change, symbol, callers>. Evidence: <diff>.
- [ ] <User-visible result>. Evidence: <output or screen state>.

### Verify

- [ ] Unit: <case, command, pass predicate>. Evidence: <result path>.
- [ ] Live: <startup, readiness, input, end-state predicate>.
  Evidence: <output/screenshot, revision, baseline comparison>.
- [ ] Perf: <metric, workload, repeated comparison, failure threshold>,
  or <not-applicable reason>. Evidence: <samples/spread or rationale>.
- [ ] Review: <user decision or no gate>. Evidence: <decision or rationale>.

<Repeat the phase section for every ID in the graph.>

## Close

- [ ] Resolve all phase boxes. Evidence: <result/revision index>.
- [ ] Hand back outcome and limits. Evidence: <report>.

## Appendix A. Prototype evidence

<Questions, decisions, commands, branch/revision, artifacts, unproven claims.>

## Appendix B. Alternatives rejected

<Alternative and concrete reason or observation that ruled it out.>

## Appendix C. Risks

<Risk, affected phase, detection signal, and response.>

## Appendix D. Links and reading list

<Phase reading pointers, evidence locations, and the session trail export from pstack_audit.>
```

Done when: the plan exists with every placeholder filled and independently verifiable phases.

### 5. 自检 (review)

Run `node <own skill directory>/check-plan.mjs <plan>` on Node.js 22+. Use the provider's skill-directory resource base, not the repo root; replace placeholders with real, quoted paths.

Fix problems and rerun to zero. The checker covers heading order, placeholders, unchecked boxes' `Evidence:`, phase IDs, dependencies, and cycles, not evidence quality, ownership, or completeness. Passing does not prove planned checks ran.

Done when: the checker exits successfully and its output is ready to paste.

### 6. 交还 (handback)

Post the plan path and paste the checker output, then stop. Start implementation only on explicit go.

Done when: the plan is handed back for an execution decision.

## Reply

Give the plan path, ordered phase IDs and dependencies, user review gates, what probes proved, what remains unproven, and the pasted checker output, not a prose self-review. State that implementation has not started and ask whether to begin.
