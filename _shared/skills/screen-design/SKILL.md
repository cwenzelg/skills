---
name: screen-design
description: Company-neutral screen-design process for any project that keeps a design/ folder. Use whenever a task drafts, iterates, approves, exports, or implements a screen, page, dialog, or flow design, or asks what is drafted, approved, or built, even if the request only says "mock this up", "design the X screen", "build round 2b", or "what's open in design". Reads the project's design/PROJECT.md for stack, component map, tokens, and copy language.
---

# Screen design process

The Designer's method. What varies per project (stack, component map, token source, copy
language, test commands, design Slack channel) is **not** here: read `design/PROJECT.md` in the
project you are in before doing anything. If it is missing, create it from
`references/project-template.md` by reading the codebase, and say so.

## Output you produce

| Trigger | Output |
|---|---|
| "design the X screen", "mock up X", "explore options for X" | `design/draft/<Screen Name>/round-<n>/`: one self-contained HTML/CSS file per direction (`variant-a.html`, `variant-b.html`, ...), an `overview.html` side-by-side composite labelled A/B/C, and headless-rendered PNGs — posted as images to the project's design Slack channel for comment |
| "build round 3a", "go with option 2b" | `design/handoff/<route-slug>/` with only the approved variant, its assets, and a `README.md` handoff spec (structure in `references/handoff-template.md`); `design/STATUS.md` updated |
| "what's drafted / approved / built / open" | an answer from `design/STATUS.md` and `design/CHECKLIST.md`, not from memory |

Never export before the user names a round/variant. Never implement in the design step.

## Folder layout every project uses

```
design/
  PROJECT.md              # stack, component map, token source, copy language, commands, design Slack channel (project-specific)
  STATUS.md               # screen-by-screen: drafted / approved / built, with what each was built from
  CHECKLIST.md            # running list: plain bugs (no design needed) vs design decisions (drafted / not drafted)
  draft/
    <Screen Name>/
      round-<n>/            # one folder per round; NEVER overwritten or renamed — round-<n+1> is a new sibling
        variant-<letter>.html   # one self-contained HTML/CSS file per direction, real tokens + real copy inline
        overview.html          # side-by-side composite of every variant in this round, labelled A/B/C
        assets/                # this round's own fonts/images, if it needs any beyond the shared ones
        render-overview.png    # headless render of overview.html — posted first, becomes the Slack thread root
        render-variant-<letter>-{desktop,mobile}.png
    assets/                 # brand assets extracted from the live app, shared across every screen's rounds
  handoff/
    <route-slug>/         # named after the app ROUTE, not the screen title: competitors/, not "Wettbewerber Screen/"
      README.md           # the developer handoff spec
      <approved variant>.html   # ONLY the approved variant, isolated
      assets/
```

Source of truth is the `variant-*.html` and `overview.html` files under `draft/<Screen>/round-<n>/`
— plain markup and CSS, committed to git like any other file. The rendered PNGs are committed
too: they are what actually gets posted and reviewed, and the record of what a round looked like.
See `references/canvas-tooling.md` for the render/post mechanics, the history of the tooling this
replaced, and the optional Artifact "Design" type.

## 1. Drafting

1. **Read the live design system first.** `design/PROJECT.md` names the theme file, the base
   components, and the stylesheet scale. Lift exact values (colors, type, spacing, radii,
   control heights) from source; never round to a grid or invent tokens. If a live screen exists
   at the target route, read it and treat the work as a redesign relative to it: what is wrong,
   what is kept.
2. **Ground a screen that has no live route to anchor on.** A genuinely new screen — nothing
   live at the target route — is never drafted from nothing; that produces the generic, "AI
   slop" result this step exists to prevent.
   - Search for 2 to 4 real, relevant examples and present them as links with a one-line reason
     each; the human picks 1-3 before any variant is built. Default sources: refero.design (a
     searchable gallery of real production design systems with exact tokens per entry; use its
     MCP if this project has it configured, otherwise WebFetch/WebSearch it) and 21st.dev (a
     copy-paste component registry — only useful when the stack is React + Tailwind + shadcn,
     skip it otherwise). A plain web search for comparable products fills any gap. Picks are
     reference for direction and craft, never a layout or copy to port wholesale.
   - If the brief or spec does not already say what the screen must contain — headlines, copy
     points, real data shown, not just the job it does — ask for that too, as specific
     questions, not one open "any thoughts?".
   - **If there isn't enough to ground the work yet — no examples picked, no content answered —
     stop and ask. Do not draft speculative options hoping one sticks, and do not fill a gap
     with an assumption because something is due.** Say plainly what's missing and what you need
     to proceed.
3. **Concept check before pixels.** State in one paragraph which user job the screen serves and
   which functions from the brief or spec it must expose. A screen that looks right but hides a
   required function fails the human review; list the functions as a checklist in the posting
   caption (step 6) so the reviewer can tick them.
4. Create `draft/<Screen Name>/round-<n>/` with one self-contained `variant-<letter>.html` per
   direction: real HTML/CSS using the project's exact tokens and real UI copy inline (per
   `PROJECT.md`) — no `.dc.html`/canvas component syntax, no invented values. First round: 2 to 4
   genuinely different directions, each with a one-line motivation and its main trade-off (named
   in the posting caption) — grounded in whichever examples were picked in step 2, when there
   were any. Later rounds: a new `round-<n+1>/` folder holding one variant per feedback thread;
   never overwrite or rename a previous round.
