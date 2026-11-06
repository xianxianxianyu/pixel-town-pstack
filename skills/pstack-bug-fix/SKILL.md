---
name: pstack-bug-fix
description: "pstack bug-fix playbook: reproduce a defect, root-cause it with runtime evidence, land a failing test before the smallest fix, and verify on the same surface. Use for /pstack-bug-fix or when asked to fix a bug the pstack way."
metadata:
  workflow: bug-fix
---

# Bug fix (pstack)

Adapted from the pstack bug-fix playbook (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

**You own this task. Plan, verify, report.** Be scientific. Every shipped line traces to runtime evidence. Belt-and-suspenders that "might help" is a hypothesis, not a fix. It does not ship. When evidence refutes a hypothesis, revert what it motivated. The smallest change the evidence justifies ships, nothing more.

## Steps

### 1. 复现 (reproduce)

Reproduce it yourself on the surface the user named, using the exact command or input they gave. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires. Ask the user only with a specific reason the surface cannot be reached, after driving it as far as it goes.

Keep the exact repro command or input and the intended output, so the fix can be tested against the same case.

Done when: the repro is stable (for example 3/3), and its output shows the bug.

### 2. 二分定位 (bisect)

Binary-search the cause. Form candidate hypotheses, then rule them out until one survives. Seed them by reading the affected code and its history (`git log -p`, `git bisect` against a known-good commit). Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add temporary logging and read it as the code runs. Don't guess.

Done when: the surviving mechanism is confirmed with runtime evidence, not only by reading code. Remove temporary logging before moving on.

### 3. 设计修复 (plan-fix) — optional

If the fix crosses a function boundary, sketch the caller's usage, the types, and which module owns the change before writing code. A fix contained inside one function skips this step.

Done when: the fix scope and any interface change are written down.

### 4. 红灯测试 (red)

Write the smallest focused regression test that would have caught the bug, using the project's existing test runner and style. It encodes intended behavior, not the current implementation. Run it before touching production code and confirm it fails for the intended reason. If it passes or fails for an unrelated reason, fix the test first. Commit the failing test on its own (`git commit`), so the failing repro lands before the fix in history.

If a failing test is impractical (expensive, integration-heavy, unclear), say why in the `note` and use the closest executable check instead.

Done when: the new test fails on the current code for the intended reason and is committed.

### 5. 修复 (fix)

Make the smallest production change the evidence justifies. Preserve nearby contracts. Do not change the test to match the code. A fix larger than a few lines goes to a `subagent` with a specific scope: file paths, the confirmed mechanism, the failing test to make pass, and the success criterion.

Done when: the change covers only what the evidence supports.

### 6. 同界面验证 (verify)

Verify on the same surface. Rerun the original repro command with the same input, then the new test, then the whole existing test suite. "Inconclusive" or wrong-surface is not a pass. Unit tests show branch behavior, not bug absence.

If the repro still gives the wrong output, return to `fix` when the mechanism is known and the fix is incomplete, or to `bisect` when the cause remains unexplained. Make the change there, then repeat the same-surface verification.

Done when: the original repro shows the intended output and the suite passes. Keep the failing-before and passing-after output.

### 7. 对抗审查 (interrogate) — optional

For a non-trivial diff, spawn a `subagent` told to try to break the change and report only findings it proved by running a command. Rerun each finding yourself and keep only the ones that reproduce. A one-line fix with a regression test skips this step.

Done when: every finding has a repro command, or there are none.

### 8. 开 PR/MR (pr)

Load `pstack-opening-a-pr` through the `skill` tool. Keep the failing regression test in the first commit, with the fix on top.

Done when: the commits are in place and the reply below is written.

## Reply

What was broken, the root cause, the fix, and how you verified it. Paste the failing-then-passing repro output verbatim.
