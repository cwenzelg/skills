# Dev subagents (phase 2 of the plan)

This folder will hold the four development subagents as Claude Code agent files:

- `architect.md` - reads repo + knowledge base, writes `docs/specs/<task>.md`; never edits code
- `implementer.md` - implements the spec on an `agent/<task-id>` branch
- `tester.md` - writes/extends tests for the acceptance criteria, runs the suite; test files only
- `reviewer.md` - reads the diff against the spec, ranked findings with failure scenarios

Format: YAML frontmatter (`name`, `description`, `tools`, `model`) followed by the prompt. They
are loaded through the `vl-shared` plugin like any skill, by the Dev Manager and by interactive
Claude Code sessions alike. Not written yet; see the plan page linked from the root README.
