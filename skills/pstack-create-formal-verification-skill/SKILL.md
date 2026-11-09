---
name: pstack-create-formal-verification-skill
description: "Use /pstack-create-formal-verification-skill to generate a project-local formal check of the code where a bug costs the most and tests reach the least: races, invariants, retries, state machines, parsers, or unsafe code."
metadata:
  workflow: create-formal-verification-skill
  upstream-sha: ae5650febf4320793844c12c4adaa937f417f8da
---

# Create a formal verification skill (pstack)

Adapted from pstack create-formal-verification-skill (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan), upstream commit `ae5650febf4320793844c12c4adaa937f417f8da`.

A test checks cases someone thought to write. Formal verification checks every case in a stated scope: every order of steps in a model, every input up to a bound, or every input. Find where that matters most, verify a property, and leave a skill that the next agent can read cold, mid-change. The user must be able to trust and act on the result without learning the verification language.

Do not ship product-code edits. The deliberate broken variant used to prove the check belongs in isolated scratch work and must be removed. Findings remain findings: never weaken a property or model to obtain a pass.

## Steps

### 1. 选目标 (target)

Answer from the codebase; ask only for facts you cannot observe. Start with an area or bug the user named. Choose a promise whose violation harms users and whose breaking case tests rarely reach, not the easiest target to verify.

State the property and the harm in one plain sentence each. Identify the real files, functions, shared state, and indivisible operations that the check must describe. Every modeled step must be indivisible in the actual code, not merely convenient for the checker.

Done when: the strongest grounded target, its property, its harm, and its code boundary are explicit.

### 2. 选工具 (tool)

Let the question choose the cheapest fitting tool: a model checker, proof assistant, SMT-backed verifier, or another verifier. Bad ordering of events usually suits a small design model; TLA+ is the default for that in any language. Memory safety, overflow, and data-structure properties over inputs usually suit a verifier that runs on the code itself. If the language has no suitable code verifier, say so and use generated inputs against the real code, not a hand model of the function. A property required at every size may need a proof rather than a bound.

Prefer a reproducible tool version developers can install and rerun cheaply in one command. Explain the choice, bounds, assumptions, and exclusions. Check prerequisites first; obtain user agreement before any install or download. For TLA+, load `pstack-statechart` through `skill` and follow its read-only doctor and consent gate.

Done when: the tool, reason, reproducible version, prerequisites, bounds, assumptions, and exclusions are known; required setup is available or an exact blocker is reported.

### 3. 生成技能 (generate)

Write `<repo>/.dsh/skills/verify-<area>/SKILL.md` with YAML frontmatter naming the area and describing when to use it. Include the model, harness, or properties it owns. Use this repo's commands, paths, and nouns, never placeholders.

The skill alone must let a cold reader:
- Determine whether a change touches verified code, with each property mapped to real files and functions.
- Read the property and user harm without knowing the verification language.
- Run one reproducible command with exact prerequisites, working directory, bounds, assumptions, and expected evidence.
- Tell a real bug from a modeling error by replaying the counterexample against the code.
- Update the verification for an intended change without weakening an unchanged promise.
- Find the coverage record and the commit last confirmed to match the code. Move that sync commit only after confirming that the verification describes the new commit; record uncommitted covered changes separately rather than treating a commit as proof of them.

For TLA+, instruct the next agent to load `pstack-statechart` through `skill` for every result, passing or failing. It explains violations as shortest paths in plain words and shows the checked state flow. Refer to it by name only: do not copy its commands, options, installation paths, or scripts into the generated skill or helpers. Follow its generated shared diagram protocol instead of embedding a second copy.

Done when: the registered project-local skill and its owned verification are complete, code-grounded, and runnable without missing instructions.

### 4. 证明会失败 (prove)

Follow the generated skill exactly as the next agent would. Record the current-code result. For every property, make an isolated scratch change to the real code that breaks the promise, such as removing a check or reordering steps; follow the generated skill on that change and observe it catch the break. Do not substitute a hand-edited failing model for a broken real-code variant.

Drop the scratch change and confirm the check returns to its original result: passing, or failing only on findings you will report. If the skill misses the break or a step cannot run, fix the skill or verification, not the scratch change. Replay reported counterexamples against the real code; a step that cannot occur is a modeling error, not a product bug. Keep proof artifacts and remove all owned scratch product changes.

Done when: every property has an observed caught break, the scratch change is gone, and the restored result and surviving evidence are recorded. An unexecuted skill is a draft, not a deliverable.

### 5. 交付 (handoff)

Leave generated verification files uncommitted, separate from any product fix, and list them for the user's commit decision. Explain what was verified, why this tool fits, what the check found in plain words, how to rerun it, and what remains outside its scope. Suggest a second target only if a close one was found. Point to `/pstack-maintain-formal-verification-skill` after covered code changes without rechecking.

Done when: the skill, coverage and sync record, executed proof, findings, exclusions, and exact rerun recipe are handed back without product edits.

## Reply

Give the target and property, tool and reason, generated skill/model/harness paths, covered files/functions and sync commit, bounds and assumptions, current-code result, caught broken variants and restored result, and surviving evidence. Tell each counterexample as steps in the code's own words with the user harm. Include the rerun recipe, exclusions, uncommitted files, and any exact blocker; never call an unexecuted draft complete.
