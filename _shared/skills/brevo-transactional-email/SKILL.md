---
name: brevo-transactional-email
description: How to add or change a Brevo transactional email template as code, for any project that sends app mail through Brevo's numeric-template-id API - password recovery, e-mail confirmation, invites, offer/reservation notices, reminders, or any other transactional mail. Use whenever a task creates, edits, or investigates a Brevo template, a transactional email, an e-mail sent by numeric template id, "the pipeline can't create Brevo templates" style blockers, or a company's own Brevo-related override skill points here.
---

# Brevo transactional email, as code

Company-neutral. A project's own override skill (e.g. `loopstudio-transactional-email`,
`machinemaster-transactional-email`) carries that project's facts - where its template ids
live, which service class sends mail, sender identity - and points back here for the mechanism.
If no override skill exists yet for the project at hand, read this skill, then find those facts
yourself the way the "Investigate first" section below describes, before assuming this generic
layout applies unchanged.

## Why this exists

Brevo (formerly Sendinblue) transactional email is selected by a **numeric template id** at send
time (`sendEmail(templateId, to, name, params)` or equivalent) - the template's subject and HTML
body live in Brevo's own dashboard, not in the app's repo. Until this skill, creating or changing
a template needed a human to click through the Brevo UI - "someone has to create it in Brevo, the
pipeline can't do that." It can, once the template is **checked into the repo as code** and a
script pushes it to Brevo via the API.

**One Brevo account can, and here does, hold every venture's templates.** Verified 2026-09-18: a
single Venture Labs GmbH account carries all of them - Loop Studio's prefixed `LS - ...` and
MachineMaster's `MM-...`, ~289 templates total. That changes what "investigate first" means below:
a name collision is a real risk, and creating a template blind (without checking what already
exists) can silently shadow another venture's template of a similar name.

## Investigate first

Before writing anything, find in the project's own code or knowledge base:
1. **Where existing template ids are referenced** - a properties/config file, an enum, a database
   column, a settings file. Whatever that convention already is, a new template's id goes there
   too - never invent a second selection mechanism next to an existing one.
2. **The send call** - the function/class that actually calls Brevo's send-email endpoint, so you
   know the exact shape of `params` the template's `{{ params.x }}` placeholders must match.
3. **Sender identity** - most projects reuse one sender name/email across templates. Read it off
   an existing template via the API (`GET /v3/smtp/templates/{id}`) rather than guessing, or from
   the project's override skill if it already names one.
4. **Whether dev and live share one Brevo account** - check the API key each environment uses. If
   they share a key (compare the two keys' hash, never their plaintext, or ask), they share every
   template id too: one template, one id, both environments.
5. **The account's existing naming convention** - `GET /v3/smtp/templates` (paginated, `limit`/
   `offset`) before creating anything. In the shared Venture Labs account, each venture prefixes
   its own templates so they never collide with another venture's in the same account: Loop
   Studio uses `LS - <purpose> - <lang>` (e.g. `LS - Password recovery - EN`), MachineMaster uses
   `MM-<purpose>[-<lang>]` (e.g. `MM-financing-...`, `MM-purchase-...`). A new template follows
   whichever prefix its own venture already uses - check the project's override skill for the
   exact form, and when genuinely unsure, look at that venture's existing templates in the list
   rather than guessing a new scheme.

## Templates as code (the layout)

Absent a project convention that says otherwise, lay a template out as:

```
<templates-root>/<name>/
  template.html     # the Brevo template body - use {{ params.foo }} placeholders
  subject.txt        # one line, may also use {{ params.foo }}
  meta.json           # { "templateName": "...", "sender": { "name": "...", "email": "..." }, "isActive": true }
```

`<templates-root>` is wherever the project keeps generated/config-like assets next to the code
that uses them - e.g. a Java/Spring backend under
`src/main/resources/email-templates/<name>/`, adapt for another stack's own resource convention.
`meta.json`'s `templateName` is Brevo's own template name (shown in its dashboard, used to find
an existing template by name so re-running the script updates rather than duplicates it).

