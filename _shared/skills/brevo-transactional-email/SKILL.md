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
4. **Whether dev and live share one Brevo account** - check the API key each environment uses (or
   ask). Sharing an account does NOT mean sharing a template: this account's own convention (see
   below) keeps a separate dev and live copy of every template, by name, in the one account.
5. **The account's naming convention (Christian, 2026-09-18)** - `GET /v3/smtp/templates`
   (paginated, `limit`/`offset`) before creating anything, and follow the scheme below exactly.
   Some older templates predate it (Loop Studio's `LS - Password recovery - EN`, MachineMaster's
   `MM-financing-...`) - those are legacy, never renamed, and not a pattern to copy for a new
   template.

## Naming: `<Project>-dev-<Name>` and `<Project>-live-<Name>`

Taken from an existing convention already in the account (e.g. `OH2-dev-LetterBox-New` /
`OH2-live-LetterBox-New`, another project's templates). Every NEW template gets both a dev and a
live name, project-prefixed:

- `<Project>` is the venture's short code - `LS` for Loop Studio, `MM` for MachineMaster; a new
  venture's override skill states its own.
- `<Name>` is the purpose, in whatever casing/separators that venture's own templates already use;
  keep a per-language suffix as part of `<Name>` (e.g. `...-de`, `...-en`) where the project sends
  different templates per language.
- The **dev** template (`<Project>-dev-<Name>`) is the one the Implementer creates and edits
  during a task - upsert it as often as the task needs.
- The **live** template (`<Project>-live-<Name>`) is **only ever a copy of the dev one**, made at
  promotion time (see below) - never created by hand, never edited directly in Brevo's UI, and
  never touched by an ordinary implementation task.

## Templates as code (the layout)

Absent a project convention that says otherwise, lay a template out as:

```
<templates-root>/<name>/
  template.html     # the Brevo template body - use {{ params.foo }} placeholders
  subject.txt        # one line, may also use {{ params.foo }}
  meta.json           # { "templateName": "<Project>-dev-<Name>", "sender": { "name": "...", "email": "..." }, "isActive": true }
```

`<templates-root>` is wherever the project keeps generated/config-like assets next to the code
that uses them - e.g. a Java/Spring backend under
`src/main/resources/email-templates/<name>/`, adapt for another stack's own resource convention.
`<name>` (the folder) is the bare purpose, e.g. `password-recovery`; `meta.json`'s `templateName`
is the FULL **dev** Brevo name (`<Project>-dev-<Name>`, see the naming scheme above) - the repo
only ever names the dev template. The live counterpart is derived from it by the `promote` script
mode below, never written by hand.

## The script: `upsert` (dev) and `promote` (dev -> live)

Copy this into the project's own repo (e.g. `tools/brevo-template.mjs`) the first time a task
needs it - do not duplicate it a second time inside a project's own skill or knowledge-base doc;
point back here instead. Node 18+, no dependencies beyond `fetch` (built in).

```js
#!/usr/bin/env node
// Upsert a dev Brevo template, or promote an existing dev template to its live counterpart, from
// templates-as-code (see the brevo-transactional-email skill). BREVO_API_KEY comes from the
// environment only - never accept it as an argument, never print it.
//
// Naming (Christian, 2026-09-18, from an existing account convention, e.g. "OH2-dev-LetterBox-New"
// / "OH2-live-LetterBox-New"): every template is "<Project>-dev-<Name>" or
// "<Project>-live-<Name>". meta.json's templateName always names the DEV template - this script's
// `upsert` mode only ever creates/updates dev. The live template is only ever a byte-for-byte copy
// of the dev one, made by `promote`, never hand-edited in Brevo's UI.
//
// Usage:
//   node brevo-template.mjs upsert <dir>                       # create/update the dev template
//   node brevo-template.mjs promote <dir> [--ids-file <path>]  # copy dev -> live
//   node brevo-template.mjs promote --all <templates-root> [--ids-file <path>]
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const apiKey = process.env.BREVO_API_KEY;
if (!apiKey) {
  console.error('BREVO_API_KEY is not set in the environment - refusing to run.');
  process.exit(1);
}
const headers = { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' };

async function findByName(name) {
  let offset = 0;
  const limit = 50;
  for (;;) {
    const res = await fetch(`https://api.brevo.com/v3/smtp/templates?limit=${limit}&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`GET /v3/smtp/templates failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    const hit = (body.templates ?? []).find((t) => t.name === name);
    if (hit) return hit;
    if ((body.templates ?? []).length < limit) return undefined;
    offset += limit;
  }
}

