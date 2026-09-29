// Starship deep dive (merged from the Starship Explorer project into Launch Tracker).
// Shares the three.js copy (js/vendor/three) and the Starship geometry module (./geometry.js) with the tracker's in-page model.
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { INFO as INFO_BASE, INFO_V3 } from './info.js';
import { R, PI, V, V2, UP, polar, makeRnd, makeTextures, TILE_W, TILE_R, TILE_PX, TILE_PY, domeGeo, tankGeo, capsuleGeo, cylBetween, bellPts, headGeo, SL,
  boosterEngineLayout, shipEngineLayout, chineShape, gridFins, hotStage, variantSpec } from './geometry.js';

const $ = (s) => document.querySelector(s);
const rnd = makeRnd(1337);
// ?v=2 shows the retired Block 2 vehicle; default (or ?v=3) shows the V3 approximation.
const QS = new URLSearchParams(location.search);
const SPEC = variantSpec(QS.get('v') === '2' ? 2 : 3);
const IS_V3 = SPEC.v === 3;
const INFO = IS_V3 ? { ...INFO_BASE, ...INFO_V3 } : INFO_BASE;
// back link is set by boot.js (works without WebGL too)

// ============================================================ renderer
const canvas = $('#c');
// Friendly message (instead of a raw error box) when WebGL is missing/disabled.
class NoWebGL extends Error { constructor(m) { super(m); this.name = 'NoWebGL'; } }
function failNoGL(detail) { if (window.__showNoGL) window.__showNoGL(detail); else document.body.textContent = '3D view unavailable: WebGL is not supported in this browser.'; throw new NoWebGL('WebGL unavailable: ' + detail); }
{
  let ok = false;
  try { const t = document.createElement('canvas'); ok = !!(window.WebGLRenderingContext && (t.getContext('webgl2') || t.getContext('webgl'))); } catch (e) { ok = false; }
  if (!ok) failNoGL('This browser did not provide a WebGL context.');
}
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch (e) { failNoGL((e && e.message) || String(e)); }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 8000);
// Environment map (image-based lighting for the steel). It lives in a GPU render target, so it must be
// regenerated after a WebGL context loss/restore — otherwise metal surfaces render almost black.
let envRT = null;
function buildEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const rt = pmrem.fromScene(room, 0.04);
  pmrem.dispose();
  room.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach((m) => m.dispose()); } });
  if (envRT) envRT.dispose();
  envRT = rt; scene.environment = rt.texture;
}
buildEnvironment();
scene.environmentIntensity = 0.55;
let ctxLost = false;

const sun = new THREE.DirectionalLight(0xfff4e6, 2.0); sun.position.set(60, 90, 80); scene.add(sun);
const rim = new THREE.DirectionalLight(0x7fb0ff, 1.2); rim.position.set(-80, 30, -60); scene.add(rim);
scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x201810, 0.55));

// stars
let stars;
{
  const n = 1800, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, th = rnd() * PI * 2, s = Math.sqrt(1 - u * u);
    p.set([2500 * s * Math.cos(th), 2500 * u, 2500 * s * Math.sin(th)], i * 3);
    const b = 0.35 + rnd() * 0.65, w = rnd();
    c.set([b * (w > 0.8 ? 0.8 : 1), b * 0.95, b * (w < 0.2 ? 0.8 : 1)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  stars.raycast = () => {}; stars.frustumCulled = false; scene.add(stars);
}

// ============================================================ textures
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const TXS = makeTextures(aniso, rnd);
const canvasTex = TXS.canvasTex;
const steelTex = TXS.steel, tileTex = TXS.tile, regenTex = TXS.regen, latticeTex = TXS.lattice;
const plumeTex = canvasTex(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(255,236,190,0.95)'); gr.addColorStop(0.35, 'rgba(255,150,60,0.55)'); gr.addColorStop(0.75, 'rgba(255,90,40,0.15)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const dotTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
// ============================================================ materials & registries
const clipPlane = new THREE.Plane(V(0, 0, -1), 1e6);
const clipList = [clipPlane];
const infoMeshes = {};
const systems = {};
const skinMats = [];
const pipeMats = [];
function M(p, clip = false) { const m = new THREE.MeshStandardMaterial(p); if (clip) m.clippingPlanes = clipList; return m; }
function steelMat(h, circ = 2 * PI * R, clip = true) { const t = steelTex.clone(); t.repeat.set(Math.max(1, Math.round(circ / 7)), h / 7.32); return M({ map: t, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide }, clip); }
function tileMat(rx, ry) { const t = tileTex.clone(); t.repeat.set(rx, ry); return M({ map: t, metalness: 0.05, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, true); }
function reg(mesh, key, sys, flags = {}) {
  mesh.userData.info = key; (infoMeshes[key] ||= []).push(mesh);
  if (sys) (systems[sys] ||= []).push(mesh);
  if (flags.skin) { mesh.userData.skin = true; for (const m of [].concat(mesh.material)) if (!skinMats.includes(m)) skinMats.push(m); }
  if (flags.clip) mesh.userData.clip = true;
  return mesh;
}

// ============================================================ sections (for exploded view)
const root = new THREE.Group(); scene.add(root);
const boosterG = new THREE.Group(), shipG = new THREE.Group(); root.add(boosterG, shipG);
const SHIP_OFF = 26;
const SECT = [
  { id: 'B_eng', st: 'b', y0: -60, y1: 6.7, off: -10 },
  { id: 'B_lox', st: 'b', y0: 6.7, y1: 41.7, off: 0 },
  { id: 'B_ch4', st: 'b', y0: 41.7, y1: 66, off: 7 },
  { id: 'B_fwd', st: 'b', y0: 66, y1: 69, off: 12 },
  { id: 'HSR', st: 'b', y0: 69, y1: 71, off: 17 },
  { id: 'S_aft', st: 's', y0: 71, y1: 76, off: 0 },
  { id: 'S_lox', st: 's', y0: 76, y1: 91.5, off: 5 },
  { id: 'S_ch4', st: 's', y0: 91.5, y1: 104, off: 10 },
  { id: 'S_bay', st: 's', y0: 104, y1: 112, off: 15 },
  { id: 'S_nose', st: 's', y0: 112, y1: 400, off: 20 },
];
const S = {};
for (const s of SECT) { s.g = new THREE.Group(); (s.st === 'b' ? boosterG : shipG).add(s.g); S[s.id] = s; }
const secAt = (y) => { for (const s of SECT) if (y < s.y1) return s; return SECT[SECT.length - 1]; };
let explode = 0;
const offAt = (y) => { const s = secAt(y); return (s.off + (s.st === 's' ? SHIP_OFF : 0)) * explode; };
function add(secId, obj) { S[secId].g.add(obj); return obj; }

// ---------------- pipes (split at section boundaries, merged per section+info)
const buckets = new Map();
function bucket(secId, info, mat, sys) { const k = secId + '|' + info + '|' + mat.uuid; if (!buckets.has(k)) buckets.set(k, { secId, info, mat, sys, geoms: [] }); return buckets.get(k); }
function addPipe(pts, r, info, mat, sys = 'plumbing') {
  const bounds = SECT.map((s) => s.y1);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const cuts = [0, 1];
    for (const y of bounds) { if ((y - a.y) * (y - b.y) < 0) cuts.push((y - a.y) / (b.y - a.y)); }
    cuts.sort((x, y) => x - y);
    for (let k = 0; k < cuts.length - 1; k++) {
      const p = a.clone().lerp(b, cuts[k]), q = a.clone().lerp(b, cuts[k + 1]);
      const g = cylBetween(p, q, r); if (g) bucket(secAt((p.y + q.y) / 2).id, info, mat, sys).geoms.push(g);
    }
    if (i > 0) { const s = new THREE.SphereGeometry(r * 1.02, 10, 6); s.translate(a.x, a.y, a.z); bucket(secAt(a.y).id, info, mat, sys).geoms.push(s); }
  }
}
function flushPipes() {
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.geoms), b.mat); add(b.secId, m); reg(m, b.info, b.sys);
  }
  buckets.clear();
}
const pipeMat = (hex) => { const m = M({ color: hex, metalness: 0.7, roughness: 0.35, transparent: true, opacity: 1 }); pipeMats.push(m); return m; };
const matCH4pipe = pipeMat(0xe0a060), matLOXpipe = pipeMat(0x8fc4ee), matStruct = M({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.4 });

