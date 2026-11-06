---
name: pstack-maintain-verification-skill
description: "Use /pstack-maintain-verification-skill to audit a project's verification map from source and real journeys, shipping only proven corrections to the skill itself."
metadata:
  workflow: maintain-verification-skill
---

# Maintain a verification skill (pstack)

Adapted from pstack maintain-verification-skill and create-verification-skill (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Edit only the verification skill's directory: body, map, owned helpers. Never edit product code or hide regressions in docs. Cover every feature from source and live, not every sentence separately. Keep coverage/drift notes outside the tree, uncommitted.

## Steps

### 1. 找目标 (locate)

Find `.dsh/skills/verify-*/SKILL.md` or `.agents/skills/verify-*/SKILL.md` with launch/drive instructions and a map. Ask which if several qualify. If none, stop and point to `/pstack-create-verification-skill`.

Done when: one existing verification skill and its owned directory are selected.

### 2. 整理索引 (index)

Read `features/README.md` and list sibling files. Fix missing, extra, duplicate, or dead entries without generating an inventory or deleting inconvenient real features.

Done when: the index matches the feature files without duplicate or stale links.

### 3. 源码核对 (source)

Launch one read-only `subagent` per feature file concurrently. Require a feature summary, source entry points, cited suspected drift or "none", and one live recipe. Children read source; they never drive or edit.

Done when: every feature has a returned source summary and live recipe.

### 4. 合并 (reconcile)

Merge recipes into few app states while retaining feature/entry-point attribution. Spot-check cited drift, not every clean claim. Sweep recent changes for missing user features; require a concrete source path before adding one.

Build the live checklist with auth, entitlement, platform, seed, and external-state prerequisites. Distinguish missing prerequisites from broken behavior.

Done when: the feature coverage list, prerequisites, suspected drift, and missing-map candidates are explicit.

### 5. 实机巡检 (live)

The coordinator drives every feature at least once, even when source looks clean. Follow the skill's launch model: serial drives on one long-lived UI/server, or fresh isolated sessions for short-lived CLIs. Do not count unvisited entry points as proved.

Prefer the repo harness. DSH has `bash`; browser/computer-use requires session availability. Otherwise choose plain/PTY/tmux CLI, HTTP, or Node CDP with global `WebSocket` and available Chrome. Document choice and reason; check prerequisites.

Hold these invariants through failures and retries:
- Doctor before first drive, each fresh session, and after surprising/failed drives. Reset or relaunch a wedged UI that doctor cannot detect.
- After every cleanup, observe saved proof at its named paths. Capture real user actions, resulting states, and side effects, not internal setters/test endpoints. Mock only at production boundaries; observe what dry-runs skip rather than trusting names.
- Remove failed-drive residue even from stuck, exited, or shared sessions, without killing a still-needed shared instance. Stop only what this run started, never by process name. Nothing outlives its usefulness; preserve evidence.

For doctor failure caused by skill drift, fix within scope and retry once before calling blocked; restart only what the fix invalidates. `verified-unreachable` requires an attempted route and concrete unmet prerequisite; an omitted prerequisite is map drift, not successful behavior.

List every setup step a stand-in supplied that the target will not; leave these unverified. Retain only instances needed for triage re-proofs, then tear down after the last drive.

Done when: every feature has an observed outcome or concrete unreachable proof; unexplained missing coverage is blocked.

### 6. 分类 (triage)

Classify before editing:
- Wrong/missing user description: fix doc drift against observed behavior.
- Working behavior the driver cannot exercise: fix owned harness helpers; make scripts executable and document invocations.
- Broken app behavior: report a product gap, never fix product code or weaken expectations.

Re-drive harness corrections and affected map/recipe journeys before shipping; a draft is not proof. After the last re-proof, clean owned state and observe surviving evidence. Missing evidence and unreachable prerequisites never become passes.

Done when: all issues are classified, corrections are proved, and product gaps remain visible.

### 7. 交付 (ship)

Choose exactly one verdict:
- `clean`: every feature has source and live coverage, and no correction merits shipping. No commit or PR/MR.
- `changed`: reread changed files; load `pstack-opening-a-pr` through `skill` for one local commit and at most one PR/MR of proven corrections. Exclude product gaps and scratch notes.
- `blocked`: coverage could not finish or a proven correction cannot ship safely. State the exact blocker; no commit or PR/MR.

Done when: one verdict and honest coverage are reported; changed ships only proved corrections.

## Reply

Give verdict, target, source/live coverage, entry points, action/result/side-effect proof, and evidence surviving cleanup. List corrected drift, harness/product gaps, unreachable routes/prerequisites, stand-in setup gaps, and blockers. Include the changed commit/PR/MR, or state no commit.
