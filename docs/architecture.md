# Architecture

[English guide](../README.md) · [中文指南](../README.zh.md)

Pixel Town is a DSH plugin with a skill provider, four reporting tools, a session-event fold, and a browser scene. The town observes committed activity and opens unsent drafts; it is not a workflow scheduler, verifier, or Git automation service.

## Modules and data flow

| Area | Responsibility |
| --- | --- |
| `skills/pstack-*/` | Seventeen workflow skills plus shared `pstack-opening-a-pr` delivery and `pstack-statechart` tool skills. |
| `src/shared/workflows.ts` | Workflow IDs, stages, skill names, reporting protocol, delivery skill, and historical ID mapping. |
| `src/shared/fold.ts` | Pure folding of session records into progress, status, goals, delivery, and token usage. |
| `src/shared/trail.ts` | Decision rows, evidence references, audit findings, transcript and TSV rendering. |
| `src/shared/model-roles.ts` | Role limits, assignment validation, model-routing instructions. |
| `src/shared/output-cap.ts` | Output-cap configuration, recovery-notice recognition, and bounded previews. |
| `src/host/` | DSH registration, authenticated APIs, static assets, atomic data-file writes, and model-service integration. |
| `src/client/` | Sidebar panel, same-origin iframe bridge, workspace subscription, and public DSH UI integration. |
| `board/` | Scene art, rendering, live data, navigation-message parsing, popovers, and controls. |
| `scripts/replay.mjs` | Offline inspection using the same fold as the live host. |
| `test/` | Public tests for workflows, events, costs, tools, trails, navigation, and live-data handling. |

```text
skill load → shared protocol + model-role instructions → agent actions
                                                         ↓
DSH committed session records ← successful tool calls/results
             ↓
       shared event fold → authenticated board API → live-data → town
             ↓
       offline replay CLI

town → same-origin client bridge → DSH workspace/session UI → unsent draft
```

`scripts/build.mjs` uses esbuild to produce host/shared ESM modules and a client bundle. The browser bundle is registered through DSH's module loader; DSH supplies React, so the build does not embed another React instance. The host bundles `yaml` for skill front matter and leaves DSH packages external. The client bundles a pinned copy of DSH's `@deepseek-ai/dsh-util-workspace-path`, the file-address helper DSH's own client bundles also inline instead of sharing through the module table. Required upstream notices are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Skills and progress reporting

The skill provider discovers `SKILL.md` files, reads their YAML front matter, and appends the shared protocol when `metadata.workflow` names a workflow. The manifest is the authority for stages, skill names, and the client launch allowlist; the art catalog adds building placement, descriptions, and upstream provenance, not a second executable routing list.

`pstack_stage({ workflow, stage, note })` accepts a known workflow, a stage in that workflow, and a nonempty one-line note. Reports can start at any stage, move forward, roll back, or change workflows. Repeating a stage changes its note; returning to an earlier stage records a rollback; changing workflows records the handoff source. A successful committed result makes the report authoritative. A tool call by itself does not.

Accepted reports synchronize native DSH todos:

- The current stage is `in_progress`.
- Previously visited stages remain `completed`, including after rollback.
- Unvisited earlier stages are `completed` with a skipped annotation.
- Other stages are `pending`.
- Invalid reports leave todos unchanged.

The injected guidance asks agents to report before a stage's first action, report each re-entry, explain skips, and avoid a reply containing only a report. It also asks them not to duplicate playbook steps with `todo_write`. These are skill instructions, not enforced transitions or evidence gates. Diagnosis-to-fix handbacks and requested design checkpoints remain human decisions.

`pstack-opening-a-pr` has no `metadata.workflow` and is not a plaque. The implementation workflows load it at delivery; verification maintenance loads it only when corrections exist. The exit gate can open its unsent command draft. GitHub/GitLab delivery or local commits are performed by the agent following the skill, not by the renderer or reporting tools. Opening a PR/MR does not authorize merging or monitoring it.

Project verification skills use `.dsh/skills/verify-<app>/SKILL.md`, a feature map, and any needed helpers. Creation must exercise the real launch → doctor → feature → evidence → cleanup path; maintenance repairs only that verification-skill directory and reports product regressions. Workflows marked `surface: true` recommend using an existing project verification skill, but do not gate execution on it.

