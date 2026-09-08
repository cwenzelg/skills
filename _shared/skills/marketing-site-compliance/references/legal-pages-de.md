# German legal pages - field lists with the statutory source (presence checks only)

Every entry here is a **presence check**: the audit says whether the field / page / name is there.
A lawyer decides the wording, and whether a conditional field applies to this company. Statute
names change (TMG -> DDG on 2024-05-14, TTDSG -> TDDDG on 2024-05-14); last reviewed 2026-09-08.

## Impressum (Anbieterkennzeichnung) - §5 DDG, §18 Abs. 2 MStV

Reachability rule (§5 Abs. 1 DDG): "leicht erkennbar, unmittelbar erreichbar und staendig
verfuegbar" - in practice a link labelled Impressum in the persistent footer or navigation of every
page, one click away. (Check L1.)

| field | source | mandatory for | presence check |
|---|---|---|---|
| Name and legal form (e.g. "Venture Labs GmbH") | §5 Abs. 1 Nr. 1 DDG | everyone | company name with its legal form suffix present |
| Ladungsfaehige Anschrift (street, number, postcode, city - no P.O. box) | §5 Abs. 1 Nr. 1 DDG | everyone | a full postal address present |
| Vertretungsberechtigte (Geschaeftsfuehrer for GmbH / UG, Vorstand for AG) | §5 Abs. 1 Nr. 1 DDG | legal persons | at least one named natural person as representative |
| E-mail address | §5 Abs. 1 Nr. 2 DDG | everyone | an e-mail address present (as text or mailto) |
| Second fast contact channel (phone or a contact form; "schnelle elektronische Kontaktaufnahme und unmittelbare Kommunikation") | §5 Abs. 1 Nr. 2 DDG, case law on "unmittelbar" | everyone | a phone number or a working contact form present |
| Supervisory authority (Aufsichtsbehoerde) | §5 Abs. 1 Nr. 3 DDG | activities needing official approval | n-a unless the business is regulated |
| Registergericht + register number (HRB / HRA / VR / GnR) | §5 Abs. 1 Nr. 4 DDG | registered companies | court and number present |
| Chamber, professional title, state of award, professional rules | §5 Abs. 1 Nr. 5 DDG | regulated professions | n-a for a software / consulting GmbH |
| USt-IdNr (§27a UStG) or Wirtschafts-Identifikationsnummer | §5 Abs. 1 Nr. 6 DDG | if one has been issued | present, or the audit notes "not shown - has one?" |
| Liquidation / winding-up note | §5 Abs. 1 Nr. 7 DDG | AG / KGaA / GmbH in liquidation | n-a normally |
| Verantwortlicher i.S.d. §18 Abs. 2 MStV (name + address) | §18 Abs. 2 MStV | journalistic-editorial content (blog, news, magazine) | present on sites with a blog; note when there is a blog but no V.i.S.d.P. |
| OS platform link / Verbraucherstreitbeilegung note (§36 VSBG) | §36 VSBG; the EU ODR platform was discontinued in 2025 | businesses with consumer contracts online | note only: a stale ODR link is a note, not a finding |

## Datenschutzerklaerung - Art. 12-14 DSGVO, §25 TDDDG

Reachability: linked from every page, one click (Art. 12 Abs. 1 DSGVO "leicht zugaenglich"). (Check L3.)

Structure the text must have (Art. 13 DSGVO) - checked as **headings / sections present**, not as
wording:

| section | source | presence check |
|---|---|---|
| Verantwortlicher with name, address, e-mail | Art. 13 Abs. 1 a | present and identical to the Impressum (see C1) |
| Datenschutzbeauftragter contact | Art. 13 Abs. 1 b, Art. 37 | only if appointed - note when absent |
| Purposes and legal basis per processing (hosting/log files, contact form, newsletter, analytics, embeds) | Art. 13 Abs. 1 c, Art. 6 Abs. 1 | a purpose + legal-basis section exists |
| Recipients / categories of recipients, incl. the hosting provider and every embedded service | Art. 13 Abs. 1 e | every third party the page loads is named (check L4) |
| Third-country transfer + mechanism (adequacy decision / DPF / SCC) | Art. 13 Abs. 1 f, Art. 44 ff. | a transfer section exists when a US vendor is loaded |
| Storage period | Art. 13 Abs. 2 a | present |
| Data-subject rights (access, rectification, erasure, restriction, portability, objection) | Art. 13 Abs. 2 b-c, Art. 15-21 | present |
| Right to lodge a complaint with a supervisory authority | Art. 13 Abs. 2 d, Art. 77 | present |
| Withdrawal of consent | Art. 13 Abs. 2 c, Art. 7 Abs. 3 | present when consent is used (banner, newsletter) |
| Cookies / storage section | §25 TDDDG, Art. 6 | present when any cookie or storage is set |

**Third parties that must be named**: see `third-parties.md`. The audit's L4 check compares the
hosts the page actually contacts with the vendor names in the text - a host loaded but not named is
a presence finding; a vendor named but not loaded is a note (stale text).

**Cookie banner rule as applied by this skill (§25 TDDDG, Art. 6 Abs. 1 a DSGVO):**

- Consent is required before any cookie or storage that is **not strictly necessary** for the
  service the visitor asked for. Strictly necessary: session, CSRF, load balancing, language
  choice, the consent state itself, a shopping cart. Not necessary: analytics, marketing pixels,
  A/B testing, embedded players that set identifiers, fonts / CDNs that set cookies.
- A site that sets nothing non-essential **needs no banner**. A banner on such a site is a note
  ("banner without need"), not a finding.
- If a banner exists it must actually block: no non-essential cookie / storage and no request to a
  tracking or embed host before the visitor accepts (check L5 + L6).
- Whether "reject" must be as easy as "accept" is a design and case-law question; the audit
  records it (one click or not) as a note.

Context line for remote Google Fonts (one line, no verdict): LG Muenchen I, judgment of 2022-01-20,
3 O 17493/20, treated the transfer of a visitor's IP address to Google via remotely loaded fonts
without consent as a GDPR violation. The audit only reports whether the fonts are loaded remotely
and whether the text names Google Fonts.

## AGB, Widerrufsbelehrung, Preisangaben - only where something is sold online

Applies when a consumer can conclude a contract on the site (checkout, order form, paid booking).
A site whose CTA is a call booking, a contact form or a free quiz sells nothing online -> L7 `n-a`.

| item | source | presence check |
|---|---|---|
| AGB reachable before the order is placed | §305 Abs. 2 BGB | link from the order flow and the footer |
| Widerrufsbelehrung for consumers | §312g, §355 BGB, Art. 246a §1 Abs. 2 EGBGB | page present, linked from the order flow |
| Muster-Widerrufsformular | Art. 246a §1 Abs. 2 Nr. 1 EGBGB, Anlage 2 | present |
| Pre-contract information (main characteristics, total price, duration, termination) | §312d BGB, Art. 246a EGBGB | present near the order button |
| Button labelled "zahlungspflichtig bestellen" or equally unambiguous | §312j Abs. 3 BGB | button text checked |
| Total price incl. USt and shipping, per unit where applicable | §1, §3, §4 PAngV | prices shown as Gesamtpreis incl. USt; B2B-only sites may show net prices with a clear B2B statement (note) |

## Contact form and newsletter

| item | source | presence check |
|---|---|---|
| Privacy notice at the form (link to the Datenschutzerklaerung + purpose) | Art. 13 DSGVO (information at the time of collection) | a line, link or checkbox at the form |
| Newsletter: double opt-in and purpose | §7 Abs. 2 Nr. 2 UWG (consent), Art. 7 DSGVO (proof) | text mentions confirmation mail / double opt-in |
| No pre-ticked consent boxes | Art. 4 Nr. 11, Art. 7 DSGVO; BGH I ZR 7/16 (Planet49) | checkboxes unchecked by default |

## Consistency across pages (check C1)

Name, legal form, street, postcode, city and register data must be identical wherever they appear:
Impressum, Datenschutz "Verantwortlicher", footer, AGB §1. A mismatch is a presence / consistency
finding; which version is correct is for the owner and, for the legal pages, a lawyer.