async function getTemplate(id) {
  const res = await fetch(`https://api.brevo.com/v3/smtp/templates/${id}`, { headers });
  if (!res.ok) throw new Error(`GET /v3/smtp/templates/${id} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function upsertByName(payload) {
  const existing = await findByName(payload.templateName);
  const url = existing ? `https://api.brevo.com/v3/smtp/templates/${existing.id}` : 'https://api.brevo.com/v3/smtp/templates';
  const method = existing ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status} ${await res.text()}`);
  return existing ? existing.id : (await res.json()).id;
}

function readLocalTemplate(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const htmlContent = readFileSync(join(dir, 'template.html'), 'utf8');
  const subject = readFileSync(join(dir, 'subject.txt'), 'utf8').trim();
  return { templateName: meta.templateName, subject, htmlContent, sender: meta.sender, isActive: meta.isActive ?? true };
}

function writeIdsFile(idsFile, name, id) {
  if (!idsFile) return;
  const current = existsSync(idsFile) ? JSON.parse(readFileSync(idsFile, 'utf8')) : {};
  current[name] = id;
  writeFileSync(idsFile, JSON.stringify(current, null, 2) + '\n');
}

async function upsertOne(dir) {
  const payload = readLocalTemplate(dir);
  if (!payload.templateName.includes('-dev-')) {
    throw new Error(`meta.json templateName "${payload.templateName}" is not a dev name (expected "<Project>-dev-<Name>")`);
  }
  const id = await upsertByName(payload);
  console.log(`upsert: "${payload.templateName}" -> id ${id}`);
  return id;
}

async function promoteOne(dir, idsFile) {
  const devName = readLocalTemplate(dir).templateName;
  if (!devName.includes('-dev-')) throw new Error(`"${devName}" is not a dev template name - refusing to promote`);
  const liveName = devName.replace('-dev-', '-live-');
  const dev = await findByName(devName);
  if (!dev) throw new Error(`dev template "${devName}" does not exist in Brevo yet - run upsert first`);
  const devFull = await getTemplate(dev.id); // the LIVE source of truth is what is actually live in Brevo's dev template right now, not the local files
  const liveId = await upsertByName({ templateName: liveName, subject: devFull.subject, htmlContent: devFull.htmlContent, sender: devFull.sender, isActive: true });
  console.log(`promote: "${devName}" (id ${dev.id}) -> "${liveName}" (id ${liveId})`);
  writeIdsFile(idsFile, basename(dir), liveId);
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const idsFlagIdx = args.indexOf('--ids-file');
  const idsFile = idsFlagIdx >= 0 ? args[idsFlagIdx + 1] : undefined;
  const positional = args.slice(1).filter((_, i) => i + 1 !== idsFlagIdx && i + 1 !== idsFlagIdx + 1);

  if (mode === 'upsert') {
    await upsertOne(positional[0]);
  } else if (mode === 'promote' && positional[0] === '--all') {
    const root = positional[1];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) await promoteOne(join(root, entry.name), idsFile);
    }
  } else if (mode === 'promote') {
    await promoteOne(positional[0], idsFile);
  } else {
    console.error('usage: node brevo-template.mjs upsert <dir> | promote <dir> [--ids-file <path>] | promote --all <templates-root> [--ids-file <path>]');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
```

Run `upsert`, take the printed dev id, and write it into the project's own template-id config
**the way that project already selects templates** (see "Investigate first" above) - never a new
file or mechanism, unless the project's override skill says the project is changing that
convention to a per-environment one (see "Environments: dev and live" below).

## Environments: dev and live

A normal implementation task only ever touches the **dev** template - write the files, run
`upsert`, wire the printed dev id into whatever config the project's dev profile reads. It never
runs `promote` and never creates or edits a live template.

**Promotion** (`promote`) happens once, on the release branch, right before the merge to main -
after the dev template has been through a task's normal review, not as part of implementing a
feature. It reads the CURRENT content of the dev template from Brevo (not the local files - the
dev template in Brevo is the thing that was actually tested), writes an identical live template
under `<Project>-live-<Name>`, and updates the live id into whatever config the project's live
profile reads (`--ids-file` if the project's build reads a small JSON id map; otherwise by hand
following the project's own convention). A project's own override skill or knowledge-base doc says
whether the dev desk files this as its own release task or Christian runs it himself - either way,
**a live template is never edited directly in Brevo's UI**, and never created by anything other
than `promote` acting on an already-reviewed dev template.

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

A task that adds or changes a template is done only once:
1. `GET /v3/smtp/templates/{id}` (same `BREVO_API_KEY`) returns a **dev** template whose `name`
   matches `meta.json`'s `templateName` exactly (`<Project>-dev-<Name>`), and
2. the project's dev config carries that same id.

This proves the dev template exists and was actually pushed - it does not prove the rendered HTML
looks right; say so explicitly rather than claiming a visual check that did not happen. An
ordinary task's Tester run must **not** find a `<Project>-live-<Name>` template that did not exist
before the task - if one exists, the Implementer ran `promote` when it shouldn't have; flag it as
a floor-style finding, not a pass.

## Never

- Never print, log, or write `BREVO_API_KEY` (or any Brevo key) into a file, commit, spec, or
  Slack message.
- Never invent a second way to select a template id when the project already has one.
- Never create or edit a `<Project>-live-<Name>` template from an ordinary implementation task -
  only `promote`, run at release time, ever touches a live template, and it only ever copies an
  already-reviewed dev template rather than writing new content.
- Never hand-edit a live template directly in Brevo's UI - if a live template ever needs to
  change, change the dev one and promote again.
