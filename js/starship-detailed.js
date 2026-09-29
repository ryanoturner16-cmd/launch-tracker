// Starship / Super Heavy model for the tracker's in-page viewer. Geometry comes from the shared module
// js/starship/geometry.js (also used by the full-screen deep dive, starship.html).
// Variant: V3 (3 larger grid fins mounted lower, integrated vented hot-stage section) or Block 2
// (4 grid fins, separate jettisonable hot-staging ring). Other geometry is Block 2 in both cases.
import * as THREE from './vendor/three/three.module.js';
import { R, PI, V2, polar, ST, HEIGHT, TILE_PX, TILE_PY, makeTextures, domeGeo, tankGeo, capsuleGeo, cylBetween, engineGeos,
  boosterEngineLayout, shipEngineLayout, nose, chineShape, gridFins, hotStage, variantSpec } from './starship/geometry.js';

let TX = null, GEO = null;
const tex = () => (TX ||= makeTextures(4));
const M = (p) => new THREE.MeshStandardMaterial(p);
function steelMat(h, circ = 2 * PI * R) { const t = tex().steel.clone(); t.repeat.set(Math.max(1, Math.round(circ / 7)), h / 7.32); return M({ map: t, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide }); }
function tileMat(rx, ry) { const t = tex().tile.clone(); t.repeat.set(rx, ry); return M({ map: t, metalness: 0.05, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); }
const structMat = () => M({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.4 });
const domeMat = () => M({ color: 0xaeb4bc, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide });
const propMat = (hex) => M({ color: hex, emissive: hex, emissiveIntensity: 0.28, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, roughness: 0.25, metalness: 0 });
const LOXC = 0x2f9bff, CH4C = 0xff8a1f;
function skin(y0, y1, r = R) { const g = new THREE.CylinderGeometry(r, r, y1 - y0, 72, 1, true); g.translate(0, (y0 + y1) / 2, 0); return new THREE.Mesh(g, steelMat(y1 - y0)); }
function tiles(y0, y1, r = R * 1.006) { const L = 1.12 * PI; const g = new THREE.CylinderGeometry(r, r, y1 - y0, 48, 1, true, -L / 2, L); g.translate(0, (y0 + y1) / 2, 0); return new THREE.Mesh(g, tileMat((L * r) / TILE_PX, (y1 - y0) / TILE_PY)); }
function engines(list, rvac = false) {
  GEO ||= engineGeos();
  const bm = new THREE.InstancedMesh(rvac ? GEO.bellRV : GEO.bellSL, M({ map: tex().regen, metalness: 0.75, roughness: 0.42, side: THREE.DoubleSide }), list.length);
  const hm = new THREE.InstancedMesh(rvac ? GEO.headRV : GEO.headSL, M({ color: 0x8e949c, metalness: 0.8, roughness: 0.38 }), list.length);
  list.forEach((e, i) => { const m = new THREE.Matrix4().compose(e.p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.rot || 0), new THREE.Vector3(1, 1, 1)); bm.setMatrixAt(i, m); hm.setMatrixAt(i, m); });
  bm.computeBoundingBox?.(); hm.computeBoundingBox?.();
  return [bm, hm];
}
function flap(p0, p1, shapePts) {
  const flapMat = tileMat(1 / TILE_PX, 1 / TILE_PY), edge = M({ color: 0xa8aeb6, metalness: 0.85, roughness: 0.35 });
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(shapePts.map(([t, s]) => V2(t, s))), { depth: 0.28, bevelEnabled: false }); g.translate(0, 0, -0.14);
  const h = p1.clone().sub(p0).normalize(); const rad = new THREE.Vector3(p0.x, 0, p0.z).normalize();
  const out = rad.clone().sub(h.clone().multiplyScalar(rad.dot(h))).normalize(); const n = out.clone().cross(h);
  const m = new THREE.Mesh(g, [flapMat, edge]); m.applyMatrix4(new THREE.Matrix4().makeBasis(out, h, n).setPosition(p0));
  return [m, new THREE.Mesh(cylBetween(p0, p1, 0.32, 12), flapMat)];
}

/**
 * Build Starship into the tracker's part system. `B` is the tracker Builder; `buildPayload(B, kind, name, y0, maxR, maxH, level)` adds payload parts.
 * variant: 2 or 3. Returns { height, name, gapScale, rotateY, notes }.
 */
