#!/usr/bin/env node
// render-round.mjs - the one render script of the screen-design skill (replaces the throwaway
// script every Designer session used to write).
//
//   node render-round.mjs <round folder> [--out <dir>] [--hide "<css selectors>"]
//                         [--only variant-a,overview] [--viewports desktop,mobile] [--overview-width <px>]
//                         [--playwright-dir <node_modules>] [--channel chrome|msedge|bundled] [--json]
//
// For every variant-<letter>.html in the round folder and every viewport it writes
//   render-variant-<letter>-<viewport>.png        as drawn, working notes included (team review)
//   render-variant-<letter>-<viewport>-clean.png  every [data-note] element hidden (customer)
// and for overview.html
//   render-overview.png / render-overview-clean.png   (notes hidden in every frame)
//
// --out     write the PNGs somewhere else than the round folder (the round folder is only read)
// --overview-width  viewport width for overview.html (default 1440; the whole page is captured
//           either way, so an overview with a fixed body width needs nothing)
// --hide    extra CSS selectors hidden in the clean renders, for a round drawn before the
//           data-note rule existed, e.g. --hide ".screen-label,.concept,.states"
//
// Exit codes: 0 every render written · 1 a clean render would be empty, a variant has no drawn
// screen outside its notes, or a note is still visible in a clean render (the files are named) ·
// 2 usage or setup (no round folder, no variant, no Playwright, no browser, a bad selector).
//
// Dependencies: Node >= 20 and the Playwright library from an existing install - see
// loadPlaywright() for where it is looked up. The browser is the machine's installed Chrome or
// Edge, else Playwright's own Chromium. Nothing here names a machine path or needs a shell.

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
export const NOTE_SELECTOR = '[data-note]';
const STYLE_ID = 'render-round-clean';
const PAGE_TIMEOUT_MS = 45_000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
};

// Text that only a working note carries: a task / slice / question id, a source file name, an app
// route. Seen in a CLEAN render it is reported as a warning - never a failure, a screen may
// legitimately show a file name.
const NOTE_LIKE = [
  ['id', /\b[A-Z]{2,6}-\d+(?:-[SQD]\d+)*\b/g],
  ['file name', /\b[\w./-]+\.(?:vue|tsx?|jsx?|mjs|md|html|s?css|java|php|json|ya?ml)\b/g],
  ['route', /(?<![\w/.:])\/[a-z][a-z0-9-]*(?:\/[a-z0-9:[\]_-]+)*(?![\w/])/g],
];

export class SetupError extends Error {}

/** Where the per-host Playwright install of this script lives when nothing else has one. */
export function playwrightHome() {
  return join(tmpdir(), 'screen-design-render');
}

/**
 * The Playwright library, from the first place that has it: --playwright-dir /
 * RENDER_ROUND_PLAYWRIGHT_DIR (a node_modules folder, or a folder that has one), the working
 * directory, the round folder, this script's folder (each with its parents, as Node resolves),
 * NODE_PATH, then playwrightHome(). Never installs anything itself.
 */
export function loadPlaywright(dir, roundDir) {
  const bases = [];
  if (dir) bases.push(resolve(dir));
  bases.push(process.cwd());
  if (roundDir) bases.push(roundDir);
  bases.push(dirname(fileURLToPath(import.meta.url)));
  for (const p of (process.env.NODE_PATH ?? '').split(delimiter)) if (p) bases.push(resolve(p));
  bases.push(playwrightHome());
  const require = createRequire(import.meta.url);
  for (const base of bases) {
    for (const name of ['playwright-core', 'playwright']) {
      try {
        return createRequire(join(base, 'noop.js'))(name);
      } catch { /* next */ }
      try {
        return require(join(base, name)); // base IS a node_modules folder
      } catch { /* next */ }
    }
  }
  throw new SetupError(
    'the Playwright library was not found (looked from: ' + [...new Set(bases)].join(', ') + ').\n' +
      'Point at an existing install with --playwright-dir <a node_modules folder that has playwright-core>,\n' +
      'or install it once for this machine (any shell, not inside a project checkout or worktree):\n' +
      `  npm install --prefix "${playwrightHome()}" playwright-core`,
  );
}

async function launchBrowser(pw, channel) {
  const wanted = channel ?? process.env.RENDER_ROUND_CHANNEL;
  const tries = wanted ? [wanted] : ['chrome', 'msedge', 'bundled'];
  const failures = [];
  for (const c of tries) {
    try {
      return await pw.chromium.launch(c === 'bundled' ? {} : { channel: c });
    } catch (e) {
      failures.push(`${c}: ${String(e.message).split('\n')[0]}`);
    }
  }
  throw new SetupError('no browser could be started (' + failures.join(' | ') + '). Install Chrome or Edge, or pass --channel.');
}

/** A static server for `root` on 127.0.0.1 (file:// is not reliable for fonts, assets, iframes). */
function serve(root) {
  const rootReal = realpathSync(root);
  const server = createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = resolve(rootReal, '.' + rel);
    if (file !== rootReal && !file.startsWith(rootReal + sep)) {
      res.writeHead(403).end();
      return;
    }
    let body;
    try {
      body = readFileSync(statSync(file).isDirectory() ? join(file, 'index.html') : file);
    } catch {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, origin: `http://127.0.0.1:${server.address().port}`, root: rootReal }));
  });
}

