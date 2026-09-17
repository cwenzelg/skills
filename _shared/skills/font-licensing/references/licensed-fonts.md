# Licensed fonts (bought or subscribed)

The registry of every font we pay for. A family that is not in `free-fonts.md` may ship only
when it has a row here whose "valid until" is in the future and whose scope covers the use.
Rows marked **to confirm** were seeded from what the repos show, not from an invoice; they
still need Christian's confirmation of holder, dates and scope.

| Font family | Vendor / licence type | Who bought it | Bought on | Valid until | Scope | Licence proof | Used on | Status |
|---|---|---|---|---|---|---|---|---|
| Sofia Pro | Adobe Fonts (Typekit) web kit `nyh3brn`, included in an Adobe Creative Cloud subscription | Christian Wenzel (to confirm) | to confirm | 2026-09-30 (subscription cancelled) | web, via the Typekit kit only; Adobe Fonts page-view allowance per kit; no self-hosting | Adobe account / Creative Cloud invoice (to confirm where filed) | venturelabs.team main site (`index.html` -> `use.typekit.net/nyh3brn.css`, `--font-sofia-pro`) | **replaced 2026-09-17** with self-hosted Figtree (Martin, case E) - PR https://github.com/venture-labs/landing-page/pull/8, status: PR open |
| Roc Grotesk (roc-grotesk) | Adobe Fonts (Typekit) web kit `uml1pam`, included in an Adobe Creative Cloud subscription | to confirm (MachineMaster / Christian) | to confirm | 2026-09-30 (subscription cancelled) | web, via the Typekit kit only. NOTE: `retailer-frontend`, `admin-frontend` and the vendored layer `machine-master-nuxt-foundation` (used by both `customer-frontend` and `global-platform-frontend`) also shipped self-hosted `Roc-Grotesk-*` files - Adobe Fonts does not allow self-hosting; those were an additional, independent licence problem | Adobe account / Creative Cloud invoice (to confirm where filed) | retailer.machinemaster.de landing page (`nuxt.config.ts` -> `use.typekit.net/uml1pam.css`, `--font-sans`), retailer-frontend theming (`Roc-Grotesk` in `variables.scss`), admin-frontend (`variables.scss`), customer-frontend + global-platform-frontend (`machine-master-nuxt-foundation/assets/css/roc-grotesk-font.css`, `utils/fontsUtils.ts` fontKey `roc-grotesk`) | **replaced 2026-09-17** with self-hosted Archivo everywhere (Martin, case B) - PRs: retailer-landing-page https://github.com/moerschen-venture/retailer-landing-page/pull/10, retailer-frontend https://github.com/moerschen-venture/retailer-frontend/pull/502, customer-frontend https://github.com/moerschen-venture/customer-frontend/pull/1115, global-platform-frontend https://github.com/moerschen-venture/global-platform-frontend/pull/364, admin-frontend https://github.com/moerschen-venture/admin-frontend/pull/508, status: all PRs open |
| Vista Sans (vista-sans-ot / Vista Sans OT) | Adobe Fonts (Typekit) web kit `uml1pam` (same kit as Roc Grotesk) | to confirm | to confirm | 2026-09-30 (subscription cancelled) | web, via the Typekit kit only | as above | retailer-frontend theming option (`vista-sans-ot`, unused - no matching font-face in that repo); self-hosted in customer-frontend + global-platform-frontend (`machine-master-nuxt-foundation/assets/css/vista-sans-ot-font.css`, `fontsUtils.ts` fontKey `vista-sans-ot`); self-hosted in tap2link-website (`assets/_typography.scss`, `custom-designs/moerschen.scss`, with a `local('Vista Sans OT')` hint) | **replaced 2026-09-17** with self-hosted Work Sans everywhere it was actually used (Martin, case C) - PRs: customer-frontend https://github.com/moerschen-venture/customer-frontend/pull/1115, global-platform-frontend https://github.com/moerschen-venture/global-platform-frontend/pull/364, tap2link-website https://github.com/tap2link/tap2link-website/pull/295, status: all PRs open (retailer-frontend's dropdown option left as a stable persisted key, see that PR) |
| Rundigsburg | Dharma Type via the same Adobe Fonts (Typekit) kit as Vista Sans OT, self-hosted without a licence that allows it | to confirm | to confirm | 2026-09-30 (subscription cancelled, on top of self-hosting already being out of scope) | web; no self-hosting allowed | none found | tap2link-website, TPN customer skin (`custom-designs/tpn.scss:4`) | **replaced 2026-09-17** with the Playfair Display already self-hosted in the same repo (Martin, case D) - PR https://github.com/tap2link/tap2link-website/pull/295, status: PR open |
| Thunder (Thunder-BoldLC) | Dharma Type, commercial font | unknown | unknown | unknown | unknown (a desktop licence would not cover a website) | none found | Loop Studio landing page, branch `feature/adopt-onlinemedianer-site` (`web/stil.css:22` @font-face, `web/fonts/Thunder-BoldLC.woff2`) - discarded branch, only appears in design/knowledge-base mockups, not in any live repo as of 2026-09-17 | **Martin confirmed 2026-09-11 (case A): licence is free, keep as is** - no replacement needed; not currently used in any live repo so there was nothing to ship in this pass |

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
