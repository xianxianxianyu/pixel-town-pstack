---
name: pstack-statechart
description: "Use /pstack-statechart to check a TLA+ model of a product flow, protocol, or service and show its Mermaid statechart, with the shortest path to each rule violation in plain words."
metadata:
  upstream-sha: ae5650febf4320793844c12c4adaa937f417f8da
---

# Statechart (pstack)

Adapted from pstack statechart (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan), upstream commit `ae5650febf4320793844c12c4adaa937f417f8da`. The vendored launcher and TypeScript runtime retain upstream bytes; `scripts/doctor.mjs` is the DSH read-only prerequisite companion. Upstream tests, development packages, and TypeScript configuration are not runtime dependencies and are not shipped here.

The chart shows how a system moves between states, in the words of the person who reads it. That person, the reader, decides whether the behavior is right. This shared skill has no town workflow or plaque. It does not authorize product-code changes.

## Prerequisites and consent

Use the absolute `STATECHART_SCRIPT`, `STATECHART_DOCTOR`, and rendering-reference path supplied in the generated block appended by the skill provider. Treat them as supplied values, not guessed paths. If that block is absent, load `pstack-statechart` through DSH `skill`; do not invent an install directory. Bind the supplied values in the shell before using the commands below.

- **Node:** use installed Node >=22.18 with native TypeScript support: Node 22.18–22.x or 23.6+. The upstream launcher also retains Bun/Deno support, but the DSH doctor requires Node. No npm install is needed for this runtime.
- **Java and TLC:** use an existing Java 11+ runtime and [TLC 1.7.4 (`tla2tools.jar`)](https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar). The pinned jar SHA-256 is `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`. Set `TLA2TOOLS` and `JAVA` to existing absolute paths, or let the doctor locate already-installed tools through `mise`. A macOS `/usr/bin/java` stub alone does not establish that Java is installed.
- **Upstream provisioning is not read-only:** with `TLA2TOOLS` unset, the unchanged runner looks up pinned TLC and `java@temurin-25` through mise. If lookup fails it runs `mise install`, requiring network access and changing the tool installation. Never invoke that fallback without first explaining those side effects and obtaining the user's agreement. The launcher itself is not a prerequisite check.

Run this one-line, read-only doctor before the pipeline:

```sh
node "$STATECHART_DOCTOR"
```

The doctor performs existing-tool lookups and `java -version`, not model runs, installs, downloads, or file writes. Exit 0 means it found a supported Node, readable jar, and working Java; it prints a shell-quoted invocation with resolved absolute `TLA2TOOLS` and `JAVA`. Use those values on the pipeline command to bypass upstream provisioning. Its probes and printed invocation disable mise's automatic shim installation. It does not certify the model or check the jar's checksum.

Exit 1 means stop and report the missing prerequisite. If Java/TLC are missing and mise is available, ask for agreement before the first pipeline run that provisions the pinned tools; a provisioning run needs `TLA2TOOLS` unset. Without agreement, do not run it. Alternatively, the user can arrange existing prerequisites and provide `TLA2TOOLS`/`JAVA`. Fix missing or unsupported Node separately. After any agreed setup, rerun the doctor and prefer its resolved environment for subsequent runs. Do not install a renderer just to display the result.

## Run

Work in an isolated scratch folder outside the repo while developing the model. Write a TLA+ spec and its config; retain the final model, config, and view in the workspace verification area so another agent can rerun them. Keep product files unchanged. After the doctor and any required consent, use the provider-supplied launcher:

```sh
"$STATECHART_SCRIPT" SPEC.tla [--config FILE] [--view FILE] [--out DIR]
```

Keep the doctor's resolved `TLA2TOOLS`/`JAVA` environment on that invocation. The default config is `SPEC.cfg` beside the model, and the default output directory is `SPEC-chart`. `--out` must be new or empty; choose a new directory for each rerun. The output includes `report.md`, optional `chart.mmd`, and TLC logs. Exit 0 means the rules hold on the config as written; exit 1 means a rule breaks. Both write results. Exit 2 is an execution/checker error, and signals can return 130/143; errors are not passes and do not produce a completed output directory.

