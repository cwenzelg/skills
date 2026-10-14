#!/usr/bin/env node
// contrast.mjs - WCAG 2.2 contrast for every text/background pair the system declares, in every
// mode and brand. Glass and other translucent surfaces are measured over the WORST point of what
// lies behind them, never over the mockup's lucky spot. APCA Lc is reported next to it, never a gate.
//
//   node contrast.mjs <system folder> [--pairs <file>] [--json]     (default <system>/checks/contrast-pairs.json)
//
// Pairs file:
//   { "pairs": [
//       { "text": "text.body", "background": "bg.surface", "min": 4.5 },
//       { "text": "text.body", "background": "glass.chip.bg", "over": "bg.ground", "min": 4.5,
//         "label": "chip label on glass over the mesh ground" },
//       { "text": "text.body", "background": "glass.card.bg", "overImage": "reference/light/home.png",
//         "region": [0, 0, 390, 300], "modes": ["light"], "min": 4.5 } ] }
// min: 4.5 normal text, 3 large text (>= 24px, or >= 18.66px bold) and non-text UI (WCAG 2.2 1.4.3 / 1.4.11).
// "over": the backdrop token. Its sample points are $extensions["skill.design-system"].stops when
//   set, else every colour in its CSS value (a mesh/gradient recipe), else its colour.
// "overImage": a rendered PNG behind the surface; every 4th pixel of the region is a sample point.
// Worst point: the lowest ratio over all sample points; when the samples (after compositing the
//   surface over them) run through the text's own lightness, the worst point is 1:1.
// Exit codes: 0 every pair passes in every mode/brand · 1 a pair fails · 2 usage or setup.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apcaLc, colorLiterals, composite, contrastRatio, luminance, parseColor } from './lib/color.mjs';
import { decodePng } from './lib/png.mjs';
import { loadSystem, readJson, resolveAll } from './lib/tokens.mjs';

const WHITE = { r: 255, g: 255, b: 255, a: 1 };

function colorOf(set, path, where) {
  const t = set.get(path);
  if (!t) throw new Error(`${where}: no token "${path}"`);
  const c = parseColor(t.css) ?? colorLiterals(String(t.css))[0]?.color;
  if (!c) throw new Error(`${where}: token "${path}" is not a colour (${t.css})`);
  return c;
}

function backdropSamples(set, path, where) {
  const t = set.get(path);
  if (!t) throw new Error(`${where}: no backdrop token "${path}"`);
  if (Array.isArray(t.stops) && t.stops.length) return t.stops.map((s) => parseColor(typeof s === 'object' && s.color ? s.color : s)).filter(Boolean);
  const lits = colorLiterals(String(t.css)).map((l) => l.color);
  if (lits.length) return lits;
  const c = parseColor(t.css);
  if (!c) throw new Error(`${where}: backdrop "${path}" has no colour to sample`);
  return [c];
}

const imageCache = new Map();
function imageSamples(dir, file, region) {
  const full = resolve(dir, file);
  if (!imageCache.has(full)) {
    if (!existsSync(full)) throw new Error(`backdrop image not found: ${full}`);
    imageCache.set(full, decodePng(readFileSync(full)));
  }
  const img = imageCache.get(full);
  const [x0, y0, w, h] = region ?? [0, 0, img.width, img.height];
  const out = [];
  for (let y = Math.max(0, y0); y < Math.min(img.height, y0 + h); y += 4) {
    for (let x = Math.max(0, x0); x < Math.min(img.width, x0 + w); x += 4) {
      const i = (y * img.width + x) * 4;
      out.push(composite({ r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] / 255 }, WHITE));
    }
  }
  return out;
}

/** The worst contrast of `text` on `bg` laid over every sample point. */
export function worstContrast(text, bg, samples) {
  const backs = (samples?.length ? samples : [WHITE]).map((s) => composite(bg, composite(s, WHITE)));
  const fg = (b) => composite(text, b);
  let worst = null;
  for (const b of backs) {
    const ratio = contrastRatio(fg(b), b);
    if (!worst || ratio < worst.ratio) worst = { ratio, at: b, lc: apcaLc(fg(b), b) };
  }
  if (backs.length > 1 && (text.a ?? 1) === 1) {
    const lums = backs.map(luminance);
    const lt = luminance(text);
    if (Math.min(...lums) < lt && lt < Math.max(...lums)) worst = { ratio: 1, at: null, lc: 0, straddles: true };
  }
  return worst;
}

export function checkContrast(dir, pairsFile = join(dir, 'checks', 'contrast-pairs.json')) {
  if (!existsSync(pairsFile)) throw new Error(`no pairs file ${pairsFile} - list every text/background pair the system uses`);
  const { pairs } = readJson(pairsFile);
  if (!Array.isArray(pairs) || pairs.length === 0) throw new Error(`${pairsFile} has no "pairs"`);
  const system = loadSystem(dir);
  const sets = resolveAll(system);
  const results = [];
  for (const [setName, set] of Object.entries(sets)) {
    const mode = setName.startsWith('brand:') ? setName.split(':')[2] : setName;
    // a brand without this mode stays in its own first mode - it never sits on this mode's
    // backdrop, and its values are already measured under that mode
    if (setName.startsWith('brand:') && !system.brands[setName.split(':')[1]].modes.includes(mode)) continue;
    for (const [i, p] of pairs.entries()) {
      if (p.modes && !p.modes.includes(mode)) continue;
      const where = `${pairsFile} pair ${i + 1} (${setName})`;
      const text = colorOf(set, p.text, where);
      const bg = colorOf(set, p.background, where);
      let samples;
      if (p.overImage) samples = imageSamples(dir, p.overImage, p.region);
      else if (p.over) samples = backdropSamples(set, p.over, where);
      else if ((bg.a ?? 1) < 1) throw new Error(`${where}: "${p.background}" is translucent - say what lies behind it with "over" or "overImage"`);
      const w = worstContrast(text, bg, samples);
      const min = p.min ?? 4.5;
      results.push({
        set: setName, label: p.label ?? `${p.text} on ${p.background}${p.over ? ` over ${p.over}` : ''}`, min,
        ratio: Math.round(w.ratio * 100) / 100, apcaLc: Math.round(w.lc), pass: w.ratio >= min, straddles: Boolean(w.straddles),
        samples: samples?.length ?? 1,
      });
    }
  }
  return { system: system.name, results };
}

function main(argv) {
  const dirArg = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--pairs');
  if (!dirArg || argv.includes('--help')) {
    console.error('usage: node contrast.mjs <system folder> [--pairs <file>] [--json]');
    return argv.includes('--help') ? 0 : 2;
  }
  const pi = argv.indexOf('--pairs');
  let report;
  try {
    report = checkContrast(resolve(dirArg), pi >= 0 ? resolve(argv[pi + 1]) : undefined);
  } catch (e) {
    console.error(`error ${e.message}`);
    return 2;
  }
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const r of report.results) {
      const why = r.straddles ? ' (the backdrop runs through the text colour)' : '';
      console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.set.padEnd(18)} ${String(r.ratio).padStart(5)}:1 (min ${r.min}, APCA Lc ${r.apcaLc}, ${r.samples} sample(s))  ${r.label}${why}`);
    }
  }
  return report.results.every((r) => r.pass) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
