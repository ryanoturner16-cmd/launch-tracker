// Shared Starship / Super Heavy geometry, used by BOTH the tracker's 3D model (js/starship-detailed.js)
// and the full-screen deep dive (js/starship/main.js). Originally from the Starship Explorer project.
//
// Accuracy notes: on BOTH stages the LOX tank is BELOW the methane tank. Tank heights are estimates from
// propellant volumes. The V3 variant changes only what is publicly documented and visible: 3 grid fins
// (~50% larger, mounted lower) and a hot-stage section integrated into the booster. Everything else
// (tank split, plumbing, ship, overall height) is drawn with Block 2 geometry.
import * as THREE from '../vendor/three/three.module.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';

export const R = 4.5, PI = Math.PI;
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const V2 = (x, y) => new THREE.Vector2(x, y);
export const UP = V(0, 1, 0);
export const polar = (r, az, y) => V(r * Math.sin(az), y, r * Math.cos(az));
export function makeRnd(seed = 1337) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- stations (metres from booster base)
export const ST = {
  b: { skirt0: 2.2, lox0: 8.5, ch40: 43.5, fwd0: 66, top: 69, hsr1: 71 },
  s: { aft0: 71, lox0: 77.5, ch40: 93, bay0: 104, nose0: 112, noseL: 11.2, top: 123.3 },
};
export const HEIGHT = 123.3;

// ---------------------------------------------------------------- variants
export const VARIANTS = {
  2: { v: 2, name: 'Block 2', fins: 4, finScale: 1, finY: 67.3, finAz0: PI / 4, hsIntegrated: false },
  // V3: 3 fins ~50% larger (≈ ×1.22 per side) mounted lower (in pockets on the methane tank, approx. position),
  // vented hot-stage section integrated into the booster (not jettisoned).
  3: { v: 3, name: 'V3 (Block 3)', fins: 3, finScale: 1.22, finY: 63.2, finAz0: PI / 3, hsIntegrated: true },
};
export const variantSpec = (v) => VARIANTS[v === 2 ? 2 : 3];

// ---------------------------------------------------------------- textures
export const TILE_W = 0.62, TILE_R = TILE_W / Math.sqrt(3), TILE_PX = 8 * TILE_W, TILE_PY = 8 * 1.5 * TILE_R;
function canvasTex(w, h, draw, srgb, aniso) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t;
}
/** Procedural textures (steel, hex tiles, regen-cooled nozzle, grid-fin lattice). */
export function makeTextures(aniso = 4, rnd = makeRnd(1337)) {
  return {
    canvasTex: (w, h, draw, srgb = true) => canvasTex(w, h, draw, srgb, aniso),
    steel: canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#b4b9c0'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) { const x = rnd() * w; g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '60,64,70'},${0.03 + rnd() * 0.06})`; g.fillRect(x, 0, 1 + rnd() * 2, h); }
      for (let k = 0; k < 4; k++) { const y = (k * h) / 4; g.fillStyle = 'rgba(40,42,48,0.55)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, y + 3, w, 1);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(150,110,70,${rnd() * 0.08})`; g.fillRect(rnd() * w, y - 6 + rnd() * 12, 10 + rnd() * 30, 2); } }
    }, true, aniso),
    tile: canvasTex(512, 444, (g, w, h) => {
      g.fillStyle = '#060708'; g.fillRect(0, 0, w, h);
      const r = w / (8 * Math.sqrt(3)), dx = Math.sqrt(3) * r, dy = 1.5 * r;
      for (let j = -1; j <= 9; j++) for (let i = -1; i <= 9; i++) {
        const cx = i * dx + (j & 1 ? dx / 2 : 0), cy = j * dy, jj = ((j % 8) + 8) % 8, ii = ((i % 8) + 8) % 8;
        const hsh = Math.sin(ii * 12.9898 + jj * 78.233) * 43758.5453, f = hsh - Math.floor(hsh), v = 18 + Math.floor(f * 16) + (f > 0.96 ? 40 : 0);
        g.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = PI / 6 + (k * PI) / 3; g.lineTo(cx + (r - 1.6) * Math.cos(a), cy + (r - 1.6) * Math.sin(a)); } g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.arc(cx - r * 0.2, cy - r * 0.25, r * 0.35, 0, PI * 2); g.fill();
      }
    }, true, aniso),
    regen: canvasTex(512, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#5a5e66'); gr.addColorStop(0.55, '#7b6d63'); gr.addColorStop(0.85, '#b87a4b'); gr.addColorStop(1, '#c9844f');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) { const x = (i * w) / 160; g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 1.2, h); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 1.2, 0, 0.8, h); }
      g.fillStyle = 'rgba(30,30,34,0.6)'; g.fillRect(0, 4, w, 5);
    }, true, aniso),
    lattice: canvasTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 9;
      for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(i * 36, 0); g.lineTo(i * 36 + h, h); g.stroke(); g.beginPath(); g.moveTo(i * 36 + h, 0); g.lineTo(i * 36, h); g.stroke(); }
      g.lineWidth = 20; g.strokeRect(0, 0, w, h);
    }, false, aniso),
  };
}

