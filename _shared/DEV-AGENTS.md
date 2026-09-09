# Dev subagents (`_shared/agents/*.md`)

This file lives outside `agents/` on purpose: Claude Code treats every `.md` in a plugin's
`agents/` folder as an agent definition, README included.

Six Claude Code subagent definitions that together form the development process the Dev
Manager orchestrates (phase 2 and 3 of the "Skills and Dev Branch Plan", see the plan link
in the root README). They are company-neutral; company context comes from the company's skill
scope, the repo's own `CLAUDE.md`, and the project's `design/PROJECT.md`.

| Agent | Job | Tools | Writes |
|---|---|---|---|
| `architect` | goal -> spec with testable acceptance criteria, a gate-1 test table (technical tests only) plus a "What to click" checklist, a file-level plan, and a "needs design?" call | Read, Glob, Grep, Write | `docs/specs/<task-id>.md` only |
| `designer` | screen design per the shared `screen-design` skill: draft rounds on a canvas, human approval, handoff export | Read, Glob, Grep, Write, Edit, Bash, Artifact, Skill | `design/` only |
| `test-writer` | approved gate-1 test rows -> one failing test each, committed before any code (never for a greenfield repo); bug fixes first answer "why did no existing test catch this?" | Read, Glob, Grep, Write, Edit, Bash | test files only |
| `implementer` | approved spec (+ handoff) -> code that makes the Test Writer's tests pass, small commits; may add tests, never edits the Test Writer's | Read, Edit, Write, Glob, Grep, Bash | production code (+ own tests) |
| `tester` | runs the whole suite, build/lint/type-check, verdict per failing test (`implementation` / `test` / `spec`), checks the repo's house rules and fonts; browser measurement only when a criterion is explicitly about it; writes tests only when the Test Writer was skipped | Read, Edit, Write, Glob, Grep, Bash | test files only, never the Test Writer's |
| `reviewer` | diff vs spec -> ranked findings with scenarios, verdict | Read, Glob, Grep, Bash | nothing |

Flow (Christian, 2026-09-04; test-first since 2026-09-06; test scope narrowed 2026-09-09
evening, see "Tests are technical, humans click the rest" below): architect -> **gate 1: Christian
approves the spec**, including its gate-1 test table and its "What to click" checklist (every
task, first month; skipped for fixes from an error report) -> if the spec says `design: needed`:
designer drafts -> **gate 2: Christian approves a round** (layout, and whether the screen shows
the functions the task needs) -> designer exports the handoff -> **test writer** (the spec's
approved gate-1 test rows become failing tests on the branch, technical only, only where a suite
already exists) -> implementer (makes them pass) -> tester (runs the suite, build, lint,
type-check and house rules; no browser round unless a criterion calls for one) -> reviewer
(blocking findings go back once) -> local branch + Slack report -> **gate 3: Christian on the
deploy preview against the spec's "What to click" checklist, then merges on GitHub**. Delivery is
a local branch and a Slack DM, no push, no PR, so the agent process needs no GitHub credentials.

**Plan-first process (Christian, 2026-09-08).** Every delegated unit - a Dev Manager task, a
background manager instance, a Producer job - follows `PLAN-TEMPLATE.md` (this folder): a brief
in six sections (goal + done, steps with touches, verification + evidence, will not do, stop
conditions, recipe key), a plan in the same shape written by the agent and checked by the
delegator before it runs, a plan-vs-actual close-out whose ✅ / ❌ feeds a trust ledger. For this
process the Architect's spec carries the same three middle sections ("Verification and evidence",
"Will not do", "Stop conditions"); gate 1 is unchanged. Reasoning and the decision: agent-cluster
`docs/plan-first-agent-process-options.md`.

**Skip rule (option C, temporary; narrowed 2026-09-09 evening).** The Test Writer runs only when
every repo the task spans has a real test command, non-empty `testPaths`, and `testsRunnable` not
set to `false` in the Dev Manager's `companies.json` **and** the spec's gate-1 test table has
approved rows. Otherwise the task keeps the old order (implementer -> tester, and the Tester
writes only what the "no suite" path in the tester role calls for) and the Slack thread says why.
Never for a greenfield repo, regardless of `testPaths`. The suites are to be made runnable in
worktrees over the following days (board `20260906-runnable-test-suites`).

**Tests are technical, humans click the rest (Christian, 2026-09-09 evening) — supersedes "Tests
are defined together at gate 1" from the same morning.** The morning rule kept the test table a
gate-1 deliverable but did not change what got tested or how; two same-day cost reviews
(agent-cluster `.state/tasks/20260908-loopstudio-compliance-cost-review/review.md` and
`.state/tasks/20260909-cluster-console-app-cost-review/review.md`) showed Tester rounds were still
the largest cost of a task: three full 25-criterion Playwright rounds at $8-10 each for a
~160-line change, twelve tests against a guessed socket shape that missed the real bug, a Tester
spending half its round writing tests. Christian: "things go to a test environment and are human-
tested anyway for now; too many random tests just slow down the implementation time." Five points:

