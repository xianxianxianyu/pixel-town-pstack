---
name: pstack-perf-issue
description: "Use /pstack-perf-issue to fix latency or throughput problems with a repeatable baseline, runtime bottleneck evidence, and same-surface measurements."
metadata:
  workflow: perf-issue
---

# Performance issue (pstack)

Adapted from the pstack perf-issue playbook and benchmark-checklist, how, architect, and sequence-verifiable-units skills (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Tie changes to measurements, not source-reading guesses. Keep commands and raw artifacts for reruns.

## Steps

### 1. 测基线 (baseline)

Name the scenario, metric, unit, and target. Read what the script times, counts, and ignores. Run the real command on the user's surface with realistic data/concurrency at least five times. Save command, revision, environment, and results.

Answer seven questions with run evidence for every number:
1. Why not double? Profile separately from timed runs; name the limiter and source location. Rule out load-generator saturation.
2. Was it tuned? Match production builds, flags, versions, batching, pools, and warm/cold caches. Tune both sides before choosing a winner.
3. Did it break limits? Compare rates with hardware capacity and time saved with the changed code's share. Impossible savings suggest skipped work, caching, or bad measurement.
4. Did it error? Count errors, timeouts, retries, and failed responses; verify output values. Add missing error counts.
5. Does it reproduce? Alternate A/B, at least five runs each. Report median/range; a gap within variation proves no improvement. Use suitable statistics for close calls.
6. Does it matter? Measure the realistic end-to-end path the user waits on; give a micro-result as its share of the whole.
7. Did it even happen? Prove work ran inside the timed region: requests arrived, rows were written, bytes were read. Await promises and consume results.

Inspect load; if competing work cannot stop, interleave sides and disclose it. Missing limiter, tuning, correctness, or work evidence makes a difference inconclusive.

Done when: at least five baseline runs are reproducible, with command and result paths saved.

### 2. 找瓶颈 (hypothesize)

Map the profile/trace bottleneck to file:line. Ground hypotheses in code: one pass for a narrow question; 2–4 read-only explorer `subagent`s then one explainer for a complex subsystem. Keep overview, concepts, flow, file map, and gotchas as needed. Run before claiming a ceiling.

Try the mantras in order, cheapest first:
1. Don't do it: stop work whose result nobody uses.
2. Don't do it again: reuse a valid result.
3. Do it less: reduce frequency or volume.
4. Do it later: defer until needed.
5. Do it when they're not looking: move it off the user-waiting path.
6. Do it concurrently: overlap independent work.
7. Do it cheaper: reduce the operation's cost.

Stop when an earlier option meets the target. Choose one hypothesis, predicted effect, and measurement that could refute it.

Done when: runtime evidence identifies the bottleneck and one change is selected.

### 3. 修复 (fix)

Across a function boundary, sketch caller usage, types/signatures, and module ownership first. Compare two distinct designs; prefer more capability behind a smaller interface. Preserve constraints; redesign a wrong shape rather than patching it.

Give an implementation `subagent` the paths, evidence, sketch, and success criterion; review its diff. Run tests and measure each attempt before the next, so failures trace to one change. Do not alter the workload to win.

Done when: the scoped change is complete and existing tests pass.

### 4. 复测对比 (remeasure)

Alternate at least five runs per side with the same command, surface, data, and environment. Profile separately to confirm the intended work changed. Parse artifacts with a script or queryable table; compare medians, ranges, errors, and completed work. Save absolute/percentage delta with units and direction.

Use one alternating A/B series for all headline numbers: baseline, post-fix, and delta.

Inconclusive, wrong-surface, untuned, or within-noise results are not a pass. Name the gap. Without a defensible improvement, discard only the unsupported attempt and return to `hypothesize`; preserve evidence and unrelated user changes. After two failed attempts sharing a premise, test that premise before a third.

Done when: post-fix numbers, delta, and paths support a real improvement; otherwise return to `hypothesize`.

### 5. 开 PR/MR (pr)

Load `pstack-opening-a-pr` through the `skill` tool. Order commits as baseline, change, result; put measurements in the description and link raw runs, spread, and limiter evidence.

Done when: commits are ready and the reply carries baseline, post-fix, delta, and artifact paths.

## Reply

Lead with the verdict. Give baseline, post-fix, absolute/percentage delta, units, run counts, medians, ranges, and artifact paths. Name the limiter, command, scenario, and correctness/work evidence. Separate facts from inference; never call inconclusive or irrelevant measurements a successful fix.