// ---------------------------------------------------------------- geometry helpers
export function domeGeo(yRim, depth, r, up, seg = 48) { const pts = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * PI / 2; pts.push(V2(Math.max(r * Math.sin(a), 0.001), yRim + (up ? 1 : -1) * depth * Math.cos(a))); } return new THREE.LatheGeometry(pts, seg); }
export function tankGeo(r, yB, dB, yT, dT, topUp) {
  const pts = [];
  for (let i = 0; i <= 14; i++) { const a = (i / 14) * PI / 2; pts.push(V2(Math.max(r * Math.sin(a), 0.001), yB - dB * Math.cos(a))); }
  for (let i = 14; i >= 0; i--) { const a = (i / 14) * PI / 2; pts.push(V2(Math.max(r * Math.sin(a), 0.001), yT + (topUp ? 1 : -1) * dT * Math.cos(a))); }
  return new THREE.LatheGeometry(pts, 48);
}
export function capsuleGeo(r, y0, y1, seg = 32) {
  const pts = [], cap = Math.min(r, (y1 - y0) / 2);
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * PI / 2; pts.push(V2(Math.max(r * Math.sin(a), 0.001), y0 + cap - cap * Math.cos(a))); }
  for (let i = 8; i >= 0; i--) { const a = (i / 8) * PI / 2; pts.push(V2(Math.max(r * Math.sin(a), 0.001), y1 - cap + cap * Math.cos(a))); }
  return new THREE.LatheGeometry(pts, seg);
}
export function cylBetween(a, b, r, seg = 10) {
  const d = b.clone().sub(a), len = d.length(); if (len < 1e-4) return null;
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g;
}
export function bellPts(re, rt, yT, rc, yTop, n = 14) {
  const pts = []; for (let i = 0; i <= n; i++) { const u = 1 - i / n; pts.push(V2(rt + (re - rt) * Math.sqrt(u), yT - u * yT)); }
  pts.push(V2(rt * 1.08, yT + 0.08), V2(rc * 0.85, yT + 0.2), V2(rc, yT + 0.3), V2(rc, yTop - 0.08), V2(rc * 0.7, yTop), V2(0.001, yTop + 0.02)); return pts;
}
export function headGeo(y0, big = 1) {
  const parts = []; const put = (g, x, y, z) => { g.translate(x, y, z); parts.push(g.toNonIndexed()); };
  put(new THREE.CylinderGeometry(0.17 * big, 0.17 * big, 0.55, 12), -0.34 * big, y0 + 0.35, 0);
  put(new THREE.CylinderGeometry(0.15 * big, 0.15 * big, 0.5, 12), 0.34 * big, y0 + 0.32, 0);
  put(new THREE.CylinderGeometry(0.3, 0.26, 0.28, 14), 0, y0 + 0.14, 0);
  put(new THREE.CylinderGeometry(0.08, 0.2, 0.3, 10), 0, y0 + 0.5, 0);
  put(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), 0, y0 + 0.45, 0.22);
  return mergeGeometries(parts);
}
export const SL = { re: 0.64, rt: 0.18, yT: 1.55, rc: 0.3, yTop: 2.45 };
export function engineGeos() {
  return {
    bellSL: new THREE.LatheGeometry(bellPts(SL.re, SL.rt, SL.yT, SL.rc, SL.yTop), 20), headSL: headGeo(SL.yTop),
    bellRV: new THREE.LatheGeometry(bellPts(1.15, 0.18, 2.95, 0.3, 3.85, 18), 28), headRV: headGeo(3.85),
  };
}
/** 33 booster engines: 3 center + 10 inner ring (gimbaled) + 20 outer (fixed). */
export function boosterEngineLayout() {
  const a = [];
  for (let i = 0; i < 3; i++) a.push({ p: polar(0.95, (i / 3) * PI * 2 + PI / 6, 0), rot: (i / 3) * PI * 2, info: 'e_center', tint: 0xffffff });
  for (let i = 0; i < 10; i++) a.push({ p: polar(2.6, (i / 10) * PI * 2, 0), rot: (i / 10) * PI * 2, info: 'e_inner', tint: 0xffffff });
  for (let i = 0; i < 20; i++) a.push({ p: polar(3.92, (i / 20) * PI * 2 + PI / 20, 0), rot: (i / 20) * PI * 2, info: 'e_outer', tint: 0xc9d2de });
  return a;
}
export function shipEngineLayout() {
  const sl = [], rv = [];
  for (let i = 0; i < 3; i++) sl.push({ p: polar(1.05, (i / 3) * PI * 2, 72.55), rot: (i / 3) * PI * 2, info: 'e_sl' });
  for (let i = 0; i < 3; i++) rv.push({ p: polar(3.05, (i / 3) * PI * 2 + PI / 3, 71.3), rot: (i / 3) * PI * 2 + PI / 3, info: 'e_rvac' });
  return { sl, rv };
}
/** Ogive nose profile points + radius function. */
export function nose() {
  const L = ST.s.noseL, yb = ST.s.nose0, rho = (R * R + L * L) / (2 * R);
  const og = (x) => Math.sqrt(rho * rho - (L - x) * (L - x)) + R - rho;
  const pts = []; for (let i = 0; i <= 28; i++) { const x = L - (i / 28) * (L - 0.45); pts.push(V2(og(x), yb + (L - x))); }
  const rt = og(0.45), yt = yb + L - 0.45; for (let i = 1; i <= 6; i++) { const a = (i / 6) * PI / 2; pts.push(V2(Math.max(rt * Math.cos(a), 0.001), yt + 0.42 * Math.sin(a))); }
  return { pts, og, L, yb };
}
export const chineShape = () => { const sh = new THREE.Shape(); sh.moveTo(-0.9, 0); sh.lineTo(0.9, 0); sh.lineTo(0.25, 0.55); sh.lineTo(-0.25, 0.55); sh.closePath(); return sh; };

