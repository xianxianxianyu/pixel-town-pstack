---
name: pstack-maintain-formal-verification-skill
description: "Use /pstack-maintain-formal-verification-skill after merges or refactors to bring formal checks back in line with covered code, rerun them, and distinguish verification drift from product bugs."
metadata:
  workflow: maintain-formal-verification-skill
  upstream-sha: ae5650febf4320793844c12c4adaa937f417f8da
---

# Maintain a formal verification skill (pstack)

Adapted from pstack maintain-formal-verification-skill (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan), upstream commit `ae5650febf4320793844c12c4adaa937f417f8da`.

A formal check proves a property of what it describes. After code changes, an unchanged check may pass on code that no longer exists. That stale pass is the dangerous case. This is the upkeep loop for checks made by `/pstack-create-formal-verification-skill` or any project-local model checker, prover, or code verifier: changes and merges that skipped the verify skill, not just a change already being made under it.

Edit only verification: models, harnesses, properties, and the verify skill. Never ship product-code edits or weaken a property/model to make a failure pass. Deliberately broken real-code variants belong in isolated scratch work and must be removed. Keep verification updates separate from any product fix.

## Outcomes

Give each check an explicit outcome:
- **in sync**: no change since the last sync alters what the check describes, and it passes.
- **updated**: the verification now describes changed code, and it passes.
- **bug**: the verification describes current code, and the code breaks the property; this is not drift.
- **blocked**: the check could not be brought back in line or run; state exactly why.

A check may be **updated and bug** when bringing the verification in line exposes a real failure.

## Steps

### 1. 找检查 (locate)

Find formal verify skills by what they do, not by a fixed filename: a project skill running a checker, prover, or verifier against named code. Search `.dsh/skills/` and existing project skill locations such as `.agents/skills/`. Read each relevant skill, or the one the user named. Collect each property's covered code, bounds, assumptions, run command, and last confirmed sync commit. If no such skill exists, stop and point to `/pstack-create-formal-verification-skill`.

When no sync commit is recorded, use the last commit that changed the verification files and disclose that fallback. For TLA+ results, load `pstack-statechart` through `skill` by name; do not embed its changing paths or commands in the verify skill. Follow its generated shared diagram protocol.

Done when: every in-scope check has a coverage record and explicit sync baseline, or the absence of a formal skill is reported.

### 2. 先跑原样 (baseline)

Run every check once before changing verification, following its prerequisites and consent requirements. Record exact commands, results, and evidence. A pass says only that the old description still holds; a failure may be drift or a bug. Do not classify it yet.

Done when: every check has an observed baseline, or an exact execution blocker with no claimed pass.

### 3. 逐项读变化 (changes)

Diff covered code from the sync commit to the current commit and read every relevant commit message. Include uncommitted covered changes separately. Follow renamed, split, and moved functions; find new code that writes guarded state even when it lies outside the old file list. Classify every change against the model or harness, not merely the commit message:
- **No effect:** it changes nothing described by the verification, such as comments, formatting, or uncovered paths.
- **Verification no longer describes code:** an indivisible action split, a branch appeared/disappeared, a check moved, a new path reaches guarded state, or a value range changed.
- **Promise changed on purpose:** the comment, tests, changelog, or commit gives evidence of an intentional contract change. Cite it before changing a property.
- **Promise may be broken:** code changed without evidence of a changed promise. Treat a resulting failure as a bug candidate.

Done when: all covered changes, moved code, and new guarded-state writers have a grounded classification and evidence.

### 4. 从代码更新 (update)

Update models or harnesses from the code before rerunning. Every changed part must point to code a reviewer can open; one indivisible step in the verification must remain indivisible in the code. Do not shape the update around what passes.

Change a property only for an intentionally changed promise; record its old wording, new wording, and cited evidence. Keep bounds unless the code change makes them wrong, and disclose any reduction. No product fixes belong in this pass.

Done when: the verification describes current code, and every property or bound change is justified independently of the result.

### 5. 重跑并判断 (judge)

Rerun each check and judge the result:
- **Pass:** show it can still fail. In isolated scratch code, remove a relevant new check, reorder a step, or make another real break of the guarded property; follow the verify skill and observe detection. Remove the break and confirm the restored result. A passing description that cannot catch the break is not proof.
- **Fail:** replay the counterexample against real code, one action at a time. If a step cannot happen, fix the verification and report that modeling error. If every step can happen, report a bug: identify the introducing commit when history establishes it, tell the steps in the code's own words, and state the harm in one sentence. If attribution is not established, say so rather than guessing. Include a cheap real-code test or reproduction as report evidence when available; do not commit it into product code.

For TLA+, read every result through `pstack-statechart`. Preserve findings, unchecked rules, and limits; never present a stale or bounded pass as proof of the whole system.

Done when: each runnable check has a justified outcome, caught-break evidence for passes, replay evidence for failures, and no remaining scratch product changes.

### 6. 同步技能 (sync)

Update covered files/functions, commands, bounds, assumptions, and the sync commit. Set that commit to the one actually checked, only after confirming that the verification describes it. Record uncommitted covered changes separately. Never advance the sync commit for a blocked check; disclose that it stayed put.

Follow the updated verify skill once exactly as a cold reader would, preserving its results and evidence. If those steps cannot run, the check is blocked, not delivered as updated.

Done when: the skill's instructions have run, its coverage is current, and each non-blocked sync marker has evidence behind it.

### 7. 交付结论 (report)

Give one of the fixed outcomes for every check, allowing **updated and bug**. Say plainly which failures were verification drift and which were product bugs. If a baseline pass becomes a failure after correction, explicitly say that the old pass described stale code.

Leave verification updates uncommitted as a change of their own, separate from product fixes. List files, proof, exclusions, and blockers for the user's commit decision.

Done when: every check has its outcome and evidence, all drift and bugs are distinguished, and no product edit or blocked sync advance is hidden in the handback.

## Reply

For each check give the outcome, target skill, sync baseline/current marker and commits read, changed verification and reasons, cited intentional promise changes, baseline/rerun results, and the scratch break used to prove detection. Describe each bug's replay, harm, and introducing commit (or the attribution gap). Include evidence paths, bounds/assumptions and any reductions, uncovered/new code, unchanged blocked sync markers, and uncommitted verification files. State no product edits and no commit; an incomplete run is blocked, not in sync.
