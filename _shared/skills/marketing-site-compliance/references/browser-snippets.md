# Browser snippets for the Playwright MCP (`browser_evaluate`)

Each snippet is a function expression; pass it as the `function` argument of `browser_evaluate`.
Results are plain JSON so they can be pasted into the evidence file as they are. Run `meta()` on
every route; the others where the check says.

## `meta()` - S3, S4, S5, S11, A1

```js
() => {
  const q = (s) => [...document.querySelectorAll(s)];
  const attr = (s, a) => q(s).map((e) => e.getAttribute(a));
  return {
    url: location.href,
    lang: document.documentElement.lang,
    title: document.title,
    titleLen: document.title.length,
    description: attr('meta[name="description"]', 'content'),
    canonical: attr('link[rel="canonical"]', 'href'),
    hreflang: q('link[rel="alternate"][hreflang]').map((e) => [e.getAttribute('hreflang'), e.href]),
    og: Object.fromEntries(q('meta[property^="og:"]').map((e) => [e.getAttribute('property'), e.content])),
    twitter: Object.fromEntries(q('meta[name^="twitter:"]').map((e) => [e.getAttribute('name'), e.content])),
    icons: attr('link[rel~="icon"], link[rel="apple-touch-icon"]', 'href'),
    robotsMeta: attr('meta[name="robots"]', 'content'),
  };
}
```

## `cookiesAndStorage()` - L5 (run before any click)

```js
() => ({
  url: location.href,
  cookies: document.cookie ? document.cookie.split('; ').map((c) => c.split('=')[0]) : [],
  localStorage: Object.keys(localStorage).map((k) => [k, String(localStorage.getItem(k)).length]),
  sessionStorage: Object.keys(sessionStorage).map((k) => [k, String(sessionStorage.getItem(k)).length]),
})
```

HttpOnly cookies never appear in `document.cookie`; pair this with `curl -sSI https://SITE/ | grep -i set-cookie`.

## `clearState()` - only when the first `cookiesAndStorage()` shows the profile was not fresh

```js
() => {
  document.cookie.split('; ').forEach((c) => {
    const k = c.split('=')[0];
    document.cookie = `${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${location.hostname}`;
  });
  localStorage.clear(); sessionStorage.clear();
  return 'cleared (non-HttpOnly cookies + storage) - reload and list again';
}
```

## `legalLinks()` - L1, L3, L7, S7 (rendered-only anchors)

```js
() => [...document.querySelectorAll('a[href]')]
  .filter((a) => /impressum|imprint|legal|datenschutz|privacy|agb|terms|widerruf|cookie/i.test(a.textContent + ' ' + a.getAttribute('href')))
  .map((a) => ({ text: a.textContent.trim().replace(/\s+/g, ' '), href: a.getAttribute('href'), abs: a.href, inFooter: !!a.closest('footer') }))
```

## `headings()` - A3

```js
() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => `${h.tagName.toLowerCase()} ${h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)}`)
```

## `imagesWithoutAlt()` - A2

```js
() => [...document.querySelectorAll('img')]
  .filter((i) => !i.closest('[aria-hidden="true"]') && i.getAttribute('role') !== 'presentation')
  .map((i) => ({ src: (i.currentSrc || i.src).slice(-80), alt: i.getAttribute('alt'), w: i.naturalWidth, section: (i.closest('section,header,main,footer,article') || {}).id || (i.closest('section,header') || {}).className?.toString().slice(0, 40) || '' }))
  .filter((i) => i.alt === null || (i.alt === '' && i.w > 120))
```

`alt === null` = attribute missing (a finding on a content image); `alt === ''` on a large image =
possibly decorative, listed for a human look.

## `focusStyle()` - A4 (after each `browser_press_key` Tab)

```js
() => {
  const e = document.activeElement; if (!e || e === document.body) return { focused: 'body' };
  const s = getComputedStyle(e);
  return { tag: e.tagName.toLowerCase(), text: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 50), href: e.getAttribute('href'),
    outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, boxShadow: s.boxShadow };
}
```

Visible when `outlineStyle !== 'none'` with a non-zero width, or a `boxShadow` other than `none`
that differs from the unfocused element.

## `ctaContrast()` - A5

```js
() => {
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0) return c; } return [255, 255, 255]; };
  const cands = [...document.querySelectorAll('a,button')].filter((e) => { const s = getComputedStyle(e); const c = rgb(s.backgroundColor); return e.getBoundingClientRect().top < innerHeight * 1.5 && c.length >= 3 && (c[3] ?? 1) > 0 && e.textContent.trim(); });
  return cands.slice(0, 3).map((e) => {
    const s = getComputedStyle(e); const fg = rgb(s.color); const bg = rgb(s.backgroundColor).length >= 3 ? rgb(s.backgroundColor) : bgOf(e);
    const l1 = lum(...fg), l2 = lum(...bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(s.fontSize); const bold = parseInt(s.fontWeight) >= 700; const large = px >= 24 || (bold && px >= 18.66);
    return { text: e.textContent.trim().slice(0, 40), color: s.color, background: s.backgroundColor, fontSize: px, bold, ratio: +ratio.toFixed(2), needed: large ? 3 : 4.5, pass: ratio >= (large ? 3 : 4.5) };
  });
}
```

Takes the first three coloured buttons/links in the first 1.5 viewports - the hero CTA is normally
the first. Gradients and images behind text are not measured: say so if the CTA sits on one.

## `formsPrivacy()` - L8

```js
() => [...document.querySelectorAll('form')].map((f) => {
  const txt = (f.innerText + ' ' + (f.parentElement?.innerText || '')).replace(/\s+/g, ' ');
  return { action: f.getAttribute('action') || f.getAttribute('data-netlify') && 'netlify' || '', inputs: [...f.querySelectorAll('input,textarea,select')].map((i) => i.name || i.type),
    privacyLink: !!f.querySelector('a[href*="datenschutz"],a[href*="privacy"]'), privacyText: /datenschutz|privacy/i.test(txt), checkbox: [...f.querySelectorAll('input[type=checkbox]')].map((c) => ({ name: c.name, checked: c.checked })),
    purpose: txt.slice(0, 300) };
})
```

## `legalText()` - L2, L4, C1, C2

```js
() => ({ url: location.href, title: document.title, text: document.body.innerText.replace(/\n{3,}/g, '\n\n') })
```

Search the returned `text` for each vendor from `third-parties.md` (name or host), the Impressum
fields from `legal-pages-de.md`, e-mail addresses (`/[\w.+-]+@[\w-]+\.[\w.-]+/g`) and the identity
block (company name line + the following address lines).

## Host list - L4 / L6

`browser_network_requests` returns every request of the page; reduce by hand or with:

```js
// paste the URL list into node -e, or run on the JSON the MCP returned
const hosts = [...new Set(urls.map((u) => new URL(u).hostname))];
const etld1 = (h) => h.split('.').slice(-2).join('.');
```

Drop the site's own host and its hosting host (e.g. `*.netlify.app` for the same site); what
remains is the third-party list to map against the vendor table.
