---
name: marketing-site-compliance
description: Standing checklist for every public marketing website (landing pages, company sites, product pages) - SEO and technical basics (robots, sitemap, canonical/hreflang, titles, Open Graph, Core Web Vitals, broken links, redirects, TLS, 404, favicon), German legal-page presence (Impressum with the §5 DDG fields, Datenschutzerklaerung naming every third party the page really loads, cookie banner only where non-essential storage exists and only if it blocks until consent, AGB/Widerruf where something is sold, contact-form privacy notice), accessibility spot checks and cross-page consistency. Use whenever a task audits, checks, reviews or "goes over" a website or landing page, asks whether a site needs a cookie banner, whether the Impressum or Datenschutz is complete, whether the SEO basics are in place, before a DNS cutover or launch, or for a recurring site check - even if the user does not say compliance, SEO, or name a law. Legal checks are presence and consistency checks, never legal advice.
---

# Marketing-site compliance checklist

One list for every public marketing surface, independent of the project. It answers "is the
site technically and legally *present* the way it must be" - it does not judge legal wording. An
audit walks all 27 checks against **production** (never a deploy preview or branch), records the
raw output of every check next to its verdict, and ends with the block below. The evidence is the
output, not the verdict.

## Output (the shape an audit ends with)

One block per site. Blockers first, then should-fix, then notes; pass / n-a / not-run collapsed to
one line each at the end. Every row points at the recorded evidence.

```markdown
## Site: https://example.de - audited 2026-09-08, production

| id | check | verdict | severity | evidence | fix effort | who decides |
|---|---|---|---|---|---|---|
| S8 | HTTP -> HTTPS redirect | fail | blocker | evidence.md#S8 | Netlify redirect rule, 10 min | dev task |
| L2 | Impressum §5 DDG fields | fail | blocker (presence) | evidence.md#L2 | add Registergericht + HRB number | Christian -> lawyer for wording |
| L4 | Datenschutz names loaded third parties | fail | should-fix (presence) | evidence.md#L4 | name Calendly + Google Fonts, or self-host the fonts | lawyer |
| S6 | Core Web Vitals (mobile) | fail | should-fix | evidence.md#S6 | hero video poster + lazy load | dev task |
| A3 | heading order | fail | note | evidence.md#A3 | two h1 on /leistungen | dev task |
| S1 S2 S3 S5 S9 S10 S11 L1 L3 L5 L6 L8 A1 A2 A4 A5 C1 C2 C3 | pass | | evidence.md | | |
| L7 | AGB / Widerruf | n-a | | evidence.md#L7 - nothing sold online, CTA is a Calendly call | | |

Not judged: S7 external links (12 hosts timed out - rerun), L5 HttpOnly cookies set by third-party
scripts (invisible to document.cookie; curl Set-Cookie checked for the first response only).
```

- Verdicts: `pass` | `fail` | `n-a` (does not apply - say why) | `not-run` (could not execute - say why).
- Severity only on `fail`: `blocker` | `should-fix` | `note`. Legal rows add `(presence)`.
- `who decides`: `dev task` | `Christian` | `lawyer`. Every legal wording question is `lawyer`.

## The one rule above all

Every legal finding is a **presence and consistency** finding: a page or a field is there or not,
two pages agree or not, a third party that the page loads is named in the Datenschutzerklaerung or
not. The skill never judges whether wording is sufficient, never proposes legal text, never says a
site "is compliant" or "is not compliant". Cite the statutory field from
`references/legal-pages-de.md`, say what is present or missing, and stop - a lawyer decides wording
and whether a conditional field applies.

## Procedure

1. **Frame:** production URL, language(s) and their routes, whether anything is sold online (this
   decides L7), which company owns the site (decides the legal list - German law for a German company
   regardless of page language).
2. **Routes:** `node scripts/check-links.mjs https://SITE --max 30 --out links.json` - uses
   `sitemap.xml` `<loc>`s when the sitemap is real, else crawls same-origin links from `/` to depth 2.
   Its `routes[]` is the route list for S3-S5; its `broken[]` is S7.
