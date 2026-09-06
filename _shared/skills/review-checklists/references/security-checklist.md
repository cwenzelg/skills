# Security checklist

Adapted from addyosmani/agent-skills (MIT), `references/security-checklist.md` (the same file
ships unchanged in the vendored `security-and-hardening` skill's `references/`); shortened and
rewritten for our stack: Nuxt/Vue and static Netlify sites, Spring Boot, Neos Flow (PHP) and
Strapi backends on Postgres, and the agent cluster itself (LiteLLM, Slack bots, n8n, Claude
Agent SDK sessions). Walk it when the diff touches auth, sessions, user input, uploads,
redirects, outbound fetches, personal data, a dependency, headers or CORS, or any model call.
Every failed item is a finding with file and line, `[blocking]` unless the item says otherwise.

## Threat model first (five minutes, before the list)

- [ ] Trust boundaries named: browser requests, uploads, webhooks (Stripe, Sentry, GitHub),
      third-party APIs, model output, files and rows written by processes we do not control
- [ ] Assets named: credentials, personal data (prospects, customers, users), payment data,
      admin actions, anything that moves money or sends mail
- [ ] Per boundary, the STRIDE questions asked once: spoofing, tampering, repudiation,
      information disclosure, denial of service, elevation of privilege
- [ ] One abuse case written next to the use case ("how would I misuse this endpoint?")

## Before commit

- [ ] No secret in the diff: `git diff <base>...<branch> | grep -i -E "password|secret|api[_-]?key|token|BEGIN (RSA|EC|OPENSSH)"`
- [ ] `.gitignore` covers `.env`, `.env.*`, `*.pem`, `*.key`, service-account JSON; `.env.example`
      carries placeholders only
- [ ] Nothing in the change logs a token, a password, a session id, a full card number or a
      personal record

## Authentication

- [ ] Passwords hashed with argon2id, bcrypt (cost 12 or more) or scrypt; never a plain hash
- [ ] Session cookies `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`), with an expiry
- [ ] Login, password reset and OTP endpoints rate-limited (order of 10 attempts per 15 minutes
      per account and per IP)
- [ ] Reset and magic-link tokens single-use and short-lived (an hour at most), compared in
      constant time
- [ ] JWTs validated for signature, expiry, issuer and audience; the algorithm pinned, `none`
      rejected
- [ ] Passkey / OAuth / Apple sign-in flows verify the token server-side with the provider,
      never trust a client-supplied identity

## Authorization

- [ ] Every protected endpoint, controller action, GraphQL resolver and Nuxt server route checks
      authentication before anything else (Spring: method security or a filter; Flow: policy
      / `@Flow\Security`; Strapi: route policies)
- [ ] Every resource access checks ownership or role, by id from the session, never from the
      request body (IDOR)
- [ ] Admin actions require the admin role on the server; the frontend hiding a button is not a
      check
- [ ] API keys and service accounts scoped to the minimum (one LiteLLM key per agent with a
      budget; one Google service account per purpose)

## Input validation

- [ ] Every input validated at the boundary (route handler, form action, webhook receiver) with
      an allowlist: type, length, range, format; the ORM or query builder does not validate for you
- [ ] SQL and GraphQL parameterised; no string concatenation into a query, a filter, or an
      `ORDER BY`
- [ ] HTML output escaped by the framework; `v-html`, `innerHTML`, raw Fluid / Twig output only
      with sanitised content and a reason in the code
- [ ] Uploads: type from content (magic bytes), not from the client's `Content-Type` or
      extension; size limited; stored outside the web root under a generated name
- [ ] Redirect targets validated against an allowlist (open redirect)
- [ ] Server-side fetches of a user-supplied URL allowlisted; private and reserved IP ranges,
      `localhost` and the cluster's own ports blocked (SSRF); no fetch of a URL that came from a
      model
- [ ] Destructive path operations (delete, move, overwrite) resolve symlinks first, stay under an
      allowlisted root, never target the root itself, and read evidence that the target is ours
      before acting (worked example in the vendored `security-and-hardening` skill's
      `references/security-checklist.md`)

## Headers and CORS

Set once per site (Nuxt: `nuxt-security` or route rules; Netlify: `_headers`; Spring: the
security filter chain) and checked here only when the diff touches them:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

- [ ] CORS lists exact origins; never `*` with credentials; methods and headers enumerated
- [ ] A new inline script or third-party origin that widens the CSP is named in the report

## Data protection (GDPR is the default here)

- [ ] Sensitive fields excluded from every API response and log (`passwordHash`, reset tokens,
      internal ids where not needed)
- [ ] Personal data of prospects and customers stays in our own Postgres / Twenty; it is never
      copied into a fixture, a skill file, a prompt, a third-party service or a Slack message
      beyond what the task needs