// generic geometry helpers (domeGeo, tankGeo, capsuleGeo, cylBetween, bellPts, headGeo) come from ./geometry.js
const LOXC = 0x2f9bff, CH4C = 0xff8a1f;
const propMat = (hex, op = 0.36) => M({ color: hex, emissive: hex, emissiveIntensity: 0.28, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, roughness: 0.25, metalness: 0 }, true);
function skinCyl(secId, y0, y1, info, r = R) {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 72, 1, true); g.translate(0, (y0 + y1) / 2, 0);
  return reg(add(secId, new THREE.Mesh(g, steelMat(y1 - y0))), info, 'skin', { skin: true });
}
function tiles(secId, y0, y1, info = 's_tiles', r = R * 1.006) {
  const L = 1.12 * PI; const g = new THREE.CylinderGeometry(r, r, y1 - y0, 48, 1, true, -L / 2, L); g.translate(0, (y0 + y1) / 2, 0);
  return reg(add(secId, new THREE.Mesh(g, tileMat((L * r) / TILE_PX, (y1 - y0) / TILE_PY))), info, 'heat', { skin: true });
}
function rings(secId, y0, y1, info, step = 1.83) {
  const ys = []; for (let y = y0 + step; y < y1 - 0.2; y += step) ys.push(y);
  const geo = new THREE.TorusGeometry(R - 0.06, 0.07, 4, 72); geo.rotateX(PI / 2);
  const m = new THREE.InstancedMesh(geo, M({ color: 0xb8bec6, metalness: 0.85, roughness: 0.35 }, true), ys.length);
  ys.forEach((y, i) => m.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0, y, 0)));
  return reg(add(secId, m), info, 'structure');
}
function stringers(secId, y0, y1, n, info) {
  const geo = new THREE.BoxGeometry(0.1, y1 - y0, 0.16); geo.translate(0, (y0 + y1) / 2, R - 0.12);
  const m = new THREE.InstancedMesh(geo, M({ color: 0xa9b0b8, metalness: 0.8, roughness: 0.4 }, true), n);
  for (let i = 0; i < n; i++) m.setMatrixAt(i, new THREE.Matrix4().makeRotationY((i / n) * PI * 2));
  return reg(add(secId, m), info, 'structure');
}

// ---------------- Raptor (vehicle-scale, simplified) geometries
const bellSL = new THREE.LatheGeometry(bellPts(SL.re, SL.rt, SL.yT, SL.rc, SL.yTop), 20);
const headSL = headGeo(SL.yTop);
const bellRV = new THREE.LatheGeometry(bellPts(1.15, 0.18, 2.95, 0.3, 3.85, 18), 28);
const headRV = headGeo(3.85);
const bellMat = M({ map: regenTex, metalness: 0.75, roughness: 0.42, side: THREE.DoubleSide });
const headMat = M({ color: 0x8e949c, metalness: 0.8, roughness: 0.38 });
const engineMeshes = [];
function engineSet(secId, bellG, headG, list) {
  const bm = new THREE.InstancedMesh(bellG, bellMat, list.length), hm = new THREE.InstancedMesh(headG, headMat, list.length);
  list.forEach((e, i) => {
    const mtx = new THREE.Matrix4().compose(e.p, new THREE.Quaternion().setFromAxisAngle(UP, e.rot || 0), V(1, 1, 1));
    bm.setMatrixAt(i, mtx); hm.setMatrixAt(i, mtx);
    const c = new THREE.Color(e.tint || 0xffffff); bm.setColorAt(i, c); hm.setColorAt(i, c);
  });
  bm.userData.pair = hm; hm.userData.pair = bm;
  for (const m of [bm, hm]) { m.userData.engines = list; add(secId, m); reg(m, list[0].info, 'engines'); engineMeshes.push(m); }
  return bm;
}
// plumes
const plumeMat = new THREE.MeshBasicMaterial({ map: plumeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffd6a0 });
function plumeGeo(r0, r1, len) { const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(V2(r0 + (r1 - r0) * Math.pow(u, 0.7), -u * len)); } return new THREE.LatheGeometry(pts, 16); }
const plumes = [];
function plumeSet(secId, geo, list, stage) {
  const m = new THREE.InstancedMesh(geo, plumeMat, list.length); m.raycast = () => {};
  m.userData.base = list.map((e) => e.p.clone()); m.userData.stage = stage; m.visible = false; m.frustumCulled = false;
  add(secId, m); plumes.push(m); return m;
}
// ============================================================ SUPER HEAVY
const boosterEngines = [];
const domeMatF = () => M({ color: 0xaeb4bc, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }, true);
{
  const topY = 3.3;
  boosterEngines.push(...boosterEngineLayout());
  engineSet('B_eng', bellSL, headSL, boosterEngines);
  plumeSet('B_eng', plumeGeo(0.6, 2.6, 34), boosterEngines, 'b');

  skinCyl('B_eng', 2.2, 8.5, 'b_skirt');
  skinCyl('B_lox', 8.5, 43.5, 'b_lox');
  skinCyl('B_ch4', 43.5, 66, 'b_ch4');
  skinCyl('B_fwd', 66, 69, 'b_fwd');
  reg(add('B_lox', new THREE.Mesh(domeGeo(8.5, 1.8, R - 0.03, false), domeMatF())), 'b_aftdome', 'tanks', { clip: true });
  reg(add('B_ch4', new THREE.Mesh(domeGeo(43.5, 1.8, R - 0.03, false), domeMatF())), 'b_commondome', 'tanks', { clip: true });
  reg(add('B_ch4', new THREE.Mesh(domeGeo(66, 1.6, R - 0.03, true), domeMatF())), 'b_fwddome', 'tanks', { clip: true });
  reg(add('B_lox', new THREE.Mesh(tankGeo(R - 0.12, 8.5, 1.7, 43.5, 1.9, false), propMat(LOXC))), 'b_lox', 'tanks', { clip: true });
  reg(add('B_ch4', new THREE.Mesh(tankGeo(R - 0.12, 43.5, 1.7, 66, 1.5, true), propMat(CH4C))), 'b_ch4', 'tanks', { clip: true });
  reg(add('B_lox', new THREE.Mesh(capsuleGeo(1.75, 7.4, 11.8), M({ color: 0x9fd8ff, emissive: 0x2f9bff, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false }))), 'b_header', 'tanks');
  const dcMat = pipeMat(0xe6a45e);
  const dc = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 41.9 - 6.9, 24, 1, true), dcMat); dc.position.y = (41.9 + 6.9) / 2;
  reg(add('B_lox', dc), 'b_downcomer', 'plumbing');
  const fun = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.8, 1.2, 24, 1, true), dcMat); fun.position.y = 42.2; reg(add('B_ch4', fun), 'b_downcomer', 'plumbing');
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.7, 32), matStruct); puck.position.y = 6.4; reg(add('B_eng', puck), 'b_puck', 'structure');
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.92, 0.22, 8, 60), matStruct); ring.rotation.x = PI / 2; ring.position.y = topY + 0.25; reg(add('B_eng', ring), 'b_mountring', 'structure');
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.14, 8, 48), matStruct); ring2.rotation.x = PI / 2; ring2.position.y = topY + 0.25; reg(add('B_eng', ring2), 'b_puck', 'structure');
  const chMan = V(0, 5.6, 0);
  addPipe([V(0, 6.1, 0), chMan], 0.45, 'b_feed', matCH4pipe);
  const ringCH4 = []; for (let i = 0; i <= 40; i++) ringCH4.push(polar(3.4, (i / 40) * PI * 2, 4.7));
  addPipe(ringCH4, 0.14, 'b_feed', matCH4pipe);
  for (let k = 0; k < 4; k++) addPipe([chMan, polar(3.4, (k / 4) * PI * 2 + 0.3, 4.7)], 0.16, 'b_feed', matCH4pipe);
  for (const e of boosterEngines) {
    const top = V(e.p.x, topY, e.p.z), az = Math.atan2(e.p.x, e.p.z), r = Math.hypot(e.p.x, e.p.z);
    if (e.info !== 'e_outer') {
      addPipe([chMan, V(e.p.x * 0.55 + 0.12, 4.9, e.p.z * 0.55), V(top.x + 0.12, topY + 0.25, top.z)], 0.085, 'b_feed', matCH4pipe);
      addPipe([polar(Math.max(r * 0.75, 0.6), az + 0.12, 7.2), polar(r, az + 0.1, topY + 0.4)], 0.1, 'b_feed', matLOXpipe);
    } else {
      addPipe([polar(3.4, az, 4.7), polar(r, az - 0.05, topY + 0.2)], 0.08, 'b_feed', matCH4pipe);
      addPipe([polar(3.3, az + 0.06, 8.0), polar(r, az + 0.06, topY + 0.4)], 0.1, 'b_feed', matLOXpipe);
    }
  }
  rings('B_eng', 2.2, 8.5, 'b_rings'); rings('B_lox', 8.5, 43.5, 'b_rings'); rings('B_ch4', 43.5, 66, 'b_rings'); rings('B_fwd', 66, 69, 'b_rings');
  stringers('B_lox', 8.6, 43.4, 48, 'b_stringers'); stringers('B_ch4', 43.6, 65.9, 48, 'b_stringers');

  // grid fins: 4 (Block 1/2) or 3 larger, lower fins (V3) — shared builder in ./geometry.js
  const frameMat = M({ color: 0x8b9199, metalness: 0.85, roughness: 0.4 });
  const latMat = M({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.4, alphaMap: latticeTex, alphaTest: 0.5, side: THREE.DoubleSide });
  for (const g of gridFins(SPEC, frameMat, latMat)) { add(g.position.y < 66 ? 'B_ch4' : 'B_fwd', g); g.children.forEach((c) => reg(c, 'b_gridfin', 'aero')); }
  // Block 1/2 catch hardpoints between the fins (position approximate). On V3 the catch points are built into the fins.
  if (!IS_V3) for (const az of [0, PI]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.0, 12), frameMat); p.position.copy(polar(R + 0.4, az, 65.6)); p.lookAt(polar(R + 2, az, 65.6)); p.rotateX(PI / 2); reg(add('B_ch4', p), 'b_pins', 'aero'); }
  for (let k = 0; k < 4; k++) {
    const az = (k * PI) / 2;
    const g = new THREE.ExtrudeGeometry(chineShape(), { depth: 24, bevelEnabled: false }); g.rotateX(-PI / 2);
    const m = new THREE.Mesh(g, steelMat(24, 3, true)); m.position.copy(polar(R - 0.08, az, 12)); m.rotation.y = az;
    reg(add('B_lox', m), 'b_chine', 'aero');
  }
  // hot staging: separate vented ring (Block 1/2) or integrated vented section (V3) — shared builder in ./geometry.js
  const hs = hotStage(SPEC, { steel: steelMat(0.25), post: M({ color: 0xb0b6be, metalness: 0.85, roughness: 0.35 }, true), back: M({ color: 0x151719, roughness: 0.9, side: THREE.DoubleSide }, true),
    shield: M({ color: 0x3a3d42, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }, true), band: steelMat(0.35) });
  if (IS_V3) S.HSR.off = S.B_fwd.off; // integrated: moves with the booster in the exploded view
  add('HSR', hs); hs.children.forEach((c) => reg(c, 'hsr', 'skin', { skin: true }));
}

