# Plan template (plan-first agent process, 2026-09-08)

Every delegated unit of work - a Dev Manager task, a background manager instance, a Producer job -
gets a **brief** in this shape from whoever delegates it, writes its own **plan** in the same shape,
and reports at close in **plan-vs-actual** form. The Architect's spec (`agents/architect.md`) carries
the same three middle sections. Reasoning and the decision: agent-cluster
`docs/plan-first-agent-process-options.md`, section "Decided".

This file lives at the scope root next to `DEV-AGENTS.md` on purpose: it is a process contract, not
a triggerable skill, and the manifest tool only indexes `skills/` and `agents/`.

## The shape (brief and plan use the same six sections, in this order)

```markdown
# Plan - <task id>

## Goal - and what "done" looks like
<one or two sentences; then "Done = ..." as a checkable list, not a feeling>

## Steps - each with what it touches
1. <step> - files / functions / processes / external services it touches, and how
2. ...

## Verification - the evidence I bring back
- <how each step is proven: a command with its exit status, an API read-back, a test run, a
  screenshot, a rendered text. Never "it compiled" or "it should work".>

## Will not do
- <explicit exclusions: no restarts, no posts to live channels, no pushes, no schema changes ...>

## Stop conditions - stop and report instead of improvising
- <what makes the agent stop and ask>

## Recipe key
Recipe key: <kebab-case type of work, e.g. slack-handler-fix, landing-copy-change, kuma-monitor-add>
Denylist: none | hit (<which denylist item and why>)
```

Rules:

- **A brief is written only after the request is clear** (the readiness / clarification check in
  agent-cluster `CLAUDE.md`): "done" is knowable, the fit is checked, the first step is bounded.
- **The plan is written by the agent from the brief, then the agent stops.** The delegator (the
  front desk for background instances; gate 1 for the Architect's spec) checks plan against brief
  and answers "go" or corrections. A plan that deviates from the brief says where and why - in a
  "Questions for the delegator" section, never silently.
- **Verification is a promise made before execution**, not a claim made after it. Every step
  needs a piece of evidence named here that a reader can check without trusting the agent.
- **Close-out = plan vs actual**: what deviated from the plan and why, the promised evidence,
  commit ids, then the last line of the post is the machine-readable trailer
  `close-out: <task id> · recipe: <key>` (its own thread unless it belongs wholly to one existing
  thread). The delegator's ✅ / ❌ reaction on that post is the verdict and feeds the recipes
  ledger (agent-cluster `agents/manager/scripts/recipes.mjs`, `npm run recipes`).

## Trust ledger and auto-run

Each recipe key counts consecutive ✅. When a key has **`RECIPES_AUTO_RUN_AFTER` (default 3)
consecutive ✅** and the brief says **`Denylist: none`**, the delegator may let the agent run without
waiting for the plan check (`npm run recipes -- check <key> --brief <path>` prints `skip=true`). The
plan is still written and posted. A ❌ resets the count. Enforcement is the delegator's judgment
with the CLI as the record, not a parser.

**Denylist - never auto-runs regardless of the count** (the existing guardrails restated):

- restarting a live process
- writing to any external surface: Slack channel posts, Notion schema, DNS, Netlify, GitHub pushes
- anything customer-facing
- anything that spends above the role's LiteLLM budget

## Worked example

The first brief written in this shape: agent-cluster
`agents/manager/.state/tasks/20260908-plan-first-agent-process/brief.md` and the `plan.md` next to
it (goal with a seven-point "done", steps at file/function level, an evidence list with exit
statuses and read-backs, a will-not-do list naming the gates it leaves alone, stop conditions, a
questions section for the two places the brief was wrong).
