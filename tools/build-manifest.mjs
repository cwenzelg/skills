#!/usr/bin/env node
// Walks every <scope>/skills/<name>/SKILL.md (plus <scope>/agents/*.md), validates the
// frontmatter, and writes manifest.json. `--check` validates and exits 1 if the committed
// manifest is out of date, without writing. Dependency-free on purpose.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --root <dir>: which repo to index (default: the repo this tool lives in). The nested repos
// (personal/, venture-labs/) call this with --root . from their own package.json.
const rootArgIdx = process.argv.indexOf('--root');
const ROOT = rootArgIdx !== -1 && process.argv[rootArgIdx + 1]
  ? resolve(process.cwd(), process.argv[rootArgIdx + 1])
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const NOT_SCOPES = new Set(['tools', 'evals', 'node_modules']);
const MAX_DESCRIPTION = 1024; // upstream SKILL.md constraint
const MAX_NAME = 64;
const MAX_BODY_LINES = 500; // house rule, warning only

const errors = [];
const warnings = [];

function rel(p) {
  return relative(ROOT, p).split('\\').join('/');
}

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => !n.startsWith('.') && statSync(join(dir, n)).isDirectory())
    .sort();
}

function listFilesRecursive(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...listFilesRecursive(p));
    else out.push(rel(p));
  }
  return out;
}

// Minimal YAML frontmatter parser: `key: value`, quoted values, and `>` / `|` block scalars.
// Anything fancier than that does not belong in a SKILL.md frontmatter.
function parseFrontmatter(text, file) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    errors.push(`${file}: missing YAML frontmatter (must start with --- and end with ---)`);
    return { fm: {}, body: text };
  }
  const fm = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let [, key, value] = kv;
    if (/^[>|]-?$/.test(value)) {
      const buf = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) buf.push(lines[++i].trim());
      value = value.startsWith('>') ? buf.join(' ') : buf.join('\n');
    } else {
      value = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
    fm[key] = value;
  }
  return { fm, body: m[2] };
}

