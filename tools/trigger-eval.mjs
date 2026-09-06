#!/usr/bin/env node
// Deterministic trigger evals for skill descriptions. No model involved.
//
//   node tools/trigger-eval.mjs [--strict] [--collision-min 3] [--verbose]
//
// For every skill in every scope (the manifests of this repo and of the nested personal/ and
// venture-labs/ repos) it reads evals/<skill>/triggers.yaml in the repo that owns the scope:
//
//   positive:                 # prompts that should trigger this skill (rank first)
//     - "..."
//   negative:                 # prompts that must not rank this skill first
//     - "..."
//
// A prompt is scored against every description by keyword overlap: lowercase, a light stem,
// stopwords dropped, each shared word weighted by how rare it is across all descriptions.
// A positive passes when its skill ranks first (ties fail); a negative passes when it does not.
// Then every pair of descriptions is compared: pairs sharing --collision-min or more
// distinctive words (words present in at most one in ten descriptions) are reported.
// Exit 1 on a failed trigger; collisions are warnings unless --strict. This is the seed of the
// lexical (tier-2) evals, not the loader and not a judge: a failure usually means "fix the
// description", sometimes "the prompt is unrealistic". Dependency-free on purpose.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const VERBOSE = argv.includes('--verbose');
const cmIdx = argv.indexOf('--collision-min');
const COLLISION_MIN = cmIdx !== -1 ? Number(argv[cmIdx + 1]) || 3 : 3;

// The repo that owns each scope: "_shared" in the base repo, "personal" in personal/,
// "venture-labs/<x>" in venture-labs/. Each has its own manifest.json and evals/.
const REPOS = [
  { dir: ROOT, manifest: join(ROOT, 'manifest.json') },
  { dir: join(ROOT, 'personal'), manifest: join(ROOT, 'personal', 'manifest.json') },
  { dir: join(ROOT, 'venture-labs'), manifest: join(ROOT, 'venture-labs', 'manifest.json') },
];

const STOP = new Set(('a an the and or of to in on for with when whenever use using used this that it its is are be been ' +
  'even if not any every as at by from into you your yours user users does do did say says said ask asks asked ' +
  'name names named just only also than then there here what which who whom how why where over under out up about ' +
  'one two all some such more most very can could should would may might must will shall have has had get gets got ' +
  'like via per without within own other another each both either same new old want wants wanted need needs needed ' +
  'skill skills task tasks file files thing things something anything everything nothing way ways make makes made ' +
  'work works working help helps give gives given take takes taken see sees seen read reads run runs running ' +
  'create creates creating created add adds adding added set sets setting write writes writing written edit edits ' +
  'editing edited review reviews reviewing reviewed build builds building built change changes changing changed ' +
  'go goes going went come comes coming came put puts putting keep keeps kept let lets before after onto ' +
  'yet still already again always never no nor so too etc').split(/\s+/));

function stem(w) {
  if (w.length <= 4) return w;
  return w
    .replace(/ies$/, 'y')
    .replace(/(sses|shes|ches|xes)$/, (m) => m.slice(0, -2))
    .replace(/ing$/, '')
    .replace(/ed$/, '')
    .replace(/s$/, '')
    .replace(/e$/, '')
    .replace(/([b-df-hj-np-tv-z])\1$/, '$1'); // debugg -> debug, plann -> plan
}
function tokens(text) {
  const out = new Set();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9äöüß@#./-]+/g, ' ').split(/\s+/)) {
    const w = raw.replace(/^[./-]+|[./-]+$/g, '');
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    const s = stem(w);
    if (s.length >= 3 && !STOP.has(s)) out.add(s);
  }
  return out;
}

// Minimal YAML: top-level `key:` blocks holding `- "prompt"` / `- prompt` list items.
function parseTriggers(text) {
  const out = { positive: [], negative: [] };
  let key = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const k = line.match(/^([A-Za-z_]+):\s*$/);
    if (k) { key = k[1]; if (!out[key]) out[key] = []; continue; }
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key) out[key].push(item[1].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1'));
  }
  return out;
}