Every workflow protocol carries one drawing rule: when the `canvas-diagram` skill is available, write the diagram as a `.mmd` file, pass `canvas_check`, and deliver it with `present`; otherwise answer with a `mermaid` code block. `pstack-opening-a-pr` does not repeat it, because forge descriptions render `mermaid` blocks directly.

`create-formal-verification-skill` and `maintain-formal-verification-skill` are workflows with their own plaques. Their project-local output is `<repo>/.dsh/skills/<name>/SKILL.md`; a check records the property, covered code, bounds, assumptions, command and last sync commit. Maintenance distinguishes stale descriptions from real code bugs, only updates verification artifacts, and does not advance a blocked check's sync commit.

`pstack-statechart` is a shared tool skill with no workflow or plaque. On load, the provider derives the launcher, doctor and rendering-reference paths from the selected skill's absolute `locator` directory, so package relocation and configured `skillsRoot` both work. It appends shell-quoted `STATECHART_SCRIPT`, `STATECHART_DOCTOR` and `STATECHART_RENDER` assignments plus the **same** exported drawing-rule sentence used by stage protocols, not a second policy. The pipeline produces `chart.mmd` and `report.md`; charts go next to the workspace model before `canvas_check` / `present`, or are delivered as Mermaid text with the report when canvas is unavailable.

`pstack-poteto-mode` is the user-only entry (`disable-model-invocation: true`). The provider maps that frontmatter to `invocation.modelInvocable: false`, so only `/pstack-poteto-mode` reaches it; the model catalog and `skill` tool never see it. It has no `metadata.workflow`. It restates the goal, then routes all 23 upstream playbooks: matched ones load a town workflow skill through the `skill` tool, whose first `pstack_stage` writes that workflow's steps into the task list; Pause safely maps to `pstack_pause`, Session pickup to the save-point resume note, Opening a PR to `pstack-opening-a-pr`; babysit, shipping, autopilot, orchestrate and worktree cleanup are declared not ported and run in plain mode. Autonomous runs and large or unmatched goals go to `figure-it-out`, the eighteenth workflow, whose stages mirror upstream phases A–E (frame, design, loop, trail, verify) with `trail: true`.

The 24 upstream principle leaves ship byte for byte under `skills/pstack-poteto-mode/references/principles/`, pinned by SHA-256 in the notices and a test. On load of either `pstack-poteto-mode` or the `figure-it-out` skill, the provider appends a **Poteto principles** block with the absolute poteto-mode `SKILL.md` and leaf directory derived from the candidate's `locator`, so figure-it-out started from its plaque reads the same index. The entry also receives the worker and reviewer lines of the model-role block when those roles are assigned.

That block also supplies a bounded `read` call for the Principles section. Its line range is derived from the installed skill, including frontmatter, rather than hard-coded or duplicated in another index. Reading the full entry can exceed the town's output cap and omit the index from the retained excerpt; the bounded call keeps it visible on the direct plaque route.

At each direct user input in a poteto session, an outer `agent/pre-step` listener appends a short mode reminder after skill expansion. Activation comes from the durable `skill-invocation` source for `pstack-poteto-mode`, including the initial step's expanded messages. A textual mention does not activate it. No mutable mode flag is kept, so resumed sessions keep the same behavior. Tool-only steps and subagent completions get no reminder. The reminder points at the installed skill and principle leaves and calls out the restatement, re-routing and read-before-cite rules. It improves salience; it does not enforce model compliance.

A live-linked `skills/` directory is read on every catalog miss while the registry stays in host memory. The provider therefore treats an unknown `metadata.workflow` as a degraded skill, not an error: `list()` keeps it, and `get()` serves its body with a one-line restart note and no stage protocol or role block. Hosts built before this rule still throw on unknown IDs and drop the whole catalog, so adding a workflow to their checkout still requires quit, fast-forward, build, restart.

