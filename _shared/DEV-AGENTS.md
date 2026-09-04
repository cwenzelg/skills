# Dev subagents (`_shared/agents/*.md`)

This file lives outside `agents/` on purpose: Claude Code treats every `.md` in a plugin's
`agents/` folder as an agent definition, README included.

Four Claude Code subagent definitions that together form the development process the Dev
Manager will orchestrate (phase 2 and 3 of the "Skills and Dev Branch Plan", see the plan link
in the root README). They are company-neutral; company context comes from the company's skill
scope and the repo's own `CLAUDE.md`.

| Agent | Job | Tools | Writes |
|---|---|---|---|
| `architect` | goal -> spec with testable acceptance criteria and a file-level plan | Read, Glob, Grep, Write | `docs/specs/<task-id>.md` only |
| `implementer` | approved spec -> code on `agent/<task-id>`, small commits | Read, Edit, Write, Glob, Grep, Bash | production code |
| `tester` | one test per acceptance criterion, runs the suite, reports | Read, Edit, Write, Glob, Grep, Bash | test files only |
| `reviewer` | diff vs spec -> ranked findings with scenarios, verdict | Read, Glob, Grep, Bash | nothing |

Flow: architect -> **Christian approves the spec** (every task, decided 2026-09-04) -> implementer
-> tester (failures go back to the implementer, max 2 loops) -> reviewer (blocking findings go
back once) -> local branch + Slack report -> **Christian merges**. Delivery is a local branch and
a Slack DM, no push, no PR, so the agent process needs no GitHub credentials.

Format: YAML frontmatter (`name`, `description`, `tools`) and the prompt. `model` is omitted so
each inherits the session's model (`claude-quality` through LiteLLM); the orchestrator can
override per agent later (the reviewer is the candidate for `claude-quality-opus`).

## Limits these files cannot enforce

Frontmatter restricts tools, not paths. "Architect writes only the spec file" and "Tester edits
only test files" are prompt rules here; the Dev Manager enforces them mechanically with a
pre-tool-use hook on file paths and a denied-paths list per company (`companies.json`). Until
the Dev Manager exists, an interactive session relies on the prompt rules plus the human
watching.

## Trying them without an orchestrator

Open Claude Code in a company repo with the `_shared` plugin directory loaded (Claude Code's
local plugin option; the Dev Manager passes the same path through the SDK's `plugins`). Then
run one small real task by hand: ask for the architect, approve the spec, ask for the
implementer, the tester, the reviewer. What you change in the prompts afterwards is the real
content of the process and belongs in these files, not in orchestrator code.
