// Headless checks + screenshots against the BUILT site (dist/), served on 127.0.0.1 only.
// usage: node tools/build.mjs && node tools/verify.mjs [--no-shots]
import { chromium } from './node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
process.env.LL2_OFFLINE = '1'; // never reach LL2 from tests (fetch-launches.mjs refuses network when set)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'), SHOTS = path.join(ROOT, 'screenshots');
const PORT = 8788, BASE = `http://127.0.0.1:${PORT}/`;
const SHOT = !process.argv.includes('--no-shots');
const IMG_HOST = 'thespacedevs-prod.nyc3.digitaloceanspaces.com';
mkdirSync(SHOTS, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '-d', DIST], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const results = []; let failed = 0;
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!ok) failed++; };
const data = JSON.parse(readFileSync(path.join(DIST, 'data/launches.json'), 'utf8'));
const byName = (re) => data.launches.find((l) => re.test(`${l.rocket.full_name || l.rocket.name} ${l.mission ? l.mission.name : l.name}`));
const F14 = byName(/Starship Flight 14/);

async function ctxFor(kind) {
  const opts = kind === 'mobile' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : kind === 'landscape' ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
  const ctx = await browser.newContext({ ...opts, timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  const log = { errors: [], csp: [], foreign: [] };
  ctx.on('request', (r) => { const u = new URL(r.url()); if (u.hostname !== '127.0.0.1' && u.hostname !== IMG_HOST && u.protocol !== 'data:') log.foreign.push(r.url()); });
  await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error('CSP violation: ' + e.violatedDirective + ' ' + e.blockedURI)));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') (m.text().includes('CSP') ? log.csp : log.errors).push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  return { ctx, page, log };
}
const shot = async (page, name, opts = {}) => { if (SHOT) await page.screenshot({ path: path.join(SHOTS, `${name.startsWith('fix2-') ? name : 'fix-' + name}.png`), ...opts }); };
const smallTargets = (page, scope = 'body') => page.evaluate((scope) => {
  const out = [];
  for (const el of document.querySelector(scope).querySelectorAll('button, a, input, summary, select')) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || cs.visibility === 'hidden' || el.closest('.hidden,[hidden]')) continue;
    if (el.closest('p, .src, .recmeta, .credit, .imgcredit, .foot, .fine')) continue; // inline text links
    if (r.width < 44 || r.height < 44) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}"`);
  }
  return out;
}, scope);
const minFont = (page) => page.evaluate(() => { let m = 99, who = ''; for (const el of document.querySelectorAll('body *')) { if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; const r = el.getBoundingClientRect(); if (!r.width) continue; const f = parseFloat(getComputedStyle(el).fontSize); if (f < m) { m = f; who = el.className || el.tagName; } } return { px: m, who }; });

