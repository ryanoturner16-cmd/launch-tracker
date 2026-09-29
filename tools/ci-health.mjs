#!/usr/bin/env node
// Final CI step: runs AFTER the deploy step, so whatever usable data we had has already been published.
// Fails the job (-> GitHub's failed-workflow email) when something needs a human:
//   - the fetch script crashed / exited with an unexpected code (1 or anything other than 0, 2, 3)
//   - nothing could be deployed (fetch failed and the published copy could not be restored)
//   - data/launches.json generated_at is missing or older than MAX_AGE_H (default 3 h): LL2 has failed for hours
// env: FETCH_CODE, DEPLOY (from ci-refresh.sh outputs), DATA_FILE (default data/launches.json),
//      MAX_AGE_H (default 3), NOW (ISO, tests only)
import { readFileSync } from 'node:fs';
const file = process.env.DATA_FILE || 'data/launches.json';
const maxH = Number(process.env.MAX_AGE_H || 3);
const now = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
const code = String(process.env.FETCH_CODE ?? '').trim(), deploy = String(process.env.DEPLOY ?? '').trim();
const problems = [];
if (!['0', '2', '3'].includes(code)) problems.push(`fetch-launches.mjs exited with ${code || '(no code)'} (crash or unexpected error)`);
if (deploy !== 'true') problems.push('nothing was deployed (LL2 fetch failed and the published data could not be restored)');
let ageH = null;
try {
  const g = Date.parse(JSON.parse(readFileSync(file, 'utf8')).generated_at);
  if (Number.isNaN(g)) throw new Error('no valid generated_at');
  ageH = (now - g) / 3600e3;
  if (ageH > maxH) problems.push(`launch data is ${ageH.toFixed(1)} h old (limit ${maxH} h): the LL2 fetch has been failing`);
} catch (e) { problems.push(`${file} unreadable: ${e.message.slice(0, 80)}`); }
if (problems.length) {
  for (const p of problems) console.log(`::error::${p}`);
  process.exit(1);
}
console.log(`healthy: fetch exit ${code}, deployed, data ${ageH.toFixed(2)} h old`);