## Write the spec

- Write each rule that the reader agrees to as an INVARIANT. A rule can be about a screen, a result, a stored value, or a message. If the model has no variable for a rule, add the variable. Never weaken a rule to make it hold.
- Write `Next` as a disjunction of the actions, such as `YouPressPlay \/ YouPressStop`. If you do not, TLC names every step `Next`.
- A state with no step out breaks `NoDeadlock`, also when it is a correct end state. When an INVARIANT or a PROPERTY already has that name, the rule is `CHECK_DEADLOCK`. Add to `Next` an action that is true only in the end states and changes nothing, such as `Done == phase \in {"paid", "failed"} /\ UNCHANGED vars`, and give it a label in `step()`.

## Pick the chart

You do the work that needs judgment: the words on each state and arrow, the phases and their colors, the title, and the report to the reader. Put your work in a view module, and give it with `--view`.

To show the reader's words, the view exports `state(vars)`. The value that `state()` returns picks the form:

- A string gives a flat chart: `export const state = (v) => (v.paid ? "Paid" : "Paying");`
- An array gives parent states: `export const state = (v) => v.main.split(".");`
- An object gives one parallel region for each key: `export const state = (v) => ({ Playback: v.playback, Volume: v.volume });`

Label each state with what the reader can see or cares about, such as "Paying" or "Lease held, write pending". Keep variable names out of labels. In `vars`, a TLA+ sequence is an object with keys from 1, so `v.pc[1]` is `pc[1]`. A set is an array.

The view can also export `step(action, from, to)`. It gets the TLC action name and the values before and after the step, and it returns the label of the arrow. Write each step label as the user sees it happen, such as "you press play" or "the connect fails". Do not name the code or the TLA+ action. Two actions that end the same in the chart get the same label, so that they share one arrow.

When a step can occur only in some conditions, end its label with the condition in brackets, in the reader's words, such as `you press play [while the file loads]`. In a regions chart, the command writes the condition on the other regions on the arrow, in the words of their labels, such as `[when Offline]`. Your brackets replace it, and two arrows from one state can then look the same. So in a regions chart, do not write brackets for a condition on another region. When a value that no label shows decides where a step goes, name the result in the label, such as "the roster read fails".

The view can also export these:

- `group(vars)` returns the name of a phase. Each chart state gets the color of its group. When the model states behind one chart state are in different groups, that state gets no color.
- `colors` gives each group name a color class: blue, orange, purple, yellow, teal, tan, or pink.
- `title` is a string that the chart shows at the top.

The command calls `state()` and `group()` at most once for each model state, and `step()` at most once for each step. The chart and the report both use those answers. So make each function depend only on its arguments.

The chart does not draw a step that stays in one label. Split a label when the reader must see such a step.

Aim for about 20 arrows or fewer, because a busier chart is hard to read. First return coarser labels from `state()`. Give one label to values that act the same, and leave out a detail that the reader does not need, such as a call in flight whose return changes nothing. Keep each state of a bug path, and keep each mark. When a merge changes a `breaks` state to `mayBreak`, it hides where a rule breaks. Do not merge two states that break different rules, because the reader then cannot see which rule breaks where. If the chart is still too busy, return `null` from `step()` for the steps that the reader does not need, such as a reset that every state has, or a step whose arrow repeats what other arrows show. Obey these rules when you hide steps:

- Keep each chart state reachable by arrows from a start state.
- Keep at least one arrow out of each chart state that has a step out in the model.
- Hide all the steps of an arrow, or none of them. When you hide only some, its condition gets narrower.
- In the hand-off, say which steps the chart hides.

## Read the report

