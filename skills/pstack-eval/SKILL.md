---
name: pstack-eval
description: "Use /pstack-eval to compare a controlled variant through isolated candidates, an organic shared prompt, blinded judging, and an audit of actual files and diffs."
metadata:
  workflow: eval
---

# Eval (pstack)

Adapted from the pstack eval playbook and arena skill (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Own the experiment design. Keep rubric and identity mapping outside candidate environments. Do not weaken blinding for convenience.

## Steps

### 1. 定变量 (frame)

State the tested variable, success behavior, required output, and adoption decision. Hold unrelated inputs constant. If models and variants both change, separate their effects or limit conclusions to those combinations.

Write 3–6 observable criteria on one scale for the judge only. Grade behavior and code shape, not self-report. Hide the rubric, its path, and the variable-to-output mapping from candidates.

Done when: the variable, success behavior, controlled inputs, and private rubric are written.

### 2. 隔离环境 (setup)

Give each candidate a clean directory with its variant and natural task context, such as a project skeleton and relevant instructions. Match starting contents except for the variable; save starting snapshots for diffs. Both the organizer workspace and candidate directories must have project-shaped names across their full absolute paths.

No `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, or `arena` may appear in any directory, file, or prompt a candidate sees. Sanitize slugs and ancestor paths; use project-shaped names. Keep orchestration notes elsewhere.

DSH children receive the parent's workspace path in runtime context even when their task names another directory. A neutral candidate directory alone does not blind a revealing organizer workspace. Move the organizer to a neutral workspace before dispatch when needed; do not promise that its path is hidden. Keep private materials out of candidate-visible files and instructions, and do not reveal other candidates or expose their files.

Neutral names and separate directories are not filesystem sandboxing. A child with shared filesystem access may still browse the parent workspace and its `.git` materials. Prefer keeping the rubric and identity mapping outside that workspace, but moving a file alone does not make it inaccessible. Describe the runtime's actual access boundary; if organizer materials remain reachable, disclose that residual accessibility and do not claim full isolation.

Done when: project-shaped environments contain the intended variants and natural context, candidate-visible identifying traces are removed, and residual accessibility is disclosed.

### 3. 写提示 (prompt)

Write one organic user request stating the outcome and ordinary constraints, not what is being measured. Send identical task text to each candidate with its neutral directory supplied separately.

No chain-eliciting cues: never ask which skills, principles, or files it applied. Ask for general design notes if needed; grade compliance from the artifact, not self-report.

Before spawning, run a command that scans the actual visible prompt text, each candidate's full directory path, and the parent's full workspace path for every forbidden term above, case-insensitively. Include other visible filenames and instructions, including inherited runtime context, in the scan. Paste the command and its output, including every hit or an explicit no-match result, into the organizer's retained evidence; keep that evidence out of candidate context. Inspect and resolve leaks before dispatch. Do not silently omit hits in ordinary `test/` paths or `node --test` instructions, and never claim a clean scan without command output. If the runtime prevents checking or hiding a surface, disclose that limitation rather than asserting blinding.

Done when: the shared prompt reads as a natural task, the visible surfaces have command-backed scan evidence, and any remaining blinding defects are explicitly recorded.

### 4. 并行候选 (run)

Use exactly one candidate per configured 候选 route listed in the 子 agent 模型 block below; do not add seats to fill variants, repeat a model, or reach a preferred count. An empty 候选 role means one seat on the runtime default, per the empty-role contract. If routing is unavailable, preserve that seat count on the runtime default and disclose the actual fallback rather than silently dropping or adding candidates. Launch those candidates in parallel in separate directories with the same prompt and equivalent resources. Hide routing metadata from task text and visible names.

Retain files, starting-snapshot diffs, and final responses. Record missing output and execution failures. Do not repair artifacts or give private feedback before judging.

Done when: every candidate has returned an artifact or an explicitly recorded failure, and its output snapshot is preserved.

### 5. 盲评 (judge)

After candidates finish, choose one eligible route from the configured 评审 models listed in the 子 agent 模型 block below. The judge must use neither any candidate's actual model nor any candidate's model family, and must also be outside the organizer's family, following arena Phase C. A different model ID in the same family is not independent. Check actual routes after fallback, not just configured names. If no independent family is available, routing would fall back to a candidate's family, or independence cannot be established, skip the independent judge and explicitly state the limitation; do not spawn a same-family substitute. Otherwise give one read-only judge the task, rubric, and all outputs under neutral labels, never model names. Sanitize identity metadata without changing the work; retain originals.

The judge may know it is judging, but not which variant produced an output. Score every set together in one pass on one scale, with criterion-level evidence and reasons. Hide the private label mapping.

Done when: one independent blinded judgment covers every output with criterion-level scores and reasons, or independent judging is explicitly recorded as skipped with its reason.

### 6. 核对 (audit)

Read every actual output end to end, including files and diffs against starting snapshots. Run relevant commands for claims needing execution evidence. Audit these artifacts, not private transcripts or unrelated sessions; do not infer file-reading history from a candidate's claims.

Compare your evidence with the judge's verdict when one exists and explain disagreements using artifacts and criteria. If judging was skipped, label your work as an organizer audit, never a substitute for independent judgment. Bound or invalidate conclusions from ambiguous rubrics or leaked setups. Do not rewrite criteria after seeing outputs to favor a result.

Done when: every output has been inspected and disagreements, missing evidence, and setup limitations are explained.

### 7. 结论 (synthesize)

Reveal identities only after judging (or its explicit skip) and audit. Recommend adoption, rejection, or another run for a named question, based on the variable, rubric, candidate artifacts, and any independent verdict. Limit claims to completed tasks and runs; do not merge or promote artifacts here.

Done when: the recommendation and its evidence are delivered with limitations disclosed.

## Reply

Give the variable, rubric, per-candidate notes and paths, judge's verdict or explicit skip, audit disagreements, synthesis, and adoption recommendation. Include the pre-spawn scan command/output and disclose failures, blinding defects, configured model fallbacks, and any lack of independent judgment; separate observed properties from unproven model-behavior claims.
