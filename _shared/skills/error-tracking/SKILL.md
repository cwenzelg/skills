---
name: error-tracking
description: House standard for error tracking with Sentry in every Venture Labs project (Nuxt/Vue frontends, Spring Boot, Neos Flow and Strapi backends, static Netlify sites). Use when adding Sentry to a project, creating a Sentry project or DSN, fixing noisy or missing error reports, uploading source maps, tagging releases and environments, wiring alerts, or when a task mentions error tracking, crash reporting, exceptions in production, Sentry, DSN, or the error-triage agent - even if the user does not name Sentry.
---

# Error tracking (Sentry) - the default for every project

Every production service reports to the Sentry organisation `venturelabs`, and the cluster's
**error-triage agent** (`agent-cluster/agents/error-triage`) reads Sentry every 15 minutes:
it classifies new issues, turns small real bugs into Dev Manager fix tasks, files bigger ones
in the company's Notion ideas database and posts a daily digest to Slack `#errors`. **Nothing
sends e-mail.** A project is "done" when it looks like this:

```
Sentry project  <company>-<service>            e.g. loopstudio-backend, loopstudio-frontend
SDK             the one for the stack, see references/sentry-setup.md
DSN             from an environment variable / secret - never in git, never in a compose file
release         the git sha (or the build's version) set at build time
environment     live | staging | dev - set from the deploy context, never hard-coded "production"
source maps     uploaded in CI for every browser build (Nuxt, Vue), so frames resolve to source
noise filters   the standard ignore list from references/sentry-setup.md, plus denyUrls for extensions
alert rules     none that e-mail; the triage agent polls. (Slack/webhook rules are fine.)
registered      in agents/error-triage/config/projects.json with mode, site_id, company, repo
```

## Rules

- **DSNs and tokens come from the environment.** `SENTRY_DSN` at runtime, `SENTRY_AUTH_TOKEN` only
  in CI for source-map upload. If you find a DSN in a repo (MachineMaster still has several),
  move it out in the same task and say so in the PR.
- **Always set `release` and `environment`.** Without a release, stale-chunk errors after a
  deploy look like new bugs and the triage agent cannot tell versions apart.
- **Sample errors at 100 %, traces sparingly.** `tracesSampleRate` 0.1 or lower; performance data
  is not the goal here.
- **Filter noise at the SDK, not by ignoring issues by hand.** Use the standard list
  (bots on unknown routes, browser extensions, ad-blocker globals, stale chunks, connectivity,
  `ResizeObserver`). Never filter 5xx or our own exceptions.
- **Do not report every failed API response as an error in the client.** A GraphQL/HTTP 4xx the
  backend returned on purpose is not a frontend exception; capture it only when the client cannot
  handle it. The MachineMaster frontends violate this today (thousands of "Bad Request" events).
- **One Sentry project per deployable service**, named `<company>-<service>`, in the company's
  team. Dev/staging get the same project with `environment` set, not a second project, unless
  the dev environment is a different codebase.
- **No e-mail alert rules.** Sentry's own e-mails were switched off on 2026-09-05; the triage agent
  and its digest replace them. If you create a rule, point it at Slack or a webhook.
- **Register the project with the triage agent** (`config/projects.json`) in the same PR, with
  `company`/`repo` matching `agents/dev-manager/companies.json`, otherwise its issues are never
  seen.
- Never paste event payloads containing personal data (user names, addresses, form contents)
  into tickets, Notion rows or Slack; link the Sentry issue instead.

## Procedure for "add error tracking to <project>"

1. **Inventory:** which services deploy where (read the workspace `knowledge-base/architecture/deployment.md`),
   which already report (list `/api/0/projects/` with `SENTRY_AUTH_TOKEN`), which DSNs are in git.
2. **Create the Sentry projects** with the API (`references/sentry-setup.md` §Projects and DSNs) -
   one per service, platform set correctly - and put the DSNs into the env files / secret store
   of each deploy target (Netlify env vars, Cloud Build substitutions + k8s secrets, `.env` locally).
3. **Install the SDK per stack** from `references/sentry-setup.md` (Nuxt, Spring Boot, Neos Flow,
   Strapi). Copy the noise filter list. Set release + environment from the build.
4. **Source maps** for every browser build: the Sentry build plugin with `SENTRY_AUTH_TOKEN` in CI,
   `release` equal to the runtime release. Verify one event shows resolved frames.
5. **Prove it:** trigger one test error per service (`Sentry.captureMessage('sentry setup check')`)
   and confirm it arrives with release, environment and resolved frames.
6. **Register** the projects in `agents/error-triage/config/projects.json` (`mode: watch`).
7. **Document** the DSN variables in the repo's `.env.example` and the workspace `deployment.md`.

## Example (Nuxt frontend, the shape to copy)

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@sentry/nuxt/module'],
  sentry: { sourceMapsUploadOptions: { org: 'venturelabs', project: 'loopstudio-frontend', authToken: process.env.SENTRY_AUTH_TOKEN } },
  runtimeConfig: { public: { sentryDsn: process.env.SENTRY_DSN ?? '', sentryEnv: process.env.SENTRY_ENVIRONMENT ?? 'dev', release: process.env.COMMIT_SHA ?? 'local' } },
})
```

```ts
// sentry.client.config.ts (same for sentry.server.config.ts, without replay)
import * as Sentry from '@sentry/nuxt'
const cfg = useRuntimeConfig().public
if (cfg.sentryDsn) Sentry.init({
  dsn: cfg.sentryDsn, environment: cfg.sentryEnv, release: cfg.release,
  tracesSampleRate: 0.05,
  ignoreErrors: [/* the standard list from references/sentry-setup.md */],
  denyUrls: [/extensions\//i, /^chrome:\/\//i, /^chrome-extension:\/\//i, /^moz-extension:\/\//i],
})
```

Read `references/sentry-setup.md` for the other stacks, the standard noise list, the API calls for
projects and DSNs, and the registration snippet for the triage agent.
