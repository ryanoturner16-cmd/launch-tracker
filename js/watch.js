// "Watch live" helpers: webcast links from Launch Library 2 (vid_urls) plus a provider-channel fallback.
// Links only (no embedded players / iframes). Only https URLs are ever used.
import { isDone, precisionKey } from './when.js';

// https only; URLs carrying user:password@ are rejected (a classic way to disguise the real host).
const https = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password ? x.href : null; } catch { return null; } };

// Official provider channels/sites, used ONLY when LL2 lists no webcast. Labelled as the provider's channel,
// never as a specific stream. (Checked Sep 2026.)
const CHANNELS = [
  { re: /^SpaceX$/i, name: 'SpaceX', short: 'SpaceX site', label: 'SpaceX launches page', url: 'https://www.spacex.com/launches/' },
  { re: /Rocket Lab/i, name: 'Rocket Lab', short: 'Rocket Lab YouTube', label: 'Rocket Lab YouTube channel', url: 'https://www.youtube.com/@rocketlabcorp' },
  { re: /United Launch Alliance|^ULA$/i, name: 'ULA', short: 'ULA site', label: 'ULA website', url: 'https://www.ulalaunch.com/' },
  { re: /National Aeronautics and Space Administration|^NASA$/i, name: 'NASA', short: 'NASA+', label: 'NASA+', url: 'https://plus.nasa.gov/' },
  { re: /Indian Space Research Organi[sz]ation|^ISRO$|NewSpace India/i, name: 'ISRO', short: 'ISRO YouTube', label: 'ISRO Official YouTube channel', url: 'https://www.youtube.com/channel/UCw5hEVOTfz_AfzsNFWyNlNg' },
  { re: /Arianespace/i, name: 'Arianespace', short: 'Arianespace site', label: 'Arianespace website', url: 'https://www.arianespace.com/' },
  { re: /Blue Origin/i, name: 'Blue Origin', short: 'Blue Origin site', label: 'Blue Origin website', url: 'https://www.blueorigin.com/' },
];

/** Webcasts, https only, LL2 priority order (lower number = more important). */
export function webcasts(l) {
  return (Array.isArray(l.vid_urls) ? l.vid_urls : [])
    .map((v) => ({ ...v, url: https(v && v.url) })).filter((v) => v.url)
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
}
export function providerChannel(l) {
  const n = (l.provider && (l.provider.name || l.provider.abbrev)) || '';
  const c = CHANNELS.find((x) => x.re.test(n) || (l.provider && l.provider.abbrev && x.re.test(l.provider.abbrev)));
  return c ? { ...c } : null;
}
// Well-known video hosts, for short button labels. Anything else is shown as its bare hostname in the tooltip.
const HOSTS = [
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'], [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X'],
  [/^plus\.nasa\.gov$|(^|\.)nasa\.gov$/, 'NASA+'], [/(^|\.)twitch\.tv$/, 'Twitch'], [/(^|\.)spacex\.com$/, 'SpaceX'],
  [/(^|\.)rocketlabusa\.com$|(^|\.)rocketlabcorp\.com$/, 'Rocket Lab'], [/(^|\.)ulalaunch\.com$/, 'ULA'], [/(^|\.)facebook\.com$/, 'Facebook'],
];
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export function hostLabel(u) { const h = hostOf(u); const m = HOSTS.find(([re]) => re.test(h)); return m ? m[1] : null; }

// LIVE is only trusted when the data is fresh AND the launch time is near now: LL2's live flag is a snapshot and
// would otherwise stay "live" forever in old data.
// Window relative to NET: from 4 h before NET (pre-launch coverage often starts hours early) to 1 h after NET.
export const LIVE_MAX_DATA_AGE = 45 * 60e3, LIVE_BEFORE_NET = 4 * 3600e3, LIVE_AFTER_NET = 1 * 3600e3;
/** Raw flag as recorded in the data (may be out of date). */
export function flaggedLive(l) { return !!(l.webcast_live || webcasts(l).some((v) => v.live) || /in flight/i.test((l.status && l.status.name) || '')); }
/** Trusted "live now": flagged live, data < 45 min old, and now between NET − 4 h and NET + 1 h. */
export function isLiveNow(l, now = Date.now(), dataAt = null) {
  if (!flaggedLive(l) || !dataAt || now - dataAt > LIVE_MAX_DATA_AGE) return false;
  const untilNet = Date.parse(l.net) - now; // > 0 before NET
  return untilNet <= LIVE_BEFORE_NET && untilNet >= -LIVE_AFTER_NET;
}
/** Hour precision or better: coarser NETs (day, month, quarter, year…) are placeholders, often at period end. */
export const preciseEnough = (l) => ['second', 'minute', 'hour'].includes(precisionKey(l));
/** Card button window: precise NET, and live now or not finished with NET between 2 h ago and 24 h ahead. */
export function inWatchWindow(l, now = Date.now(), dataAt = null) {
  if (!preciseEnough(l)) return false;
  if (isLiveNow(l, now, dataAt)) return true;
  if (isDone(l)) return false;
  const d = Date.parse(l.net) - now;
  return d <= 24 * 3600e3 && d >= -2 * 3600e3;
}
