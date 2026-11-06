# Third-party notices

Pixel Town (`pixel-town-pstack`) is an unofficial community adaptation.

Copyright (C) 2026 xianxianxianyu. The project as a whole, including its original code, artwork, documentation, and adaptations, is licensed under **AGPL-3.0-or-later**; see [LICENSE](LICENSE). This does not remove or replace the upstream notices and permissions below. The adapted materials were modified for DSH integration and public release in 2026.

## pstack — MIT

- Upstream: <https://github.com/cursor/plugins/tree/main/pstack>
- Author: Lauren Tan ([poteto](https://x.com/poteto)).
- License source: upstream `pstack/LICENSE`, reproduced verbatim below.
- Derived materials: all sixteen `skills/pstack-*/SKILL.md` files adapt pstack playbooks, skills, and engineering principles. Their introductions identify the relevant upstream material. The workflow/stage instructions in `src/shared/workflows.ts`, decision-trail rules and TSV cell handling in `src/shared/trail.ts`, judgment/model-role guidance in `src/shared/model-roles.ts` and `src/host/models.ts`, and plaque descriptions/provenance in `board/art.js` also adapt that material. `skills/pstack-multi-phase-plan/check-plan.mjs` checks the adapted planning format; the README and architecture descriptions summarize these adaptations.

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

## DeepSeek Harness (DSH) — MIT

- Upstream: <https://github.com/deepseek-ai/deepseek-harness>
- Author: DeepSeek.
- License source: upstream root `LICENSE`, reproduced verbatim below.
- Derived integration material: `src/host/dsh.ts` and `src/client/dsh.ts` describe the DSH interfaces used by this plugin; `src/shared/fold.ts` adapts native session/goal event behavior, including the goal snapshot and admitted-round rules; `src/client/index.tsx` adapts public workspace/session navigation and default-workspace display conventions. Associated integration and event-fold tests exercise these DSH contracts. The host registration in `src/host/index.ts` and the integration descriptions in `docs/architecture.md` rely on these upstream contracts. This is an adapter, not a vendored copy of the DSH runtime.

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

`scripts/build.mjs` bundles the plugin's own source and the YAML parser described above. React and its JSX runtime are external browser modules supplied by DSH; DSH packages remain external in the host build. esbuild, TypeScript, Node/React type declarations, and their development dependencies are build tools, not code embedded into the plugin's runtime bundles. Their packages retain their own license files when installed. If a future change bundles another dependency, its applicable notice must accompany the resulting distribution.

The full, unmodified AGPL version-3 text in [LICENSE](LICENSE) is from <https://www.gnu.org/licenses/agpl-3.0.txt>, headed “Version 3, 19 November 2007”; the project's grant permits version 3 **or any later version**.
