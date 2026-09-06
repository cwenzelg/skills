# Definition of done

Adapted from addyosmani/agent-skills (MIT), `references/definition-of-done.md`, rewritten for
the six-role process and our repos.

The Architect's acceptance criteria answer "did we build this thing?" and differ per task. This
list answers "is it finished to our standard?" and is the same for every change in every repo.
A task is done only when both hold. The Tester walks it after the suite, the Reviewer walks it
against the diff; an item that fails is a finding with file and line, never a silent tick.

| | Acceptance criteria | Definition of done |
|---|---|---|
| Scope | one task, one spec | every change |
| Written by | the Architect, approved at gate 1 | here, once |
| Checked by | Test Writer (tests), Tester (results), Reviewer (evidence) | Tester and Reviewer |
| Example | "POST /orders returns 422 with field errors for an empty cart" | "tests fail without the change; no new suppression" |

## Correctness

- [ ] Every acceptance criterion is met, with evidence: the test that proves it, or the manual
      check the spec allowed and who did it
- [ ] The code ran: build and test command executed in the worktree, not only typechecked
- [ ] New behaviour has tests that fail without the change (the Test Writer's proof, or the
      Reviewer's mutant) and pass with it
- [ ] The whole suite passes; pre-existing failures are named with their root cause, never
      counted as the task's and never "fixed" by skipping
- [ ] Error paths and edge cases the spec names are handled, not only the happy path

## Floor (fixed for every repo, no setup)

- [ ] No new `@ts-ignore` / `@ts-expect-error` / `eslint-disable` / `# noqa` / `# type: ignore` /
      `istanbul ignore` / `@SuppressWarnings` in the added lines
- [ ] No added `.skip` / `.only` / `xit` / `xdescribe` / `@pytest.mark.skip` / `@Disabled`, no
      deleted test file, no assertion removed from a surviving test
- [ ] No stub: `throw new Error('not implemented')`, `UnsupportedOperationException`, empty
      `catch`, `TODO` / `FIXME` in the change
- [ ] No secret, token, credential or customer record in the diff, in a fixture, or in a log line

## Quality

- [ ] Names and structure say what the code does; no comment is needed for *what*
- [ ] No duplicated business logic, no dead code, no debug output, no commented-out block
- [ ] Only what the spec lists changed; anything else is under "Noticed but not touching" or
      "Deviations from the spec" in the implementation report
- [ ] The repo's own formatter and linter pass with the repo's config, not a new one
- [ ] The change follows the surrounding file's conventions (naming, error handling, logging)

## Integration

- [ ] Works with the rest of the system: every caller of a changed function, the other repo of a
      cross-repo task, the data contract of the design handoff
- [ ] Migrations, config keys, env variables and feature flags are named in the spec and the
      report; `.env.example` updated, `.env` never touched
- [ ] A changed public interface or API keeps existing clients working, or the spec says why it
      may not (contract rules in the shared `api-and-interface-design` skill)

## Documentation

- [ ] A changed public interface or user-facing behaviour is documented where this repo
      documents such things (README, `docs/`, the knowledge base), in English
- [ ] A decision worth keeping is an ADR in the workspace's existing numbering and headings; a
      replaced ADR is superseded by the new one, never deleted
- [ ] A new or changed knowledge-base file is in `knowledge-base/README.md` and ends with
      `## Related` (2 to 5 relative Markdown links)
- [ ] Docs describe the current state in timeless language, not the change history

## Safety and hand-over

- [ ] `security-checklist.md` walked when the diff touches auth, input, uploads, personal data,
      a dependency or an LLM call; `accessibility-checklist.md` walked when it touches a screen
- [ ] Every font family the diff introduces or references is `free` or `licensed` (shared
      `font-licensing` skill); an `unknown` font is a spec-level block, not a code fix
- [ ] Rollback is one line in the report: `git revert <first>..<last>` on the task branch, plus
      the down step of any migration
- [ ] The result is a local `fix/` or `feature/` branch cut from `dev`; nothing was pushed,
      merged or deployed by an agent, and Christian merges on GitHub (gate 3)

## Red flags

- "Done, I just haven't run it yet": unverified is not done.
- "Tests pass" standing in for the whole list.
- A softer bar because the task is late or the round count is high.
- A criterion the spec marked manual declared done without saying who checked it.
- A floor item explained instead of fixed.
