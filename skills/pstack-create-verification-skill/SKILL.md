---
name: pstack-create-verification-skill
description: "Use /pstack-create-verification-skill to generate and execute a project-local skill that launches the real app, drives user paths, and preserves behavioral evidence."
metadata:
  workflow: create-verification-skill
---

# Create a verification skill (pstack)

Adapted from pstack create-verification-skill and its feature-map examples (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Write for the next agent reading cold. Do not edit product code except clearly marked verification scaffolding removed by cleanup. An executed skill counts; an unexecuted draft is not a deliverable.

## Steps

### 1. 摸清项目 (interview)

Answer five questions from code; ask only for unobservable facts such as credentials:
- Surface: what users touch; name the primary UI, CLI/TUI, service, desktop, mobile, or library interface and others.
- Run: exact commands, dependencies, ports, environment, auth, migrations, and seed data.
- Drive: prefer repo Playwright/Cypress specs, expect/PTY scripts, HTTP endpoints, or debug ports.
- Observe: screenshots, transcripts, responses, logs, exit codes, and persisted state proving behavior.
- Isolate: separate ports, data, profiles, and accounts; if impossible, document exclusive ownership and refuse concurrent driving.

Use DSH `bash`; browser/computer-use tools require session availability. Without a repo harness, choose PTY/tmux or plain CLI execution, HTTP, or Node CDP using global `WebSocket` and available Chrome. Check prerequisites; state the choice and why.

Report startup blockers before generation. Only irrelevant missing assets may become labeled verification scaffolding with explicit cleanup, not hidden product fixes.

Done when: all five questions have grounded answers and the launch prerequisites are available.

### 2. 生成技能 (generate)

Write `<repo>/.dsh/skills/verify-<app>/SKILL.md` with YAML `name: verify-<app>` and a description naming the app, interface, and trigger. Fill six sections with real commands/selectors, never placeholders:

- **Launch:** install/build, migrate, seed empty isolated state, and wait for usable readiness, not just a port/database response. Record owned processes and teardown. For short-lived CLIs, build once; give each journey a fresh isolated session.
- **Doctor:** one read-only check of liveness, expected build, owned port/data directory, and auth. Run before driving and whenever the instance looks suspect.
- **Drive:** exact commands using stable ARIA names, attributes, prompts, or routes, not coordinates/tab order. Wait for state, not sleeps. Resolve skill-relative paths and name the working directory.
- **Evidence:** exercise real user paths, not internal setters/test endpoints. Capture action, resulting state, and side effects: files, rows, messages. Save commands, stdout/stderr, exit codes or UI captures outside disposable state. Mock only at production boundaries. Observe dry-run/test-mode skips in files, network, browser launches, and git refs; never trust its name.
- **Cleanup:** stop only processes and sessions this run started, never kill by name. Remove scratch state and scaffolding after success or partial failure, never proof artifacts.
- **Helpers:** make shipped scripts executable, document exact invocations, and link the feature index and helpers relative to this generated skill directory.

Done when: all six sections contain real, repository-specific recipes.

### 3. 功能地图 (map)

Create `features/README.md` and files for the top 3–5 user features found in routes, commands, menus, or docs. Index baseline preconditions, drive conventions, proof/skip rules, and feature files.

Each feature states user-visible behavior, then uses these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, `Gotchas`. Name the real harness. List all entry points; pair actions with commands, preconditions, observable results, and side effects.

A missing seed precondition is a failed journey: record why in `Gotchas`, not a weaker journey. One convenient entry point never proves other listed paths. Keep implementation internals out of the user map.

Done when: the index and feature files provide reachable paths, commands, proof predicates, and known prerequisites.

### 4. 亲自跑通 (prove)

Execute launch, doctor, one mapped feature, evidence, and cleanup exactly as written. Name exercised entry points; one feature proves the workflow, not the whole map. Observe proof files after cleanup; lost evidence fails.

Fix failed recipes within scope; clean up after every failed iteration. List every setup step a stand-in supplied that the target will not. Those steps remain unverified until exercised on the target.

Done when: one full journey succeeds, cleanup completes, and surviving evidence paths are recorded.

### 5. 交付 (handoff)

Leave generated files uncommitted and list them for the user's commit decision. Point to `/pstack-maintain-verification-skill` for upkeep when behavior, startup, or entry points change; suggest a schedule only if asked.

Done when: the skill, feature map, executed proof, and unverified steps are handed back.

## Reply

Give the generated skill/map/helper paths, chosen drive method and reason, exact journey run, observed action/result/side effects, and proof paths surviving cleanup. List untested entry points, every stand-in setup gap, and all uncommitted files. Report blockers without calling a draft complete.
