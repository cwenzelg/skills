---
name: screen-design
description: Company-neutral screen-design process for any project that keeps a design/ folder. Use whenever a task drafts, iterates, approves, exports, or implements a screen, page, dialog, or flow design, or asks what is drafted, approved, or built, even if the request only says "mock this up", "design the X screen", "build round 2b", or "what's open in design". Reads the project's design/PROJECT.md for stack, component map, tokens, and copy language.
---

# Screen design process

The Designer's method. What varies per project (stack, component map, token source, copy
language, test commands) is **not** here: read `design/PROJECT.md` in the project you are in
before doing anything. If it is missing, create it from `references/project-template.md` by
reading the codebase, and say so.

## Output you produce

| Trigger | Output |
|---|---|
| "design the X screen", "mock up X", "explore options for X" | `design/draft/<Screen Name>.dc.html`: a multi-artboard canvas, one artboard per option, rounds stacked newest first; a published canvas link for comments |
| "build round 3a", "go with option 2b" | `design/handoff/<route-slug>/` with only the approved round, `support.js`, assets, and a `README.md` handoff spec (structure in `references/handoff-template.md`); `design/STATUS.md` updated |
| "what's drafted / approved / built / open" | an answer from `design/STATUS.md` and `design/CHECKLIST.md`, not from memory |

Never export before the user names a round. Never implement in the design step.

## Folder layout every project uses

```
design/
  PROJECT.md              # stack, component map, token source, copy language, commands (project-specific)
  STATUS.md               # screen-by-screen: drafted / approved / built, with what each was built from
  CHECKLIST.md            # running list: plain bugs (no design needed) vs design decisions (drafted / not drafted)
  draft/
    <Screen Name>.dc.html # one canvas per SCREEN; rounds are artboards inside it: 1a 1b 1c -> 2a 2b -> 3a
    support.js            # canvas runtime every .dc.html depends on (copied, never edited)
    canvas.json           # artboard layout, pages, launch view
    assets/               # brand assets extracted from the live app, shared across drafts
  handoff/
    <route-slug>/         # named after the app ROUTE, not the screen title: competitors/, not "Wettbewerber Screen/"
      README.md           # the developer handoff spec
      <Screen Name>.dc.html   # ONLY the approved round
      support.js, assets/
```

Source of truth is the `.dc.html` and `canvas.json` files in git. The seeded, published
`*.html` canvas files are generated output and gitignored (`design/draft/*.html`,
`!design/draft/*.dc.html`, same for handoff). Comments and GUI edits on the published canvas
are pulled back into the source files, never the other way round: see
`references/canvas-tooling.md`.

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
     each; the human picks 1-3 before any artboard is made. Default sources: refero.design (a
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
   required function fails the human review; list the functions as a checklist in the canvas
   notes so the reviewer can tick them.
4. Create or extend `draft/<Screen Name>.dc.html` with the built-in `design` skill (interactive
   Claude Code only; see `references/canvas-tooling.md` for what runs where). First round:
   2 to 4 genuinely different directions as separate artboards, each with a one-line motivation
   and its main trade-off — grounded in whichever examples were picked in step 2, when there
   were any. Later rounds: one artboard per feedback round, stacked above the previous ones,
   named `2a`, `2b`, `3a`. Never renumber or rename an existing round.
5. Reuse `draft/assets/` across screens; extract a new asset from the app only when none exists.
6. Publish the canvas, hand over the link, and record the round in `STATUS.md`.

## 2. Approving

The human names the round ("build 3a"). Until then, nothing is exported. The approval covers
two questions the Designer cannot answer alone: does the layout hold up, and does the screen
show the functions the task needs. Both answers come from the human.

## 3. Handoff

1. Create `handoff/<route-slug>/`; copy in only the approved artboard, `support.js`, and the
   assets it references.
2. **Verify the bundle is self-contained**: serve the folder locally (a `file://` open does not
   work for the browser tool) and confirm it renders with no missing-asset console errors.
3. Write `handoff/<route-slug>/README.md` with every section of
   `references/handoff-template.md`. The data-contract table is the section that de-risks the
   build; a design that silently assumes a field exists ships broken.
4. Update `STATUS.md`: screen map row, what it was built from, what is still open.

## 4. Implementing (for the coding agent, not the Designer)

1. Read the handoff README in full and view the rendered `.dc.html`.
2. Read the current implementation of the route, if one exists. Diff the two and implement the
   difference with the project's existing components and tokens as the README maps them. Never
   port the raw HTML/CSS.
3. Resolve every data-contract row and every open question against the real backend before
   building the piece that depends on it. Cut what the API cannot deliver rather than shipping
   empty values.
4. Update the "Implementation status" section of `STATUS.md` when done, including deliberate
   deviations.

## Rules

- One `.dc.html` per screen, rounds inside it. History of rejected options stays in the draft.
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
- **The Designer's own process can be wrong, not just the screen.** When a task surfaces a gap
  in this method itself — a source that didn't help, a question that should have been asked
  earlier, a step that produced a bad result — don't fix the method mid-task and don't ignore
  it either. Log one line to this project's findings backlog (a Notion "Feature ideas" database,
  a `BOARD.md`, whatever the project actually keeps — `PROJECT.md` says which), owner
  `design-agent`, saying what happened and what should change about the method. A human reviews
  it later; the current task keeps moving.
