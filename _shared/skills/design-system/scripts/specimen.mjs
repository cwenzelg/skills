#!/usr/bin/env node
// specimen.mjs - the whole design system as ONE self-contained page: what a human approves
// (specimen/APPROVED.md) before any screen is drawn from it, and what a designer reviews.
// Character and rules, open points, every colour role per mode and brand with its source, grounds/
// gradients/glass, typefaces and the type scale, shape and shadows, the foundations, every
// component in every mode (and brand) next to its spec, the reference screens and the don'ts -
// with a mode switch and a brand switch. Images and listed font files are inlined.
//
//   node specimen.mjs <system folder> [--out <file>] [--fragment <file>] [--pdf [<file>]]
//                     [--link-images] [--playwright-dir <node_modules>]
//
//   --out        the standalone page (default <system>/specimen/index.html)
//   --fragment   the same page without the document skeleton (for a host that adds its own)
//   --pdf        also print it, one run per mode, merged into one PDF
//                (default <system>/specimen/<name>-Design-System.pdf; pdfunite merges, else one file per mode)
//
// The page itself is styled ONLY with the system's own tokens (system.json "site", below), so it
// passes token-audit.mjs against its own system - prose that quotes a value is marked as such.
//
// system.json "site" (every key optional; a missing role falls back, never to an invented value):
//   title, eyebrow, lang               page title, the line above it, the page language
//   roles   { ground, paper, surface, text, muted, accent, line, flagBg, flagText, okBg, okText, focus }
//   radius  { card, inner, pill }      semantic dimension paths
//   type    { display, headline, title, body, label, eyebrow }   semantic typography paths
//   inlineFonts [{ family, file, weight?, style? }]   font files (relative to the system) to inline
//   openPoints  "<DESIGN.md heading>"  default: the first heading starting with "Open points"/"Open questions"
//   componentOrder [names], samples { "<type path>": "<sample text>" }
// A token may carry $extensions["skill.design-system"].preview - a CSS declaration list with
// {aliases} - to show a recipe that is more than a background (glass: fill + backdrop blur).
//
// Exit codes: 0 written · 1 the token files do not resolve, or the PDF could not be printed · 2 usage.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCss } from './build-tokens.mjs';
import { colorLiterals } from './lib/color.mjs';
import { SPECIMEN_SECTIONS } from './lib/contract.mjs';
import { EXT, cssName, loadSystem, resolveAll } from './lib/tokens.mjs';

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const IGNORE = '<!-- design-system-ignore: documentation text quotes values, it styles nothing -->';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
/** One line of documentation text; marked for the audit when it quotes a colour. */
const prose = (html) => (colorLiterals(html).length ? `${html} ${IGNORE}` : html);

