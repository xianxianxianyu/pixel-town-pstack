---
name: pstack-figure-it-out
description: "Design an auditable playbook when no narrower town workflow fits: a large migration, an ambitious multi-part change, or work a human reviews after stepping away. Scales rigor to the task, runs a hypothesis loop, and keeps a decision trail. Use for /pstack-figure-it-out or 'figure it out'."
metadata:
  workflow: figure-it-out
---

# Figure it out (pstack)

Adapted from the pstack figure-it-out skill and the principles it cites (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

When the task matches no workflow, design one. The deliverable before any code is the workflow itself: a sequence of phases that scales rigor to the task, runs the scientific method, and leaves a decision trail a human can audit after stepping away.

## Start

Before frame, read the `## Principles` section of the poteto-mode skill file named under **Poteto principles** below. Use that block's exact bounded `read` call, not a whole-file read that can hide the index behind the output cap. Do this whether the run came from `/pstack-poteto-mode` or straight from the 想办法 plaque. Each principle named in this skill is `<name>.md` in that block's leaf directory. Read the leaf in full before you apply it, and cite only leaves you read this session.

## Steps

### 1. 定框架 (frame)

Ground first, then commit. Don't start the run until you can state:

- The definition of done as a falsifiable predicate (`prove-it-works`).
- Scope, quantified: rough units and effort, plus the blockers grounding surfaced.
- The rigor level, biased high. One-way doors and high blast radius get more. Reversible low-stakes steps get less. Rigor is gates and artifacts, not "try harder".

Present the framing and tradeoffs before committing to a long run. Reversible work proceeds (`never-block-on-the-human`), but a multi-hour run earns one checkpoint: the fixed handback stop below.

Done when: the predicate, scope and rigor level are written and shown to the human.

### 2. 设计流程 (design)

Decompose into atomic, independently-landable units. Sequence riskiest-unknown-first. Scaffold and verification come before features (`foundational-thinking`).

- Build the verification harness before the work, with the baseline captured from the pre-change state, so the check reads as "old value vs new value".
- For one-way-door design decisions, design it twice: two structurally distinct designs compared in a table, as `pstack-feature`'s sketch step does. Skip it for mechanical work whose shape is already concrete. A second comparison over a settled design is over-engineering (`laziness-protocol`).
- Decide what fans out. Parallelize only across seams, and give each worker its own worktree or branch (`separate-before-serializing-shared-state`). Don't over-fan. Delegate with `subagent`, using the models the role block below names; pick each delegate's reasoning effort for the job, per the Subagents section of the poteto-mode skill file.
- Write the designed phase list down. That list is what the human reviews.

Then execute the design. The town's task list holds these five stages, so the designed units live in your phase list and in the `loop` notes. Run each unit under the loop discipline, and weave the trail through them, a `pstack_log` row as each unit lands, rather than saving the whole trail for the end.

Done when: the phase list is written, and the harness and baseline exist.

### 3. 循环实验 (loop)

Report `loop` again for every unit and name it in the note, as in `第 2/5 单元：迁移调用方`. Each unit is an experiment. State the hypothesis, make the smallest change, measure against the predicate on the real artifact, keep it if it advanced, revert it if it didn't. Apply `sequence-verifiable-units`, verifying each unit before starting the next instead of batching checks at the end.

- Verify by inspecting the artifact, never a self-report. When something passes too easily, suspect the observation method before the system.
- Pair delegated work with a judge. If a worker games the gate, reset and harden the contract. If the gate itself is wrong, fix the gate in its own change rather than routing around it.
- A verdict is VERIFIED, NOT VERIFIED, or INCONCLUSIVE. Inconclusive is not a pass. Don't hide a negative.

Done when: every designed unit has a verdict with evidence.

### 4. 审计日志 (trail)

The work log has run since frame, under the rules below. Close it with `pstack_audit`, fix gaps with superseding rows, and hand the TSV and transcript to the reviewer. figure-it-out's work is usually ambitious enough to commit the exported TSV beside the diff, so the reviewer can read it in the PR/MR. Keep it local otherwise.

Done when: the audit findings are resolved and the review is recorded.

### 5. 验证交还 (verify)

Check the whole against the frame predicate on the real product, not just the harness. Encode any recurring correction as a gate, a lint rule, a check, or a script (`encode-lessons-in-structure`). When the run produced code to deliver, load `pstack-opening-a-pr` through the `skill` tool.

Done when: the predicate is judged on the real product and the reply is sent.

## Reply

- the playbook you designed;
- the rigor level and why;
- the decision-trail paths `pstack_audit` returned;
- what is verified against the predicate, with each verdict;
- what is still open.
