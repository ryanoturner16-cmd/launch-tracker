import { loadLaunches, REFRESH_MS, STALE_MS } from './data.js';
import { explainMission } from './explain.js';
import { countdown, whenLabel, isFine, isDone, precisionKey } from './when.js';
import { webcasts, providerChannel, isLiveNow, flaggedLive, inWatchWindow, hostLabel, hostOf } from './watch.js';
import { starshipVariant } from './starship/variant.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FILTER_KEY = 'launchTracker.filter.v1';
const DISCLAIMER = 'Unofficial fan project. Not affiliated with or endorsed by SpaceX or any other launch provider. Data from Launch Library 2 by The Space Devs; may be delayed or inaccurate.';

const state = { launches: [], source: null, error: null, generatedAt: null, newestUpdate: null, filter: localStorage.getItem(FILTER_KEY) || 'all', viewer: null, loading: true };
const app = $('#app');

// ---------- URL safety: only http(s) links; images only from the LL2 CDN (matches the CSP img-src)
const IMG_HOSTS = ['thespacedevs-prod.nyc3.digitaloceanspaces.com'];
export function safeHttp(u) { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } }
export function safeImg(u) { try { const x = new URL(u); return x.protocol === 'https:' && IMG_HOSTS.includes(x.host) ? x.href : null; } catch { return null; } }
/** Set background images after rendering (never via inline style markup). */
function applyImages(root = document) {
  root.querySelectorAll('[data-bg]').forEach((el) => {
    const u = safeImg(el.dataset.bg); el.removeAttribute('data-bg');
    if (!u) return;
    const layers = el.classList.contains('dhero') ? 'linear-gradient(180deg,rgba(5,8,20,.15),rgba(5,8,20,.95)), ' : '';
    el.style.backgroundImage = `${layers}url(${JSON.stringify(u)})`;
  });
}

// ---------- formatting
const SHORT = {
  'Indian Space Research Organization': 'ISRO', 'China Aerospace Science and Technology Corporation': 'CASC', 'United Launch Alliance': 'ULA',
  'Russian Federal Space Agency (ROSCOSMOS)': 'Roscosmos', 'Mitsubishi Heavy Industries': 'MHI', 'Korea Aerospace Research Institute': 'KARI',
  'Japan Aerospace Exploration Agency': 'JAXA', 'National Aeronautics and Space Administration': 'NASA', 'European Space Agency': 'ESA',
  'China Academy of Launch Vehicle Technology': 'CALT', 'Northrop Grumman Space Systems': 'Northrop Grumman', 'Firefly Aerospace': 'Firefly',
};
export const provShort = (p) => SHORT[p.name] || (p.name && p.name.length > 20 && p.abbrev ? p.abbrev : p.name) || 'Unknown';
const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
const statusCls = (l) => ({ Go: 'go', TBC: 'tbc', TBD: 'tbd', Hold: 'hold', 'In Flight': 'flight', Success: 'go', Failure: 'fail', 'Partial Failure': 'hold' }[l.status.abbrev] || 'tbd');
function ago(ts) { // floor, so 3.5 h reads "3 h ago", never rounds up
  if (!ts) return 'unknown'; const m = Math.floor((Date.now() - ts) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 48) return `${h} h ago`; return `${Math.floor(h / 24)} days ago`;
}
const clock = (ts) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(ts));
function credit(img, long = false) {
  if (!img) return '';
  const lic = img.license ? (safeHttp(img.license_url) ? `<a href="${esc(safeHttp(img.license_url))}" target="_blank" rel="noopener noreferrer">${esc(img.license)}</a>` : esc(img.license)) : 'license not stated';
  return long ? `Image: ${esc(img.credit || 'uncredited')} · ${lic} · via Launch Library 2` : `📷 ${esc(img.credit || img.license)}`;
}