/** A small markdown subset: paragraphs, "- " / "1. " lists, pipe tables, ### headings, ``` code ```. One block per line. */
export function md(text) {
  const out = [];
  const lines = String(text ?? '').replace(/<!--[\s\S]*?-->/g, '').trim().split('\n');
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('```')) {
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
      i++;
      out.push(`<pre><code>${body.map((b) => prose(esc(b))).join('\n')}</code></pre>`);
    } else if (l.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push('<div class="tbl"><table>');
      out.push(prose(`<thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`));
      out.push('<tbody>');
      for (const r of body) out.push(prose(`<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`));
      out.push('</tbody></table></div>');
    } else if (/^\s*(- |\d+\. )/.test(l)) {
      const ordered = /^\s*\d+\. /.test(l);
      const items = [];
      for (; i < lines.length && (/^\s*(- |\d+\. )/.test(lines[i]) || (items.length && /^ {2,}\S/.test(lines[i]))); i++) {
        if (/^\s*(- |\d+\. )/.test(lines[i])) items.push(lines[i].replace(/^\s*(- |\d+\. )/, ''));
        else items[items.length - 1] += ' ' + lines[i].trim();
      }
      out.push(ordered ? '<ol>' : '<ul>');
      for (const t of items) out.push(prose(`<li>${inline(t)}</li>`));
      out.push(ordered ? '</ol>' : '</ul>');
    } else if (/^#{1,6} /.test(l)) {
      out.push(prose(`<h4>${inline(l.replace(/^#+ /, ''))}</h4>`));
      i++;
    } else {
      const para = [];
      for (; i < lines.length && lines[i].trim() && !/^(\||```|\s*- |\s*\d+\. |#{1,6} )/.test(lines[i]); i++) para.push(lines[i].trim());
      out.push(prose(`<p>${inline(para.join(' '))}</p>`));
    }
  }
  return out.join('\n');
}

/** "## Heading" -> body, in file order. */
export function sections(text) {
  const map = new Map();
  for (const part of String(text ?? '').split(/^## /m).slice(1)) {
    const [title, ...rest] = part.split('\n');
    map.set(title.trim(), rest.join('\n').trim());
  }
  return map;
}

const isDerived = (s) => /^\s*derived/i.test(String(s ?? ''));
const isAlias = (v) => typeof v === 'string' && /^\{[^{}]+\}$/.test(v);
const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const dataUri = (file) => `data:${MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;

/** Literal tokens of the system (primitives, semantic literals, brand values) with their source. */
export function literalTokens(system) {
  const out = [];
  for (const [p, t] of system.primitives) out.push({ path: p, where: 'primitive', t });
  for (const m of system.modes) for (const [p, t] of system.semantic[m]) if (!isAlias(t.$value)) out.push({ path: p, where: `semantic ${m}`, t });
  for (const [b, br] of Object.entries(system.brands)) for (const [p, t] of br.tokens) out.push({ path: p, where: `brand ${b}`, t });
  return out.map((x) => ({ ...x, source: x.t.$extensions?.[EXT]?.source ?? '', derived: isDerived(x.t.$extensions?.[EXT]?.source) }));
}

/** Open points from DESIGN.md: table rows (first cell = id) or list items. */
export function openPoints(design, heading) {
  const key = heading && design.has(heading) ? heading : [...design.keys()].find((k) => /^open (points|questions)/i.test(k));
  if (!key) return { key: null, items: [] };
  const body = design.get(key);
  const rows = body.split('\n').filter((l) => /^\|/.test(l) && !/^\|[\s:|-]+\|?\s*$/.test(l)).map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  if (rows.length > 1) return { key, items: rows.slice(1).map(([id, q, ...rest]) => ({ id, q, more: rest.filter(Boolean).join(' · ') })) };
  const items = body.split('\n').filter((l) => /^\s*(- |\d+\. )/.test(l)).map((l, i) => {
    const t = l.replace(/^\s*(- |\d+\. )/, '');
    const m = t.match(/^\*\*([^*]+)\*\*\s*[-:–]?\s*(.*)$/);
    return m ? { id: m[1], q: m[2], more: '' } : { id: `${i + 1}`, q: t, more: '' };
  });
  return { key, items };
}

export function specimenHtml(system, outFile, { linkImages = false, fragment = false } = {}) {
  const resolved = resolveAll(system);
  const modes = system.modes;
  const first = resolved[modes[0]];
  const brands = Object.keys(system.brands);
  const site = system.config.site ?? {};
  const has = (p) => Boolean(p) && first.has(p);
  const pick = (...ps) => ps.find(has);
  const legacy = system.config.roles ?? {};
  const R = site.roles ?? {};
  const role = {
    ground: pick(R.ground, legacy.ground, 'bg.ground'),
    surface: pick(R.surface, 'bg.surface', R.ground, legacy.ground),
    paper: pick(R.paper, 'bg.paper', R.surface, 'bg.surface'),
    text: pick(R.text, legacy.text, 'text.body'),
    muted: pick(R.muted, 'text.muted', R.text, legacy.text),
    accent: pick(R.accent, 'text.accent', 'accent.default', R.text, legacy.text),
    line: pick(R.line, 'line.default', 'border.default'),
    flagBg: pick(R.flagBg), flagText: pick(R.flagText),
    okBg: pick(R.okBg), okText: pick(R.okText), focus: pick(R.focus, R.accent, 'accent.default'),
  };
  const v = (p, fallback) => (p ? `var(${cssName(p)})` : fallback);
  const shapeRoles = [...first.values()].filter((t) => t.type === 'dimension' && t.tier === 'semantic' && /radius|shape|corner/i.test(t.path)).map((t) => t.path);
  const guess = (re) => shapeRoles.find((p) => re.test(p));
  const radius = {
    card: pick(site.radius?.card, guess(/card|container|lg|large/i)),
    inner: pick(site.radius?.inner, guess(/inner|chip|soft|sm|small/i)),
    pill: pick(site.radius?.pill, guess(/pill|button/i)),
  };
  const T = site.type ?? {};
  const typeRoles = [...first.values()].filter((t) => t.type === 'typography' && t.tier === 'semantic').map((t) => t.path);
  const type = {
    display: pick(T.display, T.headline, T.title, typeRoles[0]),
    headline: pick(T.headline, T.display, T.title, typeRoles[0]),
    title: pick(T.title, T.headline, typeRoles[0]),
    body: pick(T.body, 'type.body', typeRoles[typeRoles.length - 1]),
    label: pick(T.label, T.body, 'type.body'),
    eyebrow: pick(T.eyebrow, T.label, T.body, 'type.body'),
  };
  const font = (p) => (p ? `font:var(${cssName(p)});letter-spacing:var(${cssName(p)}-letter-spacing,normal)` : 'font:inherit');
  const img = (rel) => (linkImages ? relative(dirname(outFile), join(system.dir, rel)).split('\\').join('/') : dataUri(join(system.dir, rel)));

  // --- documents ---
  const design = sections(readIf(join(system.dir, 'DESIGN.md')));
  const title = site.title ?? `${system.name} Design System`;
  const approved = existsSync(join(system.dir, 'specimen', 'APPROVED.md'));
  const open = openPoints(design, site.openPoints);
  const skip = new Set(['Character', 'Files', 'Status', open.key].filter(Boolean));
  const ruleTiles = [...design].filter(([k]) => !skip.has(k)).map(([k, body]) => `<div class="tile"><h4>${esc(k)}</h4>\n${md(body)}\n</div>`).join('\n');

  // --- counts ---
  const lits = literalTokens(system);
  const derived = lits.filter((x) => x.derived).length;

  // --- colour roles ---
  const semanticPaths = [...new Set(modes.flatMap((m) => [...system.semantic[m].keys()]))];
  const colourPaths = semanticPaths.filter((p) => ['color', 'gradient'].includes(first.get(p)?.type) || /gradient\(/.test(String(first.get(p)?.css)));
  const srcOf = (mode, p) => {
    const t = system.semantic[mode].get(p);
    const own = t?.$extensions?.[EXT]?.source;
    const alias = isAlias(t?.$value) ? t.$value.slice(1, -1) : null;
    const prim = alias ? system.primitives.get(alias)?.$extensions?.[EXT]?.source : null;
    return { own, alias, prim, derived: isDerived(own) || isDerived(prim) };
  };
  const swatch = (mode, p, brand) => `<span class="sw" data-theme="${esc(mode)}"${brand ? ` data-brand="${esc(brand)}"` : ''}><i style="background:var(${cssName(p)})"></i></span>`;
  const brandCols = brands.map((b) => ({ b, mode: system.brands[b].modes[0] ?? modes[0] }));
  const colourRows = colourPaths.map((p) => {
    const cells = modes.map((m) => `<td>${swatch(m, p)}<code class="val">${esc(resolved[m].get(p)?.css)}</code>${srcOf(m, p).derived ? '<span class="tag flag">derived</span>' : ''}</td>`).join('');
    const bcells = brandCols.map(({ b, mode }) => {
      const val = resolved[`brand:${b}:${mode}`].get(p)?.css;
      return val !== resolved[mode].get(p)?.css ? `<td>${swatch(mode, p, b)}<code class="val">${esc(val)}</code></td>` : '<td class="same">base</td>';
    }).join('');
    const src = modes.map((m) => {
      const s = srcOf(m, p);
      return prose(`<p><b>${esc(m)}</b> ${[s.own && inline(s.own), s.prim && `<code>${esc(s.alias)}</code>: ${inline(s.prim)}`].filter(Boolean).join('<br>') || '-'}</p>`);
    }).join('\n');
    return `<tr><td><code>${esc(p)}</code></td>${cells}${bcells}<td class="src"><details><summary>Source</summary>\n${src}\n</details></td></tr>`;
  }).join('\n');

  // --- grounds, gradients, glass: anything whose value is a recipe, or that names a preview ---
  const rawOf = (path) => system.semantic[modes[0]].get(path) ?? system.primitives.get(path);
  const previewOf = (path) => {
    const pv = rawOf(path)?.$extensions?.[EXT]?.preview;
    return pv ? String(pv).replace(/\{([^{}]+)\}/g, (_, x) => `var(${cssName(x)})`) : null;
  };
  const isRecipe = (t) => t.tier !== 'component' && (t.type === 'gradient' || /gradient\(|blur\(/.test(String(t.css)) || previewOf(t.path));
  const shownBySemantic = (t) => t.tier !== 'semantic' && [...first.values()].some((s) => s.tier === 'semantic' && s.alias === t.path);
  const recipeTiles = [...first.values()].filter((t) => isRecipe(t) && !shownBySemantic(t)).map((t) => {
    const style = previewOf(t.path) ?? `background:var(${cssName(t.path)})`;
    const stages = modes.map((m) => `<div class="recipe" data-theme="${esc(m)}"><span class="stage-label">${esc(m)}</span><div class="recipe-box" style="${esc(style)}"></div></div>`).join('');
    const s = rawOf(t.path)?.$extensions?.[EXT]?.source;
    return `<figure class="recipe-fig"><div class="recipe-stages">${stages}</div><figcaption><code>${esc(t.path)}</code>\n${s ? prose(`<small>${inline(s)}</small>`) : ''}</figcaption></figure>`;
  }).join('\n');

  // --- type ---
  const families = [...first.values()].filter((t) => t.type === 'fontFamily').map((t) => `<div class="tile face"><div class="face-sample" style="font-family:var(${cssName(t.path)})">Aa Ää Øø 0123</div><code>${esc(t.path)}</code><small>${esc(t.css)}</small></div>`).join('\n');
  const sample = (p) => site.samples?.[p] ?? (/display|title|head|question|step/.test(p) ? system.name : /label|eyebrow|tag|caption|button/.test(p) ? 'Label 123' : 'The quick brown fox jumps over the lazy dog – Zwölf Boxkämpfer jagen Viktor.');
  const sizeText = (s) => (s && typeof s === 'object' ? `${s.value}${s.unit ?? ''}` : s);
  const typeRows = typeRoles.map((p) => {
    const val = first.get(p).value ?? {};
    const fam = Array.isArray(val.fontFamily) ? val.fontFamily[0] : val.fontFamily;
    const s = system.semantic[modes[0]].get(p)?.$extensions?.[EXT]?.source;
    return `<div class="type-row"><div class="type-meta"><code>${esc(p)}</code><span>${esc(fam)} · ${esc(sizeText(val.fontSize))} / ${esc(sizeText(val.lineHeight))} · ${esc(val.fontWeight)}</span>\n${s ? prose(`<small>${inline(s)}</small>`) : ''}</div><div class="type-sample" style="${font(p)}">${esc(sample(p))}</div></div>`;
  }).join('\n');

  // --- shape, shadow, other dimensions ---
  const dims = [...first.values()].filter((t) => t.type === 'dimension' && t.tier === 'semantic');
  const radii = dims.filter((t) => /radius|shape|corner/i.test(t.path)).map((t) => `<figure class="shape"><div style="border-radius:var(${cssName(t.path)})"></div><figcaption><code>${esc(t.path)}</code> ${esc(t.css)}</figcaption></figure>`).join('\n');
  const otherDims = dims.filter((t) => !/radius|shape|corner/i.test(t.path)).map((t) => `<tr><td><code>${esc(t.path)}</code></td><td><code>${esc(t.css)}</code></td></tr>`).join('\n');
  const shadows = [...first.values()].filter((t) => t.type === 'shadow' && t.tier === 'semantic').map((t) => `<figure class="shape"><div style="box-shadow:var(${cssName(t.path)});background:${v(role.surface, 'transparent')}"></div><figcaption><code>${esc(t.path)}</code></figcaption></figure>`).join('\n');

  // --- foundations ---
  const fDir = join(system.dir, 'foundations');
  const fFiles = existsSync(fDir) ? readdirSync(fDir).filter((f) => f.endsWith('.md')).sort() : [];
  const foundations = fFiles.map((f) => {
    const text = readFileSync(join(fDir, f), 'utf8');
    const h = text.match(/^# (.+)$/m)?.[1] ?? f.replace(/\.md$/, '');
    const [lead, ...rest] = [...sections(text)];
    return `<article class="tile foundation" id="f-${esc(f.replace(/\.md$/, ''))}"><h3>${esc(h)}</h3>\n${lead ? md(lead[1]) : md(text.replace(/^# .+$/m, ''))}\n${rest.map(([k, b]) => `<details><summary>${esc(k)}</summary>\n${md(b)}\n</details>`).join('\n')}</article>`;
  }).join('\n');

  // --- components ---
  const cDir = join(system.dir, 'components');
  const order = site.componentOrder ?? [];
  const names = existsSync(cDir) ? [...new Set(readdirSync(cDir).filter((f) => /\.(md|html)$/.test(f)).map((f) => f.replace(/\.(md|html)$/, '')))] : [];
  names.sort((a, b) => ((order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999)) || a.localeCompare(b));
  const comps = names.map((n) => {
    const spec = readIf(join(cDir, `${n}.md`));
    const snippet = readIf(join(cDir, `${n}.html`));
    const s = sections(spec);
    const h = spec.match(/^# (.+)$/m)?.[1] ?? n;
    const source = spec.match(/^Source: (.+)$/m)?.[1];
    const stage = (m, b) => `<div class="stage" data-theme="${esc(m)}"${b ? ` data-brand="${esc(b)}"` : ''}><span class="stage-label">${esc(b ? `${b} · ${m}` : m)}</span>\n${snippet}\n</div>`;
    const stages = snippet ? [...modes.map((m) => stage(m)), ...brandCols.map(({ b, mode }) => stage(mode, b))].join('\n') : '';
    const block = (k) => (s.has(k) ? `<div><h4>${esc(k)}</h4>\n${md(s.get(k))}\n</div>` : '');
    return `<article class="comp" id="c-${esc(n)}"><header><h3>${esc(h)}</h3>\n${s.has('Purpose') ? md(s.get('Purpose').split('\n\n')[0]) : ''}</header>
${stages ? `<div class="stages">${stages}</div>` : ''}
<div class="spec">${block('Anatomy')}${block('Tokens')}${block('States')}</div>
<div class="dodont"><div class="do">${block('Do')}</div><div class="dont">${block("Don't")}</div></div>
${source ? prose(`<p class="source"><b>Source</b> ${inline(source)}</p>`) : ''}</article>`;
  }).join('\n');

  // --- reference screens ---
  const refNotes = readIf(join(system.dir, 'reference', 'README.md'));
  const noteFor = (file) => (refNotes.split('\n').find((l) => l.includes(file)) ?? '').replace(/^\s*-\s*/, '').replace(/^(`[^`]+`(,\s*`[^`]+`)*)\s*[-–:]\s*/, '');
  const refDirs = [...modes, 'dont'].map((m) => {
    const d = join(system.dir, 'reference', m);
    const files = existsSync(d) ? readdirSync(d).filter((f) => IMAGE.test(f)).sort() : [];
    return files.map((f) => `<figure class="ref${m === 'dont' ? ' dontfig' : ''}"><img src="${img(`reference/${m}/${f}`)}" alt="reference/${esc(m)}/${esc(f)}" loading="lazy"><figcaption><span class="tag${m === 'dont' ? ' flag' : ''}">${m === 'dont' ? "Don't" : esc(m)}</span> <code>reference/${esc(m)}/${esc(f)}</code>\n${prose(inline(noteFor(f)))}</figcaption></figure>`).join('\n');
  });
  const refs = refDirs.slice(0, modes.length).join('\n');
  const donts = refDirs[modes.length];

  // --- fonts ---
  const fontLinks = (system.config.fontImports ?? []).map((u) => `<link rel="stylesheet" href="${esc(u)}">`).join('\n');
  const fontFaces = (site.inlineFonts ?? []).filter((f) => existsSync(join(system.dir, f.file))).map((f) => `@font-face{font-family:'${f.family}';src:url(${dataUri(join(system.dir, f.file))}) format('${extname(f.file) === '.woff2' ? 'woff2' : 'woff'}');font-weight:${f.weight ?? 400};font-style:${f.style ?? 'normal'};font-display:swap}`).join('\n');
  const tokensCss = buildCss(system, resolved).replace(/^@import[^\n]*\n/gm, '');
  const r = (k, fb = '0') => v(radius[k], fb);

  const modeButtons = ['', ...modes].map((m) => `<button type="button" data-mode="${esc(m)}" aria-pressed="${m === '' ? 'true' : 'false'}">${m ? esc(m[0].toUpperCase() + m.slice(1)) : 'System'}</button>`).join('');
  const brandButtons = brands.length ? `<div class="modes" role="group" aria-label="Brand"><button type="button" data-brand-pick="" aria-pressed="true">${esc(system.name)}</button>${brands.map((b) => `<button type="button" data-brand-pick="${esc(b)}" aria-pressed="false">${esc(b)}</button>`).join('')}</div>` : '';
  // the contract (lib/contract.mjs) decides which sections exist and in which order; the ones that depend on the system are filtered here
  const present = { always: true, 'open-points': open.items.length > 0, recipes: Boolean(recipeTiles) };
  const toc = SPECIMEN_SECTIONS.filter((x) => present[x.when]).map((x) => [x.id, x.label]);
  const line = v(role.line, 'currentColor');
  const muted = v(role.muted, 'inherit');

  const css = `${fontFaces}
${tokensCss}
/* Page chrome: every value below is a token of this system (site roles in system.json). */
:root{color-scheme:light}
${modes.includes('dark') ? ':root[data-theme="dark"]{color-scheme:dark}' + (system.config?.defaultMode ? '' : '\n@media (prefers-color-scheme: dark){:root:not([data-theme]){color-scheme:dark}}') : ''}
*{box-sizing:border-box}
body{margin:0;background:${v(role.ground, 'Canvas')};color:${v(role.text, 'CanvasText')};${font(type.body)};-webkit-print-color-adjust:exact;print-color-adjust:exact}
a{color:${v(role.accent, 'inherit')}}
code{font-family:ui-monospace,monospace}
.shell{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:100vh}
.rail{background:${v(role.paper, 'transparent')};border-right:1px solid ${line};padding:28px 18px;position:sticky;top:0;height:100vh;overflow:auto;display:flex;flex-direction:column;gap:20px}
.brand{${font(type.headline)};color:${v(role.text, 'inherit')}}
.brand small{display:block;${font(type.eyebrow)};color:${muted};margin-top:8px}
.toc{display:flex;flex-direction:column;gap:2px}
.toc a{color:${muted};text-decoration:none;${font(type.label)};padding:8px 12px;border-radius:${r('inner')}}
.toc a:hover,.toc a:focus-visible{background:${v(role.surface, 'transparent')};color:${v(role.text, 'inherit')};outline:none}
.modes{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;border:1px solid ${line};border-radius:${r('pill')};width:fit-content}
.modes button{${font(type.label)};color:${muted};background:transparent;border:0;min-height:32px;padding:0 12px;border-radius:${r('pill')};cursor:pointer}
.modes button[aria-pressed="true"]{background:${v(role.surface, 'transparent')};color:${v(role.text, 'inherit')}}
.modes button:focus-visible{outline:2px solid ${v(role.focus, 'currentColor')};outline-offset:2px}
main{padding:40px clamp(16px,4vw,56px) 80px;display:flex;flex-direction:column;gap:56px;max-width:1240px;min-width:0}
section{display:flex;flex-direction:column;gap:18px;scroll-margin-top:24px}
.eyebrow{${font(type.eyebrow)};color:${muted}}
h1{${font(type.display)};margin:0;text-wrap:balance}
h2{${font(type.headline)};margin:0;text-wrap:balance}
h3{${font(type.title)};margin:0}
h4{${font(type.label)};color:${muted};margin:0 0 8px}
p{margin:0;max-width:72ch}
.lede{color:${muted};max-width:66ch}
.meta-strip{display:flex;flex-wrap:wrap;gap:8px}
.tag{display:inline-flex;align-items:center;min-height:22px;padding:0 9px;border-radius:${r('pill')};background:${v(role.surface, 'transparent')};border:1px solid ${line};color:${v(role.text, 'inherit')};${font(type.label)};margin-left:6px;vertical-align:middle;white-space:nowrap}
.meta-strip .tag{margin:0;min-height:28px;padding:0 12px}
.tag.ok{background:${v(role.okBg, v(role.surface, 'transparent'))};color:${v(role.okText, v(role.text, 'inherit'))}}
.tag.flag{background:${v(role.flagBg, v(role.surface, 'transparent'))};color:${v(role.flagText, v(role.text, 'inherit'))}}
.tile{background:${v(role.surface, 'transparent')};border:1px solid ${line};border-radius:${r('card')};padding:22px;min-width:0}
.rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}
ul,ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px}
.open{list-style:none;padding:0;gap:0}
.open li{display:grid;grid-template-columns:64px minmax(0,1fr);gap:12px;padding:14px 4px;border-top:1px solid ${line}}
.open li:first-child{border-top:0}
.oid{${font(type.title)};color:${v(role.accent, 'inherit')}}
.open .more{color:${muted};margin-top:4px}
.tbl{overflow-x:auto;border:1px solid ${line};border-radius:${r('card')};background:${v(role.surface, 'transparent')}}
table{border-collapse:collapse;width:100%}
th{${font(type.label)};color:${muted};text-align:left;padding:12px 14px;border-bottom:1px solid ${line}}
td{padding:10px 14px;border-top:1px solid ${line};vertical-align:top}
tbody tr:first-child td{border-top:0}
td.same{color:${muted}}
.sw{display:inline-block;vertical-align:middle;margin-right:8px;padding:3px;border-radius:${r('inner')};background:${v(role.ground, 'transparent')};border:1px solid ${line}}
.sw i{display:block;width:34px;height:24px;border-radius:${r('inner')}}
.val{white-space:nowrap}
td.src{min-width:110px;color:${muted}}
td.src summary{cursor:pointer;color:${v(role.accent, 'inherit')}}
td.src p{margin-top:6px;min-width:260px}
.recipes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:18px}
.recipe-fig{margin:0;display:flex;flex-direction:column;gap:8px}
.recipe-stages{display:grid;grid-template-columns:repeat(${modes.length},minmax(0,1fr));gap:8px}
.recipe{position:relative;background:${v(role.ground, 'transparent')};border:1px solid ${line};border-radius:${r('card')};padding:36px 14px 14px;overflow:hidden}
.recipe-box{height:96px;border-radius:${r('inner')}}
.faces{display:flex;flex-wrap:wrap;gap:16px}
.face{display:flex;flex-direction:column;gap:6px;width:min(100%,300px)}
.face-sample{${font(type.headline)};font-family:inherit}
.type-row{display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);gap:24px;padding:16px 0;border-top:1px solid ${line};align-items:center}
.type-meta{display:flex;flex-direction:column;gap:3px}
.type-meta small,.recipe-fig small{color:${muted}}
.type-sample{min-width:0;overflow-wrap:anywhere}
.shapes{display:flex;flex-wrap:wrap;gap:20px}
.shape{margin:0;display:flex;flex-direction:column;gap:8px}
.shape div{width:180px;max-width:100%;height:96px;background:${v(role.paper, 'transparent')};border:1px solid ${line}}
.foundation{display:flex;flex-direction:column;gap:12px}
.foundation details summary{cursor:pointer;color:${v(role.accent, 'inherit')}}
.foundation details>*:not(summary){margin-top:10px}
.comp{display:flex;flex-direction:column;gap:16px;padding-top:26px;border-top:1px solid ${line}}
.stages{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:14px}
.stage{position:relative;background:${v(role.ground, 'transparent')};color:${v(role.text, 'inherit')};border:1px solid ${line};border-radius:${r('card')};padding:44px 20px 20px;min-width:0;overflow-x:auto}
.stage-label{position:absolute;top:12px;left:16px;${font(type.eyebrow)};color:${muted}}
.spec{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}
.dodont{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.do,.dont{padding:16px;border-radius:${r('inner')};background:${v(role.paper, 'transparent')}}
.dont{background:${v(role.flagBg, v(role.paper, 'transparent'))};color:${v(role.flagText, 'inherit')}}
.dont h4{color:inherit}
.source{color:${muted}}
.refs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:20px;align-items:start}
.ref{margin:0;display:flex;flex-direction:column;gap:10px}
.ref img{width:100%;border-radius:${r('inner')};border:1px solid ${line}}
.ref figcaption{color:${muted}}
.ref figcaption .tag{margin:0 6px 0 0}
pre{background:${v(role.paper, 'transparent')};border-radius:${r('inner')};padding:14px;overflow-x:auto;margin:0}
footer{color:${muted}}
@media (max-width:860px){.shell{grid-template-columns:minmax(0,1fr)}.rail{position:static;height:auto;border-right:0;border-bottom:1px solid ${line};padding:20px 16px}.toc{flex-direction:row;flex-wrap:wrap}.type-row{grid-template-columns:minmax(0,1fr);gap:8px}.dodont{grid-template-columns:minmax(0,1fr)}.recipe-stages{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
@media print{.rail{display:none}.shell{display:block}main{max-width:none;padding:24px}.comp,.ref,.tile,.recipe-fig,.type-row{break-inside:avoid}
/* a backdrop blur makes the printer rasterise every page (a glass system printed to ~50 MB); the PDF keeps the fill, the page shows the blur */
*{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}}`;

  const body = `<div class="shell">
<aside class="rail">
<div class="brand">${esc(system.name)}<small>Design system · ${approved ? 'approved' : 'draft'}</small></div>
<div class="modes" role="group" aria-label="Mode">${modeButtons}</div>
${brandButtons}
<nav class="toc" aria-label="Contents">${toc.map(([id, l]) => `<a href="#${id}">${esc(l)}</a>`).join('')}</nav>
</aside>
<main>
<section id="top">
<span class="eyebrow">${esc(site.eyebrow ?? system.name)} · ${new Date().toISOString().slice(0, 10)}</span>
<h1>${esc(title)}</h1>
${design.has('Character') ? md(design.get('Character')).replace('<p>', '<p class="lede">') : ''}
<div class="meta-strip"><span class="tag">${lits.length} values</span><span class="tag ok">${lits.length - derived} read from a source</span><span class="tag flag">${derived} derived, to confirm</span>${open.items.length ? `<span class="tag">${open.items.length} open points</span>` : ''}<span class="tag ${approved ? 'ok' : 'flag'}">${approved ? 'Approved' : 'Not approved yet'}</span></div>
</section>
<section id="character"><span class="eyebrow">What it is</span><h2>Character and rules</h2>
<div class="rules">${ruleTiles}</div></section>
${open.items.length ? `<section id="open"><span class="eyebrow">For review</span><h2>${esc(open.key)}</h2>
<p class="lede">Where the reference shows no value, or two sources disagree. Each answer changes a token, not a screen.</p>
<div class="tile"><ol class="open">
${open.items.map((o) => prose(`<li><span class="oid">${esc(o.id)}</span><div><p>${inline(o.q)}</p>${o.more ? `<p class="more">${inline(o.more)}</p>` : ''}</div></li>`)).join('\n')}
</ol></div></section>` : ''}
<section id="colour"><span class="eyebrow">Foundation</span><h2>Colour</h2>
<div class="tbl"><table><thead><tr><th>Role</th>${modes.map((m) => `<th>${esc(m)}</th>`).join('')}${brandCols.map(({ b }) => `<th>${esc(b)}</th>`).join('')}<th>Source</th></tr></thead><tbody>
${colourRows}
</tbody></table></div></section>
${recipeTiles ? `<section id="recipes"><span class="eyebrow">Foundation</span><h2>Grounds, gradients and effects</h2><p class="lede">Every recipe in every mode, on the system's own ground.</p><div class="recipes">
${recipeTiles}
</div></section>` : ''}
<section id="type"><span class="eyebrow">Foundation</span><h2>Typography</h2>
${families ? `<div class="faces">${families}</div>` : ''}
<div>${typeRows}</div></section>
<section id="shape"><span class="eyebrow">Foundation</span><h2>Shape, shadow and spacing</h2>
${radii ? `<div class="shapes">${radii}</div>` : ''}
${shadows ? `<div class="shapes">${shadows}</div>` : ''}
${otherDims ? `<div class="tbl"><table><tbody>${otherDims}</tbody></table></div>` : ''}</section>
<section id="foundations"><span class="eyebrow">How to use it</span><h2>Foundations</h2><div class="rules">
${foundations || '<div class="tile"><p>No foundation files yet.</p></div>'}
</div></section>
<section id="components"><span class="eyebrow">Built from the roles</span><h2>Components</h2>
<p class="lede">Every component in every mode${brands.length ? ' and brand' : ''}, side by side, next to its spec.</p>
${comps || '<p>No components yet.</p>'}
</section>
<section id="reference"><span class="eyebrow">The visual anchor</span><h2>Reference screens</h2>
<div class="refs">${refs}</div>
${donts ? `<h3>Typical mistakes</h3><div class="refs">${donts}</div>` : ''}</section>
<section id="files"><span class="eyebrow">For designers and coders</span><h2>Files and checks</h2>
${design.has('Files') ? `<div class="tile">${md(design.get('Files'))}</div>` : ''}
${design.has('Status') ? `<div class="tile"><h4>Status</h4>${md(design.get('Status'))}</div>` : ''}
<footer>Generated by the design-system skill's specimen.mjs from <code>${esc(basename(system.dir))}/</code>. The tokens, the checks and this page come from the same files.</footer></section>
</main>
</div>
<script>
(function(){
  var root=document.documentElement;
  function press(sel,attr,val){document.querySelectorAll(sel).forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute(attr)===val));});}
  function mode(m){if(m){root.setAttribute('data-theme',m);}else{root.removeAttribute('data-theme');}press('[data-mode]','data-mode',m||'');}
  function brand(b){if(b){root.setAttribute('data-brand',b);}else{root.removeAttribute('data-brand');}press('[data-brand-pick]','data-brand-pick',b||'');}
  document.querySelectorAll('[data-mode]').forEach(function(b){b.addEventListener('click',function(){mode(b.getAttribute('data-mode'));});});
  document.querySelectorAll('[data-brand-pick]').forEach(function(b){b.addEventListener('click',function(){brand(b.getAttribute('data-brand-pick'));});});
  var q=new URLSearchParams(location.search);
  if(q.get('theme'))mode(q.get('theme'));
  if(q.get('brand'))brand(q.get('brand'));
  function openAll(){document.querySelectorAll('details').forEach(function(d){d.open=true;});}
  if(q.get('print'))openAll();
  window.addEventListener('beforeprint',openAll);
})();
</script>`;

  if (fragment) return `<title>${esc(title)}</title>\n${fontLinks}\n<style>\n${css}\n</style>\n${body}\n`;
  return `<!doctype html>
<html lang="${esc(site.lang ?? 'en')}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${fontLinks}
<style>
${css}
</style></head>
<body>
${body}
</body></html>
`;
}

const RASTER_ABOVE = 12 * 1024 * 1024;

/** One mode of the page as A4 pages cut from a single JPEG screenshot (text not selectable). */
async function rasterPdf(browser, htmlFile, mode, out) {
  const width = 1200;
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.emulateMedia({ media: 'screen', colorScheme: mode === 'dark' ? 'dark' : 'light' });
  await page.goto(`${pathToFileURL(htmlFile).href}?theme=${encodeURIComponent(mode)}&print=1`, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '.rail{display:none!important}.shell{display:block!important}main{max-width:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 82 });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.close();
  const pageH = Math.round((width * 297) / 210);
  const n = Math.ceil(height / pageH);
  const src = `data:image/jpeg;base64,${shot.toString('base64')}`;
  const sheets = Array.from({ length: n }, (_, i) => `<div class="p"><img src="${src}" style="top:-${(i * 297).toFixed(2)}mm"></div>`).join('');
  const holder = await browser.newPage();
  await holder.setContent(`<!doctype html><style>@page{size:A4;margin:0}*{margin:0}.p{position:relative;width:210mm;height:297mm;overflow:hidden;break-after:page}.p img{position:absolute;left:0;width:210mm}</style>${sheets}`, { waitUntil: 'load' });
  await holder.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await holder.close();
}

/** Prints the page once per mode and merges the runs (pdfunite); one file per mode without it.
 *  A mode whose vector print is very large (rasterised gradients) is printed from a screenshot instead. */
export async function printPdf(system, htmlFile, pdfFile, { playwrightDir } = {}) {
  const here = dirname(fileURLToPath(import.meta.url));
  const { loadPlaywright } = await import(pathToFileURL(join(here, '..', '..', 'screen-design', 'scripts', 'render-round.mjs')).href);
  const pw = loadPlaywright(playwrightDir ?? process.env.RENDER_ROUND_PLAYWRIGHT_DIR, dirname(htmlFile));
  let browser;
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      browser = await pw.chromium.launch(channel ? { channel } : {});
      break;
    } catch { /* try the next channel */ }
  }
  if (!browser) throw new Error('no browser could be started for the PDF');
  const tmp = mkdtempSync(join(tmpdir(), 'specimen-pdf-'));
  const parts = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    for (const m of system.modes) {
      await page.emulateMedia({ media: 'print', colorScheme: m === 'dark' ? 'dark' : 'light' });
      await page.goto(`${pathToFileURL(htmlFile).href}?theme=${encodeURIComponent(m)}&print=1`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const part = join(tmp, `${m}.pdf`);
      await page.pdf({ path: part, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
      // translucent gradient grounds make the printer rasterise every stage (a mesh/glass system
      // printed to ~25 MB per mode); then print the page from one screenshot instead
      if (statSync(part).size > RASTER_ABOVE) await rasterPdf(browser, htmlFile, m, part);
      parts.push([m, part]);
    }
  } finally {
    await browser.close();
  }
  mkdirSync(dirname(pdfFile), { recursive: true });
  const merged = spawnSync('pdfunite', [...parts.map(([, p]) => p), pdfFile], { encoding: 'utf8' });
  const written = [];
  if (merged.status === 0) written.push(pdfFile);
  else {
    for (const [m, p] of parts) {
      const f = pdfFile.replace(/\.pdf$/i, `-${m}.pdf`);
      writeFileSync(f, readFileSync(p));
      written.push(f);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  return written;
}

async function main(argv) {
  const valueOf = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  const takesValue = new Set(['--out', '--fragment', '--pdf', '--playwright-dir']);
  const dirArg = argv.find((a, i) => !a.startsWith('--') && !takesValue.has(argv[i - 1]));
  if (!dirArg || argv.includes('--help')) {
    console.error('usage: node specimen.mjs <system folder> [--out <file>] [--fragment <file>] [--pdf [<file>]] [--link-images] [--playwright-dir <node_modules>]');
    return argv.includes('--help') ? 0 : 2;
  }
  const dir = resolve(dirArg);
  const out = resolve(valueOf('--out') ?? join(dir, 'specimen', 'index.html'));
  const linkImages = argv.includes('--link-images');
  let system;
  try {
    system = loadSystem(dir);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, specimenHtml(system, out, { linkImages }));
    console.log(`wrote ${out}`);
    const frag = valueOf('--fragment');
    if (frag) {
      writeFileSync(resolve(frag), specimenHtml(system, resolve(frag), { linkImages, fragment: true }));
      console.log(`wrote ${resolve(frag)}`);
    }
  } catch (e) {
    console.error(`error ${e.message}`);
    return 1;
  }
  if (argv.includes('--pdf')) {
    const pdf = resolve(valueOf('--pdf') ?? join(dir, 'specimen', `${system.name.replace(/[^\w]+/g, '-')}-Design-System.pdf`));
    try {
      for (const f of await printPdf(system, out, pdf, { playwrightDir: valueOf('--playwright-dir') })) console.log(`wrote ${f}`);
    } catch (e) {
      console.error(`error printing the PDF: ${e.message}`);
      return 1;
    }
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
