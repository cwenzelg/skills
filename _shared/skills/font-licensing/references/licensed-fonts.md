# Licensed fonts (bought or subscribed)

The registry of every font we pay for. A family that is not in `free-fonts.md` may ship only
when it has a row here whose "valid until" is in the future and whose scope covers the use.
Rows marked **to confirm** were seeded from what the repos show, not from an invoice; they
still need Christian's confirmation of holder, dates and scope.

| Font family | Vendor / licence type | Who bought it | Bought on | Valid until | Scope | Licence proof | Used on | Status |
|---|---|---|---|---|---|---|---|---|
| Sofia Pro | Adobe Fonts (Typekit) web kit `nyh3brn`, included in an Adobe Creative Cloud subscription | Christian Wenzel (to confirm) | to confirm | 2026-09-30 (subscription cancelled) | web, via the Typekit kit only; Adobe Fonts page-view allowance per kit; no self-hosting | Adobe account / Creative Cloud invoice (to confirm where filed) | venturelabs.team main site (`index.html` -> `use.typekit.net/nyh3brn.css`, `--font-sofia-pro`) | to be replaced before 2026-09-30 (board item `20260906-font-replace-vl`) |
| Roc Grotesk (roc-grotesk) | Adobe Fonts (Typekit) web kit `uml1pam`, included in an Adobe Creative Cloud subscription | to confirm (MachineMaster / Christian) | to confirm | 2026-09-30 (subscription cancelled) | web, via the Typekit kit only. NOTE: `retailer-frontend` also ships self-hosted `Roc-Grotesk-*.ttf/woff/woff2` files under `assets/fonts/` - Adobe Fonts does not allow self-hosting; those files are out of scope of this row (to confirm or replace) | Adobe account / Creative Cloud invoice (to confirm where filed) | retailer.machinemaster.de landing page (`nuxt.config.ts` -> `use.typekit.net/uml1pam.css`, `--font-sans`), retailer-frontend theming (`Roc-Grotesk` in `variables.scss`) | to be replaced before 2026-09-30 (board item `20260906-font-replace-mm`) |
| Vista Sans (vista-sans-ot) | Adobe Fonts (Typekit) web kit `uml1pam` (same kit as Roc Grotesk) | to confirm | to confirm | 2026-09-30 (subscription cancelled) | web, via the Typekit kit only | as above | retailer-frontend theming option (`vista-sans-ot`) | to be replaced before 2026-09-30 (board item `20260906-font-replace-mm`) |
| Thunder (Thunder-BoldLC) | Dharma Type, commercial font - licence unknown; came with the onlinemedianer.de example site | unknown | unknown | unknown | unknown (a desktop licence would not cover a website) | none found | Loop Studio landing page, branch `feature/adopt-onlinemedianer-site` (`web/stil.css:22` @font-face, `web/fonts/Thunder-BoldLC.woff2`) | **to confirm or replace** - counts as `unknown` until a licence is recorded |

## How a font gets into this list

Only two ways, no exceptions:

1. **The approval loop.** The Tester reports an `unknown` or `expired` font, the Dev Manager pauses
   the task (`awaiting-review`) and asks Christian in Slack. When he answers
   `licensed: <vendor>, bought <date>, valid until <date|subscription>, scope <web/desktop/app>`,
   the Dev Manager appends the row here (fields he did not give are "to confirm") and commits this
   file in the skills repo with the message `font-licensing: <family> licensed (Christian, <date>)`.
2. **Christian directly**, or a session acting on his explicit words, adds or edits a row by hand
   and commits it with the same message shape.

Every row must carry the validity period ("valid until" a date, or "subscription, valid while
active" plus who holds the subscription). A row without a validity is not a licence. When a
subscription ends, the row stays with the end date and a status note, so the history of what was
licensed when is never lost; the font itself has to be replaced before that date.

Never store the licence key, the kit's download token or the invoice itself here - only where
they live (account name, folder, ticket).
