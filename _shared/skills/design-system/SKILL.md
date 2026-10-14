---
name: design-system
description: Builds, extends, checks and enforces a project's design system - DTCG design tokens in three tiers (primitives, semantic light/dark roles, components), customer brand schemes, gradient/mesh/glass recipes, foundations and component specs with do/don't, approved reference screens, a specimen page and mechanical checks (token audit, WCAG contrast incl. glass, visual compare, completeness). Use whenever a task creates or changes a design system, theme, style guide, token set, dark mode, white-label/brand scheme or "the look" of a product, extracts a system from approved screens, asks whether a screen or a code change stays on-style, or audits hardcoded colours, fonts or sizes - even if it only says "make it look like the approved design", "set up the theme" or "the screens don't look like X".
---

# Design system

A design system here is a folder an AI designer and an AI coder can both follow without drifting:
a closed set of values, short rules with examples, the approved screens as a visual anchor, and
checks a machine runs. A token sheet alone is not a design system - a designer given only colours
and sizes redraws the old look in new colours.

## Output you produce

| Trigger | Output |
|---|---|
| "set up / build the design system from <approved screens>" | `design-system/<name>/` in the project workspace, complete per `references/folder-template.md`, all checks green, specimen built - then STOP for human approval |
| "add dark mode / a brand / a component / a token" | the change in `tokens/` + its spec, `build/` regenerated, checks green, a new approval line if a human can see it |
| "is this screen / PR on-style?" | the token audit and the visual compare run, findings listed with file:line and nearest token, the compare sheet looked at |

## Non-negotiables

- **The approved reference beats any live theme.** When code, an older token file or a contract
  document disagrees with the approved screens, the screens win; say so in DESIGN.md.
- **No value without a source.** Every literal token carries
  `$extensions["skill.design-system"].source` - the reference file and spot it was read from, the
  decision that set it, or `derived: <rule>` for a value the reference does not show (listed as an
  open question). `check-system.mjs` fails on a missing or `TODO` source.
- **Every role in every mode.** `semantic.light` and `semantic.dark` have the same paths.
- **Components use roles only**, never a primitive or a literal - so a mode or a brand reaches them.
- **A brand overrides primitives or `brand.*` slots only** - never a role, never a component - and
  **colours only**: a customer scheme is a colour exchange, never another corner, typeface, shadow or
  size (Christian, 2026-10-14: «am Ende ist [der Kunde] nur Farbaustausch, nicht von den Rundungen
  oder irgendwas anderem»). `check-system.mjs` enforces it; `system.json` `brandTypes` widens it only
  by the owner's explicit decision.
- **Human approval before use.** No screen is drawn from a system without `specimen/APPROVED.md`
  (`references/approved-template.md`): who, when, their words.
- **Checks are exit codes.** Never post, approve or merge on a read of the output; chain on the
  exit code. Fix the value, never the check.

## Building a system from an approved direction

Read `references/extraction.md` first - the order and when to stop and ask. In short:

1. Copy the skill's `assets/starter/` to `design-system/<name>/` in the project. It is a complete,
   minimal, working system with `TODO` sources; nothing in it is a decision.
2. Put the approved screens into `reference/light/` and `reference/dark/` (PNG). Note who approved
   them and when in DESIGN.md.
3. Inventory the reference (every colour incl. gradient stops and translucent fills, typeface and
   weight, size/line height, radius, shadow, blur, icon style) and write the **character** in words:
   the 3-5 things that make it look like itself. Each becomes an always/never rule, and whatever a
   flat token cannot carry (mesh ground, glass, gradient cards, a display face) gets a foundation
   file and a recipe in `$extensions["skill.design-system"].css` with its `stops`.
4. Fill `tokens/` tier by tier (primitives with sources -> roles per mode -> components), then the
   foundations, one spec + one HTML snippet per component the reference shows, all states.
