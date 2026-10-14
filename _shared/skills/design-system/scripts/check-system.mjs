#!/usr/bin/env node
// check-system.mjs - is this design system complete and well-formed? The mechanical half of the
// completeness checklist (references/checklist.md); contrast and the audit are their own scripts.
//
//   node check-system.mjs <system folder> [--require-approved] [--json]
//
// Errors (exit 1):
//   - a semantic role missing in one mode (every role needs a value in EVERY mode)
//   - a token with a literal value and no source ($extensions["skill.design-system"].source)
//   - a component token that is a literal or points at a primitive instead of a semantic role
//   - a brand file that overrides anything but a primitive path or a brand.* slot
//   - the same path in two tiers
//   - a component with tokens but no components/<name>.md, a spec missing a fixed-grid section,
//     or a state used in the tokens (hover, pressed, focus, disabled, ...) the spec does not list
//   - missing DESIGN.md, llms.txt, foundations/color.md, foundations/typography.md,
//     specimen/index.html, or no reference image for a mode
//   - with --require-approved: no specimen/APPROVED.md (who approved, when, their words)
// Exit codes: 0 complete · 1 findings · 2 usage or unreadable token files.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXT, loadSystem } from './lib/tokens.mjs';

export const SPEC_SECTIONS = ['Purpose', 'Anatomy', 'Tokens', 'States', 'Do', "Don't"];
export const STATE_WORDS = ['default', 'hover', 'pressed', 'active', 'focus', 'disabled', 'selected', 'error', 'loading', 'empty'];
const IMAGE = /\.(png|jpe?g|webp)$/i;

const aliasesIn = (v) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? '');
  return [...s.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
};
const isPureAlias = (v) => typeof v === 'string' && /^\{[^{}]+\}$/.test(v);
const hasSource = (t) => Boolean(t.$extensions?.[EXT]?.source);