The statechart runtime is byte-identical to pinned upstream pstack, excluding its tests and development configuration; the separate DSH doctor only looks up prerequisites. Node ≥22.18 is required (23.x needs ≥23.6), with existing Java/TLC via `mise` (Temurin 25 / TLC 1.7.4) or `TLA2TOOLS` and optional `JAVA`. The doctor runs before the pipeline. The unmodified upstream runner can provision missing managed tools, so the skill requires user consent before a run that would install them. No npm runtime dependencies are added. Upstream revision and SHA-256 inventory live in `THIRD_PARTY_NOTICES.md` and are checked by the integrity test.

## Event fold and session lifecycle

The live adapter prepends the native session header to `snapshotEvents()` and passes the result to the shared fold. **`snapshotEvents()` is deprecated in DSH.** This integration is tied to the tested host contracts and needs review when DSH changes them. The board enumerates sessions mounted in the **current DSH process**, not all persisted sessions.

The fold tracks committed tools, stage history, skipped stages, rollback, handoff, questions and approvals, child settlement, checkpoints, interruption, native goals, delivery, and costs. It maintains an explicit continuation state rather than a hidden global cache.

- A parent with unsettled children remains `working`, even when its own turn is inactive. A child catalog event introduces work; a `subagent-settled` message settles its sender; a later message to that child makes it pending again.
- The last stage finishes only after its turn ends and all children settle. Questions and approvals take priority.
- A completed checkpointed turn is `paused`. Starting a new turn restores working status without deleting the latest checkpoint.
- An ended turn marked `aborted`, `error`, `interrupted`, `blocked`, or `max-tokens` is `interrupted` unless that turn has a checkpoint. Status precedence is human attention → interruption → pause → ordinary status rules.
- `finishedAt` records the transition to finished, not the last stage report, and clears when work resumes.

Delivery badges require a successful committed shell result, a workflow with a `pr` or `ship` stage, and evidence that the delivery stage has been reached. The fold splits simple commands on `;`, `&&`, `||`, `|`, and newlines while respecting single/double quotes and escapes. After leading `VAR=value` assignments and `command`/`env` prefixes, only `gh pr create`, `glab mr create`, or `git [-C <dir>] commit` at command position count. `git commit --dry-run` does not count; `-n` is Git's `--no-verify` (bypass hooks), so a successful commit with it still counts. Failed results and nonzero exit markers never count.

Only output from a shell command containing a matched forge **create** command can supply a PR/MR URL. `echo`/`cat` output, quoted command examples, and `gh pr view`/`glab mr view` do not establish delivery: viewing an existing PR/MR does not prove this session created it. A create result without a URL records `pr`/`mr`; a successful local commit records `local`. A later local commit or URL-less result does not erase a known link. No matching evidence means `delivery: null`; a stage report alone is not delivery proof.

The latest chart, `canvas: { path, at }`, is the path of the last committed `canvas_check` call whose result is `isError: false`. dsh-canvas defines that result as "the file passed validation". Failed and pending checks do not count. Cwd-relative paths resolve against the effective working directory at call time; absolute paths and `~` / `~/…` stay verbatim for DSH to resolve when opening. DSH does not expand `~user/…`, so it remains cwd-relative. Without a recorded cwd, only absolute and home-relative paths can supply a chart link. A fork boundary resets the chart as it resets delivery. A subagent's checks stay with the subagent's session.

Native `goal/change` version-1 snapshots and clears feed the goal display. Only admitted goal-sourced user messages advance rounds; ordinary user messages do not. Unknown versions are ignored. The town renders the objective, phase, rounds, and blocker, but DSH owns goal execution.

Historical records remain readable: `requirement` maps to `feature`, and `bug-analysis` maps to `runtime-forensics`; live reports accept only current IDs. Historical ADR reports retain usage and stage history but receive no current plaque. Old `check` or `repro` data is not interpreted as an evidence gate. Unknown workflows and sessions without a workflow appear under **其他会话**.

## Token accounting

Token totals describe usage, not currency. Each assistant message contributes cache hits, cache misses, output tokens, one step, input-context size, and peak context to the accepted stage active at that point. Before a first accepted report, usage belongs to `pre`; revisiting a stage combines its visits.

Subagent sessions are hidden as independent residents. Attached descendants roll into the parent's stage at spawning, using the catalog's child creation time and falling back to the child's session header. An unattached subtree is excluded. Inherited fork history is not charged again to the child's own usage. Missing usage yields zero tokens while assistant messages still count as steps.

