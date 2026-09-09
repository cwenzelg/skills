#!/usr/bin/env node
// Mechanical subset of the marketing-site-compliance checklist, run over a list of sites.
//
//   node site-audit.mjs --sites sites.json --out <dir> [--diff <previous run dir>] [--only a.de,b.de]
//                       [--playwright-dir <node_modules>] [--no-browser] [--max-routes 30] [--timeout 20000]
//
// Runs 20 of the 27 checks in SKILL.md - the ones that need no human reading: S1-S11, L1, L3,
// L4 (host list + name search), L5, L6 (hosts before consent only), A1-A3, C2. Verdict vocabulary,
// pass criteria and severities are SKILL.md's, applied literally. The seven human checks (L2, L7,
// L8, A4, A5, C1, C3) and every "lawyer" item are listed in the JSON as humanOnly, never judged.
//
// Output: <out>/<site>.json per site (schema site-audit/1), raw evidence under <out>/<site>/,
// <out>/summary.md, and with --diff also <out>/diff.md (one table per site: check, previous, now,
// changed?). A crash in one check or site is recorded as not-run with the error; the run continues.
//
// Dependencies: none (Node >= 20: fetch, node:dns, node:tls). Browser checks use the Playwright
// library from an existing install (--playwright-dir or SITE_AUDIT_PLAYWRIGHT_DIR); without it the
// [browser] checks are not-run. Keys, read from the environment only: PAGESPEED_API_KEY (S6, else
// not-run), PLAUSIBLE_API_KEY (optional plausible block). The vendor and cookie tables are parsed
// from ../references/third-parties.md at run time so the skill has one source of truth.
//
// Never clicks a banner, never submits a form, never follows a mailto: - read-only against production.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import dns from 'node:dns/promises';
import { Resolver } from 'node:dns/promises';
import tls from 'node:tls';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_VERSION = '1';
const UA = 'Mozilla/5.0 (compatible; marketing-site-compliance/1.0; +local audit)';

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : dflt; };
const flag = (name) => argv.includes(name);
if (flag('--help') || flag('-h')) {
  console.log(`usage: node site-audit.mjs --sites <sites.json> --out <dir> [options]

  --sites <file>          site list: { "sites": [ { site, company, origin, apex, languages[], germanLaw,
                          sellsOnline, legalHints{impressum,datenschutz}, plausibleSiteId } ] }
  --out <dir>             run directory: <site>.json + <site>/ evidence + summary.md (+ diff.md)
  --diff <dir>            previous run directory to compare against (writes <out>/diff.md)
  --diff-only             do not audit: re-read <out>/*.json and only write diff.md (needs --diff)
  --only <a,b>            audit only these site keys
  --playwright-dir <dir>  a node_modules dir containing playwright (or env SITE_AUDIT_PLAYWRIGHT_DIR)
  --no-browser            skip the [browser] checks (they become not-run)
  --max-routes <n>        route cap for the per-route pass (default 30)
  --timeout <ms>          per request (default 20000)
  --help                  this text

Checks run: S1-S11 L1 L3 L4 L5 L6 A1 A2 A3 C2 (mechanical). Human-only, never judged here:
L2 L7 L8 A4 A5 C1 C3 and every lawyer item. Env: PAGESPEED_API_KEY (S6), PLAUSIBLE_API_KEY (optional).
Exit 0 = every site wrote a JSON (verdicts are data); 2 = usage error; 1 = could not write output.`);
  process.exit(0);
}
const SITES_FILE = opt('--sites');
const OUT = opt('--out');
if (!SITES_FILE || !OUT) { console.error('usage error: --sites and --out are required (see --help)'); process.exit(2); }
const DIFF = opt('--diff', null);
const DIFF_ONLY = flag('--diff-only');
if (DIFF_ONLY && !DIFF) { console.error('usage error: --diff-only needs --diff <dir>'); process.exit(2); }
const ONLY = opt('--only', '') ? opt('--only').split(',').map((s) => s.trim()).filter(Boolean) : null;
const PW_DIR = opt('--playwright-dir', process.env.SITE_AUDIT_PLAYWRIGHT_DIR || null);
const NO_BROWSER = flag('--no-browser');
const MAX_ROUTES = Number(opt('--max-routes', 30));
const TIMEOUT = Number(opt('--timeout', 20000));
const PSI_KEY = process.env.PAGESPEED_API_KEY || '';
const PLAUSIBLE_KEY = process.env.PLAUSIBLE_API_KEY || '';
const TODAY = new Date().toISOString().slice(0, 10);

const sitesCfg = JSON.parse(readFileSync(SITES_FILE, 'utf8'));
let sites = sitesCfg.sites || sitesCfg;
if (ONLY) sites = sites.filter((s) => ONLY.includes(s.site));
if (!sites.length) { console.error('usage error: no sites selected'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const etld1 = (h) => h.split('.').slice(-2).join('.'); // naive: none of our sites uses a two-part public suffix
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const stripSlash = (u) => { try { const x = new URL(u); x.hash = ''; x.search = ''; return x.pathname.length > 1 ? x.href.replace(/\/$/, '') : x.href; } catch { return u; } };
const daysUntil = (d) => Math.round((new Date(d) - Date.now()) / 86400000);
const short = (s, n = 160) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
const wr = (dir, name, data) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return name; };

async function req(url, { method = 'GET', redirect = 'follow', timeout = TIMEOUT, body = false } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, redirect, signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
    const text = method === 'GET' && body !== null ? await r.text() : '';
    const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
    const setCookie = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
    return { status: r.status, url: r.url, headers, setCookie, type: r.headers.get('content-type') || '', text };
  } catch (e) {
    const cause = e.cause && (e.cause.code || e.cause.message);
    return { status: 0, url, headers: {}, setCookie: [], type: '', text: '', error: e.name === 'AbortError' ? 'timeout' : `${e.message}${cause ? ` (${cause})` : ''}` };
  } finally { clearTimeout(t); }
}
async function headOrGet(url) { let r = await req(url, { method: 'HEAD' }); if (!(r.status >= 200 && r.status < 400)) r = await req(url); return r; }
async function hops(url, max = 6) {
  const chain = []; let cur = url;
  for (let i = 0; i < max; i++) {
    const r = await req(cur, { redirect: 'manual' });
    const loc = r.headers.location || null;
    chain.push({ url: cur, status: r.status, location: loc, error: r.error || null });
    if (r.status >= 300 && r.status < 400 && loc) { try { cur = new URL(loc, cur).href; } catch { break; } } else break;
  }
  return chain;
}
function tlsInfo(host) {
  return new Promise((res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    let s;
    try {
      s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
        const c = s.getPeerCertificate();
        fin({ host, connected: true, authorized: s.authorized, authorizationError: s.authorizationError ? String(s.authorizationError) : null,
          subject: c.subject?.CN || null, issuer: [c.issuer?.O, c.issuer?.CN].filter(Boolean).join(' / ') || null,
          validFrom: c.valid_from || null, validTo: c.valid_to || null, daysLeft: c.valid_to ? daysUntil(c.valid_to) : null,
          san: (c.subjectaltname || '').split(', ').map((x) => x.replace(/^DNS:/, '')).filter(Boolean) });
        s.end();
      });
      s.setTimeout(TIMEOUT, () => { s.destroy(); fin({ host, connected: false, error: 'timeout' }); });
      s.on('error', (e) => fin({ host, connected: false, error: e.message }));
    } catch (e) { fin({ host, connected: false, error: e.message }); }
  });
}
const check = (id, name, verdict, severity, summary, evidence = {}, files = [], notes = []) => ({ id, name, verdict, severity: verdict === 'fail' ? severity : null, summary: short(summary), evidence, files, notes });
const notRun = (id, name, reason) => check(id, name, 'not-run', null, reason);

