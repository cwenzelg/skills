# Review tooling: what runs where (rewritten 2026-09-17, replaces the 2026-09-04 version)

## History — the `.dc.html` canvas route is dead, don't re-probe it

Claude Code's bundled `design` skill ("Design Components": `.dc.html` files, `seed-canvas.mjs`, a
published private canvas artifact on claude.ai) was this project's original drafting tool,
documented in the 2026-09-04 version of this file. As of 2026-09-17 it is gone: every
`bundled-skills/<version>/<hash>/design/` folder on this machine, across bundle versions
2.1.250-2.1.273, is empty or absent — no `SKILL.md`, no `seed-canvas.mjs`, no
`payload.template.html`. The skill no longer ships with the current Claude Code version, for
interactive sessions or otherwise. **Don't re-probe this** — the image-first process below is the
process now, not a fallback pending the canvas coming back.

Two things worth keeping from the old record:
- The canvas was already **interactive-only** before it disappeared entirely: an SDK/background
  session never listed the bundled `design` skill (probed 2026-09-04), so a background Designer
  could ground a screen and write a verdict but not draft a round. That limitation is gone now —
  the image-first format below needs only `Bash` (to render and to `curl` the post) and `Write`/
  `Edit`, all of which a background session already has.
- The real reason it was retired on purpose, not just found broken (Christian, 2026-09-17): "we
  need multiple people to have access to it. It might be better to just create an image, put it
  in the chat, talk about the image, and put it back... Especially remember: things only work if
  multiple employees have access to it." A published canvas artifact is private to the account
  that created it — a client's designer or an external contractor without that login could only
  ever view it, at best, and often not even that.

## Current process — image-first rounds in Slack

This is the process `SKILL.md` describes; this section is the mechanics behind steps 5-8 of
"1. Drafting" — folder layout and file roles are in `SKILL.md`, not repeated here. Worked example,
built and run end to end 2026-09-17: `design/draft/Subscription/round-1/` in the Loop Studio
workspace (`variant-a.html`, `variant-b.html`, `overview.html`, `assets/`, five render PNGs) and
the "Subscription round 1 — image-first format" entry in that project's `STATUS.md`.

### Rendering

- One fixed script, shipped with this skill (2026-10-08; it replaces the throwaway script every
  session used to write): `node <this skill's folder>/scripts/render-round.mjs "<round folder>"`.
  The same line works in every shell on Windows and macOS. It serves `design/draft/` (two levels
  above the round, so `../../assets/` resolves) on `127.0.0.1`, drives the Playwright library
  against the machine's installed Chrome or Edge (else Playwright's own Chromium), and writes
  into the round folder, full page:
  - `render-variant-<letter>-desktop.png` (1440px) and `-mobile.png` (390px) — as drawn, notes
    included; `render-overview.png` from `overview.html`.
  - the same names ending in `-clean.png` — every `[data-note]` element hidden, in an overview
    inside its frames too. Only these may be shown to a customer.
- Exit codes: `0` everything written; `1` a clean render would be empty, a variant has no drawn
  screen outside its notes, or a note is still visible in a clean render (the file is named,
  nothing is written for it); `2` usage or setup. A warning (never a failure) names an id, a
  source file name or a route still readable in a clean render, and every asset that failed to
  load.
- Options: `--out <dir>` writes somewhere else and only reads the round folder; `--hide
  "<css selectors>"` hides more than `[data-note]` in the clean renders — for a round drawn before
  the rule, e.g. `--hide ".screen-label,.concept,.states"`; `--only variant-a,overview`;
  `--viewports desktop`; `--overview-width <px>` for an overview that has no fixed body width
  (default 1440); `--json` prints what the script measured in the page (notes found, notes
  visible, screen elements) per render.
- Setup, once per machine: the script needs the Playwright library and installs nothing itself.
  It looks in `--playwright-dir` / `RENDER_ROUND_PLAYWRIGHT_DIR`, the working directory, the round
  folder, its own folder, `NODE_PATH`, then one fixed folder in the machine's temp directory —
  and when none has it, it prints the one `npm install --prefix ... playwright-core` line to run.
  Run that line; do not probe for Playwright yourself, and never install into a project checkout
  or a worktree.
