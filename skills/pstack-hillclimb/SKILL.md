---
name: pstack-hillclimb
description: "Use /pstack-hillclimb for sustained improvement of one measurable target through a frozen measurement command and one-change keep-or-revert iterations."
metadata:
  workflow: hillclimb
---

# Hillclimb (pstack)

Adapted from the pstack hillclimb playbook, benchmark-checklist, how, show-me-your-work, and its cited engineering principles (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Own the metric and experiment integrity; supervise attempts and review diffs. Use another workflow for a one-off repair. Every iteration has one change, one measurement comparison, and one keep-or-revert decision.

## Steps

### 1. 定目标 (ground)

Read entry points, data flow, ownership, and constraints. Select a realistic workload reproducing the complaint, including relevant size, history, state, and concurrency. Without a reproduction, fix that first.

Fix one metric, unit, direction, and stopping predicate pairing a target with a minimum attempt count. Use the user's numbers; otherwise propose them and get agreement. Never relax the predicate later.

Done when: the workload, metric, direction, target, and minimum attempt count are written and agreed.

### 2. 建测量 (harness)

Build one rerunnable command and read what it measures. Prove sensitivity: the target workload reproduces the complaint and easier realistic cases separate. Fix insensitive measurement before proceeding.

Before freezing the command, establish these facts from runs:
- Profile separately from timing and map the limiter to source; rule out a saturated load generator.
- Match production builds, settings, versions, data, concurrency, and warm or cold caches. Tune both sides.
- Check rates against hardware capacity and savings against the affected work's share.
- Print error counts and completed-work counts, and check output values. Await and consume the measured work.
- Alternate at least five samples per side; report median and range. A gap inside variation is not a win.
- Measure the end-to-end task the user waits on; do not substitute a helper's timing.

Freeze the workload, command, sampling, and acceptance rule. Save baseline revision, environment, raw runs, median, spread, and passing regression-test output outside the working tree.

Done when: sensitivity, baseline median/spread, and passing tests are recorded.

### 3. 循环尝试 (loop)

Enter `loop` repeatedly, one iteration per entry. Read the session trail, then name one mechanism, predicted effect, and refuting evidence; "try caching" is not a mechanism.

For performance, try removing unused work, avoiding repeats, doing less, deferring, moving work off the waiting path, overlapping independent work, then cheaper operations, in that order.

Give a `subagent` one change, file boundaries, and the frozen measurement contract. Review its diff. Use the accepted revision as the before side; never stack unmeasured ideas.

Run one before/after comparison with the prescribed repeated samples, then regression tests. One measurement means this comparison, not one noisy sample. Save raw results. If the command changes, return to `harness` for a new baseline.

Keep only changes clearing noise with green tests. Commit each separately, staging only its files. Otherwise revert the whole attempt without discarding user changes or accepted work.

Write one `pstack_log` row per iteration, including kept, reverted, failed, and inconclusive attempts. Record the hypothesis/change, before/after delta, and verdict; use evidence pointers, preferring `call:` IDs of the measurement and test runs.

Done when: this iteration's measurement, tests, keep-or-revert action, and trail row are complete before another iteration starts.

### 4. 判断收手 (stop)

Stop when target and minimum count both hold, or explain why remaining ideas cost more than they merit. Do not quit while cheap, grounded hypotheses remain.

After repeated rejects, reread the source and pivot category before declaring a plateau. After two failures sharing a premise, test that premise. Combined near-misses need a new single hypothesis. Correctness and simplicity outrank the number; revert wins later shown to break behavior.

Done when: the stopping reason is explicit, including any unmet target and the best remaining idea.

### 5. 开 PR/MR (pr)

Load `pstack-opening-a-pr` through the `skill` tool. Preserve accepted commits in landing order; cite measurements in the description and link the frozen command and exported session trail.

Done when: commits are ready with baseline-to-final delta, kept/reverted counts, and the trail export path from `pstack_audit`.

## Reply

Give the metric, target, baseline/final medians, units, percentage delta, sample counts, ranges, limiter, and correctness/work evidence. List accepted changes, kept/reverted counts, stopping reason, the exported trail path returned by `pstack_audit`, raw-result paths, and the best next idea. Label inconclusive results.