1. Agents write **technical tests only**: unit and contract tests for what a human cannot see by
   clicking - parsers, adapters, guards (read-only, bind address, allowlists), contract/version
   checks, error paths. Ten to thirty per task, one row per test in the spec's gate-1 test table
   (criterion / test / what breaks for a user, operator or the next developer if it fails / cost
   class: unit / API / browser), pruned by Christian in the approval note. Front-desk pre-check
   per row, same three questions as before: would someone notice if it broke; is the test cheaper
   than the bug it prevents; will it stay in the repo and run there without the Dev Manager.
2. The **Tester does not measure in a browser** for behaviour Christian will click through on the
   deploy preview anyway. Its job: run the suite, build, lint and type-check, the house rules and
   the font check (unchanged), and an evidence table with the preview/branch URLs. Geometry,
   contrast, screenshots and tab-walks only when an acceptance criterion is explicitly about them.
   The Tester never writes a test suite; where a repo has none, it says so in one line and runs
   the build/lint/type-check instead.
3. **Human test is an explicit step**, not implied by "tests green": the Architect writes a "What
   to click" checklist of at most five lines into the spec as a new section; **gate 3** is
   Christian on the deploy preview against that checklist, and the spec says so.
4. The **Test Writer runs only where a suite already exists** (`companies.json` `testPaths`)
   **and** the gate-1 table has approved rows; never for a greenfield repo, even one with
   `testPaths` set for another part of the task. See the updated skip rule above.
5. **Later Tester rounds re-run only the tests and files the last fix touched**, plus the
   mechanical checks (suite, build, lint, type-check, floor, fonts); the full run happens once, in
   round 1.

Expected effect: Tester rounds from about $8 to $2-3 (about $1 on Haiku), usually one round fewer
per task, shorter implementation time. Accepted risk: behaviour regressions are now caught by
Christian on the deploy preview instead of an automated browser round - revisit once a product
carries paying users' live flows.

**Code follow-ups (not implemented by this rewrite - flagged for a Dev Manager task, no code
touched here):**
- The Test Writer's run condition (point 4) needs a check against the gate-1 table's approved
  rows, not just `testPaths`/`testsRunnable` (`agents/dev-manager/src/testFirst.ts` and its
  orchestrator call site).
- A re-test round (point 5) needs a "touched scope" brief: the orchestrator passes the last fix's
  changed files (or the failing criteria) to the Tester instead of the full criterion set.
- The Architect's "What to click" checklist needs to reach gate 3: today gate 3 is "Christian
  merges the PR" with no checklist attached in the Slack/PR flow.
- The cost-cap and verdict-parsing bugs the two reviews found (`parseTesterVerdicts` treating
  "pass (N, 0 failing)" as a failure; the ceiling checked after a role finishes; a prose "no test
  failed" bullet still setting `anyFailure`) are separate, already-filed defects, not part of this
  rewrite.

**Escalation rule.** The Tester never patches; it labels each failing test and the Dev Manager
routes: `implementation` -> Implementer, then Tester again (max 2 rounds); `test` -> Test Writer
fixes that test, then Tester (max 1); `spec` -> Architect amends the spec in one pass (or marks
`decision: needed`), the Test Writer redoes the affected criteria, Implementer, Tester (max 1).
Anything still failing after its round, or a `decision: needed`, pauses the task as
`awaiting-review`: a Slack post with the criterion, the test, the trimmed output and the three
answers `spec` / `test` / `code` (or free text). Christian's reply is appended to the spec and
the task continues from the Test Writer step.

**Fonts (Christian, 2026-09-06).** The Tester checks every font family a diff introduces or
references (CSS/HTML/Vue/TSX/config/font files) against the shared `font-licensing` skill:
`references/free-fonts.md` (OFL / Apache / UFL; anything from fonts.googleapis.com is free) and
`references/licensed-fonts.md` (bought or subscribed fonts with vendor, date, validity, scope).
The report gets a `## Fonts` table and one finding `font licence needed: <family>` per `unknown`
or `expired` family - a spec-level block, not an implementation failure: the Tester never swaps a
font, the Reviewer never approves while one is open, and no role assumes a licence. The Dev
Manager pauses the task as `awaiting-review` and asks Christian: `licensed: <vendor>, bought
<date>, valid until <date|subscription>, scope <web/desktop>` (row appended to the registry and
committed in the skills repo, then on to the Reviewer), `replace with <free font>`, or `drop`
(instruction into the spec, Implementer + Tester again). A font gets into the registry only that
way or through Christian directly, always with its validity period.

The Designer is interactive-only for now: the canvas editor is a Claude Code built-in that
SDK-run sessions do not get (see `skills/screen-design/references/canvas-tooling.md`). The Dev
Manager treats "needs design" as a pause: Christian runs the Designer in the project workspace,
and the task resumes when `design/handoff/<route>/` exists.

## Branching (all projects, Christian 2026-09-04)

- `main` is never touched by agents. `dev` is the base for every task.
- Each task gets its own branch from `dev`: `fix/<task-slug>` for a bug, `feature/<task-slug>`
  for new behavior. Where a project uses ticket ids, `<ticket>/<task-slug>`.
- Merging happens on GitHub only: task branch -> `dev` by pull request, `dev` -> `main` after a
  staging test. Agents never merge, rebase onto, or push anything.
- Where a project has several repos (frontend, backend, workspace root), the same branch name
  is used in each repo the task touches.

Format: YAML frontmatter (`name`, `description`, `tools`) and the prompt. `model` is omitted so
each inherits the session's model (`claude-quality` through LiteLLM); the orchestrator can
override per agent later (the reviewer is the candidate for `claude-quality-opus`).

## Shared vs project knowledge

The agents and the `screen-design` skill hold the general method. Everything project-specific
lives with the project: `CLAUDE.md` and `README.md` in each repo, `knowledge-base/` where one
exists, and `design/PROJECT.md` + `design/STATUS.md` + `design/CHECKLIST.md` + the design files
themselves in the project's `design/` folder. A new project (for example MachineMaster) gets
the same folder shape and its own `PROJECT.md`; nothing about it goes into `_shared`.

Knowledge bases are linked, not just filed (Christian, 2026-09-06): `knowledge-base/README.md` is
the index of every document, and every document ends with a `## Related` section of 2 to 5
relative Markdown links (never wikilinks) to the docs it depends on. A role that adds or changes
a knowledge-base file or an ADR adds it to the index and keeps the links current, so the next
reader, human in Obsidian or agent in a session, finds the neighbouring files without a search.
An ADR matches the workspace's existing numbering and headings (read the neighbours first, never
bring a template of your own); old ADRs are superseded by a new one that links back, never
deleted or rewritten.

