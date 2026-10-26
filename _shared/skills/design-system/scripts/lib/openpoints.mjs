// openpoints.mjs - the open-points rule (references/open-points.md, R1-R6 + R1a) as code: how DESIGN.md's
// "Open points" table is classified ("entschieden nach" R1-R6, or "für <owner>: <reason>") and how its
// "Exceptions" table (screen, value, reason, who, when) is read. check-system.mjs fails on a missing
// classification or an incomplete exception; token-audit.mjs lets a listed exception pass and turns every
// other new value into an R1a question. Dependency-free; never throws on a bad file.

import { parseColor } from './color.mjs';

export const RULES = Object.freeze({
  R1: 'approved screens beat code and old tokens (code that differs is a fix task)',
  R2: 'the shared foundation beats app copies',
  R3: 'names follow values (a misnamed token is renamed, the value kept)',
  R4: 'WCAG AA is mandatory (a failing text colour takes the nearest darker shade; brand fills are never changed)',
  R5: 'what no source defines is not invented (noch nicht festgelegt - the next design round)',
  R6: 'the system describes what the product really does',
});

const OPEN_HEADING = /^open (points|questions)/i;
const EXCEPTION_HEADING = /^(exceptions|ausnahmen)\b/i;
const BASIS_HEADER = /^(entschieden nach|decided (by|after))/i;
const EMPTY = /^(|-|–|—|none|keine|n\/a|_none_|_keine_)$/i;

function sectionsOf(text) {
  const map = new Map();
  for (const part of String(text ?? '').split(/^## /m).slice(1)) {
    const [title, ...rest] = part.split('\n');
    map.set(title.trim(), rest.join('\n').trim());
  }
  return map;
}

/** A markdown table of a section body: `{ header: string[], rows: string[][] }` (first table only; cells trimmed). */
export function parseTable(body) {
  const lines = String(body ?? '').split('\n').filter((l) => /^\s*\|/.test(l));
  const cells = lines.filter((l) => !/^\s*\|[\s:|-]+\|?\s*$/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  if (!cells.length) return { header: [], rows: [] };
  return { header: cells[0], rows: cells.slice(1) };
}

/**
 * The classification of one open point: `{ ok, rule, owner, reason }`. A cell is valid when it starts with R1..R6
 * ("R3", "R4 - darker grey") or with "für <owner>" ("für Christian: Geschmack"); a «für» without a reason is still
 * valid when it names the owner (the question itself is the reason).
 */
export function classify(cell) {
  const c = String(cell ?? '').trim();
  const r = c.match(/^R([1-6])\b/);
  if (r) return { ok: true, rule: `R${r[1]}`, owner: null, reason: c.slice(2).replace(/^[\s:–—-]+/, '') };
  const f = c.match(/^f(ü|ue)r\s+([^:\s,;]+)\s*[:–—-]?\s*(.*)$/i);
  if (f) return { ok: true, rule: null, owner: f[2], reason: f[3] };
  return { ok: false, rule: null, owner: null, reason: '' };
}

/**
 * The open points of DESIGN.md: `{ heading, hasColumn, rows: [{ id, question, today, basis, class }] }`.
 * `hasColumn` = the table has the "entschieden nach" column.
 */
export function openPointRows(designText) {
  const sec = sectionsOf(designText);
  const heading = [...sec.keys()].find((k) => OPEN_HEADING.test(k));
  if (!heading) return { heading: null, hasColumn: false, rows: [] };
  const { header, rows } = parseTable(sec.get(heading));
  const col = header.findIndex((h) => BASIS_HEADER.test(h));
  const out = rows.map((cells) => ({
    id: cells[0] ?? '',
    question: cells[1] ?? '',
    today: cells[2] ?? '',
    basis: col >= 0 ? (cells[col] ?? '') : '',
    class: classify(col >= 0 ? cells[col] : ''),
  }));
  return { heading, hasColumn: col >= 0, rows: out };
}

const px = (s) => {
  const m = String(s).trim().match(/^(-?[\d.]+)\s*(px|rem|em|pt)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] && /rem|em/i.test(m[2]) ? n * 16 : n;
};

/**
 * The exceptions of DESIGN.md ("## Exceptions" / "## Ausnahmen"): `{ heading, rows: [{ screen, value, reason, who, when, color, number }] }`.
 * A row of "none" cells is no exception. `color` = parsed colour, `number` = parsed px, null when the value is neither.
 */
export function exceptionRows(designText) {
  const sec = sectionsOf(designText);
  const heading = [...sec.keys()].find((k) => EXCEPTION_HEADING.test(k));
  if (!heading) return { heading: null, rows: [] };
  const { rows } = parseTable(sec.get(heading));
  const out = rows
    .filter((cells) => !cells.every((c) => EMPTY.test(c.replace(/[`*_]/g, '').trim())))
    .map(([screen = '', value = '', reason = '', who = '', when = ''], i) => {
      const bare = value.replace(/`/g, '').trim();
      return { n: i + 1, screen: screen.replace(/`/g, '').trim(), value: bare, reason, who, when, color: parseColor(bare) ?? null, number: px(bare) };
    });
  return { heading, rows: out };
}

/**
 * DESIGN.md against the rule: `{ errors, warnings }` (plain strings). An open point WITHOUT its classification is an error when the table has the
 * «entschieden nach» column (a row left empty or invalid) or its heading is «... for Christian» (the owner of the rule); a table of another owner
 * without the column yet (Martin's lists) is a warning - the column is added when that owner's points are next worked on. An exception with a
 * missing field is always an error.
 */
export function designFindings(designText) {
  const errors = [];
  const warnings = [];
  const op = openPointRows(designText);
  if (op.heading && op.rows.length) {
    if (!op.hasColumn) {
      const msg = `DESIGN.md "${op.heading}" has no column «entschieden nach» - every open point carries R1-R6 or «für <owner>: <reason>» (references/open-points.md)`;
      (/christian/i.test(op.heading) ? errors : warnings).push(msg);
    } else for (const r of op.rows) if (!r.class.ok) errors.push(`DESIGN.md open point ${r.id || '?'} has no valid «entschieden nach» (R1-R6, or «für <owner>: <reason>»; got «${r.basis || 'nothing'}»)`);
  }
  for (const e of exceptionRows(designText).rows) {
    const missing = [['screen', e.screen], ['value', e.value], ['reason', e.reason], ['who', e.who]].filter(([, v]) => !v || EMPTY.test(v)).map(([k]) => k);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.when)) missing.push('when (YYYY-MM-DD)');
    if (missing.length) errors.push(`DESIGN.md exception ${e.n} (${e.value || '?'}) lacks ${missing.join(', ')} - an exception names screen, value, reason, who and when`);
    else if (!e.color && e.number == null) errors.push(`DESIGN.md exception ${e.n}: «${e.value}» is neither a colour nor a size/radius in px - state the exact value`);
  }
  return { errors, warnings };
}

/** The errors of `designFindings` (kept for callers that want a flat list). */
export const designGaps = (designText) => designFindings(designText).errors;

/** The R1a question for one new value (the fixed wording of Christian's decision, 2026-10-26). */
export const r1aQuestion = (value, use) => `neue Farbe ${value} für ${use} - ins Designsystem aufnehmen oder als Ausnahme für diesen Screen?`;
export const r1aQuestionFor = (kind, value, use) => (kind === 'colour' ? r1aQuestion(value, use) : `neuer Wert ${value} (${kind}) für ${use} - ins Designsystem aufnehmen oder als Ausnahme für diesen Screen?`);
