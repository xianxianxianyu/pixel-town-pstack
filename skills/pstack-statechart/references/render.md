# Show a checked statechart in DSH

Adapted from pstack statechart rendering guidance (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan), upstream commit `ae5650febf4320793844c12c4adaa937f417f8da`. DSH uses the available `canvas-diagram` integration rather than requiring the upstream Pele renderer or a Cursor-specific viewer.

The generated shared diagram protocol appended to `pstack-statechart` owns the common diagram rule. Follow it; this reference supplies the statechart artifact and rendering details, not a second copy of that rule.

## Keep the checked artifacts together

1. Read the pipeline's actual `report.md` and `chart.mmd`. A checker error is not a pass. If the state budget produced no chart, report that fact and hand back the report; do not invent a graph.
2. Retain the model, config, and view in a workspace verification directory. Copy the pipeline's `chart.mmd` next to that workspace model, and retain `report.md` and the TLC logs with their run provenance. Use a dedicated model directory when several models would otherwise collide on `chart.mmd`; do not overwrite another model's artifacts. Keep scratch execution output separate from the durable handback.
3. Use the copied workspace `.mmd` as the rendering source. Do not replace a checked graph with a hand-drawn chart or remove a counterexample to satisfy a renderer. If labels or grouping need improvement, update the view and rerun into a new output directory, then refresh the workspace copy from that run.

## Check before presenting

When `canvas-diagram` is available, inspect its exposed tools and use their actual argument schemas. Run `canvas_check` on the workspace `.mmd`, read its result, and only then present that same checked file through the canvas integration. Do not invent tool names, a successful check, or a rendered image. A parsing/rendering error is separate from the TLC verdict: preserve both facts.

If the canvas integration is unavailable or the chart cannot render, show the full Mermaid source in a `mermaid` code block **and** hand back `report.md` with its result, bounds, and counterexamples. Include durable workspace paths and the concrete rendering limitation. The report is required even if the diagram looks self-explanatory; a pretty graph does not prove a rule.

Do not install Pele, Mermaid CLI, a browser, or another renderer automatically. If the user specifically requests an image export, use an available canvas export capability and give the actual resulting file. If export is unavailable, explain that limitation and retain the Mermaid-plus-report fallback. Any alternative renderer or dependency installation needs the user's agreement first.

## Preserve the graph's meaning

The runtime emits these classes:

| Class | Meaning |
| --- | --- |
| `breaks` | Every represented model state breaks the named rule. |
| `mayBreak` | Only some represented model states break the rule. |
| `bugPath` | The state is on a shortest path to a violation. |
| `repeats` | A PROPERTY counterexample repeats these states forever. |
| `blue`, `orange`, `purple`, `yellow`, `teal`, `tan`, `pink` | Phase colors chosen by the view's `group()` and `colors`. |

For region charts, use the report and Legend's combination-based marks rather than assuming a single region state independently causes a violation. Preserve the Legend and all bug marks. When multiple rules break, name which rule breaks at which state in the handback.

The `.mmd` includes `classDef` lines for `breaks` and `mayBreak`, but not the group palette, `bugPath`, or `repeats`. Canvas viewers may therefore style those classes differently or omit their colors. Color alone is not evidence: keep labels, the Legend, the numbered counterexample, and the report available. If the viewer exposes themes, keep violation marks legible over phase colors in both light and dark views; do not edit checked semantics for cosmetic consistency.

A chart simplified to roughly 20 arrows is usually easier to read, but simplification belongs in the view module under the skill's reachability and rule-preservation constraints. Disclose hidden steps. If a model exceeds the 500-state chart budget, the pipeline may render only violation paths or no chart at all; disclose that limit instead of presenting the partial graph as the complete state space.

## Hand back

Give the workspace model/config/view, chart source, `report.md`, and relevant TLC log paths. State whether `canvas_check` and presentation succeeded, or give the Mermaid-plus-report fallback and its reason. Include each violated rule's plain-language meaning and numbered path, the model's bounds and exclusions, real-code replay evidence, and the exact rerun command with a new output directory.
