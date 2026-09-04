#!/usr/bin/env node
// Vendored upstream skills, driven by the lockfile _shared/upstream.json.
//
//   node tools/upstream.mjs add --skill docx [--scope _shared] [--repo owner/repo] [--path dir/in/repo]
//       copy a skill out of an upstream repo at its current HEAD, record it in the lockfile
//   node tools/upstream.mjs sync [skill]
//       re-copy every (or one) locked skill at its pinned commit - restores a clean tree
//   node tools/upstream.mjs update [skill]
//       bump the pin to upstream's current HEAD, re-copy, print what changed; review with git diff
//
// Vendored skills are committed (an upstream change to a skill is a behavior change and should
// show up as a reviewable diff), never edited in place (adapt by copying under a new name), and
// each carries a generated UPSTREAM.md. Defaults: --repo anthropics/skills, --scope _shared,
// --path skills/<skill>. Dependency-free on purpose.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(ROOT, '_shared', 'upstream.json');

const [cmd, ...rest] = process.argv.slice(2);
function arg(name, fallback) {
  const i = rest.indexOf(`--${name}`);
  return i !== -1 && rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : fallback;
}
const positional = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));

function usage(code = 2) {
  console.error('usage: node tools/upstream.mjs add --skill <name> [--scope _shared] [--repo owner/repo] [--path dir]\n' +
                '       node tools/upstream.mjs sync [skill]\n' +
                '       node tools/upstream.mjs update [skill]');
  process.exit(code);
}

function readLock() {
  if (!existsSync(LOCK)) return { $comment: 'Vendored upstream skills. Managed by tools/upstream.mjs - see README "Upstream skills".', skills: {} };
  return JSON.parse(readFileSync(LOCK, 'utf8'));
}
function writeLock(lock) {
  const sorted = Object.fromEntries(Object.entries(lock.skills).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(LOCK, JSON.stringify({ ...lock, skills: sorted }, null, 2) + '\n');
}
function repoUrl(repo) {
  return repo.startsWith('http') || repo.startsWith('git@') ? repo : `https://github.com/${repo}.git`;
}
// -c core.autocrlf=false: the temp clone must not CRLF-convert files this repo stores as LF.
const git = (args, cwd) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

// Sparse-clone one path of a repo; returns { dir, commit }. Caller removes tmp.
function fetch(repo, path, commit) {
  const tmp = mkdtempSync(join(tmpdir(), 'skills-upstream-'));
  const src = join(tmp, 'src');
  const url = repoUrl(repo);
  if (commit) {
    git(['init', '-q', src], tmp);
    git(['remote', 'add', 'origin', url], src);
    git(['sparse-checkout', 'set', '--no-cone', path], src);
    git(['fetch', '--quiet', '--depth', '1', '--filter=blob:none', 'origin', commit], src);
    git(['checkout', '--quiet', 'FETCH_HEAD'], src);
  } else {
    git(['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--quiet', url, 'src'], tmp);
    git(['sparse-checkout', 'set', path], src);
  }
  return { tmp, dir: join(src, ...path.split('/')), commit: git(['rev-parse', 'HEAD'], src) };
}

function install(skill, entry, commit) {
  const dest = join(ROOT, entry.scope, 'skills', skill);
  const { tmp, dir, commit: got } = fetch(entry.repo, entry.path, commit);
  try {
    if (!existsSync(join(dir, 'SKILL.md'))) throw new Error(`no SKILL.md at ${entry.path} in ${entry.repo}`);
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(dir, dest, { recursive: true });
    const name = (readFileSync(join(dest, 'SKILL.md'), 'utf8').match(/^name:\s*(.+)$/m) || [])[1]?.trim();
    if (name && name !== skill) console.warn(`warn  ${skill}: upstream frontmatter name is "${name}" - manifest validation will fail until folder and name match.`);
    writeFileSync(
      join(dest, 'UPSTREAM.md'),
      `# Upstream\n\nVendored copy managed by tools/upstream.mjs (lockfile: _shared/upstream.json). Do not edit this\n` +
        `skill in place - to adapt it, copy it under a new name in the right scope. Refresh with\n` +
        `\`npm run upstream:update ${skill}\`; review the diff before committing.\n\n` +
        `repo: ${repoUrl(entry.repo)}\npath: ${entry.path}\ncommit: ${got}\n`,
    );
    return got;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const lock = readLock();

if (cmd === 'add') {
  const skill = arg('skill');
  if (!skill) usage();
  const scope = arg('scope', '_shared');
  const repo = arg('repo', 'anthropics/skills');
  const path = arg('path', `skills/${skill}`).replace(/\\/g, '/');
  if (!existsSync(join(ROOT, scope, '.claude-plugin', 'plugin.json'))) {
    console.error(`scope "${scope}" is not a plugin folder here (no ${scope}/.claude-plugin/plugin.json)`);
    process.exit(2);
  }
  if (lock.skills[skill] && !rest.includes('--force')) {
    console.error(`${skill} is already in the lockfile - use "update ${skill}" to refresh it, or --force to re-add.`);
    process.exit(2);
  }
  const entry = { scope, repo, path };
  const commit = install(skill, entry);
  lock.skills[skill] = { ...entry, commit, added: new Date().toISOString().slice(0, 10) };
  writeLock(lock);
  console.log(`added ${skill} <- ${repo}@${commit.slice(0, 7)}:${path} into ${scope}/skills/${skill}`);
  console.log('run `npm run manifest` next, then review and commit.');
} else if (cmd === 'sync' || cmd === 'update') {
  const only = positional[0];
  const names = only ? [only] : Object.keys(lock.skills);
  if (only && !lock.skills[only]) {
    console.error(`${only} is not in the lockfile. Locked: ${Object.keys(lock.skills).join(', ') || '(none)'}`);
    process.exit(2);
  }
  let changed = 0;
  for (const skill of names) {
    const entry = lock.skills[skill];
    if (cmd === 'sync') {
      install(skill, entry, entry.commit);
      console.log(`synced  ${skill} @ ${entry.commit.slice(0, 7)}`);
    } else {
      const got = install(skill, entry);
      if (got === entry.commit) {
        console.log(`current ${skill} @ ${got.slice(0, 7)} (no upstream change)`);
      } else {
        console.log(`updated ${skill}: ${entry.commit.slice(0, 7)} -> ${got.slice(0, 7)}`);
        lock.skills[skill] = { ...entry, commit: got, updated: new Date().toISOString().slice(0, 10) };
        changed++;
      }
    }
  }
  if (cmd === 'update') {
    writeLock(lock);
    console.log(changed ? `${changed} skill(s) updated - run \`npm run manifest\`, then \`git diff\` and review before committing.` : 'everything is at upstream HEAD.');
  } else {
    console.log('tree matches the lockfile - run `npm run manifest` if anything was restored.');
  }
} else {
  usage(cmd ? 2 : 0);
}
