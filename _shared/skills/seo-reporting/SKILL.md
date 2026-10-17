---
name: seo-reporting
description: How a recurring SEO and conversion watch reports on a website - the weekly digest shape, the metric definitions (booking rate, CTA click rate, organic visits), how findings are fingerprinted, repeated and closed, how a proposal states one change with its metric, baseline and review window, the small-traffic rule for experiments (before/after, never a fake A/B), and which other SEO skill to open for what. Use whenever a task writes, reviews or ranks an SEO digest, a website report, a weekly site check, findings or proposals for a site's search traffic or calls to action, a client website panel, or an experiment verdict - even if it only says "the site report", "what changed on the website this week" or "why are bookings down".
---

# SEO reporting

The house rules for turning a site's measurements into something a person can act on. This skill
decides the **shape and the honesty** of a report. What to check comes from other skills (table at
the end). The output is short: a reader on a phone must see in ten seconds what changed and what is
asked of them.

## Output: the weekly digest

Five blocks, in this order, nothing else. Empty blocks are one line ("no change"), never dropped.

```markdown
*SEO watch - example.de - week 2026-W42* (dry run)

*1. Numbers* (this week / last week / 4 weeks ago)
- Pages crawled: 50 / 50 / -
- Lighthouse mobile performance (home): 61 / 64 / -
- Booking rate: not measured - tracking access missing (blocker F-9e01aa)

*2. Findings* - 3 new, 1 fixed, 9 open
- NEW should-fix F-3a91c2 Page text missing from the HTML before JavaScript runs on 48 of 50 pages
- NEW should-fix F-77c2d0 /de/blog/x: no meta description
- FIXED F-12be4f sitemap listed /en/old

*3. Proposals* (at most 3)
- P1 (from F-3a91c2) Prerender the page body, not only the head. Metric: pages with text in the raw HTML, baseline 2 of 50, review +14 days.

*4. Briefs requested* - none

*5. Experiments due* - none
```

## Rules for every number

- **A number in the digest comes from the measured snapshot, never from a model.** A model may
  rank, group and word findings; it never writes a number the snapshot does not contain. Code
  checks this and rejects a digest whose numbers are not in the snapshot.
- Missing data is said, never estimated: "not measured - <why>". A tracking gap (script missing,
  analytics API refuses, a goal never fires) is itself a **blocker finding**, because every later
  number would be wrong without anyone noticing.
- Compare against last week and against 4 weeks ago. One week up or down on small traffic is noise
  - say "within noise" rather than inventing a trend.
- Aggregate counts only. No IP addresses, no form contents, no names of people who booked.

## Metric definitions

| Metric | Definition | Source |
|---|---|---|
| Booking rate (the target) | bookings / unique visitors x 1,000, per week | booking notifications counted (count, date, booking page only) / analytics visitors |
| CTA click rate | unique visitors with a booking-link click event / unique visitors | analytics goal (e.g. `Call Link Clicked`) |
| Lead rate | verified form submissions / unique visitors | form provider counts, never the fields |
| Organic visits | analytics visits with source Google (or another search engine) | analytics sources; cross-check with Search Console clicks |
| Search visibility | impressions, clicks, average position per query and page | Search Console (2-3 days lag; say so) |
| Technical health | open findings by severity; pages with body text in the raw HTML; Lighthouse lab scores (mobile first) | own crawl, local Lighthouse |

Bookings and leads sit **above** clicks in every report: clicks that do not become bookings are noise
(Goodhart).

## Findings

- A finding is mechanical: an id, a severity (`blocker | should-fix | note`, the scale of
  `marketing-site-compliance`), the evidence (URL, what was measured) and since when it is seen.
- Its id is a **fingerprint** of what it is about (check + page or element), never of its wording,
  so the same problem keeps its id from week to week.
- It repeats every week until it is fixed or a person explicitly accepts it. It is never dropped
  silently. A finding not seen in a run in which its check actually ran closes itself as `fixed`
  (a check that did not run closes nothing); seen again later it reopens under the same id.
- A regression that costs traffic now (site down, `noindex` on a live page, sitemap gone, the
  booking link broken, a form gone) is posted at once, once per incident - not held for Monday.

## Proposals

- One change, one page, one measurable reason. Name the finding or the number it comes from, the
  metric it should move, the baseline and the review window.
- At most 3 per digest, ranked by expected effect on the target metric, then by effort.
- A proposal is a suggestion. It becomes work only when a person says yes to it; the watcher never
  edits a site, files a task or publishes anything by itself.

## Experiments on small traffic

- Under about 1,000 visitors per week and page, a split test cannot reach significance. Use
  **before/after with long windows**: a 28-day baseline, reviews at +14 and +28 days, one change per
  page at a time.
- The verdict is one of `improved | no measurable effect | worse`, with the numbers and the sample
  size. "No measurable effect" is an honest and common result; say it.
- The sample-size reasoning is in the `ab-testing` skill; open it before calling anything a test.

## House overrides for the vendored SEO skills

The upstream skills below were written for many teams. Where they say otherwise, this wins:

- **No paid SEO tools.** Ahrefs, Semrush, Sistrix, Screaming Frog, DataForSEO and AI-visibility
  trackers are out. Use the own crawl, local Lighthouse, Search Console and the analytics account.
- **Never fetch search result pages** (Google, Bing) or query AI assistants from automation - it
  breaks their terms. A manual check of AI answers is a person's step, if at all.
- Where an upstream skill asks for a `product-marketing-context` file, read the company's own
  context skill instead (offer, audience, voice).
- Never submit sitemaps, request indexing or change anything in Search Console or analytics from
  automation - propose it; a person does it.

## Which skill for what

| Question | Skill |
|---|---|
| Technical and legal basics, the mechanical audit (`site-audit.mjs`, `check-links.mjs`) | `marketing-site-compliance` |
| Indexation, rendering, on-page, hreflang, E-E-A-T | `seo-audit` |
| Readable for AI answer engines (page text without JavaScript, extractable passages) | `ai-seo` |
| Structured data (JSON-LD) | `schema` |
| Calls to action, forms, page conversion | `cro` |
| Experiments, sample size | `ab-testing` |
| Topics, clusters, intent by buyer stage | `content-strategy` |
| A brief for a blog post or topic page | `content-brief` |

## Client reports (later)

A client panel uses the same metric definitions and the same honesty rules, shows 4 weeks instead
of 1, leaves out internal ids, and only covers a site with the client's written agreement and their
own analytics and Search Console access.
