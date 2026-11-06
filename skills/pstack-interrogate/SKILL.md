---
name: pstack-interrogate
description: "Use /pstack-interrogate for adversarial code or design review that keeps only failures proven by an actual run and independently reproduced. Reports findings without fixes."
metadata:
  workflow: interrogate
---

# Interrogate (pstack)

Adapted from the pstack interrogate and arena skills (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Try to break the change, then report every verified failure. Do not choose a winning adversary, combine implementations, or apply fixes. Never run reviewed code or reproduction commands in the user's primary checkout, including during framing and parent verification; ignored caches are user state too.

Make the execution location explicit on every probe: set the tool's `cwd`/`workdir` to the assigned worktree, or start the command with `cd "$worktree" &&`. Record the actual `pwd` output before running reviewed code; echoing a path variable does not change or prove the working directory.

## Steps

### 1. 定范围 (frame)

Use the named scope; otherwise review changes from the branch's merge base with its base branch through the working tree. Resolve the base from repository facts. Record the base, revision, included paths, and in-scope uncommitted changes.

Restate intent from the request, commits, and available PR description. Name expected inputs, outputs, and constraints. Ask when intent is unclear; do not invent requirements from a preferred implementation.

For a design or plan, identify the current code or runnable prototype that can test its promise. Leave future risks without runnable evidence out of findings.

Done when: the review scope, snapshot, and intended behavior are explicit.

### 2. 多方攻击 (attack)

Spawn one adversary per configured 审查方 route in the 子 agent 模型 block below; when none is configured, spawn 2 adversaries, both on the default model. Routing fallback changes the model, not the number of seats. Give each adversary its own git worktree created outside the repository. Start every worktree at the same review revision and copy the scope's staged, unstaged, and relevant untracked changes into each, preserving file additions and deletions. Copy relevant ignored inputs, such as an existing cache needed to reproduce upgrade behavior, without modifying the originals. Confirm the scoped snapshot matches before dispatch.

Every adversary command must run with that adversary's worktree as its working directory, not merely write repros there. Never let adversaries share a working directory, reproduction files, or mutable output paths. Give each its scope, intent, worktree path, and this brief, without another adversary's findings:

> 尝试弄坏这次改动。每条发现都要在真实代码上运行一次来证明，例如失败的测试、复现脚本，或显示错误行为的命令输出。对于设计或计划，运行原型或探测当前代码树。把复现材料留在你自己的 worktree 中。报告每条发现时，写明标题、完整命令、实际打印的输出，以及按意图应有的输出。没有实际运行过的内容不要报告；风格、命名、结构，以及要等未来改动才会发生的风险也不报告。没有发现是有效结果。

Launch adversaries together. Permit local repros, not fixes. Require commands, working directories, prerequisites, and actual versus expected output. Record failed setup as unavailable review, not a clean result. Keep each finding's adversary attribution.

Done when: every adversary has returned findings or an explicit "no findings", and any unavailable review is disclosed rather than counted as clean.

### 3. 复核 (verify)

Create a fresh parent-verification git worktree outside the repository at the same review revision, copying the same scoped working-tree changes and relevant inputs. Rerun every reported command with this fresh worktree as its working directory, never the primary checkout or an adversary's modified worktree. Retain a finding only when actual output reproduces a failure that violates intent; self-report is not verification.

Confirm the command exercises reviewed code rather than modified product code, missing dependencies, or an unrelated environment failure. Bound design-probe conclusions to what the run demonstrates.

Drop unsupported, nonreproducing, out-of-scope, and nonviolating reports; record reasons per adversary. Merge shared root causes while retaining distinct effects, commands, and all discoverers.

Do not repair failures. Copy repros, inputs, output, and snapshot identifiers to retained evidence outside the worktrees. Update rerun instructions before removing every adversary and parent-verification worktree created for this review, including after setup failures or when no findings survive. Preserve preexisting worktrees and user artifacts.

Done when: every retained finding has been independently rerun, rejected reports have reasons, duplicate roots are merged, and temporary worktrees are removed without losing evidence.

### 4. 出报告 (report)

Lead with the intent and scope. For each verified finding, give its title, affected location, exact command, observed output, expected output, how it violates intent, and the adversaries that found it. Link retained repros so commands remain usable after worktree cleanup.

Report all verified roots. If none survive, say "no verified findings" and state coverage limits. Give rejected counts and reasons per adversary, separating completed reviews from unavailable ones. Hand back for a repair choice; do not fix or commit product changes.

Done when: the verified report and rejection accounting are delivered without fixes.

## Reply

Give the intent, scope and revision, verified findings with commands and actual versus expected output, retained evidence paths, and adversary attribution. Include rejected counts and reasons per adversary, coverage limits, and any model fallback reported by the configuration block. State that no fixes were applied and ask which findings to repair.
