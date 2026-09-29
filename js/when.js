// Launch-date precision handling (Launch Library 2 `net_precision`).
// LL2 precisions: Second, Minute, Hour, Morning, Afternoon, (Night), Day, Week, Month, Quarter 1–4,
// Half 1–2, Year, Fiscal Year, Decade. For coarse precisions `net` is often a placeholder at the END of the
// period (e.g. Oct 31 for "October"), so "days away" is measured from the START of the period.

export const DONE_RE = /^(success|launch successful|failure|launch failure|partial failure)$/i;
export const isDone = (l) => DONE_RE.test((l.status && l.status.name) || '') || ['Success', 'Failure', 'Partial Failure'].includes(l.status && l.status.abbrev);
export const isFailure = (l) => /fail/i.test((l.status && (l.status.abbrev || l.status.name)) || '') && !/partial/i.test(l.status.name || '');

/** Normalised precision key. Missing/unknown precision -> 'unknown' (displayed conservatively, like Day). */
export function precisionKey(l) {
  const p = l.net_precision || {};
  const s = `${p.abbrev || ''} ${p.name || ''}`.toLowerCase();
  if (!p.name && !p.abbrev) return 'unknown';
  if (/\bsec/.test(s)) return 'second';
  if (/\bmin/.test(s)) return 'minute';
  if (/\bhour|\bhr\b/.test(s)) return 'hour';
  if (/morning|\bmrn\b/.test(s)) return 'morning';
  if (/afternoon|\baft\b/.test(s)) return 'afternoon';
  if (/night|evening/.test(s)) return 'night';
  if (/fiscal|\bfy\b/.test(s)) return 'fy';
  if (/decade|\bdec\b/.test(s)) return 'decade';
  if (/\bday\b/.test(s)) return 'day';
  if (/week|\bw\b/.test(s)) return 'week';
  if (/month|\bm\b/.test(s)) return 'month';
  if (/quarter|\bq[1-4]\b/.test(s)) return 'quarter';
  if (/half|\bh[12]\b/.test(s)) return 'half';
  if (/year|\by\b/.test(s)) return 'year';
  return 'unknown';
}
export const isFine = (l) => ['second', 'minute'].includes(precisionKey(l));

const num = (re, s) => { const m = re.exec(s || ''); return m ? Number(m[1]) : null; };
const U = (y, m, d = 1) => Date.UTC(y, m, d);

/** {start, end} in ms for the period the launch is expected in. */
export function period(l) {
  const net = Date.parse(l.window_start && precisionKey(l) === 'second' ? l.net : l.net);
  const d = new Date(net), y = d.getUTCFullYear(), mo = d.getUTCMonth();
  const p = l.net_precision || {}, k = precisionKey(l), s = `${p.abbrev || ''} ${p.name || ''}`;
  switch (k) {
    case 'second': case 'minute': return { start: net, end: net };
    case 'hour': return { start: net - 30 * 60e3, end: net + 30 * 60e3 };
    case 'morning': case 'afternoon': case 'night': return { start: net - 12 * 3600e3, end: net + 12 * 3600e3 };
    case 'day': case 'unknown': return { start: U(y, mo, d.getUTCDate()), end: U(y, mo, d.getUTCDate() + 1) };
    case 'week': return { start: net, end: net + 7 * 86400e3 };
    case 'month': return { start: U(y, mo), end: U(y, mo + 1) };
    case 'quarter': { const q = num(/q(?:uarter)?\s*([1-4])/i, s) || Math.floor(mo / 3) + 1; return { start: U(y, (q - 1) * 3), end: U(y, q * 3) }; }
    case 'half': { const h = num(/h(?:alf)?\s*([12])/i, s) || (mo < 6 ? 1 : 2); return { start: U(y, (h - 1) * 6), end: U(y, h * 6) }; }
    case 'year': return { start: U(y, 0), end: U(y + 1, 0) };
    case 'fy': return { start: net - 365 * 86400e3, end: net }; // fiscal years differ by agency; treat as the year ending at NET
    case 'decade': { const dy = Math.floor(y / 10) * 10; return { start: U(dy, 0), end: U(dy + 10, 0) }; }
    default: return { start: net, end: net };
  }
}

