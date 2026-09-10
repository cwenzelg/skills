---
name: testable-capabilities
description: What checks are even possible for a given stack (lint, test, type-check, build) - a general reference so "no house rules found" and "no lint configured" are never guessed or invented. Use whenever a task checks, tests, or reviews a repo and needs to know what tooling that stack should have, or when a repo has no lint/test command configured and you need to say whether that is expected or a gap.
---

# Testable capabilities

Two different questions get confused constantly: "what CAN this stack check" (this file - general,
company-neutral, a question of the programming language) and "what DOES this specific repo actually
have wired up today" (a live fact about one repo on one date). The second is deliberately **not**
answered by a hand-maintained skill file per company (tried once, reverted the same night - Christian,
2026-09-10: "it's more a question of the programming language I use in the backend and on the
frontend, so I don't think we should put rules for testing in project-specific folders" - and a
written-down fact like that just goes stale). It is answered instead by the Technical Tester's own
report, generated fresh on every round from the actual repo, never from a note someone has to
remember to update.

## The standard tool per stack

A repo missing one of these is not automatically wrong - some stacks genuinely have no idiomatic
type-checker, and a young repo may not have set up linting yet. The point of this table is to tell
the difference: a Java repo with no Checkstyle/Spotless/PMD is missing an *optional* layer; a
TypeScript repo with no `tsc` anywhere has skipped something the stack gives you for free.

| Stack | Lint | Test | Type-check | Build |
|---|---|---|---|---|
| JavaScript / TypeScript (Node, Nuxt, Vue, React) | ESLint (`eslint .` / `next lint`) | Vitest / Jest / Playwright component tests | `tsc --noEmit` (TypeScript only; plain JS has none) | framework build (`next build`, `nuxt build`, `vite build`) or none for a script |
| PHP / Neos Flow | PHP_CodeSniffer (`phpcs`), PHPStan or Psalm for static analysis | PHPUnit | PHPStan/Psalm doubles as the closest thing to a type-check (PHP has no compiler step) | `php -l` (syntax lint) per file; Neos Flow has no separate build artifact |
| Java / Spring (Gradle) | Checkstyle, Spotless, PMD, SpotBugs (opt-in, often absent) | JUnit via `./gradlew test` | the compiler itself (`./gradlew compileJava`) - Java's build step IS its type-check | `./gradlew build` (compiles + runs `check`) |
| Static/marketing sites (Netlify, no framework or a static generator) | `html-validate`, `eslint` on any scripts | usually none automated; link checks and a manual preview stand in | not applicable | the generator's build step (`npm run generate`) or none for hand-written HTML |
| Strapi (Node CMS) | ESLint on custom code | usually none out of the box | `tsc --noEmit` only if the project is TypeScript | Strapi's own build, rarely run outside its Docker dev container |
| Python | ruff / flake8 | pytest | mypy / pyright | packaging step (`build`, `poetry build`) or none for a script |

A blank cell in a real repo is a to-do to raise, not a silent skip - say so explicitly ("no lint
tool configured for this PHP backend; PHPStan or Psalm would be the standard choice") rather than
inventing a command that does not exist, and rather than treating "nothing configured" the same as
"checked, clean."

## Where a company's own tracked reality lives

Nowhere, as a written file - and that is deliberate, not a gap. This file never says "Loop Studio's
backend has no Checkstyle" or "MachineMaster's frontend uses ESLint 9"; neither does any per-company
skill. That fact is re-derived by the Technical Tester every round, straight from the repo
(`package.json` / `build.gradle` / `composer.json` / CI config), and printed in its report - it is
never guessed, and it can never go stale, because nothing wrote it down ahead of time.

The Judgment Tester and Tester both read this file for the general rule (what the stack *could*
have), then the Technical Tester's own report for what this repo *does* have - replacing the older
"check CLAUDE.md for house rules" instruction (2026-09-10: "there's nothing to do in CLAUDE.md with
this information - it needs to be handed to the agent").

## Always / never

- Always distinguish "not configured" from "checked, passing" - a company with no lint tool is not
  the same as a company whose lint tool found nothing.
- Always name the standard tool for the stack when reporting a gap, so the finding is actionable.
- Never invent a company-specific fact here; this file only ever describes what a *stack* can do.
- Never copy a fact from this file into a report as if it were verified for the specific repo in
  front of you - re-check the actual repo (`package.json`, `build.gradle`, `composer.json`, CI
  config) before saying what it has.
- Never write a company-specific tooling fact into a skill file, even a short dated one - it is a
  live check the Technical Tester repeats every round, not a note that ages.