// Collect every skill with its description and (if present) its trigger file.
const skills = [];
for (const repo of REPOS) {
  if (!existsSync(repo.manifest)) continue;
  const m = JSON.parse(readFileSync(repo.manifest, 'utf8'));
  for (const [scope, s] of Object.entries(m.scopes)) {
    for (const sk of s.skills) {
      const trigFile = join(repo.dir, 'evals', sk.name, 'triggers.yaml');
      skills.push({
        id: `${scope}/${sk.name}`,
        name: sk.name,
        scope,
        description: sk.description,
        tokens: tokens(`${sk.name.replace(/-/g, ' ')} ${sk.description}`),
        triggers: existsSync(trigFile) ? parseTriggers(readFileSync(trigFile, 'utf8')) : null,
        trigFile,
      });
    }
  }
}
if (!skills.length) { console.error('no skills found - run `npm run manifest` first'); process.exit(2); }

// Document frequency across descriptions -> rarity weight per token.
const df = new Map();
for (const s of skills) for (const t of s.tokens) df.set(t, (df.get(t) || 0) + 1);
const N = skills.length;
const idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 0.1;

function rank(prompt) {
  const pt = tokens(prompt);
  return skills
    .map((s) => {
      const shared = [...pt].filter((t) => s.tokens.has(t));
      return { skill: s, score: shared.reduce((n, t) => n + idf(t), 0), shared };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id));
}

// 1. Trigger evals per skill that has a triggers.yaml.
let failed = 0, passed = 0, withEvals = 0;
for (const s of skills) {
  if (!s.triggers) continue;
  withEvals++;
  console.log(`\n${s.id}`);
  for (const kind of ['positive', 'negative']) {
    for (const prompt of s.triggers[kind] || []) {
      const r = rank(prompt);
      const top = r[0];
      const mine = r.find((x) => x.skill === s);
      const pos = mine ? r.indexOf(mine) + 1 : null;
      const tiedFirst = r.length > 1 && top && r[1].score === top.score;
      const isFirst = pos === 1 && !tiedFirst;
      const ok = kind === 'positive' ? isFirst : !isFirst;
      ok ? passed++ : failed++;
      const label = ok ? 'ok  ' : 'FAIL';
      const shown = r.slice(0, 3).map((x) => `${x.skill.id}${x.skill === s ? '*' : ''} (${x.score.toFixed(1)})`).join(', ') || '(no match)';
      console.log(`  ${label} ${kind === 'positive' ? '+' : '-'} "${prompt}"`);
      console.log(`       top: ${shown}${pos && pos > 3 ? `; own rank ${pos}` : ''}${tiedFirst ? '; tie at rank 1' : ''}`);
      if (VERBOSE && mine) console.log(`       shared: ${mine.shared.join(' ')}`);
    }
  }
}

// 2. Pairwise description collisions on distinctive words (words that at most one in ten
// descriptions uses, so a shared one is a real overlap, not "project" or "content").
const distinctiveMax = Math.max(2, Math.floor(N / 10));
const collisions = [];
for (let i = 0; i < skills.length; i++) {
  for (let j = i + 1; j < skills.length; j++) {
    const a = skills[i], b = skills[j];
    const shared = [...a.tokens].filter((t) => b.tokens.has(t) && (df.get(t) || 0) <= distinctiveMax);
    if (shared.length >= COLLISION_MIN) collisions.push({ a: a.id, b: b.id, shared });
  }
}
collisions.sort((x, y) => y.shared.length - x.shared.length);
console.log(`\ncollisions (>= ${COLLISION_MIN} shared words that appear in at most ${distinctiveMax} of ${N} descriptions):`);
if (!collisions.length) console.log('  none');
for (const c of collisions) console.log(`  warn ${c.a} <> ${c.b}: ${c.shared.join(' ')}`);

console.log(`\n${N} skills, ${withEvals} with triggers.yaml, ${passed} prompt(s) ok, ${failed} failed, ${collisions.length} collision(s).`);
if (failed || (STRICT && collisions.length)) process.exit(1);
