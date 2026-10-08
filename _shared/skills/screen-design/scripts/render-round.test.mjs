// node --test render-round.test.mjs
// Every fixture is written under mkdtempSync - nothing reads or writes a real design/ folder.
// What is hidden is asserted from the DOM visibility the script itself measured in its page
// (report.renders[].notesVisible), never guessed from pixels.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderRound } from './render-round.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'render-round.mjs');
const work = mkdtempSync(join(tmpdir(), 'render-round-test-'));
after(() => rmSync(work, { recursive: true, force: true }));

const SCREEN = '<main class="app" style="width:320px;padding:16px;background:#fff"><h1>Übersicht</h1><img src="../../assets/dot.svg" width="16" height="16" alt=""><button>Projekt planen</button></main>';
const page = (body) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>fixture</title></head><body style="margin:0">${body}</body></html>`;

/** design/draft/<screen>/round-<n>/ under the temp folder; the screen name has a space and an umlaut on purpose. */
function round(n, files) {
  const dir = join(work, 'draft', 'Übersicht Test', `round-${n}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(work, 'draft', 'assets'), { recursive: true });
  writeFileSync(join(work, 'draft', 'assets', 'dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="8" fill="#1BA17B"/></svg>');
  for (const [name, html] of Object.entries(files)) writeFileSync(join(dir, name), html);
  return dir;
}
const isPng = (file) => existsSync(file) && readFileSync(file).subarray(1, 4).toString() === 'PNG';
const pick = (report, source, viewport, mode) => report.renders.find((r) => r.source === source && r.viewport === viewport && r.mode === mode);

test('annotated shows the note, clean hides it; both file names are written, the round folder is only read', async () => {
  const dir = round(1, {
    'variant-a.html': page(`<div data-note class="label">Variant A, variant-a.html, criterion 3</div>${SCREEN}`),
    'overview.html': page('<p data-note>Round 1, task T-1</p><h2>A</h2><iframe src="variant-a.html" width="400" height="300"></iframe>'),
  });
  const out = join(work, 'out-1');
  const report = await renderRound({ round: dir, out });
  assert.deepEqual(report.errors, []);

  for (const viewport of ['desktop', 'mobile']) {
    const annotated = pick(report, 'variant-a.html', viewport, 'annotated');
    const clean = pick(report, 'variant-a.html', viewport, 'clean');
    assert.equal(annotated.notesVisible, 1, `${viewport}: the annotated render shows the note`);
    assert.equal(clean.notes, 1, `${viewport}: the note is still in the document of the clean render`);
    assert.equal(clean.notesVisible, 0, `${viewport}: the clean render hides the note`);
    assert.ok(clean.screenElements > 0, `${viewport}: the drawn screen is still there`);
    assert.equal(annotated.file, join(out, `render-variant-a-${viewport}.png`));
    assert.equal(clean.file, join(out, `render-variant-a-${viewport}-clean.png`));
    assert.ok(isPng(annotated.file) && isPng(clean.file));
  }
  const overviewClean = pick(report, 'overview.html', 'desktop', 'clean');
  assert.equal(pick(report, 'overview.html', 'desktop', 'annotated').notesVisible, 2, 'overview: its own note and the one inside the frame');
  assert.equal(overviewClean.notes, 2);
  assert.equal(overviewClean.notesVisible, 0, 'overview: notes are hidden inside the frame too');
  assert.ok(isPng(join(out, 'render-overview.png')) && isPng(join(out, 'render-overview-clean.png')));

  assert.deepEqual(report.warnings, [], 'the shared ../../assets/ file is served, nothing note-like is left');
  assert.deepEqual(readdirSync(dir).sort(), ['overview.html', 'variant-a.html'], '--out leaves the round folder untouched');
});

test('a variant with no drawn screen outside its notes: exit 1, the file is named, no clean PNG', () => {
  const dir = round(2, { 'variant-a.html': page('<div data-note><h1>Concept check</h1><p>only notes here</p></div>') });
  const out = join(work, 'out-2');
  const run = spawnSync(process.execPath, [SCRIPT, dir, '--out', out, '--viewports', 'desktop'], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stderr, /render-variant-a-desktop-clean\.png/);
  assert.match(run.stderr, /no drawn screen outside the notes/);
  assert.ok(isPng(join(out, 'render-variant-a-desktop.png')), 'the annotated render is still written');
  assert.ok(!existsSync(join(out, 'render-variant-a-desktop-clean.png')), 'an empty clean render is never written');
});

test('--hide cleans a round drawn before the rule, and note-like text left outside is reported', async () => {
  const dir = round(3, { 'variant-a.html': page(`<div class="concept">Konzept-Check</div>${SCREEN}<p class="left-over">LS-1-S1, pages/index.vue</p>`) });
  const report = await renderRound({ round: dir, out: join(work, 'out-3'), hide: '.concept', viewports: ['desktop'] });
  assert.deepEqual(report.errors, []);
  assert.equal(pick(report, 'variant-a.html', 'desktop', 'annotated').hideVisible, 1);
  const clean = pick(report, 'variant-a.html', 'desktop', 'clean');
  assert.equal(clean.hideMatches, 1);
  assert.equal(clean.hideVisible, 0);
  assert.equal(report.warnings.length, 1);
  assert.match(report.warnings[0], /id "LS-1-S1"/);
  assert.match(report.warnings[0], /file name "pages\/index\.vue"/);
});

test('a --hide that is no CSS selector: exit 2, nothing rendered', () => {
  const dir = round(4, { 'variant-a.html': page(SCREEN) });
  const out = join(work, 'out-4');
  const run = spawnSync(process.execPath, [SCRIPT, dir, '--out', out, '--hide', '..nope['], { encoding: 'utf8' });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /not a valid CSS selector list/);
  assert.deepEqual(readdirSync(out), []);
});