Repeated context reads count on each request, so a large total is not that much unique text. Resident cards and offline cost reports show steps, peak context, child counts, and per-stage totals with that distinction.

## Checkpoints and decision trails

The host requires an absolute `root` outside the user's repository. The bundled patch resolves it to `dshHomePath('pixel-town-pstack')`, normally `~/.dsh/pixel-town-pstack/`. Resume notes, model assignments, and trail exports use temporary files followed by atomic replacement. DSH's committed session records remain authoritative; these files are configuration or readable exports.

### Checkpoints

`pstack_pause({ waiting_for, reason, resume })` requires an active workflow. `reason` is `handback` or `requested`; `resume` contains `intent`, `done`, `state`, `next`, optional `gotchas`, and the `files` and `uncommitted` path arrays. It writes `resume/<sessionId>.md`, without running repository commands or editing, stashing, or committing code.

The optional commands service registers `/pstack-pause [reason]`. It steers a running agent or follows up an idle one with instructions to interrupt running children, avoid further changes, save, and end. It returns an error without an active workflow. A crash or stop button cannot create a checkpoint retroactively.

### Trails and evidence

Trails are automatic for new `hillclimb` and `multi-phase-plan` runs, or enabled on another active workflow by `/pstack-trail [note]`.

`pstack_log({ decision, why, evidence, result, supersedes? })` validates one-line text and nonempty evidence. `call:<providerId>` selects the last committed call with that opaque provider ID; `invocation:<ref>` selects only the exact canonical invocation. Relative references resolve when the row is written:

- `call:last`: latest committed non-`pstack_*` call.
- `call:last:<toolName>`: latest committed call for that non-`pstack_*` tool.
- `call:-<n>`: n-th most recent committed non-`pstack_*` call, starting at 1.

New call evidence stores `{ kind: "invocation", ref }`: `seq:<n>` uses the `tool/call` event's session sequence number; older records without a sequence use `tuple:<encoded>` where `<encoded>` is `encodeURIComponent(JSON.stringify([turn, step, providerId]))`. Calls and results still pair by that complete tuple, while the raw provider ID is retained separately. Historical `{ kind: "call", ref }` rows always use last-committed provider-ID lookup, including IDs beginning with `seq:` or `tuple:`. Lookup never falls back between these two namespaces. All newly logged relative or provider-ID inputs resolve to the explicitly tagged invocation form before persistence.

Supplemental pointers are `file:<path>[:line]`, `commit:<sha>`, and `url:<https URL>`; file existence, SHA syntax, and URL scheme are checked at this boundary. Corrections append a superseding row rather than mutating history.

`pstack_audit({})` checks missing evidence, success claims contradicted by referenced errors, unlogged stage pivots and successful file-changing calls, and informational superseded rows. Findings are mechanical signals, not proof of semantic correctness or an exhaustive record of all actions. The exports are:

- `trails/<sessionId>.tsv`: `ts, phase, decision, why, evidence, result`, with upstream-compatible TSV cell hygiene; canonical pointers render as `invocation:<ref>`, while historical pointers retain `call:<providerId>`.
- `trails/<sessionId>.transcript.md`: no reasoning; paired tool-call and result headings distinguish canonical `invocation:<ref>` labels from raw `call:<providerId>` labels. Tool arguments are capped at 2,000 characters and results at 4,000, retaining both ends when shortened.

A separate reviewer reads both exports. Its result is recorded with `pstack_audit({ review: { model, flags } })`; empty flags means No flags. Same-family review must be disclosed and is not an independent eval judge. Ended turns with non-informational audit findings or review flags appear under **需要你注意**. Evidence chips retrieve authenticated tool details, capped at 2,000 argument characters and 6,000 output characters.

## Model roles

Roles are worker (up to 1 route), reviewer (3), eval candidate (4), and eval judge (1). `models.json` stores `{ version: 1, roles }`. Missing files mean empty assignments; malformed files are reported to the panel instead of crashing the board.

The host validates assignment shape, role capacity, duplicate provider/model pairs, and membership in DSH's enabled allowlist. The panel offers only authorized models and catalog reasoning levels. Disabled or unavailable model selection produces setup guidance, not simulated routing. The main session's model remains under DSH composer control.