## The upsert script

Copy this into the project's own repo (e.g. `tools/brevo-template.mjs`) the first time a task
needs it - do not duplicate it a second time inside a project's own skill or knowledge-base doc;
point back here instead. Node 18+, no dependencies beyond `fetch` (built in).

```js
#!/usr/bin/env node
// Upsert a Brevo transactional template from templates-as-code (see the brevo-transactional-email
// skill). Usage: node tools/brevo-template.mjs <templates-root>/<name>
// Reads BREVO_API_KEY from the environment - never accepts it as an argument, never prints it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node brevo-template.mjs <path to template folder>');
  process.exit(1);
}
const apiKey = process.env.BREVO_API_KEY;
if (!apiKey) {
  console.error('BREVO_API_KEY is not set in the environment - refusing to run.');
  process.exit(1);
}

const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
const htmlContent = readFileSync(join(dir, 'template.html'), 'utf8');
const subject = readFileSync(join(dir, 'subject.txt'), 'utf8').trim();

const headers = { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' };

async function findExisting(name) {
  let offset = 0;
  const limit = 50;
  for (;;) {
    const res = await fetch(`https://api.brevo.com/v3/smtp/templates?limit=${limit}&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`GET /v3/smtp/templates failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    const hit = (body.templates ?? []).find((t) => t.name === name);
    if (hit) return hit.id;
    if ((body.templates ?? []).length < limit) return undefined;
    offset += limit;
  }
}

async function main() {
  const payload = {
    templateName: meta.templateName,
    subject,
    htmlContent,
    sender: meta.sender,
    isActive: meta.isActive ?? true,
  };
  const existingId = await findExisting(meta.templateName);
  const url = existingId ? `https://api.brevo.com/v3/smtp/templates/${existingId}` : 'https://api.brevo.com/v3/smtp/templates';
  const method = existingId ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status} ${await res.text()}`);
  const id = existingId ?? (await res.json()).id;
  console.log(`Brevo template "${meta.templateName}" -> id ${id}`);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
```

Run it, take the printed id, and write it into the project's own template-id config **the way
that project already selects templates** (see "Investigate first" above) - never a new file or
mechanism.

## Getting the key into a Dev Manager task

The Implementer/Tester need `BREVO_API_KEY` in their environment to run the script above. The Dev
Manager's `companies.json` supports this per company via a `roleEnv` map:

```json
"roleEnv": { "BREVO_API_KEY": "BREVO_API_KEY_<COMPANY>" }
```

This exposes the cluster's `.env` variable named on the right to that company's Implementer and
Tester sessions only, under the name on the left. When several companies share one Brevo account
(the Venture Labs case, both `loopstudio` and `machinemaster` today), they map to the SAME
right-hand-side variable - `"roleEnv": { "BREVO_API_KEY": "BREVO_API_KEY" }` on each. A venture
with its own separate account gets its own distinct cluster variable
(`BREVO_API_KEY_<VENTURE>`) on the right instead. Architect, Reviewer, Designer and Judgment
Tester never see it - they are read-only by design. The value is never logged, never written to
the task record, and never appears in a Slack report. If the variable this points to is unset, the
role session simply does not get `BREVO_API_KEY` (one warning in the Dev Manager's own log, not a
crash) - the Implementer's report should say the key was missing rather than guessing at one.

## The Tester's check

A task that adds or changes a template is done only once `GET /v3/smtp/templates/{id}` (same
`BREVO_API_KEY`) returns a template whose `name` matches `meta.json`'s `templateName`. This proves
the template exists and was actually pushed - it does not prove the rendered HTML looks right;
say so explicitly rather than claiming a visual check that did not happen.

## Never

- Never print, log, or write `BREVO_API_KEY` (or any Brevo key) into a file, commit, spec, or
  Slack message.
- Never invent a second way to select a template id when the project already has one.
- Never assume dev and live use different accounts without checking - most projects here share
  one Brevo account across environments, which means one template id serves both.
