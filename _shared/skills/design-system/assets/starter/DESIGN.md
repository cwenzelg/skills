# <System name> design system

<!-- Template - fill every line from the approved reference. Keep it under ~120 lines: this is the
first file every designer and coder session reads. Details go in foundations/ and components/. -->

## Character

<Three or four sentences: what the system feels like and why, in words a designer recognises at a
glance - e.g. "soft pastel mesh ground, large confident headings, glassy chips, colour lives in the
cards, not in the chrome".>

## The approved direction

- Source: <the approved reference - file paths under reference/, the decision and who approved it, date>
- The reference beats any live theme. Where code disagrees with reference/, the code is out of date.

## Rules (always / never)

- Always build from the tokens in `build/tokens.css` (`var(--...)`); never type a colour, font, size or radius.
- Always draw light AND dark; a brand only swaps colours - never corners, typefaces or anything else.
- Never use a typeface other than <display> and <body>.
- Never <the most common way a screen loses this look - e.g. "white cards on a flat ground">.
- <...>

## Open points

<!-- One row per question the sources do not settle. «entschieden nach» is R1-R6 (references/open-points.md) or «für <owner>: <reason>» (a taste
     question, a brand colour, two approved screens that contradict each other). check-system.mjs fails a row without it. Delete this comment. -->

| # | Question | Today | entschieden nach |
|---|---|---|---|

## Exceptions

<!-- R1a: a value a screen uses that the system does not have, answered «Ausnahme» (never silently drawn, never silently kept in code). One row each;
     check-system.mjs fails a row with a missing field, token-audit.mjs lets exactly this value pass on exactly this screen. -->

| Screen | Value | Reason | Who | When |
|---|---|---|---|---|

## Files

| Read | When |
|---|---|
| `llms.txt` | index of everything below, one line each |
| `foundations/*.md` | colour, type, grounds/gradients/glass, elevation, motion, icons |
| `components/<name>.md` | before using or drawing that component |
| `reference/<mode>/` | before drawing anything: the look to match |
| `reference/dont/` | the typical mistakes, each with why |
| `specimen/index.html` | every token and component on one page (light/dark/brand switch) |
| `checks/` | run before posting a round or opening a pull request |

## Status

- Specimen approved: <no | yes - see specimen/APPROVED.md>