On skill load, interrogate receives reviewer assignments, eval receives candidate/judge assignments, blast-radius receives optional reviewers, and other workflows receive workers. Trail-enabled workflows also receive reviewers. Empty roles use runtime defaults, with two interrogate seats and one eval candidate seat. A rejected or unavailable route requires honest fallback disclosure without silently changing the configured seat count.

For trail reviews and interrogate adversaries, an unspecified reasoning effort defaults to one catalog level below that model's default when possible. Explicit effort wins; missing catalog information never causes a guessed level. This does not change stored assignments or worker, eval-judge, and blast-radius roles. Settings and newly loaded instructions apply to new sessions; this plugin does not rewrite running agents.

Eval requires a judge outside every candidate's actual model family and outside the organizer's family. If independence cannot be established, independent judging is skipped explicitly. Neutral paths and anonymous outputs do **not** provide full blinding: DSH children can receive organizer workspace context, and shared filesystem access can leave organizer materials reachable. Headless model-routing limits must also be disclosed.

## HTTP and iframe boundaries

The API prefix is **`/api/pixel-town-pstack`**:

| Route | Access and contract |
| --- | --- |
| `GET /board` | DSH-authenticated; `{ workflows, deliverySkill, legacyWorkflowIds, sessions }`. |
| `GET /models` | DSH-authenticated; roles, assignments, model-selection availability/allowlist, and an optional error. |
| `PUT /models` | DSH-authenticated; accepts only `{ assignments }`, validates and atomically saves; invalid input returns 400. |
| `GET /evidence?session=<id>&invocation=<ref>` or `…&call=<providerId>` | DSH-authenticated; exactly one selector is required. `invocation` resolves only canonical refs; `call` resolves only opaque provider IDs using legacy last-match behavior. Returns `{ name, args, isError, output }`; unknown session/evidence returns 404. |
| `GET` / `HEAD /town/…` | Public static shell/assets from a fixed allowlist; no session data is embedded in them. |

The town polls the board every 1.5 seconds while visible, suspending polling when hidden. Errors show a disconnected indicator and retry UI. Static assets are read live from the linked package; rebuilding and restarting is necessary for host and bundled client changes.

The provider's `list()` and `get()` read skill files on each call; it owns no watcher or body cache. DSH's registry caches discovery by working directory, scope chain, and registry revision, but always calls the winning provider's `get()` for the body. A cached old catalog can temporarily survive a disk update; a cache miss or invalidation re-reads new workflow metadata, and an old host rejects unknown IDs. DSH catches that provider error, omits the entire town catalog, and marks discovery incomplete. Therefore a live linked update adding workflows must stop DSH first, update source/skills, rebuild `lib/` while stopped, and restart only after success. Restarting with old `lib/` does not fix it. Board launch gating is independently safe but cannot make the incompatible skill catalog safe.

Embedded navigation uses same-origin messages under the `pixel-town-pstack/` namespace. The client checks the exact iframe window, origin, and message shape before acting:

- `open-session`: call public `ctx.uiWorkspace.openSession(sessionId)`.
- `open-file`: `{ sessionId, path }`, both non-empty strings. Call `ctx.uiWorkspace.openSession(sessionId)` and wait up to 2 seconds for `ctx.sidebarRight.mounted` to report that session. That report precedes the render that creates the session's sidebar store, so the client then waits one task and checks the session is still on screen. It then calls `ctx.sidebarRight.openResource(fileAddressFor(sessionId, cwd, path), { revealIfOpened: true })`, with `cwd` from the public sessions list, which is the same address DSH's own file links use. A timeout or a thrown error shows the open-failure alert. The pending open belongs to the plugin, not the town page, which unmounts when the conversation takes the main column. The resident card offers this as **最新图表** only when embedded and only when the host reports a chart; older hosts report none.
- `workspaces`: reply with `{ items: [{ id, title, path }] }` and push public workspace-list subscription updates; unsubscribe on unmount.
- `start-session`: allow only manifest skills plus `DELIVERY_SKILL`, validate a selected workspace against the current snapshot, then call `ctx.uiWorkspace.startSession(workspaceId, { prompt: '/' + skill + ' ', whenDraftExists: 'append' })`.

