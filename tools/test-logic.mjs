#!/usr/bin/env node
process.env.LL2_OFFLINE = '1'; // test runners never reach LL2 (fetch-launches.mjs refuses network when set)
// Unit tests (plain Node, no browser) for the Watch-live rules and the side-booster table.
import { isLiveNow, flaggedLive, inWatchWindow, webcasts, hostLabel, providerChannel, LIVE_MAX_DATA_AGE, LIVE_BEFORE_NET, LIVE_AFTER_NET } from '../js/watch.js';
import { sideBoostersFor, boosterNoteFor, planFor } from '../js/rocket3d.js';
let pass = 0, fail = 0; const out = [];
const check = (name, ok, info = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };
const now = Date.parse('2026-09-29T01:00:00Z'), H = 3600e3, M = 60e3, iso = (ms) => new Date(ms).toISOString();
const GO = { id: 1, name: 'Go for Launch', abbrev: 'Go' }, SUCC = { id: 3, name: 'Launch Successful', abbrev: 'Success' };
const L = (o = {}) => ({ id: 'x', name: 'T', net: iso(now), status: GO, net_precision: { name: 'Minute', abbrev: 'MIN' }, provider: { name: 'SpaceX', abbrev: 'SpX' },
  vid_urls: [{ url: 'https://www.youtube.com/watch?v=a', title: 'Webcast', priority: 1, live: true }], webcast_live: true, ...o });

// ---- 1. LIVE only with fresh data and NET near now
check('LIVE: flagged, data 10 min old, NET 20 min ago → live', isLiveNow(L({ net: iso(now - 20 * M) }), now, now - 10 * M));
check('LIVE: flagged, data 44 min old, NET 55 min ago → live', isLiveNow(L({ net: iso(now - 55 * M) }), now, now - 44 * M));
check('LIVE: flagged, NET 50 min ahead → live', isLiveNow(L({ net: iso(now + 50 * M) }), now, now - 5 * M));
check('LIVE: pre-launch stream, NET 3.9 h ahead → live (window starts 4 h before NET)', isLiveNow(L({ net: iso(now + 3.9 * H) }), now, now - 5 * M) && LIVE_BEFORE_NET === 4 * H && LIVE_AFTER_NET === H);
check('not LIVE: data 46 min old (> 45 min)', !isLiveNow(L(), now, now - 46 * M) && LIVE_MAX_DATA_AGE === 45 * M);
check('not LIVE: data 3 days old (the "LIVE forever" bug)', !isLiveNow(L({ net: iso(now - 2 * 86400e3) }), now, now - 3 * 86400e3));
check('not LIVE: fresh data but NET 2 days ago', !isLiveNow(L({ net: iso(now - 2 * 86400e3) }), now, now - 5 * M));
check('not LIVE: fresh data but NET 1.1 h ago (window ends 1 h after NET)', !isLiveNow(L({ net: iso(now - 1.1 * H) }), now, now - 5 * M));
check('not LIVE: fresh data but NET 4.1 h ahead', !isLiveNow(L({ net: iso(now + 4.1 * H) }), now, now - 5 * M));
check('not LIVE: NET 3.9 h ahead but data 46 min old (freshness rule still applies)', !isLiveNow(L({ net: iso(now + 3.9 * H) }), now, now - 46 * M));
check('not LIVE: no generated_at known', !isLiveNow(L(), now, null));
check('not LIVE: not flagged at all', !isLiveNow(L({ webcast_live: false, vid_urls: [{ url: 'https://x.com/a', priority: 1 }] }), now, now));
check('flaggedLive() still reports the raw flag (used for the "Webcast / replay" label)', flaggedLive(L({ net: iso(now - 2 * 86400e3) })));
check('card window: stale LIVE flag 2 days ago gets no card button', !inWatchWindow(L({ net: iso(now - 2 * 86400e3) }), now, now - 3 * 86400e3));