// ---------------------------------------------------------------- tracker, mobile
{
  const { ctx, page, log } = await ctxFor('mobile');
  await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForSelector('a.card');
  const vp = await page.getAttribute('meta[name=viewport]', 'content');
  check('pinch-zoom allowed (viewport meta)', !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(vp), vp);
  const f14 = await page.$(`a.card[href="#/launch/${F14.id}"]`);
  const f14txt = f14 ? (await f14.textContent()).replace(/\s+/g, ' ') : '';
  check('Flight 14 shown under "Recently launched" as success', !!f14 && /Launched successfully/.test(f14txt) && (await page.textContent('#app')).includes('Recently launched'), f14txt.slice(0, 120));
  check('no T+ counting up for launches whose time passed', !/T\+/.test(await page.textContent('#app')) || data.launches.some((l) => l.status.abbrev === 'In Flight'));
  check('data-age badge from generated_at', /Data/i.test(await page.textContent('.source')), (await page.textContent('.source')).replace(/\s+/g, ' ').trim().slice(0, 110));
  check('footer: "Not affiliated with or endorsed by" + LL2 attribution + three.js MIT', /Not affiliated with or endorsed by SpaceX/.test(await page.textContent('.foot')) && /Launch Library 2/.test(await page.textContent('.foot')) && /MIT/.test(await page.textContent('.foot')));
  check('image credits shown on cards', (await page.$$eval('.thumb .credit', (e) => e.filter((x) => x.textContent.trim()).length)) > 0);
  check('tap targets >= 44px (list)', !(await smallTargets(page)).length, (await smallTargets(page)).join('; '));
  const mf = await minFont(page); check('smallest text >= 12px (list)', mf.px >= 12, `${mf.px}px ${mf.who}`);
  await shot(page, 'm-list');
  if (f14) { await f14.screenshot({ path: path.join(SHOTS, 'fix-m-flight14-card.png') }); }
  const rough = await page.$(`a.card[href="#/launch/${byName(/Starship V3 Flight 15/).id}"]`);
  if (rough) { await rough.scrollIntoViewIfNeeded(); await rough.screenshot({ path: path.join(SHOTS, 'fix-m-rough-date-card.png') }); check('Quarter-precision card says NET, no T− countdown', /NET/.test(await rough.textContent()) && !/T−/.test(await rough.textContent()), (await rough.textContent()).replace(/\s+/g, ' ').slice(60, 170)); }

  // Flight 14 detail
  await page.goto(BASE + `#/launch/${F14.id}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__viewer, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const det = (await page.textContent('#app')).replace(/\s+/g, ' ');
  check('Flight 14 detail: launched successfully, no scrub/"window" talk', /Launched successfully/.test(det) && !/instantaneous/i.test(det));
  check('detail image credit line', /Image:/.test(det) && /via Launch Library 2/.test(det));
  check('Starship deep dive link on Starship detail', (await page.getAttribute('a.deepdive', 'href') || '').startsWith('starship.html?v=3&from='));
  check('3D viewer idles when static', await page.evaluate(() => window.__viewer.isIdle()), `frames=${await page.evaluate(() => window.__viewer.frames())}`);
  check('tap targets >= 44px (detail)', !(await smallTargets(page)).length, (await smallTargets(page)).join('; '));
  await shot(page, 'm-flight14-detail-top');
  // touch swipe on the 3D viewer must scroll the page
  await page.evaluate(() => { const r = document.querySelector('#viewer').getBoundingClientRect(); window.scrollBy(0, r.top - 80); }); await page.waitForTimeout(300);
  const box = await (await page.$('#viewer')).boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const swipe = async (x, y, dy) => { // real touch sequence (touchstart/move/end) so touch-action decides
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - (dy * i) / 10 }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(600);
  };
  const at = () => page.evaluate(() => { const r = document.querySelector('#viewer').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.8), sy: scrollY }; });
  let p0 = await at(); await swipe(p0.x, p0.y, 200); let y1 = await page.evaluate(() => scrollY);
  check('vertical swipe on 3D viewer scrolls the page', y1 - p0.sy > 100, `scrollY ${p0.sy} → ${y1}`);
  await page.evaluate(() => { const r = document.querySelector('#viewer').getBoundingClientRect(); window.scrollBy(0, r.top - 80); }); await page.waitForTimeout(300);
  await page.click('#ibtn'); await page.waitForTimeout(300); p0 = await at(); await swipe(p0.x, p0.y, 150); y1 = await page.evaluate(() => scrollY);
  check('after "Rotate / zoom" toggle the same swipe rotates instead of scrolling', Math.abs(y1 - p0.sy) < 10, `scrollY ${p0.sy} → ${y1}`);
  await page.click('#ibtn'); await page.click('#rbtn'); await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('#xbtn'); await page.waitForTimeout(1800);
  await (await page.$('.viewer-wrap')).screenshot({ path: path.join(SHOTS, 'fix-m-starship-v3-exploded.png') });
  await page.click('#xbtn'); await page.waitForTimeout(1800);
  await (await page.$('.viewer-wrap')).screenshot({ path: path.join(SHOTS, 'fix-m-starship-v3-assembled.png') });
  await (await page.$('.explain')).screenshot({ path: path.join(SHOTS, 'fix-m-flight14-mission-explained.png') });
  await (await page.$('.foot')).screenshot({ path: path.join(SHOTS, 'fix-m-footer-disclaimer.png') });
  const dd = await page.$('a.deepdive'); if (dd) { await page.evaluate(() => document.querySelector('.dhero').scrollIntoView()); await shot(page, 'm-flight14-credit-deepdive-link'); }

  // side boosters
  for (const [re, name, expect] of [[/Soyuz 2\.1b Progress/, 'soyuz', 4], [/H3-24 Martian/, 'h3-24', 4], [/Mark-3.*Gaganyaan/, 'lvm3', 2], [/Ariane 62/, 'ariane62', 2], [/Long March 2F.*Shenzhou/, 'lm2f-shenzhou24', 4]]) {
    const l = byName(re); if (!l) { check(`side boosters ${name}`, false, 'launch not in data'); continue; }
    await page.goto(BASE + `#/launch/${l.id}`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__viewer, null, { timeout: 30000 }); await page.waitForTimeout(1200);
    const n = await page.evaluate(() => window.__viewer.parts.filter((p) => /booster|strap|SRB|S200|P120|GEM|L40|PSO|block|URM/i.test(p.name) && !/core|first stage|upper/i.test(p.name)).length);
    const meta = (await page.textContent('#modelmeta')).replace(/\s+/g, ' ');
    check(`side boosters modelled: ${name}`, n >= expect, `${n} booster parts; ${meta.slice(0, 90)}`);
    await (await page.$('.viewer-wrap')).screenshot({ path: path.join(SHOTS, `${name.startsWith('lm2f') ? 'fix2' : 'fix'}-m-model-${name}.png`) });
    if (name.startsWith('lm2f')) { await page.evaluate(() => document.querySelector('.viewer-wrap').scrollIntoView()); await shot(page, 'fix2-m-lm2f-shenzhou24-detail'); }
    if (name.startsWith('lm2f')) { const mn = (await page.textContent('#modelnote')).replace(/\s+/g, ' '); check('LM-2F: "escape tower not drawn" note', /Escape tower not drawn/.test(mn), mn.slice(0, 110)); }
  }
  check('mobile tracker: no console errors', !log.errors.length, log.errors.join(' | ').slice(0, 400));
  check('mobile tracker: no CSP violations', !log.csp.length, log.csp.join(' | ').slice(0, 300));
  check('mobile tracker: no requests to LL2 or other hosts', !log.foreign.length, log.foreign.slice(0, 3).join(' '));
  await ctx.close();
}

