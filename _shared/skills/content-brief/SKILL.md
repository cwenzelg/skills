---
name: content-brief
description: The brief a search-and-conversion watcher hands a content agent so it can draft one blog post or topic page - search intent and query cluster (from Search Console, no paid tools), the page it supports and the call to action it ends on, internal links, outline, the claims allowed and forbidden, topics already covered, languages and their order - plus the rules against scaled, thin or invented content. Use whenever a task writes, checks or consumes a content brief, requests a blog post for traffic, turns search queries into an article idea, decides whether a query deserves a new post or a change to an existing page, or drafts from such a brief - even if it only says "write a blog post for SEO", "we need more traffic on X" or "brief the content agent".
---

# Content brief

One brief = one piece (a blog post or a topic page). The watcher writes it from measured search
data; the content agent drafts from it; a person edits and approves; publishing is a separate,
human-merged step. The brief is internal and needs no approval itself.

## Output: the brief

Exactly these headings, in this order. Every field is filled or says `none` - never left out.

```markdown
# Brief: <working title>

Site: example.de | Languages: de, en (first language is written first, the second is a translation)
Reason: <the measured reason - a Search Console query cluster, a page with impressions but few clicks, a topic gap; with its numbers and the date range>
Intent: <informational | commercial | transactional | navigational> - <one sentence: what the searcher wants to have when they leave>
Query cluster: <3-10 real queries from Search Console with impressions, or `none yet` for a new topic>
Supports page: <the existing page this piece feeds, e.g. /de/leistungen/x>
CTA: <the one call to action it ends on, and where it points>
Internal links: to <pages this piece links to> | from <pages that should link to it once published>
Outline:
1. <h2 - what the section answers>
2. ...
Claims allowed: <facts the company can stand behind, with their source: a case, a measured number, a published offer>
Claims forbidden: <what must not be said: invented results, client names without consent, guarantees, prices not on the site>
Already covered: <existing posts/pages on this topic - link them, say how this one differs, or stop>
Length: <a range in words, set by the intent, never by a target keyword density>
Format: <the site's file format, e.g. a markdown file with frontmatter per language>
```

## Rules

- **A brief needs a measured reason.** A query or page reason from Search Console (or a clearly
  named gap against existing pages) with its numbers. No reason, no brief.
- **New piece or better page?** If an existing page already targets the intent, propose improving
  that page instead of a new post - two pages for one intent compete with each other
  (cannibalisation).
- **One intent per piece.** A cluster with two intents is two briefs, or one brief and one "no".
- **Real experience only.** Every piece must carry something only this company can say - a case,
  a number it measured, a decision it made and why. A piece that any model could write without the
  company adds nothing and is the kind of scaled content search engines demote.
- **Volume cap.** At most two briefs a week per site. More output is not more traffic.
- **No invented facts.** No statistics, client names, quotes or results that the brief's sources
  do not contain. A client stays anonymous unless the company named them for publication.
- **Languages.** Write the languages in the order the company's conventions set (its context
  skill says which comes first). The second language is a faithful translation, not a new text.
- **The CTA is the page's own.** Use the call to action the supported page already has; a new CTA
  is a proposal for the page, not part of a post.
- **No paid tools, no search result scraping.** Query data comes from Search Console; search
  volume estimates from paid tools are not used. Never fetch search result pages.

## Deriving intent from Search Console (no paid tools)

1. Export queries for the site, 28 days, with impressions, clicks and average position per page.
2. Group queries that share their main noun phrase and would be satisfied by the same page.
3. Per group: which page ranks (the query's landing page), at which position, with what click
   rate. Position 5-20 with impressions and few clicks = the page is relevant but weak: improve it.
   Impressions on a page that does not answer the query = a gap: a brief.
4. Name the intent from the wording: "what is / how" informational, "best / vs / cost"
   commercial, "book / hire / price" transactional, brand name navigational.
5. Open `content-strategy` for clusters by buyer stage and `seo-audit` for on-page rules; read
   `seo-reporting` for how the brief's reason appears in the digest.

## Example (shortened)

```markdown
# Brief: Wann lohnt sich ein KI-Assistent fuer Angebote?

Site: example.de | Languages: de, en
Reason: 14 queries around "ki angebot erstellen" with 410 impressions, 6 clicks, average position 11.4 (2026-09-15 to 2026-10-12); landing page /de/leistungen/automatisierung does not answer the question.
Intent: commercial - a small-business owner wants to know if it pays off and what it takes.
Query cluster: ki angebot erstellen (180), angebote automatisieren ki (95), ...
Supports page: /de/leistungen/automatisierung
CTA: the page's "Erstgespraech buchen" link
Internal links: to /de/leistungen/automatisierung, /de/blog/ki-im-vertrieb | from /de/leistungen/automatisierung
Outline:
1. Woran man merkt, dass Angebote zu lange dauern
2. Was ein Assistent uebernimmt und was nicht
3. Ein echter Fall: vorher / nachher (anonymisiert)
4. Was es kostet und wann es sich nicht lohnt
Claims allowed: the anonymised case in the company's case file (time per offer 3 h -> 40 min, measured over 6 weeks)
Claims forbidden: guaranteed savings, the client's name, prices not on the site
Already covered: /de/blog/ki-im-vertrieb (general, no offer process) - this one is narrower
Length: 900-1,300 words
Format: content/blog/<slug>.md + <slug>.en.md with the site's frontmatter
```