/** Grid fins for a variant. Returns [{group, meshes}] positioned in booster coordinates. */
export function gridFins(spec, frameMat, latMat) {
  const out = [], k = spec.finScale;
  for (let i = 0; i < spec.fins; i++) {
    const az = spec.finAz0 + (i * PI * 2) / spec.fins, g = new THREE.Group();
    const fin = new THREE.Mesh(new THREE.BoxGeometry(3.0 * k, 0.9 * k, 3.4 * k), [frameMat, frameMat, latMat, latMat, frameMat, frameMat]); g.add(fin);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4 * k, 1.2 * k), frameMat); hub.position.set(-1.5 * k - 0.2, 0, 0); g.add(hub);
    if (spec.hsIntegrated) { // V3: fins sit in shallow pockets on the tank wall (drawn as a dark recess plate)
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2 * k, 2.4 * k), new THREE.MeshStandardMaterial({ color: 0x3a3e45, metalness: 0.7, roughness: 0.5 }));
      pocket.position.set(-1.5 * k - 0.62, 0, 0); g.add(pocket);
    }
    g.position.copy(polar(R + 1.5 * k + 0.25, az, spec.finY)); g.rotation.y = az - PI / 2;
    out.push(g);
  }
  return out;
}
/** Vented hot-staging ring (Block 1/2: separate, jettisonable) or integrated vented section (V3). */
export function hotStage(spec, { steel, post, back, shield, band }) {
  const g = new THREE.Group();
  const rimG = new THREE.CylinderGeometry(R, R, 0.25, 72, 1, true);
  for (const y of [69.12, 70.88]) { const m = new THREE.Mesh(rimG, steel); m.position.y = y; g.add(m); }
  const n = spec.hsIntegrated ? 48 : 36; // V3 has "a lot more vent area" (SpaceX); vent count here is illustrative
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(spec.hsIntegrated ? 0.36 : 0.55, 1.55, 0.14), post, n);
  for (let i = 0; i < n; i++) { const az = (i / n) * PI * 2; const mt = new THREE.Matrix4().compose(polar(R - 0.05, az, 70), new THREE.Quaternion().setFromAxisAngle(UP, az), V(1, 1, 1)); mt.multiply(new THREE.Matrix4().makeRotationZ(0.35)); posts.setMatrixAt(i, mt); }
  posts.computeBoundingBox?.(); g.add(posts);
  const bk = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.5, R - 0.5, 1.6, 48, 1, true), back); bk.position.y = 70; g.add(bk);
  g.add(new THREE.Mesh(domeGeo(69.0, 0.9, R - 0.2, true), shield));
  if (spec.hsIntegrated && band) { // continuous steel band tying the vent section to the booster barrel
    const b = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.35, 72, 1, true), band); b.position.y = 68.9; g.add(b);
  }
  return g;
}