// ---------------------------------------------------------------- vendor + cookie tables (references/third-parties.md)
function parseTables(md) {
  const lines = md.split(/\r?\n/);
  const tables = {}; let section = ''; let cur = null;
  for (const line of lines) {
    if (line.startsWith('## ')) { section = line.slice(3).trim(); cur = null; continue; }
    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue;
      if (!cur) { cur = { header: cells, rows: [] }; tables[section] = cur; } else cur.rows.push(cells);
    } else cur = null;
  }
  return tables;
}
const ticks = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const quoted = (s) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
function loadThirdParties() {
  const md = readFileSync(join(__dirname, '..', 'references', 'third-parties.md'), 'utf8');
  const t = parseTables(md);
  const hostT = t['Host -> vendor']; const cookieT = t['Cookie / storage key classification (check L5)'];
  if (!hostT || hostT.header[0] !== 'host pattern' || !cookieT || cookieT.header[0] !== 'class') throw new Error('third-parties.md: table headers changed - update parseTables()');
  const vendors = hostT.rows.filter((r) => !/^anything else$/i.test(r[0])).map((r) => ({
    patterns: ticks(r[0]), vendor: r[1], what: r[2], essential: /^yes/i.test(r[3]),
    names: quoted(r[4]).length ? quoted(r[4]) : [r[1].replace(/\s*\(.*\)$/, '')],
    keys: ticks(r[5] || ''),
  }));
  const cookieClasses = cookieT.rows.map((r) => ({ cls: r[0], patterns: ticks(r[1]).map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i')) }));
  return { vendors, cookieClasses };
}
const TP = loadThirdParties();
function vendorFor(url) {
  const u = new URL(url); const hp = u.hostname + u.pathname;
  for (const v of TP.vendors) for (const p of v.patterns) {
    if (p.includes('/')) { if (hp.startsWith(p)) return v; }
    else if (p.startsWith('*.')) { if (u.hostname === p.slice(2) || u.hostname.endsWith(p.slice(1))) return v; }
    else if (u.hostname === p || u.hostname.endsWith('.' + p)) return v; // a plain host in the table stands for the vendor's domain (www.googletagmanager.com -> googletagmanager.com)
  }
  return null;
}
function classifyKey(k) {
  for (const c of TP.cookieClasses) if (c.patterns.some((re) => re.test(k))) return c.cls;
  return 'unclassified';
}

// ---------------------------------------------------------------- browser snippets (references/browser-snippets.md)
const SNIP = {
  meta: () => { const q = (s) => [...document.querySelectorAll(s)]; const attr = (s, a) => q(s).map((e) => e.getAttribute(a)); return { url: location.href, lang: document.documentElement.lang, title: document.title, titleLen: document.title.length, description: attr('meta[name="description"]', 'content'), canonical: attr('link[rel="canonical"]', 'href'), hreflang: q('link[rel="alternate"][hreflang]').map((e) => [e.getAttribute('hreflang'), e.href]), og: Object.fromEntries(q('meta[property^="og:"]').map((e) => [e.getAttribute('property'), e.content])), twitter: Object.fromEntries(q('meta[name^="twitter:"]').map((e) => [e.getAttribute('name'), e.content])), icons: q('link[rel~="icon"], link[rel="apple-touch-icon"]').map((e) => e.href), robotsMeta: attr('meta[name="robots"]', 'content'), h1: q('h1').map((h) => h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)), textLength: (document.body?.innerText || '').length }; },
  cookiesAndStorage: () => ({ url: location.href, cookies: document.cookie ? document.cookie.split('; ').map((c) => c.split('=')[0]) : [], localStorage: Object.keys(localStorage).map((k) => [k, String(localStorage.getItem(k)).length]), sessionStorage: Object.keys(sessionStorage).map((k) => [k, String(sessionStorage.getItem(k)).length]) }),
  legalLinks: () => [...document.querySelectorAll('a[href]')].filter((a) => /impressum|imprint|legal|datenschutz|privacy|agb|terms|widerruf|cookie/i.test(a.textContent + ' ' + a.getAttribute('href'))).map((a) => ({ text: a.textContent.trim().replace(/\s+/g, ' '), href: a.getAttribute('href'), abs: a.href, inFooter: !!a.closest('footer') })),
  headings: () => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => `${h.tagName.toLowerCase()} ${h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)}`),
  imagesWithoutAlt: () => ({ total: document.querySelectorAll('img').length, flagged: [...document.querySelectorAll('img')].filter((i) => !i.closest('[aria-hidden="true"]') && i.getAttribute('role') !== 'presentation').map((i) => ({ src: (i.currentSrc || i.src).slice(-80), alt: i.getAttribute('alt'), w: i.naturalWidth })).filter((i) => i.alt === null || (i.alt === '' && i.w > 120)) }),
  legalText: () => ({ url: location.href, title: document.title, lang: document.documentElement.lang, h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()), text: (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n'), mailtos: [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href')) }),
  anchors: () => [...document.querySelectorAll('a[href]')].map((a) => a.href),
  banner: () => { const sel = '[class*=cookie],[id*=cookie],[class*=consent],[id*=consent],[aria-label*=cookie]'; return [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 50 && r.height > 20 && s.visibility !== 'hidden' && s.display !== 'none' && (e.innerText || '').trim().length > 20; }).slice(0, 3).map((e) => ({ tag: e.tagName.toLowerCase(), id: e.id, cls: String(e.className).slice(0, 80), text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200) })); },
  scrollBottom: () => { window.scrollTo(0, document.body.scrollHeight); return document.body.scrollHeight; },
};

// ---------------------------------------------------------------- playwright
let pw = null, browser = null, pwVersion = null, browserVersion = null, browserError = null;
async function startBrowser() {
  if (NO_BROWSER) { browserError = '--no-browser'; return; }
  try {
    const require = createRequire(import.meta.url);
    const mod = PW_DIR ? join(resolve(PW_DIR), 'playwright') : 'playwright';
    pw = require(mod);
    try { pwVersion = require(join(PW_DIR ? join(resolve(PW_DIR), 'playwright') : 'playwright', 'package.json')).version; } catch { pwVersion = 'unknown'; }
    browser = await pw.chromium.launch({ headless: true });
    browserVersion = browser.version();
  } catch (e) { browserError = `playwright unavailable (${e.message.split('\n')[0]})`; pw = null; browser = null; }
}

