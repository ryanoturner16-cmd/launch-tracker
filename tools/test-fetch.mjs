// Offline tests for tools/fetch-launches.mjs (keep rules, failure handling, size guard) and the CI data step
// (tools/ci-refresh.sh: restore -> fetch -> deploy decision) plus static checks of the workflow file.
// No network access to LL2: uses recorded/synthetic fixtures and a local 127.0.0.1 HTTP server.
// usage: node tools/test-fetch.mjs
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import YAML from 'yaml';

// Every child process (fetch-launches.mjs via run(), ci-refresh.sh, ci-health.mjs) inherits this: a live LL2 call is
// refused with exit 1, so no test can spend the shared LL2 quota.
process.env.LL2_OFFLINE = '1';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FETCH = join(ROOT, 'tools/fetch-launches.mjs');
const T = mkdtempSync(join(tmpdir(), 'lt-fetch-test-'));
const NOW = '2026-09-29T00:10:00Z', now = Date.parse(NOW);
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
let pass = 0, fail = 0; const out = [];
const check = (name, ok, info = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };
const f = (name, obj) => { const p = join(T, name); writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj)); return p; };
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const ids = (d) => d.launches.map((l) => l.id);
function run(up, { past, prev, outFile, extra = [] } = {}) {
  const a = [FETCH, '--now', NOW, '--out', outFile];
  if (up) a.push('--raw', up); if (past) a.push('--raw-past', past); if (prev) a.push('--prev', prev); a.push(...extra);
  const r = spawnSync('node', a, { encoding: 'utf8' });
  return { code: r.status, log: (r.stdout + r.stderr).trim() };
}
const mk = (id, netMs, o = {}) => ({ id, name: `Test | ${id}`, net: iso(netMs), last_updated: o.upd || '2026-09-28T20:00:00Z', status: { id: 2, name: 'To Be Determined', abbrev: 'TBD' },
  net_precision: { name: 'Minute', abbrev: 'MIN' }, launch_service_provider: { name: 'SpaceX' }, rocket: { configuration: { name: 'Falcon 9', full_name: 'Falcon 9 Block 5' } },
  mission: o.desc ? { name: id, description: o.desc } : { name: id }, pad: { name: 'SLC-40' }, ...(o.raw || {}) });
const day = 86400e3;
const L = Array.from({ length: 45 }, (_, i) => mk(`L${String(i).padStart(2, '0')}`, now + (i + 1) * day));
const PH = mk('PH-dec31', Date.parse('2026-12-31T00:00:00Z'), { raw: { net_precision: { name: 'Year', abbrev: 'Y' } } });

// ---------------------------------------------------------------- 1. keep rules
const A = join(T, 'A.json');
let r = run(f('upA.json', { results: [...L.slice(0, 39), PH] }), { outFile: A });
check('run A: 39 launches + Dec 31 placeholder written', r.code === 0 && read(A).launches.length === 40 && ids(read(A)).includes('PH-dec31'), r.log.split('\n').pop());
const B = join(T, 'B.json'); copyFileSync(A, B);
const N1 = mk('N1-new', now + 6 * 3600e3);
r = run(f('upB.json', { results: [N1, ...L.slice(0, 40)] }), { outFile: B }); // 41 results, placeholder deleted in LL2
const b = read(B);
check('40→41: list cut to 40, sorted by NET', r.code === 0 && b.launches.length === 40 && b.launches.every((l, i, a) => !i || Date.parse(a[i - 1].net) <= Date.parse(l.net)), `${b.launches.length} launches`);
check('40→41: the launch pushed past #40 (L39) is dropped, not retained', !ids(b).includes('L39'));
check('placeholder deleted in LL2 (Dec 31 NET) is not retained', !ids(b).includes('PH-dec31'));
check('new launch N1 present', ids(b)[0] === 'N1-new');
// determinism: 50 results incl. ties at the cut, in two different orders -> identical output
const tieNet = L[38].net;
const tie = ['T-b', 'T-a', 'T-c'].map((id) => ({ ...mk(id, Date.parse(tieNet)) }));
const fifty = [...L.slice(0, 37), ...tie, ...L.slice(38, 48)].slice(0, 50);
const D1 = join(T, 'D1.json'), D2 = join(T, 'D2.json');
run(f('d1.json', { results: fifty }), { outFile: D1 });
run(f('d2.json', { results: [...fifty].reverse() }), { outFile: D2 });
const d1 = ids(read(D1)), d2 = ids(read(D2));
check('deterministic cutoff: 50 fetched, same 40 ids regardless of API order (NET ties at the cut broken by id)', d1.length === 40 && JSON.stringify(d1) === JSON.stringify(d2) && d1.slice(-3).join() === 'L38,T-a,T-b' && !d1.includes('T-c') && !d1.includes('L37'), d1.slice(-4).join(','));

