#!/usr/bin/env node
// Server-side fetch job: pulls Launch Library 2 (The Space Devs) and writes a trimmed data/launches.json.
// Browsers never talk to LL2; the app only reads data/launches.json from its own origin.
//
// Run every ~15 min from a scheduler (see .github/workflows/fetch-launches.yml). Each run makes 2 LL2
// requests (upcoming + recent past) = 8 requests/hour at 15-min spacing, inside the free tier (15/hour per IP).
//
// Usage:
//   node tools/fetch-launches.mjs                 # live fetch (optional env LL2_API_TOKEN, sent as "Authorization: Token …")
//   node tools/fetch-launches.mjs --raw up.json [--raw-past past.json] [--now ISO]   # offline, from saved API responses
// Options: --out <file> (default data/launches.json), --prev <file> (default: the --out file), --past-hours <n> (48)
//
// Env LL2_OFFLINE=1 (set by every test runner, never by the CI workflow): any network attempt is refused and the
// script exits 1 immediately with a clear error, so a test can never spend the shared LL2 quota by accident.
//
// Exit codes: 0 = upcoming list refreshed (file written)
//             1 = usage error, or a network fetch was attempted while LL2_OFFLINE=1
//             2 = nothing refreshed (every request failed / empty / malformed) -> file left untouched
//             3 = only the past-48h part refreshed; upcoming list is from the previous file (file written)
//
// Keep rules (what ends up in the file):
//   * upcoming request OK  -> exactly the fresh upcoming list (fetch 50, sort by NET then id, keep 40) plus launches
//     whose NET is within the last 48 h. Anything else from the previous file is dropped (slipped out of the top 40,
//     deleted in LL2, placeholder dates...).
//   * upcoming request failed -> the previous file's upcoming launches are kept unchanged.
//   * past-48h part: from the past request if OK, else previous-file launches with NET in the window.
//   * per launch id, the record with the newest `last_updated` wins (an older response can't overwrite newer data).
// Failure rules: HTTP errors, timeouts, invalid JSON, a missing/non-array `results`, or an empty upcoming list count as
// failures: that part's `fetched_at` is NOT advanced, so `generated_at` (the oldest successful part) stays honest.
// The LL2 development mirror (lldev) is never used.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { trimLaunch, clip } from './trim-launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
// Unknown or value-less options are a usage error (exit 1) instead of silently falling through to a LIVE fetch.
const KNOWN = ['--raw', '--raw-past', '--now', '--out', '--prev', '--past-hours'];
for (let i = 0; i < args.length; i += 2) {
  if (!KNOWN.includes(args[i]) || args[i + 1] === undefined || args[i + 1].startsWith('--')) { console.error(`usage error: unexpected argument "${args[i]}" (known options: ${KNOWN.join(' ')}, each with a value)`); process.exit(1); }
}
if (opt('--now') && Number.isNaN(Date.parse(opt('--now')))) { console.error(`usage error: --now "${opt('--now')}" is not a date`); process.exit(1); }
const OUT = new URL(opt('--out', '../data/launches.json'), import.meta.url).pathname;
const PREV = opt('--prev') ? new URL(opt('--prev'), import.meta.url).pathname : OUT;
const PAST_HOURS = Number(opt('--past-hours', 48));
const BASE = 'https://ll.thespacedevs.com/2.3.0';
const FETCH_UP = 50, KEEP_UP = 40, LIMIT_PAST = 10;
const MAX_BYTES = 100 * 1024;
const OFFLINE = args.includes('--raw') || args.includes('--raw-past');
const NET_BLOCKED = /^(1|true|yes)$/i.test(String(process.env.LL2_OFFLINE || '').trim());
const refuseNetwork = (what) => { console.error(`LL2_OFFLINE=1 is set: refusing live LL2 request (${what}). Pass --raw <file> [--raw-past <file>] for offline runs, or unset LL2_OFFLINE for a real fetch.`); process.exit(1); };
if (NET_BLOCKED && !OFFLINE) refuseNetwork('no --raw/--raw-past fixture given'); // fail fast, before touching any file

const now = opt('--now') ? new Date(opt('--now')) : new Date();
const since = new Date(now.getTime() - PAST_HOURS * 3600e3);
const urls = {
  upcoming: `${BASE}/launches/upcoming/?limit=${FETCH_UP}&mode=detailed&ordering=net`,
  past: `${BASE}/launches/previous/?limit=${LIMIT_PAST}&mode=detailed&ordering=-net&net__gte=${since.toISOString()}`,
};
const t = (l) => Date.parse(l.net);
const byNetThenId = (a, b) => (t(a) - t(b)) || String(a.id).localeCompare(String(b.id));
const upd = (l) => Date.parse(l.last_updated || 0) || 0;