// ---------------------------------------------------------------- one site
async function auditSite(site) {
  const started = new Date().toISOString();
  const origin = site.origin.replace(/\/$/, '');
  const originHost = hostOf(origin);
  const ownDomain = etld1(originHost);
  const dir = join(OUT, site.site);
  mkdirSync(dir, { recursive: true });
  const rel = (n) => `${site.site}/${n}`;
  const checks = {}; const files = {};
  const put = (c, ...f) => { c.files = [...(c.files || []), ...f.filter(Boolean)]; checks[c.id] = c; };
  const guard = async (id, name, fn) => { try { await fn(); } catch (e) { put(notRun(id, name, `crashed: ${short(e.stack || e.message, 300)}`)); } if (!checks[id]) put(notRun(id, name, 'no result produced')); };
  console.log(`\n## ${site.site} (${origin})`);

  // (1) fetch group ------------------------------------------------------------------
  const home = await req(origin + '/');
  files.home = wr(dir, 'home.html', home.text || `(no body) ${home.error || home.status}`);
  const hosting = /netlify/i.test(home.headers.server || '') ? 'Netlify' : /cloudflare/i.test(home.headers.server || '') ? 'Cloudflare' : null;
  const reachable = home.status > 0;
  if (!reachable) console.log(`  home unreachable: ${home.error}`);

  await guard('S8', 'HTTP -> HTTPS, www/apex', async () => {
    const variants = site.apex
      ? [`http://${site.apex}`, `http://www.${site.apex}`, `https://www.${site.apex}`, `https://${site.apex}`]
      : [`http://${originHost}`, `https://${originHost}`];
    if (!variants.includes(origin)) variants.push(origin);
    const results = [];
    for (const v of variants) { const chain = await hops(v); const last = chain[chain.length - 1]; results.push({ variant: v, chain, final: last.status >= 200 && last.status < 300 ? new URL(last.url).href : null, finalStatus: last.status, error: chain.find((h) => h.error)?.error || null }); }
    const lines = results.flatMap((r) => [`${r.variant}`, ...r.chain.map((h) => `  ${h.status || 'ERR'} ${h.url}${h.location ? ` -> ${h.location}` : ''}${h.error ? `  ${h.error}` : ''}`), `  => ${r.final || 'unreachable'} (${r.chain.length - 1} redirects)`]);
    const f = wr(dir, 'S8-redirects.txt', lines.join('\n'));
    const finals = new Set(results.filter((r) => r.final).map((r) => new URL(r.final).host));
    const httpBad = results.filter((r) => r.variant.startsWith('http://') && (!r.final || !r.final.startsWith('https://')));
    const badHop = results.filter((r) => r.chain.some((h) => h.status >= 300 && h.status < 400 && ![301, 308].includes(h.status)));
    const tooMany = results.filter((r) => r.chain.length - 1 > 2);
    const unreachable = results.filter((r) => !r.final);
    const notes = []; if (results.some((r) => r.chain.some((h) => /:443\//.test(h.location || '')))) notes.push('a Location header carries an explicit :443 port (normalised for the comparison)');
    if (!site.apex) notes.push('subdomain: www variants n-a');
    let verdict = 'pass', severity = null, summary = `${results.length} variants end on ${[...finals].join(', ') || 'nothing'}`;
    if (httpBad.length) { verdict = 'fail'; severity = 'blocker'; summary = `http not redirected to https: ${httpBad.map((r) => r.variant).join(', ')}`; }
    else if (finals.size > 1 || unreachable.length || badHop.length || tooMany.length) { verdict = 'fail'; severity = 'should-fix'; summary = [finals.size > 1 ? `ends on ${finals.size} hosts (${[...finals].join(', ')})` : '', unreachable.length ? `unreachable: ${unreachable.map((r) => `${r.variant} (${r.error || r.finalStatus})`).join(', ')}` : '', badHop.length ? `non-301/308 hop on ${badHop.map((r) => r.variant).join(', ')}` : '', tooMany.length ? `> 2 hops on ${tooMany.map((r) => r.variant).join(', ')}` : ''].filter(Boolean).join('; '); }
    put(check('S8', 'HTTP -> HTTPS, www/apex', verdict, severity, summary, { variants: results.map((r) => ({ variant: r.variant, final: r.final, hops: r.chain.length - 1, statuses: r.chain.map((h) => h.status), error: r.error })), finals: [...finals] }, [], notes), rel(f));
  });

  await guard('S9', 'TLS', async () => {
    const hostsToTest = [...new Set([originHost, site.apex, site.apex ? `www.${site.apex}` : null].filter(Boolean))];
    const results = []; for (const h of hostsToTest) results.push(await tlsInfo(h));
    const f = wr(dir, 'S9-tls.json', results);
    const hsts = home.headers['strict-transport-security'] || null;
    const bad = results.filter((r) => !r.connected || !r.authorized || (r.daysLeft !== null && r.daysLeft <= 14));
    const covers = (r, h) => r.san?.some((s) => s === h || (s.startsWith('*.') && h.endsWith(s.slice(1)) && h.split('.').length === s.split('.').length));
    const sanMiss = results.filter((r) => r.connected && !covers(r, r.host)).map((r) => r.host);
    const notes = []; if (!hsts) notes.push('no Strict-Transport-Security header on the origin');
    const first = results.find((r) => r.connected) || {};
    let verdict = 'pass', severity = null, summary = `${first.issuer || '?'} valid to ${first.validTo || '?'} (${first.daysLeft ?? '?'} d), SAN ${first.san?.join(' ') || '?'}${hsts ? ', HSTS' : ', no HSTS'}`;
    if (bad.length || sanMiss.length) { verdict = 'fail'; severity = 'blocker'; summary = [...bad.map((r) => `${r.host}: ${r.error || r.authorizationError || `${r.daysLeft} days left`}`), ...sanMiss.map((h) => `SAN does not cover ${h}`)].join('; '); }
    put(check('S9', 'TLS', verdict, severity, summary, { hosts: results, hsts }, [], notes), rel(f));
  });

  await guard('S1', 'robots.txt', async () => {
    const r = await req(origin + '/robots.txt');
    const f = wr(dir, 'S1-robots.txt', `HTTP ${r.status} ${r.url}\n${Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${r.text}`);
    const isPlain = /^text\/plain/i.test(r.type); const hasUA = /^\s*user-agent\s*:/im.test(r.text); const html = /<html|<!doctype/i.test(r.text); const hasSitemap = /^\s*sitemap\s*:/im.test(r.text);
    const ok = r.status === 200 && isPlain && hasUA && !html;
    const notes = ok && !hasSitemap ? ['no Sitemap: line'] : [];
    put(check('S1', 'robots.txt', ok ? 'pass' : 'fail', 'should-fix', ok ? `200 text/plain, User-agent present${hasSitemap ? ', Sitemap line' : ''}` : r.status === 200 ? `200 but ${r.type || 'no content-type'}${html ? ' (HTML shell)' : ''}${hasUA ? '' : ', no User-agent line'}` : `${r.status || r.error} ${r.type}`, { status: r.status, contentType: r.type, bytes: r.text.length, userAgentLine: hasUA, sitemapLine: hasSitemap, html, error: r.error || null }, [], notes), rel(f));
  });

  // (2) routes + S7 via check-links.mjs --------------------------------------------------
  let links = null;
  await guard('S7', 'broken links', async () => {
    const out = await new Promise((res) => execFile(process.execPath, [join(__dirname, 'check-links.mjs'), origin, '--max', String(MAX_ROUTES), '--out', join(dir, 'links.json'), '--timeout', String(TIMEOUT)], { maxBuffer: 20e6, timeout: 600000 }, (err, stdout, stderr) => res({ err, stdout, stderr })));
    const f = wr(dir, 'S7-check-links.txt', `${out.stdout || ''}${out.stderr ? `\n[stderr]\n${out.stderr}` : ''}${out.err ? `\n[error] ${out.err.message}` : ''}`);
    if (existsSync(join(dir, 'links.json'))) links = JSON.parse(readFileSync(join(dir, 'links.json'), 'utf8'));
    if (!links) { put(notRun('S7', 'broken links', `check-links.mjs produced no JSON: ${short(out.err?.message || out.stderr, 200)}`), rel(f)); return; }
    const brokenInt = links.broken.filter((b) => b.internal); const brokenExt = links.broken.filter((b) => !b.internal);
    const notes = [...brokenExt.map((b) => `external ${b.status || b.error} ${b.url} <- ${b.foundOn[0]}`), ...links.placeholders.map((p) => `placeholder href ${JSON.stringify(p.href)} on ${p.foundOn}`)];
    put(check('S7', 'broken links', brokenInt.length ? 'fail' : 'pass', 'should-fix', `${links.routes.length} routes (${links.source}), ${links.links.length} links, ${brokenInt.length} internal broken, ${brokenExt.length} external broken, ${links.placeholders.length} placeholders`, { routes: links.routes.length, source: links.source, links: links.links.length, brokenInternal: brokenInt.map((b) => ({ url: b.url, status: b.status || b.error, foundOn: b.foundOn[0] })), brokenExternal: brokenExt.map((b) => ({ url: b.url, status: b.status || b.error })), placeholders: links.placeholders.length }, [], notes), rel('links.json'), rel(f));
  });

  await guard('S10', '404 page', async () => {
    const url = `${origin}/this-page-does-not-exist-${TODAY.replace(/-/g, '')}`;
    let r = await req(url, { redirect: 'manual' }); let redirectedTo = null;
    if (r.status >= 300 && r.status < 400 && r.headers.location) { redirectedTo = new URL(r.headers.location, url).href; const r2 = await req(redirectedTo); r = { ...r2, firstStatus: r.status }; }
    const f = wr(dir, '404.html', r.text || '');
    const title = (r.text.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    const homeTitle = (home.text.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    const sameAsHome = r.text.length === home.text.length && r.text.length > 0;
    const f2 = wr(dir, 'S10-status.txt', `${url}\nfirst status ${r.firstStatus ?? r.status}${redirectedTo ? ` -> ${redirectedTo} (${r.status})` : ''}\nbody ${r.text.length} bytes, title: ${title}\nhome body ${home.text.length} bytes, title: ${homeTitle}`);
    const ok = (r.firstStatus ?? r.status) === 404;
    put(check('S10', '404 page', ok ? 'pass' : 'fail', 'should-fix', ok ? `404 (${r.text.length} bytes${title ? `, "${title}"` : ''})` : redirectedTo ? `${r.firstStatus} redirect to ${redirectedTo} (${r.status}) instead of 404` : `${r.status || r.error}${sameAsHome ? ' with the home/shell body (soft 404)' : ''}`, { firstStatus: r.firstStatus ?? r.status, finalStatus: r.status, redirectedTo, bytes: r.text.length, title, homeBytes: home.text.length, sameAsHome }), rel(f), rel(f2));
  });

  // (3) browser: fresh context, home, pre-consent listing -------------------------------
  let ctx = null, page = null;
  const requests = []; const respStatus = {};
  let preStorage = null, banner = null, homeMeta = null, routeList = [];
  let browserErrorSite = null;
  preConsentRequests = [];
  const bReason = browserError || (!reachable ? `home unreachable: ${home.error}` : null);
  if (!bReason) {
    try {
      ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'de-DE' });
      ctx.on('request', (r) => requests.push({ url: r.url(), method: r.method(), type: r.resourceType() }));
      ctx.on('response', (r) => { respStatus[r.url()] = r.status(); });
      page = await ctx.newPage();
      await page.goto(origin + '/', { waitUntil: 'load', timeout: TIMEOUT * 2 });
      await page.waitForTimeout(5000);
      const cookies = await ctx.cookies();
      const st = await page.evaluate(SNIP.cookiesAndStorage);
      preStorage = { cookies: cookies.map((c) => ({ name: c.name, domain: c.domain, httpOnly: c.httpOnly, secure: c.secure })), localStorage: st.localStorage, sessionStorage: st.sessionStorage, url: st.url };
      banner = await page.evaluate(SNIP.banner);
      await page.screenshot({ path: join(dir, 'L6-home-first-load.png'), fullPage: false });
      await page.evaluate(SNIP.scrollBottom);
      await page.waitForTimeout(3000);
      const st2 = await page.evaluate(SNIP.cookiesAndStorage);
      const cookies2 = await ctx.cookies();
      preStorage.afterScroll = { cookies: cookies2.map((c) => c.name), localStorage: st2.localStorage.map((k) => k[0]), sessionStorage: st2.sessionStorage.map((k) => k[0]) };
      preConsentRequests = requests.slice(); // the L4/L6 host list: home load + scroll, before any click or navigation
      homeMeta = await page.evaluate(SNIP.meta);
      const rendered = await page.evaluate(SNIP.anchors);
      const same = rendered.filter((a) => /^https?:/.test(a) && etld1(hostOf(a)) === ownDomain && hostOf(a).replace(/^www\./, '') === originHost.replace(/^www\./, '') && !/\.(pdf|jpe?g|png|gif|svg|webp|mp4|zip|xml|txt|ico|css|js)$/i.test(new URL(a).pathname)).map(stripSlash);
      const staticRoutes = links && links.routes.length > 1 ? links.routes.map((r) => stripSlash(r.href)) : [];
      routeList = { source: staticRoutes.length ? links.source : 'rendered', list: [...new Set(staticRoutes.length ? staticRoutes : [stripSlash(homeMeta.url), ...same])].slice(0, MAX_ROUTES) };
    } catch (e) { browserErrorSite = `browser step failed: ${short(e.message, 200)}`; }
  }
  const bFail = bReason || browserErrorSite;

  // (4) route pass ------------------------------------------------------------------------
  const routeData = []; let legalLinkRows = [];
  if (!bFail && page) {
    for (const r of routeList.list) {
      try {
        await page.goto(r, { waitUntil: 'load', timeout: TIMEOUT * 2 }); await page.waitForTimeout(1500);
        const m = await page.evaluate(SNIP.meta); const ll = await page.evaluate(SNIP.legalLinks);
        routeData.push({ route: r, ...m, legalLinks: ll });
      } catch (e) { routeData.push({ route: r, error: short(e.message, 150) }); }
    }
    legalLinkRows = routeData.map((d) => ({ route: d.route, error: d.error || null, impressum: (d.legalLinks || []).filter((l) => /impressum|imprint|legal notice|legal$/i.test(l.text) || /impressum|imprint/i.test(l.href || '')), datenschutz: (d.legalLinks || []).filter((l) => /datenschutz|privacy/i.test(l.text + ' ' + (l.href || ''))) }));
    wr(dir, 'S3-meta.json', routeData.map(({ legalLinks, ...m }) => m));
  }
  const pickTarget = (key, re) => {
    const counts = {};
    for (const row of legalLinkRows) for (const l of row[key]) { const abs = stripSlash(l.abs || ''); if (abs && /^https?:/.test(abs) && !/^#?$/.test(l.href || '')) counts[abs] = (counts[abs] || 0) + 1; }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (best) return { url: best[0], discoveredBy: 'legalLinks' };
    const hint = site.legalHints?.[key]; if (hint) return { url: stripSlash(new URL(hint, origin).href), discoveredBy: 'config hint' };
    return null;
  };
  const impressumT = pickTarget('impressum'); const datenschutzT = pickTarget('datenschutz');
  const legalTexts = {};
  if (!bFail && page) {
    for (const [key, t] of [['impressum', impressumT], ['datenschutz', datenschutzT]]) {
      if (!t) continue;
      try { await page.goto(t.url, { waitUntil: 'load', timeout: TIMEOUT * 2 }); await page.waitForTimeout(1500); const lt = await page.evaluate(SNIP.legalText); lt.status = respStatus[t.url] ?? respStatus[t.url + '/'] ?? null; lt.headings = await page.evaluate(SNIP.headings); legalTexts[key] = lt; wr(dir, key === 'impressum' ? 'L1-impressum.txt' : 'L3-datenschutz.txt', `${lt.url}\ntitle: ${lt.title}\nlang: ${lt.lang}\nh1: ${lt.h1.join(' | ')}\n\n${lt.text}`); }
      catch (e) { legalTexts[key] = { error: short(e.message, 150), url: t.url }; }
    }
  }

  const routesInfo = { source: routeList.source || (links ? links.source : null), cap: MAX_ROUTES, count: routeList.list?.length || 0, list: routeList.list || [], legal: { impressum: impressumT?.url || null, datenschutz: datenschutzT?.url || null, discoveredBy: impressumT?.discoveredBy || datenschutzT?.discoveredBy || null } };

  const B = (id, name, fn) => guard(id, name, async () => { if (bFail) { put(notRun(id, name, bFail)); return; } await fn(); });

  await guard('S2', 'sitemap.xml', async () => {
    const r = await req(origin + '/sitemap.xml');
    const f = wr(dir, 'S2-sitemap.xml', `HTTP ${r.status} ${r.url}\ncontent-type: ${r.type}\n\n${r.text}`);
    const isXml = /<\/?(urlset|sitemapindex)/.test(r.text);
    let locs = [...r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    const children = [];
    if (/<sitemapindex/.test(r.text)) { const kids = locs.slice(0, 5); locs = []; for (const k of kids) { const kr = await req(k); children.push({ url: k, status: kr.status }); locs.push(...[...kr.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1])); } }
    const locStatus = []; for (const l of locs.slice(0, 50)) { const lr = await headOrGet(l); locStatus.push({ loc: l, status: lr.status || lr.error }); }
    const f2 = wr(dir, 'S2-locs.json', { children, locs: locStatus });
    const normLocs = locs.map(stripSlash); const dup = normLocs.filter((l, i) => normLocs.indexOf(l) !== i);
    const routes = (routesInfo.list || []).map(stripSlash); const missing = routes.filter((x) => !normLocs.includes(x));
    const bad = locStatus.filter((l) => l.status !== 200);
    const ok = r.status === 200 && isXml && locs.length > 0 && !bad.length && !dup.length && !missing.length;
    const summary = r.status !== 200 || !isXml ? `${r.status || r.error} ${r.type || ''}${r.status === 200 && !isXml ? ' (not XML)' : ''}` : `${locs.length} <loc>s${children.length ? ` in ${children.length} child sitemaps` : ''}${bad.length ? `, ${bad.length} not 200` : ''}${dup.length ? `, ${dup.length} duplicates` : ''}${missing.length ? `, ${missing.length} routes missing` : ''}`;
    put(check('S2', 'sitemap.xml', ok ? 'pass' : 'fail', 'should-fix', summary, { status: r.status, contentType: r.type, xml: isXml, locCount: locs.length, notOk: bad, duplicates: dup, missingRoutes: missing.slice(0, 30), children }), rel(f), rel(f2));
  });

  await B('S3', 'canonical + hreflang per route', async () => {
    const langRouted = routeData.some((d) => site.languages.some((l) => new RegExp(`^/${l}(/|$)`).test(new URL(d.route).pathname)));
    const bilingual = site.languages.length > 1 && langRouted;
    const rows = routeData.filter((d) => !d.error).map((d) => {
      const canon = d.canonical || []; const self = canon.length === 1 && /^https?:/.test(canon[0]) && stripSlash(canon[0]) === stripSlash(d.url);
      const hl = Object.fromEntries((d.hreflang || []).map(([k, v]) => [k, v]));
      const hlOk = !bilingual || (site.languages.every((l) => Object.keys(hl).some((k) => k.toLowerCase().startsWith(l))) && 'x-default' in hl);
      return { route: d.route, canonical: canon, canonicalOk: self, hreflang: Object.keys(hl), hreflangOk: hlOk };
    });
    const badC = rows.filter((r) => !r.canonicalOk); const badH = rows.filter((r) => !r.hreflangOk);
    const notes = bilingual ? [] : [site.languages.length > 1 ? 'hreflang n-a: languages are not URL-routed (JS toggle)' : 'single-language site: hreflang n-a'];
    put(check('S3', 'canonical + hreflang per route', badC.length || badH.length ? 'fail' : 'pass', 'should-fix', `${rows.length} routes: ${rows.length - badC.length} with a self canonical${bilingual ? `, ${rows.length - badH.length} with a full hreflang set` : ''}`, { routes: rows.length, bilingual, canonicalMissing: badC.map((r) => r.route), hreflangMissing: badH.map((r) => r.route) }, [], notes), rel('S3-meta.json'));
  });

  await B('S4', 'unique title / description', async () => {
    const rows = routeData.filter((d) => !d.error).map((d) => ({ route: d.route, title: d.title, titleLen: d.titleLen, description: (d.description || [])[0] || null }));
    const titles = {}; const descs = {}; for (const r of rows) { if (r.title) titles[r.title] = (titles[r.title] || 0) + 1; if (r.description) descs[r.description] = (descs[r.description] || 0) + 1; }
    const missing = rows.filter((r) => !r.title || !r.description); const dupT = Object.entries(titles).filter(([, n]) => n > 1); const dupD = Object.entries(descs).filter(([, n]) => n > 1);
    const lenT = rows.filter((r) => r.title && (r.titleLen < 10 || r.titleLen > 65)); const lenD = rows.filter((r) => r.description && (r.description.length < 50 || r.description.length > 165));
    const hard = missing.length || dupT.length || dupD.length; const soft = lenT.length || lenD.length;
    const notes = [...lenT.map((r) => `title length ${r.titleLen}: ${r.route}`), ...lenD.map((r) => `description length ${r.description.length}: ${r.route}`)];
    put(check('S4', 'unique title / description', hard || soft ? 'fail' : 'pass', hard ? 'should-fix' : 'note', hard ? `${missing.length} routes without title or description, ${dupT.length} duplicate titles, ${dupD.length} duplicate descriptions` : soft ? `unique, ${lenT.length + lenD.length} length notes` : `${rows.length} routes, all unique and in range`, { routes: rows.length, missing: missing.map((r) => r.route), duplicateTitles: dupT.map(([t, n]) => `${n}x ${t}`), duplicateDescriptions: dupD.map(([t, n]) => `${n}x ${short(t, 60)}`), lengthNotes: notes.length }, [], notes), rel('S3-meta.json'));
  });

  await B('S5', 'Open Graph / Twitter card', async () => {
    const top = routeData.filter((d) => !d.error).filter((d) => { const p = new URL(d.route).pathname.replace(/\/$/, ''); const segs = p.split('/').filter(Boolean); return segs.length <= 1 || (segs.length === 2 && site.languages.includes(segs[0])); });
    const rows = top.map((d) => ({ route: d.route, og: d.og || {}, twitter: d.twitter || {} }));
    const imgs = [...new Set(rows.map((r) => r.og['og:image']).filter(Boolean))]; const imgStatus = {};
    for (const i of imgs.slice(0, 5)) { const ir = await headOrGet(i); imgStatus[i] = { status: ir.status || ir.error, type: ir.type, absolute: /^https?:/.test(i) }; }
    const f = wr(dir, 'S5-og-image.txt', Object.entries(imgStatus).map(([u, s]) => `${s.status} ${s.type} ${u}`).join('\n') || '(no og:image on any route)');
    const noImage = rows.filter((r) => !r.og['og:image'] || !(imgStatus[r.og['og:image']]?.status === 200 && /^image\//.test(imgStatus[r.og['og:image']]?.type || '')));
    const others = rows.filter((r) => !r.og['og:title'] || !r.og['og:description'] || !r.og['og:url'] || !r.twitter['twitter:card']);
    const notes = others.map((r) => `${r.route}: missing ${['og:title', 'og:description', 'og:url'].filter((k) => !r.og[k]).concat(r.twitter['twitter:card'] ? [] : ['twitter:card']).join(', ')}`);
    put(check('S5', 'Open Graph / Twitter card', noImage.length || others.length ? 'fail' : 'pass', noImage.length ? 'should-fix' : 'note', noImage.length ? `og:image missing or not resolving on ${noImage.length} of ${rows.length} top-level routes${others.length ? `; other tags missing on ${others.length}` : ''}` : others.length ? `og:image ok, other tags missing on ${others.length} routes` : `${rows.length} top-level routes complete`, { topLevelRoutes: rows.length, noImage: noImage.map((r) => r.route), otherMissing: others.length, images: imgStatus }, [], notes), rel('S3-meta.json'), rel(f));
  });

  await guard('S6', 'Core Web Vitals', async () => {
    if (!PSI_KEY) { put(notRun('S6', 'Core Web Vitals', 'PAGESPEED_API_KEY not set')); return; }
    const res = {}; const fl = [];
    for (const strategy of ['mobile', 'desktop']) {
      const r = await req(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(origin + '/')}&strategy=${strategy}&category=performance&key=${PSI_KEY}`, { timeout: 120000 });
      fl.push(wr(dir, `S6-psi-${strategy}.json`, r.text || r.error || ''));
      let j = null; try { j = JSON.parse(r.text); } catch { /* noop */ }
      if (!j || j.error) { res[strategy] = { error: j?.error?.message || r.error || `HTTP ${r.status}` }; continue; }
      const a = j.lighthouseResult?.audits || {}; const fm = j.loadingExperience?.metrics || {};
      res[strategy] = { score: Math.round((j.lighthouseResult?.categories?.performance?.score ?? 0) * 100), lab: { lcpMs: a['largest-contentful-paint']?.numericValue ?? null, cls: a['cumulative-layout-shift']?.numericValue ?? null, tbtMs: a['total-blocking-time']?.numericValue ?? null }, field: { lcpMs: fm.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null, cls: fm.CUMULATIVE_LAYOUT_SHIFT_SCORE ? fm.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null, inpMs: fm.INTERACTION_TO_NEXT_PAINT?.percentile ?? null } };
    }
    if (res.mobile?.error && res.desktop?.error) { put(notRun('S6', 'Core Web Vitals', `PSI error: ${short(res.mobile.error, 200)}`), ...fl.map(rel)); return; }
    const labOk = (s) => s && !s.error && s.lab.lcpMs <= 2500 && s.lab.cls <= 0.1 && s.lab.tbtMs <= 200 && s.score >= 90;
    const fieldOk = (s) => !s || s.error || s.field.lcpMs === null || (s.field.lcpMs <= 2500 && s.field.cls <= 0.1 && (s.field.inpMs === null || s.field.inpMs <= 200));
    const mobOk = labOk(res.mobile) && fieldOk(res.mobile); const deskOk = labOk(res.desktop) && fieldOk(res.desktop);
    const notes = []; if (res.mobile && !res.mobile.error && res.mobile.field.lcpMs === null) notes.push('no field data (CrUX) for this origin');
    put(check('S6', 'Core Web Vitals', mobOk && deskOk ? 'pass' : 'fail', mobOk ? 'note' : 'should-fix', `mobile score ${res.mobile?.score ?? res.mobile?.error}, LCP ${res.mobile?.lab?.lcpMs ?? '?'} ms, CLS ${res.mobile?.lab?.cls ?? '?'}, TBT ${res.mobile?.lab?.tbtMs ?? '?'} ms; desktop score ${res.desktop?.score ?? res.desktop?.error}`, res, [], notes), ...fl.map(rel));
  });

  await B('S11', 'favicon', async () => {
    const icons = homeMeta?.icons || []; let tested = null;
    if (icons.length) { const ir = await headOrGet(icons[0]); tested = { url: icons[0], status: ir.status || ir.error, type: ir.type }; }
    if (!tested || !(tested.status === 200 && /^image\//.test(tested.type))) { const ir = await headOrGet(origin + '/favicon.ico'); tested = { url: origin + '/favicon.ico', status: ir.status || ir.error, type: ir.type, fallback: true }; }
    const f = wr(dir, 'S11-favicon.txt', `icons in <head>: ${icons.join(' ') || '(none)'}\ntested ${tested.url} -> ${tested.status} ${tested.type}`);
    const ok = tested.status === 200 && /^image\//.test(tested.type || '');
    put(check('S11', 'favicon', ok ? 'pass' : 'fail', 'note', ok ? `${icons.length} icon links, ${tested.url.replace(origin, '')} 200 ${tested.type}` : `no icon resolves: ${icons.length} icon links, ${tested.url.replace(origin, '')} -> ${tested.status} ${tested.type}`, { icons, tested }), rel(f));
  });

  const legalCheck = async (id, name, key, target) => B(id, name, async () => {
    const rows = legalLinkRows.filter((r) => !r.error); const missing = rows.filter((r) => !r[key].length).map((r) => r.route);
    const t = legalTexts[key]; const renders = t && !t.error && (t.text || '').length > 200;
    const f = wr(dir, `${id}-links.json`, legalLinkRows.map((r) => ({ route: r.route, error: r.error, links: r[key].map((l) => ({ text: l.text, href: l.href, inFooter: l.inFooter })) })));
    const notes = []; if (rows.length && rows.every((r) => r[key].length && !r[key].some((l) => l.inFooter))) notes.push('links are not inside a <footer> element (semantics only)');
    if (target?.discoveredBy === 'config hint') notes.push('target taken from the config hint (no link found on the routes)');
    const ok = rows.length > 0 && !missing.length && renders;
    put(check(id, name, ok ? 'pass' : 'fail', 'blocker (presence)', ok ? `link on all ${rows.length} routes, target ${target.url.replace(origin, '')} renders (${t.text.length} chars, h1 "${t.h1[0] || ''}")` : !rows.length ? 'no routes visited' : missing.length ? `link missing on ${missing.length} of ${rows.length} routes` : `target ${target?.url || '(none)'} does not render: ${t?.error || `${(t?.text || '').length} chars`}`, { routes: rows.length, missingOn: missing, target: target?.url || null, discoveredBy: target?.discoveredBy || null, targetStatus: t?.status ?? null, targetChars: (t?.text || '').length, targetH1: t?.h1 || [] }, [], notes), rel(f), rel(id === 'L1' ? 'L1-impressum.txt' : 'L3-datenschutz.txt'));
  });
  await legalCheck('L1', 'Impressum reachable from every page', 'impressum', impressumT);
  await legalCheck('L3', 'Datenschutz reachable from every page', 'datenschutz', datenschutzT);

  // host list (L4 / L6) = preConsentRequests, the snapshot taken at the end of step (3)
  let vendorRows = [];
  await B('L4', 'Datenschutz names loaded third parties', async () => {
    const reqs = preConsentRequests;
    wr(dir, 'L4-network-requests.txt', reqs.map((r, i) => `${i + 1}. [${r.method}] ${r.url} => [${respStatus[r.url] ?? '-'}] ${r.type}`).join('\n'));
    const counts = {}; for (const r of reqs) { const h = hostOf(r.url); if (h) counts[h] = (counts[h] || 0) + 1; }
    wr(dir, 'L4-hosts.txt', Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${String(n).padStart(7)} https://${h}`).join('\n'));
    const third = Object.keys(counts).filter((h) => etld1(h) !== ownDomain);
    const byVendor = new Map();
    for (const h of third) { const sample = reqs.find((r) => hostOf(r.url) === h).url; const v = vendorFor(sample); const key = v ? v.vendor : `unknown: ${h}`; if (!byVendor.has(key)) byVendor.set(key, { vendor: key, known: !!v, hosts: [], essential: v ? v.essential : false, names: v ? v.names : [h, etld1(h)], requests: 0 }); const e = byVendor.get(key); e.hosts.push(h); e.requests += counts[h]; }
    if (hosting) { const hv = TP.vendors.find((v) => v.vendor === hosting); byVendor.set(`${hosting} (hosting)`, { vendor: `${hosting} (hosting)`, known: true, hosts: [], essential: true, names: hv ? hv.names : [hosting], requests: 0, hosting: true }); }
    const text = (legalTexts.datenschutz?.text || '').toLowerCase();
    vendorRows = [...byVendor.values()].map((e) => { const searched = [...e.names, ...e.hosts]; const hit = text ? searched.find((n) => text.includes(n.toLowerCase())) : null; return { ...e, searched, named: !!hit, namedBy: hit || null }; });
    const f = wr(dir, 'L4-vendors.json', vendorRows);
    const unnamed = vendorRows.filter((v) => !v.named); const unknown = vendorRows.filter((v) => !v.known).map((v) => v.hosts).flat();
    const namedNotLoaded = text ? TP.vendors.filter((v) => !vendorRows.some((r) => r.vendor === v.vendor || r.vendor === `${v.vendor} (hosting)`) && v.names.some((n) => n.length > 4 && text.includes(n.toLowerCase()))).map((v) => v.vendor) : [];
    const gf = third.some((h) => /^fonts\.(googleapis|gstatic)\.com$/.test(h));
    const notes = [...(hosting ? [`hosting provider identified from the Server header: ${hosting}`] : []), ...(unknown.length ? [`unknown hosts (not in third-parties.md): ${unknown.join(', ')}`] : []), ...(namedNotLoaded.length ? [`named but not loaded on home (stale text hint): ${namedNotLoaded.join(', ')}`] : []), ...(gf ? ['Google Fonts loaded remotely - context only, no verdict: LG Muenchen I, 3 O 17493/20 (2022-01-20) treated the IP transfer via remote Google Fonts without consent as a GDPR violation'] : [])];
    if (!text) { put(notRun('L4', 'Datenschutz names loaded third parties', `no Datenschutz text (${legalTexts.datenschutz?.error || 'target not found'}); ${third.length} third-party hosts recorded`), rel('L4-network-requests.txt'), rel('L4-hosts.txt'), rel(f)); return; }
    put(check('L4', 'Datenschutz names loaded third parties', unnamed.length ? 'fail' : 'pass', 'should-fix (presence)', unnamed.length ? `${unnamed.length} of ${vendorRows.length} loaded third parties unnamed: ${unnamed.map((v) => v.vendor).join(', ')}` : `${vendorRows.length} loaded third parties all named (${vendorRows.map((v) => v.vendor).join(', ') || 'none loaded'})`, { hosts: counts, thirdPartyHosts: third, vendors: vendorRows.map(({ names, ...v }) => v), unnamed: unnamed.map((v) => v.vendor), unnamedCount: unnamed.length, namedNotLoaded, unknownHosts: unknown, googleFontsLoaded: gf }, [], notes), rel('L4-network-requests.txt'), rel('L4-hosts.txt'), rel(f), rel('L3-datenschutz.txt'));
  });

  await B('L5', 'cookies / storage before consent', async () => {
    const keys = [...preStorage.cookies.map((c) => ({ key: c.name, kind: 'cookie', httpOnly: c.httpOnly, domain: c.domain })), ...preStorage.localStorage.map(([k, n]) => ({ key: k, kind: 'localStorage', bytes: n })), ...preStorage.sessionStorage.map(([k, n]) => ({ key: k, kind: 'sessionStorage', bytes: n }))].map((k) => ({ ...k, cls: classifyKey(k.key) }));
    const sc = home.setCookie.map((s) => s.split(';')[0].split('=')[0]).map((k) => ({ key: k, kind: 'Set-Cookie (first response)', cls: classifyKey(k) }));
    const all = [...keys, ...sc.filter((s) => !keys.some((k) => k.key === s.key))];
    const f = wr(dir, 'L5-storage.json', { beforeAnyClick: preStorage, firstResponseSetCookie: home.setCookie, classified: all });
    const bad = all.filter((k) => k.cls === 'non-essential'); const un = all.filter((k) => k.cls === 'unclassified');
    const notes = [...un.map((k) => `unclassified ${k.kind} key "${k.key}"`), 'cookie jar read via Playwright context.cookies() (HttpOnly visible), storage via document; iframe-internal storage not visible'];
    put(check('L5', 'cookies / storage before consent', bad.length ? 'fail' : 'pass', 'blocker (presence)', bad.length ? `non-essential before consent: ${bad.map((k) => k.key).join(', ')}` : all.length ? `only essential/unclassified keys: ${all.map((k) => `${k.key} (${k.cls})`).join(', ')}` : 'nothing set before consent (no cookies, no storage, no Set-Cookie)', { keys: all, nonEssential: bad.map((k) => k.key), unclassified: un.map((k) => k.key) }, [], notes), rel(f));
  });

  await B('L6', 'banner blocks until consent (hosts before consent)', async () => {
    const nonEss = vendorRows.filter((v) => !v.essential && !v.hosting);
    const l5bad = (checks.L5?.evidence?.nonEssential || []).length > 0;
    const f = wr(dir, 'L6-banner.json', { banner, nonEssentialVendorsBeforeConsent: nonEss.map((v) => ({ vendor: v.vendor, hosts: v.hosts, requests: v.requests })) });
    const f2 = wr(dir, 'L6-hosts-before-consent.json', vendorRows.map((v) => ({ vendor: v.vendor, essential: v.essential, hosts: v.hosts })));
    const hasBanner = banner && banner.length > 0;
    const notes = [hasBanner ? `banner candidate: ${short(banner[0].text, 120)}` : 'no banner found', 'the after-accept diff and "reject as easy as accept" are human checks - the script never clicks'];
    let verdict = 'pass', severity = null, summary;
    if (nonEss.length) { verdict = 'fail'; severity = 'blocker (presence)'; summary = `${nonEss.length} non-essential third part${nonEss.length > 1 ? 'ies' : 'y'} contacted before any consent (${nonEss.map((v) => v.vendor).join(', ')}), ${hasBanner ? 'banner present' : 'no banner'}`; }
    else if (l5bad) { verdict = 'fail'; severity = 'blocker (presence)'; summary = 'non-essential storage before consent (see L5)'; }
    else if (hasBanner) { verdict = 'fail'; severity = 'note'; summary = 'banner shown although nothing non-essential is set or contacted (banner without need)'; }
    else summary = 'no banner needed: nothing non-essential set or contacted before consent';
    put(check('L6', 'banner blocks until consent (hosts before consent)', verdict, severity, summary, { banner: hasBanner, bannerText: hasBanner ? banner[0].text : null, nonEssentialVendors: nonEss.map((v) => v.vendor), nonEssentialHosts: nonEss.flatMap((v) => v.hosts), essentialVendors: vendorRows.filter((v) => v.essential).map((v) => v.vendor) }, [], notes), rel(f), rel(f2), rel('L6-home-first-load.png'));
  });

  await B('A1', 'lang attribute', async () => {
    const rows = routeData.filter((d) => !d.error).map((d) => { const lang = (d.lang || '').toLowerCase(); const prim = lang.split('-')[0]; const seg = new URL(d.route).pathname.split('/').filter(Boolean)[0]; const routeLang = site.languages.includes(seg) ? seg : null; return { route: d.route, lang: d.lang, ok: !!prim && site.languages.includes(prim) && (!routeLang || routeLang === prim), routeLang }; });
    const bad = rows.filter((r) => !r.ok);
    const f = wr(dir, 'A1-lang.json', rows);
    put(check('A1', 'lang attribute', bad.length ? 'fail' : 'pass', 'should-fix', bad.length ? `${bad.length} of ${rows.length} routes: lang ${[...new Set(bad.map((r) => JSON.stringify(r.lang || '')))].join('/')} (config expects ${site.languages.join('/')})` : `lang ${[...new Set(rows.map((r) => r.lang))].join('/')} on all ${rows.length} routes`, { routes: rows.length, bad: bad.map((r) => ({ route: r.route, lang: r.lang })), expected: site.languages }), rel(f));
  });

  await B('A2', 'alt on images', async () => {
    await page.goto(origin + '/', { waitUntil: 'load', timeout: TIMEOUT * 2 }); await page.waitForTimeout(1500);
    const r = await page.evaluate(SNIP.imagesWithoutAlt);
    const f = wr(dir, 'A2-images.json', r);
    const missing = r.flagged.filter((i) => i.alt === null); const empty = r.flagged.filter((i) => i.alt === '');
    const notes = empty.length ? [`${empty.length} large images with alt="" (decorative or content? human look): ${empty.slice(0, 5).map((i) => i.src).join(', ')}`] : [];
    put(check('A2', 'alt on images', missing.length ? 'fail' : 'pass', 'should-fix', missing.length ? `${missing.length} of ${r.total} images without an alt attribute: ${missing.slice(0, 5).map((i) => i.src).join(', ')}` : `${r.total} images on home, none without alt${empty.length ? `, ${empty.length} large alt="" for a human look` : ''}`, { total: r.total, missingCount: missing.length, emptyLargeCount: empty.length, missing: missing.slice(0, 10), emptyLarge: empty.slice(0, 10) }, [], notes), rel(f));
  });

  await B('A3', 'heading order', async () => {
    const homeH = await page.evaluate(SNIP.headings); // page is on home after A2
    const pages = { home: homeH }; if (legalTexts.impressum?.headings) pages.impressum = legalTexts.impressum.headings;
    const f = wr(dir, 'A3-headings.json', pages);
    const judge = (hs) => { const lv = hs.map((h) => Number(h[1])); const h1 = lv.filter((l) => l === 1).length; let skipped = false; let prev = 0; for (const l of lv) { if (l > prev + 1 && prev !== 0) skipped = true; prev = l; } return { h1, skipped, count: hs.length }; };
    const res = Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, judge(v)]));
    const badH1 = Object.entries(res).filter(([, r]) => r.h1 !== 1); const skip = Object.entries(res).filter(([, r]) => r.skipped);
    put(check('A3', 'heading order', badH1.length || skip.length ? 'fail' : 'pass', badH1.length ? 'should-fix' : 'note', badH1.length ? badH1.map(([k, r]) => `${k}: ${r.h1} h1`).join(', ') : skip.length ? `one h1 each, level skipped on ${skip.map(([k]) => k).join(', ')}` : Object.entries(res).map(([k, r]) => `${k}: one h1, ${r.count} headings, no skip`).join('; '), res, [], skip.map(([k]) => `heading level skipped on ${k}`)), rel(f));
  });

  await guard('C2', 'e-mail addresses resolve', async () => {
    // addresses: mailto anchors + the rendered text of the two legal pages only (never the HTML source - it carries
    // CDN versions, DSNs and form placeholders); common obfuscations ([at] (at) [punkt] [dot]) are decoded and noted
    const deob = (s) => s.replace(/\s*[\[(]\s*at\s*[\])]\s*/gi, '@').replace(/\s*[\[(]\s*(punkt|dot)\s*[\])]\s*/gi, '.');
    const rawTexts = [legalTexts.impressum?.text, legalTexts.datenschutz?.text].filter(Boolean).join('\n');
    const texts = deob(rawTexts);
    const obfuscated = /[\[(]\s*(at|punkt|dot)\s*[\])]/i.test(rawTexts);
    const mailtos = [...(legalTexts.impressum?.mailtos || []), ...(legalTexts.datenschutz?.mailtos || [])].map((m) => m.replace(/^mailto:/i, '').split('?')[0]);
    const found = [...new Set([...mailtos, ...(texts.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])].map((a) => a.toLowerCase().replace(/[.,;:)]+$/, '')).filter((a) => /^[\w.+-]+@[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/.test(a) && !/\.(png|jpe?g|svg|gif|webp|js|css)$/i.test(a) && !/@(example|sentry)\./.test(a)))];
    const domains = [...new Set([ownDomain, ...found.map((a) => a.split('@')[1])])];
    const alt = new Resolver(); alt.setServers(['1.1.1.1']);
    const dnsRes = {};
    for (const d of domains) {
      const e = { domain: d, mx: [], mxResolver: 'system', spf: null, dmarc: null, dmarcPolicy: null, errors: [] };
      try { e.mx = (await dns.resolveMx(d)).map((m) => `${m.priority} ${m.exchange}`); } catch (x) { e.errors.push(`mx: ${x.code || x.message}`); }
      if (!e.mx.length) { try { e.mx = (await alt.resolveMx(d)).map((m) => `${m.priority} ${m.exchange}`); e.mxResolver = '1.1.1.1'; } catch (x) { e.errors.push(`mx@1.1.1.1: ${x.code || x.message}`); } }
      try { const txt = (await dns.resolveTxt(d)).map((t) => t.join('')); e.spf = txt.find((t) => /^v=spf1/i.test(t)) || null; } catch (x) { e.errors.push(`txt: ${x.code || x.message}`); }
      try { const txt = (await dns.resolveTxt(`_dmarc.${d}`)).map((t) => t.join('')); e.dmarc = txt.find((t) => /^v=DMARC1/i.test(t)) || null; e.dmarcPolicy = e.dmarc ? (e.dmarc.match(/\bp=([a-z]+)/i) || [])[1] || 'malformed (no p= tag)' : null; } catch (x) { e.errors.push(`_dmarc: ${x.code || x.message}`); }
      dnsRes[d] = e;
    }
    const f = wr(dir, 'C2-dns.json', dnsRes); const f2 = wr(dir, 'C2-addresses.json', { addresses: found, mailtos });
    const addrDomains = found.map((a) => a.split('@')[1]); const noMx = [...new Set(addrDomains)].filter((d) => !dnsRes[d].mx.length);
    const notes = []; for (const d of domains) { const e = dnsRes[d]; if (!e.spf) notes.push(`${d}: no SPF record`); if (!e.dmarc) notes.push(`${d}: no DMARC record`); else if (e.dmarcPolicy === 'none') notes.push(`${d}: DMARC p=none (monitoring only)`); else if (/malformed/.test(e.dmarcPolicy)) notes.push(`${d}: DMARC record without p= tag ("${e.dmarc}")`); if (e.mxResolver === '1.1.1.1') notes.push(`${d}: MX only found via 1.1.1.1`); }
    if (!found.length) notes.push('no e-mail address found on the legal pages (DNS checked for the site domain only)');
    if (obfuscated) notes.push('an address on the legal pages is obfuscated ([at]/[punkt]) - decoded for the DNS check; not a mailto link');
    put(check('C2', 'e-mail addresses resolve', noMx.length ? 'fail' : 'pass', 'should-fix', noMx.length ? `no MX for ${noMx.join(', ')} (addresses: ${found.filter((a) => noMx.includes(a.split('@')[1])).join(', ')})` : `${found.length} address${found.length === 1 ? '' : 'es'} on ${[...new Set(addrDomains)].join(', ') || '(none)'}; MX ok${notes.length ? `; ${notes.length} SPF/DMARC notes` : ''}`, { addresses: found, domains: Object.fromEntries(domains.map((d) => [d, { mx: dnsRes[d].mx.length > 0, spf: !!dnsRes[d].spf, dmarc: !!dnsRes[d].dmarc, dmarcPolicy: dnsRes[d].dmarcPolicy }])), noMx, dns: dnsRes }, [], notes), rel(f), rel(f2));
  });

  // Plausible (optional)
  let plausible;
  if (!PLAUSIBLE_KEY) plausible = { status: 'not-run', reason: 'PLAUSIBLE_API_KEY not set' };
  else if (!site.plausibleSiteId) plausible = { status: 'n/a', reason: 'site not added to the account' };
  else {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
      const r = await fetch('https://plausible.io/api/v2/query', { method: 'POST', signal: ctl.signal, headers: { authorization: `Bearer ${PLAUSIBLE_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ site_id: site.plausibleSiteId, metrics: ['visitors', 'pageviews'], date_range: '7d' }) });
      clearTimeout(t); const j = await r.json().catch(() => ({}));
      if (r.status === 200) { const row = (j.results || [])[0]?.metrics || []; plausible = { status: 'ok', siteId: site.plausibleSiteId, visitors7d: row[0] ?? null, pageviews7d: row[1] ?? null }; }
      else plausible = { status: r.status === 401 || r.status === 403 ? 'not-run' : 'n/a', reason: `HTTP ${r.status} ${short(j.error || JSON.stringify(j), 120)}` };
    } catch (e) { plausible = { status: 'not-run', reason: short(e.message, 120) }; }
  }

  if (ctx) await ctx.close().catch(() => {});

  const ORDER = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'L1', 'L3', 'L4', 'L5', 'L6', 'A1', 'A2', 'A3', 'C2'];
  const NAMES = { S1: 'robots.txt', S2: 'sitemap.xml', S3: 'canonical + hreflang per route', S4: 'unique title / description', S5: 'Open Graph / Twitter card', S6: 'Core Web Vitals', S7: 'broken links', S8: 'HTTP -> HTTPS, www/apex', S9: 'TLS', S10: '404 page', S11: 'favicon', L1: 'Impressum reachable from every page', L3: 'Datenschutz reachable from every page', L4: 'Datenschutz names loaded third parties', L5: 'cookies / storage before consent', L6: 'banner blocks until consent (hosts before consent)', A1: 'lang attribute', A2: 'alt on images', A3: 'heading order', C2: 'e-mail addresses resolve' };
  const list = ORDER.map((id) => checks[id] || notRun(id, NAMES[id], 'not executed'));
  if (site.germanLaw === false) for (const c of list) if (/^L/.test(c.id)) Object.assign(c, { verdict: 'n-a', severity: null, summary: 'applicable law not checked (owner is not a German company)' });
  const counts = { pass: 0, fail: 0, 'n-a': 0, 'not-run': 0, blocker: 0, 'should-fix': 0, note: 0 };
  for (const c of list) { counts[c.verdict]++; if (c.verdict === 'fail') counts[(c.severity || '').split(' ')[0]]++; }
  const result = {
    schema: 'site-audit/1', site: site.site, company: site.company, origin,
    run: { startedAt: started, finishedAt: new Date().toISOString(), script: 'site-audit.mjs', scriptVersion: SCRIPT_VERSION, node: process.version, playwright: pwVersion, chromium: browserVersion, source: 'script', browserError: bFail || null },
    frame: { languages: site.languages, germanLaw: site.germanLaw, sellsOnline: site.sellsOnline ?? null, apex: site.apex ?? null, hosting, note: site.note || null },
    routes: routesInfo, checks: list,
    humanOnly: ['L2', 'L7', 'L8', 'A4', 'A5', 'C1', 'C3', 'L6-after-accept'],
    notJudged: list.filter((c) => c.verdict === 'not-run').map((c) => ({ id: c.id, reason: c.summary })),
    plausible, counts,
  };
  writeFileSync(join(OUT, `${site.site}.json`), JSON.stringify(result, null, 2));
  for (const c of list) console.log(`  ${c.id.padEnd(4)} ${c.verdict.padEnd(8)} ${(c.severity || '').padEnd(22)} ${c.summary}`);
  console.log(`  -> ${counts.pass} pass, ${counts.fail} fail (${counts.blocker} blocker, ${counts['should-fix']} should-fix, ${counts.note} note), ${counts['n-a']} n-a, ${counts['not-run']} not-run`);
  return result;
}
// Pre-consent request snapshot (module-level so the check closures see it): reset per site, assigned at the
// end of step (3) right after the scroll wait - the requests array itself keeps growing during the route pass.
let preConsentRequests = [];

// ---------------------------------------------------------------- summary + diff
const sevRank = (c) => c.verdict !== 'fail' ? 9 : /blocker/.test(c.severity) ? 0 : /should-fix/.test(c.severity) ? 1 : 2;
function summaryMd(results) {
  const lines = [`# Site audit ${TODAY} - mechanical subset (site-audit.mjs v${SCRIPT_VERSION})`, '', `Run: ${results[0]?.run.startedAt || ''} -> ${results[results.length - 1]?.run.finishedAt || ''} · Node ${process.version} · Playwright ${pwVersion || 'n/a'} (${browserVersion || browserError || 'no browser'}) · PAGESPEED_API_KEY ${PSI_KEY ? 'set' : 'not set'} · PLAUSIBLE_API_KEY ${PLAUSIBLE_KEY ? 'set' : 'not set'}`, '', 'Verdicts and severities per SKILL.md, applied mechanically. Legal rows are presence findings; a lawyer decides wording. Human-only checks (never judged here): L2 L7 L8 A4 A5 C1 C3, L6 after-accept, every lawyer item.', ''];
  for (const r of results) {
    lines.push(`## Site: ${r.origin} - audited ${r.run.startedAt.slice(0, 10)}, production (company ${r.company})`, '');
    lines.push(`Routes: ${r.routes.count} (${r.routes.source || '?'}) · legal: ${r.routes.legal.impressum || '-'} / ${r.routes.legal.datenschutz || '-'}${r.frame.hosting ? ` · hosting ${r.frame.hosting}` : ''}${r.run.browserError ? ` · browser: ${r.run.browserError}` : ''}`, '');
    lines.push('| id | check | verdict | severity | summary | evidence |', '|---|---|---|---|---|---|');
    const fails = r.checks.filter((c) => c.verdict === 'fail').sort((a, b) => sevRank(a) - sevRank(b));
    for (const c of fails) lines.push(`| ${c.id} | ${c.name} | fail | ${c.severity} | ${c.summary.replace(/\|/g, '/')} | ${c.files[0] || ''} |`);
    for (const v of ['pass', 'n-a', 'not-run']) { const cs = r.checks.filter((c) => c.verdict === v); if (cs.length) lines.push(`| ${cs.map((c) => c.id).join(' ')} | | ${v} | | ${v === 'pass' ? cs.map((c) => `${c.id}: ${c.summary}`).join(' · ').replace(/\|/g, '/') : cs.map((c) => `${c.id}: ${c.summary}`).join(' · ').replace(/\|/g, '/')} | |`); }
    lines.push('');
    const notes = r.checks.flatMap((c) => c.notes.map((n) => `${c.id}: ${n}`)); if (notes.length) lines.push(`Notes: ${notes.join(' · ')}`, '');
    lines.push(`Not judged: ${r.notJudged.length ? r.notJudged.map((n) => `${n.id} (${n.reason})`).join('; ') : 'every mechanical check ran'}. Human checks pending: ${r.humanOnly.join(' ')}.`, '');
    lines.push(`Plausible (7d): ${r.plausible.status === 'ok' ? `${r.plausible.visitors7d} visitors, ${r.plausible.pageviews7d} pageviews` : `${r.plausible.status} - ${r.plausible.reason}`}`, '');
    lines.push(`Counts: ${r.counts.pass} pass · ${r.counts.fail} fail (${r.counts.blocker} blocker, ${r.counts['should-fix']} should-fix, ${r.counts.note} note) · ${r.counts['n-a']} n-a · ${r.counts['not-run']} not-run`, '');
  }
  return lines.join('\n');
}
const detailKey = (c) => {
  const e = c.evidence || {};
  switch (c.id) {
    case 'L4': return JSON.stringify({ hosts: Object.keys(e.hosts || {}).filter((h) => (e.thirdPartyHosts || Object.keys(e.hosts || {})).includes(h)).sort(), unnamed: e.unnamedCount ?? (e.unnamed || []).length });
    case 'L6': return JSON.stringify({ hosts: (e.nonEssentialHosts || []).slice().sort() });
    case 'S7': return JSON.stringify((e.brokenInternal || []).map((b) => b.url).sort());
    case 'C2': return JSON.stringify(Object.fromEntries(Object.entries(e.domains || {}).map(([d, v]) => [d, { mx: v.mx, spf: v.spf, dmarc: v.dmarc }])));
    case 'S2': return JSON.stringify({ locs: e.locCount ?? null });
    case 'A2': return JSON.stringify({ missing: e.missingCount ?? null });
    case 'S9': return JSON.stringify({ validTo: (e.hosts || [])[0]?.validTo ?? e.validTo ?? null });
    case 'L5': return JSON.stringify((e.keys || []).map((k) => k.key).sort());
    default: return null;
  }
};
const fmt = (c) => `${c.verdict}${c.severity ? ` · ${c.severity}` : ''} — ${short(c.summary, 110).replace(/\|/g, '/')}`;
function diffMd(results, prevDir) {
  const prev = {};
  for (const f of readdirSync(prevDir).filter((f) => f.endsWith('.json'))) { try { const j = JSON.parse(readFileSync(join(prevDir, f), 'utf8')); if (j.schema === 'site-audit/1') prev[j.site] = j; } catch { /* skip */ } }
  const lines = [`# Diff - previous run ${prevDir} -> this run ${OUT}`, ''];
  for (const r of results) {
    const p = prev[r.site];
    if (!p) { lines.push(`### ${r.site} - first run (no previous)`, ''); continue; }
    lines.push(`### ${r.site} - previous ${p.run.startedAt.slice(0, 10)} (${p.run.source}) -> now ${r.run.startedAt.slice(0, 10)}`, '', '| check | previous | now | changed? |', '|---|---|---|---|');
    const ids = [...new Set([...p.checks.map((c) => c.id), ...r.checks.map((c) => c.id)])];
    const rows = ids.map((id) => {
      const a = p.checks.find((c) => c.id === id); const b = r.checks.find((c) => c.id === id);
      let ch = 'same';
      if (!a) ch = 'new'; else if (!b) ch = 'dropped'; else if (a.verdict !== b.verdict) ch = 'verdict'; else if ((a.severity || '') !== (b.severity || '')) ch = 'severity (verdict same)';
      else if (a.verdict === 'not-run' && a.summary !== b.summary) ch = 'same verdict, reason differs';
      else { const da = detailKey(a), db = detailKey(b); if (da && db && da !== db) ch = 'detail'; }
      return { id, name: (b || a).name, prev: a ? fmt(a) : '-', now: b ? fmt(b) : '-', ch };
    });
    const changed = rows.filter((x) => x.ch !== 'same' && !/reason differs/.test(x.ch)); const same = rows.filter((x) => x.ch === 'same' || /reason differs/.test(x.ch));
    for (const x of [...changed, ...same]) lines.push(x.ch === 'same' ? `| ${x.id} ${x.name} | ${x.prev} | ${x.now} | same |` : `| **${x.id} ${x.name}** | ${x.prev} | **${x.now}** | **${x.ch}** |`);
    lines.push('', `changed: ${changed.length} (${changed.map((x) => `${x.id}: ${x.ch}`).join(', ') || '-'}) · same: ${same.length} · new: ${rows.filter((x) => x.ch === 'new').length}`, '');
  }
  for (const s of Object.keys(prev)) if (!results.some((r) => r.site === s)) lines.push(`### ${s} - dropped (in the previous run only)`, '');
  return lines.join('\n');
}

// ---------------------------------------------------------------- main
if (DIFF_ONLY) {
  const results = readdirSync(OUT).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(readFileSync(join(OUT, f), 'utf8')); } catch { return null; } }).filter((j) => j && j.schema === 'site-audit/1' && (!ONLY || ONLY.includes(j.site)));
  const d = diffMd(results, DIFF); writeFileSync(join(OUT, 'diff.md'), d); console.log(`written ${join(OUT, 'diff.md')}\n\n${d}`); process.exit(0);
}
await startBrowser();
if (browserError) console.log(`browser: ${browserError} - [browser] checks will be not-run`); else console.log(`browser: Playwright ${pwVersion}, Chromium ${browserVersion}`);
const results = [];
for (const site of sites) {
  try { results.push(await auditSite(site)); }
  catch (e) {
    console.error(`  site ${site.site} failed: ${e.message}`);
    const r = { schema: 'site-audit/1', site: site.site, company: site.company, origin: site.origin, run: { startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), script: 'site-audit.mjs', scriptVersion: SCRIPT_VERSION, node: process.version, playwright: pwVersion, chromium: browserVersion, source: 'script', browserError: browserError }, frame: { languages: site.languages, germanLaw: site.germanLaw, sellsOnline: site.sellsOnline ?? null, apex: site.apex ?? null, hosting: null }, routes: { source: null, cap: MAX_ROUTES, count: 0, list: [], legal: {} }, checks: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'L1', 'L3', 'L4', 'L5', 'L6', 'A1', 'A2', 'A3', 'C2'].map((id) => notRun(id, id, `site run crashed: ${short(e.message, 200)}`)), humanOnly: ['L2', 'L7', 'L8', 'A4', 'A5', 'C1', 'C3', 'L6-after-accept'], notJudged: [{ id: '*', reason: short(e.message, 200) }], plausible: { status: 'not-run', reason: 'site run crashed' }, counts: { pass: 0, fail: 0, 'n-a': 0, 'not-run': 20, blocker: 0, 'should-fix': 0, note: 0 } };
    writeFileSync(join(OUT, `${site.site}.json`), JSON.stringify(r, null, 2)); results.push(r);
  }
}
if (browser) await browser.close().catch(() => {});
try {
  writeFileSync(join(OUT, 'summary.md'), summaryMd(results));
  console.log(`\nwritten ${join(OUT, 'summary.md')}`);
  if (DIFF) { const d = diffMd(results, DIFF); writeFileSync(join(OUT, 'diff.md'), d); console.log(`written ${join(OUT, 'diff.md')}\n\n${d}`); }
} catch (e) { console.error(`could not write output: ${e.message}`); process.exit(1); }