**Constraint floor (2026-09-06, adopted from addyosmani/agent-skills).** One fixed quality floor
for every repo, no per-project setup: no new suppression (`@ts-ignore`, `eslint-disable`,
`# noqa`, `istanbul ignore`), no added `.skip` / `.only` / `xit` / `@pytest.mark.skip`, no deleted
test file, no assertion removed from a surviving test, no stub (`throw new Error('not
implemented')`, empty `catch`, `TODO` in the change). Enforced today by the Tester (step 7 in
`tester.md`: each hit is a finding with file and line, verdict `implementation`) and by the
Reviewer (one hit is blocking). The mechanical version, a diff-scoped guard in the Dev Manager
that runs after the Implementer (exit `1` = `implementation` round, `2` = pause), is a separate
agent-cluster task; the role rules stay as the fallback for interactive sessions. The standing
"is this done?" list, the security list and the WCAG list live in the shared `review-checklists`
skill, named explicitly by `tester.md` and `reviewer.md`.

## Limits these files cannot enforce

Frontmatter restricts tools, not paths. "Architect writes only the spec file", "Designer writes
only under design/", "Test Writer and Tester edit only test files", and "the Implementer never
edits the Test Writer's files" are prompt rules here; the Dev Manager enforces them mechanically
with a pre-tool-use hook on file paths (the Test Writer's committed files are recorded on the
task and denied to the Implementer) and a denied-paths list per company (`companies.json`). An
interactive session relies on the prompt rules plus the human watching.

## Trying them without an orchestrator

Open Claude Code in a company repo with the `_shared` plugin loaded (the `vl-skills` local
marketplace does this for Christian's sessions; the Dev Manager passes the same path through
the SDK's `plugins`). Create the task branch from `dev`, then run one small real task by hand:
ask for the architect, approve the spec, ask for the designer if the spec needs one, the
implementer, the tester, the reviewer. What you change in the prompts afterwards is the real
content of the process and belongs in these files, not in orchestrator code.

First hand-run, completed 2026-09-04: Loop Studio, frontend bug "Use this idea button dead on
the community post detail" (`design/CHECKLIST.md`), branch `fix/community-post-use-idea-button`
cut from `feature/competitor-account-dashboard` (the most up-to-date branch; Christian's call
after the first spec, written against `dev`, turned out to predate a route rename living only
on feature branches). Architect (two rounds: the second reused an existing composable found on
the new base) → gate 1 → Implementer (1 commit, 1 file) → Tester (13 tests, proved they fail
without the change, found the suite's root cause: `vitest.config.ts` boots Nuxt from the repo
root) → Reviewer (approve; one should-fix from a mutation check, applied by the Tester) →
local branch, no push. Learnings folded into the prompts: fail-without-change proof and
pre-existing-failure reporting (tester), mutation checks on guards (reviewer). Learnings for
the Dev Manager: the task brief must carry a test command that actually runs on this OS
(`yarn test` used POSIX env syntax), and cutting the base branch is a per-task decision, not
always `dev`. Second hand-run: the competitors screen (approved handoff `3a`, partially built)
through all five roles.