// ---------------------------------------------------------------- precision cases (synthetic data injected)
{
  const { ctx, page, log } = await ctxFor('mobile');
  const base = data.launches.find((l) => l.status.abbrev === 'Go');
  const now = Date.now(), iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z/, 'Z');
  const mk = (id, name, abbrev, net, status = { id: 2, name: 'To Be Determined', abbrev: 'TBD' }) => ({ ...base, id, name: 'TEST ' + name, mission: { ...(base.mission || {}), name: 'TEST ' + name }, net: iso(net), window_start: iso(net), window_end: iso(net), status, net_precision: { id: 0, name, abbrev }, last_updated: iso(now) });
  const syn = { ...data, generated_at: iso(now), launches: [
    mk('t-hour', 'Hour', 'HR', now + 30 * 3600e3), mk('t-morning', 'Morning', 'MRN', now + 50 * 3600e3), mk('t-fy', 'Fiscal Year', 'FY', now + 200 * 86400e3),
    mk('t-decade', 'Decade', 'DEC', now + 900 * 86400e3), mk('t-pastmonth', 'Month', 'M', now - 40 * 86400e3), mk('t-pastfine', 'Minute', 'MIN', now - 3 * 3600e3, { id: 1, name: 'Go for Launch', abbrev: 'Go' }),
    mk('t-halfyear', 'Year Half 2', 'H2', now + 60 * 86400e3)] };
  await page.route('**/data/launches.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(syn) }));
  await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForSelector('a.card');
  const t = async (id) => (await page.textContent(`a.card[href="#/launch/${id}"]`)).replace(/\s+/g, ' ');
  const cases = { 't-hour': /Around/, 't-morning': /morning/i, 't-fy': /FY|fiscal/i, 't-decade': /20\d0s|decade/i, 't-pastmonth': /passed|Was NET/i, 't-pastfine': /Scheduled time passed/, 't-halfyear': /H2|second half|half/i };
  for (const [id, re] of Object.entries(cases)) { const s = await t(id).catch(() => ''); check(`precision ${id}`, re.test(s) && !/T\+/.test(s) && (id === 't-pastfine' || !/T−/.test(s)), s.slice(40, 150)); }
  await shot(page, 'm-precision-cases', { fullPage: true });
  check('precision page: no console errors', !log.errors.length, log.errors.join(' | ').slice(0, 300));
  await ctx.close();
}


