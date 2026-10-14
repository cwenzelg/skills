#!/usr/bin/env node
// visual-compare.mjs - puts a drawn screen next to the approved reference and measures how far it
// is from it. Writes one PNG: reference | screen | difference. Prints three numbers:
//   diff ratio      share of pixels that differ (deltaE > 10) - meaningful for the SAME screen
//                   (a regression check of a specimen or an implemented screen against its design)
//   palette match   share of the screen's pixels whose colour is in the reference's palette
//                   (deltaE <= 12) - a weak hint for a NEW screen: a flat light screen still scores
//                   high against a pastel reference, so it never gates on its own; look at the sheet
//   fonts           (HTML input with --system) every font family the page actually renders that
//                   the system does not have - any one blocks the round
//
//   node visual-compare.mjs --screen <screen.png|variant.html> --reference <reference.png>
//        [--out <compare.png>] [--system <system folder>] [--viewport mobile|desktop|<W>x<H>]
//        [--max-diff <0-1>] [--min-palette <0-1>] [--playwright-dir <node_modules>] [--json]
//
// An HTML screen is rendered with the same Playwright/browser lookup as screen-design's
// render-round.mjs. Exit codes: 0 within limits · 1 over --max-diff, under --min-palette, or a font
// outside the system · 2 usage or setup (missing file, no Playwright for an HTML screen).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deltaE } from './lib/color.mjs';
import { decodePng, encodePng, blankImage } from './lib/png.mjs';
import { GENERIC, loadSystem } from './lib/tokens.mjs';
import { allowedValues } from './token-audit.mjs';

const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
const pixel = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] / 255 };
};

/** Nearest-neighbour scale to a target width, keeping the aspect ratio. */
export function scaleToWidth(img, width) {
  if (img.width === width) return img;
  const f = width / img.width;
  const height = Math.max(1, Math.round(img.height * f));
  const out = blankImage(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / f));
      const sy = Math.min(img.height - 1, Math.floor(y / f));
      const si = (sy * img.width + sx) * 4;
      out.data.set(img.data.subarray(si, si + 4), (y * width + x) * 4);
    }
  }
  return out;
}

const key = (p) => ((p.r >> 3) << 10) | ((p.g >> 3) << 5) | (p.b >> 3);

export function compareImages(reference, screen) {
  const ref = scaleToWidth(reference, screen.width);
  const h = Math.min(ref.height, screen.height);
  const diff = blankImage(screen.width, Math.max(ref.height, screen.height), [0, 0, 0, 255]);
  let differing = 0;
  const cache = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < screen.width; x++) {
      const a = pixel(ref, x, y);
      const b = pixel(screen, x, y);
      const k = key(a) * 32768 + key(b);
      let d = cache.get(k);
      if (d === undefined) {
        d = deltaE(a, b);
        cache.set(k, d);
      }
      const o = (y * screen.width + x) * 4;
      if (d > 10) {
        differing++;
        diff.data[o] = 255; diff.data[o + 1] = 40; diff.data[o + 2] = 90;
      } else {
        const g = Math.round((b.r + b.g + b.b) / 3 * 0.35);
        diff.data[o] = g; diff.data[o + 1] = g; diff.data[o + 2] = g;
      }
    }
  }
  // palette of the reference: 5-bit buckets holding >= 0.1% of its pixels
  const buckets = new Map();
  for (let i = 0; i < ref.data.length; i += 4) {
    const p = { r: ref.data[i], g: ref.data[i + 1], b: ref.data[i + 2] };
    const k = key(p);
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += p.r; e.g += p.g; e.b += p.b;
    buckets.set(k, e);
  }
  const total = ref.width * ref.height;
  const palette = [...buckets.values()].filter((e) => e.n / total >= 0.001).map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, a: 1 }));
  let covered = 0;
  const pcache = new Map();
  for (let i = 0; i < screen.data.length; i += 4) {
    const p = { r: screen.data[i], g: screen.data[i + 1], b: screen.data[i + 2], a: 1 };
    const k = key(p);
    let ok = pcache.get(k);
    if (ok === undefined) {
      ok = palette.some((c) => deltaE(c, p) <= 12);
      pcache.set(k, ok);
    }
    if (ok) covered++;
  }
  // side by side: reference | screen | diff, 16px gutters
  const gap = 16;
  const H = Math.max(ref.height, screen.height);
  const sheet = blankImage(screen.width * 3 + gap * 4, H + gap * 2, [235, 235, 240, 255]);
  const paste = (img, ox) => {
    for (let y = 0; y < img.height; y++) {
      const s = y * img.width * 4;
      sheet.data.set(img.data.subarray(s, s + img.width * 4), ((y + gap) * sheet.width + ox) * 4);
    }
  };
  paste(ref, gap);
  paste(screen, screen.width + gap * 2);
  paste(diff, screen.width * 2 + gap * 3);
  return {
    diffRatio: differing / (h * screen.width),
    paletteMatch: covered / (screen.width * screen.height),
    paletteSize: palette.length,
    sheet,
    sizes: { reference: [reference.width, reference.height], screen: [screen.width, screen.height] },
  };
}