3. **Group (a) SEO & technical** with curl, openssl, the PageSpeed API and the script - no browser
   state involved, run first.
4. **Group (b) legal** in a **fresh browser context**, in this order and before any click: load
   home -> list cookies + storage (L5) -> list network hosts (L4) -> banner screenshot and, only
   then, accept and list again (L6) -> legal pages (L1-L3, L7, L8). Read `references/browser-snippets.md`
   for the exact `browser_evaluate` snippets and `references/third-parties.md` for the host -> vendor
   and cookie-name tables.
5. **Group (c) accessibility** on home, the Impressum page and one content page.
6. **Group (d) consistency** across Impressum, Datenschutz, footer and AGB (if any).
7. **Write the output block**, then the `Not judged:` line - a check that was not run is listed with
   its reason, never dropped. Record every command and its raw output (an `evidence.md` with one
   anchor per check id, screenshots and JSON next to it).

## The checks

Tool tags: `[curl]` `[openssl]` `[node]` (the script or a `node -e` one-liner) `[psi]` (PageSpeed
Insights API, free, no key for low volume) `[browser]` (Playwright MCP: `browser_navigate`,
`browser_evaluate`, `browser_network_requests`, `browser_take_screenshot`, `browser_press_key`,
`browser_click`) `[read]` (a human or model reads the page text against a field list) `[dns]` (`nslookup`).

### (a) SEO & technical

| id | check | how | pass when | severity on fail |
|---|---|---|---|---|
| S1 | robots.txt | `[curl]` `curl -sS -D - -o robots.txt https://SITE/robots.txt` | 200, `text/plain`, a `User-agent:` line, no HTML; `Sitemap:` line present (absent = extra note) | should-fix (404, or the SPA shell = missing) |
| S2 | sitemap.xml | `[curl]` `curl -sS -D - -o sitemap.xml https://SITE/sitemap.xml`; `[node]` the script parses it and fetches every `<loc>` | 200, well-formed XML, every `<loc>` 200, every canonical route once, none twice | should-fix |
| S3 | canonical + hreflang per route | `[browser]` `meta()` on every route | exactly one absolute self-referencing `link[rel=canonical]` (or the preferred language variant); bilingual site: full reciprocal hreflang set incl. `x-default` on every route; single-language: hreflang n-a | should-fix |
| S4 | unique title / description | same `meta()` run, compared across routes | title 10-65 chars and description 50-165 chars on every route, none duplicated | should-fix (missing / duplicate), note (length) |
| S5 | Open Graph / Twitter card | same run; `[curl]` `curl -sSI OG_IMAGE_URL` | `og:title`, `og:description`, `og:image` (absolute, 200, `image/*`), `og:url`, `twitter:card` on home and every top-level route | should-fix (`og:image`), note (others) |
| S6 | Core Web Vitals | `[psi]` `curl -sS "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://SITE/&strategy=mobile&category=performance" -o psi-mobile.json` and `strategy=desktop`; `[node]` extract `loadingExperience.metrics` (field) and `lighthouseResult.audits` LCP / CLS / TBT + `categories.performance.score` (lab) | field: LCP <= 2.5 s, CLS <= 0.1, INP <= 200 ms; lab: LCP <= 2.5 s, CLS <= 0.1, TBT <= 200 ms, score >= 90 | should-fix (mobile), note (desktop only, or no field data) |
| S7 | broken links | `[node]` `links.json` -> `broken[]`; `[browser]` `legalLinks()` on home for rendered-only anchors | no internal 4xx/5xx, no `href="#"` / empty href on a legal or nav link; external 4xx listed | should-fix (internal or a dead legal link), note (external) |
| S8 | HTTP -> HTTPS, www/apex | `[curl]` for `http://SITE`, `http://www.SITE`, `https://www.SITE`, `https://SITE`: `curl -sS -o /dev/null -L -w "%{url_effective} %{http_code} redirects=%{num_redirects}\n" URL`, plus `-I` per hop | all four end on one https host, http hops 301/308, <= 2 hops | blocker (http not redirected), should-fix (www/apex split, 302) |
| S9 | TLS | `[openssl]` `echo \| openssl s_client -connect SITE:443 -servername SITE 2>/dev/null \| openssl x509 -noout -subject -issuer -dates -ext subjectAltName`; `[curl]` `curl -sSI https://SITE \| grep -i strict-transport` | chain verifies, `notAfter` > 14 days, SAN covers apex + www; HSTS present (absent = note) | blocker (invalid / < 14 d), note (no HSTS) |
| S10 | 404 page | `[curl]` `curl -sS -o 404.html -w "%{http_code}\n" https://SITE/this-page-does-not-exist-$(date +%Y%m%d)` | HTTP 404 with a real not-found page | should-fix (200 soft 404 / SPA fallthrough) |
| S11 | favicon | `[browser]` `meta().icons`; `[curl]` `curl -sSI https://SITE/favicon.ico` | one icon link resolving 200, or `/favicon.ico` 200 | note |