// ---------------------------------------------------------------- v2 review fixes: stale detail, relative time, watch links, labels
{
  const now = Date.now(), iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z/, 'Z');
  const base = data.launches.find((l) => l.status.abbrev === 'Go');
  const mk = (id, o = {}) => ({ ...base, id, name: 'TEST | ' + id, mission: { ...(base.mission || {}), name: 'TEST ' + id }, last_updated: iso(now - 3 * 86400e3 - 60e3), ...o });
  const pastFine = mk('t-passed', { net: iso(now - 3 * 86400e3 + 3600e3), status: { id: 1, name: 'Go for Launch', abbrev: 'Go' }, net_precision: { name: 'Minute', abbrev: 'MIN' } });
  async function withData(kind, syn, fn) {
    const { ctx, page, log } = await ctxFor(kind);
    await page.route('**/data/launches.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(syn) }));
    await fn(page, log); await ctx.close();
  }
  // 3-day-old data: detail page must carry the same warning as the list, never "check back shortly" without it
  await withData('mobile', { ...data, generated_at: iso(now - 3 * 86400e3), launches: [pastFine, ...data.launches.slice(0, 3)] }, async (page, log) => {
    await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForSelector('a.card');
    check('3-day-old data: list warns', /3 days old/.test(await page.textContent('.note.warn')));
    await page.goto(BASE + '#/launch/t-passed', { waitUntil: 'networkidle' }); await page.waitForSelector('.dhero');
    const note = await page.$('#datanote'); const sub = await page.textContent('.dhero .cdsub');
    check('3-day-old data: detail page shows the stale-data warning', !!note && /3 days old/.test(await note.textContent()), note ? (await note.textContent()).replace(/\s+/g, ' ').slice(0, 110) : 'no #datanote');
    check('3-day-old data: passed launch does not say "check back shortly"', !/check back/i.test(sub) && /old/.test(sub), sub.trim());
    await shot(page, 'fix2-m-stale-detail');
    check('stale detail: no console errors', !log.errors.length, log.errors.join(' | ').slice(0, 200));
  });
  // relative time floors: 3.5 h -> "3 h ago"
  await withData('mobile', { ...data, generated_at: iso(now - 3.5 * 3600e3) }, async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForSelector('.source');
    const t = await page.textContent('.source');
    check('data age 3.5 h reads "3 h ago" (floor), not "4 h ago"', /\(3 h ago\)/.test(t), t.replace(/\s+/g, ' ').slice(0, 70));
  });
  // Watch live: card button (≤24 h / live), provider fallback, "No stream listed yet"
  const vid = { url: 'https://www.youtube.com/watch?v=test123', title: 'Official launch webcast', publisher: 'SpaceX', type: 'Official Webcast', priority: 10 };
  const soon = mk('w-soon', { net: iso(now + 3 * 3600e3), vid_urls: [vid], last_updated: iso(now) });
  const liveL = mk('w-live', { net: iso(now + 10 * 60e3), vid_urls: [{ ...vid, live: true }], webcast_live: true, last_updated: iso(now) });
  const noVidSX = mk('w-fallback', { net: iso(now + 5 * 3600e3), vid_urls: [], last_updated: iso(now) });
  const noVidOther = mk('w-none', { net: iso(now + 6 * 3600e3), vid_urls: [], provider: { ...base.provider, name: 'Some New Launcher Inc', abbrev: 'SNL' }, last_updated: iso(now) });
  const far = mk('w-far', { net: iso(now + 5 * 86400e3), vid_urls: [vid], last_updated: iso(now) });
  const evil = mk('w-evil', { net: iso(now + 4 * 3600e3), vid_urls: [{ url: 'javascript:alert(1)', title: 'x' }, { url: 'http://insecure.example/', title: 'y' }], provider: { ...base.provider, name: 'Some New Launcher Inc', abbrev: 'SNL' }, last_updated: iso(now) });
  await withData('mobile', { ...data, generated_at: iso(now), launches: [liveL, soon, noVidSX, noVidOther, evil, far] }, async (page, log) => {
    await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForSelector('a.card');
    const btn = async (id) => page.$(`.cardwrap:has(a.card[href="#/launch/${id}"]) .watchbtn`);
    const b1 = await btn('w-soon'), b2 = await btn('w-live'), b3 = await btn('w-fallback'), b4 = await btn('w-none'), b5 = await btn('w-far'), b6 = await btn('w-evil');
    const attrs = async (el) => el && page.evaluate((e) => ({ href: e.getAttribute('href'), target: e.target, rel: e.rel, text: e.textContent, h: e.getBoundingClientRect().height }), el);
    const a1 = await attrs(b1), a2 = await attrs(b2), a3 = await attrs(b3);
    check('card "Watch live" button for launch within 24 h: https, new tab, noopener noreferrer, ≥44 px', a1 && a1.href === vid.url && a1.target === '_blank' && /noopener/.test(a1.rel) && /noreferrer/.test(a1.rel) && a1.h >= 44, JSON.stringify(a1));
    check('card button marks a live webcast', a2 && /LIVE/.test(a2.text), a2 && a2.text);
    check('no webcast: card falls back to the provider site/channel, labelled as such (not a stream)', a3 && /SpaceX site/.test(a3.text) && a3.href.startsWith('https://') && /not a specific stream/.test(await b3.getAttribute('title')), a3 && `${a3.text} → ${a3.href}`);
    check('card button names the video host', a1 && /YouTube/.test(a1.text), a1 && a1.text);
    check('no button for launches > 24 h away, unknown providers without video, or non-https video URLs', !b4 && !b5 && !b6);
    check('no <a> nested inside the card link', await page.evaluate(() => !document.querySelector('a.card a')));
    const card = await page.$('.cardwrap:has(a.card[href="#/launch/w-soon"])'); if (card && SHOT) await card.screenshot({ path: path.join(SHOTS, 'fix2-m-watch-card.png') });
    await page.goto(BASE + '#/launch/w-none', { waitUntil: 'networkidle' }); await page.waitForSelector('#watch');
    check('detail without any stream or known channel says "No stream listed yet"', /No stream listed yet/.test(await page.textContent('#watch')));
    await page.goto(BASE + '#/launch/w-fallback', { waitUntil: 'networkidle' }); await page.waitForSelector('#watch');
    const fb = (await page.textContent('#watch')).replace(/\s+/g, ' ');
    check('detail fallback: provider channel, "not a specific stream"', /No stream listed yet/.test(fb) && /not a specific stream/.test(fb), fb.slice(0, 140));
    await page.goto(BASE + '#/launch/w-evil', { waitUntil: 'networkidle' }); await page.waitForSelector('#watch');
    check('detail: javascript:/http: video URLs never rendered', await page.evaluate(() => ![...document.querySelectorAll('#watch a')].some((a) => !a.href.startsWith('https://'))));
    check('watch pages: no iframes, no console errors', await page.evaluate(() => !document.querySelector('iframe')) && !log.errors.length, log.errors.join(' | ').slice(0, 200));
  });
  // ---- v3 review: LIVE needs fresh data + NET near now; card button needs Hour precision or better
  const yt = (id, live = false) => ({ url: `https://www.youtube.com/watch?v=${id}`, title: 'Official launch webcast', publisher: 'SpaceX', type: 'Official Webcast', priority: 1, ...(live ? { live: true } : {}) });
  const P = (name, abbrev) => ({ net_precision: { name, abbrev } });
  const v3 = (gen) => [
    mk('v-live', { net: iso(now - 20 * 60e3), vid_urls: [yt('live', true)], webcast_live: true, last_updated: iso(gen), ...P('Second', 'SEC') }),
    mk('v-oldlive', { net: iso(now - 2 * 86400e3), vid_urls: [yt('old', true)], webcast_live: true, last_updated: iso(gen), ...P('Second', 'SEC') }),
    mk('v-livefar', { net: iso(now + 5 * 3600e3), vid_urls: [yt('far', true)], webcast_live: true, last_updated: iso(gen), ...P('Second', 'SEC') }),
    mk('v-prelive', { net: iso(now + 3.5 * 3600e3), vid_urls: [yt('pre', true)], webcast_live: true, last_updated: iso(gen), ...P('Second', 'SEC') }),
    mk('v-postlive', { net: iso(now - 1.5 * 3600e3), vid_urls: [yt('post', true)], webcast_live: true, last_updated: iso(gen), ...P('Second', 'SEC') }),
    mk('v-month', { net: iso(now + 20 * 3600e3), vid_urls: [], last_updated: iso(gen), ...P('Month', 'M') }),
    mk('v-year', { net: iso(now + 10 * 3600e3), vid_urls: [yt('y')], last_updated: iso(gen), ...P('Year', 'Y') }),
    mk('v-day', { net: iso(now + 8 * 3600e3), vid_urls: [yt('d')], last_updated: iso(gen), ...P('Day', 'D') }),
    mk('v-hour', { net: iso(now + 9 * 3600e3), vid_urls: [yt('h')], last_updated: iso(gen), ...P('Hour', 'HR') }),
  ];
  const wbtn = async (page, id) => { const e = await page.$(`.cardwrap:has(a.card[href="#/launch/${id}"]) .watchbtn`); return e ? (await e.textContent()).replace(/\s+/g, ' ').trim() : null; };
  // fresh data (10 min old)
  await withData('mobile', { ...data, generated_at: iso(now - 10 * 60e3), launches: v3(now - 10 * 60e3) }, async (page, log) => {
    await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForSelector('a.card');
    const t = {}; for (const id of ['v-live', 'v-oldlive', 'v-livefar', 'v-prelive', 'v-postlive', 'v-month', 'v-year', 'v-day', 'v-hour']) t[id] = await wbtn(page, id);
    check('fresh data, NET 20 min ago, flagged live → "● LIVE · YouTube"', /^● LIVE · YouTube$/.test(t['v-live'] || ''), t['v-live']);
    check('flagged live but NET 2 days ago → no LIVE pill (no button at all)', !t['v-oldlive'], String(t['v-oldlive']));
    check('flagged live but NET 5 h ahead → "▶ Webcast / replay", not LIVE', t['v-livefar'] && /Webcast \/ replay/.test(t['v-livefar']) && !/LIVE/.test(t['v-livefar']), t['v-livefar']);
    check('pre-launch stream flagged live, NET 3.5 h ahead → "● LIVE" (window starts 4 h before NET)', /^● LIVE/.test(t['v-prelive'] || ''), t['v-prelive']);
    check('flagged live, NET 1.5 h ago (past the 1 h after-NET window) → "Webcast / replay", not LIVE', t['v-postlive'] && /Webcast \/ replay/.test(t['v-postlive']) && !/LIVE/.test(t['v-postlive']), String(t['v-postlive']));
    check('Month / Year / Day precision placeholders → no card button', !t['v-month'] && !t['v-year'] && !t['v-day'], JSON.stringify([t['v-month'], t['v-year'], t['v-day']]));
    check('Hour precision within 24 h → card button', /YouTube/.test(t['v-hour'] || ''), t['v-hour']);
    const card = await page.$('.cardwrap:has(a.card[href="#/launch/v-live"])'); if (card && SHOT) await card.screenshot({ path: path.join(SHOTS, 'fix3-m-live-card-fresh.png') });
    await page.goto(BASE + '#/launch/v-live', { waitUntil: 'networkidle' }); await page.waitForSelector('#watch');
    check('fresh live detail: LIVE tag + ● LIVE link', await page.$('#watch h2 .tag.live') !== null && /● LIVE/.test(await page.textContent('#watch')));
    await page.goto(BASE + '#/launch/v-oldlive', { waitUntil: 'networkidle' }); await page.waitForSelector('#watch');
    const oh = (await page.textContent('#watch')).replace(/\s+/g, ' ');
    check('old live-flagged launch detail: no LIVE anywhere, heading "Webcast & replay"', !/LIVE/.test(oh) && /Webcast & replay/.test(oh), oh.slice(0, 100));
    check('v3 watch pages: no console errors', !log.errors.length, log.errors.join(' | ').slice(0, 200));
  });
  // 50-min-old data: not stale yet (2 h), but too old to trust LIVE
  await withData('mobile', { ...data, generated_at: iso(now - 50 * 60e3), launches: v3(now - 50 * 60e3) }, async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForSelector('a.card');
    const t = await wbtn(page, 'v-live');
    check('data 50 min old (> 45 min): flagged-live launch shows "▶ Webcast / replay", not LIVE', t && /Webcast \/ replay · YouTube/.test(t) && !/LIVE/.test(t), t);
  });
  // stale data (3 h old): no LIVE, caveat on the button, detail explains
  await withData('mobile', { ...data, generated_at: iso(now - 3 * 3600e3 - 60e3), launches: v3(now - 3 * 3600e3) }, async (page, log) => {
    await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForSelector('a.card');
    const t = await wbtn(page, 'v-live'), th = await wbtn(page, 'v-hour');
    const title = await page.getAttribute('.cardwrap:has(a.card[href="#/launch/v-live"]) .watchbtn', 'title');
    check('stale data (3 h): no LIVE pill; button says "Webcast / replay" with a "data 3 h old" caveat', t && !/LIVE/.test(t) && /Webcast \/ replay/.test(t) && /data 3 h old/.test(t) && /may have changed/.test(title || ''), `${t} | ${title}`);
    check('stale data: upcoming Hour-precision button also carries the caveat', th && /data 3 h old/.test(th) && !/LIVE/.test(th), th);
    const card = await page.$('.cardwrap:has(a.card[href="#/launch/v-live"])'); if (card && SHOT) await card.screenshot({ path: path.join(SHOTS, 'fix3-m-stale-card-no-live.png') });
    await page.goto(BASE + '#/launch/v-live', { waitUntil: 'networkidle' }); await page.waitForSelector('#watch');
    const d = (await page.textContent('#watch')).replace(/\s+/g, ' ');
    check('stale detail: no LIVE tag, "Webcast & replay", data-age warning', !/LIVE/.test(d) && /Webcast & replay/.test(d) && /3 h old, so live status isn't shown/.test(d), d.slice(0, 160));
    if (SHOT) await (await page.$('#watch')).screenshot({ path: path.join(SHOTS, 'fix3-m-stale-watch-panel.png') });
    check('stale watch pages: no console errors', !log.errors.length, log.errors.join(' | ').slice(0, 200));
  });
  // LM-8A (2 boosters) and plain LM-8 (note: 0 or 2)
  {
    const tpl = byName(/Long March/) || base;
    const lm = (id, rn) => ({ ...tpl, id, name: `${rn} | TEST ${id}`, rocket: { ...tpl.rocket, full_name: rn, name: rn }, mission: { ...(tpl.mission || {}), name: `TEST ${id}`, type: 'Communications' }, net: iso(now + 4 * 86400e3), last_updated: iso(now) });
    await withData('mobile', { ...data, generated_at: iso(now), launches: [lm('lm8a', 'Long March 8A'), lm('lm8', 'Long March 8'), ...data.launches.slice(0, 2)] }, async (page, log) => {
      await page.goto(BASE + '#/launch/lm8a', { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__viewer, null, { timeout: 30000 }); await page.waitForTimeout(1200);
      const parts = await page.evaluate(() => window.__viewer.parts.filter((p) => /booster/i.test(p.name)).map((p) => p.desc));
      check('LM-8A model: 2 side boosters, text says 8A keeps them', parts.length === 2 && parts.every((d) => /8A keeps the two side boosters/.test(d)), `${parts.length} boosters`);
      if (SHOT) await (await page.$('.viewer-wrap')).screenshot({ path: path.join(SHOTS, 'fix3-m-model-lm8a.png') });
      await page.goto(BASE + '#/launch/lm8', { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__viewer, null, { timeout: 30000 }); await page.waitForTimeout(800);
      const n8 = await page.evaluate(() => window.__viewer.parts.filter((p) => /booster/i.test(p.name)).length), note = (await page.textContent('#modelnote')).replace(/\s+/g, ' ');
      check('plain LM-8: boosters not drawn, note says 0 or 2', n8 === 0 && /with 2 liquid side boosters and core-only \(0 boosters\)/.test(note), note.slice(0, 120));
      check('LM-8 pages: no console errors', !log.errors.length, log.errors.join(' | ').slice(0, 200));
    });
  }
  // real data: Crew-13 detail watch links
  {
    const { ctx, page, log } = await ctxFor('mobile');
    const crew = byName(/Crew-13/);
    await page.goto(BASE + `#/launch/${crew.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#watch');
    const links = await page.$$eval('#watch a.wlink', (as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel, h: a.getBoundingClientRect().height })));
    check('Crew-13 detail lists its webcast (https, new tab, noopener noreferrer, ≥44 px)', links.length >= 1 && links.every((l) => l.href.startsWith('https://') && l.target === '_blank' && /noopener/.test(l.rel) && /noreferrer/.test(l.rel) && l.h >= 44), JSON.stringify(links[0]));
    await page.evaluate(() => document.querySelector('#watch').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
    await shot(page, 'fix2-m-crew13-watch');
    if (SHOT) await (await page.$('#watch')).screenshot({ path: path.join(SHOTS, 'fix2-m-crew13-watch-panel.png') });
    check('Crew-13 detail: no console errors', !log.errors.length, log.errors.join(' | ').slice(0, 200));
    await ctx.close();
  }
  // footer screenshot
  {
    const { ctx, page } = await ctxFor('mobile');
    await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForSelector('.foot');
    if (SHOT) await (await page.$('.foot')).screenshot({ path: path.join(SHOTS, 'fix2-m-footer.png') });
    const st = await page.$$eval('.foot a', (as) => as.map((a) => Math.round(a.getBoundingClientRect().height)));
    check('footer links ≥44 px tall', st.every((h) => h >= 44), st.join(','));
    await ctx.close();
  }
  // exploded tracker Starship labels must not overlap at 844x390 and 320x568
  for (const [w, h] of [[844, 390], [320, 568], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles' });
    const page = await ctx.newPage();
    await page.goto(BASE + `#/launch/${F14.id}`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__viewer, null, { timeout: 30000 });
    await page.evaluate(() => document.querySelector('.viewer-wrap').scrollIntoView()); await page.click('#xbtn'); await page.waitForTimeout(2500);
    const ov = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.part-label')].filter((e) => getComputedStyle(e).opacity !== '0' && e.getBoundingClientRect().width).map((e) => ({ t: e.textContent.trim(), b: e.getBoundingClientRect() }));
      const n = r.length; r.push(...[...document.querySelectorAll('.viewer-wrap .disclaimer, .viewer-wrap .interact')].map((e) => ({ t: '[' + e.className + ']', b: e.getBoundingClientRect() })).filter((x) => x.b.width));
      const o = []; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i].b, c = r[j].b; const x = Math.min(a.right, c.right) - Math.max(a.left, c.left), y = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top); if (x > 2 && y > 2) o.push(`${r[i].t} / ${r[j].t} (${Math.round(x)}x${Math.round(y)})`); }
      return { n, o };
    });
    check(`tracker exploded Starship labels don't overlap (each other or the viewer overlays) at ${w}x${h}`, ov.n > 5 && !ov.o.length, `${ov.n} labels; ${ov.o.join('; ')}`);
    if (SHOT && w !== 390) await (await page.$('.viewer-wrap')).screenshot({ path: path.join(SHOTS, `fix2-m-starship-exploded-${w}x${h}.png`) });
    await ctx.close();
  }
}

