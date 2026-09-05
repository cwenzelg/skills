# Sentry setup reference (per stack, noise list, API, triage registration)

Facts as of 2026-09-05. Organisation slug `venturelabs` (US region, API base `https://sentry.io/api/0`).
The org token lives in `agent-cluster/.env` as `SENTRY_AUTH_TOKEN` (scopes incl. project:write,
event:write, alerts:write); `SENTRY_ORG=venturelabs`.

## Standard noise list

Frontend `ignoreErrors` (regexes, copy verbatim):

```
/gtag is not defined/, /fbq is not defined/, /dataLayer is not defined/,
/\$ is not a function/, /jQuery is not defined/, /module is not defined/, /require is not defined/,
/ResizeObserver loop/, /ReportingObserver/, /Non-Error (promise rejection|exception) captured/,
/^Script error\.?$/, /__gCrWeb/, /instantSearchSDKJSBridge/,
/Loading (CSS )?chunk/, /dynamically imported module/, /Importing a module script failed/, /Unable to preload CSS/,
/Network Error/, /Failed to fetch/, /Load failed/, /NetworkError when attempting/, /The operation was aborted/, /AbortError/
```

Frontend `denyUrls`: `/extensions\//i, /^chrome:\/\//i, /^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-extension:\/\//i`.

Backend: do **not** report routing misses and format misses (bots): Flow `InvalidControllerException`,
`NoMatchingRouteException`, `InvalidActionNameException`, `InvalidTemplateResourceException`;
Spring `NoHandlerFoundException`, `HttpMediaTypeNotAcceptableException`, `HttpRequestMethodNotSupportedException`.
Report everything else, including 5xx and DB exceptions.

Do not wrap every failed HTTP/GraphQL response in a captured exception. Capture when the client
cannot recover (rendering fails), and add the status code as a tag so incidents (5xx storms) can be
grouped.

## Release and environment

- `release` = git sha (`COMMIT_SHA` in Cloud Build, `COMMIT_REF` on Netlify) or the app version.
- `environment` = `live` | `staging` | `dev` from the deploy context (`SENTRY_ENVIRONMENT` env var;
  Netlify: set per deploy context in the UI or `netlify.toml` `[context.*.environment]`).
- Local development: no DSN → SDK stays off (the init guards on an empty DSN).

## Stacks

### Nuxt 3 / Nuxt 4 (Vue)

`npm i @sentry/nuxt`; module `@sentry/nuxt/module`; `sentry.client.config.ts` + `sentry.server.config.ts`
(see the example in SKILL.md). Source maps: `sentry.sourceMapsUploadOptions` with `SENTRY_AUTH_TOKEN`
in the CI environment only; Nuxt sets `sourcemap: { client: 'hidden' }` automatically with the module.
Netlify: add `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_AUTH_TOKEN` (build-only) in the site's env vars.

### Nuxt 2 (legacy: MachineMaster retailer/admin tools)

`@nuxtjs/sentry` is already installed there; keep it, move the DSN to `SENTRY_DSN` env, add
`config.ignoreErrors` / `denyUrls` from the list above, set `release`/`environment` via
`clientConfig`/`serverConfig`. Do not migrate to `@sentry/nuxt` on Nuxt 2.

### Spring Boot 3 (Loop Studio backend)

```groovy
implementation 'io.sentry:sentry-spring-boot-starter-jakarta:8.+'
implementation 'io.sentry:sentry-logback:8.+'
```
```properties
# application.properties - values from env, never literals
sentry.dsn=${SENTRY_DSN:}
sentry.environment=${SENTRY_ENVIRONMENT:dev}
sentry.release=${COMMIT_SHA:local}
sentry.traces-sample-rate=0.05
sentry.send-default-pii=false
sentry.logging.minimum-event-level=error
```
Exclude routing misses: `sentry.exception-resolver-order=-2147483647` keeps Spring's handlers first;
add an `@ExceptionHandler` for `NoHandlerFoundException` that returns 404 without rethrowing.

### Neos Flow 8 (MachineMaster backend, honey backend, Tap2Link)

`flownative/sentry` is installed. Settings (`Configuration/Settings.yaml`, values from env):
```yaml
Flownative:
  Sentry:
    dsn: '%env:SENTRY_DSN%'
    environment: '%env:SENTRY_ENVIRONMENT%'
    release: '%env:SENTRY_RELEASE%'
    excludeExceptionTypes:
      - 'Neos\Flow\Mvc\Controller\Exception\InvalidControllerException'
      - 'Neos\Flow\Mvc\Exception\NoMatchingRouteException'
      - 'Neos\Flow\Mvc\Controller\Exception\InvalidActionNameException'
      - 'Neos\FluidAdaptor\View\Exception\InvalidTemplateResourceException'
```
Routing `Settings.Log.yaml` to the Sentry backend for *every* logger (as MachineMaster's dev cluster
does) floods Sentry with debug lines - keep the Sentry log backend at `error` and above.

### Strapi 4

`@strapi/plugin-sentry` with `dsn: env('SENTRY_DSN')`, `sendMetadata: true`, `init: { environment: env('SENTRY_ENVIRONMENT'), release: env('COMMIT_SHA') }`
in `config/plugins.js`. MachineMaster's copy hard-codes the DSN - move it.

### Static sites (landing pages on Netlify)

Only if the page runs meaningful JavaScript (forms, i18n routing): the Nuxt setup above with
`tracesSampleRate: 0`. Pure HTML/CSS pages get no Sentry.

## Projects and DSNs via the API

```bash
# team slugs
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" https://sentry.io/api/0/organizations/venturelabs/teams/ | jq -r '.[].slug'
# create a project (platform: javascript-nuxt | java-spring-boot | php | node | javascript-vue)
curl -s -X POST -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" -H "Content-Type: application/json" \
  https://sentry.io/api/0/teams/venturelabs/<team>/projects/ -d '{"name":"loopstudio-backend","slug":"loopstudio-backend","platform":"java-spring-boot"}'
# the DSN
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" https://sentry.io/api/0/projects/venturelabs/loopstudio-backend/keys/ | jq -r '.[0].dsn.public'
```
Delete the default e-mail alert rule the UI creates for new projects
(`GET /projects/venturelabs/<slug>/rules/`, then `DELETE .../rules/<id>/`), or create the project via
the API with `default_rules: false`.

## Register with the triage agent

`agent-cluster/agents/error-triage/config/projects.json`:
```json
"loopstudio-backend":  { "mode": "watch", "site_id": "loopstudio", "project": "loopstudio/backend",  "company": "loopstudio", "repo": "backend",  "kind": "backend" },
"loopstudio-frontend": { "mode": "watch", "site_id": "loopstudio", "project": "loopstudio/frontend", "company": "loopstudio", "repo": "frontend", "kind": "frontend" }
```
`company`/`repo` must be keys of `agents/dev-manager/companies.json`; without them the agent only
lists issues and never creates fix tasks. The agent re-reads the file on every poll.

## Verifying a setup

1. `Sentry.captureMessage('sentry setup check')` (or `throw new Error('sentry setup check')` in a
   route) on each deploy target.
2. In Sentry: the event carries `release`, `environment`, resolved in-app frames (frontend), and
   the project appears in the triage agent's next digest as a `real` issue - then resolve it.
