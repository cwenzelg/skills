// node --test scripts/l6-verdict.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bannerVerdict, parseDeviceAccess, DEVICE_ACCESS } from './l6-verdict.mjs';

const plausible = { vendor: 'Plausible Analytics', hosts: ['plausible.io'], essential: false, deviceAccess: 'none', requests: 2 };
const ga = { vendor: 'Google Analytics / Tag Manager / Ads', hosts: ['googletagmanager.com'], essential: false, deviceAccess: 'cookies', requests: 3 };
const netlify = { vendor: 'Netlify (hosting)', hosts: [], essential: true, hosting: true, deviceAccess: 'none', requests: 0 };
const base = { l5NonEssentialKeys: [], hasBanner: false };

test('Plausible contacted, nothing stored, no banner -> L6 pass with the cookieless note; L4 still decides naming', () => {
  const r = bannerVerdict({ ...base, vendorRows: [netlify, plausible] });
  assert.equal(r.verdict, 'pass');
  assert.equal(r.triggers.length, 0);
  assert.match(r.summary, /no banner needed.*Plausible Analytics is cookieless.*L4/);
  assert.ok(r.notes.some((n) => /Plausible Analytics.*cookieless.*Datenschutzerklaerung/.test(n)));
});

test('a storing vendor contacted before consent -> L6 fail blocker, as before', () => {
  const r = bannerVerdict({ ...base, vendorRows: [plausible, ga] });
  assert.equal(r.verdict, 'fail');
  assert.equal(r.severity, 'blocker (presence)');
  assert.deepEqual(r.triggers.map((v) => v.vendor), [ga.vendor]);
});

test('an unknown device access is treated as storing and named', () => {
  const r = bannerVerdict({ ...base, vendorRows: [{ ...ga, vendor: 'Some CDN', deviceAccess: undefined }] });
  assert.equal(r.verdict, 'fail');
  assert.ok(r.notes.some((n) => /unknown, treated as storing: Some CDN/.test(n)));
});

test('non-essential storage found by L5 fails even when only Plausible was contacted', () => {
  const r = bannerVerdict({ vendorRows: [plausible], l5NonEssentialKeys: ['_ga'], hasBanner: true });
  assert.equal(r.verdict, 'fail');
  assert.match(r.summary, /see L5/);
});

test('a banner although only a cookieless vendor was contacted stays the "banner without need" note', () => {
  const r = bannerVerdict({ ...base, hasBanner: true, vendorRows: [plausible] });
  assert.equal(r.verdict, 'fail');
  assert.equal(r.severity, 'note');
  assert.match(r.summary, /banner without need/);
});

test('the honest limit names the iframes present', () => {
  const r = bannerVerdict({ ...base, vendorRows: [plausible], iframeHosts: ['www.youtube.com', 'www.youtube.com'] });
  assert.ok(r.notes.some((n) => /iframe-internal storage is not visible; iframes present: www\.youtube\.com$/.test(n)));
});

test('parseDeviceAccess: first word of the cell, anything else is unknown', () => {
  assert.equal(parseDeviceAccess('none, [src](https://x)'), 'none');
  assert.equal(parseDeviceAccess('cookies (`__cf_bm`)'), 'cookies');
  assert.equal(parseDeviceAccess(''), 'unknown');
  assert.equal(parseDeviceAccess('maybe'), 'unknown');
});

test('third-parties.md: every vendor row has a device access, and every `none` row carries a source link (or is hosting)', () => {
  const md = readFileSync(new URL('../references/third-parties.md', import.meta.url), 'utf8');
  const rows = md.split('\n').filter((l) => l.startsWith('| `') && l.split('|').length === 9);
  assert.ok(rows.length > 30);
  for (const l of rows) {
    const c = l.split('|').map((x) => x.trim());
    assert.ok(DEVICE_ACCESS.includes(parseDeviceAccess(c[7])), `${c[2]}: bad device access "${c[7]}"`);
    if (parseDeviceAccess(c[7]) === 'none' && !/hosting/.test(c[7])) assert.match(c[7], /\]\(https:\/\//, `${c[2]}: "none" needs a source link`);
  }
  const plaus = rows.find((l) => /Plausible Analytics/.test(l));
  assert.equal(parseDeviceAccess(plaus.split('|')[7]), 'none');
});
