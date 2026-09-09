# Third parties that need naming, and cookie / storage classification

Used by checks L4 (hosts loaded vs. vendors named in the Datenschutzerklaerung), L5 (keys set
before consent) and L6 (hosts contacted before accept). Match on the registrable domain
(eTLD+1, e.g. `googleapis.com`) of every request the page makes; a host not in this table is
listed as "unknown - identify before the audit closes" and counts as unnamed until identified.

## Host -> vendor

`essential?` = whether the request is usually strictly necessary for the page the visitor asked for
(so it may happen before consent). `name in text` = what the Datenschutz text is searched for
(vendor name **or** host, case-insensitive; any hit = named).

| host pattern | vendor | what it does | essential? | name in text | typical keys |
|---|---|---|---|---|---|
| `fonts.googleapis.com`, `fonts.gstatic.com` | Google Fonts (remote) | web fonts from Google's CDN; visitor IP reaches Google | no (self-hosting avoids the transfer) | "Google Fonts", "fonts.googleapis" | none |
| `google-analytics.com`, `analytics.google.com`, `googletagmanager.com`, `*.doubleclick.net`, `www.google.com/pagead`, `www.google.com/ccm` | Google Analytics / Tag Manager / Ads | analytics, tag container, ads, conversion pixels | no | "Google Analytics", "Tag Manager", "Google Ads" | `_ga`, `_ga_*`, `_gid`, `_gat`, `_gcl_au`, `_gcl_ls` |
| `www.google.com/recaptcha`, `www.gstatic.com/recaptcha` | Google reCAPTCHA | bot check on forms | no | "reCAPTCHA" | `_GRECAPTCHA` |
| `maps.googleapis.com`, `maps.gstatic.com` | Google Maps | embedded map | no | "Google Maps" | `NID` (google.com) |
| `plausible.io`, `*.plausible.io` | Plausible Analytics | cookieless analytics (EU) | no, but sets no identifier | "Plausible" | none |
| `connect.facebook.net`, `www.facebook.com/tr` | Meta Pixel | marketing pixel | no | "Meta", "Facebook Pixel" | `_fbp`, `_fbc` |
| `snap.licdn.com`, `px.ads.linkedin.com` | LinkedIn Insight Tag | marketing pixel | no | "LinkedIn Insight" | `li_*`, `lidc`, `bcookie` |
| `static.hotjar.com`, `script.hotjar.com` | Hotjar | session recording / heatmaps | no | "Hotjar" | `_hj*` |
| `clarity.ms`, `www.clarity.ms` | Microsoft Clarity | session recording | no | "Clarity" | `_clck`, `_clsk` |
| `bat.bing.com` | Microsoft Ads UET | marketing pixel | no | "Microsoft Advertising" | `_uetsid`, `_uetvid` |
| `calendly.com`, `assets.calendly.com` | Calendly | booking widget / embed | no (a link instead of an embed avoids it) | "Calendly" | none before interaction |
| `www.youtube.com`, `www.youtube-nocookie.com`, `i.ytimg.com`, `s.ytimg.com`, `yt3.ggpht.com`, `jnn-pa.googleapis.com`, `www.google.com/js/th`, `www.gstatic.com/youtube` | YouTube (Google) | video embed (player, thumbnails, avatar, bot-guard script + attestation call) | no (nocookie + click-to-load is the usual fix) | "YouTube" | `VISITOR_INFO1_LIVE`, `YSC` |
| `player.vimeo.com`, `i.vimeocdn.com`, `f.vimeocdn.com` | Vimeo | video embed | no | "Vimeo" | `vuid` |
| `*.netlify.app`, `*.netlify.com`, `netlify-forms` | Netlify | hosting, forms, edge | yes (hosting) | "Netlify" | none (`nf_*` only with identity) |
| `*.cloudflare.com`, `cdnjs.cloudflare.com`, `challenges.cloudflare.com` | Cloudflare | CDN / bot check / Turnstile | yes for CDN and challenge | "Cloudflare" | `__cf_bm`, `cf_clearance` |
| `cdn.jsdelivr.net`, `unpkg.com` | jsDelivr / unpkg | script CDN; visitor IP reaches the CDN | no (bundle locally) | "jsDelivr" / "unpkg" | none |
| `use.typekit.net`, `p.typekit.net` | Adobe Fonts (Typekit) | web fonts | no | "Adobe Fonts", "Typekit" | none |
| `*.website-files.com`, `*.webflow.io`, `d3e54v103j8qbb.cloudfront.net` | Webflow (assets / jQuery CDN) | asset hosting for Webflow sites and exports (`cdn.prod.website-files.com`, `assets.website-files.com`) | no (assets can be self-hosted) | "Webflow" | none |
| `accounts.finsweet.com` | Finsweet | Webflow component library licence check (`/v1/components/verify` on every load) | no | "Finsweet" | none |
| `cdn.weglot.com` | Weglot | website translation layer (proxies the page text, loads its switcher) | no | "Weglot" | `wglang` |
| `*.hs-scripts.com`, `*.hubspot.com`, `*.hsforms.com` | HubSpot | forms, chat, tracking | no | "HubSpot" | `hubspotutk`, `__hstc` |
| `tracker.metricool.com` | Metricool | social-media / web analytics tracker | no | "Metricool" | none |
| `ajax.googleapis.com` | Google Hosted Libraries | script CDN (jQuery, webfont.js); visitor IP reaches Google | no (bundle locally) | "Google Hosted Libraries", "ajax.googleapis" | none |
| `*.imgix.net` | imgix | image CDN / processing (a project-specific subdomain, e.g. `<project>.imgix.net`) | no (self-host or name it) | "imgix" | none |
| `browser-update.org` | Browser-Update.org | outdated-browser notice script | no | "browser-update" | none |
| `*.list-manage.com`, `chimpstatic.com` | Mailchimp | newsletter forms | no | "Mailchimp" | none |
| `js.stripe.com`, `m.stripe.com`, `m.stripe.network` | Stripe | payments | only in a checkout | "Stripe" | `__stripe_mid`, `__stripe_sid` |
| `www.paypal.com`, `www.paypalobjects.com` | PayPal | payments | only in a checkout | "PayPal" | many |
| `*.ingest.sentry.io`, `*.sentry.io` | Sentry | error tracking (sends browser data) | no | "Sentry" | none |
| `images.unsplash.com`, `images.pexels.com` | Unsplash / Pexels CDN | hot-linked images | no (download the image) | "Unsplash" / "Pexels" | none |
| `widget.intercom.io`, `client.crisp.chat`, `embed.tawk.to` | Intercom / Crisp / Tawk | chat widgets | no | vendor name | `intercom-*`, `crisp-client*`, `TawkConnectionTime` |
| `consent.cookiebot.com`, `app.usercentrics.eu`, `cdn-cookieyes.com` | Cookiebot / Usercentrics / CookieYes | consent management | yes (the banner itself) | vendor name | `CookieConsent`, `uc_*`, `cookieyes-consent` |
| `www.googletagmanager.com/gtag/js` | gtag (GA4 / Ads) | see Google Analytics | no | "Google Analytics" / "Google Ads" | `_ga*` |
| `cdn.cookielaw.org` | OneTrust | consent management | yes | "OneTrust" | `OptanonConsent` |
| anything else | unknown | - | treat as no | - | list it; identify before closing the audit |