// past window
const P = join(T, 'P.json');
const prevP = { ...b, launches: [...b.launches, { ...b.launches[1], id: 'F14-30h', net: iso(now - 30 * 3600e3) }, { ...b.launches[1], id: 'OLD-60h', net: iso(now - 60 * 3600e3) }] };
writeFileSync(P, JSON.stringify(prevP));
const P1 = join(T, 'P1.json'); copyFileSync(P, P1);
r = run(f('upP.json', { results: L.slice(0, 40) }), { outFile: P1 }); // past part not attempted -> previous window launches
check('past part unavailable: launch 30 h ago kept, launch 60 h ago dropped', ids(read(P1)).includes('F14-30h') && !ids(read(P1)).includes('OLD-60h'));
const P2 = join(T, 'P2.json'); copyFileSync(P, P2);
r = run(join(T, 'upP.json'), { outFile: P2, past: f('past.json', { count: 1, results: [mk('P1-10h', now - 10 * 3600e3, { raw: { status: { id: 3, name: 'Launch Successful', abbrev: 'Success' } } })] }) });
check('past part OK: only launches from the past response (NET within 48 h) kept', r.code === 0 && ids(read(P2)).includes('P1-10h') && !ids(read(P2)).includes('F14-30h') && read(P2).launches.length === 41);
const P3 = join(T, 'P3.json'); copyFileSync(P, P3);
r = run(join(T, 'upP.json'), { outFile: P3, past: f('past0.json', { count: 0, next: null, previous: null, results: [] }) });
check('past part {count:0, results:[]} is a valid "no launches in 48 h"', r.code === 0 && read(P3).sources.past.ok === true && read(P3).launches.length === 40);

// older record must not overwrite newer data
const O = join(T, 'O.json'); copyFileSync(B, O);
const stale = { ...L[5], net: '2027-01-01T00:00:00Z', last_updated: '2020-01-01T00:00:00Z' };
run(f('upO.json', { results: [N1, ...L.slice(0, 40).map((l) => (l.id === 'L05' ? stale : l))] }), { outFile: O });
check('older record (older last_updated) does not overwrite the newer one', read(O).launches.find((l) => l.id === 'L05').net === L[5].net);

// ---------------------------------------------------------------- 2. empty / malformed 200 = failure
for (const [name, body] of [['results: []', { results: [] }], ['missing results key', { detail: 'maintenance' }], ['HTML body', '<!doctype html><title>Moved</title>'], ['only junk records', { results: [{ foo: 1 }, { id: 'x' }] }], ['results not an array', { results: {} }]]) {
  const E = join(T, `E-${pass + fail}.json`); copyFileSync(B, E); const before = readFileSync(E, 'utf8');
  r = run(f(`e-${pass + fail}.json`, body), { outFile: E });
  check(`upcoming ${name}: exit 2, file untouched (generated_at not advanced)`, r.code === 2 && readFileSync(E, 'utf8') === before, `exit ${r.code}`);
}
{ // upcoming empty but past OK -> exit 3, upcoming membership + upcoming fetched_at unchanged, generated_at not advanced
  const E = join(T, 'E3.json'); copyFileSync(B, E); const pb = read(E);
  r = run(join(T, 'e-9.json') && f('empty.json', { results: [] }), { outFile: E, past: f('pastok.json', { count: 1, results: [mk('P1-10h', now - 10 * 3600e3)] }) });
  const e = read(E);
  check('upcoming empty + past OK: exit 3, previous upcoming list kept', r.code === 3 && pb.launches.every((l) => ids(e).includes(l.id)));
  check('upcoming empty: sources.upcoming.fetched_at and generated_at not advanced', e.sources.upcoming.fetched_at === pb.sources.upcoming.fetched_at && e.generated_at === pb.generated_at && e.sources.upcoming.ok === false, `${pb.generated_at} → ${e.generated_at}`);
}
{ // past malformed (empty without count) + upcoming OK -> generated_at = previous past fetch time (not advanced)
  const E = join(T, 'E4.json'); copyFileSync(P2, E); const pb = read(E);
  const pbWithOldPast = { ...pb, sources: { ...pb.sources, past: { ...pb.sources.past, fetched_at: '2026-09-28T23:00:00Z' } } }; writeFileSync(E, JSON.stringify(pbWithOldPast));
  r = run(join(T, 'upP.json'), { outFile: E, past: join(T, 'empty.json') });
  const e = read(E);
  check('past {results:[]} without count = failure; generated_at stays at the older past fetch', r.code === 0 && e.sources.past.ok === false && e.generated_at === '2026-09-28T23:00:00.000Z', e.generated_at);
}
{ // unreadable previous file
  const E = f('Ebad.json', '{"launches":');
  r = run(join(T, 'upP.json'), { outFile: E });
  check('truncated previous file is ignored (no crash), fresh file written', r.code === 0 && read(E).launches.length === 40);
}

