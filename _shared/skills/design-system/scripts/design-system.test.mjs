// node --test design-system.test.mjs
// Every fixture is a copy of assets/starter/ under mkdtempSync - nothing touches a real project.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from './build-tokens.mjs';
import { checkSystem, completeness } from './check-system.mjs';
import { checkContrast, worstContrast } from './contrast.mjs';
import { contrastRatio, parseColor } from './lib/color.mjs';
import { blankImage, decodePng, encodePng } from './lib/png.mjs';
import { SPECIMEN_SECTIONS, approvalOf, sectionIds } from './lib/contract.mjs';
import { loadSystem } from './lib/tokens.mjs';
import { specimenHtml } from './specimen.mjs';
import { designFindings, designGaps, exceptionRows, openPointRows } from './lib/openpoints.mjs';
import { allowedValues, audit, auditText, r1aQuestions } from './token-audit.mjs';
import { compareImages } from './visual-compare.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STARTER = join(HERE, '..', 'assets', 'starter');
const work = mkdtempSync(join(tmpdir(), 'design-system-test-'));
after(() => rmSync(work, { recursive: true, force: true }));
let n = 0;

/** A copy of the starter; `complete` fills every source, adds reference images and the specimen. */
function system({ complete = false } = {}) {
  const dir = join(work, `sys-${++n}`);
  cpSync(STARTER, dir, { recursive: true });
  if (complete) {
    for (const f of ['primitives', 'semantic.light', 'semantic.dark']) {
      const p = join(dir, 'tokens', `${f}.tokens.json`);
      writeFileSync(p, readFileSync(p, 'utf8').replaceAll('TODO: ', 'test fixture: '));
    }
    for (const m of ['light', 'dark', 'dont']) writeFileSync(join(dir, 'reference', m, 'screen.png'), encodePng(blankImage(4, 4)));
    build(dir);
    writeFileSync(join(dir, 'specimen', 'index.html'), specimenHtml(loadSystem(dir), join(dir, 'specimen', 'index.html')));
  }
  return dir;
}
const editJson = (file, fn) => {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  fn(j);
  writeFileSync(file, JSON.stringify(j, null, 2));
};
const run = (script, args) => spawnSync(process.execPath, [join(HERE, script), ...args], { encoding: 'utf8' });