// ---------- filters
function filterOptions() {
  const counts = new Map();
  for (const l of state.launches) { const k = provShort(l.provider); counts.set(k, (counts.get(k) || 0) + 1); }
  const opts = [{ key: 'all', label: 'All', n: state.launches.length }];
  const cn = state.launches.filter((l) => l.provider.country === 'CHN');
  if (new Set(cn.map((l) => l.provider.name)).size > 1) opts.push({ key: 'c:CHN', label: 'All China', n: cn.length });
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([k, n]) => opts.push({ key: 'p:' + k, label: k, n }));
  return opts;
}
function applyFilter(ls) {
  const f = state.filter;
  if (f.startsWith('c:')) return ls.filter((l) => l.provider.country === f.slice(2));
  if (f.startsWith('p:')) return ls.filter((l) => provShort(l.provider) === f.slice(2));
  return ls;
}

// ---------- views
function dataNotes() {
  const notes = [], stale = state.generatedAt && Date.now() - state.generatedAt > STALE_MS;
  if (stale) notes.push(`This data is ${esc(ago(state.generatedAt).replace(' ago', ''))} old; schedules and results may have changed.`);
  if (state.error) notes.push(state.generatedAt ? `Couldn't refresh (${esc(state.error)}); showing data saved on this device.` : `Couldn't load launch data (${esc(state.error)}).`);
  return notes;
}
/** Detail pages get the same warning as the list (data age + refresh errors). */
function detailDataNote() {
  const notes = dataNotes(); if (!notes.length) return '';
  return `<div class="note warn" id="datanote"><b>⚠ ${state.generatedAt ? `Data as of ${esc(clock(state.generatedAt))}.` : 'No launch data.'}</b> ${notes.join(' ')}</div>`;
}
function sourceBadge() {
  if (state.loading && !state.generatedAt) return '<div class="source"><span class="dot"></span><span>Loading launch data…</span></div>';
  const age = state.generatedAt ? Date.now() - state.generatedAt : Infinity;
  const stale = age > STALE_MS;
  const label = state.generatedAt ? `Data as of <b>${esc(clock(state.generatedAt))}</b> (${esc(ago(state.generatedAt))})` : '<b>No data</b>';
  const notes = dataNotes();
  return `<div class="source"><span class="dot ${stale || !state.generatedAt ? 'stale' : 'ok'}"></span><span>${label}${state.newestUpdate ? ` · newest record change ${esc(ago(state.newestUpdate))}` : ''}${state.loading ? ' · checking…' : ''}</span>
    <button class="ghost small" id="refresh" ${state.loading ? 'disabled' : ''}>Refresh</button></div>
    ${notes.length ? `<div class="note warn">${notes.join(' ')}</div>` : ''}`;
}
function card(l) {
  const cd = countdown(l, Date.now(), state.generatedAt);
  const img = l.image && safeImg(l.image.url) ? l.image : null;
  const wb = watchButton(l);
  return `<div class="cardwrap${wb ? ' haswatch' : ''}" data-w="${esc(l.id)}"><a class="card" href="#/launch/${encodeURIComponent(l.id)}">
    ${img ? `<div class="thumb" data-bg="${esc(img.url)}"><span class="credit">${credit(img)}</span></div>` : '<div class="thumb none" aria-hidden="true">🚀</div>'}
    <div class="body">
      <div class="row top"><span class="prov">${esc(provShort(l.provider))}</span><span class="pill ${statusCls(l)}" title="${esc(l.status.name)}">${esc(l.status.abbrev)}</span></div>
      <div class="rocket">${esc(l.rocket.full_name || l.rocket.name)}</div>
      <div class="mission">${esc(l.mission ? l.mission.name : l.name)}</div>
      <div class="pad">📍 ${esc([l.pad.name, l.pad.location].filter(Boolean).join(' · '))}</div>
      <div class="cd ${cd.cls}" data-cd="${esc(l.id)}">${esc(cd.text)}</div>
      <div class="cdsub" data-cdsub="${esc(l.id)}">${esc(cd.sub || '')}</div>
      ${isFine(l) && !isDone(l) ? `<div class="when">🕒 ${esc(whenLabel(l))}</div>` : ''}
    </div></a>${wb}</div>`;
}
/** Small card button for launches that are live or within ~24 h (Hour precision or better only).
 *  Sits outside the card link (no nested <a>). LIVE only when trusted (fresh data + NET near now). */