// ---- 2. card button only for Hour precision or better
const soon = (p, abbrev, dt = 20 * H) => L({ net: iso(now + dt), webcast_live: false, vid_urls: [], net_precision: { name: p, abbrev } });
for (const [p, a] of [['Second', 'SEC'], ['Minute', 'MIN'], ['Hour', 'HR']]) check(`card window: ${p} precision NET +20 h → button`, inWatchWindow(soon(p, a), now, now));
for (const [p, a] of [['Day', 'D'], ['Month', 'M'], ['Quarter 4', 'Q4'], ['Year', 'Y'], ['Morning', 'MRN']]) check(`card window: ${p} precision (period-end placeholder) → no button`, !inWatchWindow(soon(p, a), now, now));
check('card window: missing precision → no button', !inWatchWindow({ ...soon('Minute', 'MIN'), net_precision: null }, now, now));
check('card window: finished launch 1 h ago, no live flag → no button', !inWatchWindow(L({ net: iso(now - H), status: SUCC, webcast_live: false, vid_urls: [{ url: 'https://www.youtube.com/watch?v=r', priority: 1 }] }), now, now));
check('card window: finished 45 min ago but fresh data still flags the stream live (post-launch coverage) → LIVE allowed', inWatchWindow(L({ net: iso(now - 45 * M), status: SUCC }), now, now - 5 * M) && isLiveNow(L({ net: iso(now - 45 * M), status: SUCC }), now, now - 5 * M));
check('card window: NET +25 h → no button', !inWatchWindow(soon('Minute', 'MIN', 25 * H), now, now));

// ---- links / labels
const w = webcasts({ vid_urls: [{ url: 'https://user:pw@www.youtube.com/watch?v=c', priority: 0 }, { url: 'javascript:alert(1)', priority: 0 }, { url: 'https://x.com/SpaceX/status/1', priority: 2 }, { url: 'https://www.youtube.com/watch?v=m', priority: 1 }] });
check('webcasts: https only, user:pw@ URLs rejected, sorted by priority', w.map((v) => v.url).join() === 'https://www.youtube.com/watch?v=m,https://x.com/SpaceX/status/1', w.map((v) => v.url).join());
check('host labels: YouTube / X / NASA+ / unknown → null', hostLabel('https://youtu.be/a') === 'YouTube' && hostLabel('https://www.youtube.com/watch?v=1') === 'YouTube' && hostLabel('https://x.com/a') === 'X' && hostLabel('https://plus.nasa.gov/x') === 'NASA+' && hostLabel('https://xn--yutube-wqf.com/') === null && hostLabel('https://notyoutube.com/') === null);
check('SpaceX fallback is labelled as a site, not a channel/stream', providerChannel({ provider: { name: 'SpaceX' } }).short === 'SpaceX site');

// ---- 3. side boosters
const R = (n) => ({ rocket: { full_name: n, name: n } });
check('Long March 8A: 2 side boosters, text says 8A keeps them', sideBoostersFor(R('Long March 8A'))?.n === 2 && /8A keeps the two side boosters/.test(sideBoostersFor(R('Long March 8A')).desc));
check('plain Long March 8: not drawn, note says it flies with 0 or 2 boosters', !sideBoostersFor(R('Long March 8')) && /both with 2 .*core-only \(0 boosters\)/.test(boosterNoteFor(R('Long March 8')) || ''), boosterNoteFor(R('Long March 8')));
check('no booster text anywhere says 8A flies without boosters', !/8A (variant )?flies without/.test(JSON.stringify([sideBoostersFor(R('Long March 8A')), boosterNoteFor(R('Long March 8'))])));
check('Soyuz 2.1v: 0 boosters and no "not drawn" note; Soyuz 2.1a/2.1b keep 4', !sideBoostersFor(R('Soyuz 2.1v')) && boosterNoteFor(R('Soyuz 2.1v')) === null && sideBoostersFor(R('Soyuz 2.1a'))?.n === 4 && sideBoostersFor(R('Soyuz 2.1b/Fregat'))?.n === 4);
check('Delta IV Heavy: 2 side cores', sideBoostersFor(R('Delta IV Heavy'))?.n === 2);
check('Zenit and Proton: no boosters, no note', ['Zenit-3SL', 'Proton-M/Briz-M'].every((n) => !sideBoostersFor(R(n)) && boosterNoteFor(R(n)) === null));
const lm2f = planFor({ id: 'z', name: 'Long March 2F/G | Shenzhou 24', net: iso(now), rocket: { full_name: 'Long March 2F/G', name: 'Long March 2F' }, mission: { name: 'Shenzhou 24', type: 'Human Exploration' }, status: GO, pad: {}, provider: {} });
check('LM-2F: 4 boosters + "escape tower not drawn" note', lm2f.sideBoosters?.n === 4 && /escape tower/i.test(lm2f.modelNote || ''), lm2f.modelNote);

console.log(out.join('\n')); console.log(`\n${pass}/${pass + fail} logic tests passed`);
process.exit(fail ? 1 : 0);
