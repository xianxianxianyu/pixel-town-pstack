---
name: pstack-investigation
description: "Explain how a subsystem works, why it was designed that way, where a responsibility belongs, or which alternative to choose. Use /pstack-investigation for read-only, cited requirement analysis, not implementation or runtime bug repair."
metadata:
  workflow: investigation
---

# Investigation (pstack)

Adapted from the pstack investigation playbook and how, why, and unslop skills (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Own the answer, not a code change. Do not edit files, add instrumentation, commit, or open a PR.

## Steps

### 1. 界定问题 (scope)

Restate the question, scope, success criterion, and deliverable: an explanation or recommendation. If scope is ambiguous, state your interpretation and proceed.

For one module or narrow question, plan one pass without explorers. For multiple modules or services, choose 2–4 distinct angles. When uncertain, start simple. Keep the throughput checkpoint to one line: `throughput checkpoint: n/a, read-only investigation`.

Done when: the question, scope, and delivery format are clear.

### 2. 探索 (explore)

Report `explore` as soon as code or history reading starts, including on the simple path. Read a narrow question's code and history in one pass.

For "why this design?", establish a code anchor with symbols and file:line, then search git history. Use `git blame -L` for last touch and `git log --follow -p -- <file>` for earlier decisions and renames. Read patches, not just commit titles; the latest change may not explain the original choice. Follow linked PRs, issues, or design notes when accessible. Search available chat, observability, error, or analytics sources when relevant; record gaps instead of inventing intent.

For a complex question, launch 2–4 read-only `subagent` explorers together. Give each the original question, code anchor, one distinct angle, and a no-writes boundary. Choose angles such as entry points, data flow, ownership, or historical constraints to fit the question.

Each explorer returns the key components with file:line; the call and data flow; inputs and outputs at boundaries; files read; surprises; and unresolved questions. Ask for evidence, not proposed edits. Keep cited summaries, not raw files or logs, so context remains available for reasoning.

Done when: every angle has returned sourced findings and explicit gaps.

### 3. 讲解成文 (explain)

For the complex path, send all findings to one read-only explainer `subagent`. Have it merge overlaps, resolve contradictions against source, and fill specific gaps without repeating the whole exploration. On the simple path, write directly. Preserve evidence and confidence when editing.

Use these sections, omitting only those that do not apply:
- 概览 / Overview: what it does and the problem it solves, in one or two paragraphs.
- 关键概念 / Key concepts: the types, services, and ownership rules needed to follow the flow.
- 工作原理 / How it works: the trigger, concrete calls, data movement, and decisions. Use prose and named symbols, not a source dump; add a diagram only if it clarifies several interacting components.
- 代码位置 / Where things live: the small file:line map a reader needs to start working here.
- 坑 / Gotchas: surprising behavior, historical constraints, and known gaps.

For a choice, give a recommendation and a tradeoffs table against the user's criteria. Separate observed facts, plausible inferences, competing explanations, and unknowns. Cite file:line for code claims and commits or links for historical claims; current behavior alone does not prove past intent. If a change is suggested, state what history says to preserve, change, avoid, and treat as a risk, without implementing it.

Done when: the explanation or recommendation answers the question, and each conclusion has a source or an explicit uncertainty.

### 4. 回复 (reply)

Edit out praise, chatbot sign-offs, vague attribution, ornamental jargon, and generic conclusions. Name the actor and mechanism, use consistent terms, split dense sentences, and replace "significant" with a fact or number. Do not polish away uncertainty. Give your real judgment with reasons; if the premise is wrong, say so and show the evidence.

When the conclusion points to a code change, record the findings and decision checkpoint with `pstack_pause`, then ask `ask_user_question` with "要不要改". Stop for the answer; do not treat the recommendation as permission to implement. Continue under the matching implementation skill only if the user chooses to change it.

Done when: the cited reply is sent and any decision to change code has been handed back to the human.

## Reply

Send the explanation or recommendation itself, not an agent activity log. Include sources, material gaps, and your judgment. For motivation questions, distinguish documented rationale from inference and name sources that were unavailable or yielded nothing. Leave any proposed code change at the human decision point.
