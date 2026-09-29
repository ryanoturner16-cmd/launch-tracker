// Client data layer. The app ONLY reads data/launches.json from its own origin; that file is produced
// server-side by tools/fetch-launches.mjs on a schedule. Browsers never call Launch Library 2 directly.
//
// Freshness rules:
//  * The dataset timestamp is `generated_at` inside the file (when the server fetched LL2), never the
//    browser's fetch time, so the "data age" shown is honest even when served from a CDN/cache.
//  * localStorage keeps the last good dataset. When a new file arrives we keep, per launch, whichever record
//    has the newest `last_updated`, and the newest dataset decides which launches are listed. An older file
//    (e.g. a stale CDN edge) can never overwrite newer data.

const CACHE_KEY = 'launchTracker.data.v2';
export const REFRESH_MS = 5 * 60 * 1000;   // re-read the static file every 5 min while visible (cheap, same origin)
export const STALE_MS = 2 * 60 * 60 * 1000; // warn when the data is older than 2 h

function readCache() {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY)); return c && Array.isArray(c.launches) && c.generated_at ? c : null; } catch { return null; }
}
function writeCache(c) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* quota/private mode: ignore */ } }
const ts = (s) => Date.parse(s || '') || 0;

/** Merge two datasets; returns the combined dataset (pure). */
export function mergeDatasets(a, b) {
  if (!a) return b; if (!b) return a;
  const [older, newer] = ts(a.generated_at) <= ts(b.generated_at) ? [a, b] : [b, a];
  const oldById = new Map(older.launches.map((l) => [l.id, l]));
  const launches = newer.launches.map((l) => { const o = oldById.get(l.id); return o && ts(o.last_updated) > ts(l.last_updated) ? o : l; });
  return { ...newer, launches };
}

async function fetchDataset() {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch('data/launches.json', { cache: 'no-cache', signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (!j || !Array.isArray(j.launches) || !j.generated_at) throw new Error('unexpected file format');
    return j;
  } catch (e) { throw e.name === 'AbortError' ? new Error('timed out') : e; } finally { clearTimeout(t); }
}

/**
 * Load launches. onUpdate(result) may fire twice: cached data immediately, then the merged fresh data.
 * result = { launches, generatedAt (ms), newestUpdate (ms), source: 'file'|'cache'|'none', error }
 */
export async function loadLaunches({ onUpdate } = {}) {
  const cache = readCache();
  const shape = (d, source, error) => ({ launches: d ? d.launches : [], generatedAt: d ? ts(d.generated_at) : null,
    newestUpdate: d ? Math.max(0, ...d.launches.map((l) => ts(l.last_updated))) : null, source, error: error || null });
  if (cache && onUpdate) onUpdate(shape(cache, 'cache'));
  try {
    const fresh = await fetchDataset();
    const merged = mergeDatasets(cache, fresh);
    writeCache(merged);
    const r = shape(merged, merged === cache ? 'cache' : 'file');
    onUpdate && onUpdate(r); return r;
  } catch (e) {
    const r = shape(cache, cache ? 'cache' : 'none', e.message);
    onUpdate && onUpdate(r); return r;
  }
}