// ============================================================ SHIP
const shipSL = [], shipRV = [];
let loxHeaderPath, ch4HeaderPath;
{
  { const lay = shipEngineLayout(); shipSL.push(...lay.sl); shipRV.push(...lay.rv); }
  engineSet('S_aft', bellSL, headSL, shipSL);
  engineSet('S_aft', bellRV, headRV, shipRV);
  plumeSet('S_aft', plumeGeo(0.6, 2.2, 26), shipSL, 's');
  plumeSet('S_aft', plumeGeo(1.1, 3.4, 22), shipRV, 's');

  skinCyl('S_aft', 71, 77.5, 's_skirt');
  skinCyl('S_lox', 77.5, 93, 's_lox');
  skinCyl('S_ch4', 93, 104, 's_ch4');
  skinCyl('S_bay', 104, 112, 's_bay');
  const L = 11.2, rho = (R * R + L * L) / (2 * R), yb = 112;
  const og = (x) => Math.sqrt(rho * rho - (L - x) * (L - x)) + R - rho;
  const nosePts = [];
  for (let i = 0; i <= 28; i++) { const x = L - (i / 28) * (L - 0.45); nosePts.push(V2(og(x), yb + (L - x))); }
  const rt = og(0.45), yt = yb + L - 0.45;
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * PI / 2; nosePts.push(V2(Math.max(rt * Math.cos(a), 0.001), yt + 0.42 * Math.sin(a))); }
  reg(add('S_nose', new THREE.Mesh(new THREE.LatheGeometry(nosePts, 72), steelMat(L))), 's_nose', 'skin', { skin: true });
  const TL = 1.12 * PI;
  const noseT = new THREE.LatheGeometry(nosePts.map((p) => V2(p.x * 1.006 + 0.004, p.y)), 40, -TL / 2, TL);
  reg(add('S_nose', new THREE.Mesh(noseT, tileMat((TL * R) / TILE_PX, L / TILE_PY))), 's_tiles', 'heat', { skin: true });
  tiles('S_aft', 71, 77.5); tiles('S_lox', 77.5, 93); tiles('S_ch4', 93, 104); tiles('S_bay', 104, 112);
  const door = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.006, R * 1.006, 1.3, 16, 1, true, PI - 0.4, 0.8), M({ color: 0x1a1c20, metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }, true));
  door.position.y = 106.4; reg(add('S_bay', door), 's_door', 'skin', { skin: true });
  const doorFrame = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.004, R * 1.004, 1.6, 16, 1, true, PI - 0.44, 0.88), M({ color: 0xe6e9ee, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, true));
  doorFrame.position.y = 106.4; reg(add('S_bay', doorFrame), 's_door', 'skin', { skin: true });
  reg(add('S_lox', new THREE.Mesh(domeGeo(77.5, 1.5, R - 0.03, false), domeMatF())), 's_aftdome', 'tanks', { clip: true });
  reg(add('S_ch4', new THREE.Mesh(domeGeo(93, 1.5, R - 0.03, false), domeMatF())), 's_commondome', 'tanks', { clip: true });
  reg(add('S_ch4', new THREE.Mesh(domeGeo(104, 1.5, R - 0.03, true), domeMatF())), 's_fwddome', 'tanks', { clip: true });
  reg(add('S_lox', new THREE.Mesh(tankGeo(R - 0.12, 77.5, 1.4, 93, 1.6, false), propMat(LOXC))), 's_lox', 'tanks', { clip: true });
  reg(add('S_ch4', new THREE.Mesh(tankGeo(R - 0.12, 93, 1.4, 104, 1.4, true), propMat(CH4C))), 's_ch4', 'tanks', { clip: true });
  reg(add('S_nose', new THREE.Mesh(capsuleGeo(1.15, 118.9, 121.5), M({ color: 0x7cc7ff, emissive: LOXC, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.3 }))), 's_loxheader', 'tanks');
  reg(add('S_nose', new THREE.Mesh(capsuleGeo(1.75, 115.1, 118.5), M({ color: 0xffb870, emissive: CH4C, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.3 }))), 's_ch4header', 'tanks');
  const copv = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 12, 8), M({ color: 0x2b2d31, roughness: 0.6, metalness: 0.2 }), 6);
  for (let i = 0; i < 6; i++) copv.setMatrixAt(i, new THREE.Matrix4().makeTranslation(polar(2.45, (i / 6) * PI * 2 + 0.3, 115.4)));
  reg(add('S_nose', copv), 's_ch4header', 'tanks');
  const dcMat = pipeMat(0xe6a45e);
  const dc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 91.6 - 76.3, 20, 1, true), dcMat); dc.position.y = (91.6 + 76.3) / 2; reg(add('S_lox', dc), 's_downcomer', 'plumbing');
  const sump = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.55, 1.1, 20, 1, true), dcMat); sump.position.y = 92.0; reg(add('S_ch4', sump), 's_downcomer', 'plumbing');
  for (const e of shipRV) { const az = Math.atan2(e.p.x, e.p.z); addPipe([polar(1.7, az, 92.4), polar(1.7, az, 77.2), polar(2.6, az + 0.1, 76.1)], 0.26, 's_downcomer', matCH4pipe); }
  for (const e of shipSL) { addPipe([V(0, 76.2, 0), V(e.p.x * 0.6 + 0.1, 76.0, e.p.z * 0.6), V(e.p.x + 0.1, 75.95, e.p.z)], 0.12, 's_downcomer', matCH4pipe); }
  for (const e of [...shipSL, ...shipRV]) { const az = Math.atan2(e.p.x, e.p.z), r = Math.hypot(e.p.x, e.p.z); addPipe([polar(Math.max(r * 0.8, 0.8), az - 0.25, 76.9), polar(r, az - 0.12, e.info === 'e_sl' ? 75.95 : 75.3)], 0.13, 's_lox', matLOXpipe); }
  const aL = PI + 0.55, aC = PI - 0.55;
  loxHeaderPath = [V(0, 118.9, 0), polar(1.2, aL, 118.6), polar(3.0, aL, 115.2), polar(3.75, aL, 111.5), polar(3.75, aL, 78.3), polar(1.6, aL + 0.3, 76.6), V(shipSL[1].p.x, 75.95, shipSL[1].p.z)];
  ch4HeaderPath = [V(0, 115.1, 0), polar(1.5, aC, 114.6), polar(3.75, aC, 111.5), polar(3.75, aC, 78.3), polar(1.6, aC - 0.3, 76.6), V(shipSL[2].p.x, 75.95, shipSL[2].p.z)];
  addPipe(loxHeaderPath, 0.16, 's_headerlines', matLOXpipe);
  addPipe(ch4HeaderPath, 0.16, 's_headerlines', matCH4pipe);
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.4, 28), matStruct); puck.position.y = 76.05; reg(add('S_aft', puck), 's_puck', 'structure');
  rings('S_aft', 71, 77.5, 'b_rings'); rings('S_lox', 77.5, 93, 'b_rings'); rings('S_ch4', 93, 104, 'b_rings'); rings('S_bay', 104, 112, 'b_rings');
  stringers('S_lox', 77.6, 92.9, 36, 's_stringers'); stringers('S_ch4', 93.1, 103.9, 36, 's_stringers');
  const flapMat = tileMat(1 / TILE_PX, 1 / TILE_PY); flapMat.clippingPlanes = null;
  const flapEdge = M({ color: 0xa8aeb6, metalness: 0.85, roughness: 0.35 });
  function flap(secId, p0, p1, shapePts, info) {
    const sh = new THREE.Shape(shapePts.map(([t, s]) => V2(t, s)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.28, bevelEnabled: false }); g.translate(0, 0, -0.14);
    const h = p1.clone().sub(p0).normalize(); const rad = V(p0.x, 0, p0.z).normalize();
    const out = rad.clone().sub(h.clone().multiplyScalar(rad.dot(h))).normalize(); const n = out.clone().cross(h);
    const m = new THREE.Mesh(g, [flapMat, flapEdge]); m.applyMatrix4(new THREE.Matrix4().makeBasis(out, h, n).setPosition(p0));
    reg(add(secId, m), info, 'aero');
    const hf = new THREE.Mesh(cylBetween(p0, p1, 0.32, 12), flapMat); reg(add(secId, hf), info, 'aero');
  }
  for (const sgn of [1, -1]) {
    const az = sgn * (PI / 2 - 0.18);
    flap('S_aft', polar(R, az, 72.3), polar(R, az, 83.2), [[0, 0], [0, 10.9], [2.2, 10.2], [3.4, 1.2], [3.2, 0]], 's_aflap');
    const y0 = 113.0, y1 = 119.6; const r0 = og(L - (y0 - yb)), r1 = og(L - (y1 - yb));
    flap('S_nose', polar(r0 + 0.05, az, y0), polar(r1 + 0.05, az, y1), [[0, 0], [0, 6.8], [1.0, 6.8], [2.4, 1.4], [2.2, 0]], 's_fflap');
  }
}
flushPipes();
// ============================================================ flow particles
class Flow {
  constructor(size, minPx) { this.paths = []; this.size = size; this.minPx = minPx; }
  path(pts, hex, { density = 1, speed = 8, jitter = 0, fade = true } = {}) {
    let len = 0; const cum = [0];
    for (let i = 1; i < pts.length; i++) { len += pts[i].distanceTo(pts[i - 1]); cum.push(len); }
    const N = Math.max(8, Math.ceil(len / (this.size * 0.8))), s = new Float32Array(N * 3);
    let j = 0;
    for (let i = 0; i < N; i++) { const d = (i / (N - 1)) * len; while (j < cum.length - 2 && cum[j + 1] < d) j++; const t = (d - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]); const p = pts[j].clone().lerp(pts[j + 1], Math.min(1, t)); s.set([p.x, p.y, p.z], i * 3); }
    this.paths.push({ s, N, len, color: new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace), count: Math.max(3, Math.round(len * density)), speed, jitter, fade });
  }
  build() {
    const total = this.paths.reduce((a, p) => a + p.count, 0);
    this.n = total; this.pos = new Float32Array(total * 3); const col = new Float32Array(total * 3); this.alpha = new Float32Array(total);
    this.pi = new Uint16Array(total); this.t = new Float32Array(total); this.jit = new Float32Array(total * 3);
    let k = 0;
    this.paths.forEach((p, i) => {
      for (let c = 0; c < p.count; c++, k++) {
        this.pi[k] = i; this.t[k] = (c + rnd()) / p.count;
        this.jit.set([(rnd() - 0.5) * p.jitter, (rnd() - 0.5) * p.jitter, (rnd() - 0.5) * p.jitter], k * 3);
        const b = 0.8 + rnd() * 0.4; col.set([p.color.r * b, p.color.g * b, p.color.b * b], k * 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: this.size }, uScale: { value: 500 }, uMinPx: { value: this.minPx * renderer.getPixelRatio() }, uTex: { value: dotTex } },
      vertexShader: `attribute vec3 color; attribute float aAlpha; uniform float uSize, uScale, uMinPx; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = clamp(uSize*uScale/-mv.z, uMinPx, 22.0); vC=color; vA=aAlpha; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ float a = texture2D(uTex, gl_PointCoord).a*vA; if(a<0.02) discard; gl_FragColor = vec4(vC*a*1.35, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.raycast = () => {}; this.points.renderOrder = 10;
    this.geo = g; return this.points;
  }
  update(dt, offFn) {
    const { pos, alpha, pi, t, jit, paths } = this;
    for (let k = 0; k < this.n; k++) {
      const p = paths[pi[k]]; let tt = t[k] + (dt * p.speed) / p.len; if (tt >= 1) tt -= 1; t[k] = tt;
      const f = tt * (p.N - 1), i = Math.min(p.N - 2, f | 0), fr = f - i, s = p.s, a = i * 3, b = a + 3;
      const x = s[a] + (s[b] - s[a]) * fr + jit[k * 3], z = s[a + 2] + (s[b + 2] - s[a + 2]) * fr + jit[k * 3 + 2];
      let y = s[a + 1] + (s[b + 1] - s[a + 1]) * fr + jit[k * 3 + 1];
      if (offFn) y += offFn(y);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      alpha[k] = p.fade ? Math.min(1, tt * 12, (1 - tt) * 10) : 1;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aAlpha.needsUpdate = true;
  }
}
const LOXP = 0x2ad4ff, CH4P = 0xffa21a, LOXH = 0xa8ecff, CH4H = 0xffd27a;
const vflow = new Flow(0.3, 1.8);
{
  for (const e of boosterEngines) {
    const az = Math.atan2(e.p.x, e.p.z), r = Math.hypot(e.p.x, e.p.z), top = V(e.p.x, 3.4, e.p.z);
    const st = polar(rnd() * 3.4, rnd() * PI * 2, 50 + rnd() * 14);
    const ch = [st, V(st.x * 0.4, 44.5, st.z * 0.4), V(0, 42.6, 0), V(0, 41.5, 0), V(0, 6.2, 0), V(0, 5.6, 0)];
    if (e.info === 'e_outer') ch.push(polar(3.4, az, 4.7), top); else ch.push(V(e.p.x * 0.55, 4.9, e.p.z * 0.55), top);
    vflow.path(ch, CH4P, { density: 0.55, speed: 9, jitter: 0.45 });
    const ls = polar(1.2 + rnd() * 3.0, rnd() * PI * 2, 14 + rnd() * 24);
    const lo = [ls, polar(Math.max(r * 0.8, 1.2), az, 9.5), e.info === 'e_outer' ? polar(3.3, az + 0.06, 8.0) : polar(Math.max(r * 0.75, 0.6), az + 0.12, 7.2), V(e.p.x, 3.7, e.p.z)];
    vflow.path(lo, LOXP, { density: 0.8, speed: 8, jitter: 0.5 });
  }
  for (const e of shipSL) {
    const st = polar(rnd() * 3.2, rnd() * PI * 2, 97 + rnd() * 5);
    vflow.path([st, V(0, 93.2, 0), V(0, 91.5, 0), V(0, 76.2, 0), V(e.p.x * 0.6, 76.0, e.p.z * 0.6), V(e.p.x, 75.9, e.p.z)], CH4P, { density: 1.3, speed: 6, jitter: 0.35 });
  }
  for (const e of shipRV) {
    const az = Math.atan2(e.p.x, e.p.z), st = polar(rnd() * 3.2, rnd() * PI * 2, 97 + rnd() * 5);
    vflow.path([st, polar(1.7, az, 93.0), polar(1.7, az, 77.2), polar(2.6, az + 0.1, 76.1), V(e.p.x, 75.8, e.p.z)], CH4P, { density: 1.1, speed: 6, jitter: 0.2 });
  }
  for (const e of [...shipSL, ...shipRV]) for (let q = 0; q < 2; q++) {
    const az = Math.atan2(e.p.x, e.p.z), r = Math.hypot(e.p.x, e.p.z), st = polar(1 + rnd() * 3, rnd() * PI * 2, 80 + rnd() * 10);
    vflow.path([st, polar(Math.max(r * 0.8, 0.8), az - 0.25, 77.5), polar(Math.max(r * 0.8, 0.8), az - 0.25, 76.9), V(e.p.x, 75.6, e.p.z)], LOXP, { density: 1.0, speed: 5, jitter: 0.4 });
  }
  vflow.path(loxHeaderPath, LOXH, { density: 0.7, speed: 7, jitter: 0.1 });
  vflow.path(ch4HeaderPath, CH4H, { density: 0.7, speed: 7, jitter: 0.1 });
  vflow.build(); vflow.points.visible = false; scene.add(vflow.points);
}

// ============================================================ RAPTOR DETAIL MODEL
const raptorG = new THREE.Group(); raptorG.visible = false; scene.add(raptorG);
const rflow = new Flow(0.028, 2.2);
const raptorLabels = [];
const raptorTubes = [];
const raptorHousings = [];
let rvacExt, rvacPlume, rPlume;
{
  const rg = raptorG;
  const addR = (m, key, clip = false) => { rg.add(m); reg(m, key, null, { clip }); return m; };
  const metal = (hex, clip = false, extra = {}) => M({ color: hex, metalness: 0.82, roughness: 0.36, side: THREE.DoubleSide, ...extra }, clip);
  const yT = 1.5, rt = 0.19, re = 0.65;
  const bellR = (y) => rt + (re - rt) * Math.sqrt(Math.max(0, (yT - y) / yT));
  const np = []; for (let i = 0; i <= 24; i++) { const u = 1 - i / 24; np.push(V2(rt + (re - rt) * Math.sqrt(u), yT - u * yT)); }
  addR(new THREE.Mesh(new THREE.LatheGeometry(np, 64), M({ map: regenTex, metalness: 0.75, roughness: 0.4, side: THREE.FrontSide }, true)), 'r_nozzle', true);
  addR(new THREE.Mesh(new THREE.LatheGeometry(np.map((p) => V2(p.x - 0.01, p.y)), 64), M({ color: 0x3a2a22, roughness: 0.7, metalness: 0.3, side: THREE.BackSide }, true)), 'r_nozzle', true);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(re, 0.018, 8, 64), metal(0x9aa0a8, true)); lip.rotation.x = PI / 2; addR(lip, 'r_nozzle', true);
  const cp = [V2(rt, yT), V2(0.215, 1.57), V2(0.27, 1.68), V2(0.31, 1.78), V2(0.31, 2.26), V2(0.335, 2.27), V2(0.335, 2.31)];
  addR(new THREE.Mesh(new THREE.LatheGeometry(cp, 48), M({ color: 0xc07a48, metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide }, true)), 'r_mcc', true);
  const thr = new THREE.Mesh(new THREE.TorusGeometry(rt + 0.012, 0.022, 10, 48), metal(0xd8a070, true)); thr.rotation.x = PI / 2; thr.position.y = yT; addR(thr, 'r_throat', true);
  const injTex = canvasTex(256, 256, (g) => { g.fillStyle = '#8a8f96'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#2b2e33'; for (let r = 18; r < 128; r += 16) for (let a = 0; a < PI * 2; a += 12 / r) { g.beginPath(); g.arc(128 + r * Math.cos(a), 128 + r * Math.sin(a), 3, 0, PI * 2); g.fill(); } });
  const inj = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 48), [M({ color: 0x8a8f96, metalness: 0.8, roughness: 0.4 }, true), M({ map: injTex, metalness: 0.6, roughness: 0.5 }, true), M({ map: injTex, metalness: 0.6, roughness: 0.5 }, true)]);
  inj.position.y = 2.3; addR(inj, 'r_injector', true);
  const hp = [V2(0.34, 2.31), V2(0.37, 2.36), V2(0.37, 2.45), V2(0.3, 2.56), V2(0.16, 2.62), V2(0.001, 2.63)];
  const hgmM = metal(0xa3a9b1, true, { transparent: true }); raptorHousings.push(hgmM); addR(new THREE.Mesh(new THREE.LatheGeometry(hp, 48), hgmM), 'r_hgm', true);
  function pumpStack(x, tint, accent, keyPump, keyPB) {
    const housing = metal(tint, false, { transparent: true }); raptorHousings.push(housing);
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 32), housing); pump.position.set(x, 2.8, 0);
    const vol = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.055, 12, 36), housing); vol.rotation.x = PI / 2; vol.position.set(x, 2.76, 0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 20), housing); shaft.position.set(x, 2.98, 0);
    const turb = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.17, 32), housing); turb.position.set(x, 3.11, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.035, 32), M({ color: accent, emissive: accent, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.4 })); band.position.set(x, 2.8, 0);
    for (const m of [pump, vol, shaft, turb, band]) addR(m, keyPump);
    const pbm = metal(tint, false, { transparent: true }); raptorHousings.push(pbm); const pb = new THREE.Mesh(capsuleGeo(0.1, 3.2, 3.55, 24), pbm); pb.position.x = x; addR(pb, keyPB, true);
    const pbBand = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.04, 24), M({ color: accent, emissive: accent, emissiveIntensity: 0.6 })); pbBand.position.set(x, 3.4, 0); addR(pbBand, keyPB);
    const ign = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), metal(0x777c84)); ign.position.set(x, 3.6, 0); addR(ign, keyPB);
  }
  pumpStack(-0.42, 0xa9b8c8, 0x2ad4ff, 'r_otp', 'r_oxpb');
  pumpStack(0.42, 0xc8b8a9, 0xffa21a, 'r_ftp', 'r_fuelpb');
  const gb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.16), metal(0x8a9098)); gb.position.set(0, 2.88, 0); addR(gb, 'r_gimbal');
  const gc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.2, 20), metal(0x70767e)); gc.position.set(0, 3.24, 0); addR(gc, 'r_gimbal');
  const gs = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), metal(0x5d6269)); gs.position.set(0, 3.38, 0); addR(gs, 'r_gimbal');
  const yCM = 0.45, rCM = bellR(yCM) + 0.04;
  const cm1 = new THREE.Mesh(new THREE.TorusGeometry(rCM, 0.03, 10, 64), metal(0xd89a58, true)); cm1.rotation.x = PI / 2; cm1.position.y = yCM; addR(cm1, 'r_regen', true);
  const cm2 = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.028, 10, 48), metal(0xd89a58, true)); cm2.rotation.x = PI / 2; cm2.position.y = 2.22; addR(cm2, 'r_regen', true);

  const tubeMat = (hex) => { const m = M({ color: hex, metalness: 0.6, roughness: 0.35, transparent: true, opacity: 1 }); raptorTubes.push(m); return m; };
  const mLOX = tubeMat(0x8fc4ee), mCH4 = tubeMat(0xe0a060), mOXG = tubeMat(0xb7a9e8), mFG = tubeMat(0xe08a70);
  const curve = (pts) => new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.15);
  function line(pts, r, mat, key, flowHex, opts = {}) {
    const c = curve(pts);
    if (mat) addR(new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(24, pts.length * 12), r, 12, false), mat), key);
    if (flowHex) rflow.path(c.getSpacedPoints(80), flowHex, { density: opts.density || 70, speed: opts.speed || 0.55, jitter: opts.jitter ?? r * 1.1 });
    return c;
  }
  const OXG = 0x9d8cff, FRG = 0xff5a3c, HOT = 0xfff1d0;
  line([V(-0.95, 3.75, 0.22), V(-0.95, 3.2, 0.22), V(-0.8, 2.8, 0.18), V(-0.6, 2.76, 0.12), V(-0.45, 2.76, 0.05)], 0.07, mLOX, 'r_loxin', LOXP, { density: 90 });
  line([V(-0.42, 2.76, 0), V(-0.55, 2.74, -0.2), V(-0.62, 2.9, -0.28), V(-0.62, 3.45, -0.22), V(-0.52, 3.58, -0.08), V(-0.42, 3.52, 0)], 0.045, mLOX, 'r_otp', LOXP, { density: 90 });
  line([V(-0.42, 3.5, 0), V(-0.42, 3.3, 0), V(-0.42, 3.12, 0)], 0, null, null, OXG, { density: 110, jitter: 0.12 });
  line([V(-0.42, 3.12, 0), V(-0.22, 3.08, 0.08), V(-0.13, 2.9, 0.14), V(-0.1, 2.65, 0.1), V(-0.05, 2.55, 0.04)], 0.06, mOXG, 'r_hgm', OXG, { density: 100 });
  line([V(0.95, 3.75, 0.22), V(0.95, 3.2, 0.22), V(0.8, 2.8, 0.18), V(0.6, 2.76, 0.12), V(0.45, 2.76, 0.05)], 0.07, mCH4, 'r_ch4in', CH4P, { density: 90 });
  line([V(0.42, 2.76, 0), V(0.58, 2.7, -0.18), V(0.66, 2.3, -0.26), polar(0.68, PI / 2 + 0.3, 1.2), polar(rCM + 0.03, PI / 2 + 0.25, yCM + 0.03)], 0.045, mCH4, 'r_ftp', CH4P, { density: 90 });
  for (let k = 0; k < 10; k++) {
    const az = (k / 10) * PI * 2, pts = [];
    for (let i = 0; i <= 14; i++) { const y = yCM + (i / 14) * (yT - yCM); pts.push(polar(bellR(y) + 0.012, az, y)); }
    pts.push(polar(0.225, az, 1.57), polar(0.285, az, 1.7), polar(0.322, az, 1.8), polar(0.322, az, 2.2));
    rflow.path(pts, 0xffc860, { density: 50, speed: 0.45, jitter: 0.006 });
  }
  line([polar(0.36, PI / 2 - 0.4, 2.22), V(0.5, 2.35, -0.22), V(0.62, 2.9, -0.3), V(0.62, 3.45, -0.22), V(0.52, 3.58, -0.08), V(0.42, 3.52, 0)], 0.045, mCH4, 'r_regen', 0xffc860, { density: 90 });
  line([V(0.42, 3.5, 0), V(0.42, 3.3, 0), V(0.42, 3.12, 0)], 0, null, null, FRG, { density: 110, jitter: 0.12 });
  line([V(0.42, 3.12, 0), V(0.22, 3.08, -0.08), V(0.14, 2.9, -0.14), V(0.1, 2.65, -0.1), V(0.05, 2.55, -0.04)], 0.06, mFG, 'r_hgm', FRG, { density: 100 });
  line([V(-0.62, 3.3, -0.24), V(-0.3, 3.72, -0.3), V(0.3, 3.72, -0.3), V(0.42, 3.56, -0.05)], 0.018, mLOX, 'r_xfeed', LOXH, { density: 40 });
  line([V(0.62, 3.2, -0.25), V(0.3, 3.66, -0.36), V(-0.3, 3.66, -0.36), V(-0.42, 3.56, -0.05)], 0.018, mCH4, 'r_xfeed', CH4H, { density: 40 });
  for (let k = 0; k < 7; k++) { const az = (k / 7) * PI * 2; rflow.path([V(-0.05, 2.55, 0.04), polar(0.08, az, 2.45), polar(0.12, az, 2.33)], OXG, { density: 60, speed: 0.4, jitter: 0.01 }); rflow.path([V(0.05, 2.55, -0.04), polar(0.28, az + 0.4, 2.45), polar(0.26, az + 0.4, 2.33)], FRG, { density: 60, speed: 0.4, jitter: 0.01 }); }
  for (let k = 0; k < 14; k++) {
    const az = (k / 14) * PI * 2, r0 = 0.05 + (k % 3) * 0.1;
    const pts = [polar(r0, az, 2.29), polar(r0 * 0.9 + 0.02, az, 1.9), polar(0.04 + r0 * 0.4, az, yT), polar(0.1 + r0 * 0.8, az, 1.0), polar(0.2 + r0 * 1.3, az, 0.4), polar(0.25 + r0 * 1.5, az, 0.0), polar(0.35 + r0 * 1.8, az, -1.6)];
    rflow.path(pts, HOT, { density: 26, speed: 1.2, jitter: 0.02 });
  }
  rflow.build(); rflow.points.visible = false; raptorG.add(rflow.points);
  const ep = []; for (let i = 0; i <= 18; i++) { const u = i / 18; ep.push(V2(re + (1.15 - re) * Math.sqrt(u), -u * 2.0)); }
  rvacExt = new THREE.Mesh(new THREE.LatheGeometry(ep, 64), M({ color: 0x3b3f46, metalness: 0.9, roughness: 0.28, side: THREE.DoubleSide }, true)); rvacExt.visible = false; addR(rvacExt, 'r_rvac', true);
  rPlume = new THREE.Mesh(plumeGeo(0.6, 1.3, 4.5), plumeMat); rPlume.visible = false; rPlume.raycast = () => {}; rg.add(rPlume);
  const dia = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  for (let i = 0; i < 4; i++) { const d = dia.clone(); d.scale.set(0.22 - i * 0.03, 0.12, 0.22 - i * 0.03); d.position.y = -0.7 - i * 0.9; d.raycast = () => {}; rPlume.add(d); }
  rvacPlume = new THREE.Mesh(plumeGeo(1.1, 1.6, 4.0), plumeMat); rvacPlume.position.y = -2.0; rvacPlume.visible = false; rvacPlume.raycast = () => {}; rg.add(rvacPlume);

  const L = (text, key, p, side) => raptorLabels.push({ text, key, p, side });
  L('LOX inlet', 'r_loxin', V(-0.95, 3.72, 0.22), 'l');
  L('CH₄ inlet', 'r_ch4in', V(0.95, 3.72, 0.22), 'r');
  L('Ox-rich preburner', 'r_oxpb', V(-0.5, 3.45, 0), 'l');
  L('Fuel-rich preburner', 'r_fuelpb', V(0.5, 3.45, 0), 'r');
  L('Oxygen turbopump', 'r_otp', V(-0.6, 2.9, 0), 'l');
  L('Fuel turbopump', 'r_ftp', V(0.6, 2.9, 0), 'r');
  L('Hot-gas manifold', 'r_hgm', V(-0.3, 2.56, 0), 'l');
  L('Injector', 'r_injector', V(-0.31, 2.3, 0), 'l');
  L('Combustion chamber', 'r_mcc', V(0.32, 2.0, 0), 'r');
  L('Throat', 'r_throat', V(-0.21, 1.5, 0), 'l');
  L('Regen-cooled nozzle', 'r_nozzle', V(0.5, 0.6, 0), 'r');
  L('Coolant manifold', 'r_regen', V(-rCM, yCM, 0), 'l');
}
// ============================================================ per-part materials
// Several parts were built sharing one material (e.g. structure steel, pipe colours, grid-fin frame).
// Give every info key its own material copy so highlighting one part never lights up unrelated parts.
{
  const users = new Map();
  for (const [key, list] of Object.entries(infoMeshes)) for (const mesh of list) {
    if (mesh.userData.engines) continue; // engines highlight per-instance via instanceColor
    for (const m of [].concat(mesh.material)) { if (!users.has(m)) users.set(m, new Set()); users.get(m).add(key); }
  }
  const registries = [skinMats, pipeMats, raptorTubes, raptorHousings];
  for (const [key, list] of Object.entries(infoMeshes)) {
    const local = new Map();
    for (const mesh of list) {
      if (mesh.userData.engines) continue;
      const swap = (m) => {
        if (users.get(m).size < 2) return m;
        if (!local.has(m)) {
          const c = m.clone(); c.clippingPlanes = m.clippingPlanes; // keep sharing the live cutaway plane
          local.set(m, c); for (const r of registries) if (r.includes(m)) r.push(c);
        }
        return local.get(m);
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    }
  }
  // originals that are no longer used by any mesh can leave the registries
  const inUse = new Set(); scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) inUse.add(m); });
  for (const r of registries) for (let i = r.length - 1; i >= 0; i--) if (!inUse.has(r[i])) r.splice(i, 1);
}

// ============================================================ labels (HTML)
const labelLayer = $('#labels');
const vehLabels = [
  { text: 'Nose · header tanks', key: 's_nose', y: 118, st: 's' },
  { text: 'Payload bay', key: 's_bay', y: 108, st: 's' },
  { text: 'CH₄ tank', key: 's_ch4', y: 98.5, st: 's' },
  { text: 'LOX tank', key: 's_lox', y: 85, st: 's' },
  { text: '3 SL + 3 RVac Raptors', key: 'e_rvac', y: 73.8, st: 's' },
  { text: IS_V3 ? 'Integrated hot stage (V3)' : 'Hot-staging ring', key: 'hsr', y: 70, st: 'b' },
  { text: IS_V3 ? 'Grid fins ×3 (V3)' : 'Grid fins ×4', key: 'b_gridfin', y: SPEC.finY, st: 'b' },
  { text: IS_V3 ? 'CH₄ tank' : 'CH₄ tank ~700 t', key: 'b_ch4', y: 55, st: 'b' },
  { text: IS_V3 ? 'LOX tank' : 'LOX tank ~2,700 t', key: 'b_lox', y: 26, st: 'b' },
  { text: '33 Raptors', key: 'e_outer', y: 2.5, st: 'b' },
  { text: 'SHIP', key: 'ship', y: 97, st: 's', big: true },
  { text: 'SUPER HEAVY', key: 'booster', y: 36, st: 'b', big: true },
];
for (const l of [...vehLabels, ...raptorLabels]) {
  const el = document.createElement('div'); el.className = 'lbl' + (l.big ? ' big l' : (l.side ? ' ' + l.side : ' r'));
  el.innerHTML = `<span>${l.text}</span>`;
  el.addEventListener('click', (ev) => { ev.stopPropagation(); highlightKey(l.key); showInfo(l.key); });
  labelLayer.appendChild(el); l.el = el;
}

// ============================================================ state & UI
const state = { stage: 'stack', skin: 'solid', flow: false, plume: false, labels: true, rvac: false,
  sys: { skin: true, heat: true, aero: true, tanks: true, plumbing: true, engines: true, structure: true } };
const SYS_NAMES = { skin: 'Steel skin', heat: 'Heat shield', aero: 'Fins & flaps', tanks: 'Tanks & propellant', plumbing: 'Plumbing', engines: 'Engines', structure: 'Stringers & rings' };

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.09; controls.screenSpacePanning = true; controls.rotateSpeed = 0.8;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

function applySystems() {
  for (const [k, list] of Object.entries(systems)) for (const m of list) m.visible = state.sys[k];
  document.querySelectorAll('#sheet .chip').forEach((c) => c.classList.toggle('on', state.sys[c.dataset.sys]));
  requestRender();
}
function applySkin() {
  const ghost = state.skin === 'ghost';
  for (const m of skinMats) { m.transparent = ghost; m.opacity = ghost ? 0.1 : 1; m.depthWrite = !ghost; m.needsUpdate = true; }
  $('#bSkin').innerHTML = `Skin<b>${{ solid: 'Solid', ghost: 'X-ray', cut: 'Cutaway' }[state.skin]}</b>`;
  $('#bSkin').classList.toggle('on', state.skin !== 'solid');
  requestRender();
}
function applyFlow() {
  if (state.flow && state.skin === 'solid') { state.skin = 'cut'; applySkin(); }
  vflow.points.visible = state.flow && state.stage !== 'raptor';
  rflow.points.visible = state.flow && state.stage === 'raptor';
  for (const m of [...pipeMats, ...raptorTubes]) { m.opacity = state.flow ? 0.4 : 1; m.depthWrite = !state.flow; }
  for (const m of raptorHousings) { m.opacity = state.flow ? 0.38 : 1; m.depthWrite = !state.flow; }
  $('#bFlow').classList.toggle('on', state.flow);
  const legendWas = $('#legend').classList.contains('show');
  $('#legend').classList.toggle('show', state.flow);
  $('#legend').innerHTML = state.stage === 'raptor'
    ? '<i class="c-lox"></i>LOX <i class="c-ch4"></i>CH₄ <i class="c-oxg"></i>Ox-rich gas <i class="c-frg"></i>Fuel-rich gas <i class="c-hot"></i>Exhaust'
    : '<i class="c-lox"></i>LOX <i class="c-ch4"></i>Methane' + (state.stage === 'booster' ? '' : ' <i class="c-loxh"></i>Header LOX <i class="c-ch4h"></i>Header CH₄');
  if (legendWas !== state.flow && frames) { applyViewOffset(); fitCamera(true, true); }
}
function applyPlume() {
  $('#bPlume').classList.toggle('on', state.plume);
  rPlume.visible = state.plume && !state.rvac; rvacPlume.visible = state.plume && state.rvac;
  requestRender();
}
function applyRvac() { rvacExt.visible = state.rvac; $('#bRvac').classList.toggle('on', state.rvac); applyPlume(); }
function applyStage() {
  const st = state.stage;
  boosterG.visible = st === 'stack' || st === 'booster';
  shipG.visible = st === 'stack' || st === 'ship';
  raptorG.visible = st === 'raptor';
  document.querySelectorAll('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.stage === st));
  $('#bRvac').classList.toggle('hidden', st !== 'raptor');
  $('#bParts').classList.toggle('hidden', st === 'raptor');
  $('#explodeRow').style.visibility = st === 'raptor' ? 'hidden' : 'visible';
  applyFlow(); applyPlume(); requestRender();
}
function setExplode(v) {
  explode = v;
  for (const s of SECT) s.g.position.y = s.off * v;
  shipG.position.y = SHIP_OFF * v;
  $('#exVal').textContent = Math.round(v * 100) + '%';
  requestRender();
}

// ---------- camera fit
const DEF_AZ = 2.2, DEF_EL = 0.08;
const DEF_DIR = V(Math.sin(DEF_AZ) * Math.cos(DEF_EL), Math.sin(DEF_EL), Math.cos(DEF_AZ) * Math.cos(DEF_EL)).normalize();
let camAnim = null;
function stageBox() {
  const box = new THREE.Box3();
  if (state.stage === 'raptor') { box.set(V(-1.3, state.rvac ? -2.05 : -0.05, -0.5), V(1.3, 3.85, 0.5)); return box; }
  const b0 = state.stage === 'ship' ? 71 : -0.1, b1 = state.stage === 'booster' ? 71 : 123.3;
  const lo = b0 + offAt(b0 + 0.01), hi = b1 + offAt(b1 - 0.01);
  box.set(V(-R - 1, lo, -R), V(R + 1, hi, R)); return box;
}
// Landscape phones dock the panel on the right (see CSS media query); detect it from the layout itself.
function panelDocked() { const r = $('#panel').getBoundingClientRect(); return r.left > 4 && r.width < window.innerWidth * 0.75; }
function safeArea() {
  const W = window.innerWidth, H = window.innerHeight, pr = $('#panel').getBoundingClientRect(), tr = $('#top').getBoundingClientRect();
  // keep the model clear of the flow legend when it is shown
  const lg = $('#legend'), lh = lg.classList.contains('show') ? lg.getBoundingClientRect().height + 8 : 0;
  if (panelDocked()) return { top: tr.bottom + 2, bot: 10 + lh, right: W - pr.left + 6 };
  return { top: tr.bottom + 4, bot: H - pr.top + 6 + lh, right: 0 };
}
let viewD = 0, safeCache = { top: 60, bot: 200, right: 0 };
function applyViewOffset() {
  const W = window.innerWidth, H = window.innerHeight, { top, bot, right } = safeArea();
  const yc = top + (H - top - bot) / 2, d = H / 2 - yc; viewD = Math.abs(d);
  const xc = (W - right) / 2, dx = W / 2 - xc, viewDX = Math.abs(dx);
  safeCache = { top, bot, right };
  const FW = W + 2 * viewDX, FH = H + 2 * viewD;
  camera.aspect = FW / FH;
  camera.setViewOffset(FW, FH, dx > 0 ? 2 * dx : 0, d > 0 ? 2 * d : 0, W, H); camera.updateProjectionMatrix();
}
const tanEff = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * window.innerHeight / (window.innerHeight + 2 * viewD);
function fitCamera(animate = true, keepDir = false) {
  const box = stageBox(), size = box.getSize(V(0, 0, 0)), center = box.getCenter(V(0, 0, 0));
  const { top, bot, right } = safeArea(), H = window.innerHeight, W = window.innerWidth, fracH = (H - top - bot) / H, fracW = (W - right) / W;
  const tv = tanEff(), th = tv * W / H, rxz = Math.max(size.x, size.z) / 2;
  const dist = Math.max((size.y / 2) / (tv * fracH), (size.x / 2) / (th * fracW * 0.92)) + rxz * 0.6;
  const dir = keepDir ? camera.position.clone().sub(controls.target).normalize() : (state.stage === 'raptor' ? V(0.12, 0.1, 1).normalize() : DEF_DIR.clone());
  const to = center.clone().add(dir.multiplyScalar(dist * 1.02));
  controls.minDistance = dist * 0.02; controls.maxDistance = dist * 3;
  if (!animate) { camera.position.copy(to); controls.target.copy(center); controls.update(); camAnim = null; requestRender(); return; }
  camAnim = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: to, t1: center }; requestRender();
}

// ---------- info card & picking
const card = $('#card');
function showInfo(key, extra) {
  const d = INFO[key]; if (!d) return;
  $('#cTitle').textContent = d.t; $('#cTag').textContent = (extra && extra.tag) || d.tag || '';
  $('#cDesc').textContent = d.d;
  $('#cSpecs').innerHTML = (d.s || []).map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('#cNote').textContent = (d.note ? d.note + ' ' : '') + 'Figures are approximate public estimates.';
  $('#cAct').innerHTML = d.raptor ? '<button id="goRaptor">Open Raptor cutaway ›</button>' : '';
  if (key === 'model') { const q = new URLSearchParams(location.search); q.set('v', IS_V3 ? '2' : '3'); const a = document.createElement('a'); a.href = 'starship.html?' + q.toString(); a.textContent = IS_V3 ? 'Show the retired Block 2 model ›' : 'Show the V3 approximation ›'; $('#cAct').appendChild(a); }
  if (d.raptor) $('#goRaptor').onclick = () => { state.rvac = key === 'e_rvac'; applyRvac(); setStage('raptor'); };
  card.classList.add('show'); $('#sheet').classList.remove('show'); dismissHint();
}
function hideInfo() { card.classList.remove('show'); clearHighlight(); }
$('#cClose').onclick = hideInfo;
let hl = null;
const HLC = new THREE.Color(0x3d8bff);
function clearHighlight() {
  if (!hl) return;
  if (hl.inst) { for (const m of hl.inst.meshes) { m.setColorAt(hl.inst.id, hl.inst.cols.get(m)); m.instanceColor.needsUpdate = true; } }
  if (hl.mats) for (const [m, e] of hl.mats) { m.emissive.copy(e.c); m.emissiveIntensity = e.i; }
  hl = null; requestRender();
}
function highlightKey(key) {
  clearHighlight(); const mats = new Map();
  for (const mesh of infoMeshes[key] || []) { if (mesh.userData.engines) continue; for (const m of [].concat(mesh.material)) if (m.emissive && !mats.has(m)) { mats.set(m, { c: m.emissive.clone(), i: m.emissiveIntensity }); m.emissive.copy(HLC); m.emissiveIntensity = 0.6; } }
  hl = { mats }; requestRender();
}
function highlightInstance(mesh, id) {
  clearHighlight(); const meshes = [mesh, mesh.userData.pair], cols = new Map();
  for (const m of meshes) { const c = new THREE.Color(); m.getColorAt(id, c); cols.set(m, c); m.setColorAt(id, new THREE.Color(2.2, 3.4, 6)); m.instanceColor.needsUpdate = true; }
  hl = { inst: { meshes, id, cols } }; requestRender();
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function visibleDeep(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function pick(cx, cy) {
  ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(scene.children, true);
  for (const h of hits) {
    const o = h.object; if (!o.userData.info || !visibleDeep(o)) continue;
    if (state.skin === 'ghost' && o.userData.skin) continue;
    const mats = [].concat(o.material);
    if (mats[0].clippingPlanes && clipPlane.distanceToPoint(h.point) < 0) continue;
    if (o.userData.engines && h.instanceId != null) {
      const e = o.userData.engines[h.instanceId]; highlightInstance(o, h.instanceId);
      const idx = o.userData.engines.filter((x) => x.info === e.info).indexOf(e) + 1;
      showInfo(e.info, { tag: INFO[e.info].tag + ` · #${idx}` }); return o.userData.info;
    }
    highlightKey(o.userData.info); showInfo(o.userData.info); return o.userData.info;
  }
  hideInfo(); return null;
}
let down = null, pointers = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { pointers++; down = pointers === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; camAnim = null; });
renderer.domElement.addEventListener('pointerup', (e) => {
  pointers = Math.max(0, pointers - 1);
  if (!down) return; const d = down; down = null;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && performance.now() - d.t < 450) pick(e.clientX, e.clientY);
});
renderer.domElement.addEventListener('pointercancel', () => { down = null; pointers = 0; });

