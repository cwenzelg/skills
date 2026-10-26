# Open points: the rule (R1-R6 and R1a)

Decided by Christian Wenzel, 2026-10-26 (`docs/decisions/2026-10-26-design-system-open-points-rule.md` in the cluster repo). A design
system meets sources that disagree or say nothing: the approved screens, an older token file, the apps' code, a shared foundation, WCAG.
These six rules settle a point WITHOUT asking, in this order; every decision is written down with the rule that made it («entschieden
nach R<n>»), so he can overturn it. What the rules leave open is his.

## The rules

| Rule | Text | Example |
|---|---|---|
| **R1** | Approved screens beat code and old tokens. Code that differs from them is a **fix task**, not a reason to change the system. | FU Connect O1: the screens draw the primary button in brand fill `#de2381`, the app's `tokens.css` says ink. The system follows the screens; the app gets a task. |
| **R1a** | A new screen adds **no value** (colour first, then any token value: size, radius) the system does not have. If a draft uses one, the design asks **once**, specifically: «neue Farbe `<value>` für `<use>` - ins Designsystem aufnehmen oder als Ausnahme für diesen Screen?». «Aufnehmen» = a normal token with a source (his answer); «Ausnahme» = an entry under `## Exceptions` (screen, value, reason, who, when). In code, a value that is neither a token nor a listed exception is a finding. | A draft's badge is `#1d9a6c`; the system has no green. The round post asks the question; his answer becomes `color.green.500` with `source: Christian, <round thread>, <date>` or one exception row. |
| **R2** | The shared foundation beats app copies; apps are aligned by integration tasks. | MachineMaster O6: `primary-200` is `#ffbaa7` in the foundation, `#FFE3D4` in the tools. The foundation value stays, the tools get a task. |
| **R3** | Names follow values: a misnamed token is renamed, the value kept. A role whose value obviously is not that role takes the value the apps really use for it. | MachineMaster O1: `error-500` is navy `#05204a` - the navy is renamed, error takes the red the apps use, `#F04438`. |
| **R4** | WCAG AA is mandatory (4.5:1 text, 3:1 large text and UI). A failing **text** colour takes the nearest darker shade of the same colour; **brand fills are never changed**. | MachineMaster O4: the placeholder grey fails 4.5:1 and is replaced by the nearest darker grey that passes. |
| **R5** | What no source defines is **not invented**: write «noch nicht festgelegt» and put it into that product's next design round, where he picks. | MachineMaster O8, O10, O11, O14: hover/focus states, a spacing scale, extra shadows. |
| **R6** | The system describes what the product really does. | MachineMaster O7: runtime theming also swaps the buttons' corner and the font - the system says so. |

## Still his (never decided by a rule)

- any change to a **brand colour** or the overall look;
- two **approved screens that contradict each other**;
- the **picks in a design round** for R5 items;
- **taste questions** (e.g. white on the accent `#ff5c30` is 3.08:1: darker accent, dark text, or large bold text only).

These rows read «für Christian: Geschmack» (or «für <owner>: <reason>») in the column «entschieden nach», with the options in «Today».

## In DESIGN.md

The **Open points** table has four columns; `check-system.mjs` fails a row without a valid last one:

```
| # | Question | Today | entschieden nach |
|---|---|---|---|
| O1 | error-500 is navy in the foundation, red in the tools | renamed; error = #F04438 | R3 |
| O5 | white on #ff5c30 is 3.08:1 | options: darker accent / dark text / large bold text only | für Christian: Geschmack |
```

The **Exceptions** section (`## Exceptions`, German heading `## Ausnahmen` also read) lists every R1a answer «Ausnahme»:

```
| Screen | Value | Reason | Who | When |
|---|---|---|---|---|
| Angebotsvergleich | #1d9a6c | status badge "best offer", one use | Christian | 2026-10-27 |
```

A table headed «Open points for Christian» without the column, or a row with an empty or unknown value in it, is an error; a table of another owner (e.g. «for Martin») without the column yet is a warning until that owner's points are next worked on. `check-system.mjs` fails an exception with a missing screen, value, reason, who or a date that is not `YYYY-MM-DD`. `token-audit.mjs` lets
exactly this value pass on a file whose path names the screen (or with `--screen "<name>"`); the same value on another screen is still a finding.

## R1a in the work

- **Design (screen-design, before a round is posted):** `token-audit.mjs <system> "<round folder>" --questions --log <r1a log> --context design-round`.
  Every value it lists becomes ONE question in the round post (the fixed wording above), never silently drawn. The answer is applied in the same
  turn: a token with source in `tokens/` (rebuild, check, specimen, an `APPROVED.md` line when visible) or a row under `## Exceptions`.
- **Code (the Dev Manager's check on a diff):** `token-audit.mjs <system> <touched frontend files>` (off-system mode); a value that is neither a
  token nor a listed exception is a finding for the Reviewer, never a silent pass. The cluster counts both per week and project
  (`docs/plans/improvement-ledger.md`).