export function checkSystem(dir, { requireApproved = false } = {}) {
  const errors = [];
  const warnings = [];
  const system = loadSystem(dir);
  const { primitives, semantic, components, brands, modes } = system;

  // 1. every semantic role in every mode
  const all = new Set(modes.flatMap((m) => [...semantic[m].keys()]));
  for (const m of modes) for (const p of all) if (!semantic[m].has(p)) errors.push(`semantic role "${p}" has no value in mode "${m}" (semantic.${m}.tokens.json)`);

  // 2. no literal without a source; semantic should point at primitives
  const literalNeedsSource = (tier, path, t) => {
    if (isPureAlias(t.$value)) return;
    if (!hasSource(t)) errors.push(`${tier} token "${path}" (${t.file}) is a literal with no source - add $extensions["${EXT}"].source (the reference file and spot it was read from, or the decision that set it)`);
    else if (/^\s*TODO\b/i.test(String(t.$extensions[EXT].source))) errors.push(`${tier} token "${path}" still has the starter's placeholder source - read the real value from the reference and say where`);
  };
  for (const [p, t] of primitives) literalNeedsSource('primitive', p, t);
  for (const m of modes) {
    for (const [p, t] of semantic[m]) {
      literalNeedsSource(`semantic (${m})`, p, t);
      for (const a of aliasesIn(t.$value)) if (!primitives.has(a)) {
        if (all.has(a)) warnings.push(`semantic "${p}" (${m}) points at another semantic role {${a}} - allowed, but a role chain is harder to override`);
        else errors.push(`semantic "${p}" (${m}) points at {${a}}, which is no primitive`);
      }
    }
  }

  // 3. components only through semantic roles
  for (const [p, t] of components) {
    const refs = [...aliasesIn(t.$value), ...aliasesIn(t.$extensions?.[EXT]?.css)];
    if (!isPureAlias(t.$value) && !t.$extensions?.[EXT]?.css) errors.push(`component token "${p}" is a literal - a component uses semantic roles only`);
    for (const a of refs) {
      if (primitives.has(a) && !all.has(a)) errors.push(`component token "${p}" points at primitive {${a}} - go through a semantic role so modes and brands reach it`);
      else if (!all.has(a) && !components.has(a)) errors.push(`component token "${p}" points at {${a}}, which is no semantic role`);
    }
  }

  // 4. brands override primitives or brand.* only
  for (const [b, info] of Object.entries(brands)) {
    for (const p of info.tokens.keys()) {
      if (!primitives.has(p) && !p.startsWith('brand.')) errors.push(`brand "${b}" overrides "${p}" - a brand may only override a primitive path or a brand.* slot, never a semantic role or a component`);
    }
    for (const m of info.modes) if (!modes.includes(m)) errors.push(`brand "${b}" declares mode "${m}", which the system does not have`);
  }

  // 5. one tier per path
  for (const p of primitives.keys()) if (all.has(p)) errors.push(`"${p}" is both a primitive and a semantic role`);
  for (const p of components.keys()) if (all.has(p) || primitives.has(p)) errors.push(`"${p}" is a component token and also in another tier`);

  // 6. component specs
  const byComponent = new Map();
  for (const p of components.keys()) {
    const name = p.split('.')[0];
    if (!byComponent.has(name)) byComponent.set(name, new Set());
    for (const seg of p.split('.').slice(1)) if (STATE_WORDS.includes(seg.toLowerCase())) byComponent.get(name).add(seg.toLowerCase());
  }
  for (const [name, states] of byComponent) {
    const spec = join(dir, 'components', `${name}.md`);
    if (!existsSync(spec)) {
      errors.push(`component "${name}" has tokens but no spec components/${name}.md`);
      continue;
    }
    const text = readFileSync(spec, 'utf8');
    for (const s of SPEC_SECTIONS) if (!new RegExp(`^##\\s+${s.replace("'", "['’]")}\\s*$`, 'mi').test(text)) errors.push(`components/${name}.md has no "## ${s}" section`);
    const statesSection = (text.split(/^##\s+States\s*$/mi)[1] ?? '').split(/^##\s/m)[0].toLowerCase();
    for (const st of states) if (!statesSection.includes(st)) errors.push(`components/${name}.md does not list the state "${st}" that its tokens use`);
    if (!/\bdefault\b/.test(statesSection)) warnings.push(`components/${name}.md: the States section names no "default" state`);
  }

  // 7. files a human and an agent read
  for (const f of ['DESIGN.md', 'llms.txt', 'foundations/color.md', 'foundations/typography.md', 'specimen/index.html']) {
    if (!existsSync(join(dir, f))) errors.push(`missing ${f}`);
  }
  for (const m of modes) {
    const refDir = join(dir, 'reference', m);
    const images = existsSync(refDir) ? readdirSync(refDir).filter((f) => IMAGE.test(f)) : [];
    if (images.length === 0) errors.push(`no reference image for mode "${m}" in reference/${m}/ - the approved screens are the visual anchor`);
  }
  const approved = existsSync(join(dir, 'specimen', 'APPROVED.md'));
  if (!approved) (requireApproved ? errors : warnings).push('specimen/APPROVED.md is missing - no human has approved this system yet, so no screen may be drawn from it');

  return { system: system.name, modes, brands: Object.keys(brands), components: [...byComponent.keys()], approved, errors, warnings };
}

function main(argv) {
  const dirArg = argv.find((a) => !a.startsWith('--'));
  if (!dirArg || argv.includes('--help')) {
    console.error('usage: node check-system.mjs <system folder> [--require-approved] [--json]');
    return argv.includes('--help') ? 0 : 2;
  }
  let report;
  try {
    report = checkSystem(resolve(dirArg), { requireApproved: argv.includes('--require-approved') });
  } catch (e) {
    console.error(`error ${e.message}`);
    return 2;
  }
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const w of report.warnings) console.error(`warn  ${w}`);
    for (const e of report.errors) console.error(`error ${e}`);
    console.log(`${report.system}: ${report.errors.length} error(s), ${report.warnings.length} warning(s); modes ${report.modes.join(', ')}; brands ${report.brands.join(', ') || 'none'}; approved ${report.approved ? 'yes' : 'no'}`);
  }
  return report.errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