## Cookie / storage key classification (check L5)

| class | patterns | rule |
|---|---|---|
| essential | `PHPSESSID`, `JSESSIONID`, `session*`, `*csrf*`, `XSRF-TOKEN`, `__cf_bm`, `cf_clearance`, `__Host-*`, `__Secure-*` (session-type), `nf_*` (Netlify identity), `cookieconsent*`, `CookieConsent`, `cc_cookie`, `uc_*`, `borlabs-cookie*`, `cookieyes-consent`, `OptanonConsent`, `i18n_redirected`, `lang`, `locale`, `cart*` | may exist before consent |
| non-essential | `_ga`, `_ga_*`, `_gid`, `_gat*`, `_gcl_*`, `_fbp`, `_fbc`, `li_*`, `lidc`, `bcookie`, `_hj*`, `_clck`, `_clsk`, `_uetsid`, `_uetvid`, `hubspotutk`, `__hstc`, `__hssc`, `ajs_*`, `amplitude_*`, `mp_*`, `_pk_*` (Matomo with cookies), `vuid`, `VISITOR_INFO1_LIVE`, `YSC`, `__stripe_mid` / `__stripe_sid` when there is no checkout on the page | a presence finding before consent (§25 TDDDG) |
| unclassified | everything else, incl. framework keys in `localStorage` (`nuxt-*`, `vuex`, theme / reduced-motion preferences) | listed with name + value length; the owner says what it is; a preference key set by the site itself (theme, motion) is usually essential - say so and move on |

Storage counts the same as cookies under §25 TDDDG (`localStorage`, `sessionStorage`, IndexedDB):
an analytics identifier in `localStorage` is non-essential.
