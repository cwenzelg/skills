# skills

Skill library for Christian Wenzel's agents: the agent cluster (venturelabs.team), his
management agents, his personal social media, and the companies he founded or co-founded.
One repo, one plugin folder per scope, every agent pulls the scopes it needs.

Concept and build order: https://claude.ai/code/artifact/c39e8d4f-bc5a-4e29-89ec-05312d0c313e
(the "Skills and Dev Branch Plan", 2026-09-04). This README is the operational half of that page.
Open work is in `TODO.md`.

## Layout

```
skills/
  manifest.json                generated index of every skill and agent — never hand-edit
  TODO.md                      open work, including upstream skills to adapt rather than fork
  _shared/                     plugin "shared": usable by every agent, names no company or person
    .claude-plugin/plugin.json
    skills/<name>/SKILL.md     skill authoring, docx, pptx, pdf, xlsx, doc-coauthoring,
                               webapp-testing, frontend-design, mcp-builder, skill-creator
    agents/<name>.md           dev subagents: architect, implementer, tester, reviewer (see _shared/DEV-AGENTS.md)
  personal/                    plugin "personal": Christian only — his voice, his accounts,
    skills/personal-branding   context for his management agents
  venture-labs/                the company layer (a grouping, not a plugin itself)
    core/                      plugin "vl-core": Venture Labs GmbH — offer, ICP, outreach, brand
    loopstudio/                plugin "vl-loopstudio": content style, calendar, client intake
    machinemaster/             plugin "vl-machinemaster": empty until the dev branch needs it
  evals/<skill>/cases.yaml     test briefs + traits for _shared skills; nested repos have their own evals/
  _shared/upstream.json        lockfile for vendored upstream skills (repo, path, commit)
  tools/build-manifest.mjs     walks every scope → manifest.json; --check for CI/pre-commit
  tools/upstream.mjs           add / sync / update vendored upstream skills from the lockfile
  .githooks/pre-commit         regenerates the manifest on every commit
```

Three layers, top to bottom: **shared** (tools and methods anyone may use), **personal**
(Christian himself), **companies** (Venture Labs and its ventures). A scope is any folder with
`.claude-plugin/plugin.json`; it is a valid Claude Code plugin, so a Claude-tier agent loads it
with one SDK option. `venture-labs/` itself has no plugin.json: it groups the company scopes.

## Repositories

Three git repositories, nested on disk so agents see one tree, separated so they can be shared
differently:

| Repo | Path | Holds | Sharing |
|---|---|---|---|
| `skills` (this one) | `C:\ai\skills` | `_shared/`, `tools/`, `evals/` for shared skills | could be handed to a client or published; mostly downloaded upstream skills plus house rules |
| `personal` | `C:\ai\skills\personal` | Christian's own skills | never shared |
| `venture-labs` | `C:\ai\skills\venture-labs` | `core/`, `loopstudio/`, `machinemaster/`, their evals | company-internal |

The base repo ignores `personal/` and `venture-labs/` (see `.gitignore`); each nested repo has
its own history, hook, and `manifest.json`. `tools/` lives only here; the nested repos call it
as `../tools/build-manifest.mjs --root .`, so they must be checked out inside this folder to
regenerate their manifest (loading skills into an agent needs no tools). The manifest tool never
descends into a nested repo. The local-tier loader (agent-cluster `agents/skill-loader/`, phase 4)
reads all three manifests under `SKILLS_ROOT`.

Remotes (GitHub, 2026-09-04): `cwenzelg/skills` (this repo), `cwenzelg/personal-skills`,
`venture-labs/vl-skills`. The nested checkouts can become git submodules of this repo so one
`git clone --recurse-submodules` restores the whole tree (`TODO.md`); until then, clone them by
hand per "First-time setup".

## Rules

- **Where a skill lives.** `_shared` if it names no company, client, product, or person.
  `personal` if it is about Christian: his voice, his accounts, his management agents.
  `venture-labs/core` for Venture Labs GmbH; `venture-labs/<company>` for one venture.
  The moment a shared skill mentions a company, it moves. `_shared` plus one company folder is
  what could be handed to a client unchanged.
- **Two language rules (2026-09-04).** Code, docs, and skill files: English first. Published
  content (posts, outreach, client documents): German first, English translation second, unless
  a client profile says otherwise. Never mixed in one piece.
- **Standard format, always.** A skill is a folder with `SKILL.md` (YAML frontmatter `name` +
  `description`, then the body) and optional `references/`, `scripts/`, `assets/`. `name` equals
  the folder name. Holds for local-model-only skills too, so any skill is one `git mv` from the
  other tier.
- **The description is the trigger.** Only part always in context. Say what the skill does *and*
  when to use it, slightly pushy: models under-trigger. House rules in
  `_shared/skills/skill-authoring/SKILL.md`.
- **Progressive disclosure.** Frontmatter always (~100 words), body on trigger (under 500 lines),
  references only when the body says so. Twice as important for the local models.
- **Upstream skills are vendored and pinned** in `_shared/upstream.json`, never edited in place.
  See "Upstream skills" below. Upstream skills built for someone else's brand or comms
  (brand-guidelines, internal-comms) are **not** vendored as-is; they are rewritten into the
  right scope. See `TODO.md`.
