#!/usr/bin/env node
// Validate a launches.json candidate (e.g. the last published copy downloaded by CI).
// usage: node tools/check-data.mjs <candidate.json> [current.json]
// exit 0 = candidate is valid launch data (and not older than current, if given); 1 = reject.
import { readFileSync, existsSync } from 'node:fs';
function load(p) {
  let d;
  try { d = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new Error(`not JSON (${e.message.slice(0, 60)})`); }
  if (!d || typeof d !== 'object' || !Array.isArray(d.launches)) throw new Error('no launches array');
  if (Number.isNaN(Date.parse(d.generated_at))) throw new Error('no valid generated_at');
  if (!d.launches.every((l) => l && l.id && !Number.isNaN(Date.parse(l.net)))) throw new Error('launch without id/net');
  return d;
}
const [cand, cur] = process.argv.slice(2);
try {
  const c = load(cand);
  if (cur && existsSync(cur)) {
    let k = null; try { k = load(cur); } catch { /* current unreadable: any valid candidate wins */ }
    if (k && Date.parse(c.generated_at) < Date.parse(k.generated_at)) { console.error(`reject: candidate (${c.generated_at}) older than current (${k.generated_at})`); process.exit(1); }
  }
  console.log(`ok: ${c.launches.length} launches, generated_at ${c.generated_at}`);
} catch (e) { console.error(`reject: ${e.message}`); process.exit(1); }
