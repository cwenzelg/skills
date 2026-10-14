#!/usr/bin/env node
// specimen.mjs - one HTML page that shows the whole system: every semantic colour role with its
// value per mode, the type scale, radii, shadows, recipes (mesh, glass, gradients), every component
// snippet and the reference images - with a light/dark switch and a brand switch. This page is
// what a human approves (specimen/APPROVED.md) before any screen is drawn from the system.
//
//   node specimen.mjs <system folder> [--out <file>]        (default <system>/specimen/index.html)
//
// Component previews come from components/<name>.html: a plain HTML snippet that uses only the
// system's custom properties (var(--...)). system.json may name { "roles": { "ground": "<path>",
// "text": "<path>" } } - the page itself then sits on the system's own ground and text colour.
// Exit codes: 0 written · 1 the token files do not resolve · 2 usage.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCss } from './build-tokens.mjs';
import { cssName, loadSystem, resolveAll } from './lib/tokens.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const IMAGE = /\.(png|jpe?g|webp)$/i;

export function specimenHtml(system, outFile) {
  const resolved = resolveAll(system);
  const first = resolved[system.modes[0]];
  const roles = system.config.roles ?? {};
  const semanticPaths = [...new Set(system.modes.flatMap((m) => [...system.semantic[m].keys()]))];
  const byType = (type) => [...first.values()].filter((t) => t.type === type);
  const recipes = [...first.values()].filter((t) => t.tier !== 'component' && /gradient|mesh|glass|ground|blur/i.test(t.path + ' ' + t.css) && (t.type === 'gradient' || /gradient|blur/.test(String(t.css))));
  const relDir = (p) => relative(dirname(outFile), join(system.dir, p)).split('\\').join('/');

  const colorRows = semanticPaths.filter((p) => first.get(p)?.type === 'color' || /gradient|rgba|#/.test(String(first.get(p)?.css))).map((p) => `
      <tr><td><span class="sw" style="background:var(${cssName(p)})"></span></td><td><code>${esc(p)}</code></td>
      ${system.modes.map((m) => `<td><code>${esc(resolved[m].get(p)?.css ?? '-')}</code></td>`).join('')}</tr>`).join('');
  const typeRows = byType('typography').map((t) => `
      <div class="type-row"><div class="meta"><code>${esc(t.path)}</code><br><small>${esc(t.css)}</small></div>
      <div style="font:var(${cssName(t.path)})">Every screen starts here – 0123456789</div></div>`).join('');
  const families = byType('fontFamily').map((t) => `<div class="tile"><div style="font-family:var(${cssName(t.path)});font-size:28px">Aa Ää 123</div><code>${esc(t.path)}</code><small>${esc(t.css)}</small></div>`).join('');
  const radii = [...first.values()].filter((t) => t.type === 'dimension' && /radius|corner/i.test(t.path)).map((t) => `<div class="tile"><div class="box" style="border-radius:var(${cssName(t.path)})"></div><code>${esc(t.path)}</code><small>${esc(t.css)}</small></div>`).join('');
  const shadows = byType('shadow').map((t) => `<div class="tile"><div class="box" style="box-shadow:var(${cssName(t.path)});background:#fff"></div><code>${esc(t.path)}</code></div>`).join('');
  const recipeTiles = recipes.map((t) => `<div class="tile wide"><div class="box wide" style="background:var(${cssName(t.path)})"></div><code>${esc(t.path)}</code><small>${esc(String(t.css).slice(0, 160))}</small></div>`).join('');
  const compDir = join(system.dir, 'components');
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => f.endsWith('.html')).sort() : [];
  const compTiles = comps.map((f) => `<figure class="comp"><div class="stage">${readFileSync(join(compDir, f), 'utf8')}</div><figcaption><code>${esc(f.replace(/\.html$/, ''))}</code></figcaption></figure>`).join('');
  const refs = system.modes.map((m) => {
    const d = join(system.dir, 'reference', m);
    const imgs = existsSync(d) ? readdirSync(d).filter((f) => IMAGE.test(f)).sort() : [];
    return imgs.length ? `<h3>${esc(m)}</h3><div class="refs">${imgs.map((f) => `<figure><img src="${esc(relDir(`reference/${m}/${f}`))}" alt="${esc(f)}"><figcaption>${esc(f)}</figcaption></figure>`).join('')}</div>` : '';
  }).join('');
  const brandOptions = ['', ...Object.keys(system.brands)].map((b) => `<option value="${esc(b)}">${b ? esc(b) : system.name + ' (base)'}</option>`).join('');
  const ground = roles.ground ? `var(${cssName(roles.ground)})` : '#f6f6f8';
  const ink = roles.text ? `var(${cssName(roles.text)})` : '#1b1b1f';

  return `<!doctype html>
<html lang="en" data-theme="${esc(system.modes[0])}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(system.name)} specimen</title>
<style>
${buildCss(system, resolved)}
body{margin:0;background:${ground};color:${ink};font:15px/1.5 system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 16px;background:rgba(127,127,127,.15);backdrop-filter:blur(12px)}
header h1{font-size:18px;margin:0 auto 0 0}
button,select{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;cursor:pointer}
button[aria-pressed=true]{background:rgba(127,127,127,.3)}
main{max-width:1200px;margin:0 auto;padding:16px}
section{margin:32px 0}
h2{font-size:14px;letter-spacing:.08em;text-transform:uppercase;opacity:.7}
table{border-collapse:collapse;width:100%;font-size:13px}td{padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.25);vertical-align:middle}
.sw{display:inline-block;width:44px;height:28px;border-radius:6px;border:1px solid rgba(127,127,127,.4)}
.grid{display:flex;flex-wrap:wrap;gap:16px}.tile{display:flex;flex-direction:column;gap:4px;width:160px}.tile.wide{width:320px}
.box{width:120px;height:72px;border:1px solid rgba(127,127,127,.3)}.box.wide{width:320px;height:120px}
small{opacity:.7;word-break:break-all}.type-row{display:grid;grid-template-columns:220px 1fr;gap:16px;padding:10px 0;border-bottom:1px solid rgba(127,127,127,.2)}
.comp{margin:0;display:flex;flex-direction:column;gap:6px}.stage{padding:24px;border-radius:12px;background:${ground};border:1px dashed rgba(127,127,127,.4)}
.refs{display:flex;gap:16px;flex-wrap:wrap}.refs img{width:240px;border-radius:12px;border:1px solid rgba(127,127,127,.3)}
figcaption{font-size:12px;opacity:.7}
</style></head>
<body>
<header><h1>${esc(system.name)} – specimen</h1>
${system.modes.map((m, i) => `<button data-mode="${esc(m)}" aria-pressed="${i === 0}">${esc(m)}</button>`).join('')}
${Object.keys(system.brands).length ? `<label>Brand <select id="brand">${brandOptions}</select></label>` : ''}
</header>
<main>
<section><h2>Colour roles</h2><table><tr><td></td><td>role</td>${system.modes.map((m) => `<td>${esc(m)}</td>`).join('')}</tr>${colorRows}</table></section>
${families ? `<section><h2>Typefaces</h2><div class="grid">${families}</div></section>` : ''}
${typeRows ? `<section><h2>Type scale</h2>${typeRows}</section>` : ''}
${recipeTiles ? `<section><h2>Grounds, gradients and glass</h2><div class="grid">${recipeTiles}</div></section>` : ''}
${radii ? `<section><h2>Corner radii</h2><div class="grid">${radii}</div></section>` : ''}
${shadows ? `<section><h2>Shadows</h2><div class="grid">${shadows}</div></section>` : ''}
${compTiles ? `<section><h2>Components</h2><div class="grid">${compTiles}</div></section>` : '<section><h2>Components</h2><p>No component snippets yet (components/&lt;name&gt;.html).</p></section>'}
${refs ? `<section><h2>Reference screens (the approved direction)</h2>${refs}</section>` : ''}
</main>
<script>
const root = document.documentElement;
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => {
  root.dataset.theme = b.dataset.mode;
  for (const o of document.querySelectorAll('[data-mode]')) o.setAttribute('aria-pressed', String(o === b));
});
const brand = document.getElementById('brand');
if (brand) brand.addEventListener('change', () => { if (brand.value) root.dataset.brand = brand.value; else delete root.dataset.brand; });
</script>
</body></html>
`;
}

function main(argv) {
  const dirArg = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
  if (!dirArg || argv.includes('--help')) {
    console.error('usage: node specimen.mjs <system folder> [--out <file>]');
    return argv.includes('--help') ? 0 : 2;
  }
  const dir = resolve(dirArg);
  const oi = argv.indexOf('--out');
  const out = oi >= 0 ? resolve(argv[oi + 1]) : join(dir, 'specimen', 'index.html');
  try {
    const html = specimenHtml(loadSystem(dir), out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    console.log(`wrote ${out}`);
    return 0;
  } catch (e) {
    console.error(`error ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