function watchButton(l, now = Date.now()) {
  const dataAt = state.generatedAt;
  if (!inWatchWindow(l, now, dataAt)) return '';
  const v = webcasts(l)[0], ch = v ? null : providerChannel(l);
  const u = v ? v.url : ch && ch.url; if (!u) return '';
  const live = isLiveNow(l, now, dataAt), stale = !dataAt || now - dataAt > STALE_MS;
  const host = v ? hostLabel(v.url) : null, passed = Date.parse(l.net) <= now;
  let text;
  if (!v) text = `▶ ${ch.short || ch.name + ' site'}`;
  else if (live) text = `● LIVE${host ? ' · ' + host : ' · Watch'}`;
  else if (stale || passed || flaggedLive(l)) text = `▶ Webcast / replay${host ? ' · ' + host : ''}`;
  else text = `▶ Watch${host ? ' on ' + host : ' live'}`;
  const staleNote = stale && dataAt ? ` Launch data is ${ago(dataAt).replace(' ago', '')} old, so the time or stream may have changed.` : '';
  const title = (v ? `${v.title || 'Webcast'}${v.publisher ? ' · ' + v.publisher : ''} · ${hostOf(v.url)} (opens in a new tab).` : `${ch.label}: the provider's channel, not a specific stream (opens in a new tab).`) + staleNote;
  return `<a class="watchbtn${live ? ' live' : ''}${stale ? ' stale' : ''}" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(title)}" aria-label="${esc(title)}">${esc(text)}${stale && dataAt ? `<small>data ${esc(ago(dataAt).replace(' ago', ''))} old</small>` : ''}</a>`;
}
/** Detail page "Watch" panel: all listed webcasts, else the provider's channel, else "No stream listed yet". */
function watchPanel(l, now = Date.now()) {
  const dataAt = state.generatedAt, vids = webcasts(l), done = isDone(l), live = isLiveNow(l, now, dataAt);
  const stale = !dataAt || now - dataAt > STALE_MS, replayish = done || (!live && (flaggedLive(l) || Date.parse(l.net) <= now));
  let body;
  if (vids.length) {
    body = `<div class="wlist">${vids.map((v) => {
      const vlive = live && v.live;
      const bits = [v.publisher, v.type, v.live && !live ? 'webcast / replay' : null, v.live || !v.start ? null : `starts ${clock(Date.parse(v.start))}`].filter(Boolean);
      return `<a class="wlink" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer"><b>${vlive ? '<span class="livedot">● LIVE</span> ' : '▶ '}${esc(v.title || 'Webcast')}</b>${bits.length ? `<span>${esc(bits.join(' · '))}</span>` : ''}<span class="host">${esc(hostOf(v.url))} ↗</span></a>`;
    }).join('')}</div>`;
  } else {
    const ch = providerChannel(l);
    body = `<p class="nostream">${done ? 'No webcast or replay listed for this launch.' : 'No stream listed yet.'}</p>${ch ? `<a class="wlink channel" href="${esc(ch.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(ch.label)}</b><span>${esc(ch.name)}'s official channel, not a specific stream</span><span class="host">${esc(hostOf(ch.url))} ↗</span></a>` : ''}`;
  }
  const staleP = stale && dataAt && vids.length ? `<p class="src warn">Launch data is ${esc(ago(dataAt).replace(' ago', ''))} old, so live status isn't shown and streams may have changed.</p>` : '';
  return `<section class="panel watch" id="watch"><h2>${live ? '📺 Watch live <span class="tag live">LIVE</span>' : replayish ? '📺 Webcast &amp; replay' : '📺 Watch live'} <span class="tag">opens in a new tab</span></h2>${body}${staleP}
    <p class="src">source: ${vids.length ? 'vid_urls (Launch Library 2), by priority' : 'no vid_urls in the data'}</p></section>`;
}
function emptyMessage(all, shown) {
  if (!state.launches.length) {
    if (state.loading) return '<p class="empty">Loading…</p>';
    if (!state.generatedAt) return `<p class="empty">Launch data couldn't be loaded${state.error ? ` (${esc(state.error)})` : ''}. Check your connection and tap Refresh.</p>`;
    return '<p class="empty">No upcoming launches in the current data.</p>';
  }
  if (!shown.length) return '<p class="empty">No launches match this filter. <button class="ghost small" id="clearf">Show all</button></p>';
  return '';
}
const footer = () => `<footer class="foot"><p class="disc">${esc(DISCLAIMER)}</p>
  <p>Launch data: <a href="https://thespacedevs.com/llapi" target="_blank" rel="noopener noreferrer">Launch Library 2</a> by The Space Devs (refreshed server-side every ~15 min). Images © their credited owners. 3D models are simplified approximations. 3D rendering: three.js (MIT).</p></footer>`;