// ---------- UI wiring
function setStage(st, silent = false) {
  state.stage = st; applyStage(); fitCamera(true);
  clearHighlight(); if (!silent) showInfo(st === 'stack' ? 'stack' : st);
}
document.querySelectorAll('#seg button').forEach((b) => (b.onclick = () => { const st = b.dataset.stage; if (st === state.stage) { clearHighlight(); showInfo(st === 'stack' ? 'stack' : st); } else setStage(st, true); }));
$('#bSkin').onclick = () => { state.skin = { solid: 'cut', cut: 'ghost', ghost: 'solid' }[state.skin]; if (state.skin === 'solid' && state.flow) { state.flow = false; applyFlow(); } applySkin(); };
$('#bFlow').onclick = () => { state.flow = !state.flow; applyFlow(); };
$('#bPlume').onclick = () => { state.plume = !state.plume; applyPlume(); };
$('#bLabels').onclick = () => { state.labels = !state.labels; $('#bLabels').classList.toggle('on', state.labels); requestRender(); };
$('#blockTag').onclick = () => { clearHighlight(); showInfo('model'); };
$('#bRvac').onclick = () => { state.rvac = !state.rvac; applyRvac(); fitCamera(true, true); if (state.rvac) showInfo('r_rvac'); };
$('#bParts').onclick = () => { $('#sheet').classList.toggle('show'); card.classList.remove('show'); };
$('#sheetClose').onclick = () => $('#sheet').classList.remove('show');
$('#sheet .chips').innerHTML = Object.entries(SYS_NAMES).map(([k, n]) => `<button class="chip" data-sys="${k}">${n}</button>`).join('');
document.querySelectorAll('#sheet .chip').forEach((c) => (c.onclick = () => { state.sys[c.dataset.sys] = !state.sys[c.dataset.sys]; applySystems(); }));
const ex = $('#explode');
ex.addEventListener('input', () => setExplode(ex.value / 100));
ex.addEventListener('change', () => fitCamera(true, true));
$('#help').onclick = () => $('#helpBox').classList.toggle('show');
$('#helpBox').onclick = () => $('#helpBox').classList.remove('show');

