// Progressive enhancements on top of app.js: search, saved launches, next-up hero, Local/UTC toggle.
import { loadLaunches } from './data.js';
import { whenLabel, isFine, isDone, period } from './when.js';

const SAVED_KEY = 'launchTracker.saved.v1';
const TZ_KEY = 'launchTracker.tz.v1';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readSaved() {
  try { return new Set((JSON.parse(localStorage.getItem(SAVED_KEY)) || []).map(String)); } catch { return new Set(); }
}
const st = { saved: readSaved(), tz: localStorage.getItem(TZ_KEY) === 'UTC' ? 'UTC' : 'local', query: '', launches: [], generatedAt: null };
const persistSaved = () => { try { localStorage.setItem(SAVED_KEY, JSON.stringify([...st.saved])); } catch {} };
const displayTz = () => (st.tz === 'UTC' ? 'UTC' : undefined);
const byId = (id) => st.launches.find((l) => String(l.id) === String(id));

function inNextDays(l, days, now = Date.now()) {
  if (isDone(l) || /flight/i.test((l.status && l.status.name) || '')) return false;
  try { const { start, end } = period(l); return end >= now && start - now <= days * 86400e3; } catch { return false; }
}

function enhanceList() {
  const app = $('#app'); if (!app || !$('.hero-head', app) || $('.toolbar', app)) return;
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ');
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `<label class="search"><span class="sr-only">Search launches</span>
      <input id="q" type="search" placeholder="Search mission, rocket, pad…" value="${esc(st.query)}" autocomplete="off" enterkeyhint="search">
    </label>
    <div class="tzseg" role="group" aria-label="Time zone">
      <button type="button" class="tzbtn${st.tz === 'local' ? ' on' : ''}" data-tz="local" aria-pressed="${st.tz === 'local'}">Local</button>
      <button type="button" class="tzbtn${st.tz === 'UTC' ? ' on' : ''}" data-tz="UTC" aria-pressed="${st.tz === 'UTC'}">UTC</button>
    </div>`;
  const chips = $('#chips', app);
  const head = $('.hero-head', app);
  head.insertAdjacentElement('afterend', toolbar);
  const sub = $('.sub', app);
  if (sub) sub.innerHTML = `Orbital launches from every provider · times in <b>${esc(st.tz === 'UTC' ? 'UTC' : tzName)}</b>`;

  const upcoming = st.launches.filter((l) => !isDone(l) && !/flight/i.test((l.status && l.status.name) || ''));
  const next = upcoming[0];
  if (next && !st.query && chips) {
    const weekN = st.launches.filter((x) => inNextDays(x, 7)).length;
    const cd = document.querySelector(`[data-cd="${CSS.escape(String(next.id))}"]`);
    const hero = document.createElement('a');
    hero.className = 'nextup';
    hero.href = `#/launch/${encodeURIComponent(next.id)}`;
    hero.innerHTML = `<div class="nu-kicker">Next launch${weekN > 1 ? ` · ${weekN} this week` : ''}</div>
      <div class="rocket">${esc(next.rocket.full_name || next.rocket.name)}</div>
      <div class="mission">${esc(next.mission ? next.mission.name : next.name)}</div>
      <div class="cd ${(cd && cd.className) || ''}" data-cd="${esc(next.id)}">${esc(cd ? cd.textContent : '')}</div>
      <div class="when">${esc(whenLabel(next, displayTz()))}</div>
      <div class="pad">📍 ${esc([next.pad.name, next.pad.location].filter(Boolean).join(' · '))}</div>`;
    chips.insertAdjacentElement('beforebegin', hero);
  }

  if (chips && !chips.querySelector('[data-f="saved"]')) {
    const n = st.launches.filter((l) => st.saved.has(String(l.id))).length;
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.f = 'saved';
    b.innerHTML = `Saved <span>${n}</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.cardwrap[data-w]').forEach((w) => {
        w.style.display = st.saved.has(w.dataset.w) ? '' : 'none';
      });
      chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
    });
    chips.insertBefore(b, chips.children[1] || null);
  }

  document.querySelectorAll('.cardwrap[data-w]').forEach((w) => {
    if (w.querySelector('.savebtn')) return;
    const id = w.dataset.w, on = st.saved.has(id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'savebtn' + (on ? ' on' : '');
    btn.dataset.save = id;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Remove from saved' : 'Save launch');
    btn.textContent = on ? '★' : '☆';
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (st.saved.has(id)) st.saved.delete(id); else st.saved.add(id);
      persistSaved();
      const nowOn = st.saved.has(id);
      btn.classList.toggle('on', nowOn);
      btn.textContent = nowOn ? '★' : '☆';
      const chip = chips && chips.querySelector('[data-f="saved"] span');
      if (chip) chip.textContent = String(st.launches.filter((l) => st.saved.has(String(l.id))).length);
    });
    w.appendChild(btn);
  });

  const q = $('#q', app);
  if (q) {
    q.value = st.query;
    q.addEventListener('input', () => {
      st.query = q.value;
      const words = st.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      document.querySelectorAll('.cardwrap[data-w]').forEach((w) => {
        const hay = (w.textContent || '').toLowerCase();
        w.style.display = !words.length || words.every((x) => hay.includes(x)) ? '' : 'none';
      });
      const hero = $('.nextup', app);
      if (hero) hero.style.display = words.length ? 'none' : '';
    });
  }
  document.querySelectorAll('.tzbtn').forEach((b) => {
    b.addEventListener('click', () => {
      st.tz = b.dataset.tz;
      try { localStorage.setItem(TZ_KEY, st.tz); } catch {}
      applyTimes();
      document.querySelectorAll('.tzbtn').forEach((x) => {
        const on = x.dataset.tz === st.tz;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', String(on));
      });
      if (sub) sub.innerHTML = `Orbital launches from every provider · times in <b>${esc(st.tz === 'UTC' ? 'UTC' : tzName)}</b>`;
    });
  });
  applyTimes();
}

function enhanceDetail() {
  const det = $('.detail'); if (!det || $('.detailbar', det)) return;
  const m = /^#\/launch\/([^?]+)/.exec(location.hash); if (!m) return;
  const id = decodeURIComponent(m[1]);
  const back = $('.back', det); if (!back) return;
  const bar = document.createElement('div');
  bar.className = 'detailbar';
  back.replaceWith(bar);
  bar.appendChild(back);
  const on = st.saved.has(id);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'savebtn' + (on ? ' on' : '');
  btn.textContent = on ? '★' : '☆';
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Remove from saved' : 'Save launch');
  btn.addEventListener('click', () => {
    if (st.saved.has(id)) st.saved.delete(id); else st.saved.add(id);
    persistSaved();
    const nowOn = st.saved.has(id);
    btn.classList.toggle('on', nowOn);
    btn.textContent = nowOn ? '★' : '☆';
  });
  bar.appendChild(btn);
  applyTimes();
}

function applyTimes() {
  document.querySelectorAll('[data-cd]').forEach((el) => {
    const l = byId(el.dataset.cd); if (!l) return;
    const when = el.parentElement && el.parentElement.querySelector('.when');
    if (when && !isDone(l)) when.textContent = (isFine(l) ? '🕒 ' : '') + whenLabel(l, displayTz());
  });
}

function tick() {
  if ($('.hero-head') && !$('.toolbar')) enhanceList();
  if ($('.detail') && !$('.detailbar')) enhanceDetail();
}

loadLaunches({ onUpdate: (r) => { st.launches = r.launches || []; st.generatedAt = r.generatedAt; tick(); } });
const app = $('#app');
if (app) new MutationObserver(() => tick()).observe(app, { childList: true, subtree: false });
window.addEventListener('hashchange', () => setTimeout(tick, 0));
setTimeout(tick, 200);
