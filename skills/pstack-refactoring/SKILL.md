---
name: pstack-refactoring
description: "Use /pstack-refactoring for focused-to-medium structural cleanup without behavior changes, with a pinned contract, equivalence evidence, and less reader burden."
metadata:
  workflow: refactoring
---

# Refactoring (pstack)

Adapted from the pstack refactoring playbook, how and architect skills, and its nine cited engineering principles (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Change structure, not behavior. Split out discovered bugs or missing features and say so; do not fix them here or redefine the baseline. Behavior-changing redesign belongs in a separate task.

## Steps

### 1. 钉住行为 (pin)

Identify inputs, outputs, errors, side effects, and external consumers. Read narrow areas in one pass; for cross-module work, use 2–4 read-only explorer `subagent`s then one explainer. Keep the overview, concepts, flow, file map, and gotchas needed to understand the contract; use history to explain surprising constraints.

Before moving structure, write and run a characterization test, snapshot, or equivalence script for current behavior, including consumer edge cases. Typechecking and lint are not a pin; add missing coverage first. Save baseline revision, command, and output; identify unrelated failures.

Done when: the pin passes on current code and states the behavior to preserve.

### 2. 定目标 (shape)

Encode domain rules in a fitting structure that removes branches or invalid states instead of adding indirection. Keep boring local code when its contract is already clear.

Choose types and access patterns before logic, isolate shared mutable state, and establish foundations before dependent moves. Design the layout, types, and call graph as if this contract were foundational today, then plan the whole migration.

Across function boundaries, compare two distinct sketches: caller usage, signatures, then ownership. Prefer meaningful complexity hidden behind a smaller interface. Name the branches, duplicated rules, or invalid states removed; renaming alone is not simplification.

Done when: the target shape and simplification are explicit, with no behavior change.

### 3. 先删后加 (subtract)

Remove dead code, orphan references, redundant validators, and one-caller wrappers before constructing the new shape. Confirm redundancy against the pin; actual external boundaries may still need validation.

Ship the smallest change reaching the target, with each decision behind one source of truth. Revert speculative additions that merely "might help". Rerun the pin before moving structure.

Done when: the unnecessary code is removed and the behavioral pin still passes.

### 4. 小步搬移 (move)

Keep the pin passing between small moves. Delegate mechanical edits to a `subagent` with paths, names, target shape, and behavior to preserve; review its result.

For internal API changes, migrate every caller and delete the old API in the same wave, without shims or parallel old/new paths. Identify external compatibility obligations first; do not silently break published contracts.

Check every rename in code, strings, tests, prose, examples, and back-references. Update affected material; delete obsolete implementation-only tests, not behavioral assertions. Fix or revert a failing slice before the next.

Done when: the target is reached, all callers/references migrated, old paths removed, and the pin passes.

### 5. 证明不变 (prove)

Verify the actual artifact and its observed values, not compilation, cached evidence, or a subagent's self-report. Diff old/new outputs, replay the baseline, or run a smoke command on the same application surface.

Match inputs and conditions; compare errors and side effects too. Investigate mismatches before blaming nondeterminism. Keep commands, output, and artifact paths for reruns.

Done when: the equivalence evidence is shown and no unexplained behavior difference remains.

### 6. 值不值 (worth)

Judge reader burden by layers to trace and hidden state to hold, not line count. Compare a concrete before/after question: where does this value come from, and what can change it?

If neither tracing effort nor state burden falls, revert the refactor without discarding unrelated work. Passing tests alone do not justify more abstraction.

Done when: the keep/revert decision has a concrete reader-load comparison.

### 7. 开 PR/MR (pr)

Load `pstack-opening-a-pr` through the `skill` tool. Keep passing units ordered as subtraction, reshape, cleanup; retain the behavior pin and equivalence proof with the commits, and remove scaffolding and unused alternatives.

Done when: the ordered commits are ready and the reply states what shipped and what was reverted.

## Reply

Give the structural change, pin command, equivalence output/paths, reader-load delta, and what shipped or was reverted. State that behavior is unchanged. List discovered bugs or missing features separately; do not claim the refactor fixed them.