const F = (opts) => new Intl.DateTimeFormat('en-US', opts);
/** Human label for when the launch is expected. tz = display time zone for fine/hour precisions (default: user's). */
export function whenLabel(l, tz) {
  const k = precisionKey(l), d = new Date(l.net), y = d.getUTCFullYear();
  const z = tz ? { timeZone: tz } : {};
  const p = l.net_precision || {}, s = `${p.abbrev || ''} ${p.name || ''}`;
  switch (k) {
    case 'second': case 'minute':
      return F({ ...z, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
    case 'hour':
      return `around ${F({ ...z, hour: 'numeric', timeZoneName: 'short' }).format(d)}, ${F({ ...z, weekday: 'short', month: 'short', day: 'numeric' }).format(d)}`;
    case 'morning': case 'afternoon': case 'night': {
      const ptz = l.pad && l.pad.timezone ? { timeZone: l.pad.timezone } : { timeZone: 'UTC' };
      const part = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' }[k];
      return `${part} of ${F({ ...ptz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(d)} (local time at the pad)`;
    }
    case 'day': return `${F({ timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(d)} (time TBD)`;
    case 'unknown': return `${F({ timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(d)} (precision not given)`;
    case 'week': return `Week of ${F({ timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(d)}`;
    case 'month': return F({ timeZone: 'UTC', month: 'long', year: 'numeric' }).format(d);
    case 'quarter': { const q = num(/q(?:uarter)?\s*([1-4])/i, s) || Math.floor(d.getUTCMonth() / 3) + 1; return `Q${q} ${y}`; }
    case 'half': { const h = num(/h(?:alf)?\s*([12])/i, s) || (d.getUTCMonth() < 6 ? 1 : 2); return `H${h} ${y}`; }
    case 'year': return String(y);
    case 'fy': return `Fiscal year ${y}`;
    case 'decade': return `${Math.floor(y / 10) * 10}s`;
    default: return d.toUTCString();
  }
}

const p2 = (n) => String(n).padStart(2, '0');
function hms(ms) { const a = Math.abs(ms), d = Math.floor(a / 86400e3), h = Math.floor(a / 3600e3) % 24, m = Math.floor(a / 60e3) % 60, s = Math.floor(a / 1000) % 60; return `${d ? d + 'd ' : ''}${p2(h)}:${p2(m)}:${p2(s)}`; }
export function relDays(ms) { const d = Math.round(ms / 86400e3); if (Math.abs(ms) < 36 * 3600e3) { const h = Math.round(ms / 3600e3); return h === 0 ? 'now' : (h > 0 ? `in ~${h} h` : `~${-h} h ago`); } return d > 0 ? `in ~${d} days` : `~${-d} days ago`; }

/** Countdown / status line. Returns {text, sub, cls, ticking}. `ticking` = needs a 1 s refresh. */
const STALE_AFTER = 2 * 3600e3;
function ageText(ms) { const h = Math.floor(ms / 3600e3); return h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`; }
/** `dataAt` = when the dataset was generated (ms). If the data is stale, "passed" states say so instead of "check back". */
export function countdown(l, now = Date.now(), dataAt = null) {
  const staleData = dataAt && now - dataAt > STALE_AFTER;
  const staleSub = staleData ? `This launch data is ${ageText(now - dataAt)} old, so any result is missing from it. See the data warning.` : null;
  const k = precisionKey(l), net = Date.parse(l.net), st = l.status || {};
  if (isDone(l)) {
    const when = F({ weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(net));
    const verb = isFailure(l) ? 'Launch failed' : /partial/i.test(st.name || '') ? 'Partial failure' : 'Launched successfully';
    return { text: verb, sub: `${isFine(l) ? when : whenLabel(l)} · ${relDays(net - now)}`, cls: isFailure(l) ? 'fail' : 'done', ticking: false };
  }
  if (/flight/i.test(st.name || '') && isFine(l)) return { text: `In flight · T+ ${hms(now - net)}`, sub: 'Status from data source: In Flight', cls: 'live', ticking: true };
  if (k === 'second' || k === 'minute') {
    const ms = net - now;
    if (ms >= 0) return { text: `T− ${hms(ms)}`, cls: ms < 3600e3 ? 'soon' : 'live', ticking: true };
    return { text: 'Scheduled time passed', sub: staleSub || (now - net < 24 * 3600e3 ? 'Result not in the data yet. Check back shortly.' : 'The data source has not updated this launch since its scheduled time.'), cls: 'past', ticking: false };
  }
  const { start, end } = period(l);
  const label = whenLabel(l);
  if (k === 'hour' || k === 'morning' || k === 'afternoon' || k === 'night') {
    if (end < now) return { text: `Was expected ${label}`, sub: staleSub || 'Date passed · awaiting status update', cls: 'past', ticking: false };
    return { text: label.replace(/^around/, 'Around'), sub: `${relDays(net - now)} · exact time not yet set`, cls: 'coarse', ticking: false };
  }
  if (end <= now) return { text: `Was NET ${label}`, sub: staleSub || 'This date has passed · awaiting an update from the data source', cls: 'past', ticking: false };
  if (start <= now) return { text: `NET ${label}`, sub: 'Expected within this period · date not firm', cls: 'coarse', ticking: false };
  const days = Math.max(1, Math.round((start - now) / 86400e3));
  return { text: `NET ${label}`, sub: `≥ ${days} day${days === 1 ? '' : 's'} away · date not firm`, cls: 'coarse', ticking: false };
}
