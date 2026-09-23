# Handoff README template

Write every section. This shape is what makes a handoff buildable without back-and-forth.
Replace the angle-bracket text; keep the headings.

```markdown
# Handoff: <Screen title> — <project>

## Overview
<What screen, at which route. What is wrong with the current version, if one exists. What the
redesign changes. One line naming which round to build: "Implement option `3a`".>

## About the design files
<Explicit: these are design references in HTML, not production code to copy. Map each design
pattern to the real component it becomes (buttons → <BaseButton>, tables → <BaseTable>, ...).
Name the exact theme/token source file. State the i18n convention: no hardcoded strings, which
namespace, which languages.>

## Fidelity
<How literally to take colors, spacing, type: usually "high-fidelity, recreate pixel-close using
existing tokens". Then the caveats: placeholder imagery, proposed-not-confirmed metrics.>

## Screens / views
### <Screen> — `<route>`
**Purpose:** <the user's job on this screen, one or two sentences>
**Layout:** <top-to-bottom or region-by-region spec with exact spacing, radius, color, and type
values, each tied to a named token>

## Interactions & behavior
<Every clickable thing. Loading states. Error states. Empty states. Responsive behavior.
Accessibility notes (roles, keyboard, focus, hit targets ≥ 44px). None of these is optional.>

## State management
| State | Shape | Notes |
|---|---|---|
<Named to match the app's existing store/composable conventions, not invented ad hoc. Say which
values are derived and must not be stored.>

## Data contract — confirm before building
| Field | Used for | If unavailable |
|---|---|---|
<One row per field the design leans on. "If unavailable" says what to cut or degrade; mark rows
that block the whole screen.>

## Design tokens
<Color, typography, spacing, radius, sizes, elevation. Each value tied to its real name in the
codebase, not a hex dump.>

## Assets
<What is included, what is a placeholder, where the real source lives in the app.>

## Files
<What is in this bundle and what to open first. Which artboard is the approved one; the others
are history.>

## Open questions for whoever builds this
1. <Anything the design assumed that was not confirmed against the real API or backend. Answer
   before or while building; never guess silently. Tag each item **For: developer** / **For: owner**
   / **For: designer** — who actually needs to decide it. See the note below on the designer tag:
   most things that look like a "For: designer" question are really one of the other two.>
```

**Tagging `**For:**` items (2026-09-23):** don't reach for `**For:** designer` by default. Cross-
screen visual/technical details — an exact px value, a radius, a colour, spacing, a hairline, a
pill/badge/icon family, a font size, or "should this become a shared component" — are never real
per-screen questions: nobody, including the designer, can judge one of these sensibly against a
single screen with no view of the rest of the site. Leave that value **as drawn** and say so plainly
in the Layout/Design tokens sections instead of raising it as a question; it gets collected with
every other project's screens into one later consolidation round, not asked here.
`**For:** designer` is for something that genuinely needs the designer's own judgement in the
moment — an ambiguous layout call the brief didn't settle, a variant he'd want to redraw. A product,
content, flow or wording call ("does this line stay", "which page does this link to") is
`**For:** owner`, never designer. A build-mechanics question (a component name, a data-shape
decision, a fallback) is `**For:** developer`.
