---
name: skill-authoring
description: House rules for writing, reviewing, or restructuring a skill in the C:\ai\skills repo (SKILL.md folders, scopes, references, evals, manifest). All skills are written in English. Use this whenever a task creates or edits a SKILL.md, adds a skill to a scope, forks an upstream skill, or asks whether something should become a skill at all, even if the word "skill" is not used.
---

# Writing a skill for this repo

A skill is a folder with `SKILL.md` and, optionally, `references/`, `scripts/`, `assets/`. It is
loaded in three stages, and the stage decides what goes where.

| Stage | What loads | Budget | Put here |
|---|---|---|---|
| Always | frontmatter `name` + `description` | ~100 words | what it does and when to use it |
| On trigger | the body of `SKILL.md` | under 500 lines, aim for 150 | rules, structure, output format, one example |
| On demand | `references/*`, `scripts/*` | unbounded | platform limits, long examples, templates, code |

## The description is the trigger

Models under-trigger skills. Write the description to name the task family and every phrasing a
person might use for it, then say to use it even when the user does not name the thing.

Weak: `Loopstudio content style.`

Strong: `Loopstudio content style and platform rules. Use whenever writing, editing, or reviewing
any social media post, caption, thread, or content calendar for a Loopstudio client, even if the
user doesn't say "Loopstudio".`

Limits: `name` is lowercase kebab-case, equals the folder name, at most 64 characters.
`description` is at most 1024 characters. `tools/build-manifest.mjs` enforces both.

## The body

- Lead with what the output must look like. A model that sees the target shape first makes fewer
  structural mistakes than one that reads twenty rules and infers the shape.
- Rules over prose. Bullet lists of "always / never" beat paragraphs of guidance, and local models
  in particular follow explicit rules and ignore implied ones.
- One worked example, not five. Five examples cost tokens and the model averages them.
- Name the reference files explicitly ("read `references/platform-rules.md` for the limits") so the
  loader can pre-resolve them for local models, which cannot read files mid-generation.
- Never put secrets, credentials, internal URLs with tokens, or personal data of prospects in any
  skill file. Skill files are readable by every tool of every agent that loads the scope.

## Scope

- `_shared` if the skill names no company, client, product, or person.
- `personal` if it is about Christian himself: his voice, his accounts, his management agents.
- `venture-labs/core` for Venture Labs GmbH, `venture-labs/<company>` for one of its ventures.
- One skill per job. A skill that covers "content, outreach, and reporting" is three skills.
- If two scopes need the same rule, it is a `_shared` skill with company overrides in the company
  skill, not a copy.

## Local-model tax

When a skill will also run on the local tier (`local-drafter`, an 8B to 30B model):

- Keep the body under 3,000 tokens including any pre-resolved reference. The loader drops skills
  that exceed the budget rather than truncating them.
- Spell out what a larger model would infer: exact length limits, exact banned phrases, the exact
  output delimiter.
- Add an eval. Where the local model fails a trait, that trait needs an explicit rule.

## Evals

`evals/<skill>/cases.yaml`: five to eight realistic briefs, each with checkable traits. Traits
must be mechanically testable in v1 (regex, max length, required substring). Soft traits like
tone wait for an LLM judge.

## Forking upstream

Use `node tools/fork-upstream.mjs --skill <name>`. It writes `UPSTREAM.md` with repo, path, and
commit. Record every local edit under "Local edits" in that file, so the fork can be diffed and
refreshed later.

## Done checklist

- [ ] `name` equals folder, description says what and when
- [ ] body under 500 lines, output format shown first
- [ ] reference files named explicitly in the body
- [ ] no secrets, no prospect personal data
- [ ] `npm run check` passes
- [ ] eval cases exist if output quality matters
