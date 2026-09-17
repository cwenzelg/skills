---
name: font-licensing
description: Font licence rule for every public site and app - which fonts are free for commercial use, which ones we bought or subscribe to (vendor, date, validity), and what to do with a font that is neither. Use whenever a task adds, changes, reviews or tests fonts, @font-face rules, Google Fonts / Adobe Fonts (Typekit) links, font files (woff/woff2/ttf/otf), CSS font variables, or asks whether a font may be used commercially, even if the user just says "the font", "the typeface" or "the headline style".
---

# Font licensing

**The rule:** every font family on a public site, app or client deliverable is either in
`references/free-fonts.md` (free for commercial use, licence named) or in
`references/licensed-fonts.md` (bought or subscribed, with vendor, date and validity). A font
that is in neither list, or whose licence has expired, must not ship: it is a spec-level block,
never an implementation failure, and never a judgement call for an agent. Never assume a licence.

## Verdict per font family (the output shape)

Whenever you check fonts, end with this table and one finding per unknown or expired font:

```markdown
## Fonts
| Family | Where (file:line or URL) | Status | Licence / validity |
|---|---|---|---|
| Inter | app/assets/css/main.css:5 (fonts.googleapis.com) | free | OFL 1.1 (Google Fonts) |
| Sofia Pro | index.html:14 (use.typekit.net/nyh3brn.css) | licensed | Adobe Fonts, valid until 2026-09-30 |
| Thunder | web/stil.css:22 (@font-face, fonts/Thunder-BoldLC.woff2) | free | free for commercial use (stated by Christian, free list) |
| Proxima Nova | web/stil.css:30 (@font-face, fonts/ProximaNova.woff2) | unknown | not in either list |

- font licence needed: Proxima Nova (web/stil.css:30)
```

Status values, exactly these: `free` | `licensed` | `unknown` | `expired`. System fallbacks
(`system-ui`, `ui-sans-serif`, `sans-serif`, `serif`, `monospace`, `Arial`, `Helvetica`,
`Georgia`, `Times`, `Impact`, `Courier`) need no row; they ship with the reader's OS.

## How to find every font in a repo or a diff

Search the changed files (or the whole repo when asked) for all of these; fonts hide in more
than one place:

- `font-family` declarations and CSS variables that carry them (`--font-sans`, `--display`,
  `$heading-font-family`, Tailwind `fontFamily` in `tailwind.config.*`, `theme.fonts` objects)
- `@font-face` blocks and their `src: url(...)` targets
- links and preconnects to `fonts.googleapis.com`, `fonts.gstatic.com`, `use.typekit.net`,
  `p.typekit.net`, `fonts.bunny.net`, `cdn.fonts.net`, `fast.fonts.net`
- font files anywhere in the tree: `*.woff`, `*.woff2`, `*.ttf`, `*.otf`, `*.eot`, and base64
  `data:font/` blobs inside HTML or CSS
- Nuxt/Next config heads (`app.head.link`), `@nuxtjs/google-fonts`, `next/font`, `@fontsource/*`
  packages in `package.json`, Vite/Webpack font plugins
- design tokens (`design/PROJECT.md`, `tokens.json`) that name a brand font

One grep that catches most of it:

```
rg -n -i "font-family|@font-face|fonts\.googleapis|fonts\.gstatic|typekit|fontsource|\.(woff2?|ttf|otf|eot)\b" --glob '!node_modules' --glob '!dist' --glob '!.nuxt' --glob '!.output'
```

Normalise the family name before you look it up: `'Roc-Grotesk'`, `roc-grotesk` and
`Roc Grotesk` are the same family. Variable-font suffixes (`Inter Variable`, `InterVariable`)
belong to the base family.

## Classify

1. **free** - the family is in `references/free-fonts.md`, or it is loaded from
   `fonts.googleapis.com` (every family Google Fonts serves is OFL, Apache or UFL). Note the
   licence from the table. A Google Fonts family that is *self-hosted* is still free: the OFL
   allows bundling; keep the licence text next to the files when the repo has one. The free list's
   last table, "Free for commercial use, stated by a person", counts exactly like the others: a
   font somebody on the team declared free needs no vendor, no purchase date and no expiry.
2. **licensed** - the family is in `references/licensed-fonts.md`. Check the "valid until" cell
   against today's date and the "scope" cell against the use (a desktop licence does not cover a
   website; a web kit does not cover self-hosted `.ttf` copies of the same family). Valid and in
   scope: `licensed`, quote the validity. Past its date, or the use is out of scope: `expired`.
3. **unknown** - everything else. Also unknown: a font that "came with" a template, an example
   site, a theme, or a designer's export, unless that source's own licence is in the free list.

## On an unknown or expired font

- Do not remove, swap, or self-host it on your own initiative. Report it: the `## Fonts` table
  plus the finding `font licence needed: <family> (<where>)`.
- In the dev pipeline the Dev Manager pauses the task (`awaiting-review`) and asks Christian in
  Slack. His answer is one of:
  - `free` (or "it is free for commercial use") - nothing was bought, so there is no vendor and no
    date: the family goes on `references/free-fonts.md` under the name of whoever said so, and the
    task continues. Never ask for a `licensed:` line for a font the person says is free;
  - `licensed: <vendor>, bought <date>, valid until <date|subscription>, scope <web/desktop/app>`
    - the family is appended to `references/licensed-fonts.md` with the timeline, and the task
    continues;
  - `replace with <free font>` - the Implementer swaps the family for the named free font;
  - `drop` - the Implementer removes the font and falls back to the stack's next family.
- Interactive sessions ask Christian the same question and record his answer themselves: a free
  font in `references/free-fonts.md` (stated-free table), a bought one in
  `references/licensed-fonts.md` (see "How a font gets into this list" there). A project's dev desk
  records a free font with its `record_free_font` tool in the turn the person says so.
- The Reviewer does not approve a change while any font in its diff is `unknown` or `expired`.

## Always / never

- Always classify every family the diff introduces *or references*, including fallbacks that
  are real fonts (`'Instrument Sans'` in a fallback stack is a font, `sans-serif` is not).
- Always quote where the font is used (file:line or the kit URL) so the answer can be acted on.
- Never treat "it was already there before my change" as a licence; report it as pre-existing
  and unknown so it lands on the board once, then move on.
- Never copy a font file from one project to another; the licence was bought per site or per
  kit, not per company.
- Never put a licence key, kit token that unlocks downloads, or invoice PDF into a repo or a
  skill file; the registry names *where* the proof lives, not the proof.
