# Canvas tooling: what runs where (checked 2026-09-04, Claude Code 2.1.248, bundle 2.1.259)

The `.dc.html` format ("Design Components") and the canvas editor come from Claude Code's
built-in `design` skill, an early preview of Claude Design. This note records what was verified
so nobody re-probes it.

## Where the skill lives

Claude Code extracts its bundled skills at start-up to
`%LOCALAPPDATA%\Temp\claude\bundled-skills\<bundle-version>\<hash>\design\`, containing:

| File | Size | Role |
|---|---|---|
| `SKILL.md` | text | the process instructions (loaded by `/design`) |
| `seed-canvas.mjs` | 40 KB | helper: seeds artboards + `canvas.json` + images into a copy of the payload; `--check`; `--extract` pulls a saved canvas back to files |
| `payload.template.html` | 2.5 MB | the canvas editor, minified, with the runtime inlined |

`support.js` in a project's `design/draft/` is the same runtime (`dc-runtime`, built with bun
from sources that do not ship). It is 69 KB, generated, and must not be edited. It lets a
`.dc.html` render standalone from a local static server without the editor.

## What an SDK-run agent can and cannot do

- An SDK session (the Dev Manager's way of running an agent) has the `Artifact` tool but does
  **not** list the bundled `design` skill (probed 2026-09-04). It could still run
  `seed-canvas.mjs` by absolute path if the bundle folder is located at runtime, and publish
  with `Artifact`, but that path is untested.
- Decision (Christian, 2026-09-04): the Designer runs in an **interactive** Claude Code
  session. The Dev Manager treats "needs design" as a human gate: pause, Christian runs the
  Designer in the project workspace, resume when `design/handoff/<route>/` exists. The
  conceptual check (does the screen show the functions the task needs?) is a human step anyway.

## Self-hosting and the file-first loop

- The seeded `*.html` file opens locally in any browser as a **view-and-export** canvas
  (pan/zoom, PNG/PDF export). **Save** only works on the published artifact, because saving is
  the artifact republish. There is no self-hosted save path.
- Published canvases are private artifacts on claude.ai; comments live there.
- Edits made in the published GUI are pulled back with
  `node seed-canvas.mjs --extract <saved page> --to <fresh dir>`, which writes the artboards,
  `canvas.json`, and images out as files. Then edit the files, re-seed, republish. So the
  repository files stay the source of truth as long as every GUI round is extracted before the
  next file edit.
- The editor payload is Anthropic's preview code, version-pinned to the Claude Code release
  (contract `0.1.31` at the time of writing). It is **not vendored** into this library: the
  `_shared` repo is public on GitHub, the payload is not open source, and a copy would go stale
  with every Claude Code update. Reference it from the bundle folder instead.

## Locating the bundle from a script

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Temp\claude\bundled-skills" -Recurse -Filter seed-canvas.mjs |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
```

Use the newest match; older bundle versions may linger. If none exists, run `/design` once in
an interactive session and Claude Code re-extracts it.
