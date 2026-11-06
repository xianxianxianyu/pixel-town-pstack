---
name: pstack-prototype
description: "Use /pstack-prototype to settle a layout, interaction, density, behavior, or timing decision with runnable throwaway alternatives outside the repository."
metadata:
  workflow: prototype
---

# Prototype (pstack)

Adapted from the pstack prototype playbook and its exhaust-the-design-space principle (https://github.com/cursor/plugins/tree/main/pstack, MIT, © 2026 Lauren Tan).

Own the decision, not production code. Favor cheap experiments over polish. The result is throwaway; do not merge it or call it ready to ship.

## Steps

### 1. 定决策 (decide)

Write the decision as a question with competing answers. Name the user, task, and observable selection criteria. Choose the layout, interaction, density, behavior, timing, or approach to distinguish.

Separate constraints from preferences. Fix relevant inputs, viewport, and workload across variants. Name what the experiment cannot establish, such as production integration or reliability.

If there is no unresolved decision, say why a prototype adds nothing and hand the request to feature implementation. Do not build a disposable copy of a settled feature.

Done when: the decision, constraints, and observable selection criteria are explicit, or the request has been redirected.

### 2. 找参考 (references)

Skip this optional stage when the direction is set. Otherwise link relevant prior art and summarize distinct layouts, palettes, interactions, or behaviors. Name the property each reference contributes and the constraints it misses.

When the design space is too open, let the user choose directions before building. Settle empirical questions with a runnable experiment rather than asking for a preference.

Done when: the viable directions are listed and the direction needed to start building is selected, or this stage is explicitly skipped.

### 3. 搭原型 (build)

Create a scratch directory outside the repository. Keep prototype files and dependencies there; record its path and launch command. Do not edit production source or make the repository depend on the scratch directory.

For visual work, use vanilla HTML/CSS/JS or the lightest rendering stack, with CDN dependencies and hot reload when useful. For behavior or timing, use the smallest script that exercises the question. No production framework, tests, abstractions, or migration plan.

Compare two or three distinct answers behind one switcher: labeled buttons, a keypress, or a command option. Use consistent input and expose the state needed to reproduce an observation.

Propose useful alternatives the user did not request. Discard approaches that cannot answer the question instead of repairing their architecture. Build only enough interaction to expose the deciding behavior; label simulated data and unavailable integrations.

Done when: every variant runs from the external scratch directory and the single switcher selects each labeled alternative.

### 4. 观察 (observe)

Observe the interface that answers the question. For visual work, drive the interaction and save screenshots of each variant's deciding states at the same viewport. For behavior, record input and output. For timing, record the command, environment, samples, and completed work.

Observation is the test here, not an assertion suite. Compare evidence with the original criteria. If variants hide the difference, change the experiment rather than inventing a preference from code.

Repeat comparable timing runs before choosing. Wrong output, skipped work, or differences within variation prove no improvement. Label rough observations and do not turn scratch timings into production claims.

Done when: every variant has saved observation evidence that bears on the decision, with limitations stated.

### 5. 给结论 (present)

Present alternatives with evidence and tradeoffs, including the recommendation's cost. Recommend using the original criteria, or name the missing observation preventing a choice.

Give the scratch path and launch command. Say plainly that the prototype is throwaway. Hand the direction and evidence to a separate feature or architecture task for the real build; do not promote scratch files into production.

Done when: the recommendation, tradeoffs, evidence, and runnable scratch artifact have been handed back for a direction choice.

## Reply

Give the decision, variants explored, screenshots or observed output and timing, tradeoffs, recommendation, scratch path, and launch command. Separate observations from inference and list what remains unproven. End with the direction to choose, not a claim that production implementation is complete.