// ---------------------------------------------------------------- 6. size guard uses clip() + flag
{
  const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} describes the mission in some detail for testing.`).join(' ');
  const S = join(T, 'S.json');
  r = run(f('upS.json', { results: L.slice(0, 40).map((l) => ({ ...l, mission: { name: l.id, description: long } })) }), { outFile: S });
  const s = read(S), size = readFileSync(S).length;
  const shortened = s.launches.filter((l) => l.mission.description_shortened);
  const bad = s.launches.filter((l) => l.mission.description.length < long.length && !l.mission.description_shortened);
  check('size guard: file under 100 KB', size <= 100 * 1024, `${(size / 1024).toFixed(1)} KB`);
  check('size guard: every shortened description is flagged and ends at a sentence/word (" …")', shortened.length > 0 && !bad.length && shortened.every((l) => / …$/.test(l.mission.description) && !/\w …$/.test(l.mission.description.replace(/\. …$/, '.'))), `${shortened.length} shortened`);
}

// ---------------------------------------------------------------- recorded fixture + watch links
{
  const R = join(T, 'R.json');
  r = run(join(ROOT, 'tools/fixtures/ll2-upcoming-2026-09-28.json'), { outFile: R, extra: [] });
  const d = read(R);
  const crew = d.launches.find((l) => /Crew-13/.test(l.name));
  check('recorded LL2 fixture: builds, Crew-13 has an https webcast', r.code === 0 && crew && crew.vid_urls.length && crew.vid_urls.every((v) => v.url.startsWith('https://')), crew && JSON.stringify(crew.vid_urls[0]).slice(0, 90));
  const W = join(T, 'W.json');
  const vids = [{ priority: 12, url: 'https://www.youtube.com/watch?v=b', title: 'Second', publisher: 'NASA', type: { id: 1, name: 'Official Webcast' } },
    { priority: 10, url: 'https://x.com/i/broadcasts/a', title: 'Main', publisher: 'SpaceX', live: true, start_time: '2026-09-30T00:00:00Z' },
    { priority: 1, url: 'http://insecure.example/', title: 'http' }, { priority: 2, url: 'javascript:alert(1)', title: 'js' }];
  run(f('upW.json', { results: [mk('W1', now + day, { raw: { vid_urls: vids, webcast_live: true } }), ...L.slice(0, 5)] }), { outFile: W });
  const w = read(W).launches.find((l) => l.id === 'W1');
  check('vid_urls trimmed: https only, sorted by priority, compact fields kept', w.vid_urls.map((v) => v.title).join() === 'Main,Second' && w.vid_urls[0].live === true && w.vid_urls[0].start && w.vid_urls[1].type === 'Official Webcast' && w.webcast_live === true, JSON.stringify(w.vid_urls[0]));
}

// ---------------------------------------------------------------- 3. CI restore / fetch / deploy decision
const committed = { ...read(B), generated_at: '2026-09-25T00:00:00.000Z' }; // the repo's committed (days-old) file
const newer = { ...committed, generated_at: '2026-09-29T00:00:00.000Z' };
const older = { ...committed, generated_at: '2020-01-01T00:00:00.000Z' };
const srv = http.createServer((req, res) => {
  const route = {
    '/good/data/launches.json': [302, '/files/good.json'], '/html/data/launches.json': [302, '/files/page.html'],
    '/old/data/launches.json': [301, '/files/old.json'], '/trunc/data/launches.json': [302, '/files/trunc.json'],
  }[req.url];
  if (route) { res.writeHead(route[0], { Location: route[1] }); return res.end(); }
  const body = { '/files/good.json': JSON.stringify(newer), '/files/old.json': JSON.stringify(older), '/files/page.html': '<!doctype html><html><body>Redirecting…</body></html>', '/files/trunc.json': JSON.stringify(newer).slice(0, 500) }[req.url];
  if (body === undefined) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': req.url.endsWith('.html') ? 'text/html' : 'application/json' }); res.end(body);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}`;