export function buildStarshipDetailed(B, plan, buildPayload, variant = 3, variantKnown = true) {
  const spec = variantSpec(variant), v3 = spec.v === 3, b = ST.b, s = ST.s;
  // ---------------- SUPER HEAVY
  const beng = B.part('b_eng', `Booster engine section · 33 Raptors`, `Super Heavy engine section: 33 Raptor engines burning liquid methane and liquid oxygen. The 13 inner engines (3 center + 10 inner ring) gimbal to steer${v3 ? '; on V3 all 33 Raptor 3 engines can relight (SpaceX)' : ' and relight for boostback and landing; the 20 outer engines are fixed'}.`, { level: 0, short: '33 Raptors · engine bay' });
  const bl = boosterEngineLayout();
  B.add(beng, ...engines(bl), skin(b.skirt0, b.lox0));
  { const puck = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.7, 32), structMat()); puck.position.y = 6.4; B.add(beng, puck);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.92, 0.22, 8, 60), structMat()); ring.rotation.x = PI / 2; ring.position.y = 3.55; B.add(beng, ring); }

  const blox = B.part('b_lox', 'Booster LOX tank (lower)', 'Super Heavy liquid-oxygen tank: the largest tank on the vehicle, at the BOTTOM of the booster (~2,700 t of LOX on Block 1/2, approx.; V3 carries more). The methane transfer tube runs down through its center. Chines along the outside add lift on descent and house batteries and pressure bottles.', { level: 1, short: 'LOX tank' });
  B.add(blox, skin(b.lox0, b.ch40), new THREE.Mesh(domeGeo(b.lox0, 1.8, R - 0.03, false), domeMat()), new THREE.Mesh(tankGeo(R - 0.12, b.lox0, 1.7, b.ch40, 1.9, false), propMat(LOXC)));
  for (let k = 0; k < 4; k++) {
    const az = (k * PI) / 2; const g = new THREE.ExtrudeGeometry(chineShape(), { depth: 24, bevelEnabled: false }); g.rotateX(-PI / 2);
    const m = new THREE.Mesh(g, steelMat(24, 3)); m.position.copy(polar(R - 0.08, az, 12)); m.rotation.y = az; B.add(blox, m);
  }
  const bch4 = B.part('b_ch4', 'Booster methane tank (upper)', 'Super Heavy liquid-methane tank (~700 t on Block 1/2, approx.). It sits ABOVE the LOX tank, separated by a shared common dome.', { level: 2, short: 'CH₄ tank' });
  B.add(bch4, skin(b.ch40, b.fwd0), new THREE.Mesh(domeGeo(b.ch40, 1.8, R - 0.03, false), domeMat()), new THREE.Mesh(domeGeo(b.fwd0, 1.6, R - 0.03, true), domeMat()), new THREE.Mesh(tankGeo(R - 0.12, b.ch40, 1.7, b.fwd0, 1.5, true), propMat(CH4C)));
  const frame = M({ color: 0x8b9199, metalness: 0.85, roughness: 0.4 }), lat = M({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.4, alphaMap: tex().lattice, alphaTest: 0.5, side: THREE.DoubleSide });
  const fins = gridFins(spec, frame, lat);
  const hsMats = { steel: steelMat(0.25), post: M({ color: 0xb0b6be, metalness: 0.85, roughness: 0.35 }), back: M({ color: 0x151719, roughness: 0.9, side: THREE.DoubleSide }), shield: M({ color: 0x3a3d42, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }), band: steelMat(0.35) };
  if (v3) {
    // V3: fins are lower, on the methane tank; hot-stage section is part of the booster (one exploded part).
    const bf = B.part('b_fins', 'Grid fins ×3 (V3)', 'V3 booster: three grid fins, about 50% larger than the four Block 2 fins, mounted lower on the booster. SpaceX says they are also used to lift and catch the booster with the tower arms. Exact position approximate.', { level: 2, side: [0, 0, 0], short: 'Grid fins ×3 (V3)' });
    B.add(bf, ...fins);
    const bfwd = B.part('b_fwd', 'Integrated hot-stage section (V3)', 'V3 booster top: the vented hot-staging section is built into the booster rather than being a separate ring that is jettisoned. The Ship lights its engines while still attached and the exhaust escapes through the vents; a shield protects the booster’s forward dome. Vent count/shape here is illustrative.', { level: 3, short: 'Integrated hot stage (V3)' });
    B.add(bfwd, skin(b.fwd0, b.top), hotStage(spec, hsMats));
  } else {
    const bfwd = B.part('b_fwd', 'Booster forward section & grid fins ×4', 'Block 1/2 forward section with four steel lattice grid fins that steer during boostback and descent, plus the hardpoints the tower "chopsticks" catch.', { level: 3, short: 'Grid fins ×4' });
    B.add(bfwd, skin(b.fwd0, b.top), ...fins);
    const hsr = B.part('hsr', 'Hot-staging ring (Block 2)', 'Vented hot-staging ring (Block 1/2). The ship lights its engines while still attached to the booster and the exhaust escapes through these vents; from Booster 11 on it was jettisoned after boostback.', { level: 4 });
    B.add(hsr, hotStage(spec, hsMats));
  }

  // ---------------- SHIP (Block 2 geometry)
  const saft = B.part('s_aft', 'Ship engine bay · 3 SL + 3 RVac', `Ship engine bay: three gimballed sea-level Raptors in the center and three fixed Raptor Vacuum engines with large nozzles, all enclosed by the aft skirt. The two large aft flaps mount here.${v3 ? ' (V3 ships use Raptor 3; drawn with Block 2 geometry.)' : ''}`, { level: 5, short: '3 SL + 3 RVac Raptors' });
  const { sl, rv } = shipEngineLayout();
  B.add(saft, ...engines(sl), ...engines(rv, true), skin(s.aft0, s.lox0), tiles(s.aft0, s.lox0));
  const { pts, og, L, yb } = nose();
  for (const sgn of [1, -1]) { const az = sgn * (PI / 2 - 0.18); B.add(saft, ...flap(polar(R, az, 72.3), polar(R, az, 83.2), [[0, 0], [0, 10.9], [2.2, 10.2], [3.4, 1.2], [3.2, 0]])); }
  const slox = B.part('s_lox', 'Ship LOX tank (lower)', 'Ship liquid-oxygen tank, BELOW the methane tank. The vacuum engines mount to its reinforced aft dome. Hexagonal heat-shield tiles cover the windward side; the leeward side is bare stainless steel.', { level: 6, short: 'LOX tank' });
  B.add(slox, skin(s.lox0, s.ch40), tiles(s.lox0, s.ch40), new THREE.Mesh(domeGeo(s.lox0, 1.5, R - 0.03, false), domeMat()), new THREE.Mesh(tankGeo(R - 0.12, s.lox0, 1.4, s.ch40, 1.6, false), propMat(LOXC)));
  const sch4 = B.part('s_ch4', 'Ship methane tank (upper)', 'Ship liquid-methane tank, above the LOX tank and separated from it by a common dome.', { level: 7, short: 'CH₄ tank' });
  B.add(sch4, skin(s.ch40, s.bay0), tiles(s.ch40, s.bay0), new THREE.Mesh(domeGeo(s.ch40, 1.5, R - 0.03, false), domeMat()), new THREE.Mesh(domeGeo(s.bay0, 1.5, R - 0.03, true), domeMat()), new THREE.Mesh(tankGeo(R - 0.12, s.ch40, 1.4, s.bay0, 1.4, true), propMat(CH4C)));
  const sbay = B.part('s_bay', 'Payload bay', 'Payload bay between the methane tank and the nose. On Starlink test flights satellites (or simulators) are released one at a time through a slot-shaped door (the dark band) from a PEZ-style dispenser.', { level: 8 });
  B.add(sbay, skin(s.bay0, s.nose0), tiles(s.bay0, s.nose0));
  { const door = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.008, R * 1.008, 1.3, 16, 1, true, PI - 0.4, 0.8), M({ color: 0x1a1c20, metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    door.position.y = 106.4; B.add(sbay, door); }
  const snose = B.part('s_nose', 'Nose cone · header tanks', 'Ogive nose cone. It contains the small LOX and methane header tanks that hold landing propellant, and carries the two forward flaps.', { level: 9, short: 'Nose · header tanks' });
  { const TL = 1.12 * PI;
    B.add(snose, new THREE.Mesh(new THREE.LatheGeometry(pts, 72), steelMat(L)), new THREE.Mesh(new THREE.LatheGeometry(pts.map((p) => V2(p.x * 1.006 + 0.004, p.y)), 40, -TL / 2, TL), tileMat((TL * R) / TILE_PX, L / TILE_PY)));
    B.add(snose, new THREE.Mesh(capsuleGeo(1.15, 118.9, 121.5), M({ color: 0x7cc7ff, emissive: LOXC, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.3 })), new THREE.Mesh(capsuleGeo(1.75, 115.1, 118.5), M({ color: 0xffb870, emissive: CH4C, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.3 })));
    for (const sgn of [1, -1]) { const az = sgn * (PI / 2 - 0.18), y0 = 113.0, y1 = 119.6; B.add(snose, ...flap(polar(og(L - (y0 - yb)) + 0.05, az, y0), polar(og(L - (y1 - yb)) + 0.05, az, y1), [[0, 0], [0, 6.8], [1.0, 6.8], [2.4, 1.4], [2.2, 0]])); } }

  if (plan.payload !== 'none') buildPayload(B, plan.payload, plan.payloadName, 104.4, 3.3, 7.2, 8, { side: [-(R * 2.6), 0, 0] });

  const notes = v3
    ? ['Starship V3: booster shows the 3 larger grid fins and integrated hot-stage section. Tanks, ship and overall height are drawn with Block 2 geometry (the V3 stack is ~1.5 m taller).']
    : ['Drawn as the Block 2 stack (4 grid fins, separate hot-staging ring), which was retired after Flight 11 (Oct 2025).'];
  if (!variantKnown) notes.push('The launch data does not state the Starship version; showing V3, the version flying since May 2026.');
  return { height: HEIGHT, name: v3 ? 'Starship / Super Heavy V3 (approx.)' : 'Starship / Super Heavy Block 2', gapScale: 0.035, rotateY: Math.atan2(1, 1.25) - 2.2, notes };
}
