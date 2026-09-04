# Dev subagents (`_shared/agents/*.md`)

This file lives outside `agents/` on purpose: Claude Code treats every `.md` in a plugin's
`agents/` folder as an agent definition, README included.

Five Claude Code subagent definitions that together form the development process the Dev
Manager will orchestrate (phase 2 and 3 of the "Skills and Dev Branch Plan", see the plan link
in the root README). They are company-neutral; company context comes from the company's skill
scope, the repo's own `CLAUDE.md`, and the project's `design/PROJECT.md`.

| Agent | Job | Tools | Writes |
|---|---|---|---|
| `architect` | goal -> spec with testable acceptance criteria, a file-level plan, and a "needs design?" call | Read, Glob, Grep, Write | `docs/specs/<task-id>.md` only |
| `designer` | screen design per the shared `screen-design` skill: draft rounds on a canvas, human approval, handoff export | Read, Glob, Grep, Write, Edit, Bash, Artifact, Skill | `design/` only |
| `implementer` | approved spec (+ handoff) -> code on the task branch, small commits | Read, Edit, Write, Glob, Grep, Bash | production code |
| `tester` | one test per acceptance criterion, runs the suite, reports | Read, Edit, Write, Glob, Grep, Bash | test files only |
| `reviewer` | diff vs spec -> ranked findings with scenarios, verdict | Read, Glob, Grep, Bash | nothing |

Flow (Christian, 2026-09-04): architect -> **gate 1: Christian approves the spec** (every task,
first month) -> if the spec says `design: needed`: designer drafts -> **gate 2: Christian
approves a round** (layout, and whether the screen shows the functions the task needs) ->
designer exports the handoff -> implementer -> tester (failures go back to the implementer, max
2 loops) -> reviewer (blocking findings go back once) -> local branch + Slack report ->
**gate 3: Christian merges on GitHub**. Delivery is a local branch and a Slack DM, no push, no
PR, so the agent process needs no GitHub credentials.

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

## Limits these files cannot enforce

Frontmatter restricts tools, not paths. "Architect writes only the spec file", "Designer writes
only under design/", and "Tester edits only test files" are prompt rules here; the Dev Manager
enforces them mechanically with a pre-tool-use hook on file paths and a denied-paths list per
company (`companies.json`). Until the Dev Manager exists, an interactive session relies on the
prompt rules plus the human watching.

## Trying them without an orchestrator

Open Claude Code in a company repo with the `_shared` plugin loaded (the `vl-skills` local
marketplace does this for Christian's sessions; the Dev Manager passes the same path through
the SDK's `plugins`). Create the task branch from `dev`, then run one small real task by hand:
ask for the architect, approve the spec, ask for the designer if the spec needs one, the
implementer, the tester, the reviewer. What you change in the prompts afterwards is the real
content of the process and belongs in these files, not in orchestrator code.

First hand-run (2026-09-04): Loop Studio, frontend bug "Use this idea button dead on the
community post detail" (`design/CHECKLIST.md`), branch `fix/community-post-use-idea-button`
from `dev`, no design step. Second: the competitors screen (approved handoff `3a`, partially
built) through all five roles.
