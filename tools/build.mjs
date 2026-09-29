#!/usr/bin/env node
// Production build: copies ONLY the deployable app into dist/ (index.html, starship.html, css/, js/, data/).
// No tools, dev harness, screenshots, backups, node_modules or README end up in dist/. Deploy dist/ and nothing else.
// Usage: node tools/build.mjs
import { rmSync, mkdirSync, cpSync, readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'data'), { recursive: true });
for (const f of ['index.html', 'starship.html']) cpSync(join(root, f), join(dist, f));
cpSync(join(root, 'css'), join(dist, 'css'), { recursive: true });
cpSync(join(root, 'js'), join(dist, 'js'), { recursive: true });
if (!existsSync(join(root, 'data/launches.json'))) throw new Error('data/launches.json missing: run node tools/fetch-launches.mjs first');
cpSync(join(root, 'data/launches.json'), join(dist, 'data/launches.json'));

// ---- checks
const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } }; walk(dist);
const problems = [];
for (const f of files) {
  const rel = relative(dist, f);
  if (!/^(index\.html|starship\.html|css\/|js\/|data\/)/.test(rel)) problems.push(`unexpected file ${rel}`);
  if (/\.(html|js|css)$/.test(f)) {
    const t = readFileSync(f, 'utf8');
    if (/ll(dev)?\.thespacedevs\.com/.test(t)) problems.push(`${rel} references the LL2 API host`);
    if (/cdn\.jsdelivr|unpkg\.com|cdnjs/.test(t)) problems.push(`${rel} references a CDN`);
    if (/\.html$/.test(f)) {
      if (!/http-equiv="Content-Security-Policy"/.test(t)) problems.push(`${rel} has no CSP meta tag`);
      if (/\sstyle="/.test(t) || /<script>(?!<\/script>)/.test(t) || /<style>/.test(t)) problems.push(`${rel} has inline script/style (blocked by CSP)`);
    }
  }
}
const size = files.reduce((a, f) => a + statSync(f).size, 0);
const dataSize = statSync(join(dist, 'data/launches.json')).size;
console.log(`dist/: ${files.length} files, ${(size / 1024).toFixed(0)} KB total; data/launches.json ${(dataSize / 1024).toFixed(1)} KB`);
for (const f of files) console.log('  ' + relative(dist, f).padEnd(48) + (statSync(f).size / 1024).toFixed(1).padStart(8) + ' KB');
if (dataSize > 100 * 1024) problems.push('data/launches.json is over 100 KB');
if (problems.length) { console.error('BUILD CHECKS FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('checks passed: no LL2/CDN references, CSP present, no inline script/style, only allowed paths');
