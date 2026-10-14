// tokens.mjs - loads a design system folder (DTCG 2025.10 token files), resolves aliases per mode
// and brand, and turns every token into a CSS value. Shared by build-tokens, token-audit,
// contrast, check-system and specimen. Dependency-free.
//
// Folder contract (see references/folder-template.md):
//   system.json                         { name, modes: ["light","dark"], fontImports?: [url] }
//   tokens/primitives.tokens.json       tier 1: raw values, no aliases needed
//   tokens/semantic.<mode>.tokens.json  tier 2: one file per mode, the SAME paths in every mode
//   tokens/components.tokens.json       tier 3: aliases to semantic tokens only
//   tokens/brands/<brand>.tokens.json   a customer scheme: overrides primitive paths or brand.* slots
// Non-DTCG data lives under $extensions["skill.design-system"] (EXT below): `css` (a full CSS
// value for what DTCG cannot express - mesh grounds, glass, angled gradients), `stops` (the
// colours a background passes through, for the contrast check), `modes` (on a brand file: the
// modes that brand defines; a brand without "dark" stays light in dark mode).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseColor, toHex } from './color.mjs';

export const EXT = 'skill.design-system';
const ALIAS = /\{([^{}]+)\}/g;

export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file}: ${e.message}`);
  }
}

/** Flattens a DTCG tree into Map(path -> { $value, $type, $extensions, $description, file }). */
export function flatten(tree, file, out = new Map(), prefix = [], inheritedType) {
  if (!tree || typeof tree !== 'object') return out;
  const type = tree.$type ?? inheritedType;
  if ('$value' in tree) {
    out.set(prefix.join('.'), { $value: tree.$value, $type: type, $extensions: tree.$extensions, $description: tree.$description, file });
    return out;
  }
  for (const [k, v] of Object.entries(tree)) {
    if (k.startsWith('$')) continue;
    flatten(v, file, out, [...prefix, k], type);
  }
  return out;
}

/** Reads a system folder. Throws with the file name on a missing or broken file. */
export function loadSystem(dir) {
  const configFile = join(dir, 'system.json');
  const config = existsSync(configFile) ? readJson(configFile) : {};
  const modes = config.modes ?? ['light', 'dark'];
  const tokDir = join(dir, 'tokens');
  const need = (f) => {
    const p = join(tokDir, f);
    if (!existsSync(p)) throw new Error(`missing token file ${p}`);
    return p;
  };
  const primitivesFile = need('primitives.tokens.json');
  const primitives = flatten(readJson(primitivesFile), primitivesFile);
  const semantic = {};
  for (const m of modes) {
    const f = need(`semantic.${m}.tokens.json`);
    semantic[m] = flatten(readJson(f), f);
  }
  const componentsFile = join(tokDir, 'components.tokens.json');
  const components = existsSync(componentsFile) ? flatten(readJson(componentsFile), componentsFile) : new Map();
  const brands = {};
  const brandDir = join(tokDir, 'brands');
  if (existsSync(brandDir)) {
    for (const f of readdirSync(brandDir).filter((x) => x.endsWith('.tokens.json') && !x.startsWith('_')).sort()) {
      const raw = readJson(join(brandDir, f));
      brands[basename(f, '.tokens.json')] = {
        tokens: flatten(raw, join(brandDir, f)),
        modes: raw.$extensions?.[EXT]?.modes ?? ['light'],
        file: join(brandDir, f),
      };
    }
  }
  return { dir, config, name: config.name ?? basename(dir), modes, primitives, semantic, components, brands };
}

/** The merged token map for one mode (and brand): primitives (+ brand overrides), semantic, components. */
export function tokenSet(system, mode, brand) {
  const set = new Map(system.primitives);
  const b = brand ? system.brands[brand] : undefined;
  if (brand && !b) throw new Error(`unknown brand "${brand}"`);
  if (b) for (const [k, v] of b.tokens) set.set(k, { ...v, brand });
  const modeUsed = b && !b.modes.includes(mode) ? b.modes[0] ?? system.modes[0] : mode;
  for (const [k, v] of system.semantic[modeUsed] ?? []) set.set(k, v);
  for (const [k, v] of system.components) set.set(k, v);
  return set;
}

/** Resolves aliases recursively. Returns Map(path -> { type, value (resolved, DTCG shape), css, tier, ... }). */
export function resolveSet(set, tiers = {}) {
  const done = new Map();
  const resolving = new Set();
  const resolveValue = (value, from) => {
    if (typeof value === 'string') {
      const whole = value.match(/^\{([^{}]+)\}$/);
      if (whole) return resolvePath(whole[1], from).value;
      return value.replace(ALIAS, (_, p) => {
        const r = resolvePath(p, from);
        return typeof r.value === 'string' ? r.value : r.css;
      });
    }
    if (Array.isArray(value)) return value.map((v) => resolveValue(v, from));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveValue(v, from)]));
    return value;
  };
  const resolvePath = (path, from) => {
    if (done.has(path)) return done.get(path);
    const tok = set.get(path);
    if (!tok) throw new Error(`${from ?? '?'}: alias {${path}} points at no token`);
    if (resolving.has(path)) throw new Error(`alias cycle through {${path}}`);
    resolving.add(path);
    const value = resolveValue(tok.$value, path);
    const aliasMatch = typeof tok.$value === 'string' && tok.$value.match(/^\{([^{}]+)\}$/);
    const type = tok.$type ?? (aliasMatch ? resolvePath(aliasMatch[1], path).type : undefined);
    const ext = tok.$extensions?.[EXT] ?? {};
    // a pure alias carries its target's recipe and sample stops unless it declares its own
    const target = aliasMatch ? resolvePath(aliasMatch[1], path) : null;
    const css = ext.css ? resolveValue(ext.css, path) : target ? target.css : toCssValue(type, value);
    const entry = {
      path, type, value, css, file: tok.file, tier: tiers[path], alias: aliasMatch ? aliasMatch[1] : null,
      stops: ext.stops ? resolveValue(ext.stops, path) : target?.stops, brand: tok.brand,
    };
    resolving.delete(path);
    done.set(path, entry);
    return entry;
  };
  for (const path of set.keys()) resolvePath(path);
  return done;
}

const dim = (v) => (v && typeof v === 'object' && 'value' in v ? `${v.value}${v.unit ?? ''}` : String(v));
const colorCss = (v) => {
  if (typeof v === 'string') return v;
  const c = parseColor(v);
  return c ? toHex(c) : String(v);
};
const family = (v) => (Array.isArray(v) ? v : [v]).map((f) => (/[\s\d]/.test(f) && !/^["']/.test(f) && !GENERIC.has(f) ? `'${f}'` : f)).join(', ');
export const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'inherit', 'initial']);

function shadowCss(v) {
  const one = (s) => [s.inset ? 'inset' : '', dim(s.offsetX ?? 0), dim(s.offsetY ?? 0), dim(s.blur ?? 0), dim(s.spread ?? 0), colorCss(s.color)].filter(Boolean).join(' ');
  return Array.isArray(v) ? v.map(one).join(', ') : one(v);
}

/** A resolved DTCG value as CSS. Composite typography returns its shorthand. */
export function toCssValue(type, v) {
  if (v == null) return '';
  switch (type) {
    case 'color': return colorCss(v);
    case 'dimension': case 'duration': return dim(v);
    case 'fontFamily': return family(v);
    case 'fontWeight': case 'number': return String(v);
    case 'cubicBezier': return Array.isArray(v) ? `cubic-bezier(${v.join(', ')})` : String(v);
    case 'shadow': return shadowCss(v);
    case 'border': return typeof v === 'object' ? `${dim(v.width)} ${v.style ?? 'solid'} ${colorCss(v.color)}` : String(v);
    case 'gradient': return Array.isArray(v) ? `linear-gradient(180deg, ${v.map((s) => `${colorCss(s.color)} ${Math.round((s.position ?? 0) * 100)}%`).join(', ')})` : String(v);
    case 'typography':
      if (typeof v !== 'object') return String(v);
      return `${v.fontWeight ?? 400} ${dim(v.fontSize)}${v.lineHeight != null ? `/${dim(v.lineHeight)}` : ''} ${family(v.fontFamily ?? 'sans-serif')}`;
    default: return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
}

export const cssName = (path) => '--' + path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** CSS custom properties for one resolved set: Map(name -> value); typography also gets its parts. */
export function cssVars(resolved) {
  const out = new Map();
  for (const t of resolved.values()) {
    out.set(cssName(t.path), t.css);
    if (t.type === 'typography' && t.value && typeof t.value === 'object') {
      for (const [k, v] of Object.entries(t.value)) {
        const part = k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
        const css = k === 'fontFamily' ? family(v) : k === 'fontWeight' ? String(v) : dim(v);
        out.set(`${cssName(t.path)}-${part}`, css);
      }
    }
  }
  return out;
}

/** Which tier each path comes from (for the audit and the completeness check). */
export function tierMap(system) {
  const tiers = {};
  for (const k of system.primitives.keys()) tiers[k] = 'primitive';
  for (const m of system.modes) for (const k of system.semantic[m].keys()) tiers[k] = 'semantic';
  for (const k of system.components.keys()) tiers[k] = 'component';
  for (const b of Object.values(system.brands)) for (const k of b.tokens.keys()) if (!tiers[k]) tiers[k] = 'brand';
  return tiers;
}

/** Every resolved combination: { light: Map, dark: Map, 'brand:<b>:<mode>': Map }. */
export function resolveAll(system) {
  const tiers = tierMap(system);
  const out = {};
  for (const m of system.modes) out[m] = resolveSet(tokenSet(system, m), tiers);
  for (const b of Object.keys(system.brands)) for (const m of system.modes) out[`brand:${b}:${m}`] = resolveSet(tokenSet(system, m, b), tiers);
  return out;
}