- In the chart, a state that breaks a rule has the class `breaks`. When only some model states behind it break the rule, it has the class `mayBreak`. The Legend names the rules of each mark. When two rules break, it names both on one mark, so say in the hand-off which state breaks which rule. In a regions chart, a state gets a mark when each combination of region states that includes it can break a rule. When a combination can break a rule and none of its states has a mark, each state in that combination gets a mark.
- TLC goes past a state that breaks a rule, so the chart shows the states after a bug.
- Because TLC goes past bugs, a model with no limit on its states can run without end. Keep the constants small, or add a CONSTRAINT.
- With a VIEW or a SYMMETRY, TLC counts states that it treats as the same as one state, and the chart draws that one state. An arrow can lead to it rather than to the state that the step reaches, and the report says so.
- TLC checks the rules in each state past a CONSTRAINT or an ACTION_CONSTRAINT, but it does not explore that state or check it for deadlock. When TLC's shortest path for a rule ends in such a state, the chart draws that state, and the report gives that path. The chart does not draw the other states past the bound. A deadlock in such a state does not show. TLC also checks the rules after each step that an ACTION_CONSTRAINT excludes, also when it reaches the next state another way. When TLC's shortest path for a rule ends with such a step, the chart draws that step.
- The command checks the rules with TLC on the config as written, with one worker. When a rule breaks, the command removes that rule and runs TLC again, until no rule breaks. After the first break, each run stops at 100,000 distinct states, so that a large model does not run without end. When a run reaches that bound or stops on an error, the report lists the rules that it did not check under "Rules not checked", and the chart does not mark them. A rule that is not checked can hold or break. To check it, remove the rules that break from the config, or make the model smaller. The bound adds a module that changes TLC's order of the variables, so for a property TLC can find a different counterexample than a run without the bound.
- `tlc.out` is what TLC printed on the config as written. When the chart does not show the bug path of a rule that breaks, `tlc-RULE.out` is what TLC printed for the run that found it. When TLC repeats its first warning, plain TLC prints it twice, but `tlc.out` shows it once, because TLC leaves the second copy out of the output that this command reads. That happens only when Java runs with `-XX:+UseParallelGC`, since otherwise TLC's first warning is its advice to pass that flag, which it prints once.

## Show the chart

Follow the generated shared diagram protocol appended to this skill. Read the rendering reference at the absolute path supplied with it for the DSH canvas details. Copy the generated `chart.mmd` next to the workspace model, retaining the report and source artifacts. When `canvas-diagram` is available, run `canvas_check` on that workspace file and then present the checked diagram using the available tool's schema. If canvas is unavailable or cannot render it, give the user the Mermaid code block **and** `report.md`, and report the limitation; never imply that an unobserved render succeeded.

The chart has a budget of 500 states, counted by TLC on the config as written. Above that, it draws only the paths to rules that break; when no rule breaks, the command writes no `chart.mmd`. It still checks each rule, and the report gives the state count and each bug path. Explain the missing chart and show the report rather than fabricating one. To see the whole graph, make the model smaller without disguising the changed bound.

## Hand off

Give each chart and its Mermaid source to the person who must decide, together with `report.md`. Add one line for each bug: the rule, the reader's sentence for that rule, and the path as the report numbers it. Say what the model leaves out, which steps the chart hides, and which rules were not checked. Give the exact command and resolved environment that make the files again, with a new `--out` folder.

When the model describes code, replay each bug path against the real code, as a test or a live repro, one step for each action. If a bug does not occur, think that the model is wrong until you show that it is not. Do not change product code as part of this handback.

Done when: the prerequisite/consent gate was honored, the actual checker result and limits are read, available charts are checked and presented or delivered through the explicit fallback, real-code bug paths are replayed, and durable artifacts plus a rerun command are handed back. Missing prerequisites or unfinished replay remain explicit blockers, not proof.

## Reply

Give the model/config/view paths, checked properties, bounds and assumptions, actual result and exit code, report/log/chart paths, and canvas-check/presentation outcome or Mermaid-plus-report fallback. For every violation include the rule, plain-language harm, numbered counterexample, and real-code replay evidence. State hidden steps, unchecked rules, exclusions, blockers, and the exact rerun command with a new output directory. Leave verification artifacts separate from product changes.