// ============================================================ loop
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), camRight = new THREE.Vector3();
let placed = [];
const LBL_GAP = 30; // min vertical spacing so the 44px-tall label hit areas barely overlap
function placeLabel(l, x, y, W) {
  if (typeof W === 'function') W = W(y);
  l.el.style.display = '';
  if (!l.w) l.w = l.el.firstChild.offsetWidth;
  const left = l.el.classList.contains('l');
  x = left ? Math.max(x, l.w + 20) : Math.min(x, W - l.w - 20);
  placed.push({ l, x, y, left });
}
function resolveLabels() {
  for (const side of [true, false]) {
    const arr = placed.filter((p) => p.left === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < arr.length; i++) if (arr[i].y - arr[i - 1].y < LBL_GAP && Math.abs(arr[i].x - arr[i - 1].x) < 160) arr[i].y = arr[i - 1].y + LBL_GAP;
  }
  const H = window.innerHeight;
  for (const p of placed) { if (p.y < safeCache.top || p.y > H - safeCache.bot) { p.l.el.style.display = 'none'; continue; } p.l.el.style.transform = `translate(${p.x}px, ${p.y}px)`; }
  placed = [];
}
function updateLabels() {
  const H = window.innerHeight; placed = [];
  // landscape dock: right-hand labels may use the empty area above the docked panel while no card/sheet is open
  let W = window.innerWidth - safeCache.right;
  if (safeCache.right && !card.classList.contains('show') && !$('#sheet').classList.contains('show')) { const pt = $('#panel').getBoundingClientRect().top - 24; const Wn = W, Wf = window.innerWidth; W = (y) => (y < pt ? Wf : Wn); }
  camRight.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  for (const l of vehLabels) {
    const vis = state.labels && state.stage !== 'raptor' && ((l.st === 's' && shipG.visible) || (l.st === 'b' && boosterG.visible));
    if (!vis) { l.el.style.display = 'none'; continue; }
    tmpV.copy(camRight).multiplyScalar((l.big ? -1 : 1) * (R + 0.6)); tmpV.y = l.y + offAt(l.y);
    tmpV.project(camera);
    if (tmpV.z > 1) { l.el.style.display = 'none'; continue; }
    placeLabel(l, ((tmpV.x + 1) / 2) * window.innerWidth, ((1 - tmpV.y) / 2) * H, W);
  }
  for (const l of raptorLabels) {
    if (!(state.labels && state.stage === 'raptor')) { l.el.style.display = 'none'; continue; }
    tmpV.copy(l.p).project(camera);
    placeLabel(l, ((tmpV.x + 1) / 2) * window.innerWidth, ((1 - tmpV.y) / 2) * H, W);
  }
  resolveLabels();
}
const mtmp = new THREE.Matrix4(), qI = new THREE.Quaternion(), sV = new THREE.Vector3();
function frame(dt) {
  const t = clock.elapsedTime;
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt / 0.7); const k = 1 - Math.pow(1 - camAnim.t, 3);
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, k); controls.target.lerpVectors(camAnim.t0, camAnim.t1, k);
    if (camAnim.t >= 1) camAnim = null;
  }
  const moved = controls.update();
  const dist = camera.position.distanceTo(controls.target);
  camera.near = THREE.MathUtils.clamp(dist * 0.004, 0.005, 1.5); camera.updateProjectionMatrix();
  stars.position.copy(camera.position);
  if (state.skin === 'cut') { tmpV.subVectors(controls.target, camera.position).setY(0); if (tmpV.lengthSq() < 1e-8) tmpV.set(0, 0, -1); tmpV.normalize(); clipPlane.normal.copy(tmpV); clipPlane.constant = 0; }
  else clipPlane.constant = 1e6;
  const scale = renderer.domElement.height / (2 * tanEff());
  if (vflow.points.visible) { vflow.mat.uniforms.uScale.value = scale; vflow.update(dt, offAt); }
  if (rflow.points.visible) { rflow.mat.uniforms.uScale.value = scale; rflow.update(dt, null); }
  for (const p of plumes) {
    p.visible = state.plume && state.sys.engines && (p.userData.stage === 'b' || state.stage === 'ship' || explode > 0.25);
    if (!p.visible) continue;
    p.userData.base.forEach((b, i) => { const f = 1 + 0.05 * Math.sin(t * 40 + i * 1.7); mtmp.compose(b, qI, sV.set(f, 1 + 0.06 * Math.sin(t * 33 + i), f)); p.setMatrixAt(i, mtmp); });
    p.instanceMatrix.needsUpdate = true;
  }
  if (rPlume.visible) rPlume.scale.set(1 + 0.03 * Math.sin(t * 50), 1 + 0.04 * Math.sin(t * 37), 1 + 0.03 * Math.sin(t * 50));
  if (!ctxLost) renderer.render(scene, camera);
  updateLabels();
  // keep animating only while something is actually moving
  const plumesOn = plumes.some((p) => p.visible) || rPlume.visible || rvacPlume.visible;
  return !!(camAnim || moved || vflow.points.visible || rflow.points.visible || plumesOn);
}
// ---------- render on demand: the rAF loop stops when nothing changes and while the page is hidden
let rafId = 0, frames = 0;
function tick() {
  rafId = 0; frames++;
  const keep = frame(Math.min(clock.getDelta(), 0.05));
  if (keep) requestRender();
}
function requestRender() {
  if (rafId || document.hidden || ctxLost) return;
  rafId = requestAnimationFrame(tick);
}
controls.addEventListener('change', requestRender);
controls.addEventListener('start', requestRender);
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'input', 'click', 'keydown']) window.addEventListener(ev, requestRender, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
  else { clock.getDelta(); requestRender(); }
});