async function renderHtml(file, viewport, playwrightDir) {
  const here = dirname(fileURLToPath(import.meta.url));
  const { loadPlaywright } = await import(pathToFileURL(join(here, '..', '..', 'screen-design', 'scripts', 'render-round.mjs')).href);
  const pw = loadPlaywright(playwrightDir ?? process.env.RENDER_ROUND_PLAYWRIGHT_DIR, dirname(file));
  let browser;
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      browser = await pw.chromium.launch(channel ? { channel } : {});
      break;
    } catch { /* next */ }
  }
  if (!browser) throw new Error('no browser could be started for the HTML screen');
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.addStyleTag({ content: '[data-note]{display:none !important}' });
    const families = await page.evaluate(() => {
      const seen = new Set();
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('[data-note]')) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const first = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
        seen.add(first);
      }
      return [...seen];
    });
    const png = await page.screenshot({ fullPage: true });
    return { image: decodePng(png), families };
  } finally {
    await browser.close();
  }
}

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--screen') o.screen = v();
    else if (a === '--reference') o.reference = v();
    else if (a === '--out') o.out = v();
    else if (a === '--system') o.system = v();
    else if (a === '--viewport') o.viewport = v();
    else if (a === '--max-diff') o.maxDiff = Number(v());
    else if (a === '--min-palette') o.minPalette = Number(v());
    else if (a === '--playwright-dir') o.playwrightDir = v();
    else if (a === '--json') o.json = true;
    else if (a === '--help') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

async function main(argv) {
  let o;
  try {
    o = parse(argv);
  } catch (e) {
    console.error(`error ${e.message}`);
    return 2;
  }
  if (o.help || !o.screen || !o.reference) {
    console.error('usage: node visual-compare.mjs --screen <png|html> --reference <png> [--out <png>] [--system <dir>] [--viewport mobile|desktop|WxH] [--max-diff r] [--min-palette r] [--json]');
    return o.help ? 0 : 2;
  }
  const screenFile = resolve(o.screen);
  const refFile = resolve(o.reference);
  for (const f of [screenFile, refFile]) if (!existsSync(f)) {
    console.error(`error not found: ${f}`);
    return 2;
  }
  const vp = VIEWPORTS[o.viewport ?? 'mobile'] ?? (() => {
    const m = String(o.viewport).match(/^(\d+)x(\d+)$/);
    return m ? { width: +m[1], height: +m[2] } : null;
  })();
  if (!vp) {
    console.error(`error unknown viewport ${o.viewport}`);
    return 2;
  }
  let screen;
  let families = [];
  try {
    if (/\.html?$/i.test(extname(screenFile))) ({ image: screen, families } = await renderHtml(screenFile, vp, o.playwrightDir));
    else screen = decodePng(readFileSync(screenFile));
  } catch (e) {
    console.error(`error ${e.message}`);
    return 2;
  }
  const reference = decodePng(readFileSync(refFile));
  const r = compareImages(reference, screen);
  const out = resolve(o.out ?? join(dirname(screenFile), `compare-${Date.now()}.png`));
  writeFileSync(out, encodePng(r.sheet));
  let foreignFonts = [];
  if (o.system && families.length) {
    const allowed = allowedValues(loadSystem(resolve(o.system)));
    foreignFonts = families.filter((f) => !GENERIC.has(f.toLowerCase()) && !allowed.families.has(f.toLowerCase()));
  }
  const failures = [];
  if (o.maxDiff != null && r.diffRatio > o.maxDiff) failures.push(`diff ratio ${r.diffRatio.toFixed(3)} > ${o.maxDiff}`);
  if (o.minPalette != null && r.paletteMatch < o.minPalette) failures.push(`palette match ${r.paletteMatch.toFixed(3)} < ${o.minPalette}`);
  if (foreignFonts.length) failures.push(`font families outside the system: ${foreignFonts.join(', ')}`);
  const report = { out, diffRatio: r.diffRatio, paletteMatch: r.paletteMatch, paletteSize: r.paletteSize, fonts: families, foreignFonts, sizes: r.sizes, failures };
  if (o.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`wrote ${out}  (reference | screen | difference)`);
    console.log(`diff ratio ${r.diffRatio.toFixed(3)} · palette match ${r.paletteMatch.toFixed(3)} (${r.paletteSize} reference colours)${families.length ? ` · fonts ${families.join(', ')}` : ''}`);
    for (const f of failures) console.error(`FAIL  ${f}`);
  }
  return failures.length ? 1 : 0;
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