function renderList() {
  disposeViewer();
  document.title = 'Launch Tracker';
  const opts = filterOptions();
  if (!opts.some((o) => o.key === state.filter)) state.filter = 'all';
  const list = applyFilter(state.launches);
  const recent = list.filter((l) => isDone(l) || /flight/i.test(l.status.name || ''));
  const upcoming = list.filter((l) => !recent.includes(l));
  app.innerHTML = `
    <header class="hero-head">
      <div class="titlebar"><h1>🚀 Launch Tracker</h1><a class="navlink" href="starship.html">Starship deep dive ›</a></div>
      <p class="sub">Orbital launches from every provider · times in <b>${esc(tzName.replace(/_/g, ' '))}</b></p>
      ${sourceBadge()}
    </header>
    <nav class="chips" id="chips" aria-label="Filter by provider">${opts.map((o) => `<button class="chip ${o.key === state.filter ? 'on' : ''}" data-f="${esc(o.key)}" aria-pressed="${o.key === state.filter}">${esc(o.label)} <span>${o.n}</span></button>`).join('')}</nav>
    <main>
      ${emptyMessage(state.launches, list)}
      ${recent.length ? `<h2 class="sect">Recently launched</h2><div class="list">${recent.map(card).join('')}</div>` : ''}
      ${upcoming.length ? `${recent.length ? '<h2 class="sect">Upcoming</h2>' : ''}<div class="list">${upcoming.map(card).join('')}</div>` : (list.length && state.launches.length ? '<p class="empty small">No upcoming launches for this filter.</p>' : '')}
    </main>
    ${footer()}`;
  applyImages(app);
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.filter = b.dataset.f; localStorage.setItem(FILTER_KEY, state.filter); renderList();
    const on = $('.chip.on'); on && on.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
  const cf = $('#clearf'); if (cf) cf.onclick = () => { state.filter = 'all'; localStorage.setItem(FILTER_KEY, 'all'); renderList(); };
  $('#refresh') && $('#refresh').addEventListener('click', () => refresh());
}