5. Put typical mistakes into `reference/dont/` with one line why (e.g. "flat white cards on a
   plain ground - loses the mesh and the glass").
6. Run the checks below until green, build the specimen, look at it next to the reference in every
   mode and brand. Then ask for approval - with the specimen render and the compare sheet attached.
   The specimen (and its `--pdf`) is also what a designer reviews: give it the open points of
   DESIGN.md as a table (`| O1 | question | today |`), they lead the page. Never hand-build a second
   review page - extend `specimen.mjs` instead, so the page always shows what the checks check.

## Scripts

All in this skill's `scripts/`, Node >= 20, no install (the HTML render reuses screen-design's
Playwright lookup). Run them with the system folder as first argument.

| Script | Does | Exit 1 when |
|---|---|---|
| `build-tokens.mjs <sys>` | `build/tokens.css` (`:root` = first mode, `[data-theme]`, `prefers-color-scheme`, `[data-brand]` blocks with only what a brand changes) + `build/tokens.resolved.json` | an alias points nowhere, a cycle, a mode file is missing |
| `check-system.mjs <sys> [--require-approved]` | completeness: roles x modes, sources, tier rules, brand rules, component specs and states, required files, reference images, approval | any of those is missing |
| `contrast.mjs <sys>` | WCAG 2.2 for every pair in `checks/contrast-pairs.json`, in every mode and brand; translucent surfaces over the WORST point of their backdrop (`over` token stops or an `overImage` PNG); APCA Lc reported, never gating | a pair is under its `min` (4.5 text, 3 large text / UI) |
| `token-audit.mjs <sys> <files/dirs> [--strict]` | colour, font family, font size, radius literals not in the system, with file:line and the nearest token; `--strict` (for code) also flags a matching literal outside a `--x:` declaration | any finding |
| `specimen.mjs <sys> [--fragment <f>] [--pdf [<f>]]` | `specimen/index.html`, ONE self-contained page for approval and design review: character and rules, open points (DESIGN.md "Open points ..."), every colour role per mode and brand with its source and a derived flag, grounds/gradients/glass per mode, typefaces and scale, shape/shadow, foundations, every component in every mode and brand next to its spec, reference screens and don'ts, mode and brand switch; images and `site.inlineFonts` inlined. Styled only with the system's own roles (`system.json` `site`, see the script header), so it passes `token-audit.mjs` against its own system. `--fragment` = without the document skeleton (a host that adds its own); `--pdf` = printed once per mode, merged | the tokens do not resolve, or the PDF could not be printed |
| `visual-compare.mjs --screen <png/html> --reference <png> [--system <sys>]` | one sheet reference / screen / difference; diff ratio (same screen only), palette match (a weak hint - a flat light screen still scores high against a pastel reference, so never a gate on its own); fonts the page really renders that the system lacks (the strong mechanical signal) | over `--max-diff`, under `--min-palette`, or a foreign font |

`checks/CHECKLIST.md` (from the starter) is the release order.

## Using a system (designer and coder)

- Read `DESIGN.md`, then look at `reference/<mode>/` and `reference/dont/` before drawing or coding.
- Link `build/tokens.css`; write values only as `var(--...)`. A design variant may declare the
  system's custom properties at its top (the audit accepts a declaration with a system value).
- Draw and check every screen in light AND dark (`data-theme`), and in a brand when the screen
  will ship under one (`data-brand`).
- Before posting a round or opening a pull request: `token-audit.mjs` (design: default; code:
  `--strict`) and `visual-compare.mjs` against the closest reference screen - and look at the sheet.
- A value the system does not have is a question for the system's owner, not a local exception.
  `design-system-ignore` on a line is for third-party markup only, with the reason on that line.

## Changing a system

- Change `tokens/`, never `build/`. Rebuild, rerun every check, regenerate the specimen.
- A change a human can see (a colour, a typeface, a radius, a component's look) needs a new line in
  `specimen/APPROVED.md` before screens use it.
- Moving an existing product to the system: run `token-audit.mjs --strict` over its code first and
  file the findings as work - never silence them.