// ---------- WebGL context loss / restore
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ctxLost = true; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }, false);
canvas.addEventListener('webglcontextrestored', () => {
  // three.js re-initialises its GL state in its own (earlier-registered) listener; the PMREM environment is a
  // render target whose pixels were lost, so rebuild it, then redraw.
  ctxLost = false;
  envRT = null; // its GL objects died with the old context; don't call dispose() on them (would warn)
  buildEnvironment();
  for (const m of new Set([...skinMats, ...pipeMats, ...raptorTubes, ...raptorHousings])) m.needsUpdate = true;
  clock.getDelta(); requestRender();
}, false);

function onResize() {
  document.documentElement.style.setProperty('--ph', $('#panel').offsetHeight + 'px');
  renderer.setSize(window.innerWidth, window.innerHeight); applyViewOffset(); requestRender();
}
window.addEventListener('resize', () => { onResize(); fitCamera(false, true); });
// panel height changes (hint dismissed, Vac-bell button, orientation) -> re-fit the free viewing area
if (window.ResizeObserver) { let lastH = 0; new ResizeObserver(() => { const h = $('#panel').offsetHeight; if (h === lastH) return; lastH = h; onResize(); fitCamera(!!frames, true); }).observe($('#panel')); }

// ---------- first-load hint: lives inside the panel (so it never covers labels) and auto-dismisses
function dismissHint() { const h = $('#hint'); if (!h || h.classList.contains('hide')) return; h.classList.add('hide'); }
$('#hintClose').onclick = dismissHint;
canvas.addEventListener('pointerdown', () => setTimeout(dismissHint, 1500), { once: true });
setTimeout(dismissHint, 8000);