function renderDetail(id) {
  disposeViewer();
  const l = state.launches.find((x) => String(x.id) === id);
  if (!l) { app.innerHTML = `<div class="detail"><a class="back" href="#/">‹ All launches</a><p class="empty">${state.loading ? 'Loading…' : 'Launch not found (it may have dropped off the list).'}</p>${footer()}</div>`; return; }
  document.title = `${l.mission ? l.mission.name : l.name} · Launch Tracker`;
  const cd = countdown(l, Date.now(), state.generatedAt);
  const img = l.image && safeImg(l.image.url) ? l.image : null;
  const padTz = l.pad.timezone && l.pad.timezone !== tzName && (isFine(l) || precisionKey(l) === 'hour') ? whenLabel(l, l.pad.timezone) : null;
  const sections = explainMission(l);
  const links = [...(l.info_urls || []).map((v) => ({ t: `ℹ ${v.title || 'Info'}`, u: v.url })),
    l.flightclub_url ? { t: '📈 Flight Club trajectory', u: l.flightclub_url } : null, l.pad.map_url ? { t: '🗺 Pad on map', u: l.pad.map_url } : null]
    .filter(Boolean).map((k) => ({ ...k, u: safeHttp(k.u) })).filter((k) => k.u);
  const isStarship = /starship|super heavy/i.test(`${l.rocket.full_name} ${l.rocket.name}`);
  const sv = isStarship ? starshipVariant(l) : null;
  app.innerHTML = `
  <div class="detail">
    <a class="back" href="#/">‹ All launches</a>
    ${detailDataNote()}
    <section class="dhero" ${img ? `data-bg="${esc(img.url)}"` : ''}>
      <div class="row top"><span class="prov">${esc(l.provider.name)}</span><span class="pill ${statusCls(l)}">${esc(l.status.name)}</span></div>
      <h1>${esc(l.mission ? l.mission.name : l.name)}</h1>
      <div class="rocket">${esc(l.rocket.full_name || l.rocket.name)}</div>
      <div class="cd big ${cd.cls}" data-cd="${esc(l.id)}">${esc(cd.text)}</div>
      <div class="cdsub" data-cdsub="${esc(l.id)}">${esc(cd.sub || '')}</div>
      <div class="when">${isDone(l) ? '' : `🕒 ${esc(whenLabel(l))}`}${padTz ? `${isDone(l) ? '' : '<br>'}<span class="muted">At the pad: ${esc(padTz)}</span>` : ''}</div>
      <div class="pad">📍 ${esc([l.pad.name, l.pad.location].filter(Boolean).join(' · '))}</div>
    </section>
    ${img ? `<p class="imgcredit">${credit(img, true)}</p>` : ''}
    ${watchPanel(l)}
    ${isStarship ? `<a class="deepdive" href="starship.html?v=${sv.v}&amp;from=${encodeURIComponent(l.id)}"><b>🔍 Starship deep dive</b><span>Cutaway &amp; X-ray, animated propellant flow, Raptor engine cycle, info cards${sv.v === 3 ? ' · V3 booster fins &amp; hot-stage' : ''}</span></a>` : ''}

    <section class="panel">
      <h2>3D model <span class="tag">tap a part</span></h2>
      <div class="viewer-wrap">
        <div id="viewer" class="viewer"><div class="vload">Loading 3D model…</div></div>
        <div class="disclaimer">Simplified approximation · not an exact replica</div>
        <button id="ibtn" class="ghost small interact" aria-pressed="false">✋ Rotate / zoom</button>
        <div class="partinfo hidden" id="partinfo"><button class="x" id="pix" aria-label="Close">×</button><b id="piname"></b><p id="pidesc"></p></div>
      </div>
      <p class="vhint" id="vhint"></p>
      <div class="modelnote hidden" id="modelnote"></div>
      <div class="vcontrols">
        <button id="xbtn" class="primary">💥 Explode</button>
        <span class="spacer"></span>
        <button id="lbtn" class="ghost small on" aria-pressed="true">Labels</button>
        <button id="rbtn" class="ghost small">Reset view</button>
      </div>
      <label class="xrow"><span>Assembled</span><input id="xslider" type="range" min="0" max="100" value="0" aria-label="Explode amount"><span>Exploded</span></label>
      <div class="modelmeta" id="modelmeta"></div>
    </section>

    <section class="panel explain">
      <h2>Mission explained <span class="tag">generated from API data</span></h2>
      ${sections.map((s) => `<div class="xsec"><h3>${esc(s.title)}</h3><div>${s.html}</div><div class="src">source: ${esc(s.source)}</div></div>`).join('')}
    </section>

    ${links.length ? `<section class="panel"><h2>Links</h2><div class="links">${links.map((k) => `<a href="${esc(k.u)}" target="_blank" rel="noopener noreferrer">${esc(k.t)}</a>`).join('')}</div></section>` : ''}
    <p class="recmeta">Record last updated by Launch Library 2: ${esc(l.last_updated ? clock(Date.parse(l.last_updated)) : 'n/a')} · dataset generated ${esc(state.generatedAt ? clock(state.generatedAt) : 'n/a')}</p>
    ${footer()}
  </div>`;
  applyImages(app);
  window.scrollTo(0, 0);
  mountViewer(l);
}

