# Third-party notices

Pixel Town (`pixel-town-pstack`) is an unofficial community adaptation.

Copyright (C) 2026 xianxianxianyu. The project as a whole, including its original code, artwork, documentation, and adaptations, is licensed under **AGPL-3.0-or-later**; see [LICENSE](LICENSE). This does not remove or replace the upstream notices and permissions below. The adapted materials were modified for DSH integration and public release in 2026.

## pstack — MIT

- Upstream: <https://github.com/cursor/plugins/tree/main/pstack>
- Author: Lauren Tan ([poteto](https://x.com/poteto)).
- License source: upstream `pstack/LICENSE`, reproduced verbatim below.
- Derived materials: all nineteen `skills/pstack-*/SKILL.md` files adapt pstack playbooks, skills, and engineering principles. Their introductions identify the relevant upstream material. The workflow/stage instructions in `src/shared/workflows.ts`, decision-trail rules and TSV cell handling in `src/shared/trail.ts`, judgment/model-role guidance in `src/shared/model-roles.ts` and `src/host/models.ts`, and plaque descriptions/provenance in `board/art.js` also adapt that material. `skills/pstack-multi-phase-plan/check-plan.mjs` checks the adapted planning format; the README and architecture descriptions summarize these adaptations.
- Vendored statechart runtime: the 27 files listed below under `skills/pstack-statechart/scripts/` are **unmodified MIT-licensed upstream code**, Copyright (c) 2026 Lauren Tan, from commit [`ae5650febf4320793844c12c4adaa937f417f8da`](https://github.com/cursor/plugins/tree/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/statechart). The MIT permission notice immediately below applies to these copies. Upstream tests, development package metadata, `fast-check`, and TypeScript configuration are excluded. The adjacent `doctor.mjs` is a separate DSH integration helper, not an upstream file.
- Statechart's `SKILL.md` and `references/render.md` are adapted from that same revision for DSH paths, prerequisite consent, and canvas rendering. Java and TLC are external prerequisites, not bundled binaries.

```text
MIT License

Copyright (c) 2026 Lauren Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Statechart runtime SHA-256 inventory

These checksums pin the byte-identical runtime from the source revision above. `test/statechart-vendor.test.mjs` checks the complete shipped runtime inventory against them; when updating upstream, replace the files and this inventory together.

```sha256
aea4d8766d214e7fa08f4881f1037319655e75eb56652e1b6d5d4f13a162e3e1  skills/pstack-statechart/scripts/backends/cfg.ts
75704b2704a9399a39479ff704a580d5b9a1d0fede01fe771df28bf799b434b6  skills/pstack-statechart/scripts/backends/mermaid.ts
e2bedb855eb3806ec3fe7a7bfa49baa309fb4cf0da425b5fe1e0686268ce255a  skills/pstack-statechart/scripts/backends/plain-text.ts
730b4048578ab0468e1581f16fec60b246e321161effb68e481efb373f0f2501  skills/pstack-statechart/scripts/backends/report.ts
5eeab1e755f20a2c83b408c6503fdc9c6b10c971d8dedad3f912bd15f9763daf  skills/pstack-statechart/scripts/frontends/config.ts
4eef9ec848557dcd01ca8dbbec75b71c0653c1b73583108bafbb6f559f6d677b  skills/pstack-statechart/scripts/frontends/dot.ts
eb0120e61a4004a435c7b7c46916da9dc8b2fa8696ed0d3eb64dc953fed3ab11  skills/pstack-statechart/scripts/frontends/marks.ts
36bfc6fb3ffa86897661efb2aa67bd95b55a4da9a3e952831f6e0668826b4b92  skills/pstack-statechart/scripts/frontends/messages.ts
450cdfc8d0577a96818ca3697efebbbf70b530a4ba7e3eee03cf1ba8d3f1a0fd  skills/pstack-statechart/scripts/frontends/spec.ts
7d083cf89b81c41556fc3fd5f07019886e0f6783c632475e7181ac4b81887367  skills/pstack-statechart/scripts/frontends/trace.ts
7c54be394b7a10f60591858a0f08fb1e8dc0941df1f38ede07fbe7719ff56da0  skills/pstack-statechart/scripts/frontends/value.ts
0d0a9d6b6d6da5a7c48851b86d9d041f22982404dda6288795a1715138d7008b  skills/pstack-statechart/scripts/frontends/verdict.ts
2c0af8939321c5aaed4b6ecac8ce6a98d0e6774d8bd15d4b02fe4f406b8c9620  skills/pstack-statechart/scripts/frontends/view.ts
5602beca4e4ac08421cfa07e4da989f0e75439f1d136cc923226909e771dc7ff  skills/pstack-statechart/scripts/ir.ts
dc8eeee09c3a9a0c060f32fb1d554e01bd80e5265751cdeb041ef3e19561b92a  skills/pstack-statechart/scripts/passes/annotate.ts
b5ef402369c5e7846be1fd39165e95cbfe715fc36eb9331a0401b26523c539c9  skills/pstack-statechart/scripts/passes/label.ts
8977dddc6c93bb2e3914d5b50760eb66876107ba51e2b8cf9e18611b4c40c89c  skills/pstack-statechart/scripts/passes/lift.ts
07d459385849aa35834040bf34e279c39baba68244ec9da17c57703a6ee8e2d4  skills/pstack-statechart/scripts/passes/loop-check.ts
9af1066b007ef86cb05c5e278eef09f090f1e46eb91d356e5146edbd4fee4ec7  skills/pstack-statechart/scripts/passes/paths.ts
b52b38f926814937b733221b40bd31075a69a2fb91ecbce2164752a8684bc5d6  skills/pstack-statechart/scripts/passes/reach.ts
8a6e0618740a14bb7048f6563b4324958177f4685d4d6d90364cc6245b1498b4  skills/pstack-statechart/scripts/passes/region-check.ts
d740ebfdbb5ec7b4984412a635a596b43af7a77b8bcb49a1463c8afa75299f72  skills/pstack-statechart/scripts/passes/regions.ts
8aa8d9295ab6762f7f2ffae91a0aee98b1a1314747c875edba4598fdab8ed543  skills/pstack-statechart/scripts/pipeline.ts
f330e0a3b0a9f8181c2e52252c4a47db3f0a64f79a7cca5490263e33a5f13c72  skills/pstack-statechart/scripts/run.ts
aeffb7077850fd4c225e3d18049ca6ed7b988cf48e88cd8463526a7feaa74d13  skills/pstack-statechart/scripts/statechart
1c653f05d0cd0f3298455701f36e3d7d1f837f93e6e642f7c20afb5d613c2d12  skills/pstack-statechart/scripts/statechart.ts
1f18ed5ef806982e05e8a40fc217e88257700b28b63cb4acbd647872f85f782b  skills/pstack-statechart/scripts/worker.ts
```

## DeepSeek Harness (DSH) — MIT

- Upstream: <https://github.com/deepseek-ai/deepseek-harness>
- Author: DeepSeek.
- License source: upstream root `LICENSE`, reproduced verbatim below.
- Derived integration material: `src/host/dsh.ts` and `src/client/dsh.ts` describe the DSH interfaces used by this plugin; `src/shared/fold.ts` adapts native session/goal event behavior, including the goal snapshot and admitted-round rules; `src/client/index.tsx` adapts public workspace/session navigation, Sidebar file opening, and default-workspace display conventions. Associated integration and event-fold tests exercise these DSH contracts. The host registration in `src/host/index.ts` and the integration descriptions in `docs/architecture.md` rely on these upstream contracts. This is an adapter, not a vendored copy of the DSH runtime.
- Bundled use: `@deepseek-ai/dsh-util-workspace-path` (locked `0.2.2-rc.1` in `pnpm-lock.yaml`, MIT, DeepSeek) builds Sidebar file addresses; esbuild includes its file-address helpers in the generated `lib/client.js`. The package's `LICENSE` is the DSH license reproduced below.

```text
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## yaml 2.9.1 — ISC

- Upstream: <https://github.com/eemeli/yaml>
- Author: Eemeli Aro.
- Locked version: `2.9.1` in `pnpm-lock.yaml`.
- Bundled use: `src/host/index.ts` imports `yaml` to parse skill front matter; esbuild includes it in the generated `lib/index.js`. `yaml` has no production dependencies.
- License source: the `yaml` 2.9.1 package's `LICENSE`, reproduced verbatim below. Its original contact address is retained as part of the required notice.

```text
Copyright Eemeli Aro <eemeli@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

## Build and host dependency boundary

`scripts/build.mjs` bundles the plugin's own source, the YAML parser described above, and DSH's workspace-path helper into the client. React and its JSX runtime are external browser modules supplied by DSH; DSH packages remain external in the host build. esbuild, TypeScript, Node/React type declarations, and their development dependencies are build tools, not code embedded into the plugin's runtime bundles. Their packages retain their own license files when installed. If a future change bundles another dependency, its applicable notice must accompany the resulting distribution.

The full, unmodified AGPL version-3 text in [LICENSE](LICENSE) is from <https://www.gnu.org/licenses/agpl-3.0.txt>, headed “Version 3, 19 November 2007”; the project's grant permits version 3 **or any later version**.
