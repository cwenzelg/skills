#!/usr/bin/env node
// Route list + link check for the marketing-site-compliance audit (checks S2 and S7).
//
//   node scripts/check-links.mjs https://example.de [--max 30] [--out links.json] [--timeout 15000]
//
// 1. Fetches /sitemap.xml. If it is a 200 with XML <loc> entries, those are the routes.
//    Otherwise crawls same-origin <a href> links from / to depth 2, capped at --max routes.
// 2. Fetches every route (GET) and collects every anchor on it: internal, external, "#"/empty.
// 3. Checks every distinct link once: HEAD first, GET when HEAD is not 2xx/3xx (many hosts
//    refuse HEAD). Redirects are followed; the final status counts.
// 4. Prints a table and writes JSON: { origin, source, routes[], links[], broken[], placeholders[] }.
//
// Static fetch only - no JavaScript runs. On a client-rendered SPA this is what a crawler sees,
// which is the right lens for sitemap and link checks; use the browser snippets for rendered-only
// anchors. Dependency-free, Node >= 20 (global fetch).

import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const origin = argv.find((a) => a.startsWith('http'));
if (!origin) { console.error('usage: node check-links.mjs https://site [--max 30] [--out file.json] [--timeout ms]'); process.exit(2); }
const opt = (name, dflt) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : dflt; };
const MAX = Number(opt('--max', 30));
const OUT = opt('--out', null);
const TIMEOUT = Number(opt('--timeout', 15000));
const UA = 'Mozilla/5.0 (compatible; marketing-site-compliance/1.0; +local audit)';
const base = new URL(origin);
const ownHost = base.hostname.replace(/^www\./, '');
const sameSite = (u) => u.hostname.replace(/^www\./, '') === ownHost;

async function req(url, method = 'GET') {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { method, redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
    const text = method === 'GET' ? await r.text() : '';
    return { status: r.status, url: r.url, type: r.headers.get('content-type') || '', text };
  } catch (e) {
    return { status: 0, url, type: '', text: '', error: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally { clearTimeout(t); }
}

const norm = (href, from) => {
  try { const u = new URL(href, from); u.hash = ''; return u; } catch { return null; }
};
const anchors = (html, from) => {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi)) {
    out.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  }
  return out;
};
const stripSlash = (u) => (u.pathname.length > 1 ? u.href.replace(/\/$/, '') : u.href);

// 1. routes
let source = 'crawl';
const routes = new Map(); // href -> { status, type }
const sm = await req(new URL('/sitemap.xml', base).href);
const locs = [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
if (sm.status === 200 && /<\/?(urlset|sitemapindex)/.test(sm.text) && locs.length) {
  source = 'sitemap';
  for (const l of locs.slice(0, MAX)) routes.set(stripSlash(new URL(l)), null);
}
if (source === 'crawl') {
  const seen = new Set([stripSlash(base)]);
  let frontier = [stripSlash(base)];
  for (let depth = 0; depth <= 2 && frontier.length && routes.size < MAX; depth++) {
    const next = [];
    for (const href of frontier) {
      if (routes.size >= MAX) break;
      const r = await req(href);
      routes.set(href, { status: r.status, type: r.type, links: anchors(r.text, r.url || href), html: r.text });
      for (const a of anchors(r.text, r.url || href)) {
        const u = norm(a, r.url || href);
        if (!u || !/^https?:$/.test(u.protocol) || !sameSite(u)) continue;
        if (/\.(pdf|jpe?g|png|gif|svg|webp|mp4|zip|xml|txt|ico|css|js)$/i.test(u.pathname)) continue;
        u.protocol = base.protocol; // one route per path: an http:// self-link is still checked as a link below, not crawled twice
        const k = stripSlash(u);
        if (!seen.has(k)) { seen.add(k); next.push(k); }
      }
    }
    frontier = next;
  }
}

// 2. fetch every route not yet fetched, collect anchors
const links = new Map(); // href -> { foundOn: Set }
const placeholders = [];
for (const [href, info] of routes) {
  let r = info;
  if (!r) { const g = await req(href); r = { status: g.status, type: g.type, links: anchors(g.text, g.url || href), html: g.text }; routes.set(href, r); }
  for (const a of r.links) {
    if (a === '' || a === '#' || /^javascript:/i.test(a)) { placeholders.push({ href: a, foundOn: href }); continue; }
    if (/^(mailto|tel|sms):/i.test(a)) continue;
    const u = norm(a, href);
    if (!u || !/^https?:$/.test(u.protocol)) continue;
    const k = u.href;
    if (!links.has(k)) links.set(k, { foundOn: new Set() });
    links.get(k).foundOn.add(href);
  }
  delete r.html;
}

// 3. check every link once
const results = [];
for (const [href, { foundOn }] of links) {
  const u = new URL(href);
  let r = await req(href, 'HEAD');
  if (!(r.status >= 200 && r.status < 400)) r = await req(href, 'GET');
  results.push({ url: href, internal: sameSite(u), status: r.status, final: r.url, error: r.error, foundOn: [...foundOn] });
}
const broken = results.filter((r) => !(r.status >= 200 && r.status < 400));

// 4. output
const pad = (s, n) => String(s).padEnd(n);
console.log(`origin ${origin}  routes ${routes.size} (${source})  links ${results.length}  broken ${broken.length}  placeholders ${placeholders.length}`);
console.log('\nroutes:');
for (const [href, r] of routes) console.log(`  ${pad(r?.status ?? '?', 4)} ${href}`);
console.log('\nbroken links (status | url | found on):');
for (const b of broken) console.log(`  ${pad(b.status || b.error, 8)} ${b.internal ? 'int' : 'ext'} ${b.url}  <- ${b.foundOn[0]}${b.foundOn.length > 1 ? ` (+${b.foundOn.length - 1})` : ''}`);
if (placeholders.length) { console.log('\nplaceholder hrefs ("#" / empty / javascript:):'); for (const p of placeholders) console.log(`  ${JSON.stringify(p.href)}  on ${p.foundOn}`); }
if (OUT) {
  writeFileSync(OUT, JSON.stringify({ origin, source, routes: [...routes].map(([href, r]) => ({ href, status: r?.status, type: r?.type })), links: results, broken, placeholders }, null, 2));
  console.log(`\nwritten ${OUT}`);
}
