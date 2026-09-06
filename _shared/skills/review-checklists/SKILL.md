---
name: review-checklists
description: Standing checklists for whether a change is really done, secure and accessible - the definition of done every change must clear, the security checklist (OWASP top 10 plus the LLM top 10 for anything that calls a model), and the WCAG 2.1 AA list for screens. Use when reviewing or testing a change for completeness, security or accessibility, when asked "is this done?", "can we ship this?" or "is this safe?", or when a diff touches auth, user input, uploads, personal data, a dependency, an LLM call, a form or a screen, even without naming a checklist.
---

# Review checklists

Three lists that do not change per task. The Architect's acceptance criteria say what *this*
change must do; these lists say what *every* change must clear. The Tester walks them after the
suite, the Reviewer walks them against the diff, an interactive session walks them when asked
"is this done?". Adapted from addyosmani/agent-skills (MIT) and rewritten for our roles and stack
(Nuxt/Vue frontends, Spring Boot, Neos Flow and Strapi backends, static Netlify sites, the agent
cluster itself).

## Output (the shape a checklist walk ends with)

One block per list walked, only failed or not-applicable items spelled out, every failure with a
file and line so it can be acted on:

```markdown
## Checklist: definition of done
- fail  Floor: `src/api/orders.ts:41` new `// eslint-disable-next-line` (verdict implementation)
- fail  Documentation: `knowledge-base/domain/orders.md` changed, not in `knowledge-base/README.md`
- n/a   Integration: no migration, no config key
- pass  everything else (12 items)

## Checklist: security
- fail  Input validation: `server/api/upload.post.ts:18` file type taken from the client's `Content-Type`
- pass  everything else (9 items walked; auth, headers, CORS not touched by this diff)

## Checklist: accessibility
- not walked: the diff touches no screen
```

In a Tester or Reviewer report these lines become findings (`[blocking]` for a floor or security
item, `[should-fix]` for the rest) with the same file and line.

## Which list, when

| List | File | Walk it when |
|---|---|---|
| Definition of done | `references/definition-of-done.md` | every change, always |
| Security | `references/security-checklist.md` | the diff touches auth, sessions, user input, uploads, redirects, outbound fetches, personal data, a dependency, headers or CORS, or any call to a model (LiteLLM, an agent, a prompt) |
| Accessibility | `references/accessibility-checklist.md` | the diff touches a screen, a form, a dialog, navigation, or a design handoff is being implemented |

Read the file before walking it; do not recite the list from memory, the items change.

## Always / never

- Always name the file and line for a failed item. "Security looks fine" is not a walk.
- Always say which lists were walked and which were not, and why not.
- Always treat a floor item (suppression, skipped or deleted test, removed assertion, stub) as
  blocking; it is the one part of the definition of done no reason clears except Christian's
  note in the spec.
- Never tick an item you did not verify in the diff or by running something.
- Never soften an item because the task is late, the round count is high, or the author
  explained it. A justified exception is recorded in the spec by Christian, not in the report.
- Never fix anything while walking a list; the Tester and Reviewer report, the Implementer fixes.