- **`manifest.json` is generated.** `npm run manifest`, or let the pre-commit hook do it.
  `npm run check` proves the committed manifest matches the tree.
- **Version by git tag**, e.g. `v2026.09`. Agents pin to a tag, never to `main`.
- **No secrets, no prospect data, ever.** Skill files are readable by every tool of every agent
  that loads the scope. The SDK's skill filter hides listings, not files.

## Who loads what

| Agent | Scopes | Why |
|---|---|---|
| Manager (and planning sessions like this one) | `_shared`, `personal`, `venture-labs/core` | company context plus skill authoring; it scaffolds agents and skills |
| Content Studio | `_shared`, `personal`, `venture-labs/core`; `venture-labs/loopstudio` when Loop Studio content is in play | Christian's voice and the offer facts; Loop Studio rules only for Loop Studio work |
| Dev Manager (phase 3) | `_shared` + the scope of the task's company | dev subagents and project context, nothing else |
| Prospector | none yet | `pulse-offer-context` is a candidate once it is wired for plugins |
| Moltbook scout | none | local-only, sparse participation; a skill would go through the loader |

Scope per agent, not everything for everyone: each skill description sits in context
permanently, so irrelevant skills are mis-trigger opportunities.

## Consuming skills

### Claude-tier agents (native)

Every agent in agent-cluster runs the Claude Agent SDK with `settingSources: []`. Plugins load
independently of that, so a scope list is two lines in the agent's `baseQueryOptions`:

```ts
// agents/<name>/src/env.ts — SKILLS_ROOT comes from .env, e.g. C:\ai\skills
const SKILL_SCOPES = ['_shared', 'personal', 'venture-labs/core'];   // this agent's scopes
...
plugins: SKILL_SCOPES.map((s) => ({ type: 'local' as const, path: join(SKILLS_ROOT, s) })),
skills: 'all',                                                       // or a string[] to narrow
```

### Interactive Claude Code (terminal, VS Code)

`.claude-plugin/marketplace.json` at the root declares this library as a local marketplace named
`vl-skills`, one plugin per scope. Register once and enable the scopes you want user-wide:

```
claude plugin marketplace add C:aiskills
claude plugin install shared@vl-skills
claude plugin install personal@vl-skills
claude plugin install vl-core@vl-skills
```

Company scopes go per project instead: `claude plugin install vl-loopstudio@vl-skills --scope
project` inside that repo (or `enabledPlugins` in its `.claude/settings.json`). A directory
marketplace is loaded **from these folders directly**, so edits here are live in the next
session; the copy under `~/.claude/plugins/cache/` is not what runs. Do not also link these
folders into `~/.claude/skills/`, that would load every skill twice. `claude plugin details
shared@vl-skills` shows the component inventory and token cost of a scope.

### Local-tier workers (loader)

n8n worker flows and Content Studio's ideation call ask the loader service for a system prompt
instead of assembling one. The loader is phase 4 and lives in agent-cluster, not here; its
contract is in the plan page. Until it exists, a worker flow can inline a SKILL.md body by hand.

## Adding a skill

1. `mkdir <scope>/skills/<name>` and write `SKILL.md` following `skill-authoring`.
2. Slow-changing detail in `references/`, deterministic steps in `scripts/`, templates in
   `assets/`. Body under 500 lines.
3. Add `evals/<name>/cases.yaml` if output quality matters (it usually does).
4. `npm run manifest` (or just commit; the hook runs it). `npm run check` must pass.

## Upstream skills

Skills downloaded from other repositories (today: anthropics/skills) are **vendored**: the copy is
committed, and the lockfile `_shared/upstream.json` records where each came from and the exact
commit. Committed rather than fetched on clone because a skill is a prompt: an upstream change
changes agent behavior, and that should arrive as a reviewable `git diff`, not silently. A fresh
clone works offline and every agent sees the same tree.

```
npm run upstream:add -- --skill docx                    # vendor a new one at upstream HEAD (default repo anthropics/skills, scope _shared)
npm run upstream:add -- --skill foo --repo org/repo --path dir/in/repo/foo --scope venture-labs/core
npm run upstream:sync                                   # restore every vendored skill exactly at its pinned commit
npm run upstream:update                                 # bump every pin to upstream HEAD and re-copy; then git diff, review, commit
npm run upstream:update docx                            # same, one skill
```

Rules: a vendored skill is never edited in place (the next update would overwrite it). To adapt
one, copy it under a new name in the right scope and make it yours; `TODO.md` lists the ones
waiting for that. Each vendored folder carries a generated `UPSTREAM.md` with repo, path, and
commit, and its upstream `LICENSE.txt` stays with it.

## First-time setup

```
git clone <skills remote> C:\ai\skills
cd C:\ai\skills
git clone <personal remote> personal              # nested repos, ignored by this one
git clone <venture-labs remote> venture-labs
for /d %r in (. personal venture-labs) do git -C %r config core.hooksPath .githooks
npm run check                                     # this repo
npm --prefix personal run check                   # each nested repo
npm --prefix venture-labs run check
```

No `npm install` needed: the tools are dependency-free Node scripts.
