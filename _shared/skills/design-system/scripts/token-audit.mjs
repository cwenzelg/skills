#!/usr/bin/env node
// token-audit.mjs - finds colours, font families, font sizes and corner radii that are not part of
// the design system, in design drafts (variant HTML) or in code. Names file, line and the nearest
// token. Fix the value, never this script.
//
//   node token-audit.mjs <system folder> <file or folder>... [--strict] [--json]
//
// Default ("off-system"): a literal is a finding when it matches NO value of the system (any mode,
//   any brand, any recipe). That is the gate for a design round: nothing invented.
// --strict: additionally every literal outside a custom-property declaration (--x: ...) is a
//   finding even when it matches - the gate for code, which must use var(--...) / the theme.
// A line containing "design-system-ignore" is skipped (say why on that line).
// Scans .html .htm .css .scss .less .vue .svelte .jsx .tsx .js .ts .mjs; skips node_modules,
// .git, dist, build. Exit codes: 0 clean · 1 findings · 2 usage or broken system.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colorLiterals, deltaE, parseColor } from './lib/color.mjs';
import { GENERIC, loadSystem, resolveAll } from './lib/tokens.mjs';

const EXTS = new Set(['.html', '.htm', '.css', '.scss', '.less', '.vue', '.svelte', '.jsx', '.tsx', '.js', '.ts', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.nuxt', '.next', '.output']);
const ROOT_PX = 16;

const px = (s) => {
  const m = String(s).trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? n * ROOT_PX : n;
};
const normFamily = (f) => f.trim().replace(/^["']|["']$/g, '').trim().toLowerCase();

/** What the system allows: colours (with the token they come from), families, font sizes, radii. */
export function allowedValues(system) {
  const colors = [];
  const families = new Set();
  const fontSizes = new Map();
  const radii = new Map();
  for (const [setName, set] of Object.entries(resolveAll(system))) {
    for (const t of set.values()) {
      const path = t.path;
      if (t.type === 'color') {
        const c = parseColor(t.css);
        if (c) colors.push({ color: c, path, set: setName, tier: t.tier, css: t.css });
      }
      for (const lit of colorLiterals(String(t.css))) colors.push({ color: lit.color, path, set: setName, tier: t.tier, css: lit.text });
      if (t.type === 'fontFamily') String(t.css).split(',').forEach((f) => families.add(normFamily(f)));
      if (t.type === 'typography' && t.value && typeof t.value === 'object') {
        const fam = t.value.fontFamily;
        (Array.isArray(fam) ? fam : String(fam ?? '').split(',')).forEach((f) => f && families.add(normFamily(f)));
        const size = px(typeof t.value.fontSize === 'object' ? `${t.value.fontSize.value}${t.value.fontSize.unit}` : t.value.fontSize);
        if (size != null) fontSizes.set(size, path);
      }
      if (t.type === 'dimension') {
        const v = px(t.css);
        if (v == null) continue;
        if (/font|size|text/i.test(path) && !/radius|space|gap/i.test(path)) fontSizes.set(v, path);
        if (/radius|radii|corner|round/i.test(path)) radii.set(v, path);
      }
    }
  }
  return { colors, families, fontSizes, radii };
}

function nearestColor(allowed, c) {
  let best = null;
  for (const a of allowed.colors) {
    const d = deltaE(a.color, c);
    const rank = a.tier === 'semantic' ? 0 : a.tier === 'component' ? 1 : 2;
    if (!best || d < best.d - 0.01 || (Math.abs(d - best.d) <= 0.01 && rank < best.rank)) best = { ...a, d, rank };
  }
  return best;
}
const nearestNumber = (map, v) => [...map].sort((a, b) => Math.abs(a[0] - v) - Math.abs(b[0] - v))[0];

function* walk(target) {
  const st = statSync(target);
  if (st.isFile()) {
    if (EXTS.has(extname(target).toLowerCase())) yield target;
    return;
  }
  for (const name of readdirSync(target).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    yield* walk(join(target, name));
  }
}

/** Audits text; returns findings [{ line, kind, value, message }]. */
export function auditText(text, allowed, { strict = false } = {}) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes('design-system-ignore')) return;
    const n = i + 1;
    const isDecl = /^\s*--[\w-]+\s*:/.test(line) || /(^|[;{\s])--[\w-]+\s*:/.test(line);
    for (const lit of colorLiterals(line)) {
      const near = nearestColor(allowed, lit.color);
      if (!near || near.d > 1) {
        findings.push({ line: n, kind: 'colour', value: lit.text, message: `colour ${lit.text} is not in the system${near ? `; nearest: ${near.path} (${near.css}, ΔE ${near.d.toFixed(1)})` : ''}` });
      } else if (strict && !isDecl) {
        findings.push({ line: n, kind: 'colour', value: lit.text, message: `colour literal ${lit.text} - use the token ${near.path} instead of its value` });
      }
    }
    for (const m of line.matchAll(/font-family\s*:\s*([^;}"<]+)|fontFamily\s*:\s*["'`]([^"'`]+)["'`]/g)) {
      const raw = (m[1] ?? m[2]).trim();
      if (raw.startsWith('var(')) continue;
      for (const f of raw.split(',')) {
        const fam = normFamily(f);
        if (!fam || GENERIC.has(fam) || fam.startsWith('var(') || fam === 'inherit') continue;
        if (!allowed.families.has(fam)) findings.push({ line: n, kind: 'font', value: f.trim(), message: `font family ${f.trim()} is not in the system (allowed: ${[...allowed.families].filter((x) => !GENERIC.has(x)).join(', ') || 'none defined'})` });
        else if (strict && !isDecl) findings.push({ line: n, kind: 'font', value: f.trim(), message: `font family literal ${f.trim()} - use the typeface token` });
      }
    }
    for (const m of line.matchAll(/font-size\s*:\s*(-?[\d.]+(?:px|rem|em))|fontSize\s*:\s*["'`]?(-?[\d.]+(?:px|rem|em))/g)) {
      const v = px(m[1] ?? m[2]);
      if (v == null) continue;
      if (!allowed.fontSizes.has(v)) {
        const near = nearestNumber(allowed.fontSizes, v);
        findings.push({ line: n, kind: 'size', value: m[1] ?? m[2], message: `font size ${m[1] ?? m[2]} is not on the type scale${near ? `; nearest: ${near[1]} (${near[0]}px)` : ''}` });
      } else if (strict && !isDecl) findings.push({ line: n, kind: 'size', value: m[1] ?? m[2], message: `font size literal ${m[1] ?? m[2]} - use the type token` });
    }
    for (const m of line.matchAll(/border-radius\s*:\s*([^;}"<]+)/g)) {
      if (m[1].includes('var(')) continue;
      for (const part of m[1].trim().split(/\s+/)) {
        if (part === '0' || part.endsWith('%')) continue;
        const v = px(part);
        if (v == null || v === 0) continue;
        if (allowed.radii.size && !allowed.radii.has(v)) {
          const near = nearestNumber(allowed.radii, v);
          findings.push({ line: n, kind: 'radius', value: part, message: `radius ${part} is not in the system${near ? `; nearest: ${near[1]} (${near[0]}px)` : ''}` });
        }
      }
    }
  });
  return findings;
}

export function audit(systemDir, targets, opts = {}) {
  const system = loadSystem(systemDir);
  const allowed = allowedValues(system);
  const results = [];
  for (const t of targets) {
    if (!existsSync(t)) throw new Error(`not found: ${t}`);
    for (const file of walk(t)) {
      if (file.startsWith(join(systemDir, 'build'))) continue;
      for (const f of auditText(readFileSync(file, 'utf8'), allowed, opts)) results.push({ file, ...f });
    }
  }
  return { system: system.name, findings: results };
}

function main(argv) {
  const pos = argv.filter((a) => !a.startsWith('--'));
  if (pos.length < 2 || argv.includes('--help')) {
    console.error('usage: node token-audit.mjs <system folder> <file or folder>... [--strict] [--json]');
    return argv.includes('--help') ? 0 : 2;
  }
  let report;
  try {
    report = audit(resolve(pos[0]), pos.slice(1).map((p) => resolve(p)), { strict: argv.includes('--strict') });
  } catch (e) {
    console.error(`error ${e.message}`);
    return 2;
  }
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const f of report.findings) console.log(`${relative(process.cwd(), f.file)}:${f.line}: ${f.message}`);
    console.log(`${report.findings.length} finding(s) against ${report.system}`);
  }
  return report.findings.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