{ const t = IS_V3 ? 'Model: V3 (approx.) ⓘ' : 'Model: Block 2 (2025, retired) ⓘ'; $('#blockTag span').textContent = t; $('#blockTag').setAttribute('aria-label', t.replace(' ⓘ', '') + '. Tap for details'); }
applySystems(); applySkin(); applyStage(); setExplode(0); onResize(); fitCamera(false);
$('#bLabels').classList.add('on');
requestRender();

// hooks for automated testing
window.__app = { variant: SPEC.v, renderer, scene, stats: () => ({ vflow: vflow.n, rflow: rflow.n, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, frames }), state, setStage, fitCamera, pick, showInfo, hideInfo, camera, controls, frame, requestRender, dismissHint, highlightKey, clearHighlight,
  isIdle: () => rafId === 0,
  setExplode: (v) => { ex.value = v * 100; setExplode(v); fitCamera(false, true); },
  set(o) { Object.assign(state, o); applySkin(); applyRvac(); applyStage(); applySystems(); fitCamera(false, true); requestRender(); },
  orbit(az, el, zoom = 1, ty) { const d = camera.position.distanceTo(controls.target) * zoom; if (ty !== undefined) controls.target.y = ty; camera.position.copy(controls.target).add(V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d)); controls.update(); requestRender(); },
};