### (b) Legal - sites of German companies (DDG / DSGVO / TDDDG / UWG)

For a site owned by a non-German company mark L1-L8 `n-a: applicable law not checked` - do not
apply this list by analogy.

| id | check | how | pass when | severity on fail |
|---|---|---|---|---|
| L1 | Impressum reachable from every page | `[browser]` `legalLinks()` on every route (or, if the footer is identical, on home + two sampled routes + all legal pages - say which) -> navigate the target; screenshot of the footer on home | a link labelled Impressum / Imprint / Legal notice in the persistent footer or nav on every route, one click, target 200 | blocker (presence) |
| L2 | Impressum §5 DDG fields | `[read]` navigate the Impressum -> `legalText()` -> tick `references/legal-pages-de.md` "Impressum" field by field; screenshot | every mandatory field for the legal form present (GmbH: name + form, address, e-mail + a second fast channel, Vertretungsberechtigte, Registergericht + number, USt-IdNr if one exists, V.i.S.d.P. where there is editorial content) | blocker (presence) for a mandatory field; note for a conditional field whose applicability is unknown |
| L3 | Datenschutz reachable from every page | as L1 with `/datenschutz\|privacy/i` | same | blocker (presence) |
| L4 | Datenschutz names every third party actually loaded | `[browser]` fresh context -> navigate home -> wait 5 s -> scroll to bottom -> wait 3 s -> `browser_network_requests` -> unique third-party registrable domains (drop the site's own host and its hosting host) -> map each to a vendor with `references/third-parties.md` -> `legalText()` on the Datenschutz page -> search vendor name **or** host, case-insensitive | every loaded third party named (hosting provider included); vendors named but not loaded = note | should-fix (presence) per unnamed vendor - cite Art. 13 (1) e DSGVO; for remote Google Fonts add one line of context (LG Muenchen I, 3 O 17493/20, 2022), no verdict |
| L5 | cookies / storage before consent | same fresh load, **before any click**: `[browser]` `cookiesAndStorage()`; `[curl]` `curl -sSI https://SITE/ \| grep -i set-cookie` (HttpOnly cookies are invisible to `document.cookie`) -> classify every key with the table in `references/third-parties.md` | only essential keys, or none | blocker (presence) - a non-essential key with no banner, or set before accept despite a banner (§25 TDDDG); note for an unclassified key |
| L6 | banner blocks until consent | if a banner exists: screenshot it; L4's host list = before; `browser_click` accept -> wait 3 s -> `browser_network_requests` = after; diff; note whether reject is one click | no non-essential host (table column) before accept. No banner and no non-essential storage = `pass: no banner needed` | blocker (presence) for a non-essential host before accept; note for reject harder than accept, or a banner although nothing non-essential is set |
| L7 | AGB / Widerruf / Preisangaben | `[node]` `links.json` routes matching `/checkout\|cart\|warenkorb\|bestell\|shop\|kaufen\|order/i`; `[browser]` L4 hosts for Stripe / PayPal / Shopify; `[read]` any price with a buy or order button | nothing sold online -> `n-a` (say what the CTA is); sold online -> AGB + Widerrufsbelehrung + Muster-Widerrufsformular reachable before ordering, prices incl. USt, order button per §312j BGB | blocker (presence) when selling online and a page is missing |
| L8 | contact-form privacy notice | `[browser]` `formsPrivacy()` on every route with a form | every form carries a privacy line or checkbox referencing the Datenschutzerklaerung and a purpose text; newsletter forms mention double opt-in (§7 UWG) | should-fix (presence) |

### (c) Accessibility spot checks - home, Impressum, one content page

| id | check | how | pass when | severity on fail |
|---|---|---|---|---|
| A1 | `lang` attribute | `[browser]` `document.documentElement.lang` per route, compared with the page language and hreflang | present and matching (`de` on German pages, `en` on English) | should-fix |
| A2 | alt on hero / case images | `[browser]` `imagesWithoutAlt()` | every content image in hero, case, team sections has a non-empty `alt`; decorative ones `alt=""` | should-fix (count + first five `src`) |
| A3 | heading order | `[browser]` `headings()` | exactly one `h1`, no level skipped downward | should-fix (no or several `h1`), note (skipped level) |
| A4 | focus visibility | `[browser]` `browser_press_key Tab` x5 from the top of home, `focusStyle()` after each, screenshot at Tab 3 | the focused element shows an outline or focus box-shadow and is the visually expected element | should-fix |
| A5 | contrast of the primary CTA | `[browser]` `ctaContrast()` on the hero CTA (and the banner's accept button if any) | ratio >= 4.5:1 (>= 3:1 for text >= 24 px or bold >= 19 px) | should-fix |

### (d) Consistency

| id | check | how | pass when | severity on fail |
|---|---|---|---|---|
| C1 | name / legal form / address identical | `[read]` `legalText()` on Impressum, Datenschutz, AGB (if any) + footer on home -> the identity block from each, side by side in the evidence | identical name, legal form, street, postcode, city, register data wherever repeated | should-fix (presence) - a lawyer says which one is right |
| C2 | e-mail addresses resolve | `[browser]` `mailto:` anchors + addresses in `legalText()`; `[dns]` `nslookup -type=MX DOMAIN` per address domain; `nslookup -type=TXT DOMAIN` and `nslookup -type=TXT _dmarc.DOMAIN` for the site's own domain | every address domain has MX; SPF + DMARC exist (absent = note; no test mail is sent) | should-fix (no MX), note (no SPF / DMARC) |
| C3 | phone present or deliberately absent | `[read]` Impressum + footer | recorded either way; absence is fine when a form or phone exists as the second fast channel (L2) | note only |

## Always / never

- Always record the raw output next to the verdict; a verdict without its command and output is not a check.
- Always list every check that was not run, with the reason, in `Not judged:` - never drop one silently, never turn `not-run` into `pass`.
- Always audit production. Name a pending PR or branch only where a finding will change with it.
- Always record the pre-consent cookie / storage / host listing **before** any click on the page.
- Always say which routes were covered and how they were found (sitemap or crawl, cap).
- Never fix anything while auditing - report; the owner decides what becomes a task.
- Never submit a form, send a mail, or accept a banner twice in the same context.
- Never propose legal wording, never say "compliant" - presence, consistency, statutory field, "lawyer decides".
- Never reuse a browser profile between sites; if it cannot be made fresh, say so and mark L5 / L6 `not-run`.

Read `references/legal-pages-de.md` for the field lists and statutory sources,
`references/third-parties.md` for the host -> vendor and cookie-name tables, and
`references/browser-snippets.md` for the `browser_evaluate` snippets; run `scripts/check-links.mjs`
for the route list and the link check.
