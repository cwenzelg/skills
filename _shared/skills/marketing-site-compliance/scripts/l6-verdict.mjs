// L6 verdict logic, pure (no I/O) so it is testable without a browser. site-audit.mjs calls it.
// The banner verdict follows what really stores or reads on the device before consent (TDDDG §25), not
// who was contacted: a non-essential vendor whose device access is `none` (cookieless analytics such as
// Plausible, with a source in references/third-parties.md) is no banner trigger - it stays an L4 item.

export const DEVICE_ACCESS = ['none', 'cookies', 'storage', 'fingerprint', 'unknown'];

/** The `device access` cell of the vendor table -> one of DEVICE_ACCESS (first word; anything else = unknown). */
export function parseDeviceAccess(cell) {
  const w = String(cell || '').trim().toLowerCase().match(/^[a-z]+/)?.[0];
  return DEVICE_ACCESS.includes(w) ? w : 'unknown';
}

/**
 * @param {{ vendorRows: Array<{vendor:string, hosts:string[], essential:boolean, hosting?:boolean, deviceAccess?:string}>,
 *           l5NonEssentialKeys: string[], l5UnclassifiedKeys?: string[], hasBanner: boolean, iframeHosts?: string[] }} i
 * @returns {{ verdict:'pass'|'fail', severity:string|null, summary:string, triggers:Array, cookieless:Array, notes:string[] }}
 */
export function bannerVerdict(i) {
  const nonEss = i.vendorRows.filter((v) => !v.essential && !v.hosting);
  const access = (v) => v.deviceAccess || 'unknown';
  const triggers = nonEss.filter((v) => access(v) !== 'none');
  const cookieless = nonEss.filter((v) => access(v) === 'none');
  const l5bad = i.l5NonEssentialKeys.length > 0;
  const notes = [];
  const names = (vs) => vs.map((v) => v.vendor).join(', ');
  if (cookieless.length) notes.push(`${names(cookieless)} contacted before consent but documented as cookieless (device access none, source in third-parties.md): no banner reason; it must still be named in the Datenschutzerklaerung (see L4)`);
  const unknownAccess = triggers.filter((v) => access(v) === 'unknown');
  if (unknownAccess.length) notes.push(`device access unknown, treated as storing: ${names(unknownAccess)} (add it to references/third-parties.md with a source)`);
  if ((i.l5UnclassifiedKeys || []).length) notes.push(`unclassified keys set before consent, not counted as a trigger: ${i.l5UnclassifiedKeys.join(', ')}`);
  notes.push(i.iframeHosts?.length ? `iframe-internal storage is not visible; iframes present: ${[...new Set(i.iframeHosts)].join(', ')}` : 'iframe-internal storage is not visible; no iframes present on the first load');
  let verdict = 'pass', severity = null, summary;
  if (triggers.length) {
    verdict = 'fail'; severity = 'blocker (presence)';
    summary = `${triggers.length} non-essential third part${triggers.length > 1 ? 'ies' : 'y'} that store${triggers.length > 1 ? '' : 's'} or read${triggers.length > 1 ? '' : 's'} on the device (or unknown) contacted before any consent (${triggers.map((v) => `${v.vendor}: ${access(v)}`).join(', ')}), ${i.hasBanner ? 'banner present' : 'no banner'}`;
  } else if (l5bad) { verdict = 'fail'; severity = 'blocker (presence)'; summary = 'non-essential storage before consent (see L5)'; }
  else if (i.hasBanner) { verdict = 'fail'; severity = 'note'; summary = `banner shown although nothing non-essential is stored or read${cookieless.length ? ` (only cookieless ${names(cookieless)} contacted)` : ''} (banner without need)`; }
  else summary = cookieless.length ? `no banner needed: nothing stored or read on the device before consent; ${names(cookieless)} is cookieless and only an L4 naming matter` : 'no banner needed: nothing non-essential set or contacted before consent';
  return { verdict, severity, summary, triggers, cookieless, notes };
}