async function get(url) {
  if (NET_BLOCKED) refuseNetwork(url); // defence in depth: nothing below may reach the network
  const headers = { Accept: 'application/json', 'User-Agent': 'launch-tracker-fetch/1.1 (unofficial fan project)' };
  if (process.env.LL2_API_TOKEN) headers.Authorization = `Token ${process.env.LL2_API_TOKEN}`;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    const res = await fetch(url, { headers, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 429 ? ' (rate limited)' : ''}`);
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new Error(`response is not JSON (${text.slice(0, 40).replace(/\s+/g, ' ')}…)`); }
  } finally { clearTimeout(timer); }
}

/** Validate an LL2 list response; throws on empty/malformed so the caller treats it as a failure. */
function validate(json, kind) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.results)) throw new Error('malformed response (no results array)');
  const ok = json.results.filter((l) => l && l.id && l.net && !Number.isNaN(Date.parse(l.net)));
  if (ok.length < json.results.length) console.error(`${kind}: skipped ${json.results.length - ok.length} malformed record(s)`);
  if (!ok.length) {
    // An empty past-48h list is legitimate only when the API says so explicitly (count: 0).
    if (kind === 'past' && json.count === 0 && json.results.length === 0) return [];
    throw new Error(json.results.length ? 'no usable records in results' : 'empty results');
  }
  return ok;
}

let prev = null;
if (existsSync(PREV)) {
  try { prev = JSON.parse(readFileSync(PREV, 'utf8')); if (!Array.isArray(prev.launches)) throw new Error('no launches array'); }
  catch (e) { console.error(`previous file ${PREV} unreadable (${e.message}); starting fresh`); prev = null; }
}
const prevLaunches = (prev && prev.launches) || [];
const results = {}; const sources = { ...(prev && prev.sources) };
for (const kind of ['upcoming', 'past']) {
  const raw = opt(kind === 'upcoming' ? '--raw' : '--raw-past');
  if (OFFLINE && !raw) continue; // offline run without a file for this part: treat as "not attempted", keep previous data
  try {
    const json = raw ? (() => { try { return JSON.parse(readFileSync(raw, 'utf8')); } catch (e) { throw new Error(`fixture unreadable: ${e.message}`); } })() : await get(urls[kind]);
    results[kind] = validate(json, kind).map(trimLaunch);
    sources[kind] = { fetched_at: now.toISOString(), count: results[kind].length, ok: true };
    console.log(`${kind}: ${results[kind].length} launches`);
  } catch (e) {
    console.error(`${kind}: FAILED (${e.message}); keeping previous data for this part`);
    sources[kind] = { ...(sources[kind] || {}), ok: false, error: e.message, attempted_at: now.toISOString() };
  }
}
if (!results.upcoming && !results.past) { console.error('No new data; leaving', OUT, 'unchanged.'); process.exit(2); }

// Newest record per id across previous file + fresh responses.
const newest = new Map();
for (const l of [...prevLaunches, ...(results.past || []), ...(results.upcoming || [])]) { const o = newest.get(l.id); if (!o || upd(l) >= upd(o)) newest.set(l.id, l); }
const rec = (l) => newest.get(l.id);

// Upcoming part
let upcoming;
if (results.upcoming) upcoming = results.upcoming.map(rec).sort(byNetThenId).slice(0, KEEP_UP);
else upcoming = prevLaunches.filter((l) => t(l) >= since.getTime()).map(rec); // previous file's list, unchanged membership
// Past-48h part
const inWindow = (l) => t(l) >= since.getTime() && t(l) <= now.getTime();
const past = (results.past ? results.past : prevLaunches).map(rec).filter(inWindow);

const seen = new Set(); const launches = [];
for (const l of [...past, ...upcoming]) if (!seen.has(l.id)) { seen.add(l.id); launches.push(l); }
launches.sort(byNetThenId);

const okTimes = Object.values(sources).filter((s) => s && s.fetched_at).map((s) => Date.parse(s.fetched_at));
const out = {
  schema: 1,
  generated_at: new Date(Math.min(...okTimes)).toISOString(), // oldest successful part = honest data age
  newest_record_update: launches.reduce((m, l) => (l.last_updated > m ? l.last_updated : m), ''),
  source: 'Launch Library 2 by The Space Devs (thespacedevs.com)',
  past_window_hours: PAST_HOURS,
  sources,
  launches,
};
let body = JSON.stringify(out);
// Size guard: shorten long descriptions from the far-future end first (at a sentence/word end, flagged as shortened).
for (let i = launches.length - 1; Buffer.byteLength(body) > MAX_BYTES && i >= 0; i--) {
  const m = launches[i].mission;
  if (m && m.description && m.description.length > 200) { m.description = clip(m.description, 200); m.description_shortened = true; body = JSON.stringify(out); }
}
if (Buffer.byteLength(body) > MAX_BYTES) console.error(`warning: ${(Buffer.byteLength(body) / 1024).toFixed(1)} KB is over the ${MAX_BYTES / 1024} KB budget`);
const tmp = OUT + '.tmp';
writeFileSync(tmp, body); renameSync(tmp, OUT);
console.log(`wrote ${launches.length} launches (${upcoming.length} upcoming list, ${past.length} in last ${PAST_HOURS} h), ${(Buffer.byteLength(body) / 1024).toFixed(1)} KB, generated_at ${out.generated_at} -> ${OUT}`);
process.exit(results.upcoming ? 0 : 3);
