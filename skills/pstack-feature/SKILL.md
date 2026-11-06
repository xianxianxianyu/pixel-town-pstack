---
name: pstack-feature
description: "pstack feature playbook: turn a requirement into a shipped change. Restate it, survey the subsystem, compare two designs, write a throughput checkpoint, build in small verified units, verify on the real surface. Use for /pstack-feature, or when asked to analyse and implement a requirement or feature."
metadata:
  workflow: feature
---

# Feature implementation (pstack)

Adapted from the pstack feature playbook and the architect skill (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

**You own the design. Plan, review, verify.** Delegate implementation and stay in the lead. Get the data shape right, and the code that follows becomes obvious.

## Steps

### 1. 复述需求 (restate)

In your own words, write:
- the user's goal;
- the problem it solves;
- the smallest change you expect to meet it.

Do not wait for confirmation. If the evidence rules out the change the user asked for, show it and stop.

Done when: the goal and observable success criteria are written down.

### 2. 摸底 (survey)

Map the subsystem the change touches: an overview, the key concepts, how it works, where things live, and the gotchas. Cite file paths. When several areas are involved, run read-only `subagent` explorers in parallel and keep only their summaries. Naming a file is not surveying it.

Done when: the map names every module the change will touch or depend on.

### 3. 架构草图 (sketch)

Design it twice: at least two structurally distinct designs. Use whole-shape alternatives, not point fixes inside one shape. For each design:
1. Write the caller's usage first.
2. Then the types and signatures.
3. Then which module owns what.

Name the data shape that organizes it: a state machine instead of scattered booleans, a registry instead of branching, or a typed model instead of repeated shape assumptions. Compare the designs in a table and choose. Prefer the one that hides more behind a smaller surface.

Done when: the chosen data shape and module ownership are written down.

### 4. 吞吐检查点 (checkpoint)

Write four lines:
- **Blocking first steps**: work that must land before any parallel work starts.
- **Independent workstreams**: disjoint files, services, or layers that can run in parallel.
- **Shared mutable state**: split it by default, and serialize only for a real invariant.
- **Smallest safe decomposition**: if one worker is best, say why.

A line that does not apply says `n/a: <reason>`.

Choose a repeatable acceptance command or script whose output shows whether the requirement is met. Run it on the real surface and save the before output; confirm it exposes the missing behavior.

Done when: the four lines are written, and the acceptance run demonstrates the missing behavior.

### 5. 委派实现 (build)

Build in small units that each end in a verified state.
- Delegate code-writing to a `subagent` with a specific scope: file paths, the named data shape, and the unit's success criterion.
- Verify each unit, then commit it before starting the next.
- Parallelize only the independent workstreams from the checkpoint.

Done when: every unit is committed and passes its own check.

### 6. 验证 (verify)

Run the same acceptance command on the matching surface, then the test suite. "Inconclusive" or wrong-surface is not a pass. If the output is wrong, return to `build` when the implementation is incomplete, or to `sketch` when the design is wrong. After changing it, repeat the acceptance run.

Done when: the acceptance output shows the requirement is met and the suite passes.

### 7. 质询 (interrogate) — optional

When the design was contested or the diff is non-trivial, spawn a `subagent` told to break the change, proving each finding by running a command. Rerun each finding yourself. Keep only those that reproduce. A small change with an acceptance check skips this step.

Done when: every finding is reproduced or dismissed with evidence.

### 8. 开 PR/MR (pr)

Load `pstack-opening-a-pr` through the `skill` tool. Describe what was built and why this design won, linking the sketch's comparison table; include the throughput checkpoint and open decisions.

Done when: the commits are in place and the reply is written.

## Reply

The reply contains:
- what you built;
- the design alternatives as a table, and why you chose this one;
- the throughput checkpoint;
- the acceptance output before and after;
- open decisions.