The final action opens/reuses a conversation and fills its composer; it **never submits**. Omitting a workspace lets DSH choose the current or recent one. Existing drafts are appended to, not overwritten. No private UI service or simulated sidebar click is used.

Standalone plaques show copyable commands. An embedded parent that does not answer within 1.5 seconds also falls back to copyable commands with restart guidance. Standalone conversation navigation uses DSH's same-origin startup session preference and opens `/`; it is not a portable per-session URL or a cross-device link.

## Rendering and interaction

The world is a fixed **472 × 360 art-pixel** stage. Background, glow, and sprite canvases, SVG overlay, and hit targets share one CSS transform; resizing changes that transform rather than repainting the static art. Scaling fits the entire world, uses device-pixel-aligned sizing when close enough to the fit, and simplifies nameplates when text becomes too small. Popovers remain full-size HTML.

A 32-color palette defines three work buildings and a park around the central fountain. There are eighteen plaques: six in construction (three back-row and three front-row stations), seven in the detective agency (three back-row and four front-row stations), and five in the clinic. Residents move to their current plaque, to a building save point when saved or waiting, or out through the delivery exit when finished. Interrupted residents remain greyed at their own plaque. Existing residents load in place, and reloading does not replay arrivals or departures. Static plaques may outlive an in-memory host version: a plaque only offers launch controls when the host payload advertises its workflow and skill. Otherwise clicking shows an explicit not-connected hint and sends no start request. The 说目标 button under the west 入镇 stone follows the same rule: it is visible only when `/board` advertises `entrySkill`, and its start form posts that skill through the shared start-draft bridge, which the client allows next to the delivery and workflow skills.

One animation loop is capped at 12 fps and paused while hidden. Local time controls day, dusk, and night lighting; a prepainted light map keeps work areas and controls visible at night. Quiet mode and system reduced motion stop ambient movement and make journeys instant.

Keyboard-focusable plaques, residents, inbox, notice board, and exit open one anchored popover at a time. Escape, outside click, or close returns focus to the trigger. Nameplates use number, title, and status glyph; a resident card keeps the full details. Native-goal and trail badges stack separately from save/pause/interruption indicators.

The inbox groups questions/approvals, saved handbacks, and interruptions. The notice board lists active residents in attention order, other sessions, and the last 20 departures with known delivery links. No control answers a question, approves a tool, resumes an agent, or sends a prompt automatically.

## Tool-output budget

The host option `outputCapTokens` defaults to **3000**; `0` disables the plugin cap. It must be a nonnegative safe integer whose three-times character budget is also safe. The estimate is `ceil(text.length / 3)` over JavaScript UTF-16 characters, not an exact tokenizer. Preview, omission marker, and recovery notice fit together inside the budget.

The `tools/post-execute` hook applies only to an unfinished pstack workflow in the calling agent's own session. It handles text-only results; `pstack_*` results are exempt so progress, rows, and reviews remain intact. Existing DSH spill notices are kept verbatim and their previews reduced without saving again.

Full output is stored only through optional DSH `spillStore`, never in plugin-owned spill files. Without recoverable storage, or on a storage error, oversized recovery notice, mixed/non-text content, blocked result, or canonical-value replacement, the result passes through unchanged. Capped `read` output points subsequent offsets/limits to the original file, not its spill copy. Other DSH output policies still apply independently.

## Development and evidence boundary

Build, test, typecheck, public-content checks, the isolated development profile, and replay commands are documented in the [English](../README.md#development) and [Chinese](../README.zh.md#开发) guides. Replay accepts a session directory or native v4 JSONL file; `--cost` includes descendants from the same workspace and `--json` emits structured output. Compressed logs need `zstd` on `PATH`.

The public tree includes source, skills, synthetic test data, and demonstration screenshots. Private evaluation material and the private `town-ui-proof` browser harness are not included. Their absence means the public commands are not a reproduction recipe for private evaluation claims. Tests exercise specific contracts, not universal model compliance, full eval blinding, or compatibility with untested DSH versions.

Copyright (C) 2026 xianxianxianyu. Licensed under **AGPL-3.0-or-later**; upstream notices remain in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