// Runs inside the page, in every frame: what is visible of the notes and of the drawn screen.
function probeFrame({ noteSelector, hideSelector, styleId, css }) {
  if (css && !document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = css;
    (document.head ?? document.documentElement).appendChild(s);
  }
  const visible = (el) => {
    if (el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility === 'visible' && Number(cs.opacity) !== 0;
  };
  const off = hideSelector ? `${noteSelector},${hideSelector}` : noteSelector;
  const notes = [...document.querySelectorAll(noteSelector)];
  const extra = hideSelector ? [...document.querySelectorAll(hideSelector)] : [];
  let screenElements = 0;
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    if (/^(SCRIPT|STYLE|LINK|META|TEMPLATE|NOSCRIPT|IFRAME|BR)$/.test(el.tagName)) continue;
    if (el.closest(off) || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 1 && r.height >= 1) screenElements++;
  }
  return {
    notes: notes.length,
    notesVisible: notes.filter(visible).length,
    hideMatches: extra.length,
    hideVisible: extra.filter(visible).length,
    screenElements,
    text: document.body ? document.body.innerText : '',
  };
}

function noteLike(text) {
  const hits = [];
  for (const [kind, re] of NOTE_LIKE) {
    for (const m of new Set(text.match(re) ?? [])) hits.push(`${kind} "${m}"`);
  }
  return hits;
}

function urlFor(origin, root, file) {
  return origin + '/' + relative(root, realpathSync(file)).split(sep).map(encodeURIComponent).join('/');
}

/**
 * Renders a round. Returns { round, out, renders: [...], warnings: [...], errors: [...] }; a
 * render that failed its check has `written: false` and an entry in `errors`. Throws SetupError
 * for anything that makes rendering impossible at all.
 */
