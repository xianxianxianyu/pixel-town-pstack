---
name: pstack-opening-a-pr
description: "Use /pstack-opening-a-pr to organize proven changes into ordered commits and ready GitHub PRs or GitLab MRs, or hand back local commits when forge access is unavailable."
---

# Opening a PR/MR (pstack)

Adapted from the pstack opening-a-pr playbook (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Load through the `skill` tool at delivery. Preserve the calling workflow's commit order and proof requirements. Opening a PR/MR does not authorize monitoring or merging.

## Prepare an owned branch

Work in a git worktree or task branch off main. Give concurrent writers separate worktrees. For a dirty checkout, transfer only task changes to a fresh worktree; never reset, discard, or commit unrelated user work.

Resolve the actual main/base branch and remote from the repository. Never create a remote, forge account, or token, or force-push a shared branch.

## Organize commits

Commit liberally, then rebase owned history into small ordered commits, each landable as a future PR/MR. Amend a just-made commit for corrections belonging to it; separate independent work. Do not rewrite shared history.

Before committing, remove AI filler, unsupported claims, and comments repeating code. Keep intent/constraint comments. Stage only intended files; commit bodies must not restate subjects.

Use `type(scope): subject` for commit and request titles, without a trailing period. Types include `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`; scope names the affected area. Keep the subject short and imperative; name a real symbol when it carries the change.

## Write a one-minute briefing

Explain why the change exists, exclusions, risks, and proof. Use short sentences, plain verbs, and one name per concept. Keep the squash-commit body under about 40 lines; link detailed evidence.

Use these `##` headings in order, dropping empty sections except Scope:
- `## Why`: 1–3 short sentences on the problem and approach; no SHA history or base-branch preamble.
- `## What changed`: 1–3 short bullets; use paths/symbols only when needed, and name both sides of a rename or retarget.
- `## Scope`: always include 1–3 short items on coverage and exclusions; no symbols, paths, or file-by-file essay.
- `## Tradeoffs`: only rejected alternatives a reviewer would otherwise ask about.
- `## Blast Radius`: 1–2 sentences on affected users or systems and why the change is safe or risky. If main is failing, state the cost of leaving it that way.
- `## Verification`: 1–3 bullets with actual run paths and outcomes. For performance, give one primary number, its unit, before → after, and a link to raw runs and spread.

Attach screenshots or video when they prove a claim. Put full SHAs, detailed checklists, measurement methodology, and long investigation notes in linked artifacts. Never present an unrun check as evidence.

## Resolve the forge once

Before the first PR/MR operation, inspect the selected remote and available CLI. Keep that forge choice for subsequent operations:
- GitHub remote and `gh` available: use `gh pr create --base <base>`.
- GitLab remote and `glab` available: use `glab mr create --target-branch <base>`.
- No matching CLI, no remote, or an unsupported forge: keep local commits. Push only if a remote exists and the user's workflow permits it; a push alone is not an opened request.

Replace placeholders with actual branches. Pass the reviewed title and body explicitly. On auth/access failure, preserve commits and report the error, not an invented destination or credential. Give the exact completion command when the destination is known.

## Open narrow, ready requests

Prefer narrow requests. In a stack, the root targets main; each child rebases onto its parent's exact tip and targets that branch. Independent work branches from main. Rebase owned work on current main before substantial stack work, preserving the caller's order.

Publish only when the user's workflow permits it. Open ready, never draft: omit `--draft` and avoid draft titles. Confirm status with `gh pr view` or `glab mr view`; if draft, mark ready and confirm. Return the actual request URL, never one inferred from a push.

For fallback delivery, say whether commits stayed local or were pushed without a request, why, and what remains. No remote means local commits complete delivery; do not invent a create command for an unknown destination.

Post the URL or local-commit result and stop. Do not start babysitting checks, triaging new review rounds, or merging. Return to the calling workflow for its final evidence reply.

## Reply

Give the commits and PR/MR URL, or the exact local-commit result and reason. If the user must finish creation, give the runnable command with actual branches and identify the missing CLI/auth prerequisite. Do not claim a request exists without its URL.