const coarsePointer = matchMedia('(pointer: coarse)').matches;
async function mountViewer(l) {
  const el = $('#viewer'); const token = {}; state.viewerToken = token;
  try {
    const mod = await import('./rocket3d.js');
    if (state.viewerToken !== token || !document.body.contains(el)) return;
    el.innerHTML = '';
    const pi = $('#partinfo');
    const v = mod.createViewer(el, l, {
      interactive: !coarsePointer,
      onSelect: (p) => { if (!p) { pi.classList.add('hidden'); return; } $('#piname').textContent = p.name; $('#pidesc').textContent = p.desc; pi.classList.remove('hidden'); },
    });
    state.viewer = v; window.__viewer = v;
    const ibtn = $('#ibtn'), hint = $('#vhint');
    const setI = (on) => { v.setInteractive(on); ibtn.classList.toggle('on', on); ibtn.setAttribute('aria-pressed', String(on)); ibtn.textContent = on ? '✓ Done' : '✋ Rotate / zoom';
      hint.textContent = coarsePointer ? (on ? 'Drag to rotate · pinch to zoom · tap Done to scroll the page again.' : 'Swiping here scrolls the page. Tap a part for info, or tap “Rotate / zoom” to move the model.')
        : 'Drag to rotate · Ctrl/⌘ + scroll to zoom · right-drag to pan · click a part for info.'; };
    if (coarsePointer) ibtn.onclick = () => setI(!ibtn.classList.contains('on')); else ibtn.remove();
    setI(!coarsePointer);
    const custom = v.plan.rocket !== 'generic';
    const notes = [...(v.info.notes || [])];
    if (v.plan.illustrative) notes.unshift(`Illustrative payload: the ${v.plan.illustrative} is a generic stand-in, not the real spacecraft's shape.`);
    if (v.plan.boosterNote) notes.push(`Boosters not drawn: ${v.plan.boosterNote}`);
    if (v.plan.modelNote) notes.push(v.plan.modelNote);
    if (notes.length) { const mn = $('#modelnote'); mn.innerHTML = notes.map((n) => `<p>ⓘ ${esc(n)}</p>`).join(''); mn.classList.remove('hidden'); }
    $('#modelmeta').innerHTML = `<div><b>Model:</b> ${esc(v.info.name)} ${custom ? '<span class="tag ok">custom model</span>' : '<span class="tag">generic model</span>'}</div>
      <details><summary>How this breakdown was chosen</summary><ul>${v.plan.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <p class="muted">Parts: ${v.parts.map((p) => esc(p.name)).filter((x, i, a) => a.indexOf(x) === i).join(' · ')}</p></details>`;
    const slider = $('#xslider'), xbtn = $('#xbtn');
    const sync = () => { xbtn.textContent = v.getExplode() > 0.5 ? '🧩 Assemble' : '💥 Explode'; };
    xbtn.onclick = () => { const to = v.getExplode() > 0.5 ? 0 : 1; v.setExplode(to); slider.value = to * 100; sync(); };
    slider.oninput = () => { v.setExplode(slider.value / 100); sync(); };
    $('#lbtn').onclick = (e) => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', String(on)); v.setLabels(on); };
    $('#rbtn').onclick = () => v.resetView();
    $('#pix').onclick = () => v.select(null);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="vload err">3D viewer unavailable (${esc(e.message)}). It needs WebGL; try another browser or enable hardware acceleration.</div>`;
    const ib = $('#ibtn'); ib && ib.remove();
  }
}
function disposeViewer() { if (state.viewer) { try { state.viewer.dispose(); } catch {} state.viewer = null; window.__viewer = null; } state.viewerToken = null; }

// ---------- routing & data
function route() {
  const m = /^#\/launch\/([^?]+)/.exec(location.hash);
  if (m) renderDetail(decodeURIComponent(m[1])); else renderList();
}
function onData(r) {
  const sig = (ls) => ls.map((x) => x.id + x.last_updated + x.status.abbrev).join();
  const same = state.launches.length && sig(r.launches) === sig(state.launches);
  state.launches = r.launches.slice().sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
  state.source = r.source; state.error = r.error; state.generatedAt = r.generatedAt; state.newestUpdate = r.newestUpdate;
  if (/^#\/launch\//.test(location.hash) && (same || state.viewer)) return; // don't rebuild an open detail/3D view
  route();
}
async function refresh() {
  state.loading = true; const s = $('.source'); if (s && !location.hash.startsWith('#/launch/')) s.outerHTML = sourceBadge();
  try { await loadLaunches({ onUpdate: onData }); } finally { state.loading = false; if (!location.hash.startsWith('#/launch/')) route(); }
}

// 1 s ticker only updates countdown text (cheap) and only while visible
setInterval(() => {
  if (document.hidden) return;
  const now = Date.now();
  document.querySelectorAll('[data-cd]').forEach((el) => {
    const l = state.launches.find((x) => String(x.id) === el.dataset.cd); if (!l) return;
    const c = countdown(l, now, state.generatedAt); if (el.textContent !== c.text) el.textContent = c.text;
    el.className = el.className.replace(/\b(live|soon|past|coarse|done|fail)\b/g, '').trim() + ' ' + c.cls;
    const sub = document.querySelector(`[data-cdsub="${CSS.escape(el.dataset.cd)}"]`); if (sub && sub.textContent !== (c.sub || '')) sub.textContent = c.sub || '';
  });
  if (++ticks % 30) return;
  // every 30 s: watch buttons / panel depend on time and data age (LIVE expires), so re-evaluate them
  document.querySelectorAll('.cardwrap[data-w]').forEach((w) => {
    const l = state.launches.find((x) => String(x.id) === w.dataset.w); if (!l) return;
    const old = w.querySelector('.watchbtn'), html = watchButton(l, now);
    if ((old ? old.outerHTML : '') === html) return;
    if (old) old.remove();
    if (html) w.insertAdjacentHTML('beforeend', html);
    w.classList.toggle('haswatch', !!html);
  });
  const wp = document.getElementById('watch'), dm = /^#\/launch\/([^?]+)/.exec(location.hash);
  if (wp && dm) {
    const l = state.launches.find((x) => String(x.id) === decodeURIComponent(dm[1]));
    if (l) { const t = document.createElement('div'); t.innerHTML = watchPanel(l, now).trim(); const n = t.firstElementChild; if (n && n.innerHTML !== wp.innerHTML) wp.replaceWith(n); }
  }
}, 1000);
let ticks = 0;
window.addEventListener('hashchange', route);
route();
refresh();
setInterval(() => { if (!document.hidden && !location.hash.startsWith('#/launch/')) refresh(); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.generatedAt && Date.now() - state.generatedAt > REFRESH_MS && !location.hash.startsWith('#/launch/')) refresh(); });