const good = join(T, 'upP.json'), empty = join(T, 'empty.json');
// async spawn: the test HTTP server lives in this process, so the event loop must keep running while curl talks to it
function ci(path, upFixture, fetchArgs = null) {
  const data = join(T, `ci-${pass + fail}.json`); writeFileSync(data, JSON.stringify(committed));
  const ghout = join(T, `ghout-${pass + fail}.txt`); writeFileSync(ghout, '');
  return new Promise((ok) => {
    const p = spawn('bash', [join(ROOT, 'tools/ci-refresh.sh')], { env: { ...process.env, PAGES_DATA_URL: base + path, DATA_FILE: data, GITHUB_OUTPUT: ghout, FETCH_ARGS: fetchArgs || `--raw ${upFixture} --now ${NOW} --out ${data} --prev ${data}` } });
    let log = ''; p.stdout.on('data', (b) => (log += b)); p.stderr.on('data', (b) => (log += b));
    p.on('close', (code) => {
      const o = Object.fromEntries(readFileSync(ghout, 'utf8').trim().split('\n').filter(Boolean).map((x) => x.split('=')));
      ok({ o, d: read(data), log, code, data });
    });
  });
}
const runCI = ci;
let c = await runCI('/good/data/launches.json', empty);
check('CI: redirect (302) to valid published data is followed (-L) and restored; fetch fails → still deploys restored data', c.o.restored === 'true' && c.o.deploy === 'true' && c.d.generated_at === newer.generated_at, JSON.stringify(c.o));
c = await runCI('/html/data/launches.json', empty);
check('CI: redirect to an HTML page is rejected; fetch fails too → deploy skipped, committed file not used', c.o.restored === 'false' && c.o.deploy === 'false' && c.d.generated_at === committed.generated_at, JSON.stringify(c.o));
c = await runCI('/html/data/launches.json', good);
check('CI: restore fails but fetch OK → deploy with fresh data', c.o.restored === 'false' && c.o.fetch_code === '0' && c.o.deploy === 'true' && c.d.generated_at === new Date(NOW).toISOString(), JSON.stringify(c.o));
c = await runCI('/missing/data/launches.json', empty);
check('CI: 404 on restore + fetch fails → deploy skipped', c.o.restored === 'false' && c.o.deploy === 'false', JSON.stringify(c.o));
c = await runCI('/trunc/data/launches.json', empty);
check('CI: truncated JSON on restore is rejected (try/catch) → deploy skipped', c.o.restored === 'false' && c.o.deploy === 'false', JSON.stringify(c.o));
c = await runCI('/old/data/launches.json', good);
check('CI: published copy older than the committed file is not restored over it', c.o.restored === 'false' && c.o.deploy === 'true', JSON.stringify(c.o));
// fetch crashes (exit 1, simulated with an unknown option: usage error, no network): restored data still deploys,
// then the final health step turns the run red
c = await runCI('/good/data/launches.json', empty, '--no-such-option x');
check('CI: fetch exits 1 → ci-refresh.sh still exits 0 and deploys the restored copy', c.code === 0 && c.o.fetch_code === '1' && c.o.restored === 'true' && c.o.deploy === 'true', JSON.stringify(c.o));
{
  const h = (env, file = c.data) => { const r = spawnSync('node', [join(ROOT, 'tools/ci-health.mjs')], { env: { ...process.env, DATA_FILE: file, ...env }, encoding: 'utf8' }); return { code: r.status, log: (r.stdout + r.stderr).trim() }; };
  const at = (hoursAfter) => new Date(Date.parse(newer.generated_at) + hoursAfter * 3600e3).toISOString();
  let r = h({ FETCH_CODE: c.o.fetch_code, DEPLOY: c.o.deploy, NOW: at(0.2) });
  check('health: fetch exit 1 → job fails with ::error:: (after the deploy step)', r.code === 1 && /::error::fetch-launches\.mjs exited with 1/.test(r.log), r.log.slice(0, 90));
  r = h({ FETCH_CODE: '0', DEPLOY: 'true', NOW: at(0.2) });
  check('health: fetch OK + data 12 min old → passes', r.code === 0, r.log.slice(0, 80));
  r = h({ FETCH_CODE: '2', DEPLOY: 'true', NOW: at(2.9) });
  check('health: LL2 skipped (exit 2) but data 2.9 h old → still passes (transient)', r.code === 0, r.log.slice(0, 80));
  r = h({ FETCH_CODE: '2', DEPLOY: 'true', NOW: at(3.2) });
  check('health: data 3.2 h old (> 3 h) → fails', r.code === 1 && /3\.2 h old/.test(r.log), r.log.slice(0, 90));
  r = h({ FETCH_CODE: '3', DEPLOY: 'true', NOW: at(1) });
  check('health: only past part refreshed (exit 3), data fresh enough → passes', r.code === 0);
  r = h({ FETCH_CODE: '2', DEPLOY: 'false', NOW: at(0.5) });
  check('health: nothing deployed → fails', r.code === 1 && /nothing was deployed/.test(r.log));
  r = h({ FETCH_CODE: '0', DEPLOY: 'true', NOW: at(0.1) }, join(T, 'does-not-exist.json'));
  check('health: unreadable data file → fails', r.code === 1);
  r = h({ FETCH_CODE: '', DEPLOY: 'true', NOW: at(0.1) });
  check('health: missing fetch code (data step died early) → fails', r.code === 1);
}
{
  const E = join(T, 'unk.json'); writeFileSync(E, '{"keep":1}');
  const r = spawnSync('node', [FETCH, '--typo', 'x', '--out', E], { encoding: 'utf8', timeout: 5000 });
  check('fetch: unknown option → exit 1 immediately, no network, file untouched', r.status === 1 && readFileSync(E, 'utf8') === '{"keep":1}' && /usage error/.test(r.stderr), r.stderr.trim().slice(0, 60));
}
{
  const E = join(T, 'offline.json'); writeFileSync(E, '{"keep":1}');
  const t0 = Date.now(); const r = spawnSync('node', [FETCH, '--out', E], { encoding: 'utf8', timeout: 5000 });
  check('LL2_OFFLINE=1: live fetch refused fast (exit 1, clear error, no file written)', r.status === 1 && /LL2_OFFLINE=1 is set: refusing live LL2 request/.test(r.stderr) && readFileSync(E, 'utf8') === '{"keep":1}' && Date.now() - t0 < 3000, `${Date.now() - t0} ms · ${r.stderr.trim().slice(0, 70)}`);
  const src = readFileSync(FETCH, 'utf8');
  check('LL2_OFFLINE guard also sits inside get() (defence in depth)', /async function get\(url\) \{\n\s*if \(NET_BLOCKED\) refuseNetwork\(url\)/.test(src));
  const r2 = spawnSync('node', [FETCH, '--raw', join(ROOT, 'tools/fixtures/ll2-upcoming-2026-09-28.json'), '--now', NOW, '--out', join(T, 'offline-ok.json')], { encoding: 'utf8' });
  check('LL2_OFFLINE=1: fixture (--raw) runs still work, missing past part is skipped without network', r2.status === 0 && read(join(T, 'offline-ok.json')).launches.length > 0, `exit ${r2.status}`);
  c = await runCI('/good/data/launches.json', empty, `--out ${join(T, 'ci-live.json')}`);
  check('ci-refresh.sh under LL2_OFFLINE=1 without fixtures: fetch refused (exit 1) → restored copy still deployed', c.o.fetch_code === '1' && c.o.deploy === 'true', JSON.stringify(c.o));
  const nc = (f) => readFileSync(join(ROOT, f), 'utf8').replace(/^\s*#.*$/gm, '');
  check('LL2_OFFLINE is set by all three test runners and NOT by the CI workflow or ci-refresh.sh', ['tools/test-fetch.mjs', 'tools/test-logic.mjs', 'tools/verify.mjs'].every((f) => /process\.env\.LL2_OFFLINE = '1'/.test(readFileSync(join(ROOT, f), 'utf8'))) && !/LL2_OFFLINE/.test(nc('.github/workflows/fetch-launches.yml')) && !/LL2_OFFLINE/.test(nc('tools/ci-refresh.sh')));
}
check('ci-refresh.sh: cd … || exit 1', /^cd "\$\(dirname "\$0"\)\/\.\." \|\| exit 1$/m.test(readFileSync(join(ROOT, 'tools/ci-refresh.sh'), 'utf8')));
srv.close();

// ---------------------------------------------------------------- 3. workflow file (static checks)
{
  const src = readFileSync(join(ROOT, '.github/workflows/fetch-launches.yml'), 'utf8');
  const y = YAML.parse(src);
  const steps = y.jobs['refresh-and-deploy'].steps, uses = steps.filter((s) => s.uses).map((s) => s.uses);
  const cron = y.on.schedule[0].cron;
  check('workflow: triggers are schedule + workflow_dispatch only (no push)', Object.keys(y.on).sort().join() === 'schedule,workflow_dispatch');
  check('workflow: cron off the top of the hour', cron === '7,22,37,52 * * * *', cron);
  check('workflow: permissions contents:read, pages:write, id-token:write', JSON.stringify(y.permissions) === JSON.stringify({ contents: 'read', pages: 'write', 'id-token': 'write' }));
  check('workflow: concurrency group kept', y.concurrency && y.concurrency.group === 'launch-data');
  check('workflow: current action majors', ['actions/checkout@v7', 'actions/setup-node@v7', 'actions/upload-pages-artifact@v5', 'actions/deploy-pages@v5'].every((u) => uses.includes(u)), uses.join(' '));
  check('workflow: Node 24', steps.find((s) => s.uses === 'actions/setup-node@v7').with['node-version'] === '24');
  check('workflow: deploys dist/ artifact only, never commits data', steps.find((s) => s.uses === 'actions/upload-pages-artifact@v5').with.path === 'dist' && !/git (commit|push|add)/.test(src.replace(/^\s*#.*$/gm, '')));
  check('workflow: build/upload/deploy all gated on the deploy decision', steps.filter((s) => /build|upload-pages|deploy-pages/.test(s.run || s.uses || '')).every((s) => s.if === "steps.data.outputs.deploy == 'true'"));
  const hi = steps.findIndex((s) => /ci-health\.mjs/.test(s.run || '')), di = steps.findIndex((s) => s.uses === 'actions/deploy-pages@v5'), hs = steps[hi] || {};
  check('workflow: final health step runs after deploy, even when deploy is skipped, and gets fetch_code/deploy', hi === steps.length - 1 && hi > di && /!cancelled\(\)/.test(hs.if || '') && !/deploy == 'true'/.test(hs.if || '') && /steps\.data\.outputs\.fetch_code/.test(hs.env?.FETCH_CODE || '') && /steps\.data\.outputs\.deploy/.test(hs.env?.DEPLOY || '') && String(hs.env?.MAX_AGE_H) === '3', JSON.stringify({ hi, di, if: hs.if }));
  check('workflow: optional LL2_API_TOKEN secret passed to the fetch', /LL2_API_TOKEN: \$\{\{ secrets\.LL2_API_TOKEN \}\}/.test(src) && /Authorization = `Token/.test(readFileSync(FETCH, 'utf8')));
}

console.log(out.join('\n')); console.log(`\n${pass}/${pass + fail} fetch/CI tests passed  (temp dir ${T})`);
process.exit(fail ? 1 : 0);
