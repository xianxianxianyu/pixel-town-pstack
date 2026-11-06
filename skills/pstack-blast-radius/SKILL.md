---
name: pstack-blast-radius
description: "Use /pstack-blast-radius to find downstream breakage beyond a diff and its callers, then prove the safety-critical facts with real code."
metadata:
  workflow: blast-radius
---

# Blast radius (pstack)

Adapted from the pstack blast-radius, how, why, and unslop skills (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Keep the repository read-only; never commit scratch probes or data kept outside the tree. A writeup or caller list is not proof: find and test the one or two facts the change is safe because of.

## Steps

### 1. 读改动 (read)

Read the diff, changed symbols, and surrounding code. State changed behavior, including implicit timing, side effects, ownership, and data consumers. Trace narrow paths in one pass; for separate areas, use read-only explorers and reconcile their cited findings.

Use `git blame` and `git log -p`, then linked PRs/issues, for motivation. Read patches, not just titles. Separate documented intent from inference; current code cannot prove past intent. Name gaps instead of inventing rationale.

For a big or wide change, ask a second subagent the same question independently and merge.

Done when: behavioral changes and boundaries have sources.

### 2. 找关键事实 (keyfact)

State falsifiable safety facts, such as "this call removes only already-dead entries and has no other side effects". Name a condition that would make each false. Prioritize these facts over a long list of maybes.

"Tests pass" is not a safety fact; name the behavior they establish. Keep library, lifecycle, and persisted-data assumptions explicit until proved.

Done when: each key fact is a sentence with a concrete way to refute it.

### 3. 查 grep 之外 (beyond)

Inspect every direction below, recording a finding or a reason it does not apply:
- Read library source at the pinned version, including local patches; current online docs may describe different semantics.
- Trace execution timing: microtasks, callbacks, teardown, unmount, and framework-specific lifecycle rules.
- Follow data contracts: API JSON, wire formats, database columns, and readers in other languages.
- Check persisted data and older records, not only freshly generated values.
- Follow feature flags and configuration combinations that change which path runs.
- Follow effects several calls downstream, including consumers a symbol search cannot see.

An empty search covers only its locations and terms, not all possible consumers. Resolve contradictions against source or execution.

Done when: all directions have recorded conclusions and remaining evidence gaps.

### 4. 评估风险 (rate)

For each risk give the failure, file:line, likelihood and reason, impact, and cheapest repro. Name the affected user or state. Do not invent callers or probabilities; label unknown likelihood and the evidence needed.

Separate confirmed risks from unproved concerns. List cleared cases separately with the evidence ruling them out.

Done when: the risk table distinguishes demonstrated failures, unresolved concerns, and cleared cases.

### 5. 证明 (prove)

For each safety fact, reach the strongest practical level and name it:
1. You said so. An assertion alone is not evidence.
2. You pointed at the line. Cite real file:line or the library's own source.
3. You showed the bad case cannot happen. Show where the failure path becomes unreachable.
4. You ran it. A real-code probe fails loudly if the fact is false.
5. You reproduced it in the running app. Exercise the relevant path and read the result.

At level four, import the exact installed library and call the actual function with realistic and suspected failing inputs, not mocks or reimplementations. Write only to disposable scratch state, never production data. Stay within authorization; do not edit the repository or restart the user's app to reach a higher level.

Save command, exit status, output, and script path. If execution is unsafe or unavailable, mark the fact unproven and name the missing evidence; do not lower the claim to fit the probe.

Done when: each key fact has proof at a named level or is explicitly unproven.

### 6. 交付 (report)

Use concrete language and consistent names; cut padding, vague attribution, and false certainty. Preserve limits on the evidence and strip private data before public sharing. This assessment is not permission to fix or merge.

Done when: the five-section report is sent with proof status and actionable tests.

## Reply

- **What it does.** Explain what changed, including non-obvious effects.
- **The one fact it's safe because of.** State the key fact or facts, certainty level, and proof; write "unproven" where appropriate.
- **Risks.** Give failure, file:line, likelihood, impact, and how to test it; paste decisive proof.
- **Cleared.** Say what you checked and why that case is safe.
- **Before you merge.** Name the cheapest tests or repros for real risks, including the runnable scratch probe and its output.