test('build: light on :root, dark under data-theme and prefers-color-scheme, components resolved per mode', () => {
  const dir = system();
  const { cssFile, jsonFile } = build(dir);
  const css = readFileSync(cssFile, 'utf8');
  assert.match(css, /:root, \[data-theme="light"\] \{[^}]*--bg-ground: #f5f4f8;/);
  assert.match(css, /\[data-theme="dark"\] \{[^}]*--bg-ground: #0f0e18;/);
  assert.match(css, /prefers-color-scheme: dark[\s\S]*:root:not\(\[data-theme\]\)/);
  assert.match(css, /\[data-theme="dark"\] \{[^}]*--button-bg: #8fb0ff;/);
  const json = JSON.parse(readFileSync(jsonFile, 'utf8'));
  assert.equal(json.sets.light['button.bg'].tier, 'component');
  assert.equal(json.sets.dark['text.body'].css, '#f4f3fa');
});

test('build: system.json defaultMode leaves the prefers-color-scheme block out (light stays until dark is chosen)', () => {
  const dir = system();
  editJson(join(dir, 'system.json'), (j) => { j.defaultMode = 'light'; });
  const css = readFileSync(build(dir).cssFile, 'utf8');
  assert.doesNotMatch(css, /prefers-color-scheme/);
  assert.match(css, /\[data-theme="dark"\] \{[^}]*--bg-ground: #0f0e18;/);
});

test('build: a bad alias fails with the token named; exit 1 from the CLI', () => {
  const dir = system();
  editJson(join(dir, 'tokens', 'components.tokens.json'), (j) => { j.button.bg.$value = '{accent.nope}'; });
  const r = run('build-tokens.mjs', [dir]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /accent\.nope/);
  assert.equal(run('build-tokens.mjs', []).status, 2);
});

test('brands: only what the brand changes, and a light-only brand stays light in dark mode', () => {
  const dir = system();
  writeFileSync(join(dir, 'tokens', 'brands', 'acme.tokens.json'), JSON.stringify({
    $extensions: { 'skill.design-system': { modes: ['light'] } },
    color: { accent: { 600: { $type: 'color', $value: '#b00020', $extensions: { 'skill.design-system': { source: 'acme brand guide p.3' } } } } },
  }));
  const css = readFileSync(build(dir).cssFile, 'utf8');
  const light = css.match(/\[data-brand="acme"\], \[data-brand="acme"\]\[data-theme="light"\] \{([^}]*)\}/);
  assert.ok(light, 'brand light block');
  assert.match(light[1], /--accent-default: #b00020;/);
  assert.doesNotMatch(light[1], /--bg-ground/);
  const dark = css.match(/\[data-brand="acme"\]\[data-theme="dark"\] \{([^}]*)\}/);
  assert.ok(dark, 'brand dark block');
  assert.match(dark[1], /--bg-ground: #f5f4f8;/, 'light-only brand keeps its light ground in dark mode');
});

test('check-system: the bare starter fails on placeholders, specimen and references; a filled one passes', () => {
  const bare = checkSystem(system());
  assert.ok(bare.errors.some((e) => /placeholder source/.test(e)));
  assert.ok(bare.errors.some((e) => /missing specimen\/index.html/.test(e)));
  assert.ok(bare.errors.some((e) => /no reference image for mode "dark"/.test(e)));
  const dir = system({ complete: true });
  const ok = checkSystem(dir);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.approved, false);
  assert.ok(checkSystem(dir, { requireApproved: true }).errors.some((e) => /APPROVED\.md/.test(e)));
  writeFileSync(join(dir, 'specimen', 'APPROVED.md'), '# Approved\n\n- Approved by: Christian Wenzel, owner\n- When: 2026-10-14\n- Their words: «passt»\n');
  assert.deepEqual(checkSystem(dir, { requireApproved: true }).errors, []);
  assert.equal(run('check-system.mjs', [dir, '--require-approved']).status, 0);
});

test('check-system: missing dark role, component on a primitive, brand on a role, unlisted state', () => {
  const dir = system({ complete: true });
  editJson(join(dir, 'tokens', 'semantic.dark.tokens.json'), (j) => { delete j.text.muted; });
  editJson(join(dir, 'tokens', 'components.tokens.json'), (j) => {
    j.button.text.$value = '{color.neutral.0}';
    j.button.hover = { bg: { $type: 'color', $value: '{accent.default}' } };
  });
  writeFileSync(join(dir, 'tokens', 'brands', 'bad.tokens.json'), JSON.stringify({ text: { body: { $type: 'color', $value: '#000000', $extensions: { 'skill.design-system': { source: 'x' } } } } }));
  const { errors } = checkSystem(dir);
  assert.ok(errors.some((e) => /"text\.muted" has no value in mode "dark"/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /points at primitive \{color\.neutral\.0\}/.test(e)));
  assert.ok(errors.some((e) => /brand "bad" overrides "text\.body"/.test(e)));
  assert.ok(errors.some((e) => /does not list the state "hover"/.test(e)));
  assert.equal(run('check-system.mjs', [dir]).status, 1);
});

test('check-system: a brand exchanges colours only - a radius or a typeface override is an error', () => {
  const dir = system({ complete: true });
  const src = { 'skill.design-system': { source: 'fixture' } };
  writeFileSync(join(dir, 'tokens', 'brands', 'acme.tokens.json'), JSON.stringify({
    color: { accent: { 600: { $type: 'color', $value: '#eb1a24', $extensions: src } } },
    radius: { lg: { $type: 'dimension', $value: '0px', $extensions: src } },
    font: { family: { body: { $type: 'fontFamily', $value: ['Work Sans'], $extensions: src } } },
  }));
  const { errors } = checkSystem(dir);
  assert.ok(errors.some((e) => /"radius\.lg" of type dimension/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /"font\.family\.body" of type fontFamily/.test(e)));
  assert.ok(!errors.some((e) => /color\.accent\.600/.test(e)), 'a colour override is fine');
  editJson(join(dir, 'system.json'), (j) => { j.brandTypes = ['color', 'dimension', 'fontFamily']; });
  assert.ok(!checkSystem(dir).errors.some((e) => /acme/.test(e)), 'the owner may widen it explicitly');
});

test('token-audit: off-system colour, font, size and radius are findings with the nearest token; system values pass', () => {
  const dir = system({ complete: true });
  const allowed = allowedValues(loadSystem(dir));
  const html = [
    '<style>:root{--brand: #2a55d9;}',
    '.a{color:#2a55d9}',
    '.b{color:#2b56da; background: rgba(18,52,86,.5)}',
    ".c{font-family:'Nunito Sans', sans-serif; font-size: 13px; border-radius: 14px}",
    '.d{font-family: Inter, sans-serif; font-size: 1rem; border-radius: 20px}',
    '.e{color:#123456} /* design-system-ignore: third-party widget */',
  ].join('\n');
  const f = auditText(html, allowed);
  const kinds = f.map((x) => `${x.line}:${x.kind}`);
  assert.ok(!kinds.includes('2:colour'), 'an exact system colour passes');
  assert.ok(!kinds.includes('3:colour') || f.find((x) => x.line === 3 && x.value.startsWith('rgba')), 'a ΔE<1 neighbour passes');
  assert.ok(f.some((x) => x.line === 3 && /rgba\(18,52,86,\.5\)/.test(x.value) && /nearest:/.test(x.message)));
  assert.ok(f.some((x) => x.line === 4 && x.kind === 'font' && /Nunito Sans/.test(x.value)));
  assert.ok(f.some((x) => x.line === 4 && x.kind === 'size'));
  assert.ok(f.some((x) => x.line === 4 && x.kind === 'radius'));
  assert.ok(!f.some((x) => x.line === 5), 'system font, 1rem = 16px and a system radius pass');
  assert.ok(!f.some((x) => x.line === 6), 'ignored line');
  const strict = auditText(html, allowed, { strict: true });
  assert.ok(strict.some((x) => x.line === 2 && /use the token/.test(x.message)), 'strict flags a matching literal outside a declaration');
  assert.ok(!strict.some((x) => x.line === 1), 'a custom-property declaration is the one place a value is written');
  const file = join(work, 'variant-a.html');
  writeFileSync(file, html);
  assert.ok(audit(dir, [file]).findings.length > 0);
  assert.equal(run('token-audit.mjs', [dir, file]).status, 1);
  writeFileSync(file, '.ok{color:#2a55d9;font-family:Inter}');
  assert.equal(run('token-audit.mjs', [dir, file]).status, 0);
});

test('contrast: plain pairs pass; glass over a backdrop that runs through the text colour fails at 1:1', () => {
  const dir = system({ complete: true });
  assert.ok(checkContrast(dir).results.every((r) => r.pass));
  editJson(join(dir, 'tokens', 'primitives.tokens.json'), (j) => {
    j.color.mesh = { $type: 'color', $value: '#f5f4f8', $extensions: { 'skill.design-system': { source: 'fixture', stops: ['#ffffff', '#1d1b2e'] } } };
    j.color.glass = { $type: 'color', $value: 'rgba(255,255,255,0.2)', $extensions: { 'skill.design-system': { source: 'fixture' } } };
  });
  for (const m of ['light', 'dark']) editJson(join(dir, 'tokens', `semantic.${m}.tokens.json`), (j) => {
    j.bg.mesh = { $type: 'color', $value: '{color.mesh}' };
    j.bg.glass = { $type: 'color', $value: '{color.glass}' };
  });
  writeFileSync(join(dir, 'checks', 'contrast-pairs.json'), JSON.stringify({ pairs: [{ text: 'text.muted', background: 'bg.glass', over: 'bg.mesh', min: 4.5, modes: ['light'] }] }));
  const r = checkContrast(dir).results[0];
  assert.equal(r.pass, false);
  assert.equal(r.straddles, true);
  assert.equal(r.samples, 2);
  assert.equal(run('contrast.mjs', [dir]).status, 1);
  writeFileSync(join(dir, 'checks', 'contrast-pairs.json'), JSON.stringify({ pairs: [{ text: 'text.body', background: 'bg.glass', min: 4.5 }] }));
  assert.equal(run('contrast.mjs', [dir]).status, 2, 'a translucent background without a backdrop is a setup error');
});

test('contrast: worst point over an image backdrop', () => {
  const img = blankImage(8, 8, [255, 255, 255, 255]);
  for (let i = 0; i < 32 * 4; i += 4) img.data.set([20, 20, 20, 255], i); // top half dark
  const dir = system({ complete: true });
  writeFileSync(join(dir, 'reference', 'light', 'backdrop.png'), encodePng(img));
  writeFileSync(join(dir, 'checks', 'contrast-pairs.json'), JSON.stringify({ pairs: [{ text: 'text.body', background: 'bg.surface', overImage: 'reference/light/backdrop.png', min: 4.5, modes: ['light'] }] }));
  // an opaque surface hides the image completely
  assert.ok(checkContrast(dir).results[0].pass);
  const w = worstContrast(parseColor('#1d1b2e'), parseColor('rgba(255,255,255,0.1)'), [parseColor('#141414'), parseColor('#ffffff')]);
  assert.ok(w.ratio < 2, 'nearly clear glass over a dark patch is unreadable');
});

test('contrast: a light-only brand is not measured against a dark-only backdrop', () => {
  const img = blankImage(8, 8, [10, 10, 18, 255]);
  const dir = system({ complete: true });
  writeFileSync(join(dir, 'reference', 'dark', 'ground.png'), encodePng(img));
  cpSync(join(dir, 'tokens', 'brands', '_template.tokens.json'), join(dir, 'tokens', 'brands', 'acme.tokens.json'));
  editJson(join(dir, 'tokens', 'brands', 'acme.tokens.json'), (j) => { j.color.accent['600'].$extensions['skill.design-system'].source = 'fixture'; });
  writeFileSync(join(dir, 'checks', 'contrast-pairs.json'), JSON.stringify({ pairs: [{ text: 'text.body', background: 'bg.ground', overImage: 'reference/dark/ground.png', min: 4.5, modes: ['dark'] }] }));
  const sets = checkContrast(dir).results.map((r) => r.set);
  assert.deepEqual(sets, ['dark'], 'brand:acme:dark is skipped - acme declares light only');
});

test('colour maths: WCAG ratio for black on white is 21', () => {
  assert.equal(Math.round(contrastRatio(parseColor('#000'), parseColor('#fff'))), 21);
  assert.deepEqual(parseColor('rgba(37, 98, 255, .16)'), { r: 37, g: 98, b: 255, a: 0.16 });
  assert.ok(parseColor('oklch(62% 0.2 260)'));
});

test('png: round trip and visual compare numbers', () => {
  const a = blankImage(20, 10, [245, 242, 251, 255]);
  const back = decodePng(encodePng(a));
  assert.equal(back.width, 20);
  assert.deepEqual([...back.data.subarray(0, 4)], [245, 242, 251, 255]);
  const same = compareImages(a, a);
  assert.equal(same.diffRatio, 0);
  assert.equal(same.paletteMatch, 1);
  const b = blankImage(20, 10, [37, 98, 255, 255]);
  const diff = compareImages(a, b);
  assert.equal(diff.diffRatio, 1);
  assert.equal(diff.paletteMatch, 0);
  assert.equal(diff.sheet.width, 20 * 3 + 16 * 4);
  const wide = compareImages(blankImage(40, 20, [245, 242, 251, 255]), a);
  assert.equal(wide.diffRatio, 0, 'the reference is scaled to the screen width first');
});

test('specimen: every role, both modes, the switch and the reference images', () => {
  const dir = system({ complete: true });
  const html = readFileSync(join(dir, 'specimen', 'index.html'), 'utf8');
  assert.match(html, /bg\.ground/);
  assert.match(html, /data-mode="dark"/);
  assert.match(html, /reference\/light\/screen\.png/);
  assert.match(html, /--button-bg/);
  assert.equal(run('specimen.mjs', [dir, '--out', join(dir, 'out.html')]).status, 0);
  assert.ok(existsSync(join(dir, 'out.html')));
});

test('specimen: passes its own audit, shows open points, component specs and the brand switch', () => {
  const dir = system({ complete: true });
  const designFile = join(dir, 'DESIGN.md');
  writeFileSync(designFile, readFileSync(designFile, 'utf8').replace('| # | Question | Today | entschieden nach |\n|---|---|---|---|\n', (m) => `${m}| O1 | Which green for text, #18765B or #0E7656? | web uses #18765B | R5 |\n`));
  cpSync(join(dir, 'tokens', 'brands', '_template.tokens.json'), join(dir, 'tokens', 'brands', 'acme.tokens.json'));
  editJson(join(dir, 'tokens', 'brands', 'acme.tokens.json'), (j) => {
    j.color.accent['600'].$value = '#eb1a24';
    j.color.accent['600'].$extensions['skill.design-system'].source = 'test fixture: brand guide';
  });
  const out = join(dir, 'specimen', 'index.html');
  writeFileSync(out, specimenHtml(loadSystem(dir), out));
  const html = readFileSync(out, 'utf8');
  assert.match(html, /<span class="oid">O1<\/span>/, 'open points from DESIGN.md');
  assert.match(html, /<h4>States<\/h4>/, 'component spec');
  assert.match(html, /<h4>Don't<\/h4>/);
  assert.match(html, /data-brand-pick="acme"/, 'brand switch');
  assert.match(html, /data-theme="light" data-brand="acme"/, 'component stage per brand');
  assert.match(html, /src="data:image\/png;base64,/, 'images inlined');
  const { findings } = audit(dir, [out]);
  assert.deepEqual(findings, [], 'the page is styled only with the system: ' + findings.map((f) => f.message).join('; '));
  const frag = join(dir, 'frag.html');
  assert.equal(run('specimen.mjs', [dir, '--out', join(dir, 'o.html'), '--fragment', frag]).status, 0);
  assert.doesNotMatch(readFileSync(frag, 'utf8'), /<!doctype/i, 'a fragment has no document skeleton');
});

test('specimen --pdf: one print per mode, merged (skipped without Playwright/browser)', async (t) => {
  const { loadPlaywright } = await import('../../screen-design/scripts/render-round.mjs');
  try {
    loadPlaywright();
  } catch {
    t.skip('no Playwright on this machine');
    return;
  }
  const dir = system({ complete: true });
  const pdf = join(dir, 'out.pdf');
  const r = run('specimen.mjs', [dir, '--pdf', pdf]);
  if (r.status === 1 && /browser/.test(r.stderr)) {
    t.skip('no browser could be started');
    return;
  }
  assert.equal(r.status, 0, r.stderr);
  const written = r.stdout.split('\n').filter((l) => /\.pdf$/.test(l)).map((l) => l.replace(/^wrote /, ''));
  assert.ok(written.length >= 1);
  for (const f of written) assert.equal(readFileSync(f).subarray(0, 4).toString(), '%PDF');
});

test('visual-compare CLI: PNG input writes the sheet and gates on --max-diff', () => {
  const dir = join(work, 'vc');
  cpSync(STARTER, dir, { recursive: true });
  writeFileSync(join(dir, 'ref.png'), encodePng(blankImage(10, 10, [255, 255, 255, 255])));
  writeFileSync(join(dir, 'screen.png'), encodePng(blankImage(10, 10, [0, 0, 0, 255])));
  const out = join(dir, 'cmp.png');
  const r = run('visual-compare.mjs', ['--screen', join(dir, 'screen.png'), '--reference', join(dir, 'ref.png'), '--out', out, '--max-diff', '0.5']);
  assert.equal(r.status, 1, r.stderr);
  assert.ok(existsSync(out));
  assert.equal(run('visual-compare.mjs', ['--screen', join(dir, 'ref.png'), '--reference', join(dir, 'ref.png'), '--out', out, '--max-diff', '0.01']).status, 0);
  assert.equal(run('visual-compare.mjs', ['--screen', 'nope.png', '--reference', 'nope.png']).status, 2);
});

test('visual-compare: an HTML screen in a foreign font is blocked (skipped without Playwright/browser)', async (t) => {
  const { loadPlaywright } = await import('../../screen-design/scripts/render-round.mjs');
  try {
    loadPlaywright();
  } catch {
    t.skip('no Playwright on this machine');
    return;
  }
  const dir = system({ complete: true });
  const html = join(dir, 'variant-a.html');
  writeFileSync(html, '<!doctype html><html><body style="margin:0;background:#f5f4f8"><h1 style="font-family:Georgia">Titel</h1><p style="font-family:Inter">Text</p></body></html>');
  writeFileSync(join(dir, 'ref.png'), encodePng(blankImage(390, 200, [245, 244, 248, 255])));
  const r = run('visual-compare.mjs', ['--screen', html, '--reference', join(dir, 'ref.png'), '--system', dir, '--out', join(dir, 'c.png'), '--json']);
  if (r.status === 2 && /browser/.test(r.stderr)) {
    t.skip('no browser could be started');
    return;
  }
  assert.equal(r.status, 1, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.deepEqual(report.foreignFonts, ['Georgia']);
});



test('contract: a complete system has every section of the contract, in contract order', () => {
  const dir = system({ complete: true });
  const ids = sectionIds(readFileSync(join(dir, 'specimen', 'index.html'), 'utf8'));
  const order = SPECIMEN_SECTIONS.map((s) => s.id).filter((id) => ids.includes(id));
  assert.deepEqual(ids.filter((id) => id !== 'top'), order);
  for (const s of SPECIMEN_SECTIONS.filter((x) => x.when === 'always')) assert.ok(ids.includes(s.id), `section ${s.id}`);
  const c = completeness(dir);
  assert.deepEqual(c.gaps, []);
  assert.equal(c.complete, true);
  assert.ok(c.sections.filter((s) => s.required).every((s) => s.present));
});

test('contract: a specimen that misses a section, a hand-made page and a missing template file are errors', () => {
  const dir = system({ complete: true });
  const file = join(dir, 'specimen', 'index.html');
  const html = readFileSync(file, 'utf8');
  writeFileSync(file, html.replace(/<section id="shape">[\s\S]*?<\/section>/, ''));
  let c = completeness(dir);
  assert.equal(c.complete, false);
  assert.ok(c.gaps.some((g) => /lacks the section "Shape" \(#shape\)/.test(g)), c.gaps.join('\n'));
  assert.equal(c.sections.find((s) => s.id === 'shape').present, false);
  assert.equal(run('check-system.mjs', [dir]).status, 1);
  writeFileSync(file, '<!doctype html><html><body><h1>Hand made</h1></body></html>');
  c = completeness(dir);
  assert.ok(c.gaps.some((g) => /not generated by specimen\.mjs/.test(g)));
  writeFileSync(file, html);
  rmSync(join(dir, 'foundations', 'iconography.md'));
  rmSync(join(dir, 'reference', 'dont', 'screen.png'));
  c = completeness(dir);
  assert.ok(c.gaps.includes('missing foundations/iconography.md'));
  assert.ok(c.gaps.some((g) => /reference\/dont\/ holds no image/.test(g)));
});

test('contract: a folder with no tokens at all (hand-made) is reported as gaps, never thrown', () => {
  const dir = join(work, `hand-${++n}`);
  cpSync(join(STARTER, 'components'), join(dir, 'components'), { recursive: true });
  writeFileSync(join(dir, 'DESIGN.md'), '# Hand made\n\n## Character\nx\n');
  const c = completeness(dir);
  assert.equal(c.complete, false);
  assert.ok(c.gaps.some((g) => /tokens cannot be read/.test(g)));
  assert.ok(c.gaps.includes('missing specimen/index.html'));
  assert.ok(c.gaps.includes('missing system.json'));
  assert.equal(c.sections.every((s) => !s.present), true);
});

test('approval: only name + date + their words in the template format approve; the file existing, a placeholder or «nicht abgenommen» does not', () => {
  const dir = system({ complete: true });
  const file = join(dir, 'specimen', 'APPROVED.md');
  writeFileSync(file, '# Approved\n\nnicht abgenommen\n');
  assert.equal(approvalOf(dir), null);
  assert.equal(checkSystem(dir).approved, false);
  assert.ok(checkSystem(dir, { requireApproved: true }).errors.some((e) => /has no approval/.test(e)));
  assert.equal(completeness(dir).approval, null);
  writeFileSync(file, readFileSync(join(STARTER, '..', '..', 'references', 'approved-template.md'), 'utf8'));
  assert.equal(approvalOf(dir), null, 'the unfilled template is not an approval');
  writeFileSync(file, '# Approved\n\n- Approved by: Christian Wenzel, owner\n- When: 2026-10-14\n');
  assert.equal(approvalOf(dir), null, 'no words, no approval');
  writeFileSync(file, '# Approved\n\n## 2026-10-15 - PROVISIONAL\n\n- Approved by: Christian Wenzel, owner (VL)\n- When: 2026-10-15, about 22:00\n- Their words: «setze das mit der aktuellen Version um»\n');
  assert.deepEqual(approvalOf(dir), { by: 'Christian Wenzel', when: '2026-10-15', words: 'setze das mit der aktuellen Version um', provisional: true });
  assert.equal(completeness(dir).approval.by, 'Christian Wenzel');
  assert.match(readFileSync(join(dir, 'specimen', 'index.html'), 'utf8'), /draft/, 'the specimen written before the approval still says draft');
  writeFileSync(join(dir, 'specimen', 'index.html'), specimenHtml(loadSystem(dir), join(dir, 'specimen', 'index.html')));
  assert.match(readFileSync(join(dir, 'specimen', 'index.html'), 'utf8'), /Design system · approved/);
});

test('contract: a light-only system (system.json modes ["light"]) owes no dark token file and no dark reference', () => {
  const dir = system({ complete: true });
  editJson(join(dir, 'system.json'), (j) => { j.modes = ['light']; });
  rmSync(join(dir, 'tokens', 'semantic.dark.tokens.json'));
  rmSync(join(dir, 'reference', 'dark'), { recursive: true });
  build(dir);
  writeFileSync(join(dir, 'specimen', 'index.html'), specimenHtml(loadSystem(dir), join(dir, 'specimen', 'index.html')));
  const c = completeness(dir);
  assert.deepEqual(c.gaps, []);
  // and a two-mode system still owes it
  const two = system({ complete: true });
  rmSync(join(two, 'tokens', 'semantic.dark.tokens.json'));
  assert.ok(completeness(two).gaps.some((g) => /semantic\.dark\.tokens\.json/.test(g)));
});

const OPEN = (rows) => `## Open points\n\n| # | Question | Today | entschieden nach |\n|---|---|---|---|\n${rows}\n\n`;
const EXC = (rows) => `## Exceptions\n\n| Screen | Value | Reason | Who | When |\n|---|---|---|---|---|\n${rows}\n\n`;

test('open points: every row needs R1-R6 or «für <owner>»; a table without the column fails; exceptions need all five fields', () => {
  assert.deepEqual(designGaps(OPEN('| O1 | q | t | R3 |\n| O2 | q | t | R4 - darker grey |\n| O5 | q | options | für Christian: Geschmack |')), []);
  assert.deepEqual(designGaps(OPEN('')), [], 'no rows, no gap');
  const bad = designGaps(OPEN('| O1 | q | t | |\n| O2 | q | t | R7 |\n| O3 | q | t | maybe later |'));
  assert.equal(bad.length, 3);
  assert.match(bad[0], /open point O1 has no valid «entschieden nach»/);
  const legacy = designGaps('## Open points for Christian\n\n| # | Question | Today |\n|---|---|---|\n| O1 | q | t |\n');
  assert.match(legacy[0], /no column «entschieden nach»/);
  const martin = designFindings('## Open points for Martin\n\n| # | Question | Today |\n|---|---|---|\n| O1 | q | t |\n');
  assert.deepEqual(martin.errors, [], 'another owner\'s legacy table is a warning, not a failure');
  assert.match(martin.warnings[0], /no column «entschieden nach»/);
  assert.equal(openPointRows(OPEN('| O1 | q | t | R3 |')).rows[0].class.rule, 'R3');
  assert.equal(openPointRows(OPEN('| O5 | q | t | für Christian: Geschmack |')).rows[0].class.owner, 'Christian');

  assert.deepEqual(designGaps(EXC('| Angebotsvergleich | #1d9a6c | status badge | Christian | 2026-10-27 |')), []);
  assert.deepEqual(designGaps(EXC('| - | - | - | - | - |')), [], 'a placeholder row is no exception');
  const e = designGaps(EXC('| Angebotsvergleich | #1d9a6c | | Christian | gestern |\n| X | red-ish | r | me | 2026-10-27 |'));
  assert.match(e[0], /lacks reason, when/);
  assert.match(e[1], /neither a colour nor a size/);
  assert.equal(exceptionRows(EXC('| A | 12px | r | w | 2026-10-27 |')).rows[0].number, 12);
});

test('check-system: an open point without its classification and an incomplete exception are errors', () => {
  const dir = system({ complete: true });
  const design = readFileSync(join(dir, 'DESIGN.md'), 'utf8');
  assert.equal(checkSystem(dir).errors.filter((x) => /DESIGN\.md (open|exception)/.test(x)).length, 0, 'the starter section is empty and valid');
  writeFileSync(join(dir, 'DESIGN.md'), `${design}\n${OPEN('| O1 | q | t | |')}${EXC('| S | #123456 | | w | 2026-10-27 |')}`);
  const errs = checkSystem(dir).errors.filter((x) => /DESIGN\.md (open|exception)/.test(x));
  assert.equal(errs.length, 2, errs.join('\n'));
  assert.ok(!completeness(dir).complete);
});

test('token-audit R1a: a new value is a finding with the question; a listed exception passes on its screen only; --questions exits 0 for them', () => {
  const dir = system({ complete: true });
  const design = readFileSync(join(dir, 'DESIGN.md'), 'utf8');
  writeFileSync(join(dir, 'DESIGN.md'), `${design}\n${EXC('| Angebotsvergleich | #1d9a6c | status badge | Christian | 2026-10-27 |')}`);
  const a = join(work, `r1a-${n}`, 'angebotsvergleich');
  const b = join(work, `r1a-${n}`, 'start');
  for (const d of [a, b]) mkdirSync(d, { recursive: true });
  writeFileSync(join(a, 'v.html'), '.x{color:#1d9a6c} .y{background:#fe3a11}');
  writeFileSync(join(b, 'v.html'), '.x{color:#1d9a6c}');
  const ra = audit(dir, [a]);
  assert.equal(ra.findings.length, 1, 'only the colour that is no exception');
  assert.equal(ra.excepted.length, 1);
  assert.equal(ra.findings[0].r1a, true);
  assert.equal(r1aQuestions(ra)[0].question, 'neue Farbe #fe3a11 für background - ins Designsystem aufnehmen oder als Ausnahme für diesen Screen?');
  assert.equal(audit(dir, [b]).findings.length, 1, 'the same value on another screen is still a finding');
  assert.equal(audit(dir, [b], { screen: 'Angebotsvergleich' }).findings.length, 0, '--screen names the screen');
  const log = join(work, `r1a-${n}.jsonl`);
  const cli = run('token-audit.mjs', [dir, a, '--questions', '--log', log, '--context', 'design-round']);
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /neue Farbe #fe3a11 für background/);
  const row = JSON.parse(readFileSync(log, 'utf8').trim());
  assert.equal(row.kind, 'colour');
  assert.equal(row.context, 'design-round');
  assert.equal(run('token-audit.mjs', [dir, a]).status, 1, 'without --questions it still blocks');
  writeFileSync(join(a, 'f.html'), '.z{font-family: Comic Sans MS}');
  assert.equal(run('token-audit.mjs', [dir, a, '--questions']).status, 1, 'a foreign font family still blocks');
});