// ---------------------------------------------------------------- Starship deep dive, portrait
async function deepDive(kind, prefix) {
  const { ctx, page, log } = await ctxFor(kind);
  await page.goto(BASE + `starship.html?v=3&from=${F14.id}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__app, null, { timeout: 45000 });
  await page.waitForTimeout(2500); await shot(page, `${prefix}-first-load-hint`);
  // first-load camera fit + hint auto-dismiss (8 s) animate briefly; after that the loop must stop
  await page.waitForTimeout(7000); await page.waitForFunction(() => window.__app.isIdle(), null, { timeout: 10000 }).catch(() => {});
  const f0 = await page.evaluate(() => window.__app.stats().frames); await page.waitForTimeout(2000);
  const a = await page.evaluate(() => ({ v: window.__app.variant, idle: window.__app.isIdle(), frames: window.__app.stats().frames, state: { ...window.__app.state, sys: undefined } }));
  check(`${prefix}: V3 model loads`, a.v === 3, JSON.stringify(a.state).slice(0, 120));
  check(`${prefix}: render loop idles when nothing animates`, a.idle && a.frames === f0, `frames ${f0} → ${a.frames} over 2 s`);
  check(`${prefix}: back link to launch`, (await page.getAttribute('#backLink', 'href') || '').includes(F14.id));
  check(`${prefix}: disclaimer text`, (await page.content()).includes('Unofficial fan/learning project. Not affiliated with or endorsed by SpaceX.'));
  const st = await smallTargets(page, 'body'); check(`${prefix}: tap targets >= 44px`, !st.length, st.join('; '));
  const mf = await minFont(page); check(`${prefix}: smallest text >= 11px`, mf.px >= 11, `${mf.px}px ${mf.who}`);
  await shot(page, `${prefix}-v3-default`);
  await page.evaluate(() => window.__app.set({ skin: 'cut', flow: true })); await page.waitForTimeout(1500);
  check(`${prefix}: flow animation runs while on`, !(await page.evaluate(() => window.__app.isIdle())));
  await shot(page, `${prefix}-cutaway-flow`);
  await page.evaluate(() => { window.__app.set({ skin: 'ghost', flow: false }); }); await page.waitForTimeout(800);
  await shot(page, `${prefix}-xray`);
  await page.evaluate(() => { window.__app.set({ skin: 'solid' }); window.__app.setExplode(1); }); await page.waitForTimeout(1200);
  await shot(page, `${prefix}-exploded`);
  await page.evaluate(() => { window.__app.setExplode(0); window.__app.set({ flow: true }); window.__app.setStage('raptor', true); }); await page.waitForTimeout(1500);
  await page.waitForTimeout(3500); await page.evaluate(() => window.__app.showInfo('r_oxpb')); await page.waitForTimeout(800);
  const cardTxt = (await page.textContent('#card')).replace(/\s+/g, ' ');
  check(`${prefix}: preburner card says "nearly all"`, /Nearly all/i.test(cardTxt) && !/\bALL\b/.test(cardTxt));
  await shot(page, `${prefix}-raptor-card`);
  await page.evaluate(() => window.__app.showInfo('raptor')); await page.waitForTimeout(500);
  const rc = (await page.textContent('#card')).replace(/\s+/g, ' ');
  check(`${prefix}: Raptor 3 figures hedged (~250 tf SL, ~275 vac, 280 as test)`, /~250 tf/.test(rc) && /~275 tf/.test(rc) && /280 tf reached in 2024 testing/.test(rc) && /~330 bar/.test(rc));
  await shot(page, `${prefix}-raptor-specs`);
  await page.evaluate(() => { window.__app.set({ flow: false }); window.__app.setStage('stack', true); }); await page.waitForTimeout(3500); await page.evaluate(() => window.__app.showInfo('model')); await page.waitForTimeout(800);
  await shot(page, `${prefix}-model-card`);
  // per-part highlight must not bleed
  const bleed = await page.evaluate(() => { const A = window.__app; A.hideInfo(); A.highlightKey('b_gridfin'); let lit = new Set(); A.scene.traverse((o) => { if (o.userData.info && o.material && [].concat(o.material).some((m) => m.emissive && m.emissive.getHex() === 0x3d8bff)) lit.add(o.userData.info); }); A.clearHighlight(); return [...lit]; });
  check(`${prefix}: highlight stays on the picked part`, bleed.length === 1 && bleed[0] === 'b_gridfin', bleed.join(','));
  // context loss / restore
  const restored = await page.evaluate(async () => { const gl = window.__app.renderer.getContext(), ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return 'no-ext'; ext.loseContext(); await new Promise((r) => setTimeout(r, 300)); ext.restoreContext(); await new Promise((r) => setTimeout(r, 1500)); return !!window.__app.scene.environment; });
  check(`${prefix}: environment rebuilt after webglcontextrestored`, restored === true, String(restored));
  check(`${prefix}: no console errors`, !log.errors.filter((e) => !/CONTEXT_LOST|context lost/i.test(e)).length, log.errors.join(' | ').slice(0, 300));
  check(`${prefix}: no CSP violations / foreign requests`, !log.csp.length && !log.foreign.length, [...log.csp, ...log.foreign].join(' ').slice(0, 300));
  await ctx.close();
}
await deepDive('mobile', 'dd-portrait');
await deepDive('landscape', 'dd-landscape');
{ // deep dive back link returns to the specific launch
  const { ctx, page, log } = await ctxFor('mobile');
  await page.goto(BASE + `#/launch/${F14.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('a.deepdive');
  await page.click('a.deepdive'); await page.waitForFunction(() => window.__app, null, { timeout: 45000 }); await page.waitForTimeout(1500);
  const bl = await page.$('#backLink'); const txt = await bl.textContent();
  if (SHOT) await page.screenshot({ path: path.join(SHOTS, 'fix2-dd-back-link.png'), clip: { x: 0, y: 0, width: 390, height: 230 } });
  await bl.click(); await page.waitForSelector('.dhero h1', { timeout: 20000 });
  const h1 = await page.textContent('.dhero h1');
  check('deep dive "‹ Back to launch" returns to the launch it was opened from', /Back to launch/.test(txt) && /Flight 14/.test(h1) && page.url().endsWith(`#/launch/${F14.id}`), `${txt.trim()} → ${h1}`);
  await ctx.close();
}
{ // landscape: panel docked at the side
  const { ctx, page } = await ctxFor('landscape');
  await page.goto(BASE + 'starship.html', { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__app, null, { timeout: 45000 });
  const r = await page.evaluate(() => { const b = document.querySelector('#panel').getBoundingClientRect(); return { left: b.left, width: b.width, W: innerWidth }; });
  check('deep dive landscape: control panel docked at the side', r.left > 200 && r.width < r.W * 0.6, JSON.stringify(r));
  await ctx.close();
}
{ // Block 2 variant + no-WebGL message
  const { ctx, page, log } = await ctxFor('mobile');
  await page.goto(BASE + 'starship.html?v=2', { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__app, null, { timeout: 45000 }); await page.waitForTimeout(1500);
  check('deep dive Block 2 tag says "2025, retired"', /2025, retired/.test(await page.textContent('#blockTag')));
  await page.evaluate(() => window.__app.dismissHint()); await page.waitForTimeout(500); await shot(page, 'dd-portrait-block2');
  await ctx.close();
  const b2 = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--disable-webgl', '--disable-3d-apis', '--disable-gpu'] });
  const p2 = await (await b2.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await p2.goto(BASE + `starship.html?from=${F14.id}`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(1500);
  check('deep dive without WebGL still offers "Back to launch" to the launch you came from', ((await p2.getAttribute('#nogl .nogl-back', 'href')) || '').endsWith(`#/launch/${F14.id}`) && ((await p2.getAttribute('#backLink', 'href')) || '').endsWith(`#/launch/${F14.id}`));
  const txt = (await p2.textContent('body')).replace(/\s+/g, ' ');
  check('deep dive without WebGL shows a friendly message', /WebGL/i.test(txt) && !/Error:|undefined/.test(txt), txt.slice(0, 140));
  if (SHOT) await p2.screenshot({ path: path.join(SHOTS, 'fix2-dd-no-webgl-back-link.png') });
  await b2.close();
}

// ---------------------------------------------------------------- desktop
{
  const { ctx, page, log } = await ctxFor('desktop');
  await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForSelector('a.card'); await shot(page, 'd-list');
  await page.goto(BASE + `#/launch/${F14.id}`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__viewer, null, { timeout: 30000 }); await page.waitForTimeout(1500);
  await shot(page, 'd-flight14-detail');
  await page.click('a.deepdive'); await page.waitForFunction(() => window.__app, null, { timeout: 45000 }); await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__app.dismissHint(); window.__app.set({ skin: 'cut', flow: true }); window.__app.showInfo('b_lox'); }); await page.waitForTimeout(1500);
  await shot(page, 'd-deepdive-cutaway');
  check('desktop: no console errors / CSP / foreign requests', !log.errors.length && !log.csp.length && !log.foreign.length, [...log.errors, ...log.csp, ...log.foreign].join(' | ').slice(0, 300));
  await ctx.close();
}

await browser.close(); server.kill();
console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
