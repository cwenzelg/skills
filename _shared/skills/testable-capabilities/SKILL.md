---
name: testable-capabilities
description: What checks are even possible for a given stack (lint, test, type-check, build) - a general reference so "no house rules found" and "no lint configured" are never guessed or invented, and a pointer to where each company's own tracked reality (what is actually implemented and wired up today) belongs. Use whenever a task checks, tests, or reviews a repo and needs to know what tooling that stack should have, when a repo has no lint/test command configured and you need to say whether that is expected or a gap, or when writing/updating a company's own skill scope with facts about its tooling.
---

# Testable capabilities

Two different questions get confused constantly: "what CAN this stack check" (this file - general,
company-neutral) and "what DOES this specific repo actually have wired up today" (the company's own
`venture-labs/<company>` skill scope - specific, factual, and only as current as its last update).
Never answer the second from this file, and never put company-specific facts in this file.

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

This file never says "Loop Studio's backend has no Checkstyle" or "MachineMaster's frontend uses
ESLint 9" - that is a fact about one company's repos on one date, and it belongs in that company's
own skill scope (`venture-labs/<company>`), not here. When you learn a fact like that by actually
reading a repo (not by inference from this table), the two ways it should land are:

1. **A short, dated note in the company's own skill scope** (a `<company>-context` skill if one
   exists, or a new one if a task creates it) - "backend: test suite yes (`./gradlew test`), no
   lint tool configured as of 2026-09-10" is useful forever until someone adds one; a guess is not.
2. **Nothing at all**, when you have not actually verified it - "probably has ESLint" is worse than
   silence; check `package.json` / `build.gradle` / `composer.json` before writing anything down.

The Judgment Tester and Tester both read this file for the general rule, then the company's own
scope for what that company actually has, in that order - replacing the older "check CLAUDE.md for
house rules" instruction (2026-09-10: "there's nothing to do in CLAUDE.md with this information -
it needs to be handed to the agent").

## Always / never

- Always distinguish "not configured" from "checked, passing" - a company with no lint tool is not
  the same as a company whose lint tool found nothing.
- Always name the standard tool for the stack when reporting a gap, so the finding is actionable.
- Never invent a company-specific fact here; this file only ever describes what a *stack* can do.
- Never copy a fact from this file into a report as if it were verified for the specific repo in
  front of you - re-check the actual repo (`package.json`, `build.gradle`, `composer.json`, CI
  config) before saying what it has.
