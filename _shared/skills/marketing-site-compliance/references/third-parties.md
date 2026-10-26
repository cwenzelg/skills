# Third parties that need naming, and cookie / storage classification

Used by checks L4 (hosts loaded vs. vendors named in the Datenschutzerklaerung), L5 (keys set
before consent) and L6 (hosts contacted before accept). Match on the registrable domain
(eTLD+1, e.g. `googleapis.com`) of every request the page makes; a host not in this table is
listed as "unknown - identify before the audit closes" and counts as unnamed until identified.

## Host -> vendor

`essential?` = whether the request is usually strictly necessary for the page the visitor asked for
(so it may happen before consent). `name in text` = what the Datenschutz text is searched for
(vendor name **or** host, case-insensitive; any hit = named).

| host pattern | vendor | what it does | essential? | name in text | typical keys | device access |
|---|---|---|---|---|---|---|
| `fonts.googleapis.com`, `fonts.gstatic.com` | Google Fonts (remote) | web fonts from Google's CDN; visitor IP reaches Google | no (self-hosting avoids the transfer) | "Google Fonts", "fonts.googleapis" | none | unknown |
| `google-analytics.com`, `analytics.google.com`, `googletagmanager.com`, `*.doubleclick.net`, `www.google.com/pagead`, `www.google.com/ccm` | Google Analytics / Tag Manager / Ads | analytics, tag container, ads, conversion pixels | no | "Google Analytics", "Tag Manager", "Google Ads" | `_ga`, `_ga_*`, `_gid`, `_gat`, `_gcl_au`, `_gcl_ls` | cookies |
| `www.google.com/recaptcha`, `www.gstatic.com/recaptcha` | Google reCAPTCHA | bot check on forms | no | "reCAPTCHA" | `_GRECAPTCHA` | cookies |
| `maps.googleapis.com`, `maps.gstatic.com` | Google Maps | embedded map | no | "Google Maps" | `NID` (google.com) | cookies |
| `plausible.io`, `*.plausible.io` | Plausible Analytics | cookieless analytics (EU) | no, but sets no identifier | "Plausible" | none | none, [plausible.io/data-policy](https://plausible.io/data-policy): "We do not use cookies, browser cache or local storage." |
| `connect.facebook.net`, `www.facebook.com/tr` | Meta Pixel | marketing pixel | no | "Meta", "Facebook Pixel" | `_fbp`, `_fbc` | cookies |
| `snap.licdn.com`, `px.ads.linkedin.com` | LinkedIn Insight Tag | marketing pixel | no | "LinkedIn Insight" | `li_*`, `lidc`, `bcookie` | cookies |
| `static.hotjar.com`, `script.hotjar.com` | Hotjar | session recording / heatmaps | no | "Hotjar" | `_hj*` | cookies |
| `clarity.ms`, `www.clarity.ms` | Microsoft Clarity | session recording | no | "Clarity" | `_clck`, `_clsk` | cookies |
| `bat.bing.com` | Microsoft Ads UET | marketing pixel | no | "Microsoft Advertising" | `_uetsid`, `_uetvid` | cookies |
| `calendly.com`, `assets.calendly.com` | Calendly | booking widget / embed | no (a link instead of an embed avoids it) | "Calendly" | none before interaction | unknown |
| `www.youtube.com`, `www.youtube-nocookie.com`, `i.ytimg.com`, `s.ytimg.com`, `yt3.ggpht.com`, `jnn-pa.googleapis.com`, `www.google.com/js/th`, `www.gstatic.com/youtube` | YouTube (Google) | video embed (player, thumbnails, avatar, bot-guard script + attestation call) | no (nocookie + click-to-load is the usual fix) | "YouTube" | `VISITOR_INFO1_LIVE`, `YSC` | cookies |
| `player.vimeo.com`, `i.vimeocdn.com`, `f.vimeocdn.com` | Vimeo | video embed | no | "Vimeo" | `vuid` | cookies |
| `*.netlify.app`, `*.netlify.com`, `netlify-forms` | Netlify | hosting, forms, edge | yes (hosting) | "Netlify" | none (`nf_*` only with identity) | none (hosting; `nf_*` only with identity) |
| `*.cloudflare.com`, `cdnjs.cloudflare.com`, `challenges.cloudflare.com` | Cloudflare | CDN / bot check / Turnstile | yes for CDN and challenge | "Cloudflare" | `__cf_bm`, `cf_clearance` | cookies (`__cf_bm`, essential) |
| `cdn.jsdelivr.net`, `unpkg.com` | jsDelivr / unpkg | script CDN; visitor IP reaches the CDN | no (bundle locally) | "jsDelivr" / "unpkg" | none | unknown |
| `use.typekit.net`, `p.typekit.net` | Adobe Fonts (Typekit) | web fonts | no | "Adobe Fonts", "Typekit" | none | unknown |
| `*.website-files.com`, `*.webflow.io`, `d3e54v103j8qbb.cloudfront.net` | Webflow (assets / jQuery CDN) | asset hosting for Webflow sites and exports (`cdn.prod.website-files.com`, `assets.website-files.com`) | no (assets can be self-hosted) | "Webflow" | none | unknown |
| `accounts.finsweet.com` | Finsweet | Webflow component library licence check (`/v1/components/verify` on every load) | no | "Finsweet" | none | unknown |
| `cdn.weglot.com` | Weglot | website translation layer (proxies the page text, loads its switcher) | no | "Weglot" | `wglang` | cookies |
| `*.hs-scripts.com`, `*.hubspot.com`, `*.hsforms.com` | HubSpot | forms, chat, tracking | no | "HubSpot" | `hubspotutk`, `__hstc` | cookies |
| `scripts.simpleanalyticscdn.com`, `queue.simpleanalyticscdn.com`, `simpleanalytics.com` | Simple Analytics | cookieless analytics (EU) | no, but stores nothing | "Simple Analytics" | none | none, [docs.simpleanalytics.com/what-we-collect](https://docs.simpleanalytics.com/what-we-collect): "We do NOT set any cookies (or use similar technologies)." |
| `cdn.usefathom.com` | Fathom Analytics | analytics marketed as cookieless | no | "Fathom" | none | unknown (vendor statement not verified by a fetch yet - treated as storing until a source is added) |
| `static.cloudflareinsights.com`, `cloudflareinsights.com` | Cloudflare Web Analytics | beacon analytics | no | "Cloudflare" | none | unknown (vendor statement not verified by a fetch yet - treated as storing until a source is added) |
| `tracker.metricool.com` | Metricool | social-media / web analytics tracker | no | "Metricool" | none | unknown |
| `ajax.googleapis.com` | Google Hosted Libraries | script CDN (jQuery, webfont.js); visitor IP reaches Google | no (bundle locally) | "Google Hosted Libraries", "ajax.googleapis" | none | unknown |
| `*.imgix.net` | imgix | image CDN / processing (a project-specific subdomain, e.g. `<project>.imgix.net`) | no (self-host or name it) | "imgix" | none | unknown |
| `browser-update.org` | Browser-Update.org | outdated-browser notice script | no | "browser-update" | none | unknown |
| `*.list-manage.com`, `chimpstatic.com` | Mailchimp | newsletter forms | no | "Mailchimp" | none | unknown |
| `js.stripe.com`, `m.stripe.com`, `m.stripe.network` | Stripe | payments | only in a checkout | "Stripe" | `__stripe_mid`, `__stripe_sid` | cookies |
| `www.paypal.com`, `www.paypalobjects.com` | PayPal | payments | only in a checkout | "PayPal" | many | cookies |
| `*.ingest.sentry.io`, `*.sentry.io` | Sentry | error tracking (sends browser data) | no | "Sentry" | none | unknown |
| `images.unsplash.com`, `images.pexels.com` | Unsplash / Pexels CDN | hot-linked images | no (download the image) | "Unsplash" / "Pexels" | none | unknown |
| `widget.intercom.io`, `client.crisp.chat`, `embed.tawk.to` | Intercom / Crisp / Tawk | chat widgets | no | vendor name | `intercom-*`, `crisp-client*`, `TawkConnectionTime` | cookies |
| `consent.cookiebot.com`, `app.usercentrics.eu`, `cdn-cookieyes.com` | Cookiebot / Usercentrics / CookieYes | consent management | yes (the banner itself) | vendor name | `CookieConsent`, `uc_*`, `cookieyes-consent` | storage (the consent record, essential) |
| `www.googletagmanager.com/gtag/js` | gtag (GA4 / Ads) | see Google Analytics | no | "Google Analytics" / "Google Ads" | `_ga*` | cookies |
| `cdn.cookielaw.org` | OneTrust | consent management | yes | "OneTrust" | `OptanonConsent` | storage (the consent record, essential) |
| anything else | unknown | - | treat as no | - | list it; identify before closing the audit | unknown |

`device access` = what the vendor's request/script stores on or reads from the visitor's device before any
consent: `none` (only with a source line in the cell: the vendor's own statement), `cookies`, `storage`,
`fingerprint`, or `unknown`. L6 (banner needed?) follows it: a non-essential vendor contacted before consent
triggers the banner verdict only when its device access is **not** `none`; `unknown` is treated as storing and is
named in the finding until someone adds a source. A `none` vendor is still a third party: it stays an L4 item
(must be named in the Datenschutzerklaerung). Server-side analytics (e.g. Netlify Analytics: log based, no browser
request) never appear in the host list at all. Reference: the L5 key table below stays the evidence for what
really was set; a vendor row never overrides a key found there.

## Cookie / storage key classification (check L5)

| class | patterns | rule |
|---|---|---|
| essential | `PHPSESSID`, `JSESSIONID`, `session*`, `*csrf*`, `XSRF-TOKEN`, `__cf_bm`, `cf_clearance`, `__Host-*`, `__Secure-*` (session-type), `nf_*` (Netlify identity), `cookieconsent*`, `CookieConsent`, `cc_cookie`, `uc_*`, `borlabs-cookie*`, `cookieyes-consent`, `OptanonConsent`, `i18n_redirected`, `lang`, `locale`, `cart*` | may exist before consent |
| non-essential | `_ga`, `_ga_*`, `_gid`, `_gat*`, `_gcl_*`, `_fbp`, `_fbc`, `li_*`, `lidc`, `bcookie`, `_hj*`, `_clck`, `_clsk`, `_uetsid`, `_uetvid`, `hubspotutk`, `__hstc`, `__hssc`, `ajs_*`, `amplitude_*`, `mp_*`, `_pk_*` (Matomo with cookies), `vuid`, `VISITOR_INFO1_LIVE`, `YSC`, `__stripe_mid` / `__stripe_sid` when there is no checkout on the page | a presence finding before consent (§25 TDDDG) |
| unclassified | everything else, incl. framework keys in `localStorage` (`nuxt-*`, `vuex`, theme / reduced-motion preferences) | listed with name + value length; the owner says what it is; a preference key set by the site itself (theme, motion) is usually essential - say so and move on |

Storage counts the same as cookies under §25 TDDDG (`localStorage`, `sessionStorage`, IndexedDB):
an analytics identifier in `localStorage` is non-essential.