- Its test: `node --test <this skill's folder>/scripts/render-round.test.mjs`.
- `file://` is not reliable for this step: relative asset paths, `@font-face`, and iframe `src`
  loads behave inconsistently without a real HTTP origin — which is why the script always serves.
- **Look at every PNG before posting.** With no editor step in between, this is the only quality
  gate left before a human sees the round — catch a broken layout here, not in the Slack thread.

### Posting

`POST http://127.0.0.1:8791/design/post` (the Dev Manager), JSON body in a file, then
`curl --data-binary @<file>` (an inline JSON body carrying a Windows path is easy to mismangle in
a shell one-liner):

```json
{
  "company": "loopstudio",
  "screen": "Subscription",
  "round": "1",
  "taskId": "20260926-subscription-screen",
  "imagePath": "C:/code/loopstudio/design/draft/Subscription/round-1/render-overview.png",
  "caption": "Two directions for /subscription — A: pricing card, direct; B: Basis hervorgehoben. Reply with the letter you prefer and anything to change."
}
```

**`taskId` is required for a screen's first round** and must be a Dev Manager task of that same
company (Christian, 2026-09-26: "Designrunde nur aus einem task raus"). The route answers `409`
with no id and a screen that has no thread yet, `404` for an id no task has, and `409` for a task
of another company. A round with no task has nowhere for the decisions in its thread to flow: the
design desk cannot record a go against it, and somebody has to file and link a task by hand
afterwards (that is exactly what happened to the MachineMaster slice-4 rounds on 2026-09-25/26).
So: **the task exists before the round does** — it reached `awaiting-design`, or it is an existing
task of that project you name in the post. If a round genuinely precedes any task (a deliberate
pre-task exploration pass), pass `"taskless": true` with a `"reason"` instead; it is logged and the
thread is marked as such. Every later post for the same screen inherits the thread's link, so the
id is only strictly needed on the first one — pass it every time anyway, it is free and it survives
a screen whose first round was posted before this rule existed.

The **first** post for a given `{company, screen, round}` becomes the Slack thread root — post
the overview image first, exactly the "multiple designs next to each other" view Christian asked
for. Every later call for the same screen+round threads automatically under it (tracked in the
Dev Manager's `.state/design-threads.json`, keyed on `{channel, thread_ts}` -> `{screen, round}` —
see `agents/dev-manager/README.md`'s "Design review (Slack)" section for the full route,
including the owner-review gate in front of it, `POST /design/request-review`). Mobile renders
can stay in the round folder without being posted if the desktop size is the review-worthy one.

### Feedback and the next round

Feedback is whatever comes back in that Slack thread from anyone in the channel — read the whole
thread before drafting `round-<n+1>/`, not just the newest reply (a round can draw comments from
more than one person; this is the same context-resolution rule every agent follows on Slack).
Never overwrite `round-<n>/`; a revision is always a new sibling folder, same "never renamed,
stacked" spirit the old canvas convention had for artboards, just as folders instead of artboards
inside one file.

### Handoff

Unchanged in spirit from the old canvas process: once a round is approved, export only the
approved variant into `design/handoff/<route-slug>/` per `references/handoff-template.md`. There
is no `support.js` runtime dependency to carry over anymore — the variant HTML is plain,
self-contained markup, so a handoff bundle is just that file plus the assets it references.

## Optional: the Artifact tool's "Design" type

The Artifact tool can still create a canvas-like artboard set (`action: "quickstart", intent:
"design"`), and — unlike the old bundled skill — it does work from an SDK/background session
(verified 2026-09-17: `action:"quickstart", intent:"design"` succeeded from a background
Designer run and produced a real artifact). Files live under `project/`, one `.dc.html` per
artboard, indexed by `canvas.json`; every path segment is restricted to `[A-Za-z0-9._-]` — no
spaces, so `Subscription-1a.dc.html`, not `Subscription 1a.dc.html`.

This is a real, working tool, but it is **owner-only by construction**: the published artifact is
private to whichever Claude account created it, so nobody else in a project's Slack channel can
open it without that login — the exact problem the image-first format exists to avoid. Use it, if
at all, for one person's own solo exploration before a round goes out. It is never the place a
team reviews a round; the image-first Slack process above is that place.