5. Build `overview.html`: a plain page that shows every variant in this round side by side (e.g.
   scaled iframes onto each `variant-*.html`), each labelled with its letter and a one-line name
   — this is the "multiple designs next to each other" view that gets posted first.
6. Render headlessly to PNG: a throwaway Node script driving `playwright-core` against the
   machine's installed Chrome/Edge, served from a local static server on `127.0.0.1` (a `file://`
   open is not reliable for fonts, relative assets, or iframes) — `render-overview.png` plus a
   desktop and mobile render per variant. Delete the render script when done; it is not part of
   the deliverable. **Look at every PNG before posting** — this is the actual quality gate now
   that there is no interactive editor step to catch a broken layout first.
7. Reuse `draft/assets/` across screens; extract a new asset from the app only when none exists.
   A round-specific asset (e.g. a font file needed only for this round) goes in the round's own
   `assets/`.
8. Post the images to the project's design Slack channel (named in `PROJECT.md`) via the Dev
   Manager's `POST /design/post` (`{company, screen, round, taskId, imagePath, caption}` — mechanics
   in `references/canvas-tooling.md`): the overview image first, which becomes the thread root; each
   variant's render(s) as follow-up calls, which thread automatically under the same
   screen+round. **A round is only ever started from a Dev Manager task**, so `taskId` is required
   for a screen's first round and the route refuses it otherwise (Christian, 2026-09-26:
   "Designrunde nur aus einem task raus" — `docs/decisions/2026-09-26-designer-round-only-from-a-task.md`
   in the agent-cluster repo). If there is no task yet, the task is filed first; do not post the
   round and sort the task out afterwards. The caption names the variants and asks in plain words
   for the preferred letter and any changes. **Never tag or @-mention the designer in the caption** (2026-09-23, Christian:
   "the best would be to not tag him initially on any of the designs" —
   `docs/decisions/2026-09-23-design-details-not-per-screen.md` in the agent-cluster repo). If the
   caption itself needs to ask something, ask the project owner, in plain words, with no mention —
   and only a genuine product/flow/wording call, never a px/radius/token/colour/spacing/hairline/
   pill-or-badge-family/font-size/shared-component question (those get noted as decided "as drawn"
   in the handoff instead of asked — see `references/handoff-template.md`'s "Open questions"
   section). Record the round and the resulting thread in `STATUS.md`.

## 2. Approving

The human — and anyone else in that private Slack channel — names the round/variant ("build
variant B", "go with A but B's pricing card"). Until then, nothing is exported. Feedback is
whatever comes back in that Slack thread: **read the whole thread, not just the newest reply**,
before drafting the next round — a round can draw comments from more than one person. The
approval covers two questions the Designer cannot answer alone: does the layout hold up, and does
the screen show the functions the task needs. Both answers come from the humans in the channel.

## 3. Handoff

1. Create `handoff/<route-slug>/`; copy in only the approved variant's HTML and the assets it
   references.
2. **Verify the bundle is self-contained**: serve the folder locally (a `file://` open does not
   work reliably for fonts or relative assets) and confirm it renders with no missing-asset
   console errors.
3. Write `handoff/<route-slug>/README.md` with every section of
   `references/handoff-template.md`. The data-contract table is the section that de-risks the
   build; a design that silently assumes a field exists ships broken.
4. Update `STATUS.md`: screen map row, what it was built from, what is still open.

## 4. Implementing (for the coding agent, not the Designer)

1. Read the handoff README in full and view the rendered variant HTML (open the approved
   variant file, served locally).
2. Read the current implementation of the route, if one exists. Diff the two and implement the
   difference with the project's existing components and tokens as the README maps them. Never
   port the raw HTML/CSS.
3. Resolve every data-contract row and every open question against the real backend before
   building the piece that depends on it. Cut what the API cannot deliver rather than shipping
   empty values.
4. Update the "Implementation status" section of `STATUS.md` when done, including deliberate
   deviations.

## Rules

- One `round-<n>/` folder per round, under `draft/<Screen Name>/`; never overwritten or renamed.
  Rejected variants and past rounds stay in place as history.
- Copy language and register come from `PROJECT.md` (for example German `du` in the app, i18n
  keys instead of hardcoded strings). The handoff says which.
- Every option must be buildable from components that already exist in the app. A new component
  is a named open question in the handoff, not a silent assumption.
- Loading, error, and empty states are part of every handoff. Most of a screen's life is spent
  in one of them.
- Placeholders are marked as placeholders (imagery, metrics not confirmed by the API).
- No emoji as icons; inline SVG in the app's icon style, or the app's icon component names.
- Design files are readable by every agent: no credentials, no customer data, no production
  screenshots of real users.
- The review surface is Slack, not a login-gated tool. Every round's images go to the project's
  private design Slack channel (named in `PROJECT.md`) so every human in it — not only the
  project owner — can see and comment. The optional Artifact "Design" type
  (`references/canvas-tooling.md`) is a solo-exploration extra, never the place a team reviews.
- **The Designer's own process can be wrong, not just the screen.** When a task surfaces a gap
  in this method itself — a source that didn't help, a question that should have been asked
  earlier, a step that produced a bad result — don't fix the method mid-task and don't ignore
  it either. Log one line to this project's findings backlog (a Notion "Feature ideas" database,
  a `BOARD.md`, whatever the project actually keeps — `PROJECT.md` says which), owner
  `design-agent`, saying what happened and what should change about the method. A human reviews
  it later; the current task keeps moving.
