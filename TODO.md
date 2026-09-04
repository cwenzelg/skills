# TODO

Open work on the skill library, in rough priority order. Dated when added. Remove when done.

## Adapt, don't fork as-is (2026-09-04)

These upstream skills from anthropics/skills are templates written for Anthropic's own brand and
comms. Vendoring them unchanged into an active scope would make agents apply the wrong brand, so
they are listed here instead of copied. For each: read upstream, rewrite under a new name in the
right scope, own it (do not add to `_shared/upstream.json`).

- [ ] `brand-guidelines` → `venture-labs/core/skills/brand` with the real palette and Poppins
      (see `pulse-offer-context`), and a personal variant in `personal/` if the personal account's
      look diverges.
- [ ] `internal-comms` → `venture-labs/core/skills/corporate-comms`: how Venture Labs writes
      status updates, client updates, and announcements. English first, German second.
- [ ] `corporate-comms` (from Christian's original design doc, `_shared/corporate-comms`): decide
      whether this is the same skill as the one above or a company-neutral template. Probably one
      skill in `venture-labs/core` plus a stripped template in `_shared` later.

## Content (2026-09-04)

- [ ] Loop Studio voice extraction: ten best-performing client posts → rules → Christian's
      corrections → `venture-labs/loopstudio/skills/content-style` Voice section and
      `references/hooks-that-worked.md`. Procedure in `evals/README.md`.
- [ ] Series tag language: "KI-Implementierungs-Serie · Tag X/90" vs "AI Implementation Series ·
      Day X/90" under the English-first policy. Christian decides before Episode 1 ships.
      Tracked in `personal/skills/personal-branding`.
- [ ] Eval cases for `content-style`: five to eight from real briefs (two starters exist).
- [ ] Eval cases for `personal-branding`.

## Dev branch (phase 2 of the plan)

- [ ] `_shared/agents/{architect,implementer,tester,reviewer}.md`.
- [ ] First company scope with real project context (`venture-labs/machinemaster` is empty).

## Loader (phase 4)

- [ ] `agents/skill-loader/` in agent-cluster, reading `manifest.json`. Eval runner ships with it.

## Repositories (2026-09-04)

- [x] Remotes created and pushed 2026-09-04: `cwenzelg/skills`, `cwenzelg/personal-skills`,
      `venture-labs/vl-skills`.
- [ ] Register `personal/` and `venture-labs/` as submodules of the base repo so
      `git clone --recurse-submodules` restores the whole tree. Remove them from `.gitignore` at
      that point.
- [ ] First tag `v2026.09` on each repo once the Manager loads them successfully (phase 1 test).

## Later

- [ ] `doc-output`: house conventions on top of the forked `docx` / `pptx` / `xlsx` / `pdf` skills.
- [ ] `client-onboarding` and `usage-watcher-digest` in `venture-labs/core` (from the original
      design doc; no content yet).
- [ ] Re-verify `references/platform-rules.md` limits against the live platforms (marked
      "from memory").