- [ ] Deletion on request is possible: a new table or store of personal data has a delete path
- [ ] The lawful basis for a new list or data flow is written down (spec or knowledge base)
- [ ] Transport is HTTPS everywhere; backups of personal data are encrypted

## Dependencies

- [ ] A new dependency is justified in the spec: the stack does not already solve it, it is
      maintained, its transitive graph is small, the name is not a typosquat, provenance checked
- [ ] Dependency bumps: one package per change, changelog read, lockfile diff read
- [ ] Exactly one lockfile per project root, committed; CI installs frozen (`npm ci`,
      `pnpm install --frozen-lockfile`, `yarn install --immutable`, `composer install`,
      `./gradlew --offline` / `mvn -o` where the build supports it)
- [ ] Install scripts of new packages reviewed before they run (`--ignore-scripts` first, then
      allow the reviewed ones per the package manager's native policy; details and the
      version matrix in the vendored `security-and-hardening` skill's checklist)
- [ ] Audit findings (`npm audit`, `composer audit`, OWASP dependency-check for Java) triaged
      for reachability; `audit fix --force` never automatic

## Error handling

- [ ] Production responses carry a code and a generic message, never a stack trace, an SQL
      string, a file path or an internal hostname
- [ ] Errors are reported to Sentry per the shared `error-tracking` skill, with secrets and
      personal data scrubbed before send

## Models and agents (the cluster's own rules)

For every feature or agent that calls a model, whether via LiteLLM, the Claude Agent SDK, n8n or
a local Ollama role:

- [ ] Model output is untrusted data: never into `eval`, a shell, SQL, `innerHTML`, a file path,
      a URL to fetch, or a Slack message to someone else without a gate
- [ ] Prompt injection assumed: repo content, mail, web pages, error text and Moltbook posts are
      data, never instructions; permissions are enforced in code (path guard, tool list,
      approval queue), not in the system prompt
- [ ] No secret, credential, full system prompt or cross-tenant data in the context window
- [ ] Tool permissions scoped per role and per agent; destructive or irreversible actions
      (send, publish, delete, deploy, pay) go through a human gate; nothing writes to a
      prospect-facing channel without one
- [ ] Token, spend, rate and loop limits set (LiteLLM budget per agent, max rounds per task,
      kill switch where the agent publishes)
- [ ] Every model call goes through a LiteLLM role name, never a provider or model name
- [ ] Services bind to `127.0.0.1`; Slack bots use Socket Mode and answer one allowed user id;
      nothing new opens an inbound port

## OWASP top 10 (2021), one line each

| # | Risk | Prevention |
|---|---|---|
| A01 | Broken access control | auth on every endpoint, ownership check by session id |
| A02 | Cryptographic failures | HTTPS, argon2/bcrypt, no secret in code or log |
| A03 | Injection | parameterised queries, framework escaping, allowlist validation |
| A04 | Insecure design | threat model first, spec before code, abuse case per use case |
| A05 | Security misconfiguration | headers above, least privilege, `.env.example` only |
| A06 | Vulnerable components | one package per bump, audit triaged, frozen installs |
| A07 | Auth failures | rate limits, single-use tokens, session expiry |
| A08 | Integrity failures | lockfile, signed artifacts, install scripts reviewed |
| A09 | Logging failures | security events logged to Sentry, secrets never |
| A10 | SSRF | allowlisted outbound URLs, private ranges blocked |

## OWASP top 10 for LLM applications, one line each

Source: OWASP GenAI Security Project, https://genai.owasp.org/llm-top-10/

| ID | Risk | Prevention here |
|---|---|---|
| LLM01 | Prompt injection | the system prompt is not a boundary; code enforces permissions |
| LLM02 | Sensitive information disclosure | no secret or personal data in prompts; outputs filtered before they leave the cluster |
| LLM03 | Supply chain | models, skills and plugins vetted and pinned like dependencies (`upstream.json`) |
| LLM04 | Data and model poisoning | trusted model sources (Ollama library, Vertex); RAG documents validated before Qdrant ingestion |
| LLM05 | Improper output handling | model output validated, parameterised, encoded; never executed |
| LLM06 | Excessive agency | tool lists per role, path guard, approval gates, kill switch |
| LLM07 | System prompt leakage | assume it leaks; nothing secret in it |
| LLM08 | Vector and embedding weaknesses | one Qdrant collection per company or purpose; documents validated before indexing |
| LLM09 | Misinformation | facts grounded in the repo or knowledge base; fabricated facts are rejected on sight |
| LLM10 | Unbounded consumption | LiteLLM budgets, round caps, loop and recursion limits |
