---
name: pstack-runtime-forensics
description: "pstack runtime-forensics playbook: diagnose a live symptom or a captured artifact (CPU profile, heap snapshot, trace, logs) down to a proven mechanism and a file:line, without fixing it. Use for /pstack-runtime-forensics, or when asked why something is slow, leaking, spinning, or glitching."
metadata:
  workflow: runtime-forensics
---

# Runtime forensics (pstack)

This skill is adapted from the pstack runtime-forensics, trace-forensics, and investigation playbooks (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

**You own the diagnosis.** Build it from instrumentation and artifacts, not from theories read off the source. The deliverable is a cited diagnosis, not a fix. This workflow is read-only. The only exception is temporary instrumentation, and you remove it before the report.

## Steps

### 1. 接案 (intake)

Restate the case in your own words:
- the symptom;
- where and when it shows;
- what it costs the user;
- what "diagnosed" will mean.

If the evidence already rules out the premise (for example, the "leak" is a cache with a cap), show that and stop.

Done when: the symptom, the trigger conditions, and the success criterion are each one sentence in your stage note or reply.

### 2. 采证 (capture)

Capture the live signal on the surface where the symptom shows. Use the artifact that fits it:

| Symptom | Artifact |
|---|---|
| Spinning process | CPU profile |
| Leak | Heap snapshot |
| Glitch | Trace or event log |
| Wrong behavior | Logs with timestamps |

If the user already handed you an artifact (cpuprofile, trace, spindump, heap snapshot), identify its format and read it. Do not re-run it. A real artifact is required, not a guess.

Done when: you have an artifact path, the way it was captured, and the conditions during capture.

### 3. 缩减 (reduce)

Reduce the artifact to the smoking gun:
- Parse large artifacts in a `subagent` so the raw payload stays out of your context. Keep only the reduced finding.
- Before reading, turn the artifact into something you can query. For example, load it into sqlite with one row per sample, frame, or node.
- Narrow to the frames that hold the most time, the retainer chain from the leaked object to a GC root, or the thread that is stuck and its wait reason.

Done when: you have one hot path, one retainer chain, or one blocked thread, with numbers.

### 4. 排除假设 (hypothesize)

List every candidate mechanism that would produce the reduced finding.
- Seed the list by reading the code around it.
- Read its history with `git log -p` and `git blame`.
- On each pass, get runtime evidence and eliminate a candidate.

If two attempts that rest on the same premise both fail, write that premise down and test it directly before trying a third.

Done when: one hypothesis survives, and every other one was eliminated by evidence.

### 5. 证实机制 (prove)

Prove the mechanism before believing it. Add temporary instrumentation that prints something which is true only if the mechanism is real, for example:
- a log line or counter;
- an assertion;
- a CDP eval;
- a hotfix applied without reloading.

Run the probe and read its output. Keep the instrumentation in place until the predicted value has been observed after the last relevant edit.

Done when: the probe's output shows the predicted value.

### 6. 结案报告 (report)

First remove the temporary instrumentation, and confirm with `git diff` that none of it is left. Then map the finding back to source: the file, the symbol, and the line that allocates, schedules, or blocks. A frame with no source mapping is not a diagnosis yet. Resolve its symbols, or say plainly that the artifact does not carry them.

Write the diagnosis. Do not fix it unless asked. When a fix is next, hand off to `bug-fix` and enter its `reproduce` step.

Done when: the instrumentation is gone, and the report has file:line, artifact paths, and the pasted probe output.

## Reply

The reply contains:
- the signal you captured and how;
- the reduced finding;
- how you proved the mechanism, with the probe output verbatim;
- the source location;
- the artifact paths;
- whether a fix should follow.
