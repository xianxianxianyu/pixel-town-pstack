---
name: pstack-trace-forensics
description: "Diagnose an existing CPU profile, heap snapshot, trace, spindump, or log artifact without rerunning the capture or changing code. Use /pstack-trace-forensics to reduce a recording to a cited hot path, retainer chain, or blocked thread."
metadata:
  workflow: trace-forensics
---

# Trace forensics (pstack)

Adapted from the pstack trace-forensics playbook (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Treat the capture as a fixed dataset: do not change code, instrument the live process, or rerun it. Preserve originals; keep derived tables and scripts outside the repository. Keep the throughput checkpoint to one line: `throughput checkpoint: n/a, read-only forensics`.

## Steps

### 1. 识别加载 (load)

Identify cpuprofile, heap snapshot, trace JSON/compressed JSON, spindump, or logs by content, not extension. Use a matching parser or viewer. Record path, interval, process/thread identifiers, units, and known capture conditions.

Have a read-only `subagent` parse large files, returning counts, reduced findings, and extraction commands, not raw payloads. Bounded summaries preserve room for reasoning. Report parse errors or truncation; a partial load is not a complete capture.

Done when: the format is identified and the tool can read sample, frame, node, or event counts.

### 2. 转成可查 (transform)

Import into sqlite before interpreting: one row per sample, frame, or node, with stack, parent-child, or reference links as needed. Preserve original identifiers, timestamps, weights, and units; do not flatten away call trees or retainer edges.

Query totals and top entries; reconcile counts with the parser and account for filters. Keep the import command, database path, and queries for reruns.

Done when: queries return totals and top entries, preserving the needed relationships.

### 3. 缩小原因 (narrow)

Follow the evidence type:
- For CPU/trace data, rank frames by recorded time or weight, separate self/inclusive cost, and follow the call tree. State the denominator; sample share is not wall-clock duration.
- For a leak, follow the retainer chain to a GC root. Separate retained memory from allocation volume; a large object alone proves no leak.
- For a spindump/stall, find the on-CPU or blocked thread, stack, and wait reason. A normally idle thread is not the cause merely because it waits.
- For logs, correlate events by timestamp and request/thread identity; separate observed order from an inferred causal link.

Keep the decisive query, rows, or stacks. If the capture cannot distinguish competing mechanisms, state the ambiguity.

Done when: one hot path, retainer chain, or stuck thread has magnitude and supporting records.

### 4. 对应源码 (attribute)

Use the artifact's own symbols and source maps to locate the file, symbol, and line. Match the recorded build or revision where available; do not map an old address to today's source and silently assume it is equivalent. Read the relevant source to explain the recorded operation, not to replace capture evidence with a theory.

Resolve missing symbols from matching available metadata. If the artifact does not carry enough information, say that plainly and name the missing mapping. An unresolved frame is not a source-level diagnosis.

Done when: the finding maps to a source location, or the report explicitly states which symbols the file lacks.

### 5. 对比确认 (confirm) — optional

If paired before/after captures exist, compare equivalent intervals, workload, units, and aggregation. Diff the reduced artifacts, retaining both paths and the query; explain whether the suspected path or retention changed as predicted. A difference between unrelated workloads does not confirm a cause.

Without a suitable pair, label the result the strongest hypothesis this artifact supports, not a confirmed cause. A pair supports confirmation only to the extent its evidence distinguishes that mechanism from alternatives.

Done when: the finding is explicitly marked confirmed or hypothetical, with the comparison or evidence limitation stated.

### 6. 结案 (report)

Deliver the diagnosis without a fix. Use concrete names, source citations, and observed values; remove vague certainty, praise, and generic conclusions. Distinguish what the recording proves from what still needs live evidence.

Record the diagnosis and decision checkpoint with `pstack_pause`, then ask `ask_user_question` "要不要修". Wait for the human; if they choose a fix, use `pstack-bug-fix` or `pstack-perf-issue` as appropriate rather than editing during this investigation.

Done when: the cited report is sent and the decision to fix is handed back.

## Reply

Give the artifact and format, reduced finding, source location or missing symbols, original and derived artifact paths, and whether a paired capture confirmed the result. Include the decisive query/output and remaining uncertainty. Do not turn a hypothesis into a confirmed diagnosis in the summary.