function readPlugin(scopeDir) {
  const p = join(scopeDir, '.claude-plugin', 'plugin.json');
  if (!existsSync(p)) {
    errors.push(`${rel(scopeDir)}: missing .claude-plugin/plugin.json (every scope folder is a plugin)`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    errors.push(`${rel(p)}: invalid JSON (${e.message})`);
    return null;
  }
}

function readSkill(scope, skillDir) {
  const name = skillDir.split(/[\\/]/).pop();
  const file = join(skillDir, 'SKILL.md');
  const relFile = rel(file);
  if (!existsSync(file)) {
    errors.push(`${rel(skillDir)}: no SKILL.md`);
    return null;
  }
  const { fm, body } = parseFrontmatter(readFileSync(file, 'utf8'), relFile);

  if (!fm.name) errors.push(`${relFile}: frontmatter has no name`);
  else if (fm.name !== name) errors.push(`${relFile}: name "${fm.name}" must equal folder name "${name}"`);
  if (fm.name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) errors.push(`${relFile}: name must be lowercase kebab-case`);
  if (fm.name && fm.name.length > MAX_NAME) errors.push(`${relFile}: name longer than ${MAX_NAME} chars`);
  if (!fm.description) errors.push(`${relFile}: frontmatter has no description (the description is the trigger)`);
  else if (fm.description.length > MAX_DESCRIPTION) errors.push(`${relFile}: description longer than ${MAX_DESCRIPTION} chars`);
  else if (fm.description.length < 60) warnings.push(`${relFile}: description is very short (${fm.description.length} chars) - say what AND when`);

  const bodyLines = body.split(/\r?\n/).length;
  if (bodyLines > MAX_BODY_LINES) warnings.push(`${relFile}: body is ${bodyLines} lines (house limit ${MAX_BODY_LINES}) - push detail into references/`);

  const upstreamFile = join(skillDir, 'UPSTREAM.md');
  let upstream = null;
  if (existsSync(upstreamFile)) {
    const u = readFileSync(upstreamFile, 'utf8');
    upstream = {
      repo: (u.match(/^repo:\s*(.+)$/m) || [])[1]?.trim() ?? null,
      path: (u.match(/^path:\s*(.+)$/m) || [])[1]?.trim() ?? null,
      commit: (u.match(/^commit:\s*(.+)$/m) || [])[1]?.trim() ?? null,
    };
  }

  return {
    name,
    scope,
    description: fm.description ?? '',
    path: relFile,
    bodyLines,
    // upstream anthropics/skills uses both "references/" and "reference/"; fold them together
    references: [...listFilesRecursive(join(skillDir, 'references')), ...listFilesRecursive(join(skillDir, 'reference'))],
    scripts: listFilesRecursive(join(skillDir, 'scripts')),
    assets: listFilesRecursive(join(skillDir, 'assets')),
    upstream,
  };
}

function readAgents(scopeDir) {
  const dir = join(scopeDir, 'agents');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md') && n !== 'README.md')
    .sort()
    .map((n) => {
      const { fm } = parseFrontmatter(readFileSync(join(dir, n), 'utf8'), rel(join(dir, n)));
      return { name: fm.name ?? n.replace(/\.md$/, ''), description: fm.description ?? '', path: rel(join(dir, n)) };
    });
}

// A scope is any folder with .claude-plugin/plugin.json. Folders without one are groupings
// (e.g. venture-labs/ holding core/, loopstudio/, machinemaster/) and are descended into.
function findScopes(dir, prefix = '', depth = 0) {
  const out = [];
  for (const n of listDirs(dir)) {
    if (depth === 0 && NOT_SCOPES.has(n)) continue;
    if (n === 'skills' || n === 'agents') continue;
    const p = join(dir, n);
    const key = prefix ? `${prefix}/${n}` : n;
    // A nested git repository is a separate skill repo with its own manifest - never index it
    // from here, or `--check` would depend on directories this repo does not track.
    if (existsSync(join(p, '.git'))) continue;
    if (existsSync(join(p, '.claude-plugin', 'plugin.json'))) out.push({ key, dir: p });
    else if (existsSync(join(p, 'skills'))) errors.push(`${key}: has a skills/ folder but no .claude-plugin/plugin.json`);
    else out.push(...findScopes(p, key, depth + 1));
  }
  return out;
}

// Scope keys are always relative to the base skills folder (what agents put in SKILLS_ROOT), so
// a nested repo indexed with --root gets its folder name as prefix: "venture-labs/core",
// "personal". A nested repo whose root folder is itself the plugin (personal/) is one scope.
const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = ROOT === TOOL_ROOT ? '' : relative(TOOL_ROOT, ROOT).split('\\').join('/');
const found = existsSync(join(ROOT, '.claude-plugin', 'plugin.json'))
  ? [{ key: PREFIX || '.', dir: ROOT }]
  : findScopes(ROOT, PREFIX);

const scopes = {};
for (const { key: scopeName, dir: scopeDir } of found) {
  const plugin = readPlugin(scopeDir);
  const skills = listDirs(join(scopeDir, 'skills'))
    .map((s) => readSkill(scopeName, join(scopeDir, 'skills', s)))
    .filter(Boolean);
  scopes[scopeName] = {
    plugin: plugin?.name ?? null,
    version: plugin?.version ?? null,
    skills,
    agents: readAgents(scopeDir),
  };
}

const manifest = {
  $comment: 'Generated by tools/build-manifest.mjs - do not edit by hand. Run `npm run manifest`.',
  scopes,
};
const json = JSON.stringify(manifest, null, 2) + '\n';
const manifestPath = join(ROOT, 'manifest.json');

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} error(s) - manifest not written.`);
  process.exit(1);
}

const totalSkills = Object.values(scopes).reduce((n, s) => n + s.skills.length, 0);
if (CHECK) {
  // Compare line-ending-insensitively: git's autocrlf may have rewritten the file on checkout.
  const current = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== json) {
    console.error('error manifest.json is out of date - run `npm run manifest` and commit it.');
    process.exit(1);
  }
  console.log(`ok    ${totalSkills} skill(s) across ${Object.keys(scopes).length} scope(s); manifest up to date.`);
} else {
  writeFileSync(manifestPath, json);
  console.log(`wrote manifest.json: ${totalSkills} skill(s) across ${Object.keys(scopes).length} scope(s).`);
}