export async function renderRound({ round, out, hide = '', only = [], viewports = ['desktop', 'mobile'], overviewWidth = VIEWPORTS.desktop.width, playwrightDir, channel } = {}) {
  if (!round) throw new SetupError('no round folder given');
  const roundDir = resolve(round);
  if (!existsSync(roundDir) || !statSync(roundDir).isDirectory()) throw new SetupError(`not a folder: ${roundDir}`);
  for (const v of viewports) if (!VIEWPORTS[v]) throw new SetupError(`unknown viewport "${v}" (known: ${Object.keys(VIEWPORTS).join(', ')})`);
  if (!Number.isInteger(overviewWidth) || overviewWidth < 320) throw new SetupError('--overview-width needs a whole number of pixels, 320 or more');

  const wanted = (name) => only.length === 0 || only.includes(name);
  const variants = readdirSync(roundDir)
    .map((f) => f.match(/^variant-([a-z0-9]+)\.html$/i))
    .filter(Boolean)
    .map((m) => ({ name: `variant-${m[1].toLowerCase()}`, file: join(roundDir, m[0]) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (variants.length === 0) throw new SetupError(`no variant-<letter>.html in ${roundDir}`);
  const jobs = [];
  for (const v of variants.filter((x) => wanted(x.name))) {
    for (const vp of viewports) jobs.push({ source: v.file, kind: 'variant', viewport: vp, base: `render-${v.name}-${vp}` });
  }
  const overview = join(roundDir, 'overview.html');
  if (existsSync(overview) && wanted('overview')) jobs.push({ source: overview, kind: 'overview', viewport: 'desktop', base: 'render-overview' });
  if (jobs.length === 0) throw new SetupError(`--only ${only.join(',')} matches nothing in ${roundDir}`);

  const outDir = resolve(out ?? roundDir);
  mkdirSync(outDir, { recursive: true });
  const hideSelector = hide.trim();
  const css = `${NOTE_SELECTOR}{display:none !important}` + (hideSelector ? `\n${hideSelector}{display:none !important}` : '');

  const pw = loadPlaywright(playwrightDir ?? process.env.RENDER_ROUND_PLAYWRIGHT_DIR, roundDir);
  // served from two levels up (design/draft/), so a variant's ../../assets/ resolves
  const { server, origin, root } = await serve(resolve(roundDir, '..', '..'));
  const browser = await launchBrowser(pw, channel).catch((e) => {
    server.close();
    throw e;
  });
  const report = { round: roundDir, out: outDir, renders: [], warnings: [], errors: [] };
  try {
    for (const job of jobs) {
      for (const mode of ['annotated', 'clean']) {
        const file = join(outDir, job.base + (mode === 'clean' ? '-clean' : '') + '.png');
        const viewport = job.kind === 'overview' ? { ...VIEWPORTS.desktop, width: overviewWidth } : VIEWPORTS[job.viewport];
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.setDefaultTimeout(PAGE_TIMEOUT_MS);
        const missing = new Set();
        page.on('response', (r) => r.status() >= 400 && missing.add(`${r.status()} ${r.url().replace(origin, '')}`));
        page.on('requestfailed', (r) => missing.add(`failed ${r.url().replace(origin, '')}`));
        if (mode === 'clean') {
          // before any script of the page runs, in every frame - an overview that sizes its iframes
          // on load then measures the variants without their notes
          await page.addInitScript(({ id, text }) => {
            const add = () => {
              if (!document.documentElement || document.getElementById(id)) return;
              const s = document.createElement('style');
              s.id = id;
              s.textContent = text;
              (document.head ?? document.documentElement).appendChild(s);
            };
            add();
            document.addEventListener('DOMContentLoaded', add);
          }, { id: STYLE_ID, text: css });
        }
        try {
          await page.goto(urlFor(origin, root, job.source), { waitUntil: 'load' });
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
          const arg = { noteSelector: NOTE_SELECTOR, hideSelector, styleId: STYLE_ID, css: mode === 'clean' ? css : '' };
          const probes = [];
          for (const frame of page.frames()) {
            await frame.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
            probes.push(await frame.evaluate(probeFrame, arg));
          }
          await page.waitForTimeout(150);
          const sum = (k) => probes.reduce((n, p) => n + p[k], 0);
          // the drawn screen of a variant is its own page; of an overview, what its frames show
          const screenElements = job.kind === 'overview' && probes.length > 1 ? probes.slice(1).reduce((n, p) => n + p.screenElements, 0) : probes[0].screenElements;
          const entry = {
            source: relative(roundDir, job.source), kind: job.kind, viewport: job.viewport, mode, file,
            notes: sum('notes'), notesVisible: sum('notesVisible'), hideMatches: sum('hideMatches'), hideVisible: sum('hideVisible'),
            screenElements, written: false,
          };
          if (mode === 'clean') {
            if (entry.notesVisible + entry.hideVisible > 0) {
              report.errors.push(`${file}: ${entry.notesVisible + entry.hideVisible} note element(s) still visible in the clean render of ${entry.source} (an inline "display: ... !important" beats the hiding rule)`);
            } else if (screenElements === 0) {
              report.errors.push(`${file}: the clean render of ${entry.source} (${job.viewport}) would be empty - no drawn screen outside the notes; mark only the notes with data-note, never the screen or a wrapper around it`);
            }
            const leaks = noteLike(probes.map((p) => p.text).join('\n'));
            if (leaks.length) report.warnings.push(`${file}: note-like text still visible in the clean render: ${leaks.slice(0, 12).join(', ')}${leaks.length > 12 ? ` (+${leaks.length - 12} more)` : ''}`);
          }
          if (mode === 'annotated' && missing.size) report.warnings.push(`${entry.source} (${job.viewport}): ${[...missing].join(', ')}`);
          if (!report.errors.some((e) => e.startsWith(file + ':'))) {
            await page.screenshot({ path: file, fullPage: true });
            entry.written = true;
          }
          report.renders.push(entry);
        } catch (e) {
          if (/is not a valid selector|Failed to execute 'querySelectorAll'|Failed to execute 'closest'/.test(String(e.message))) {
            throw new SetupError(`--hide is not a valid CSS selector list: ${hideSelector}`);
          }
          report.errors.push(`${file}: ${String(e.message).split('\n')[0]}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
  return report;
}

function parseArgs(argv) {
  const o = { only: [], json: false };
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new SetupError(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--out') o.out = value();
    else if (a === '--hide') o.hide = value();
    else if (a === '--only') o.only = list(value()).map((n) => n.toLowerCase().replace(/\.html$/, ''));
    else if (a === '--viewports') o.viewports = list(value());
    else if (a === '--overview-width') o.overviewWidth = Number(value());
    else if (a === '--playwright-dir') o.playwrightDir = value();
    else if (a === '--channel') o.channel = value();
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new SetupError(`unknown option ${a}`);
    else if (!o.round) o.round = a;
    else throw new SetupError(`unexpected argument ${a}`);
  }
  return o;
}

const USAGE = 'usage: node render-round.mjs <round folder> [--out <dir>] [--hide "<css selectors>"] [--only variant-a,overview]\n' +
  '                             [--viewports desktop,mobile] [--overview-width <px>] [--playwright-dir <node_modules>]\n' +
  '                             [--channel chrome|msedge|bundled] [--json]';

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    if (opts.help || !opts.round) {
      console.error(USAGE);
      return opts.help ? 0 : 2;
    }
    const report = await renderRound(opts);
    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else for (const r of report.renders) if (r.written) console.log(`wrote ${r.file}${r.mode === 'clean' ? `  (${r.notes + r.hideMatches} note element(s) hidden)` : ''}`);
    for (const w of report.warnings) console.error(`warn  ${w}`);
    for (const e of report.errors) console.error(`error ${e}`);
    if (report.errors.length) {
      console.error(`\n${report.errors.length} render(s) failed - nothing was written for them.`);
      return 1;
    }
    return 0;
  } catch (e) {
    if (!(e instanceof SetupError)) throw e;
    console.error(`error ${e.message}`);
    return 2;
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
const self = fileURLToPath(import.meta.url);
if (invoked && (invoked === self || (existsSync(invoked) && realpathSync(invoked) === realpathSync(self)))) {
  process.exitCode = await main();
}
