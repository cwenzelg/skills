#!/usr/bin/env node
// Copies one skill folder out of an upstream git repo into a scope here and records where it
// came from in UPSTREAM.md. Shallow sparse clone, so it stays fast even for large upstreams.
//
//   node tools/fork-upstream.mjs --skill mcp-builder
//   node tools/fork-upstream.mjs --skill docx --scope _shared
//   node tools/fork-upstream.mjs --skill foo --repo org/repo --path some/dir/foo --force
//
// Defaults: --repo anthropics/skills, --scope _shared, --path skills/<skill>.

import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const skill = arg('skill');
if (!skill) {
  console.error('usage: node tools/fork-upstream.mjs --skill <name> [--scope _shared] [--repo owner/repo] [--path dir/in/repo] [--force]');
  process.exit(2);
}
const scope = arg('scope', '_shared');
const repo = arg('repo', 'anthropics/skills');
const path = arg('path', `skills/${skill}`).replace(/\\/g, '/');
const force = process.argv.includes('--force');
const url = repo.startsWith('http') || repo.startsWith('git@') ? repo : `https://github.com/${repo}.git`;

const dest = join(ROOT, scope, 'skills', skill);
if (!existsSync(join(ROOT, scope, '.claude-plugin', 'plugin.json'))) {
  console.error(`scope "${scope}" is not a plugin folder here (no ${scope}/.claude-plugin/plugin.json)`);
  process.exit(2);
}
if (existsSync(dest) && !force) {
  console.error(`${scope}/skills/${skill} already exists - pass --force to overwrite (diff against UPSTREAM.md first).`);
  process.exit(2);
}

const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const tmp = mkdtempSync(join(tmpdir(), 'skills-fork-'));
try {
  console.log(`cloning ${url} (sparse: ${path})`);
  git(['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--quiet', url, 'src'], tmp);
  const src = join(tmp, 'src');
  git(['sparse-checkout', 'set', path], src);
  const commit = git(['rev-parse', 'HEAD'], src);
  const srcDir = join(src, ...path.split('/'));
  if (!existsSync(join(srcDir, 'SKILL.md'))) {
    console.error(`no SKILL.md at ${path} in ${repo}`);
    process.exit(1);
  }
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(srcDir, dest, { recursive: true });

  const name = (readFileSync(join(dest, 'SKILL.md'), 'utf8').match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  if (name && name !== skill) {
    console.warn(`warn  upstream frontmatter name is "${name}" but the folder is "${skill}" - manifest validation will fail until they match.`);
  }

  writeFileSync(
    join(dest, 'UPSTREAM.md'),
    `# Upstream\n\nThis skill was copied from an upstream repository by tools/fork-upstream.mjs.\n` +
      `Diff against upstream before pulling changes; note every local edit below.\n\n` +
      `repo: ${url}\npath: ${path}\ncommit: ${commit}\nforked: ${new Date().toISOString().slice(0, 10)}\n\n` +
      `## Local edits\n\n- none yet\n`,
  );
  console.log(`forked ${repo}@${commit.slice(0, 7)}:${path} -> ${scope}/skills/${skill}`);
  console.log('run `npm run manifest` next.');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
