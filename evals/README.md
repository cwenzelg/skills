# Evals

One folder per skill whose output quality matters, holding `cases.yaml`: realistic briefs plus
traits the output must have. The runner arrives with the skill loader (phase 4 of the plan) and
will send each case through LiteLLM twice, once on `claude-quality` and once on `local-drafter`,
and report pass/fail per trait. Until then, cases are still worth writing: they are the
specification of "good" for that skill, and a human can run them by hand.

## Case format

```yaml
skill: venture-labs/loopstudio/content-style   # scope path / skill
cases:
  - id: bakery-launch-instagram
    brief: >
      Instagram post for a Cologne bakery client ...
    inline_refs:
      platform: instagram                # what the loader would pre-resolve
    traits:
      - { type: regex,     pattern: "^PLATFORM: instagram", flags: "m" }
      - { type: max_chars, section: BODY, value: 2200 }
      - { type: not_regex, pattern: "game-changer|Let's dive in|Imagine", flags: "i" }
      - { type: regex,     pattern: "^CTA:\\n\\S", flags: "m" }
      - { type: count_max, pattern: "#\\w+", value: 5 }
```

Trait types in v1 (all mechanical): `regex`, `not_regex`, `max_chars`, `min_chars`, `count_max`,
`count_min`, `contains`, `not_contains`. `section` limits a check to one block of the skill's
output format. Soft traits (tone, "sounds like the client") wait for an LLM judge on
`local-classifier`.

## Reading results

Where `claude-quality` passes and `local-drafter` fails, the rule the local model missed is
implied somewhere in the skill body. Make it explicit. Where both fail, the skill is wrong or the
brief is unrealistic. Where both pass on every case, add a harder case.

## Extraction (how the Loop Studio voice section gets written)

1. Collect the ten best-performing Loop Studio client posts by reach relative to each account's
   median. Anonymize client names.
2. Ask `claude-quality` what they have in common: sentence length, opening move, vocabulary,
   what they never do. Ask for rules, not adjectives.
3. Christian reads the rules and disagrees with about half. The disagreements are the skill.
4. The surviving rules become the Voice section of `venture-labs/loopstudio/skills/content-style/SKILL.md`;
   the hooks go to `references/hooks-that-worked.md` with their mechanisms.
5. Write five to eight cases here from real briefs. Run both tiers. Tighten until the local model
   passes.
